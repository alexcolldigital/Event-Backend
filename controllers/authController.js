/**
 * Authentication Controller
 * Handles user registration, login, and auth-related operations
 */

const crypto = require('crypto');
const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../config/jwt');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendTwoFactorEmail,
  sendEmailVerificationEmail,
  sendVerificationCodeEmail,
} = require('../utils/email');
const { USER_ROLES } = require('../config/constants');
const { sendPhoneOtpSms } = require('../utils/sms');

// Helper: extract request metadata
const getRequestMeta = (req) => ({
  ip: req.ip || req.connection?.remoteAddress || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
  deviceId: req.headers['x-device-id'] || null,
});

// Helper: detect suspicious login (new IP + new device)
const isSuspiciousLogin = (user, ip, deviceId) => {
  if (!user.lastLoginIp) return false;
  const trustedDevices = Array.isArray(user.trustedDevices) ? user.trustedDevices : [];
  const knownDevice = deviceId && trustedDevices.some((d) => d.deviceId === deviceId);
  const knownIp = user.lastLoginIp === ip;
  return !knownDevice && !knownIp;
};

const isNewDeviceLogin = (user, deviceId) => {
  if (!deviceId) return false;
  const trustedDevices = Array.isArray(user.trustedDevices) ? user.trustedDevices : [];
  return !trustedDevices.some((d) => d.deviceId === deviceId);
};

const sendVerificationEmailToUser = async (user) => {
  if (!user || !user.email) return null;
  const verificationToken = user.getEmailVerificationToken();
  await user.save();
  try {
    await sendEmailVerificationEmail(
      user.email,
      user.firstName,
      `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
    );
  } catch (emailErr) {
    console.error('Verification email failed (non-fatal):', emailErr.message || emailErr);
  }
  return verificationToken;
};

const formatUser = (user) => ({
  id: user._id,
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  country: user.country,
  countryCode: user.countryCode,
  dialCode: user.dialCode,
  role: user.role,
  businessName: user.businessName,
  businessType: user.businessType,
  businessDescription: user.businessDescription,
  profileImage: user.profileImage,
  averageRating: user.averageRating,
  totalBookings: user.totalBookings,
  completedBookings: user.completedBookings,
  totalReviews: user.totalReviews,
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: user.isPhoneVerified,
  preferences: user.preferences,
  bio: user.bio,
  address: user.address,
});

/**
 * Register new user
 * POST /api/auth/register
 */
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, country, countryCode, dialCode, password, passwordConfirm, role } =
    req.body;

  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) return res.status(400).json({ success: false, message: 'Email already in use' });

  const existingPhone = await User.findOne({ phoneNumber });
  if (existingPhone) return res.status(400).json({ success: false, message: 'Phone number already in use' });

  if (password !== passwordConfirm) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  const user = new User({
    firstName,
    lastName,
    email,
    phoneNumber,
    country: country || 'Nigeria',
    countryCode: countryCode || 'NG',
    dialCode: dialCode || '+234',
    password,
    role: role || USER_ROLES.CLIENT,
  });

  const verificationToken = user.getEmailVerificationToken();
  await user.save();

  sendEmailVerificationEmail(
    email,
    firstName,
    `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
  ).catch((emailErr) => {
    console.error('Verification email failed (non-fatal):', emailErr.message);
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please verify your email before logging in.',
    requiresEmailVerification: true,
    user: formatUser(user),
  });
});

/**
 * Register service provider
 * POST /api/auth/register-provider
 */
