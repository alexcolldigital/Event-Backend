/**
 * Booking Model
 * Handles service and venue bookings
 */

const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');

const bookingSchema = new mongoose.Schema(
  {
    // Booking Details
    bookingNumber: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        return `EC-${Date.now()}-${suffix}`;
      },
    },

    // Involved Parties
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    serviceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Service/Venue Information
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
    },
    venue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Venue',
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
    },

    // Booking Details
    bookingType: {
      type: String,
      enum: ['service', 'venue'],
      required: true,
    },
    eventDate: {
      type: Date,
      required: true,
    },
    eventEndDate: Date,
    eventTime: String,

    // Duration
    duration: Number, // in hours/days
    durationUnit: {
      type: String,
      enum: ['hours', 'days', 'fixed'],
      default: 'hours',
    },

    // Pricing
    pricing: {
      basePrice: Number,
      quantity: Number,
      unitPrice: Number,
      subtotal: Number,
      tax: Number,
      discount: Number,
      totalAmount: Number,
      currency: {
        type: String,
        default: 'NGN',
      },
    },

    // Guest Information
    numberOfGuests: Number,
    specialRequirements: String,
    clientNotes: String,
    providerNotes: String,
    bookingLocation: {
      country: String,
      state: String,
      city: String,
      lga: String,
      address: String,
    },

    // Status
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },
    bookingDate: {
      type: Date,
      default: Date.now,
    },

    // Payment
    payment: {
      status: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
      },
      method: {
        type: String,
        enum: ['stripe', 'bank_transfer', 'card', 'cash', 'paystack', 'flutterwave'],
      },
      transactionId: String,
      paymentDate: Date,
      refundStatus: {
        type: String,
        enum: ['none', 'pending', 'completed', 'failed'],
        default: 'none',
      },
      refundAmount: Number,
    },

    escrow: {
      enabled: {
        type: Boolean,
        default: false,
      },
      releaseTime: {
        type: String,
        enum: ['immediate', 'after_customer_confirmation', '24_hours', '48_hours', 'custom'],
        default: 'after_customer_confirmation',
      },
      releaseHours: {
        type: Number,
        default: 24,
      },
      disputePolicy: {
        type: String,
        enum: ['standard', 'mediation', 'marketplace'],
        default: 'standard',
      },
      status: {
        type: String,
        enum: ['active', 'inactive', 'held', 'disputed'],
        default: 'inactive',
      },
      releaseStatus: {
        type: String,
        enum: ['pending', 'held', 'released', 'disputed'],
        default: 'pending',
      },
      holdAmount: Number,
      holdDate: Date,
      refundPolicy: String,
      vendorAcceptDeadline: Date,
      autoReleaseAt: Date,
      disputeRaisedAt: Date,
      disputeReason: String,
      disputedBy: String,
      disputeEvidence: [String],
      disputeOutcome: {
        type: String,
        enum: ['refund_customer', 'pay_vendor', 'split', 'none'],
        default: 'none',
      },
      payoutStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
      },
      payoutAmount: Number,
      payoutCurrency: {
        type: String,
        default: 'NGN',
      },
      payoutReference: String,
      payoutDate: Date,
      releaseReason: String,
      clearedChat: {
        type: Boolean,
        default: false,
      },
    },

    // Timeline
    confirmedDate: Date,
    completedDate: Date,
    cancelledDate: Date,
    vendorAcceptDeadline: Date,
    autoReleaseAt: Date,
    cancellationReason: String,

    // Ratings & Reviews
    rating: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      review: String,
      ratedBy: mongoose.Schema.Types.ObjectId,
      ratedAt: Date,
    },

    // Metadata
    reminderSent: Boolean,
    reminderSentDate: Date,
  },
  {
    timestamps: true,
  }
);


/**
 * Get booking details summary
 */
bookingSchema.methods.getBookingSummary = function () {
  return {
    bookingNumber: this.bookingNumber,
    status: this.status,
    totalAmount: this.pricing.totalAmount,
    eventDate: this.eventDate,
    paymentStatus: this.payment.status,
  };
};

module.exports = mongoose.model('Booking', bookingSchema);
