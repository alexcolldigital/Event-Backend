/**
 * Event Model
 * Handles event data and information
 */

const mongoose = require('mongoose');
const { EVENT_TYPES, BOOKING_STATUS } = require('../config/constants');

const eventSchema = new mongoose.Schema(
  {
    // Basic Information
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Event description is required'],
    },
    eventType: {
      category: {
        type: String,
        required: true,
        enum: Object.keys(EVENT_TYPES),
      },
      subType: String,
    },

    // Event Details
    eventDate: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    eventEndDate: Date,
    eventTime: String, // Format: "HH:mm"
    eventDuration: Number, // in minutes
    expectedAttendees: Number,
    eventBudget: Number,

    // Location
    venue: {
      venueName: String,
      address: String,
      city: String,
      state: String,
      lga: String,
      community: String,
      latitude: Number,
      longitude: Number,
    },

    // Event Images
    images: [
      {
        url: String,
        publicId: String,
        isMain: Boolean,
      },
    ],

    // Creator/Organizer
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organizerName: String,
    organizerPhone: String,
    organizerEmail: String,

    // Budget & Pricing
    budget: {
      total: Number,
      allocated: {
        venue: Number,
        catering: Number,
        entertainment: Number,
        decoration: Number,
        transport: Number,
        other: Number,
      },
      currency: {
        type: String,
        default: 'NGN',
      },
    },

    // Required Services
    requiredServices: [
      {
        serviceType: String,
        quantity: Number,
        budget: Number,
        description: String,
        status: {
          type: String,
          enum: ['needed', 'booked', 'completed'],
          default: 'needed',
        },
      },
    ],

    // Bookings
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],

    // Status
    status: {
      type: String,
      enum: ['planning', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      default: 'planning',
    },

    // Notes & Special Requirements
    specialRequirements: String,
    restrictions: [String],

    // Event Visibility
    isPublic: {
      type: Boolean,
      default: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'draft'],
      default: 'draft',
    },

    // Additional Info
    tags: [String],
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        publicId: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

/**
 * Calculate budget utilization
 */
eventSchema.methods.getBudgetUtilization = function () {
  if (!this.budget.total) return 0;
  const allocated = Object.values(this.budget.allocated || {}).reduce((a, b) => a + (b || 0), 0);
  return (allocated / this.budget.total) * 100;
};

/**
 * Get pending services count
 */
eventSchema.methods.getPendingServicesCount = function () {
  return this.requiredServices.filter((s) => s.status === 'needed').length;
};

/**
 * Check if event is upcoming
 */
eventSchema.methods.isUpcoming = function () {
  return this.eventDate > new Date();
};

module.exports = mongoose.model('Event', eventSchema);
