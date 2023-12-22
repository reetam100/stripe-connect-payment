const httpStatus = require("http-status");
const ApiError = require("../../utils/ApiError");
const PricingPlan = require("./pricingPlan.model")
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../user/user.model');
const creatorService = require('../creator/creator.service');


// function convertToHyphenatedLowerCase(inputString) {
//   const lowerCaseSentence = inputString.toLowerCase();
//   const wordsArray = lowerCaseSentence.split(' ');
//   const hyphenatedString = wordsArray.join('-');
//   return hyphenatedString;
// }

const addPricingPlan = async (createBody) => {
  const product = await stripe.products.create({
    name: createBody.name
  })
  const price = await stripe.prices.create({
    unit_amount: createBody.price * 100,
    currency: 'usd',
    recurring: { interval: createBody.interval },
    product: product.id
  })

  const pricingPlan = await PricingPlan.create({
    name: createBody.name,
    price: createBody.price,
    priceId: price.id,
    productId: product.id,
    interval: createBody.interval,
    description: createBody.description,
    ...createBody,
  });
  return pricingPlan;
}

const getAllPricingPlans = async () => {
  const pricingPlans = await PricingPlan.find();
  return pricingPlans;
}

const subscribeToPlan = async (planId, creator) => {
  const plan = await PricingPlan.findById(planId);
  if (!plan) {
    throw new ApiError(httpStatus.NOT_FOUND, "Plan not found");
  }
  console.log(creator.subscription)
  console.log(Object.keys(creator.subscription).length)
  if (creator.subscription.subscription_id) {
    throw new ApiError(httpStatus.CONFLICT, "You are already subscribed to a plan, please change or upgrade subscription")
  }
  const subscription = await stripe.subscriptions.create({
    customer: creator.customerId,
    items: [
      { price: plan.priceId },
    ],
  });
  if (!subscription) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Subscription Error!")
  }
  console.log(subscription);

  return subscription;
}

const cancelSubscription = async (creator) => {
  if (creator.subscription.subscription_id === "") {
    throw new ApiError(httpStatus.NOT_FOUND, "You are not subscribed to any plan");
  }
  const deletedSubscription = await stripe.subscriptions.cancel(creator.subscription.subscription_id);
  await User.findOneAndUpdate({
    email: creator.email
  }, {
    $set: {
      'subscription.plan_id': "",
      'subscription.subscription_id': "",
      'subscription.invoice_url': ""
    }
  }, { new: true, useFindAndModify: false })
  return deletedSubscription;
}

const editSubscription = async (planId, creator) => {
  const newPlan = await PricingPlan.findById(planId);
  if (!newPlan) {
    throw new ApiError(httpStatus.NOT_FOUND, "This plan does not exist");
  }
  if (creator.subscriptionId == "" && !creator.currentPlan) {
    throw new ApiError(httpStatus.BAD_REQUEST, "You are not subscribed to any plans");
  }
  await cancelSubscription(creator);
  const newSubscription = await stripe.subscriptions.create({
    customer: creator.customerId,
    items: [
      { price: newPlan.priceId },
    ],
    metadata: {
      customer_id: creator.customerId,
      model: 'PricingPlan'
    }
  });
  creator.currentPlan = newPlan.id;
  creator.subscriptionId = newSubscription.id;
  await creator.save();
  return newSubscription;
}

const editPricingPlan = async (planId, updateBody) => {
  const plan = await PricingPlan.findById(planId);
  if (updateBody.price) {
    const updatedPrice = await stripe.prices.create({
      unit_amount: updateBody.price * 100,
      currency: 'usd',
      recurring: { interval: plan.interval },
      product: plan.productId
    })
    const updatedProduct = await stripe.products.update(
      plan.productId,
      {
        default_price: updatedPrice.id
      }
    )
    plan.priceId = updatedPrice.id;
    plan.price = updateBody.price;
  }
  if (updateBody.contents) {
    plan.contents = updateBody.contents;
  }
  if (updateBody.name) {
    plan.name = updateBody.name;
  }
  // plan.contents = updateBody.contents;
  await plan.save();
  return plan;

}

const getPricingPlanById = async (planId) => {
  const pricingPlan = await PricingPlan.findById(planId);
  return pricingPlan;
};


const getPricingPlanByCreatorId = async (creatorId) => {
  try {
    const creator = await creatorService.findCreatorById(creatorId);

    // Check if the creator has a currentPlan
    if (!creator.currentPlan) {
      throw new Error('Creator does not have a pricing plan');
    }

    // Populate the pricing plan details
    await creator.populate('currentPlan').execPopulate();

    return creator.currentPlan;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  addPricingPlan,
  getAllPricingPlans,
  subscribeToPlan,
  cancelSubscription,
  editSubscription,
  editPricingPlan,
  getPricingPlanById,
  getPricingPlanByCreatorId
}
