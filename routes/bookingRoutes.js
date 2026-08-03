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

// Checkout a cart of services (private)
router.post('/checkout', authenticate, bookingController.checkoutCart);

// Get my bookings as client (private)
router.get('/client/my-bookings', authenticate, bookingController.getMyClientBookings);

// Get my bookings as provider (private)
router.get('/provider/my-bookings', authenticate, bookingController.getMyProviderBookings);

// Get booking by ID (private)
router.get('/:id', authenticate, bookingController.getBookingById);

// Create payment session for booking (private)
router.post('/:id/payment-session', authenticate, bookingController.createBookingPaymentSession);

// Mark booking payment as successful and escrowed (private)
router.post('/:id/payment-success', authenticate, bookingController.markBookingPaymentSuccess);

// Release escrow funds to the provider (private - provider only)
router.patch('/:id/release-escrow', authenticate, bookingController.releaseEscrow);

// Reject booking (private - provider only)
router.patch('/:id/reject', authenticate, bookingController.rejectBooking);

// Raise a dispute on escrow funds (private)
router.patch('/:id/dispute-escrow', authenticate, bookingController.disputeEscrow);

// Confirm booking (private - provider only)
router.patch('/:id/confirm', authenticate, bookingController.confirmBooking);

// Cancel booking (private)
router.patch('/:id/cancel', authenticate, bookingController.cancelBooking);

// Complete booking (private - provider only)
router.patch('/:id/complete', authenticate, bookingController.completeBooking);

module.exports = router;
