/**
 * Authentication Routes
 * Handles all authentication-related endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { createSingleUploadMiddleware } = require('../utils/fileUpload');
const { authLimiter, otpLimiter } = require('../middleware/security');

// Register route
router.post(
  '/register',
  authLimiter,
  [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('passwordConfirm').notEmpty().withMessage('Password confirmation is required'),
  ],
  validateRequest,
  authController.registerUser
);

// Register service provider
router.post(
  '/register-provider',
  authLimiter,
  [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phoneNumber').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('businessName').notEmpty().withMessage('Business name is required'),
  ],
  validateRequest,
  authController.registerServiceProvider
);

// Login routes
router.post(
  '/login',
  authLimiter,
  [body('email').isEmail(), body('password').notEmpty()],
  validateRequest,
  authController.loginUser
);

router.post(
  '/login-phone',
  authLimiter,
  [body('phoneNumber').notEmpty(), body('password').notEmpty()],
  validateRequest,
  authController.loginWithPhone
);

router.post(
  '/login-unified',
  authLimiter,
  [body('identifier').notEmpty(), body('password').notEmpty()],
  validateRequest,
  authController.loginUnified
);

// Email verification
router.post(
  '/verify-email',
  [body('token').notEmpty().withMessage('Token is required')],
  validateRequest,
  authController.verifyEmail
);

// resend-verification: works with or without auth token
// unauthenticated users pass { email } or { userId } in body
router.post(
  '/resend-verification',
  otpLimiter,
  async (req, res, next) => {
    // Optionally attach userId if a valid token is present — non-blocking
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { verifyToken } = require('../config/jwt');
        const decoded = verifyToken(authHeader.split(' ')[1]);
        req.userId = String(decoded.id);
      } catch (_) { /* token invalid — proceed without userId */ }
    }
    next();
  },
  authController.resendVerification
);

// 2FA
router.post(
  '/verify-2fa',
  authLimiter,
  [body('userId').notEmpty(), body('code').isLength({ min: 6, max: 6 })],
  validateRequest,
  authController.verifyTwoFactor
);

router.post('/2fa/toggle', authenticate, authController.toggleTwoFactor);

// Login history & device management
router.get('/login-history', authenticate, authController.getLoginHistory);
router.get('/devices', authenticate, authController.getDevices);
router.post(
  '/devices',
  authenticate,
  [body('deviceId').notEmpty(), body('deviceName').notEmpty()],
  validateRequest,
  authController.addDevice
);
router.delete('/devices/:deviceId', authenticate, authController.removeDevice);

// Protected routes
router.get('/me', authenticate, authController.getCurrentUser);

router.put(
  '/profile',
  authenticate,
  [
    body('firstName').optional().notEmpty(),
    body('lastName').optional().notEmpty(),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phoneNumber').optional().notEmpty(),
    body('businessName').optional().notEmpty(),
    body('businessDescription').optional().isString(),
    body('bio').optional().isString(),
    body('preferences.notifications').optional().isBoolean(),
    body('preferences.newsletters').optional().isBoolean(),
  ],
  validateRequest,
  authController.updateProfile
);

router.post(
  '/profile/image',
  authenticate,
  createSingleUploadMiddleware('profiles', 'profileImage'),
  authController.uploadProfileImage
);

router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
    body('confirmPassword').notEmpty(),
  ],
  validateRequest,
  authController.changePassword
);

router.post(
  '/forgot-password',
  authLimiter,
  [body('identifier').notEmpty()],
  validateRequest,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 6 }),
    body('confirmPassword').notEmpty(),
  ],
  validateRequest,
  authController.resetPassword
);

// Get admin contacts (for messaging support)
router.get('/admin-contacts', authenticate, authController.getAdminContacts);

// Phone OTP verification (from profile)
router.post(
  '/send-phone-otp',
  authenticate,
  otpLimiter,
  [body('phoneNumber').optional().isMobilePhone().withMessage('Valid phone number required')],
  validateRequest,
  authController.sendPhoneOtp
);
router.post(
  '/verify-phone',
  authenticate,
  otpLimiter,
  [body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')],
  validateRequest,
  authController.verifyPhone
);

// Refresh access token
router.post(
  '/refresh-token',
  [body('refreshToken').notEmpty().withMessage('refreshToken is required')],
  validateRequest,
  authController.refreshAccessToken
);

// FCM token registration
router.post(
  '/fcm-token',
  authenticate,
  [body('fcmToken').notEmpty().withMessage('fcmToken is required')],
  validateRequest,
  async (req, res) => {
    try {
      const User = require('../models/User');
      await User.findByIdAndUpdate(req.userId, { fcmToken: req.body.fcmToken });
      res.json({ success: true, message: 'FCM token saved' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// User in-app notifications
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const query = {
      $or: [
        { recipient: req.userId },
        { type: 'broadcast', status: 'sent' },
        { type: 'role_based', targetRole: { $in: ['all', req.user.role] }, status: 'sent' },
      ],
    };
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ ...query, isRead: false, readBy: { $ne: req.userId } }),
    ]);
    res.json({ success: true, notifications, total, unreadCount, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.userId },
      $set: { isRead: true },
    });
    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/notifications/read-all', authenticate, async (req, res) => {
  try {
    const Notification = require('../models/Notification');
    await Notification.updateMany(
      { $or: [{ recipient: req.userId }, { type: { $in: ['broadcast', 'role_based'] }, status: 'sent' }], readBy: { $ne: req.userId } },
      { $addToSet: { readBy: req.userId }, $set: { isRead: true } }
    );
    res.json({ success: true, message: 'All marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
