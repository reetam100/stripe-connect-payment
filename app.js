const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy, beauticianJwtStrategy, adminJwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());
app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const payloadString = request.body;
  // const payloadString = request;
  // const payloadBuffer = Buffer.from(JSON.stringify(payloadString));
  // const payloadString = request.body;
  console.log("payload (request): ", payloadString)
  console.log("11111111111111111111111111111111111111111");
  let endpointSecret = "whsec_a74da2b3b263ce7c8f5674096033a0e1876816db54c534dd45ca0c0ed6f5b817"
  const sig = request.headers['stripe-signature'];
  console.log(sig.toString());

  // const header = stripe.webhooks.generateTestHeaderString({
  //   payload: payloadString,
  //   endpointSecret,
  // });
  // const sig = "sk_test_51IcQKWDwwlfx8vZDtKSBliM7hrut2EVKMBrq4L8oV1gfy4PgtTQqrlS7SfNKO6HunhNkW4lXmULh2bEiTUjLXEOQ00Z377rtca"
  // console.log("signature: ", sig)
  // console.log("signature type: ---> ", typeof sig)
  let event;

  try {
    // event = request.body
    event = stripe.webhooks.constructEvent(payloadString, sig, endpointSecret);
  } catch (err) {
    console.log("222222222222222222222222222222222222", err);
    // response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }
  console.log("Event Type: ", event.type);

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntentSucceeded = event.data.object;
      // console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>")
      // Then define and call a function to handle the event payment_intent.succeeded
      console.log("Payment Intent success", paymentIntentSucceeded);
      // return response.json()
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  response.send({
    message: "Payment Succeeded"
  });
});

// parse json request body
app.use(express.json());
// app.use((req, res, next) => {
//   if (req.originalUrl === '/webhook') {
//     next(); // Do nothing with the body because I need it in a raw state.
//   } else {
//     express.json()(req, res, next);  // ONLY do express.json() if the received request is NOT a WebHook from Stripe.
//   }
// });


// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);
passport.use('beauticianJwt', beauticianJwtStrategy);
passport.use('adminJwt', adminJwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// v1 api routes
app.use('/v1', routes);
// app.use(express.raw({ type: '*/*' }));


// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
