// const { beauticianService, userService } = require('./index');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const beauticianService = require('./beautician.service')
const userService = require('./user.service')

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createSeller = async (email) => {
  const account = await stripe.accounts.create({
    type: 'standard',
    email: email,
  })
  console.log(account);
  return account;
}

const generateAccountLink = async (beauticianId) => {
  let accountId;
  const beautician = await beauticianService.getBeauticianById(beauticianId);
  // const account = await createSeller();
  if (beautician.accountId !== "") {
    accountId = beautician.accountId;
  } else {
    const account = await createSeller(beautician.email)
    beautician.accountId = account.id;
    await beautician.save();
    accountId = account.id;
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: 'http://localhost:3000/v1/payment/failed',
    return_url: 'http://localhost:3000/v1/beautician/seller/create/success',
    type: 'account_onboarding',
  })
  return link
}

const processPayment = async (appointment) => {
  console.log("appointment: ", appointment);
  if (appointment.paymentStatus === "paid") {
    throw new ApiError(httpStatus.CONFLICT, "Payment is already done for this appointment")
  }
  const cards = await stripe.customers.listSources(
    appointment.user.customerId,
    { object: 'card' }
  )
  // console.log(paymentMethod);
  // console.log(paymentMethods)
  const paymentIntent = await stripe.paymentIntents.create({
    amount: appointment.amount * 100,
    currency: 'usd',
    customer: appointment.user.customerId,
    payment_method: cards.data[1].id,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    },
    // application_fee_amount: 0,
    // on_behalf_of: accountId
    transfer_data: {
      // amount: 877,
      destination: appointment.beautician.accountId
    },// You can set a fee for your platform
  },
  );
  console.log("paymentIntent: ", paymentIntent);

  const confirmedPaymentIntent = await stripe.paymentIntents.confirm(
    paymentIntent.id
  )
  appointment.paymentStatus = "paid";
  await appointment.save();
  return confirmedPaymentIntent
}

// const createCard = async ({ card, type }) => {
//   const card = await stripe.customers.createSource(
//     ''
//   )

//   const paymentMethod = await stripe.paymentMethods.create({
//     type,
//     card
//   },)
//   console.log("card---->: ", paymentMethod)
//   return paymentMethod;
// }

const listAvailableCards = async (customerId) => {
  const cards = await stripe.customers.listSources(
    customerId,
    { object: 'card' }
  )
  return cards
}

const createCustomer = async ({ email, card }) => {
  const user = await userService.getUserByEmail(email);
  let customer;
  if (user && user.customerId) {
    customer = await stripe.customers.retrieve(user.customerId);
  } else {
    customer = await stripe.customers.create({
      email,
    })
    console.log("customer: ---> ", customer)
    user.customerId = customer.id;
    await user.save();
  }

  const { number, exp_month, exp_year, cvc } = card;
  const availableCards = await listAvailableCards(user.customerId);
  for (let c of availableCards.data) {
    if (c.last4 === number.slice(-4)) {
      throw new ApiError(httpStatus.CONFLICT, "You have already added this card")
    }
  }

  // console.log(user)
  // console.log(number);
  const cardToken = await stripe.tokens.create({
    card: {
      number,
      exp_month,
      exp_year,
      cvc,
    },
  })

  console.log("card token: ----> ", cardToken)

  const createdCard = await stripe.customers.createSource(user.customerId, { source: cardToken.id })
  console.log("created card: ", createdCard)

  return createdCard;
}

const listAllPayments = async (accountId) => {
  let paymentIntents = await stripe.transfers.list({ destination: accountId });
  paymentIntents = paymentIntents.data.map(pi => ({
    ...pi,
    amount: pi.amount / 100
  }))
  return paymentIntents;
}

const listAllBalanceTransactions = async (accountId) => {
  const balanceTransactions = await stripe.balanceTransactions.list({
    stripeAccount: accountId
  })

  let charges = balanceTransactions.data.filter(bt => bt.reporting_category === "charge")
  charges = charges.map(charge => ({
    ...charge,
    amount: charge.amount / 100
  }));
  let payouts = balanceTransactions.data.filter(bt => bt.reporting_category === "payout")
  payouts = payouts.map(payout => ({
    ...payout,
    amount: payout.amount / 100
  }));
  return {
    charges,
    payouts
  };
}

const createPayout = async (amount, bankAccountId, accountId) => {
  const payoutObj = await stripe.payouts.create({
    amount,
    currency: 'usd',
    method: 'standard',
    destination: bankAccountId
  }, {
    stripeAccount: accountId
  })

  // console.log()
  return payoutObj;
}

const listAllPayouts = async (accountId) => {
  let payouts = await stripe.payouts.list({
    stripeAccount: accountId
  })
  payouts = payouts.data.map(payout => ({
    ...payout,
    amount: payout.amount / 100,
    // totalPayout: 
  }));

  return payouts
}

const getBalance = async (accountId) => {
  const balance = await stripe.balance.retrieve({
    stripeAccount: accountId
  })
  return balance;
}

module.exports = {
  createSeller,
  generateAccountLink,
  processPayment,
  createCustomer,
  listAllPayments,
  createPayout,
  getBalance,
  listAllBalanceTransactions,
  listAvailableCards,
  listAllPayouts
}