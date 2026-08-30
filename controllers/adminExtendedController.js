/**
 * Extended Admin Controller
 * Commission, Refunds, Content Moderation, Reports, Categories,
 * Coupons, Promotions, Analytics, Notifications, CMS, Audit Logs
 */

const User = require('../models/User');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Payment = require('../models/Payment');
const Review = require('../models/Review');
const Category = require('../models/Category');
const Coupon = require('../models/Coupon');
const Promotion = require('../models/Promotion');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const CMSPage = require('../models/CMSPage');
const PlatformSetting = require('../models/PlatformSetting');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendPromotionalEmail } = require('../utils/email');
const { SUPPORT_CONTACT_KEY, DEFAULT_SUPPORT_CONTACT, getSupportContactValue } = require('./supportController');

// ─── AUDIT LOG HELPER ────────────────────────────────────────────────────────
const logAudit = async (req, action, resource, resourceId, details, status = 'success') => {
  try {
    await AuditLog.create({
      actor: req.userId,
      actorRole: req.userRole || 'admin',
      action,
      resource,
      resourceId,
      details,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status,
    });
  } catch (_) {}
};

// ─── COMMISSION MANAGEMENT ───────────────────────────────────────────────────

const FEE_KEYS = ['commissionRate', 'minCommission', 'maxCommission', 'payoutSchedule', 'feePercentage'];

const getCommissionSettings = asyncHandler(async (req, res) => {
  const rows = await PlatformSetting.find({ key: { $in: FEE_KEYS } });
  const commission = rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {
    feePercentage: 10,
  });
  res.json({ success: true, commission });
});

const updateCommissionSettings = asyncHandler(async (req, res) => {
  const { commissionRate, minCommission, maxCommission, payoutSchedule, feePercentage } = req.body;
  const updates = { commissionRate, minCommission, maxCommission, payoutSchedule, feePercentage };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const numVal = ['feePercentage', 'commissionRate', 'minCommission', 'maxCommission'].includes(key)
        ? Number(value)
        : value;
      if (key === 'feePercentage' && (isNaN(numVal) || numVal < 0 || numVal > 100)) {
        return res.status(400).json({ success: false, message: 'feePercentage must be a number between 0 and 100' });
      }
      await PlatformSetting.findOneAndUpdate({ key }, { key, value: numVal }, { upsert: true, new: true });
    }
  }
  const rows = await PlatformSetting.find({ key: { $in: FEE_KEYS } });
  const commission = rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {
    feePercentage: 10,
  });
  await logAudit(req, 'UPDATE_COMMISSION', 'PlatformSetting', null, req.body);
  res.json({ success: true, message: 'Commission settings updated', commission });
});

const getSupportContactSettings = asyncHandler(async (req, res) => {
  const supportContact = await getSupportContactValue();
  res.json({ success: true, supportContact });
});

const updateSupportContactSettings = asyncHandler(async (req, res) => {
  const phoneNumber = String(req.body.phoneNumber || '').trim();
  const whatsappUrl = String(req.body.whatsappUrl || '').trim();

  if (whatsappUrl && !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(whatsappUrl)) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp link must start with https://wa.me/ or https://api.whatsapp.com/',
    });
  }

  const supportContact = {
    ...DEFAULT_SUPPORT_CONTACT,
    phoneNumber,
    whatsappUrl,
  };

  await PlatformSetting.findOneAndUpdate(
    { key: SUPPORT_CONTACT_KEY },
    { key: SUPPORT_CONTACT_KEY, value: supportContact, description: 'Public support phone number and WhatsApp link' },
    { upsert: true, new: true }
  );
  await logAudit(req, 'UPDATE_SUPPORT_CONTACT', 'PlatformSetting', null, supportContact);
  res.json({ success: true, message: 'Support contact updated', supportContact });
});

const getCommissionBreakdown = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const match = { status: 'completed' };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  const breakdown = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalPlatformFees: { $sum: '$platformFee' },
        totalPayouts: { $sum: '$payeeAmount' },
        count: { $sum: 1 },
      },
    },
  ]);
  res.json({ success: true, breakdown: breakdown[0] || {} });
});

