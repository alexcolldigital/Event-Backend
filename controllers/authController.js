/**
 * Authentication Controller
 * Handles user registration, login, and auth-related operations
 */

const User = require('../models/User');
const { generateToken } = require('../config/jwt');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
} = require('../utils/email');
const { USER_ROLES } = require('../config/constants');

/**
 * Register new user
 * POST /api/auth/register
 */
const registerUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password, passwordConfirm, role } =
    req.body;

  // Validate input
  if (!firstName || !lastName || !email || !phoneNumber || !password) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required',
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

  // Validate password confirmation
  if (password !== passwordConfirm) {
    return res.status(400).json({
      success: false,
      message: 'Passwords do not match',
    });
  }

  // Create new user
  const user = new User({
    firstName,
    lastName,
    email,
    phoneNumber,
    password,
    role: role || USER_ROLES.CLIENT,
  });

  await user.save();

  // Generate token
  const token = generateToken(user._id, user.role);

  // Send welcome email
  await sendWelcomeEmail(
    email,
    firstName,
    `${process.env.FRONTEND_URL}/verify-email?token=${token}`
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
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
    password,
    role: USER_ROLES.SERVICE_PROVIDER,
    businessName,
    businessType,
    businessDescription,
    address,
  });

  await user.save();

  // Generate token
  const token = generateToken(user._id, user.role);

  res.status(201).json({
    success: true,
    message: 'Service provider registered successfully',
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      businessName: user.businessName,
    },
  });
});

/**
 * Login user
 * POST /api/auth/login
 */
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required',
    });
  }

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Check if account is active
  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Account is inactive',
    });
  }

  // Check if account is blocked
  if (user.isBlocked) {
    return res.status(403).json({
      success: false,
      message: `Account is blocked. Reason: ${user.blockReason}`,
    });
  }

  // Compare passwords
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Generate token
  const token = generateToken(user._id, user.role);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      businessName: user.businessName,
      averageRating: user.averageRating,
      totalBookings: user.totalBookings,
      completedBookings: user.completedBookings,
      profileImage: user.profileImage,
    },
  });
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
  }

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
  if (bio !== undefined) user.bio = bio;
  if (address !== undefined) user.address = address;
  if (businessName !== undefined) user.businessName = businessName;
  if (businessDescription !== undefined) user.businessDescription = businessDescription;
  if (preferences !== undefined && typeof preferences === 'object') {
    user.preferences = {
      ...user.preferences,
      ...preferences,
    };
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user,
  });
});

/**
 * Change password
 * POST /api/auth/change-password
 */
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
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found',
    });
  }

  // Generate reset token
  const resetToken = user.getEmailVerificationToken();
  await user.save();

  // Send email
  await sendPasswordResetEmail(email, `${process.env.FRONTEND_URL}/reset-password/${resetToken}`);

  res.status(200).json({
    success: true,
    message: 'Password reset link sent to email',
  });
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

  const user = await User.findOne({
    emailVerificationToken: token,
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

module.exports = {
  registerUser,
  registerServiceProvider,
  loginUser,
  getCurrentUser,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};