const registerServiceProvider = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    passwordConfirm,
    businessName,
    businessType,
    businessDescription,
    address,
    country,
    countryCode,
    dialCode,
  } = req.body;

  // Validate input
  if (!firstName || !lastName || !email || !phoneNumber || !password || !businessName) {
    return res.status(400).json({
      success: false,
      message: 'All required fields must be provided',
    });
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Email already in use',
    });
  }

  // Validate password
  if (password !== passwordConfirm) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
  }

  // Create service provider
  const user = new User({
    firstName,
    lastName,
    email,
    phoneNumber,
    country: country || 'Nigeria',
    countryCode: countryCode || 'NG',
    dialCode: dialCode || '+234',
    password,
    role: USER_ROLES.SERVICE_PROVIDER,
    businessName,
    businessType,
    businessDescription,
    address,
  });

  await user.save();

  const verificationToken = user.getEmailVerificationToken();
  await user.save();
  sendEmailVerificationEmail(
    email,
    firstName,
    `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
  ).catch(() => {});

  res.status(201).json({
    success: true,
    message: 'Service provider registered successfully. Please verify your email before logging in.',
    requiresEmailVerification: true,
    user: formatUser(user),
  });
});

// Shared login logic
const performLogin = async (user, req, res) => {
  const { ip, userAgent, deviceId } = getRequestMeta(req);

  // Check account lock (fraud detection)
  if (user.isLocked) {
    await user.addLoginHistory({ ip, userAgent, deviceId, success: false });
    return res.status(423).json({
      success: false,
      message: 'Account temporarily locked due to too many failed attempts. Try again in 30 minutes.',
    });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account is inactive' });
  }
  if (user.isBlocked) {
    return res.status(403).json({ success: false, message: `Account is blocked. Reason: ${user.blockReason}` });
  }

  if (!user.isEmailVerified) {
    await sendVerificationEmailToUser(user);
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before logging in.',
      requiresEmailVerification: true,
      userId: user._id,
    });
  }

  if (isNewDeviceLogin(user, deviceId)) {
    await sendVerificationEmailToUser(user);
    return res.status(403).json({
      success: false,
      message: 'New device detected. A verification email has been sent to your inbox to confirm this device.',
      requiresEmailVerification: true,
      requiresDeviceVerification: true,
      userId: user._id,
      deviceId,
    });
  }

  // If 2FA enabled, send code and require verification
  if (user.twoFactorEnabled) {
    const code = await user.generateTwoFactorCode();
    try { await sendTwoFactorEmail(user.email, user.firstName, code); } catch (e) { /* non-fatal */ }
    return res.status(200).json({
      success: true,
      requiresTwoFactor: true,
      userId: user._id,
      message: '2FA code sent to your email. Do not share it.',
    });
  }

  // Suspicious login detection
  const suspicious = isSuspiciousLogin(user, ip, deviceId);

  await user.resetFailedLogins();
  await user.addLoginHistory({ ip, userAgent, deviceId, success: true });

  // Update trusted device last used, or add the device after successful verification
  if (deviceId) {
    const existingDevice = user.trustedDevices.find((d) => d.deviceId === deviceId);
    if (existingDevice) {
      existingDevice.lastUsedAt = new Date();
    } else {
      user.trustedDevices.push({
        deviceId,
        deviceName: 'Verified Device',
        userAgent,
        ip,
        addedAt: new Date(),
        lastUsedAt: new Date(),
      });
    }
    await user.save();
  }

  const token = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  // Phone not verified — issue token but prompt verification
  if (!user.isPhoneVerified) {
    try {
      const otp = await user.generatePhoneOtp();
      await sendPhoneOtpSms(user.phoneNumber, otp).catch(() => {});
    } catch (e) { /* non-fatal */ }

    return res.status(200).json({
      success: true,
      message: 'Login successful. Please verify your phone number.',
      token,
      refreshToken,
      user: formatUser(user),
      suspicious,
      requiresPhoneVerification: true,
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    refreshToken,
    user: formatUser(user),
    suspicious,
  });
};

/**
 * Login user with email
 * POST /api/auth/login
 */
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email }).select('+password +twoFactorCode +twoFactorExpires +twoFactorSecret');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incFailedLogins();
    const { ip, userAgent, deviceId } = getRequestMeta(req);
    await user.addLoginHistory({ ip, userAgent, deviceId, success: false });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  return performLogin(user, req, res);
});

/**
 * Login user with phone number (requires verified phone)
 * POST /api/auth/login-phone
 */
const loginWithPhone = asyncHandler(async (req, res) => {
  const { phoneNumber, password } = req.body;
  if (!phoneNumber || !password) {
    return res.status(400).json({ success: false, message: 'Phone number and password are required' });
  }

  const user = await User.findOne({ phoneNumber }).select('+password +twoFactorCode +twoFactorExpires +twoFactorSecret');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incFailedLogins();
    const { ip, userAgent, deviceId } = getRequestMeta(req);
    await user.addLoginHistory({ ip, userAgent, deviceId, success: false });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  if (!user.isPhoneVerified) {
    return res.status(403).json({
      success: false,
      message: 'Phone number not verified. Please verify your phone number from your profile before logging in with it.',
      requiresPhoneVerification: true,
      userId: user._id,
    });
  }

  return performLogin(user, req, res);
});

/**
 * Unified login - accepts either email or phone number
 * POST /api/auth/login-unified
 */
const loginUnified = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ success: false, message: 'Email/phone and password are required' });
  }
  if (typeof identifier !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid identifier format' });
  }

  const isEmail = identifier.includes('@');
  const query = isEmail ? { email: identifier } : { phoneNumber: identifier };

  const user = await User.findOne(query).select('+password +twoFactorCode +twoFactorExpires +twoFactorSecret');
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incFailedLogins();
    const { ip, userAgent, deviceId } = getRequestMeta(req);
    await user.addLoginHistory({ ip, userAgent, deviceId, success: false });
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // Phone login requires verified phone number
  if (!isEmail && !user.isPhoneVerified) {
    return res.status(403).json({
      success: false,
      message: 'Phone number not verified. Please verify your phone number from your profile before logging in with it.',
      requiresPhoneVerification: true,
      userId: user._id,
    });
  }

  return performLogin(user, req, res);
});

/**
 * Get current user
 * GET /api/auth/me
 */
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  res.status(200).json({
    success: true,
    user,
  });
});

/**
 * Update profile
 * PUT /api/auth/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { firstName, lastName, email, phoneNumber, bio, address, businessName, businessDescription, preferences } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser._id.toString() !== userId) {
      return res.status(400).json({ success: false, message: 'Email is already in use' });
    }
    user.email = email;
    // Reset email verification when email changes
    user.isEmailVerified = false;
    user.isVerified = false;
    const verificationToken = user.getEmailVerificationToken();
    sendEmailVerificationEmail(
      email, user.firstName,
      `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
    ).catch(() => {});
  }

  if (phoneNumber && phoneNumber !== user.phoneNumber) {
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone && existingPhone._id.toString() !== userId) {
      return res.status(400).json({ success: false, message: 'Phone number is already in use' });
    }
    user.phoneNumber = phoneNumber;
    // Reset phone verification when phone changes
    user.isPhoneVerified = false;
    user.isVerified = false;
  }

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (bio !== undefined) user.bio = bio;
  if (address !== undefined) user.address = address;
  if (businessName !== undefined) user.businessName = businessName;
  if (businessDescription !== undefined) user.businessDescription = businessDescription;
  if (preferences !== undefined && typeof preferences === 'object') {
    const existing = user.preferences ? user.preferences.toObject ? user.preferences.toObject() : { ...user.preferences } : {};
    user.preferences = {
      ...existing,
      ...preferences,
      pushPrefs: {
        ...(existing.pushPrefs || {}),
        ...(preferences.pushPrefs || {}),
      },
    };
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user,
    phoneVerificationRequired: phoneNumber && phoneNumber !== req.body._originalPhone ? true : undefined,
  });
});

