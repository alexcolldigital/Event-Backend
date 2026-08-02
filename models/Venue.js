/**
 * Venue Model
 * Handles venue information and availability
 */

const mongoose = require('mongoose');

const venueSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, 'Venue name is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Venue description is required'],
    },

    // Ownership
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Location
    address: {
      street: String,
      city: String,
      state: {
        type: String,
        required: true,
      },
      lga: String,
      community: String,
      postalCode: String,
      latitude: Number,
      longitude: Number,
    },

    // Venue Details
    capacity: {
      min: Number,
      max: Number,
    },
    venueType: {
      type: String,
      enum: [
        'banquet_hall',
        'outdoor_space',
        'hotel',
        'restaurant',
        'garden',
        'church',
        'convention_center',
        'club',
        'private_residence',
        'event_center',
        'other',
      ],
      required: true,
    },

    // Amenities
    amenities: [
      {
        name: String,
        description: String,
        available: Boolean,
      },
    ],

    // Pricing
    rentalPrice: {
      hourly: Number,
      daily: Number,
      wholeDay: Number,
      currency: {
        type: String,
        default: 'NGN',
      },
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
    availability: [
      {
        date: Date,
        available: Boolean,
        bookedBy: mongoose.Schema.Types.ObjectId,
      },
    ],

    // Ratings & Reviews
    averageRating: {
      type: Number,
      default: 0,
      min: 1,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },

    // Rules & Restrictions
    rules: [String],
    restrictions: [String],
    maxGuests: Number,

    // Status
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Contact
    contactPhone: String,
    contactEmail: String,

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

module.exports = mongoose.model('Venue', venueSchema);
