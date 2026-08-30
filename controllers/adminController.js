/**
 * Admin Controller
 * Handles admin operations and dashboard
 */

const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Payment = require('../models/Payment');
const Analytics = require('../models/Analytics');
const PlatformSetting = require('../models/PlatformSetting');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorHandler');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');
const { buildBookingReceipt } = require('../utils/receipt');
const { sendBookingConfirmationEmail, sendBookingAcceptedEmail } = require('../utils/email');

const validateServiceCategory = async (category, subCategory) => {
  if (!category) {
    throw new Error('Category is required');
  }

  const categoryFilters = [
    { name: category, isActive: true },
    { slug: category, isActive: true },
  ];
  if (mongoose.Types.ObjectId.isValid(category)) {
    categoryFilters.push({ _id: category, isActive: true });
  }

  const categoryDoc = await Category.findOne({ $or: categoryFilters });

  if (!categoryDoc) {
    throw new Error(`Category "${category}" does not exist or is not available. Please select from available categories.`);
  }

  if (subCategory) {
    const subCategoryFilters = [
      { name: subCategory, parentCategory: categoryDoc._id, isActive: true },
      { slug: subCategory, parentCategory: categoryDoc._id, isActive: true },
    ];
    if (mongoose.Types.ObjectId.isValid(subCategory)) {
      subCategoryFilters.push({ _id: subCategory, parentCategory: categoryDoc._id, isActive: true });
    }

    const subCategoryDoc = await Category.findOne({ $or: subCategoryFilters });

    if (!subCategoryDoc) {
      throw new Error(`Subcategory "${subCategory}" is not valid for the selected category. Please select from available options.`);
    }

    return { category: categoryDoc.name, subCategory: subCategoryDoc.name };
  }

  return { category: categoryDoc.name, subCategory: '' };
};

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
 * Create a new user by admin
 * POST /api/admin/users
 */
