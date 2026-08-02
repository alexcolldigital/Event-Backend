/**
 * Admin Routes
 * Handles all admin-related endpoints
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

// Apply authentication and admin authorization to all routes
router.use(authenticate, authorize(USER_ROLES.ADMIN));

// Dashboard statistics
router.get('/dashboard', adminController.getDashboardStats);

// Users management
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/block', adminController.blockUser);
router.patch('/users/:id/verify', adminController.verifyServiceProvider);

// Bookings management
router.get('/bookings', adminController.getAllBookings);

// Analytics & Reports
router.get('/revenue', adminController.getRevenueAnalytics);
router.get('/users/analytics/breakdown', adminController.getUserAnalytics);
router.post('/analytics', adminController.createAnalyticsRecord);
router.get('/reports', adminController.getSystemReports);

module.exports = router;