// ─── PAYMENT MONITORING ──────────────────────────────────────────────────────

const getAllPayments = asyncHandler(async (req, res) => {
  const { status, method, page = 1, limit = 20, startDate, endDate } = req.query;
  const query = {};
  if (status) query.status = status;
  if (method) query.paymentMethod = method;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  const skip = (page - 1) * limit;
  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('payer', 'firstName lastName email')
      .populate('payee', 'firstName lastName businessName')
      .populate('booking', 'bookingNumber status pricing paymentPlan depositPaid depositAmount balancePaid balanceDue balanceDeadline payment')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Payment.countDocuments(query),
  ]);
  res.json({ success: true, payments, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

// ─── REFUND MANAGEMENT ───────────────────────────────────────────────────────

const getPendingRefunds = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;
  const query = { 'refund.status': 'pending' };
  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('payer', 'firstName lastName email')
      .populate('booking', 'bookingNumber status eventDate')
      .sort({ 'refund.requestedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Payment.countDocuments(query),
  ]);
  res.json({ success: true, refunds: payments, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const approveRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const payment = await Payment.findById(id);
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  if (payment.refund?.status !== 'pending') return res.status(400).json({ success: false, message: 'No pending refund' });
  payment.refund.status = 'completed';
  payment.refund.completedAt = new Date();
  payment.refund.refundTransactionId = `REF-${Date.now()}`;
  payment.status = 'refunded';
  if (notes) payment.refund.reason = notes;
  await payment.save();
  await logAudit(req, 'APPROVE_REFUND', 'Payment', payment._id, { notes });
  res.json({ success: true, message: 'Refund approved', payment });
});

const rejectRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const payment = await Payment.findById(id);
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  payment.refund.status = 'failed';
  payment.refund.reason = reason || 'Rejected by admin';
  await payment.save();
  await logAudit(req, 'REJECT_REFUND', 'Payment', payment._id, { reason });
  res.json({ success: true, message: 'Refund rejected', payment });
});

// ─── CONTENT MODERATION ──────────────────────────────────────────────────────

const getFlaggedReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;
  const query = { status: 'pending' };
  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate('reviewer', 'firstName lastName email')
      .populate('reviewedEntity')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments(query),
  ]);
  // Normalize for frontend: attach service field from reviewedEntity
  const normalized = reviews.map(r => ({ ...r.toObject(), service: r.reviewedEntity, comment: r.review }));
  res.json({ success: true, reviews: normalized, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const moderateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // action: 'approve' | 'remove'
  const review = await Review.findById(id);
  if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
  if (action === 'remove') {
    review.status = 'rejected';
    review.isVisible = false;
    review.moderatorComment = reason;
  } else {
    review.status = 'approved';
    review.isVisible = true;
  }
  await review.save();
  await logAudit(req, `MODERATE_REVIEW_${action.toUpperCase()}`, 'Review', review._id, { reason });
  res.json({ success: true, message: `Review ${action}d`, review });
});

