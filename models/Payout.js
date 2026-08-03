/**
 * Payout Model
 * Tracks attempts to pay service providers after escrow release.
 */

const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'NGN',
    },
    commission: {
      type: Number,
      default: 0,
    },
    transferReference: String,
    transferMethod: {
      type: String,
      enum: ['paystack', 'flutterwave', 'bank_transfer'],
      default: 'paystack',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    failureReason: String,
    completedAt: Date,
    metadata: {
      gateway: String,
      originalPaymentTransactionId: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payout', payoutSchema);
