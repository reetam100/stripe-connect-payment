const httpStatus = require("http-status");
const ApiSuccess = require("../utils/ApiSuccess");
const catchAsync = require("../utils/catchAsync");
const { paymentService, appointmentService } = require("../services");


const createSeller = catchAsync(async (req, res) => {
  // const account = await paymentService.createSeller();
  const accountLink = await paymentService.generateAccountLink(req.user._id);
  console.log(accountLink)
  return new ApiSuccess(res, httpStatus.CREATED, "Success", accountLink);
})

const processPayment = catchAsync(async (req, res) => {
  const appointment = await appointmentService.getAppointmentById(req.body.appointmentId);
  const paymentIntent = await paymentService.processPayment(appointment, req.body.accountId);
  return new ApiSuccess(res, httpStatus.CREATED, "Payment successfull", paymentIntent);
})

const createCustomer = catchAsync(async (req, res) => {
  console.log(req.body);
  const customer = await paymentService.createCustomer(req.body);
  return new ApiSuccess(res, httpStatus.CREATED, "Customer added successfully", customer)
})

const listAllPayments = catchAsync(async (req, res) => {
  const paymentIntents = await paymentService.listAllPayments(req.body.accountId);
  return new ApiSuccess(res, httpStatus.OK, "Payments listed successfully", paymentIntents);
})

const createPayout = catchAsync(async (req, res) => {
  const payoutObj = await paymentService.createPayout(req.body.amount, req.body.bankAccountId, req.body.accountId);
  return new ApiSuccess(res, httpStatus.CREATED, "Payout successfull", payoutObj);
})

const getBalance = catchAsync(async (req, res) => {
  const balance = await paymentService.getBalance(req.body.accountId);
  return new ApiSuccess(res, httpStatus.OK, 'Balance fetched successfully', balance);
})

module.exports = {
  createSeller,
  processPayment,
  createCustomer,
  listAllPayments,
  createPayout,
  getBalance
}