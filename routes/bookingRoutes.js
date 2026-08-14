/**
 * Booking Routes
 * Handles all booking-related endpoints
 */

const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');

// Paystack webhook (raw body)
router.post('/webhook/paystack', bookingController.handlePaystackWebhookRaw);

// Flutterwave webhook
router.post('/webhook/flutterwave', bookingController.handleFlutterwaveWebhook);

// Check availability (public)
router.get('/availability', bookingController.checkAvailability);

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

// Mark booking payment as successful (private)
router.post('/:id/payment-success', authenticate, bookingController.markBookingPaymentSuccess);

// Confirm booking (private - provider only)
router.patch('/:id/confirm', authenticate, bookingController.confirmBooking);

// Reject booking (private - provider only)
router.patch('/:id/reject', authenticate, bookingController.rejectBooking);

// Cancel booking (private)
router.patch('/:id/cancel', authenticate, bookingController.cancelBooking);

// Complete booking (private - provider only)
router.patch('/:id/complete', authenticate, bookingController.completeBooking);

// Reschedule booking
router.patch('/:id/reschedule', authenticate, bookingController.requestReschedule);
router.patch('/:id/reschedule/respond', authenticate, bookingController.respondReschedule);

// Refund request
router.patch('/:id/refund', authenticate, bookingController.requestRefund);
router.patch('/:id/refund/respond', authenticate, bookingController.respondRefund);

// Pay balance (split/deposit plans)
router.patch('/:id/pay-balance', authenticate, bookingController.payBalance);

module.exports = router;
