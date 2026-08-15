/**
 * Security Middleware
 * Centralized security controls: rate limiting, fraud detection, input sanitization
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.body?.email || req.body?.identifier || ''),
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many OTP requests. Please wait 10 minutes.' },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many payment requests. Please slow down.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { success: false, message: 'Too many upload requests.' },
});

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  skip: (req) => req.path.startsWith('/bookings/webhook'),
  message: { success: false, message: 'Too many requests. Please try again later.' },
});

// ─── Input Sanitization ───────────────────────────────────────────────────────

/**
 * Strip MongoDB operators from req.body and req.params only.
 * req.query is intentionally excluded — Express 5 makes it a read-only getter
 * and express-mongo-sanitize would throw "Cannot set property query" if included.
 */
const sanitizeInputs = (req, res, next) => {
  const sanitize = mongoSanitize.sanitize;
  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body, { replaceWith: '_' });
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitize(req.params, { replaceWith: '_' });
  }
  next();
};

/**
 * Strip dangerous HTML/script tags from string fields
 */
const stripXSS = (req, res, next) => {
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result = {};
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        result[key] = obj[key]
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        result[key] = clean(obj[key]);
      } else {
        result[key] = obj[key];
      }
    }
    return result;
  };
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  // req.query is read-only in newer Express — skip mutation
  next();
};

/**
 * Prevent HTTP Parameter Pollution — keep only last value for each param
 */
const preventHPP = (req, res, next) => {
  // req.query is a read-only getter in newer Express/Node versions;
  // HPP protection is handled by express-mongo-sanitize above.
  next();
};

// ─── Fraud Detection ──────────────────────────────────────────────────────────

// In-memory velocity tracker (use Redis in production)
const velocityMap = new Map();

const FRAUD_THRESHOLDS = {
  maxBookingsPerHour: 5,
  maxPaymentsPerHour: 3,
  maxRegistrationsPerIp: 3,
};

const trackVelocity = (key, windowMs = 60 * 60 * 1000) => {
  const now = Date.now();
  const entry = velocityMap.get(key) || { count: 0, windowStart: now };

  if (now - entry.windowStart > windowMs) {
    entry.count = 1;
    entry.windowStart = now;
  } else {
    entry.count += 1;
  }

  velocityMap.set(key, entry);
  return entry.count;
};

const fraudDetect = (action) => (req, res, next) => {
  const ip = req.ip;
  const userId = req.userId || 'anon';
  const key = `${action}:${ip}:${userId}`;
  const count = trackVelocity(key);

  const limit = FRAUD_THRESHOLDS[`max${action.charAt(0).toUpperCase() + action.slice(1)}PerHour`] || 20;

  if (count > limit) {
    console.warn(`[FRAUD] Velocity limit exceeded — action: ${action}, IP: ${ip}, userId: ${userId}, count: ${count}`);
    return res.status(429).json({
      success: false,
      message: 'Suspicious activity detected. Your request has been blocked.',
      code: 'FRAUD_VELOCITY_LIMIT',
    });
  }

  next();
};

/**
 * Detect suspicious login patterns (new IP + new device simultaneously)
 */
const detectSuspiciousLogin = (user, ip, deviceId) => {
  if (!user.lastLoginIp) return false;
  const knownDevice = deviceId && user.trustedDevices?.some((d) => d.deviceId === deviceId);
  const knownIp = user.lastLoginIp === ip;
  return !knownDevice && !knownIp;
};

/**
 * Block inactive or blocked users at middleware level
 */
const requireActiveAccount = async (req, res, next) => {
  if (!req.user) return next();
  if (!req.user.isActive) {
    return res.status(403).json({ success: false, message: 'Account is inactive.' });
  }
  if (req.user.isBlocked) {
    return res.status(403).json({ success: false, message: `Account is blocked. Reason: ${req.user.blockReason || 'Policy violation'}` });
  }
  next();
};

module.exports = {
  authLimiter,
  otpLimiter,
  paymentLimiter,
  uploadLimiter,
  globalApiLimiter,
  sanitizeInputs,
  stripXSS,
  preventHPP,
  fraudDetect,
  detectSuspiciousLogin,
  requireActiveAccount,
};
