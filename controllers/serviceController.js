/**
 * Service Controller
 * Handles service management for service providers
 */

const Service = require('../models/Service');
const Category = require('../models/Category');
const mongoose = require('mongoose');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../utils/fileUpload');
const { sendServiceAddedEmail, sendServiceUpdatedEmail } = require('../utils/email');
const push = require('../utils/pushNotification');
const inApp = require('../utils/inAppNotification');

/**
 * Create new service
 * POST /api/services
 */
const createService = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    category,
    subCategory,
    pricing,
    availability,
    coverageArea,
    packages,
    images,
    media,
    inventory,
    quantity,
    serviceType,
  } = req.body;

  if (!name || !description) {
    return res.status(400).json({
      success: false,
      message: 'Name and description are required',
    });
  }

  const normalizedServiceType = serviceType || 'Professional Service';

  // Validate category and subcategory
  try {
    const validatedCategory = await validateCategory(category, subCategory);
    var categoryData = validatedCategory;
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const isAdmin = req.user.role === 'admin';
  const providerId = isAdmin ? (req.body.provider || req.userId) : req.userId;
  const providerType = isAdmin ? (req.body.providerType || 'events_service_provider') : req.user.businessType;

  const service = new Service({
    name,
    description,
    shortDescription: description?.slice(0, 200),
    serviceType: normalizedServiceType,
    category: categoryData.category,
    subCategory: categoryData.subCategory,
    provider: providerId,
    providerType,
    pricing: {
      basePrice: pricing?.basePrice || 0,
      unit: pricing?.unit || 'fixed',
      currency: 'NGN',
      ...pricing,
    },
    availability: {
      isAvailable: true,
      ...availability,
    },
    coverageArea: coverageArea || {},
    packages,
    images: images || (media?.coverImage ? [{ url: media.coverImage, isMain: true }] : []),
    media,
    inventory,
    quantity,
  });

  await service.save();
  await service.populate('provider', 'firstName lastName businessName email');

  // Notify provider by email (non-blocking)
  try {
    const prov = service.provider;
    if (prov && prov.email) {
      await sendServiceAddedEmail(prov.email, {
        firstName: prov.firstName,
        serviceName: service.name,
        serviceType: service.serviceType,
        category: service.category,
        basePrice: service.pricing?.basePrice,
        serviceId: service._id,
      });
    }
  } catch (_) {}

  res.status(201).json({
    success: true,
    message: 'Service created successfully',
    service,
  });
});

/**
 * Get all services
 * GET /api/services
 */
const getServices = asyncHandler(async (req, res) => {
  const { category, minPrice, maxPrice, rating, state, page = 1, limit = 10 } = req.query;

  let query = { isActive: true, isDeleted: { $ne: true } };

  if (category) query.category = category;
  if (minPrice || maxPrice) {
    query['pricing.basePrice'] = {};
    if (minPrice) query['pricing.basePrice'].$gte = minPrice;
    if (maxPrice) query['pricing.basePrice'].$lte = maxPrice;
  }
  if (rating) query.averageRating = { $gte: rating };
  if (state) query['coverageArea.states'] = state;

  const skip = (page - 1) * limit;

  const services = await Service.find(query)
    .populate('provider', 'firstName lastName businessName profileImage')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Service.countDocuments(query);

  res.status(200).json({
    success: true,
    services,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get service by ID
 * GET /api/services/:id
 */
const getServiceById = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } }).populate(
    'provider',
    'firstName lastName businessName email phoneNumber role profileImage averageRating totalReviews'
  );

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  res.status(200).json({
    success: true,
    service,
  });
});

/**
 * Get my services (provider)
 * GET /api/services/provider/my-services
 */
const getMyServices = asyncHandler(async (req, res) => {
  const services = await Service.find({ provider: req.userId, isDeleted: { $ne: true } })
    .populate('provider', 'firstName lastName businessName')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    services,
  });
});

/**
 * Update service
 * PUT /api/services/:id
 */
