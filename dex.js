require('dotenv').config()
console.log(process.env)
/* Moralis init code */
const Moralis = require('moralis-v1');
const serverUrl = process.env.SERVER_URL; 
const appId = process.env.APP_ID;
Moralis.start({ serverUrl, appId });

// initialize buy crypto w/ fiat plugin
(async function() {
  Moralis.initPlugins()
  .then(console.log('Plugins have been initialized'));
})();

const $tokenBalanceTBody = document.querySelector('.js-token-balances');
const $selectedToken = document.querySelector('.js-from-token');
const $amountInput = document.querySelector('.js-from-amount');

/* Authentication code */
async function login() {
  let user = Moralis.User.current();
  if (!user) {
    user = await Moralis.authenticate({
      signingMessage: "Log in using Moralis",
    })
      .then(function (user) {
        console.log("logged in user:", user);
        console.log(user.get("ethAddress"));
      })
      .catch(function (error) {
        console.log(error);
      });
  }
  getStats();
}

async function swapInitForm(event) {
  event.preventDefault(); //prevent reload of page & form
  $selectedToken.textContent = event.target.dataset.symbol; //display token symbol via button click
  $selectedToken.dataset.address = event.target.dataset.address;
  $selectedToken.dataset.decimals = event.target.dataset.decimals;
  $selectedToken.dataset.max = event.target.dataset.max;
  $amountInput.removeAttribute('disabled');
  $amountInput.value = '';
  document.querySelector('.js-submit-quote').removeAttribute('disabled');
  document.querySelector('.js-cancel').removeAttribute('disabled');
  document.querySelector('.js-quote-container').innerHTML = '';
  document.querySelector('.js-amount-error').textContent = '';
  if(document.querySelector('[name=swap-button]')) document.querySelector('[name=swap-button]').remove();
}

async function getStats() {
  const balances = await Moralis.Web3API.account.getTokenBalances({ chain: 'polygon' });
  console.log(balances);
  $tokenBalanceTBody.innerHTML = balances.map((token, index) => {
    return `
    <tr> 
      <td>${index + 1}</td>
      <td>${token.symbol}</td>
      <td>${Moralis.Units.FromWei(token.balance, token.decimals)}</td>
      <td>
        <button
          class="btn btn-success js-swap"
          data-address="${token.token_address}"
          data-symbol="${token.symbol}"
          data-decimals="${token.decimals}"
          data-max="${Moralis.Units.FromWei(token.balance, token.decimals)}"
        >
          Swap
        </button>
      </td>
    </tr>
    `;
  }).join('');

  for (let $btn of $tokenBalanceTBody.querySelectorAll('.js-swap')) {
    $btn.addEventListener('click', swapInitForm);
  }
}

async function buyCrypto() {
  await Moralis.Plugins.fiat.buy();
}

async function logOut() {
  await Moralis.User.logOut();
  console.log("logged out");
  $tokenBalanceTBody.innerHTML = '';
  $selectedToken.textContent = '';
  document.querySelector('.js-submit-quote').setAttribute('disabled', '');
  document.querySelector('.js-cancel').setAttribute('disabled', '');
  $amountInput.value = '';
  $amountInput.setAttribute('disabled', '');
  if(document.querySelector('[name=swap-button]')) document.querySelector('[name=swap-button]').remove();
  document.querySelector('.js-quote-container').innerHTML = '';
}

document.querySelector(".js-btn-login").addEventListener('click', login);
document.querySelector(".js-btn-buy-crypto").addEventListener('click', buyCrypto);
document.querySelector(".js-btn-logout").addEventListener('click', logOut);

