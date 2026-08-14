const mongoose = require('mongoose');
const { PAYMENT_STATUS } = require('../config/constants');

const paymentSchema = new mongoose.Schema(
  {
    transactionId: { type: String, unique: true, required: true },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    amount: Number,
    currency: { type: String, default: 'NGN' },
    platformFee: Number,
    payeeAmount: Number,
    paymentMethod: {
      type: String,
      enum: ['paystack', 'flutterwave', 'bank_transfer', 'card', 'wallet'],
      required: true,
    },
    paystackReference: String,
    flutterwaveReference: String,
    bankTransferId: String,
    cardLast4: String,
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    description: String,
    refund: {
      status: { type: String, enum: ['none', 'pending', 'completed', 'failed'], default: 'none' },
      amount: Number,
      reason: String,
      requestedAt: Date,
      completedAt: Date,
      refundTransactionId: String,
    },
    metadata: {
      invoiceNumber: String,
      eventName: String,
      serviceName: String,
      paymentType: { type: String, enum: ['full', 'deposit', 'balance'], default: 'full' },
    },
  },
  { timestamps: true }
);

paymentSchema.pre('save', async function () {
  if (!this.transactionId) {
    this.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);
