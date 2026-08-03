/**
 * User Model
 * Handles user data for both service providers and clients
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
    },

    // Verification Tokens
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
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
 * Generate email verification token
 * @returns {string} - Verification token
 */
userSchema.methods.getEmailVerificationToken = function () {
  const verificationToken = Math.random().toString(36).substring(2, 15);
  this.emailVerificationToken = verificationToken;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return verificationToken;
};

/**
 * Get user full name
 * @returns {string} - Full name
 */
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`;
};

/**
 * Remove sensitive data from user object
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  delete obj.accountNumber; // Hide bank details in API responses
  return obj;
};

module.exports = mongoose.model('User', userSchema);