const updateService = asyncHandler(async (req, res) => {
  let service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  // Check if user is the provider or admin
  if (req.user.role !== 'admin' && service.provider.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this service',
    });
  }

  // Validate category and subcategory if they are being updated
  if (req.body.category || req.body.subCategory) {
    try {
      const categoryToValidate = req.body.category || service.category;
      const subCategoryToValidate = req.body.subCategory || service.subCategory;
      const validatedCategory = await validateCategory(categoryToValidate, subCategoryToValidate);
      req.body.category = validatedCategory.category;
      req.body.subCategory = validatedCategory.subCategory;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  service = await Service.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Notify provider on update
  try {
    await service.populate('provider', 'firstName lastName businessName email fcmToken preferences');
    const prov = service.provider;
    if (prov) {
      push.notifyServiceUpdated(prov, service.name);
      await inApp.create(prov._id, { title: 'Service Updated ✅', message: `Your service "${service.name}" has been updated successfully.`, notifType: 'service_updated', relatedId: service._id });
      if (prov.email) {
        await sendServiceUpdatedEmail(prov.email, { firstName: prov.firstName, serviceName: service.name, serviceId: service._id });
      }
    }
  } catch (_) {}

  res.status(200).json({
    success: true,
    message: 'Service updated successfully',
    service,
  });
});

/**
 * Delete service
 * DELETE /api/services/:id
 */
const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  // Check if user is the provider or admin
  if (req.user.role !== 'admin' && service.provider.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to delete this service',
    });
  }

  service.isDeleted = true;
  service.deletedAt = new Date();
  service.isActive = false;
  service.isFeatured = false;
  service.availability = {
    ...(service.availability?.toObject ? service.availability.toObject() : service.availability || {}),
    isAvailable: false,
  };
  await service.save();

  res.status(200).json({
    success: true,
    message: 'Service removed from listings successfully',
  });
});

/**
 * Search services
 * GET /api/services/search
 */
const searchServices = asyncHandler(async (req, res) => {
  const { keyword, category, state, lga, minPrice, maxPrice, page = 1, limit = 10 } =
    req.query;

  let query = { isActive: true, isDeleted: { $ne: true } };

  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: 'i' } },
      { description: { $regex: keyword, $options: 'i' } },
      { serviceType: { $regex: keyword, $options: 'i' } },
    ];
  }

  if (category) query.category = category;
  if (minPrice || maxPrice) {
    query['pricing.basePrice'] = {};
    if (minPrice) query['pricing.basePrice'].$gte = minPrice;
    if (maxPrice) query['pricing.basePrice'].$lte = maxPrice;
  }
  if (state) query['coverageArea.states'] = state;
  if (lga) query['coverageArea.lgas'] = lga;

  const skip = (page - 1) * limit;

  const services = await Service.find(query)
    .populate('provider', 'firstName lastName businessName profileImage')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ averageRating: -1 });

  const total = await Service.countDocuments(query);

  res.status(200).json({
    success: true,
    services,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Toggle service availability
 * PATCH /api/services/:id/toggle-availability
 */
const toggleAvailability = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({
      success: false,
      message: 'Service not found',
    });
  }

  if (req.user.role !== 'admin' && service.provider.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized',
    });
  }

  service.availability.isAvailable = !service.availability.isAvailable;
  await service.save();

  res.status(200).json({
    success: true,
    message: 'Availability updated',
    service,
  });
});

const uploadServiceMedia = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, isDeleted: { $ne: true } });

  if (!service) {
    return res.status(404).json({ success: false, message: 'Service not found' });
  }

  if (req.user.role !== 'admin' && service.provider.toString() !== req.userId) {
    return res.status(403).json({ success: false, message: 'Not authorized to upload media for this service' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one image is required' });
  }

  const uploadedImages = [];
  for (const file of req.files) {
    const uploaded = await uploadToCloudinary(file, 'services');
    uploadedImages.push({ url: uploaded.url, publicId: uploaded.publicId, isMain: false });
  }

  service.images = [...(service.images || []), ...uploadedImages];
  if (!service.media) service.media = {};
  service.media.galleryImages = [...(service.media.galleryImages || []), ...uploadedImages.map((image) => image.url)];
  await service.save();

  res.status(200).json({ success: true, message: 'Media uploaded successfully', images: uploadedImages });
});

