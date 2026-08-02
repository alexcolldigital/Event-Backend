/**
 * Admin Controller
 * Handles admin operations and dashboard
 */

const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Payment = require('../models/Payment');
const Analytics = require('../models/Analytics');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Total users
  const totalUsers = await User.countDocuments();
  const totalServiceProviders = await User.countDocuments({ role: 'service_provider' });
  const totalClients = await User.countDocuments({ role: 'client' });

  // Total bookings
  const totalBookings = await Booking.countDocuments();
  const completedBookings = await Booking.countDocuments({ status: 'completed' });
  const pendingBookings = await Booking.countDocuments({ status: 'pending' });

  // Revenue
  const revenue = await Payment.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$payeeAmount' } } },
  ]);

  const totalRevenue = revenue[0]?.total || 0;
  const platformFees = await Payment.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$platformFee' } } },
  ]);

  // Today's stats
  const bookingsToday = await Booking.countDocuments({
    createdAt: { $gte: today },
  });

  const revenueToday = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: today },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.status(200).json({
    success: true,
    stats: {
      users: {
        total: totalUsers,
        serviceProviders: totalServiceProviders,
        clients: totalClients,
      },
      bookings: {
        total: totalBookings,
        completed: completedBookings,
        pending: pendingBookings,
      },
      revenue: {
        total: totalRevenue,
        platformFees: platformFees[0]?.total || 0,
      },
      today: {
        bookings: bookingsToday,
        revenue: revenueToday[0]?.total || 0,
      },
    },
  });
});

/**
 * Get all users with filtering
 * GET /api/admin/users
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const { role, isVerified, page = 1, limit = 10, search } = req.query;

  let query = {};
  if (role) query.role = role;
  if (isVerified !== undefined) query.isEmailVerified = isVerified === 'true';
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { businessName: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const users = await User.find(query)
    .select('-password')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    users,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Block/Unblock user
 * PATCH /api/admin/users/:id/block
 */
const blockUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.isBlocked = !user.isBlocked;
  if (user.isBlocked) {
    user.blockReason = reason;
  } else {
    user.blockReason = null;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: user.isBlocked ? 'User blocked successfully' : 'User unblocked successfully',
    user,
  });
});

/**
 * Verify service provider
 * PATCH /api/admin/users/:id/verify
 */
const verifyServiceProvider = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isBusinessVerified: true },
    { new: true }
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  res.status(200).json({
    success: true,
    message: 'User verified successfully',
    user,
  });
});

/**
 * Get all bookings with filtering
 * GET /api/admin/bookings
 */
const getAllBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  let query = {};
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(query)
    .populate('client', 'firstName lastName email')
    .populate('serviceProvider', 'firstName lastName businessName')
    .populate('service', 'name serviceType pricing')
    .populate('venue', 'name rentalPrice')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Booking.countDocuments(query);

  res.status(200).json({
    success: true,
    bookings,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get revenue analytics
 * GET /api/admin/revenue
 */
const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = 'monthly' } = req.query;

  let groupBy;
  switch (period) {
    case 'daily':
      groupBy = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
      break;
    case 'weekly':
      groupBy = {
        $dateToString: {
          format: '%Y-W%V',
          date: '$createdAt',
        },
      };
      break;
    case 'monthly':
      groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
      break;
    case 'yearly':
      groupBy = { $dateToString: { format: '%Y', date: '$createdAt' } };
      break;
    default:
      groupBy = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
  }

  const revenues = await Payment.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: groupBy,
        totalRevenue: { $sum: '$amount' },
        platformFees: { $sum: '$platformFee' },
        transactionCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    success: true,
    revenues,
  });
});

/**
 * Get user analytics by role
 * GET /api/admin/users/analytics/breakdown
 */
const getUserAnalytics = asyncHandler(async (req, res) => {
  const roleBreakdown = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
      },
    },
  ]);

  const verifiedVsUnverified = await User.aggregate([
    {
      $group: {
        _id: '$isEmailVerified',
        count: { $sum: 1 },
      },
    },
  ]);

  res.status(200).json({
    success: true,
    analytics: {
      byRole: roleBreakdown,
      byVerification: verifiedVsUnverified,
    },
  });
});

/**
 * Create analytics record
 * POST /api/admin/analytics
 */
const createAnalyticsRecord = asyncHandler(async (req, res) => {
  const analytics = new Analytics(req.body);
  await analytics.save();

  res.status(201).json({
    success: true,
    message: 'Analytics record created',
    analytics,
  });
});

/**
 * Get system logs or reports
 * GET /api/admin/reports
 */
const getSystemReports = asyncHandler(async (req, res) => {
  const topServices = await Service.find({ isActive: true })
    .select('name averageRating totalBookings')
    .sort({ totalBookings: -1 })
    .limit(10);

  const topProviders = await User.find({ role: 'service_provider' })
    .select('firstName lastName businessName averageRating totalBookings')
    .sort({ totalBookings: -1 })
    .limit(10);

  res.status(200).json({
    success: true,
    reports: {
      topServices,
      topProviders,
    },
  });
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  blockUser,
  verifyServiceProvider,
  getAllBookings,
  getRevenueAnalytics,
  getUserAnalytics,
  createAnalyticsRecord,
  getSystemReports,
};
