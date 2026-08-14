/**
 * Service Model
 * Handles service/product offerings from service providers
 */

const mongoose = require('mongoose');
const { SERVICE_PROVIDER_TYPES } = require('../config/constants');

const serviceSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
    },
    shortDescription: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    // Service Provider
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    providerType: {
      type: String,
      enum: SERVICE_PROVIDER_TYPES,
      required: true,
    },

    // Service Details
    serviceType: {
      type: String,
      required: true,
    },
    category: String,
    subCategory: String,

    // Pricing
    priceOnRequest: {
      type: Boolean,
      default: false,
    },
    pricing: {
      basePrice: Number,
      pricePerUnit: Number,
      type: {
        type: String,
        enum: ['Fixed Price', 'Hourly', 'Daily', 'Weekly', 'Monthly', 'Per Guest', 'Per Item', 'Negotiable'],
      },
      unit: {
        type: String,
        enum: ['hourly', 'daily', 'weekly', 'monthly', 'per_person', 'per_item', 'fixed', 'negotiable', 'booking'],
        default: 'fixed',
      },
      minPrice: Number,
      maxPrice: Number,
      minBookingAmount: Number,
      discount: Number,
      securityDeposit: Number,
      currency: {
        type: String,
        default: 'NGN',
      },
    },

    // Images and Media
    media: {
      coverImage: String,
      galleryImages: [String],
      videoLink: String,
    },
    quantity: Number,
    inventory: {
      enabled: {
        type: Boolean,
        default: false,
      },
      availableStock: Number,
      reservedStock: Number,
      damagedStock: Number,
    },

    // Images
    images: [
      {
        url: String,
        publicId: String,
        isMain: Boolean,
      },
    ],

    // Availability
    availability: {
      isAvailable: {
        type: Boolean,
        default: true,
      },
      status: {
        type: String,
        enum: ['Available', 'Busy', 'Temporarily unavailable'],
        default: 'Available',
      },
      duration: String,
      leadTime: Number, // in days
      advanceBooking: Number, // in days
      maxBookingsPerMonth: Number,
      workingDays: [String],
      startTime: String,
      endTime: String,
      recurringAvailability: {
        type: Boolean,
        default: true,
      },
      availableDates: [String],
      unavailableDates: [String],
    },

    // Location Coverage
    coverageArea: {
      country: String,
      state: String,
      city: String,
      lga: String,
      address: String,
      radiusCovered: String,
      states: [String],
      lgas: [String],
      communities: [String],
      nationwide: Boolean,
    },

    // Ratings & Reviews
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    completedBookings: {
      type: Number,
      default: 0,
    },

    // Service Specifications
    specifications: [
      {
        key: String,
        value: String,
      },
    ],

    // Package Options
    packages: [
      {
        packageName: String,
        description: String,
        price: Number,
        includes: [String],
        duration: Number, // in hours/days
      },
    ],

    // Cancellation Policy
    cancellationPolicy: {
      type: String,
      enum: ['flexible', 'moderate', 'strict'],
      default: 'moderate',
    },
    cancellationDetails: String,

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },

    // Tags for search
    tags: [String],

    // Bookings
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],
  },
  {
    timestamps: true,
  }
);

/**
 * Calculate completion rate
 */
serviceSchema.methods.getCompletionRate = function () {
  if (this.totalBookings === 0) return 0;
  return (this.completedBookings / this.totalBookings) * 100;
};

module.exports = mongoose.model('Service', serviceSchema);
