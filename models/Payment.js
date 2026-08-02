/**
 * Payment Model
 * Handles payment transactions
 */

const mongoose = require('mongoose');
const { PAYMENT_STATUS } = require('../config/constants');

const paymentSchema = new mongoose.Schema(
  {
    // Payment Information
    transactionId: {
      type: String,
      unique: true,
      required: true,
    },

    // Involved Parties
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    payee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Related Booking
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },

    // Amount
    amount: Number,
    currency: {
      type: String,
      default: 'NGN',
    },
    platformFee: Number,
    payeeAmount: Number, // Amount after deducting platform fee

    // Payment Method
    paymentMethod: {
      type: String,
      enum: ['stripe', 'bank_transfer', 'card', 'wallet'],
      required: true,
    },

    // Payment Gateway Details
    stripePaymentIntentId: String,
    bankTransferId: String,
    cardLast4: String,

    // Status
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },

    // Description
    description: String,

    // Refund Information
    refund: {
      status: {
        type: String,
        enum: ['none', 'pending', 'completed', 'failed'],
        default: 'none',
      },
      amount: Number,
      reason: String,
      requestedAt: Date,
      completedAt: Date,
      refundTransactionId: String,
    },

    // Metadata
    metadata: {
      invoiceNumber: String,
      eventName: String,
      serviceName: String,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Generate transaction ID
 */
paymentSchema.pre('save', async function (next) {
  if (!this.transactionId) {
    this.transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
