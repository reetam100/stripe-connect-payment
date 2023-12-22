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
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const payload = req.body;
  const sig = req.headers['stripe-signature'];
  let endpointSecret = "whsec_a74da2b3b263ce7c8f5674096033a0e1876816db54c534dd45ca0c0ed6f5b817"

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  // console.log(event.type);

  // console.log("Event Object: ", event.data.object);
  switch (event.type) {
    case 'invoice.payment_succeeded':
      if (event.data.object.billing_reason === "subscription_create") {
        const customerEmail = event.data.object.customer_email;
        const updatedCreator = await User.findOneAndUpdate(
          { email: customerEmail },
          {
            $set: {
              'subscription.subscription_id': event.data.object.subscription,
              'subscription.plan_id': event.data.object.lines.data[0].plan.id,
              'subscription.invoice_url': event.data.object.invoice_pdf,
            },
          },
          { new: true, useFindAndModify: false });
        console.log("updated creator: ", updatedCreator);
      }
      break;

    case 'customer.subscription.deleted':
      const customerEmail = event.data.object.customer_email;
      console.log(event.data.object)
      const creator = await User.findOneAndUpdate({
        email: customerEmail
      }, {
        $set: {
          'subscription.plan_id': "",
          'subscription.subscription_id': "",
          'subscription.invoice_url': ""
        }
      }, { new: true, useFindAndModify: false })
      console.log("new creator: ----> ", creator);
      break;

    case 'payment_intent.succeeded':
      console.log("------------payment intent succeeded------------");
      console.log(event.data.object);

    case 'transfer.created':
      console.log("---------------transfer created---------------");
      console.log(event.data.object);
      // add to orders table
      console.log(typeof mongoose.Types.ObjectId(event.data.object.metadata.user_id))
      if (Object.keys(event.data.object.metadata).length !== 0) {
        const order = await Order.create({
          userId: mongoose.Types.ObjectId(event.data.object.metadata.user_id),
          transferId: event.data.object.id,
          transactionId: event.data.object.balance_transaction,
          songName: event.data.object.metadata.song_name,
          licenseType: event.data.object.metadata.license_name,
          totalPrice: event.data.object.amount / 100,
          songGenre: event.data.object.metadata.song_genre
        })

        // add to transaction table
        await Transaction.create({
          transactionId: event.data.object.balance_transaction,
          creator: mongoose.Types.ObjectId(event.data.object.metadata.creator_id),
          song: event.data.object.metadata.song_name,
          genre: event.data.object.metadata.song_genre,
          status: "successful",
          licenseType: event.data.object.metadata.license_name,
          price: event.data.object.amount / 100,
          orderId: order._id,
        })
      }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
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
