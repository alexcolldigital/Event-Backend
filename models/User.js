/**
 * User Model
 * Handles user data for both service providers and clients
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { USER_ROLES, SERVICE_PROVIDER_TYPES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },
    country: {
      type: String,
      default: 'Nigeria',
      trim: true,
    },
    countryCode: {
      type: String,
      default: 'NG',
      trim: true,
    },
    dialCode: {
      type: String,
      default: '+234',
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default
    },

    // Role & Permissions
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.CLIENT,
    },

    // Service Provider Information
    businessName: {
      type: String,
      trim: true,
    },
    businessType: {
      type: String,
      enum: SERVICE_PROVIDER_TYPES,
    },
    businessDescription: {
      type: String,
    },
    businessRegistration: {
      type: String, // RC number or registration details
    },
    yearsInBusiness: {
      type: Number,
    },

    // Profile
    profileImage: {
      url: String,
      publicId: String, // Cloudinary public ID
    },
    businessImage: {
      url: String,
      publicId: String,
    },
    bio: {
      type: String,
    },

    // Contact & Location
    address: {
      street: String,
      city: String,
      state: String,
      lga: String, // Local Government Area
      community: String,
      postalCode: String,
    },

    // Service Provider Specific
    services: [
      {
        serviceId: mongoose.Schema.Types.ObjectId,
        serviceName: String,
        description: String,
        price: Number,
        images: [String],
      },
    ],
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
    completedBookings: {
      type: Number,
      default: 0,
    },

    // Verification
    isVerified: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    isBusinessVerified: {
      type: Boolean,
      default: false,
    },
    trustScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    badges: [String],
    securityDeposit: {
      amount: {
        type: Number,
        default: 0,
      },
      paidAt: Date,
      refundable: {
        type: Boolean,
        default: true,
      },
    },
    verificationDocuments: [
      {
        documentType: String, // 'business_license', 'id', 'tax_id'
        documentUrl: String,
        publicId: String,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending',
        },
      },
    ],

    // Banking Information (for payments)
    bankName: String,
    accountNumber: String,
    accountHolderName: String,
    bankCode: String,

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockReason: String,
    strikeCount: {
      type: Number,
      default: 0,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    suspensionReason: String,
    suspendedAt: Date,

    // Preferences
    preferences: {
      newsletters: {
        type: Boolean,
        default: true,
      },
      notifications: {
        type: Boolean,
        default: true,
      },
      language: {
        type: String,
        default: 'en',
      },
      pushPrefs: {
        type: mongoose.Schema.Types.Mixed,
        default: {
          bookingUpdates: true,
          paymentConfirmation: true,
          bookingReminder: true,
          cancellationAlert: true,
          promotional: true,
          newMessage: true,
        },
      },
    },

    // Phone OTP Verification
    phoneOtp: { type: String, select: false },
    phoneOtpExpires: { type: Date, select: false },

    // Verification Tokens (stored as SHA-256 hashes)
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Two-Factor Authentication
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorCode: { type: String, select: false },
    twoFactorExpires: { type: Date, select: false },

    // Login Security
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },

    // Login History (last 20 entries)
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        deviceId: String,
        success: Boolean,
        timestamp: { type: Date, default: Date.now },
        location: String,
      },
    ],

    // FCM Push Token
    fcmToken: { type: String, default: null },

    // Trusted Devices
    trustedDevices: [
      {
        deviceId: String,
        deviceName: String,
        userAgent: String,
        ip: String,
        addedAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

/**
 * Hash password before saving
 */
userSchema.pre('save', async function () {
  // Only hash if password is new or modified
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare password method
 * @param {string} enteredPassword - Password to compare
 * @returns {Promise<boolean>} - True if password matches
 */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Generate cryptographically secure email verification token
 * Stores SHA-256 hash in DB, returns raw token to send via email
 */
userSchema.methods.getEmailVerificationToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return rawToken;
};

/**
 * Generate cryptographically secure password reset token
 */
userSchema.methods.getPasswordResetToken = function () {
  const rawToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return rawToken;
};

/**
 * Generate 6-digit phone OTP
 */
userSchema.methods.generatePhoneOtp = async function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.phoneOtp = crypto.createHash('sha256').update(otp).digest('hex');
  this.phoneOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await this.save();
  return otp;
};

/**
 * Verify phone OTP
 */
userSchema.methods.verifyPhoneOtp = function (otp) {
  const hashed = crypto.createHash('sha256').update(otp).digest('hex');
  return this.phoneOtp === hashed && this.phoneOtpExpires > Date.now();
};

/**
 * Get user full name
 * @returns {string} - Full name
 */
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`;
};

/**
 * Check if account is locked
 */
userSchema.virtual('isLocked').get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

/**
 * Increment failed login attempts, lock after 5
 */
userSchema.methods.incFailedLogins = async function () {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
  }
  await this.save();
};

/**
 * Reset failed login attempts on successful login
 */
userSchema.methods.resetFailedLogins = async function () {
  this.failedLoginAttempts = 0;
  this.lockUntil = undefined;
  await this.save();
};

/**
 * Add login history entry (keep last 20)
 */
userSchema.methods.addLoginHistory = async function (entry) {
  this.loginHistory.unshift(entry);
  if (this.loginHistory.length > 20) this.loginHistory = this.loginHistory.slice(0, 20);
  if (entry.success) {
    this.lastLoginAt = entry.timestamp || new Date();
    this.lastLoginIp = entry.ip;
  }
  await this.save();
};

/**
 * Generate 6-digit 2FA code (stored as SHA-256 hash)
 */
userSchema.methods.generateTwoFactorCode = async function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.twoFactorCode = crypto.createHash('sha256').update(code).digest('hex');
  this.twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000);
  await this.save();
  return code;
};

/**
 * Remove sensitive data from user object
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.twoFactorCode;
  delete obj.twoFactorSecret;
  delete obj.phoneOtp;
  delete obj.phoneOtpExpires;
  delete obj.accountNumber;
  delete obj.bankCode;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
