/**
 * Authentication Routes
 * Handles all authentication-related endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { createSingleUploadMiddleware } = require('../utils/fileUpload');

// Strict rate limiter for auth endpoints (fraud/brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

router.post('/resend-verification', authenticate, authController.resendVerification);

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

module.exports = router;
