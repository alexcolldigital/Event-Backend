/**
 * Review Model
 * Handles ratings and reviews for services and service providers
 */

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    // Review Details
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      required: true,
    },

    // Reviewer
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Reviewed Entity
    reviewedType: {
      type: String,
      enum: ['service', 'service_provider', 'venue', 'event'],
      required: true,
    },
    reviewedEntity: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'reviewedType',
      required: true,
    },

    // Related Booking
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
    },

    // Review Categories
    categories: {
      quality: Number,
      professionalism: Number,
      communication: Number,
      valueForMoney: Number,
      punctuality: Number,
    },

    // Evidence
    images: [
      {
        url: String,
        publicId: String,
      },
    ],

    // Moderation
    isVerified: {
      type: Boolean,
      default: false,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
    flagReason: String,

    // Engagement
    helpfulCount: {
      type: Number,
      default: 0,
    },
    unhelpfulCount: {
      type: Number,
      default: 0,
    },

    // Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    moderatorComment: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Review', reviewSchema);
