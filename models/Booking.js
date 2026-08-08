/**
 * Booking Model
 * Handles service and venue bookings
 */

const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PLAN, RESCHEDULE_STATUS, REFUND_STATUS } = require('../config/constants');

const bookingSchema = new mongoose.Schema(
  {
    // Booking Details
    bookingNumber: {
      type: String,
      unique: true,
      required: true,
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
      lga: String,
      town: String,
      address: String,
    },

    // Payment Plan
    paymentPlan: {
      type: String,
      enum: Object.values(PAYMENT_PLAN),
      default: PAYMENT_PLAN.FULL,
    },
    depositPaid: { type: Boolean, default: false },
    depositAmount: Number,
    balanceDue: Number,
    balancePaid: { type: Boolean, default: false },

    // Instant Booking
    instantBooking: { type: Boolean, default: false },

    // Availability
    availabilitySlots: [{
      date: Date,
      startTime: String,
      endTime: String,
      isAvailable: { type: Boolean, default: true },
    }],

    // Reschedule
    reschedule: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      newDate: Date,
      newTime: String,
      reason: String,
      status: {
        type: String,
        enum: Object.values(RESCHEDULE_STATUS),
        default: RESCHEDULE_STATUS.PENDING,
      },
      requestedAt: Date,
      respondedAt: Date,
    },

    // Refund Request
    refundRequest: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: String,
      amount: Number,
      status: {
        type: String,
        enum: Object.values(REFUND_STATUS),
        default: REFUND_STATUS.NONE,
      },
      requestedAt: Date,
      respondedAt: Date,
      responseNote: String,
    },

    // Reminder
    reminderScheduled: { type: Boolean, default: false },
    reminderSentAt: Date,

    // Status
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },
    // Vendor acceptance deadline and escrow status
    vendorAcceptDeadline: Date,
    autoReleaseAt: Date,
    escrowStatus: {
      type: String,
      enum: ['none', 'held', 'disputed', 'released', 'refunded'],
      default: 'none',
    },
    strikes: {
      type: Number,
      default: 0,
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
        enum: ['stripe', 'paystack', 'flutterwave', 'bank_transfer', 'card', 'cash'],
      },
      transactionId: String,
      paymentDate: Date,
      refundStatus: {
        type: String,
        enum: ['none', 'pending', 'completed'],
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
        enum: ['active', 'inactive'],
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
    },

    // Timeline
    confirmedDate: Date,
    completedDate: Date,
    cancelledDate: Date,
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
    bookingRequestNote: String,
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
