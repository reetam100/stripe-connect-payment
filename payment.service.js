// const { beauticianService, userService } = require('./index');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const beauticianService = require('./beautician.service')
const userService = require('./user.service')

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // use your SECRET KEY from stripe dashboard

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
    refresh_url: 'YOUR REFRESH URL',
    return_url: 'YOUR SUCCESS URL',
    type: 'account_onboarding',
  })
  return link
}

const processPayment = async (appointment, accountId) => {
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
    payment_method: cards.data[0].id,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never'
    },
    // application_fee_amount: 0,
    // on_behalf_of: accountId
    transfer_data: {
      // amount: 877,
      destination: accountId,
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

const createCustomer = async ({ type, email, accountId, card }) => {
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

  // console.log(user)
  // console.log(number);
  const { number, exp_month, exp_year, cvc } = card;
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


  const cards = await stripe.customers.listSources(
    user.customerId,
    { object: 'card' }
  )
  console.log("cards: ", cards)
  return cards.data;
}

const listAllPayments = async (accountId) => {
  const paymentIntents = await stripe.transfers.list({ destination: accountId });

  return paymentIntents;
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

  console.log()
  return payoutObj;
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
  // createCard,
  createCustomer,
  listAllPayments,
  createPayout,
  getBalance
}