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
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');

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
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  user.isBusinessVerified = true;
  user.isVerified = user.isEmailVerified || user.isPhoneVerified || user.isBusinessVerified;

  if (!user.verificationDocuments || user.verificationDocuments.length === 0) {
    user.verificationDocuments.push({
      documentType: 'business_verification',
      status: 'approved',
    });
  }

  await user.save();

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

/**
 * Get all services with filtering (admin)
 * GET /api/admin/services
 */
const getAllServices = asyncHandler(async (req, res) => {
  const { category, provider, isActive, isFeatured, page = 1, limit = 10, search } = req.query;

  let query = {};

  if (category) query.category = category;
  if (provider) query.provider = provider;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (isFeatured !== undefined) query.isFeatured = isFeatured === 'true';
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { serviceType: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const services = await Service.find(query)
    .populate('provider', 'firstName lastName businessName email')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Service.countDocuments(query);

  res.status(200).json({
    success: true,
    services,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get service by ID (admin)
 * GET /api/admin/services/:id
 */
const getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id).populate(
    'provider',
    'firstName lastName businessName email profileImage averageRating totalReviews'
  );

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  res.status(200).json({
    success: true,
    service,
  });
});

/**
 * Create new service (admin)
 * POST /api/admin/services
 */
const createService = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    shortDescription,
    serviceType,
    category,
    subCategory,
    pricing,
    availability,
    coverageArea,
    packages,
    images,
    media,
    inventory,
    quantity,
    fullDescription,
    provider,
    providerType,
    isActive,
    isFeatured,
    tags,
    specifications,
    cancellationPolicy,
    cancellationDetails,
  } = req.body;

  if (!name || !description || !serviceType) {
    return res.status(400).json({
      success: false,
      message: 'Name, description, and service type are required',
    });
  }

  // If provider is not specified, use a default admin user or require it
  const serviceProvider = provider || req.userId;

  const service = new Service({
    name,
    description: fullDescription || description,
    shortDescription: shortDescription || description?.slice(0, 200),
    serviceType,
    category,
    subCategory,
    provider: serviceProvider,
    providerType: providerType || 'events_service_provider',
    pricing: {
      basePrice: pricing?.basePrice || 0,
      unit: pricing?.unit || 'fixed',
      currency: 'NGN',
      ...pricing,
    },
    availability: {
      isAvailable: true,
      ...availability,
    },
    coverageArea: coverageArea || {},
    packages,
    images: images || (media?.coverImage ? [{ url: media.coverImage, isMain: true }] : []),
    media,
    inventory,
    quantity,
    isActive: isActive !== undefined ? isActive : true,
    isFeatured: isFeatured || false,
    tags: tags || [],
    specifications: specifications || [],
    cancellationPolicy: cancellationPolicy || 'moderate',
    cancellationDetails,
  });

  await service.save();
  await service.populate('provider', 'firstName lastName businessName');

  res.status(201).json({
    success: true,
    message: 'Service created successfully',
    service,
  });
});

/**
 * Update service (admin)
 * PUT /api/admin/services/:id
 */
const updateService = asyncHandler(async (req, res) => {
  let service = await Service.findById(req.params.id);

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  service = await Service.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    message: 'Service updated successfully',
    service,
  });
});

/**
 * Delete service (admin)
 * DELETE /api/admin/services/:id
 */
const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  await Service.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Service deleted successfully',
  });
});

/**
 * Toggle service featured status (admin)
 * PATCH /api/admin/services/:id/toggle-featured
 */
const toggleFeatured = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  service.isFeatured = !service.isFeatured;
  await service.save();

  res.status(200).json({
    success: true,
    message: `Service ${service.isFeatured ? 'featured' : 'unfeatured'} successfully`,
    service,
  });
});

/**
 * Toggle service active status (admin)
 * PATCH /api/admin/services/:id/toggle-active
 */
const toggleActive = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  service.isActive = !service.isActive;
  await service.save();

  res.status(200).json({
    success: true,
    message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully`,
    service,
  });
});

/**
 * Upload service media (admin)
 * POST /api/admin/services/:id/upload-media
 */
const uploadServiceMedia = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id);

  if (!service) {
    return res.status(404).json({ success: false, message: 'Service not found' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one image is required' });
  }

  const uploadedImages = req.files.map((file) => ({
    url: file.path,
    publicId: file.filename,
    isMain: false,
  }));

  service.images = [...(service.images || []), ...uploadedImages];
  if (!service.media) service.media = {};
  service.media.galleryImages = [...(service.media.galleryImages || []), ...uploadedImages.map((image) => image.url)];
  await service.save();

  res.status(200).json({ success: true, message: 'Media uploaded successfully', images: uploadedImages });
});

/**
 * Admin confirm booking
 * PATCH /api/admin/bookings/:id/confirm
 */
const adminConfirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status !== BOOKING_STATUS.PENDING)
    return res.status(400).json({ success: false, message: 'Can only confirm pending bookings' });

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.confirmedDate = new Date();
  await booking.save();

  res.status(200).json({ success: true, message: 'Booking confirmed by admin', booking });
});

/**
 * Admin cancel booking
 * PATCH /api/admin/bookings/:id/cancel
 */
const adminCancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status === BOOKING_STATUS.CANCELLED)
    return res.status(400).json({ success: false, message: 'Booking is already cancelled' });

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledDate = new Date();
  booking.cancellationReason = reason || 'Cancelled by admin';
  if (booking.payment?.status === PAYMENT_STATUS.COMPLETED) {
    booking.payment.refundStatus = 'pending';
  }
  await booking.save();

  res.status(200).json({ success: true, message: 'Booking cancelled by admin', booking });
});

/**
 * Admin complete booking
 * PATCH /api/admin/bookings/:id/complete
 */
const adminCompleteBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status !== BOOKING_STATUS.CONFIRMED)
    return res.status(400).json({ success: false, message: 'Can only complete confirmed bookings' });

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.completedDate = new Date();
  if (booking.payment?.status === PAYMENT_STATUS.COMPLETED && booking.escrow?.enabled) {
    booking.escrow.releaseStatus = 'released';
    booking.escrow.releaseDate = new Date();
  }
  await booking.save();

  res.status(200).json({ success: true, message: 'Booking completed by admin', booking });
});

/**
 * Assign role to user
 * PATCH /api/admin/users/:id/role
 */
const assignRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const validRoles = ['admin', 'service_provider', 'client'];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `Role must be one of: ${validRoles.join(', ')}` });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (user._id.toString() === req.userId) {
    return res.status(400).json({ success: false, message: 'Cannot change your own role' });
  }

  user.role = role;
  await user.save();

  res.status(200).json({ success: true, message: `User role updated to ${role}`, user });
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  blockUser,
  assignRole,
  verifyServiceProvider,
  getAllBookings,
  adminConfirmBooking,
  adminCancelBooking,
  adminCompleteBooking,
  getRevenueAnalytics,
  getUserAnalytics,
  createAnalyticsRecord,
  getSystemReports,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  toggleFeatured,
  toggleActive,
  uploadServiceMedia,
};
