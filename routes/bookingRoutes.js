/**
 * Booking Routes
 * Handles all booking-related endpoints
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');

// Create new booking (private)
router.post('/', authenticate, bookingController.createBooking);

// Get my bookings as client (private)
router.get('/client/my-bookings', authenticate, bookingController.getMyClientBookings);

// Get my bookings as provider (private)
router.get('/provider/my-bookings', authenticate, bookingController.getMyProviderBookings);

// Get booking by ID (private)
router.get('/:id', authenticate, bookingController.getBookingById);

// Confirm booking (private - provider only)
router.patch('/:id/confirm', authenticate, bookingController.confirmBooking);

// Cancel booking (private)
router.patch('/:id/cancel', authenticate, bookingController.cancelBooking);

// Complete booking (private - provider only)
router.patch('/:id/complete', authenticate, bookingController.completeBooking);

module.exports = router;
