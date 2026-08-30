/**
 * Service Routes
 * Handles all service-related endpoints
 */

const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticate, authorize } = require('../middleware/auth');
const { createUploadMiddleware } = require('../utils/fileUpload');

// Get public platform stats (public)
router.get('/stats', serviceController.getPublicStats);

// Get all available categories (public)
router.get('/categories/available', serviceController.getAvailableCategories);

// Get all services (public)
router.get('/', serviceController.getServices);

// Search services (public)
router.get('/search', serviceController.searchServices);

// Get my services (private - service provider only)
router.get('/provider/my-services', authenticate, authorize('service_provider'), serviceController.getMyServices);

// Create new service (private - service provider or admin)
router.post('/', authenticate, authorize('service_provider', 'admin'), serviceController.createService);

// Upload service media (private - service provider or admin)
router.post(
  '/:id/upload-media',
  authenticate,
  authorize('service_provider', 'admin'),
  createUploadMiddleware('services', 10),
  serviceController.uploadServiceMedia
);

// Get service by ID (public)
router.get('/:id', serviceController.getServiceById);

// Update service (private - service provider or admin)
router.put('/:id', authenticate, authorize('service_provider', 'admin'), serviceController.updateService);

// Delete service (private - service provider or admin)
router.delete('/:id', authenticate, authorize('service_provider', 'admin'), serviceController.deleteService);

// Toggle availability (private - service provider or admin)
router.patch(
  '/:id/toggle-availability',
  authenticate,
  authorize('service_provider', 'admin'),
  serviceController.toggleAvailability
);

module.exports = router;