/**
 * Get public platform stats + category counts
 * GET /api/services/stats
 */
const getPublicStats = asyncHandler(async (req, res) => {
  const User = require('../models/User');
  const Booking = require('../models/Booking');

  const [completedBookings, verifiedVendors, totalClients, ratingAgg, categoryCounts] =
    await Promise.all([
      Booking.countDocuments({ status: 'completed' }),
      User.countDocuments({ role: 'service_provider', isBusinessVerified: true }),
      User.countDocuments({ role: 'client' }),
      Service.aggregate([
        { $match: { isActive: true, isDeleted: { $ne: true }, totalReviews: { $gt: 0 } } },
        { $group: { _id: null, ratingSum: { $sum: { $multiply: ['$averageRating', '$totalReviews'] } }, total: { $sum: '$totalReviews' } } },
      ]),
      Service.aggregate([
        { $match: { isActive: true, isDeleted: { $ne: true } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
    ]);

  const categoryCountMap = {};
  categoryCounts.forEach((c) => { if (c._id) categoryCountMap[c._id] = c.count; });

  const averageRating = ratingAgg[0]?.total > 0
    ? (ratingAgg[0].ratingSum / ratingAgg[0].total).toFixed(1)
    : '0.0';

  res.status(200).json({
    success: true,
    stats: { completedBookings, verifiedVendors, totalClients, averageRating },
    categoryCountMap,
  });
});

/**
 * Get all available categories with subcategories
 * GET /api/services/categories/available
 * Public endpoint - returns active categories that can be used in forms
 */
const getAvailableCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true })
    .select('_id name slug description icon parentCategory')
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  // Get parent categories
  const parentCategories = categories.filter(cat => !cat.parentCategory);

  // Get subcategories for each parent
  const categoriesWithSubcategories = parentCategories.map(parent => ({
    ...parent,
    subcategories: categories.filter(cat => cat.parentCategory?.toString() === parent._id.toString()),
  }));

  res.status(200).json({
    success: true,
    categories: categoriesWithSubcategories,
    total: categories.length,
  });
});

/**
 * Validate if a category exists and is active
 * Helper function - validates category/subcategory
 */
const validateCategory = async (category, subCategory) => {
  if (!category) {
    throw new Error('Category is required');
  }

  // Check if category exists and is active
  const categoryFilters = [
    { name: category, isActive: true },
    { slug: category, isActive: true },
  ];
  if (mongoose.Types.ObjectId.isValid(category)) {
    categoryFilters.push({ _id: category, isActive: true });
  }

  const categoryDoc = await Category.findOne({ $or: categoryFilters });

  if (!categoryDoc) {
    throw new Error(`Category "${category}" does not exist or is not available. Please select from available categories.`);
  }

  // If subcategory is provided, validate it exists as a child of the parent
  if (subCategory) {
    const subCategoryFilters = [
      { name: subCategory, parentCategory: categoryDoc._id, isActive: true },
      { slug: subCategory, parentCategory: categoryDoc._id, isActive: true },
    ];
    if (mongoose.Types.ObjectId.isValid(subCategory)) {
      subCategoryFilters.push({ _id: subCategory, parentCategory: categoryDoc._id, isActive: true });
    }

    const subCategoryDoc = await Category.findOne({ $or: subCategoryFilters });

    if (!subCategoryDoc) {
      throw new Error(`Subcategory "${subCategory}" is not valid for the selected category. Please select from available options.`);
    }

    return { categoryId: categoryDoc._id, category: categoryDoc.name, subCategoryId: subCategoryDoc._id, subCategory: subCategoryDoc.name };
  }

  return { categoryId: categoryDoc._id, category: categoryDoc.name, subCategory: null };
};

module.exports = {
  createService,
  getServices,
  getServiceById,
  getMyServices,
  updateService,
  deleteService,
  searchServices,
  toggleAvailability,
  uploadServiceMedia,
  getPublicStats,
  getAvailableCategories,
  validateCategory,
};