const getFlaggedServices = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;
  const query = { isFlagged: true };
  const [services, total] = await Promise.all([
    Service.find(query)
      .populate('provider', 'firstName lastName businessName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Service.countDocuments(query),
  ]);
  res.json({ success: true, services, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const moderateService = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // action: 'approve' | 'suspend'
  const service = await Service.findById(id);
  if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
  service.isActive = action === 'approve';
  service.isFlagged = false;
  if (reason) service.moderationNote = reason;
  await service.save();
  await logAudit(req, `MODERATE_SERVICE_${action.toUpperCase()}`, 'Service', service._id, { reason });
  res.json({ success: true, message: `Service ${action}d`, service });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────

const getDetailedReports = asyncHandler(async (req, res) => {
  const { type = 'overview', startDate, endDate } = req.query;
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);
  const createdAtFilter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

  if (type === 'bookings') {
    const data = await Booking.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$pricing.totalAmount' } } },
    ]);
    return res.json({ success: true, report: { type, data } });
  }

  if (type === 'users') {
    const data = await User.aggregate([
      { $match: createdAtFilter },
      { $group: { _id: { role: '$role', month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } } }, count: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]);
    return res.json({ success: true, report: { type, data } });
  }

  // overview
  const [totalUsers, totalBookings, totalRevenue, topServices, topProviders] = await Promise.all([
    User.countDocuments(),
    Booking.countDocuments(),
    Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Service.find({ isActive: true }).select('name averageRating totalBookings').sort({ totalBookings: -1 }).limit(10),
    User.find({ role: 'service_provider' }).select('firstName lastName businessName averageRating totalBookings').sort({ totalBookings: -1 }).limit(10),
  ]);

  res.json({
    success: true,
    report: {
      type,
      summary: { totalUsers, totalBookings, totalRevenue: totalRevenue[0]?.total || 0 },
      topServices,
      topProviders,
    },
  });
});

// ─── CATEGORY MANAGEMENT ─────────────────────────────────────────────────────

const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
  res.json({ success: true, categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, parentCategory, sortOrder } = req.body;
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const category = await Category.create({ name, slug, description, icon, parentCategory, sortOrder });
  await logAudit(req, 'CREATE_CATEGORY', 'Category', category._id, { name });
  res.status(201).json({ success: true, message: 'Category created', category });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
  await logAudit(req, 'UPDATE_CATEGORY', 'Category', category._id, req.body);
  res.json({ success: true, message: 'Category updated', category });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
  await logAudit(req, 'DELETE_CATEGORY', 'Category', req.params.id, {});
  res.json({ success: true, message: 'Category deleted' });
});

// ─── COUPON MANAGEMENT ───────────────────────────────────────────────────────

const getCoupons = asyncHandler(async (req, res) => {
  const { isActive, page = 1, limit = 20 } = req.query;
  const query = {};
  if (isActive !== undefined) query.isActive = isActive === 'true';
  const skip = (page - 1) * limit;
  const [coupons, total] = await Promise.all([
    Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Coupon.countDocuments(query),
  ]);
  res.json({ success: true, coupons, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create({ ...req.body, createdBy: req.userId });
  await logAudit(req, 'CREATE_COUPON', 'Coupon', coupon._id, { code: coupon.code });
  res.status(201).json({ success: true, message: 'Coupon created', coupon });
});

const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
  await logAudit(req, 'UPDATE_COUPON', 'Coupon', coupon._id, req.body);
  res.json({ success: true, message: 'Coupon updated', coupon });
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
  await logAudit(req, 'DELETE_COUPON', 'Coupon', req.params.id, {});
  res.json({ success: true, message: 'Coupon deleted' });
});