/**
 * Change password
 * POST /api/auth/change-password
 */
const uploadProfileImage = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Profile image is required' });
  }

  const file = req.file;
  const profileImage = {
    url: file.path || file.secure_url || file.url,
    publicId: file.filename || file.public_id || file.publicId,
  };

  user.profileImage = profileImage;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile image uploaded successfully',
    user,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required',
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'New passwords do not match',
    });
  }

  const user = await User.findById(req.userId).select('+password');

  // Verify current password
  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Current password is incorrect',
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({
      success: false,
      message: 'Email or phone number is required',
    });
  }

  if (typeof identifier !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid identifier format' });
  }

  // Determine if identifier is email or phone number
  const isEmail = identifier.includes('@');
  const query = isEmail ? { email: identifier } : { phoneNumber: identifier };

  const user = await User.findOne(query);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Generate reset token
  const resetToken = user.getEmailVerificationToken();
  await user.save();

  // Send reset link via email or SMS
  if (isEmail) {
    try {
      await sendPasswordResetEmail(identifier, `${process.env.FRONTEND_URL}/reset-password/${resetToken}`);
    } catch (emailErr) {
      console.error('Password reset email failed (non-fatal):', emailErr.message || emailErr);
    }
    res.status(200).json({
      success: true,
      message: 'Password reset link sent to email',
    });
  } else {
    // TODO: Implement SMS sending for phone number
    // For now, we'll return the token in response (in production, send via SMS)
    res.status(200).json({
      success: true,
      message: 'Password reset link sent via SMS',
      // In development, include token for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  }
});

/**
 * Reset password
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required',
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
  }

  // Reset password — verify hashed token
  const hashedResetToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationToken: hashedResetToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }

  user.password = newPassword;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successfully',
  });
});

/**
 * Verify email address
 * POST /api/auth/verify-email
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token, deviceId, deviceName } = req.body;
  const requestDeviceId = deviceId || req.headers['x-device-id'];
  const requestDeviceName = deviceName || req.headers['x-device-name'] || 'Verified Device';

  if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

  user.isEmailVerified = true;
  user.isVerified = user.isEmailVerified || user.isPhoneVerified || user.isBusinessVerified;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;

  if (requestDeviceId) {
    const existingDevice = user.trustedDevices.find((d) => d.deviceId === requestDeviceId);
    if (!existingDevice) {
      user.trustedDevices.push({
        deviceId: requestDeviceId,
        deviceName: requestDeviceName,
        userAgent: req.headers['user-agent'] || 'unknown',
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        addedAt: new Date(),
        lastUsedAt: new Date(),
      });
    }
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
    isEmailVerified: true,
    deviceAdded: Boolean(requestDeviceId),
  });
});

/**
 * Resend email verification
 * POST /api/auth/resend-verification
 */
const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.isEmailVerified) return res.status(400).json({ success: false, message: 'Email already verified' });

  const token = user.getEmailVerificationToken();
  await user.save();

  try {
    await sendEmailVerificationEmail(
      user.email, user.firstName,
      `${process.env.FRONTEND_URL}/verify-email?token=${token}`
    );
  } catch (e) { /* non-fatal */ }

  res.status(200).json({ success: true, message: 'Verification email sent' });
});