// Quote / Swap
async function formSubmitted(event) {
  event.preventDefault();
  const quoteContainer = document.querySelector('.js-quote-container');
  //reset quote and error containers for form resubmission
  quoteContainer.innerHTML = '';
  while(!quoteContainer.hasChildNodes()) {quoteContainer.innerHTML = `<p class='getQuote'>Fetching quote...</p>`;}
  document.querySelector('.js-amount-error').textContent = '';
  // remove swap button for form resubmission
  if(document.querySelector('[name=swap-button]')) document.querySelector('[name=swap-button]').remove();
  //get number from user input & max amount in user's wallet
  const fromAmount = Number.parseFloat($amountInput.value);
  const fromMaxvalue = Number.parseFloat($selectedToken.dataset.max);
  //Check for invalid input
  if (Number.isNaN(fromAmount) || fromAmount > fromMaxvalue) {
    //invalid input
    document.querySelector('.js-amount-error').textContent = 'Invalid amount';
    return;
  }
  //To-token: address & decimals
  const toToken = document.querySelector('#to-token');
  const toTokenAddress = toToken.options[toToken.selectedIndex].dataset.address;
  const toTokenDecimals = toToken.options[toToken.selectedIndex].dataset.decimals;
  //from-token: address & decimals
  const fromTokenAddress = $selectedToken.dataset.address;
  const fromTokenDecimals = $selectedToken.dataset.decimals;
  //Quote submission
  try {
    const quote = await Moralis.Plugins.oneInch.quote({
      chain: 'polygon',
      fromTokenAddress: fromTokenAddress,
      toTokenAddress: toTokenAddress,
      amount: Moralis.Units.Token(fromAmount, fromTokenDecimals).toString(),
    });
    console.log(quote);
    const toAmount = Moralis.Units.FromWei(quote.toTokenAmount, toTokenDecimals);
    document.querySelector('.js-quote-container').innerHTML = 
    `<p>${fromAmount} ${quote.fromToken.symbol} = ${toAmount} ${quote.toToken.symbol}</p>
     <p>Gas fee: ${quote.estimatedGas}</p>  
    `;
    //add swap button to quote-row div
    const buttonRow = document.querySelector('.quote-row');
    const swapButton = document.createElement('button');
    swapButton.setAttribute('name', 'swap-button');
    swapButton.innerText = 'Swap';
    swapButton.classList.add('btn', 'btn-success', 'm-1');
    buttonRow.appendChild(swapButton);
  } catch (e) { //handle error
    console.log(e);
    document.querySelector('.js-quote-container').innerHTML = 
    `<p class="error">Failed to get quote</p>`;
  }
}

async function formCanceled(event) {
  event.preventDefault();
  document.querySelector('[name=swap-button]').remove();
  document.querySelector('.js-submit-quote').setAttribute('disabled', '');
  document.querySelector('.js-cancel').setAttribute('disabled', '');
  $amountInput.value = '';
  $amountInput.setAttribute('disabled', '');
  $selectedToken.textContent = '';
  delete $selectedToken.dataset.address;
  delete $selectedToken.dataset.decimals;
  delete $selectedToken.dataset.max;
  document.querySelector('.js-quote-container').innerHTML = '';
  document.querySelector('.js-amount-error').textContent = '';
}

document.querySelector('.js-submit-quote').addEventListener('click', formSubmitted);
document.querySelector('.js-cancel').addEventListener('click', formCanceled);


async function getTopTenTokenTickers() {
  let response = await fetch('https://api.coinpaprika.com/v1/coins');
  let tokens = await response.json();
  const topTenTokenTickers = tokens
    .filter(token => token.rank >= 1 && token.rank <= 50)
    .map(token => token.symbol);
  return topTenTokenTickers;
}

async function getTickerData(tickerList) {
  let tokens = await Moralis.Plugins.oneInch.getSupportedTokens({
    chain: 'polygon', // The blockchain you want to use (eth/bsc/polygon)
  });
  const tokenList = Object.values(tokens.tokens);
  const tickerData = tokenList
    .filter(token => tickerList.includes(token.symbol));
  return tickerData;
}

async function renderTokenDropdown(tokens) {
  const options = await tokens.map(token => `
    <option data-address="${token.address}" data-decimals="${token.decimals}"> 
      ${token.name} (${token.symbol})
    </option>
    `).join('');
  document.querySelector('#to-token').innerHTML = options;
}

getTopTenTokenTickers()
  .then(getTickerData)
  .then(renderTokenDropdown);