const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
  coupon.isActive = !coupon.isActive;
  await coupon.save();
  res.json({ success: true, message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`, coupon });
});

// ─── PROMOTIONS ──────────────────────────────────────────────────────────────

const getPromotions = asyncHandler(async (req, res) => {
  const { isActive, page = 1, limit = 20 } = req.query;
  const query = {};
  if (isActive !== undefined) query.isActive = isActive === 'true';
  const skip = (page - 1) * limit;
  const [promotions, total] = await Promise.all([
    Promotion.find(query).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Promotion.countDocuments(query),
  ]);
  res.json({ success: true, promotions, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const createPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.create({ ...req.body, createdBy: req.userId });
  await logAudit(req, 'CREATE_PROMOTION', 'Promotion', promotion._id, { title: promotion.title });
  res.status(201).json({ success: true, message: 'Promotion created', promotion });
});

const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
  await logAudit(req, 'UPDATE_PROMOTION', 'Promotion', promotion._id, req.body);
  res.json({ success: true, message: 'Promotion updated', promotion });
});

const deletePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findByIdAndDelete(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
  await logAudit(req, 'DELETE_PROMOTION', 'Promotion', req.params.id, {});
  res.json({ success: true, message: 'Promotion deleted' });
});

const togglePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
  promotion.isActive = !promotion.isActive;
  await promotion.save();
  res.json({ success: true, message: `Promotion ${promotion.isActive ? 'activated' : 'deactivated'}`, promotion });
});

// ─── ANALYTICS DASHBOARD ─────────────────────────────────────────────────────

const getAnalyticsDashboard = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;
  const days = period === '7d' ? 7 : period === '90d' ? 90 : period === '1y' ? 365 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    newUsers,
    newBookings,
    revenueData,
    bookingsByStatus,
    usersByRole,
    dailyRevenue,
  ] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: since } }),
    Booking.countDocuments({ createdAt: { $gte: since } }),
    Payment.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$amount' }, fees: { $sum: '$platformFee' } } },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({
    success: true,
    analytics: {
      period,
      newUsers,
      newBookings,
      revenue: revenueData[0]?.total || 0,
      platformFees: revenueData[0]?.fees || 0,
      bookingsByStatus,
      usersByRole,
      dailyRevenue,
    },
  });
});

// ─── NOTIFICATION MANAGEMENT ─────────────────────────────────────────────────

const getNotifications = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [notifications, total] = await Promise.all([
    Notification.find(query).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Notification.countDocuments(query),
  ]);
  res.json({ success: true, notifications, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

const createNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({ ...req.body, createdBy: req.userId });
  await logAudit(req, 'CREATE_NOTIFICATION', 'Notification', notification._id, { title: notification.title });
  res.status(201).json({ success: true, message: 'Notification created', notification });
});

const sendNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  notification.status = 'sent';
  notification.sentAt = new Date();
  await notification.save();

  // Send push to targeted users or all users with fcmToken
  try {
    const push = require('../utils/pushNotification');
    const inApp = require('../utils/inAppNotification');
    let users = [];
    if (notification.type === 'targeted' && notification.targetUsers?.length) {
      users = await User.find({ _id: { $in: notification.targetUsers }, fcmToken: { $ne: null }, 'preferences.notifications': { $ne: false } });
    } else if (notification.type === 'role_based' && notification.targetRole && notification.targetRole !== 'all') {
      users = await User.find({ role: notification.targetRole, fcmToken: { $ne: null }, 'preferences.notifications': { $ne: false } });
    } else {
      users = await User.find({ fcmToken: { $ne: null }, 'preferences.notifications': { $ne: false } });
    }
    await Promise.allSettled(
      users.map((u) => push.notifyPromotion(u, notification.title, notification.message))
    );
    // Send promotional email to all targeted users
    await Promise.allSettled(
      users.map((u) =>
        u.email ? sendPromotionalEmail(u.email, { firstName: u.firstName, title: notification.title, message: notification.message, ctaUrl: notification.ctaUrl, ctaLabel: notification.ctaLabel }) : Promise.resolve()
      )
    );
    // Also create in-app records for targeted/role_based; broadcast is visible via query
    if (notification.type === 'targeted' && notification.targetUsers?.length) {
      await Promise.allSettled(
        notification.targetUsers.map((uid) =>
          inApp.create(uid, { title: notification.title, message: notification.message, notifType: 'promotional' })
        )
      );
    }
  } catch (pushErr) {
    console.error('Notification push failed (non-fatal):', pushErr.message);
  }

  await logAudit(req, 'SEND_NOTIFICATION', 'Notification', notification._id, {});
  res.json({ success: true, message: 'Notification sent', notification });
});

const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, message: 'Notification deleted' });
});

// ─── CMS PAGES ───────────────────────────────────────────────────────────────

const getCMSPages = asyncHandler(async (req, res) => {
  const { type, status } = req.query;
  const query = {};
  if (type) query.type = type;
  if (status) query.status = status;
  const pages = await CMSPage.find(query).populate('author', 'firstName lastName').sort({ sortOrder: 1, createdAt: -1 });
  res.json({ success: true, pages });
});

const getCMSPage = asyncHandler(async (req, res) => {
  const page = await CMSPage.findById(req.params.id).populate('author', 'firstName lastName');
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  res.json({ success: true, page });
});

const createCMSPage = asyncHandler(async (req, res) => {
  const slug = req.body.slug || req.body.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const page = await CMSPage.create({ ...req.body, slug, author: req.userId });
  await logAudit(req, 'CREATE_CMS_PAGE', 'CMSPage', page._id, { title: page.title });
  res.status(201).json({ success: true, message: 'Page created', page });
});

const updateCMSPage = asyncHandler(async (req, res) => {
  if (req.body.status === 'published' && !req.body.publishedAt) req.body.publishedAt = new Date();
  const page = await CMSPage.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  await logAudit(req, 'UPDATE_CMS_PAGE', 'CMSPage', page._id, req.body);
  res.json({ success: true, message: 'Page updated', page });
});

const deleteCMSPage = asyncHandler(async (req, res) => {
  const page = await CMSPage.findByIdAndDelete(req.params.id);
  if (!page) return res.status(404).json({ success: false, message: 'Page not found' });
  await logAudit(req, 'DELETE_CMS_PAGE', 'CMSPage', req.params.id, {});
  res.json({ success: true, message: 'Page deleted' });
});

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────────

const getAuditLogs = asyncHandler(async (req, res) => {
  const { actor, resource, action, page = 1, limit = 50, startDate, endDate } = req.query;
  const query = {};
  if (actor) query.actor = actor;
  if (resource) query.resource = resource;
  if (action) query.action = { $regex: action, $options: 'i' };
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    AuditLog.find(query).populate('actor', 'firstName lastName email role').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    AuditLog.countDocuments(query),
  ]);
  res.json({ success: true, logs, pagination: { current: +page, limit: +limit, total, pages: Math.ceil(total / limit) } });
});

// ─── CANCELLATION POLICY ─────────────────────────────────────────────────────

const { loadPolicy, loadStrikeThreshold } = require('../utils/cancellation');
const Location = require('../models/Location');

/**
 * GET /api/admin/cancellation-policy
 * Returns current tiered refund policy + strike threshold
 */
const getCancellationPolicy = asyncHandler(async (req, res) => {
  const [policy, threshold] = await Promise.all([loadPolicy(), loadStrikeThreshold()]);
  res.json({ success: true, policy, strikeThreshold: threshold });
});

/**
 * PUT /api/admin/cancellation-policy
 * Body: { policy: [{ minDays, refundPct }], strikeThreshold: number }
 * Tiers must be sorted descending by minDays.
 */
const updateCancellationPolicy = asyncHandler(async (req, res) => {
  const { policy, strikeThreshold } = req.body;

  if (policy !== undefined) {
    if (!Array.isArray(policy) || policy.some((t) => t.minDays === undefined || t.refundPct === undefined)) {
      return res.status(400).json({ success: false, message: 'policy must be an array of { minDays, refundPct }' });
    }
    await PlatformSetting.findOneAndUpdate(
      { key: 'cancellationPolicy' },
      { key: 'cancellationPolicy', value: policy, description: 'Tiered refund policy for client cancellations' },
      { upsert: true, new: true }
    );
  }

  if (strikeThreshold !== undefined) {
    await PlatformSetting.findOneAndUpdate(
      { key: 'providerStrikeThreshold' },
      { key: 'providerStrikeThreshold', value: Number(strikeThreshold), description: 'Provider strikes before auto-suspension' },
      { upsert: true, new: true }
    );
  }

  await logAudit(req, 'UPDATE_CANCELLATION_POLICY', 'PlatformSetting', null, req.body);
  const [updatedPolicy, updatedThreshold] = await Promise.all([loadPolicy(), loadStrikeThreshold()]);
  res.json({ success: true, message: 'Cancellation policy updated', policy: updatedPolicy, strikeThreshold: updatedThreshold });
});

// ─── PROVIDER STRIKE MANAGEMENT ──────────────────────────────────────────────

const getProviderStrikes = asyncHandler(async (req, res) => {
  const provider = await User.findById(req.params.id).select('firstName lastName email strikeCount isSuspended suspensionReason suspendedAt');
  if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
  res.json({ success: true, provider });
});

const resetProviderStrikes = asyncHandler(async (req, res) => {
  const provider = await User.findById(req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
  provider.strikeCount = 0;
  await provider.save();
  await logAudit(req, 'RESET_PROVIDER_STRIKES', 'User', provider._id, {});
  res.json({ success: true, message: 'Strike count reset', strikeCount: 0 });
});

const unsuspendProvider = asyncHandler(async (req, res) => {
  const provider = await User.findById(req.params.id);
  if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
  provider.isSuspended = false;
  provider.suspensionReason = undefined;
  provider.suspendedAt = undefined;
  await provider.save();
  await logAudit(req, 'UNSUSPEND_PROVIDER', 'User', provider._id, {});
  res.json({ success: true, message: 'Provider unsuspended', provider });
});

// ─── LOCATION MANAGEMENT ────────────────────────────────────────────────────

/**
 * GET /api/admin/locations  (also public: GET /api/locations)
 * Returns all active locations (states + LGAs + towns)
 */
const getLocations = asyncHandler(async (req, res) => {
  const locations = await Location.find({ isActive: true }).sort({ state: 1 });
  res.json({ success: true, locations });
});

/**
 * POST /api/admin/locations
 * Body: { state, lgas: [{ lga, towns: [] }] }
 */
const createLocation = asyncHandler(async (req, res) => {
  const { state, lgas = [] } = req.body;
  if (!state) return res.status(400).json({ success: false, message: 'state is required' });
  const existing = await Location.findOne({ state });
  if (existing) return res.status(409).json({ success: false, message: 'State already exists' });
  const location = await Location.create({ state, lgas });
  await logAudit(req, 'CREATE_LOCATION', 'Location', location._id, { state });
  res.status(201).json({ success: true, message: 'Location created', location });
});

/**
 * PUT /api/admin/locations/:id
 * Full replace of lgas array, or add new LGAs/towns
 */
const updateLocation = asyncHandler(async (req, res) => {
  const location = await Location.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
  await logAudit(req, 'UPDATE_LOCATION', 'Location', location._id, req.body);
  res.json({ success: true, message: 'Location updated', location });
});

/**
 * DELETE /api/admin/locations/:id
 */
const deleteLocation = asyncHandler(async (req, res) => {
  const location = await Location.findByIdAndDelete(req.params.id);
  if (!location) return res.status(404).json({ success: false, message: 'Location not found' });
  await logAudit(req, 'DELETE_LOCATION', 'Location', req.params.id, {});
  res.json({ success: true, message: 'Location deleted' });
});

module.exports = {
  // Commission
  getCommissionSettings,
  updateCommissionSettings,
  getCommissionBreakdown,
  getSupportContactSettings,
  updateSupportContactSettings,
  // Payments
  getAllPayments,
  // Refunds
  getPendingRefunds,
  approveRefund,
  rejectRefund,
  // Content Moderation
  getFlaggedReviews,
  moderateReview,
  getFlaggedServices,
  moderateService,
  // Reports
  getDetailedReports,
  // Categories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Coupons
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCoupon,
  // Promotions
  getPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  togglePromotion,
  // Analytics
  getAnalyticsDashboard,
  // Notifications
  getNotifications,
  createNotification,
  sendNotification,
  deleteNotification,
  // CMS
  getCMSPages,
  getCMSPage,
  createCMSPage,
  updateCMSPage,
  deleteCMSPage,
  // Audit Logs
  getAuditLogs,
  // Cancellation Policy
  getCancellationPolicy,
  updateCancellationPolicy,
  // Provider Strikes
  getProviderStrikes,
  resetProviderStrikes,
  unsuspendProvider,
  // Locations
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};