/**
 * Verify 2FA code after login
 * POST /api/auth/verify-2fa
 */
const verifyTwoFactor = asyncHandler(async (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ success: false, message: 'userId and code are required' });

  const user = await User.findById(userId).select('+twoFactorCode +twoFactorExpires');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  // Verify 2FA code (compare SHA-256 hash)
  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  if (!user.twoFactorCode || user.twoFactorExpires < Date.now()) {
    return res.status(400).json({ success: false, message: '2FA code expired. Please login again.' });
  }

  if (user.twoFactorCode !== hashedCode) {
    await user.incFailedLogins();
    return res.status(401).json({ success: false, message: 'Invalid 2FA code' });
  }

  user.twoFactorCode = undefined;
  user.twoFactorExpires = undefined;
  await user.resetFailedLogins();

  const { ip, userAgent, deviceId } = getRequestMeta(req);
  await user.addLoginHistory({ ip, userAgent, deviceId, success: true });

  const jwtToken = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);
  res.status(200).json({ success: true, message: 'Login successful', token: jwtToken, refreshToken, user: formatUser(user) });
});

/**
 * Enable/disable 2FA
 * POST /api/auth/2fa/toggle
 */
const toggleTwoFactor = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.twoFactorEnabled = !user.twoFactorEnabled;
  await user.save();

  res.status(200).json({
    success: true,
    message: `Two-factor authentication ${user.twoFactorEnabled ? 'enabled' : 'disabled'}`,
    twoFactorEnabled: user.twoFactorEnabled,
  });
});

/**
 * Get login history
 * GET /api/auth/login-history
 */
const getLoginHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('loginHistory lastLoginAt lastLoginIp');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  res.status(200).json({ success: true, loginHistory: user.loginHistory });
});

/**
 * Get trusted devices
 * GET /api/auth/devices
 */
const getDevices = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('trustedDevices');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  res.status(200).json({ success: true, devices: user.trustedDevices });
});

/**
 * Add trusted device
 * POST /api/auth/devices
 */
const addDevice = asyncHandler(async (req, res) => {
  const { deviceId, deviceName } = req.body;
  if (!deviceId || !deviceName) {
    return res.status(400).json({ success: false, message: 'deviceId and deviceName are required' });
  }

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const { ip, userAgent } = getRequestMeta(req);
  const exists = user.trustedDevices.find((d) => d.deviceId === deviceId);
  if (!exists) {
    user.trustedDevices.push({ deviceId, deviceName, userAgent, ip });
    await user.save();
  }

  res.status(200).json({ success: true, message: 'Device added', devices: user.trustedDevices });
});

/**
 * Remove trusted device
 * DELETE /api/auth/devices/:deviceId
 */
