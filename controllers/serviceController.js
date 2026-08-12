/**
 * Service Controller
 * Handles service management for service providers
 */

const Service = require('../models/Service');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadToCloudinary } = require('../utils/fileUpload');

/**
 * Create new service
 * POST /api/services
 */
const createService = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    shortDescription,
    serviceType,
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
    fullDescription,
  } = req.body;

  if (!name || !description || !serviceType) {
    return res.status(400).json({
      success: false,
      message: 'Name, description, and service type are required',
    });
  }

  const isAdmin = req.user.role === 'admin';
  const providerId = isAdmin ? (req.body.provider || req.userId) : req.userId;
  const providerType = isAdmin ? (req.body.providerType || 'events_service_provider') : req.user.businessType;

  const service = new Service({
    name,
    description: fullDescription || description,
    shortDescription: shortDescription || description?.slice(0, 200),
    serviceType,
    category,
    subCategory,
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
  await service.populate('provider', 'firstName lastName businessName');

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

  let query = { isActive: true };

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
  const service = await Service.findById(req.params.id).populate(
    'provider',
    'firstName lastName businessName profileImage averageRating totalReviews'
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
  const services = await Service.find({ provider: req.userId })
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
  let service = await Service.findById(req.params.id);

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

  service = await Service.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

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
  const service = await Service.findById(req.params.id);

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

  await Service.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Service deleted successfully',
  });
});

/**
 * Search services
 * GET /api/services/search
 */
const searchServices = asyncHandler(async (req, res) => {
  const { keyword, category, state, lga, minPrice, maxPrice, page = 1, limit = 10 } =
    req.query;

  let query = { isActive: true };

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
  const service = await Service.findById(req.params.id);

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
  const service = await Service.findById(req.params.id);

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
        { $match: { isActive: true, totalReviews: { $gt: 0 } } },
        { $group: { _id: null, ratingSum: { $sum: { $multiply: ['$averageRating', '$totalReviews'] } }, total: { $sum: '$totalReviews' } } },
      ]),
      Service.aggregate([
        { $match: { isActive: true } },
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
};
