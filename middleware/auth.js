/**
 * Authentication Middleware
 */

const { verifyToken } = require('../config/jwt');
const User = require('../models/User');

/**
 * Verify JWT and attach user — blocks inactive/blocked accounts
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No authentication token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Malformed authorization header' });
    }

    const decoded = verifyToken(token);

    const user = await User.findById(decoded.id).select(
      '+twoFactorCode +twoFactorExpires +twoFactorSecret'
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: `Account is blocked. Reason: ${user.blockReason || 'Policy violation'}`,
      });
    }

    req.user = user;
    req.userId = String(decoded.id);
    req.userRole = user.role;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * Authorize by role(s)
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};

/**
 * Service provider only
 */
const isServiceProvider = (req, res, next) => {
  if (req.user?.role !== 'service_provider' && req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only service providers can access this resource' });
  }
  next();
};

module.exports = { authenticate, authorize, isServiceProvider };