const removeDevice = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.trustedDevices = user.trustedDevices.filter((d) => d.deviceId !== req.params.deviceId);
  await user.save();

  res.status(200).json({ success: true, message: 'Device removed', devices: user.trustedDevices });
});

/**
 * Send phone OTP — works from profile to verify current phone number
 * Optionally accepts a new phoneNumber to update before sending OTP
 * POST /api/auth/send-phone-otp
 */
const sendPhoneOtp = asyncHandler(async (req, res) => {
  const { phoneNumber } = req.body; // optional: update phone before sending OTP

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  // If a new phone number is provided, update it first
  if (phoneNumber && phoneNumber !== user.phoneNumber) {
    const existing = await User.findOne({ phoneNumber });
    if (existing && existing._id.toString() !== req.userId) {
      return res.status(400).json({ success: false, message: 'Phone number already in use by another account' });
    }
    user.phoneNumber = phoneNumber;
    user.isPhoneVerified = false;
    user.isVerified = false;
    await user.save();
  }

  if (user.isPhoneVerified && !phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is already verified' });
  }

  const otp = await user.generatePhoneOtp();

  // Send OTP via Twilio SMS
  try {
    await sendPhoneOtpSms(user.phoneNumber, otp);
  } catch (smsErr) {
    // Twilio errors carry a numeric `code` and `moreInfo` URL
    const twilioCode = smsErr.code;
    const twilioMsg = smsErr.message || 'Unknown SMS error';
    console.error(`[Twilio OTP error] Code: ${twilioCode} | ${twilioMsg}`);

    if (process.env.NODE_ENV !== 'development') {
      // Surface a user-friendly message for common Twilio error codes
      let userMsg = 'Failed to send OTP. Please try again.';
      if (twilioCode === 21211) userMsg = 'Invalid phone number. Please check and update your number.';
      else if (twilioCode === 21614) userMsg = 'Phone number is not SMS-capable.';
      else if (twilioCode === 21408) userMsg = 'SMS not permitted to this region.';
      return res.status(500).json({ success: false, message: userMsg });
    }
  }

  const responsePayload = {
    success: true,
    message: `OTP sent to ${user.phoneNumber}. Enter it to verify your number.`,
    phoneNumber: user.phoneNumber,
  };

  // Expose OTP in dev for easy testing
  if (process.env.NODE_ENV === 'development') responsePayload.otp = otp;

  res.status(200).json(responsePayload);
});

/**
 * Verify phone OTP — called from profile screen
 * POST /api/auth/verify-phone
 */
const verifyPhone = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  if (!otp) return res.status(400).json({ success: false, message: 'OTP is required' });

  const user = await User.findById(req.userId).select('+phoneOtp +phoneOtpExpires');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!user.phoneOtp || !user.phoneOtpExpires) {
    return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
  }

  if (!user.verifyPhoneOtp(otp)) {
    return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });
  }

  user.isPhoneVerified = true;
  // isVerified = true when either email or phone is verified
  user.isVerified = user.isEmailVerified || true;
  user.phoneOtp = undefined;
  user.phoneOtpExpires = undefined;
  await user.save();

  const token = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  res.status(200).json({
    success: true,
    message: 'Phone number verified successfully.',
    isPhoneVerified: true,
    isEmailVerified: user.isEmailVerified,
    token,
    refreshToken,
    user: formatUser(user),
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh-token
 */
const refreshAccessToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

  const { verifyRefreshToken, generateToken } = require('../config/jwt');
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive || user.isBlocked) {
    return res.status(401).json({ success: false, message: 'User not authorized' });
  }

  const newToken = generateToken(user._id, user.role);
  res.status(200).json({ success: true, token: newToken });
});

/**
 * Get admin contact list (for messaging support)
 * GET /api/auth/admin-contacts
 */
const getAdminContacts = asyncHandler(async (req, res) => {
  const admins = await User.find({ role: USER_ROLES.ADMIN })
    .select('_id firstName lastName profileImage role');
  res.status(200).json({ success: true, admins });
});

module.exports = {
  registerUser,
  registerServiceProvider,
  loginUser,
  loginWithPhone,
  loginUnified,
  getCurrentUser,
  updateProfile,
  uploadProfileImage,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  verifyTwoFactor,
  toggleTwoFactor,
  getLoginHistory,
  getDevices,
  addDevice,
  removeDevice,
  getAdminContacts,
  sendPhoneOtp,
  verifyPhone,
  refreshAccessToken,
};
