/**
 * Service Routes
 * Handles all service-related endpoints
 */

const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { authenticate, isServiceProvider } = require('../middleware/auth');
const { createUploadMiddleware } = require('../utils/fileUpload');

// Get all services (public)
router.get('/', serviceController.getServices);

// Search services (public)
router.get('/search', serviceController.searchServices);

// Get my services (private - service provider only)
router.get('/provider/my-services', authenticate, isServiceProvider, serviceController.getMyServices);

// Create new service (private - service provider only)
router.post('/', authenticate, isServiceProvider, serviceController.createService);

// Upload service media (private - service provider only)
router.post(
  '/:id/upload-media',
  authenticate,
  isServiceProvider,
  createUploadMiddleware('services', 10),
  serviceController.uploadServiceMedia
);

// Get service by ID (public)
router.get('/:id', serviceController.getServiceById);

// Update service (private - service provider only)
router.put('/:id', authenticate, isServiceProvider, serviceController.updateService);

// Delete service (private - service provider only)
router.delete('/:id', authenticate, isServiceProvider, serviceController.deleteService);

// Toggle availability (private - service provider only)
router.patch(
  '/:id/toggle-availability',
  authenticate,
  isServiceProvider,
  serviceController.toggleAvailability
);

module.exports = router;
