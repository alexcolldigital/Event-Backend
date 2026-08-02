/**
 * Authentication Middleware
 * Handles user authentication and authorization
 */

const { verifyToken } = require('../config/jwt');
const User = require('../models/User');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    // Attach user to request
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    req.user = user;
    req.userId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid token',
    });
  }
};

/**
 * Authorize user by role
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized',
      });
    }

    next();
  };
};

/**
 * Check if user is service provider
 */
const isServiceProvider = (req, res, next) => {
  if (req.user.role !== 'service_provider') {
    return res.status(403).json({
      success: false,
      message: 'Only service providers can access this resource',
    });
  }
  next();
};

module.exports = {
  authenticate,
  authorize,
  isServiceProvider,
};
