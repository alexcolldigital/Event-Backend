/**
 * JWT Configuration
 * Secure token creation and verification with jti support
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.warn('[SECURITY] JWT_SECRET is missing or too short. Use a 64+ char random string.');
}

/**
 * Generate access JWT token
 */
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role, jti: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d', algorithm: 'HS256' }
  );
};

/**
 * Generate short-lived refresh token
 */
const generateRefreshToken = (id) => {
  return jwt.sign(
    { id, type: 'refresh', jti: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
    { expiresIn: '30d', algorithm: 'HS256' }
  );
};

/**
 * Verify access JWT token
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh',
      { algorithms: ['HS256'] }
    );
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
};
