/**
 * Admin Routes
 * Handles all admin-related endpoints
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const ext = require('../controllers/adminExtendedController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const { createUploadMiddleware } = require('../utils/fileUpload');

// Apply authentication and admin authorization to all routes
router.use(authenticate, authorize(USER_ROLES.ADMIN));

// Dashboard statistics
router.get('/dashboard', adminController.getDashboardStats);

// Users management
router.get('/users', adminController.getAllUsers);
router.post('/users', adminController.createUser);
router.get('/users/analytics/breakdown', adminController.getUserAnalytics);
router.patch('/users/:id/block', adminController.blockUser);
router.patch('/users/:id/verify', adminController.verifyServiceProvider);
router.patch('/users/:id/role', adminController.assignRole);

// Services management
router.get('/services', adminController.getAllServices);
router.get('/services/:id', adminController.getServiceById);
router.post('/services', adminController.createService);
router.put('/services/:id', adminController.updateService);
router.delete('/services/:id', adminController.deleteService);
router.patch('/services/:id/toggle-featured', adminController.toggleFeatured);
router.patch('/services/:id/toggle-active', adminController.toggleActive);
router.post('/services/:id/upload-media', createUploadMiddleware('services', 12), adminController.uploadServiceMedia);

// Bookings management
router.get('/bookings', adminController.getAllBookings);
router.get('/bookings/:id', adminController.getBookingById);
router.patch('/bookings/:id/confirm', adminController.adminConfirmBooking);
router.patch('/bookings/:id/cancel', adminController.adminCancelBooking);
router.patch('/bookings/:id/complete', adminController.adminCompleteBooking);

// Revenue & Analytics
router.get('/revenue', adminController.getRevenueAnalytics);
router.post('/analytics', adminController.createAnalyticsRecord);
router.get('/reports', adminController.getSystemReports);
router.get('/analytics/dashboard', ext.getAnalyticsDashboard);
router.get('/reports/detailed', ext.getDetailedReports);

// Commission management
router.get('/commission', ext.getCommissionSettings);
router.put('/commission', ext.updateCommissionSettings);
router.get('/commission/breakdown', ext.getCommissionBreakdown);

// Payment monitoring
router.get('/payments', ext.getAllPayments);

// Refund management
router.get('/refunds', ext.getPendingRefunds);
router.patch('/refunds/:id/approve', ext.approveRefund);
router.patch('/refunds/:id/reject', ext.rejectRefund);

// Content moderation
router.get('/moderation/reviews', ext.getFlaggedReviews);
router.patch('/moderation/reviews/:id', ext.moderateReview);
router.get('/moderation/services', ext.getFlaggedServices);
router.patch('/moderation/services/:id', ext.moderateService);

// Category management
router.get('/categories', ext.getCategories);
router.post('/categories', ext.createCategory);
router.put('/categories/:id', ext.updateCategory);
router.delete('/categories/:id', ext.deleteCategory);

// Coupon management
router.get('/coupons', ext.getCoupons);
router.post('/coupons', ext.createCoupon);
router.put('/coupons/:id', ext.updateCoupon);
router.delete('/coupons/:id', ext.deleteCoupon);
router.patch('/coupons/:id/toggle', ext.toggleCoupon);

// Promotions
router.get('/promotions', ext.getPromotions);
router.post('/promotions', ext.createPromotion);
router.put('/promotions/:id', ext.updatePromotion);
router.delete('/promotions/:id', ext.deletePromotion);
router.patch('/promotions/:id/toggle', ext.togglePromotion);

// Notification management
router.get('/notifications', ext.getNotifications);
router.post('/notifications', ext.createNotification);
router.post('/notifications/:id/send', ext.sendNotification);
router.delete('/notifications/:id', ext.deleteNotification);

// CMS Pages
router.get('/cms', ext.getCMSPages);
router.get('/cms/:id', ext.getCMSPage);
router.post('/cms', ext.createCMSPage);
router.put('/cms/:id', ext.updateCMSPage);
router.delete('/cms/:id', ext.deleteCMSPage);

// Audit Logs
router.get('/audit-logs', ext.getAuditLogs);

module.exports = router;
