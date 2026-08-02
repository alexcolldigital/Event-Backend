/**
 * Booking Controller
 * Handles booking creation and management
 */

const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { asyncHandler } = require('../middleware/errorHandler');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');
const { sendBookingConfirmationEmail } = require('../utils/email');
const { isBookingWithinCoverage } = require('../utils/locationMatcher');

/**
 * Create new booking
 * POST /api/bookings
 */
const createBooking = asyncHandler(async (req, res) => {
  const {
    serviceId,
    venueId,
    eventId,
    eventDate,
    eventEndDate,
    eventTime,
    duration,
    numberOfGuests,
    specialRequirements,
    clientNotes,
    bookingLocation,
  } = req.body;

  if (!eventDate || (!serviceId && !venueId)) {
    return res.status(400).json({
      success: false,
      message: 'Event date and service or venue are required',
    });
  }

  // Get service or venue details
  let pricing = {};
  let serviceProvider = null;
  let bookingType = serviceId ? 'service' : 'venue';

  if (serviceId) {
    const Service = require('../models/Service');
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const serviceCoverage = service.coverageArea || {};
    if (!isBookingWithinCoverage(serviceCoverage, bookingLocation || {})) {
      return res.status(400).json({
        success: false,
        message: 'This service is not available for the selected location.',
      });
    }

    serviceProvider = service.provider;
    pricing = {
      basePrice: service.pricing.basePrice,
      quantity: numberOfGuests || 1,
      unitPrice: service.pricing.basePrice,
      subtotal: service.pricing.basePrice * (numberOfGuests || 1),
    };
  } else {
    const Venue = require('../models/Venue');
    const venue = await Venue.findById(venueId);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    serviceProvider = venue.owner;
    pricing = {
      basePrice: venue.rentalPrice.daily || venue.rentalPrice.hourly,
      quantity: duration || 1,
      unitPrice: venue.rentalPrice.daily || venue.rentalPrice.hourly,
      subtotal: (venue.rentalPrice.daily || venue.rentalPrice.hourly) * (duration || 1),
    };
  }

  // Calculate total with tax
  const tax = pricing.subtotal ? pricing.subtotal * 0.075 : 0; // 7.5% tax
  const totalAmount = pricing.subtotal + tax;

  let booking = new Booking({
    client: req.userId,
    serviceProvider,
    service: serviceId,
    venue: venueId,
    event: eventId,
    bookingType,
    eventDate,
    eventEndDate,
    eventTime,
    duration,
    numberOfGuests,
    specialRequirements,
    clientNotes,
    bookingLocation,
    pricing: {
      ...pricing,
      tax,
      totalAmount,
    },
    status: BOOKING_STATUS.PENDING,
  });

  await booking.save();
  booking = await booking.populate('client serviceProvider service venue');

  res.status(201).json({
    success: true,
    message: 'Booking created successfully',
    booking,
  });
});

/**
 * Get booking by ID
 * GET /api/bookings/:id
 */
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('client', 'firstName lastName email phoneNumber')
    .populate('serviceProvider', 'firstName lastName businessName')
    .populate('service')
    .populate('venue');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  // Check authorization
  if (
    booking.client.toString() !== req.userId &&
    booking.serviceProvider._id.toString() !== req.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this booking',
    });
  }

  res.status(200).json({
    success: true,
    booking,
  });
});

/**
 * Get my bookings (client)
 * GET /api/bookings/client/my-bookings
 */
const getMyClientBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  let query = { client: req.userId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(query)
    .populate('serviceProvider', 'firstName lastName businessName')
    .populate('service')
    .populate('venue')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Booking.countDocuments(query);

  res.status(200).json({
    success: true,
    bookings,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get my bookings (service provider)
 * GET /api/bookings/provider/my-bookings
 */
const getMyProviderBookings = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  let query = { serviceProvider: req.userId };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const bookings = await Booking.find(query)
    .populate('client', 'firstName lastName email')
    .populate('service')
    .populate('venue')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Booking.countDocuments(query);

  res.status(200).json({
    success: true,
    bookings,
    pagination: {
      current: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Confirm booking (provider)
 * PATCH /api/bookings/:id/confirm
 */
const confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  if (booking.serviceProvider.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to confirm this booking',
    });
  }

  if (booking.status !== BOOKING_STATUS.PENDING) {
    return res.status(400).json({
      success: false,
      message: 'Can only confirm pending bookings',
    });
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.confirmedDate = new Date();
  await booking.save();

  // Send confirmation email
  const User = require('../models/User');
  const client = await User.findById(booking.client);
  await sendBookingConfirmationEmail(client.email, {
    bookingNumber: booking.bookingNumber,
    eventDate: booking.eventDate,
    totalAmount: booking.pricing.totalAmount,
    status: booking.status,
  });

  res.status(200).json({
    success: true,
    message: 'Booking confirmed successfully',
    booking,
  });
});

/**
 * Cancel booking
 * PATCH /api/bookings/:id/cancel
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  if (
    booking.client.toString() !== req.userId &&
    booking.serviceProvider.toString() !== req.userId
  ) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this booking',
    });
  }

  if (booking.status === BOOKING_STATUS.CANCELLED) {
    return res.status(400).json({
      success: false,
      message: 'Booking is already cancelled',
    });
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledDate = new Date();
  booking.cancellationReason = reason;

  // Handle refund if payment was made
  if (booking.payment.status === PAYMENT_STATUS.COMPLETED) {
    booking.payment.refundStatus = 'pending';
  }

  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    booking,
  });
});

/**
 * Complete booking
 * PATCH /api/bookings/:id/complete
 */
const completeBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  if (booking.serviceProvider.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to mark this booking complete',
    });
  }

  booking.status = BOOKING_STATUS.COMPLETED;
  booking.completedDate = new Date();
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking marked as completed',
    booking,
  });
});

module.exports = {
  createBooking,
  getBookingById,
  getMyClientBookings,
  getMyProviderBookings,
  confirmBooking,
  cancelBooking,
  completeBooking,
};
