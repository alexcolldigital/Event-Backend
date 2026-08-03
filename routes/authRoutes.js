/**
 * Authentication Routes
 * Handles all authentication-related endpoints
 */

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

// Register route
router.post(
  '/register',
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

// Login route
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validateRequest,
  authController.loginUser
);

// Get current user (protected route)
router.get('/me', authenticate, authController.getCurrentUser);

// Update profile (protected route)
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

// Change password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    body('confirmPassword').notEmpty().withMessage('Password confirmation is required'),
  ],
  validateRequest,
  authController.changePassword
);

// Forgot password
router.post(
  '/forgot-password',
  [body('email').isEmail().withMessage('Valid email is required')],
  validateRequest,
  authController.forgotPassword
);

// Reset password
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    body('confirmPassword').notEmpty().withMessage('Password confirmation is required'),
  ],
  validateRequest,
  authController.resetPassword
);

module.exports = router;