const createUser = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    passwordConfirm,
    role,
    businessName,
    businessType,
    businessDescription,
  } = req.body;

  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    return res.status(400).json({
      success: false,
      message: 'First name, last name, email, phone number, and password are required',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long',
    });
  }

  if (password !== passwordConfirm) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
  }

  const normalizedRole = role || 'client';
  const validRoles = ['admin', 'service_provider', 'client'];

  if (!validRoles.includes(normalizedRole)) {
    return res.status(400).json({
      success: false,
      message: 'Role must be one of: admin, service_provider, client',
    });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Email already in use',
    });
  }

  const existingPhone = await User.findOne({ phoneNumber });
  if (existingPhone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number already in use',
    });
  }

  const user = new User({
    firstName,
    lastName,
    email: email.toLowerCase(),
    phoneNumber,
    password,
    role: normalizedRole,
    businessName: businessName || undefined,
    businessType: businessType || undefined,
    businessDescription: businessDescription || undefined,
    isEmailVerified: true,
    isPhoneVerified: true,
    isVerified: true,
    isActive: true,
  });

  await user.save();

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    user: user.toJSON(),
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

  let query = { isDeleted: { $ne: true } };

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
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate(
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
    provider,
    providerType,
    isActive,
    isFeatured,
    tags,
    specifications,
    cancellationPolicy,
    cancellationDetails,
    serviceType,
  } = req.body;

  if (!name || !description) {
    return res.status(400).json({
      success: false,
      message: 'Name and description are required',
    });
  }

  const normalizedServiceType = serviceType || 'Professional Service';
  let categoryData;
  try {
    categoryData = await validateServiceCategory(category, subCategory);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  // If provider is not specified, use a default admin user or require it
  const serviceProvider = (provider && provider.trim()) ? provider : req.userId;

  const service = new Service({
    name,
    description,
    shortDescription: description?.slice(0, 200),
    serviceType: normalizedServiceType,
    category: categoryData.category,
    subCategory: categoryData.subCategory,
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
  let service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  if (req.body.category || req.body.subCategory) {
    try {
      const categoryData = await validateServiceCategory(req.body.category || service.category, req.body.subCategory || '');
      req.body.category = categoryData.category;
      req.body.subCategory = categoryData.subCategory;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
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
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  const linkedBookings = await Booking.countDocuments({ service: service._id });

  if (linkedBookings > 0) {
    service.isDeleted = true;
    service.deletedAt = new Date();
    service.isActive = false;
    service.isFeatured = false;
    service.availability = {
      ...(service.availability?.toObject ? service.availability.toObject() : service.availability || {}),
      isAvailable: false,
    };
    await service.save();
  } else {
    await Service.findByIdAndDelete(req.params.id);
  }

  res.status(200).json({
    success: true,
    message: linkedBookings > 0
      ? 'Service removed from listings. Booking history was preserved.'
      : 'Service deleted successfully',
  });
});

/**
 * Toggle service featured status (admin)
 * PATCH /api/admin/services/:id/toggle-featured
 */
const toggleFeatured = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

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
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

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
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

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
 * Get single booking with full details (admin)
 * GET /api/admin/bookings/:id
 */
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('client', 'firstName lastName email phoneNumber profileImage')
    .populate('serviceProvider', 'firstName lastName businessName email phoneNumber profileImage')
    .populate('service', 'name serviceType pricing packages images description')
    .populate('venue', 'name rentalPrice location images description')
    .populate('event', 'name eventDate');

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  res.status(200).json({ success: true, booking });
});

/**
 * Admin confirm booking
 * PATCH /api/admin/bookings/:id/confirm
 * Body: { message, adminSetPrices: [{ serviceId, serviceName, price }] }
 */
const adminConfirmBooking = asyncHandler(async (req, res) => {
  const { message, adminSetPrices } = req.body;
  const booking = await Booking.findById(req.params.id).populate('service');
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status !== BOOKING_STATUS.PENDING)
    return res.status(400).json({ success: false, message: 'Can only confirm pending bookings' });

  // If admin provided prices for no-price services, recalculate totals
  if (adminSetPrices && adminSetPrices.length > 0) {
    booking.adminSetPrices = adminSetPrices;
    const feeSetting = await PlatformSetting.findOne({ key: 'feePercentage' });
    const feeRate = feeSetting ? Number(feeSetting.value) / 100 : 0.10;
    // Use admin-set price as the new base subtotal (replaces original if service was priceOnRequest or 0)
    const adminTotal = adminSetPrices.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const originalSubtotal = booking.pricing.subtotal || 0;
    const newSubtotal = originalSubtotal === 0 ? adminTotal : originalSubtotal + adminTotal;
    const serviceAndDeliveryFee = newSubtotal * feeRate;
    const newTotal = newSubtotal + serviceAndDeliveryFee;
    booking.pricing.basePrice = adminSetPrices[0]?.price || booking.pricing.basePrice;
    booking.pricing.subtotal = newSubtotal;
    booking.pricing.serviceAndDeliveryFee = serviceAndDeliveryFee;
    booking.pricing.totalAmount = newTotal;
    // Recalculate deposit/balance if split plan
    const { PAYMENT_PLAN } = require('../config/constants');
    if (booking.paymentPlan === PAYMENT_PLAN.SPLIT_50_50) {
      booking.depositAmount = Math.round(newTotal * 0.5 * 100) / 100;
      booking.balanceDue = Math.round(newTotal * 0.5 * 100) / 100;
    } else if (booking.paymentPlan === PAYMENT_PLAN.DEPOSIT_20) {
      booking.depositAmount = Math.round(newTotal * 0.2 * 100) / 100;
      booking.balanceDue = Math.round(newTotal * 0.8 * 100) / 100;
    } else {
      booking.depositAmount = newTotal;
      booking.balanceDue = 0;
    }
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.confirmedDate = new Date();
  if (message) booking.adminNote = message;
  booking.receipt = buildBookingReceipt(booking, {
    paymentType: 'booking',
    status: booking.payment?.status || PAYMENT_STATUS.PENDING,
    amountPaid: booking.depositPaid
      ? (booking.balancePaid ? booking.pricing?.totalAmount : booking.depositAmount)
      : 0,
  });
  await booking.save();

  // Notify client (non-blocking)
  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    if (client) {
      require('../utils/pushNotification').notifyBookingUpdate(client, booking);
      if (client.email) {
        const provider = await User.findById(booking.serviceProvider).select('firstName lastName businessName').catch(() => null);
        await sendBookingConfirmationEmail(client.email, {
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          totalAmount: booking.pricing?.totalAmount,
          status: booking.status,
          receipt: booking.receipt,
        });
        await sendBookingAcceptedEmail(client.email, {
          firstName: client.firstName,
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          serviceName: booking.service?.name,
          providerName: provider?.businessName || `${provider?.firstName || ''} ${provider?.lastName || ''}`.trim(),
          totalAmount: booking.pricing?.totalAmount,
          receipt: booking.receipt,
        });
      }
    }
  } catch (_) {}

  res.status(200).json({ success: true, message: 'Booking confirmed by admin', booking });
});

/**
 * Admin reject booking
 * PATCH /api/admin/bookings/:id/reject
 */
const adminRejectBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim())
    return res.status(400).json({ success: false, message: 'Rejection reason is required' });

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (booking.status !== BOOKING_STATUS.PENDING)
    return res.status(400).json({ success: false, message: 'Can only reject pending bookings' });

  booking.status = BOOKING_STATUS.REJECTED;
  booking.cancelledDate = new Date();
  booking.adminNote = reason.trim();
  await booking.save();

  // Notify client (non-blocking)
  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    if (client) require('../utils/pushNotification').notifyBookingUpdate(client, booking);
  } catch (_) {}

  res.status(200).json({ success: true, message: 'Booking rejected', booking });
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

  if (user._id.toString() === req.user._id.toString()) {
    return res.status(400).json({ success: false, message: 'Cannot change your own role' });
  }

  user.role = role;
  await user.save();

  res.status(200).json({ success: true, message: `User role updated to ${role}`, user });
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  createUser,
  blockUser,
  assignRole,
  verifyServiceProvider,
  getAllBookings,
  adminConfirmBooking,
  adminRejectBooking,
  adminCancelBooking,
  adminCompleteBooking,
  getRevenueAnalytics,
  getUserAnalytics,
  createAnalyticsRecord,
  getSystemReports,
  getBookingById,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  toggleFeatured,
  toggleActive,
  uploadServiceMedia,
};
