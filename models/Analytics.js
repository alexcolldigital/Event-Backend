/**
 * Analytics Model
 * Handles analytics data for admin dashboard and provider insights
 */

const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    // Tracked Entity
    entityType: {
      type: String,
      enum: ['platform', 'user', 'service', 'venue'],
      required: true,
    },
    entityId: mongoose.Schema.Types.ObjectId,

    // Time Period
    date: {
      type: Date,
      default: Date.now,
    },
    period: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      default: 'daily',
    },

    // Metrics
    metrics: {
      // User Metrics
      totalUsers: Number,
      activeUsers: Number,
      newUsers: Number,
      serviceProviders: Number,
      clients: Number,

      // Booking Metrics
      totalBookings: Number,
      pendingBookings: Number,
      confirmedBookings: Number,
      completedBookings: Number,
      cancelledBookings: Number,

      // Revenue Metrics
      totalRevenue: Number,
      platformFees: Number,
      refunds: Number,
      netRevenue: Number,

      // Engagement Metrics
      totalEvents: Number,
      totalServices: Number,
      totalVenues: Number,
      averageRating: Number,
      totalReviews: Number,

      // Search & Discovery
      searchQueries: Number,
      pageViews: Number,
      uniqueVisitors: Number,

      // Service Provider Metrics
      serviceBookings: Number,
      venueBookings: Number,
      averageBookingValue: Number,
      cancellationRate: Number,
      completionRate: Number,
    },

    // Trends
    trends: [
      {
        metric: String,
        previousValue: Number,
        currentValue: Number,
        changePercentage: Number,
        direction: {
          type: String,
          enum: ['up', 'down', 'stable'],
        },
      },
    ],

    // Geographic Data
    geography: {
      state: String,
      lga: String,
      topCommunities: [String],
    },

    // Additional Insights
    insights: [String],
    anomalies: [String],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Analytics', analyticsSchema);
