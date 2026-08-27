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
  sendPasswordResetCodeEmail,
} = require('../utils/email');
const { USER_ROLES } = require('../config/constants');

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

// Generate & send a 6-digit OTP to the user's email
const sendOtpToUser = async (user) => {
  if (!user || !user.email) return null;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.emailVerificationToken = crypto.createHash('sha256').update(otp).digest('hex');
  user.emailVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();
  try {
    await sendVerificationCodeEmail(user.email, user.firstName, otp);
  } catch (emailErr) {
    console.error('OTP email failed (non-fatal):', emailErr.message || emailErr);
  }
  return otp;
};

const sendVerificationEmailToUser = async (user) => {
  return sendOtpToUser(user);
};

// Generate & send a 6-digit OTP for password reset without touching email verification codes
const sendPasswordResetOtpToUser = async (user) => {
  if (!user || !user.email) return null;
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  user.passwordResetToken = crypto.createHash('sha256').update(otp).digest('hex');
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();
  try {
    await sendPasswordResetCodeEmail(user.email, user.firstName, otp);
  } catch (emailErr) {
    console.error('Password reset OTP email failed (non-fatal):', emailErr.message || emailErr);
  }
  return otp;
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
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    country,
    countryCode,
    dialCode,
    password,
    passwordConfirm,
    role,
  } = req.body;

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
    await sendOtpToUser(user);
    return res.status(403).json({
      success: false,
      message: 'Please verify your email before logging in.',
      requiresEmailVerification: true,
      userId: user._id,
    });
  }

  if (isNewDeviceLogin(user, deviceId)) {
    await sendOtpToUser(user);
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
 * Send OTP before changing password
 * POST /api/auth/send-change-password-otp
 */
const sendChangePasswordOtp = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  await sendOtpToUser(user);
  res.status(200).json({ success: true, message: 'A 6-digit code has been sent to your email' });
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
 * Request password reset — sends 6-digit OTP to email
 * POST /api/auth/forgot-password
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ success: false, message: 'Email or phone number is required' });
  }

  const isEmail = identifier.includes('@');
  const query = isEmail ? { email: identifier } : { phoneNumber: identifier };

  const user = await User.findOne(query);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  await sendOtpToUser(user);

  res.status(200).json({
    success: true,
    message: 'A 6-digit verification code has been sent to your email',
    email: user.email,
  });
});

/**
 * Verify OTP (for forgot password flow)
 * POST /api/auth/verify-otp
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and code are required' });

  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
  const user = await User.findOne({
    email,
    passwordResetToken: hashedOtp,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

  // Issue a short-lived reset token so the next step can reset the password
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 min
  await user.save();

  res.status(200).json({ success: true, message: 'Code verified', resetToken });
});

/**
 * Reset password with OTP-verified token
 * POST /api/auth/reset-password
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.status(200).json({ success: true, message: 'Password reset successfully' });
});

/**
 * Verify email OTP (6-digit code)
 * POST /api/auth/verify-email
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token, otp, deviceId, deviceName } = req.body;
  const code = otp || token;
  const requestDeviceId = deviceId || req.headers['x-device-id'];
  const requestDeviceName = deviceName || req.headers['x-device-name'] || 'Verified Device';

  if (!code) return res.status(400).json({ success: false, message: 'Verification code is required' });

  const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
  const user = await User.findOne({
    emailVerificationToken: hashedCode,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired code' });

  user.isEmailVerified = true;
  user.isPhoneVerified = true; // Auto-verify phone when email is verified
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
 * Resend email OTP
 * POST /api/auth/resend-verification
 */
const resendVerification = asyncHandler(async (req, res) => {
  let user;
  if (req.userId) {
    user = await User.findById(req.userId);
  } else if (req.body.email) {
    user = await User.findOne({ email: req.body.email });
  } else if (req.body.userId) {
    user = await User.findById(req.body.userId);
  }
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.isEmailVerified) return res.status(400).json({ success: false, message: 'Email already verified' });

  await sendOtpToUser(user);
  res.status(200).json({ success: true, message: 'Verification code sent to your email' });
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
  verifyOtp,
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
  refreshAccessToken,
  sendChangePasswordOtp,
};
