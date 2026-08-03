/**
 * Booking Controller
 * Handles booking creation and management
 */

const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Payout = require('../models/Payout');
const { asyncHandler } = require('../middleware/errorHandler');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');
const { sendBookingConfirmationEmail } = require('../utils/email');
const { isBookingWithinCoverage } = require('../utils/locationMatcher');
const { buildCartCheckoutPayloads } = require('../utils/cartCheckout');
const { buildCheckoutSessionPayload, refundPayment } = require('../utils/payment');
const { initializeEscrowCheckout } = require('../utils/gatewayFallback');
const { normalizeEscrowOptions, getEscrowRefundDecision, releaseEscrowFunds, markEscrowDisputed } = require('../utils/escrow');
const { getEscrowConfig } = require('../utils/platformSettings');

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
    escrow: escrowInput,
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

  const bookingNumber = `EC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const escrowConfig = await getEscrowConfig();
  const escrow = normalizeEscrowOptions({
    ...escrowInput,
    enabled: true,
  });

  const vendorAcceptDeadline = new Date(Date.now() + escrowConfig.escrowVendorAcceptWindowHours * 60 * 60 * 1000);

  let booking = new Booking({
    bookingNumber,
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
    escrow: {
      ...escrow,
      status: 'held',
      releaseStatus: 'held',
      vendorAcceptDeadline,
    },
    status: BOOKING_STATUS.PENDING,
  });

  await booking.save();
  booking = await booking.populate('client serviceProvider service venue');

  const origin =
    req.body.origin ||
    process.env.EXPO_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get('host')}`;

  const checkoutOptions = await initializeEscrowCheckout({
    amount: booking.pricing.totalAmount,
    email: req.user.email || req.user?.email,
    metadata: {
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
    },
    callbackUrl: `${origin}/payment-result?bookingId=${booking._id}`,
  });

  booking.payment.method = checkoutOptions.gateway;
  booking.payment.transactionId = checkoutOptions.transactionReference;
  await booking.save();

  res.status(201).json({
    success: true,
    message: 'Booking created successfully',
    booking: {
      ...booking.toObject(),
      escrow: booking.escrow,
      checkoutUrl: checkoutOptions.checkoutUrl,
    },
  });
});

/**
 * Create multiple bookings from a cart checkout payload
 * POST /api/bookings/checkout
 */
const checkoutCart = asyncHandler(async (req, res) => {
  const { cartItems = [], bookingDetails = {} } = req.body;

  const payloads = buildCartCheckoutPayloads({
    userId: req.userId,
    bookingDetails,
    cartItems,
  });

  const createdBookings = [];

  for (const payload of payloads) {
    const { serviceId, venueId, eventId, eventDate, eventEndDate, eventTime, duration, numberOfGuests, specialRequirements, clientNotes, bookingLocation, escrow: escrowInput } = payload;

    if (!eventDate || (!serviceId && !venueId)) {
      continue;
    }

    let pricing = {};
    let serviceProvider = null;
    let bookingType = serviceId ? 'service' : 'venue';

    if (serviceId) {
      const Service = require('../models/Service');
      const service = await Service.findById(serviceId);
      if (!service) {
        continue;
      }

      const serviceCoverage = service.coverageArea || {};
      if (!isBookingWithinCoverage(serviceCoverage, bookingLocation || {})) {
        continue;
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
        continue;
      }
      serviceProvider = venue.owner;
      pricing = {
        basePrice: venue.rentalPrice.daily || venue.rentalPrice.hourly,
        quantity: duration || 1,
        unitPrice: venue.rentalPrice.daily || venue.rentalPrice.hourly,
        subtotal: (venue.rentalPrice.daily || venue.rentalPrice.hourly) * (duration || 1),
      };
    }

    const tax = pricing.subtotal ? pricing.subtotal * 0.075 : 0;
    const totalAmount = pricing.subtotal + tax;

    const bookingNumber = `EC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const escrow = normalizeEscrowOptions(escrowInput);

    const booking = new Booking({
      bookingNumber,
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
      escrow,
      status: BOOKING_STATUS.PENDING,
    });

    await booking.save();
    createdBookings.push(await booking.populate('client serviceProvider service venue'));
  }

  res.status(201).json({
    success: true,
    message: createdBookings.length > 0 ? 'Cart checked out successfully' : 'No bookings were created',
    bookings: createdBookings.map((booking) => ({
      ...booking.toObject(),
      escrow: booking.escrow,
    })),
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
  const clientId = booking.client?._id?.toString() || booking.client?.toString();
  const serviceProviderId = booking.serviceProvider?._id?.toString() || booking.serviceProvider?.toString();
  const serviceOwnerId = booking.service?.provider?._id?.toString() || booking.service?.provider?.toString();
  const venueOwnerId = booking.venue?.owner?._id?.toString() || booking.venue?.owner?.toString();

  const isClientOwner = clientId === req.userId;
  const isServiceProviderOwner =
    serviceProviderId === req.userId ||
    serviceOwnerId === req.userId ||
    venueOwnerId === req.userId;

  if (!isClientOwner && !isServiceProviderOwner && req.user.role !== 'admin') {
    // Debugging: log mismatch details to help trace 403 failures
    console.warn('Authorization failed for getBookingById', {
      reqUserId: req.userId,
      reqUserRole: req.user?.role,
      bookingId: booking._id?.toString(),
      clientId,
      serviceProviderId,
      serviceOwnerId,
      venueOwnerId,
    });

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
 * Create payment session for a booking
 * POST /api/bookings/:id/payment-session
 */
const createBookingPaymentSession = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('service')
    .populate('venue');

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  if (booking.client.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to pay for this booking',
    });
  }

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED) {
    return res.status(400).json({
      success: false,
      message: 'Booking payment is already completed',
    });
  }

  if (booking.status === BOOKING_STATUS.PENDING && booking.escrow?.status !== 'held') {
    return res.status(400).json({
      success: false,
      message: 'Booking must be confirmed by the service provider before payment can be made',
    });
  }

  if (booking.status === BOOKING_STATUS.CANCELLED) {
    return res.status(400).json({
      success: false,
      message: 'Cannot pay for a cancelled booking',
    });
  }

  if (booking.payment.status === PAYMENT_STATUS.PENDING && booking.escrow?.releaseStatus === 'disputed') {
    return res.status(400).json({
      success: false,
      message: 'Cannot create payment session for bookings with disputed escrow',
    });
  }

  const origin =
    req.body.origin ||
    process.env.EXPO_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get('host')}`;

  const sessionPayload = buildCheckoutSessionPayload({ booking, origin });

  try {
    const session = await require('stripe')(process.env.STRIPE_SECRET_KEY).checkout.sessions.create(
      sessionPayload
    );

    booking.payment.method = 'stripe';
    booking.payment.transactionId = session.id;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment session created successfully',
      session,
      booking,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment session. Please try again later.',
      error: error.message,
    });
  }
});

/**
 * Mark a booking payment as successful and place it in escrow
 * POST /api/bookings/:id/payment-success
 */
const markBookingPaymentSuccess = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found',
    });
  }

  if (booking.client.toString() !== req.userId) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to finalize this payment',
    });
  }

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED) {
    return res.status(200).json({
      success: true,
      message: 'Booking payment already completed',
      booking,
    });
  }

  booking.payment.status = PAYMENT_STATUS.COMPLETED;
  booking.payment.paymentDate = new Date();
  booking.payment.method = booking.payment.method || 'stripe';
  booking.escrow.enabled = booking.escrow?.enabled ?? true;
  booking.escrow.status = booking.escrow?.enabled ? 'held' : 'inactive';
  booking.escrow.releaseStatus = booking.escrow?.enabled ? 'held' : 'pending';
  booking.escrow.holdAmount = booking.pricing?.totalAmount || 0;
  booking.escrow.holdDate = new Date();
  booking.escrow.vendorAcceptDeadline =
    booking.escrow.vendorAcceptDeadline ||
    new Date(Date.now() + (await getEscrowConfig()).escrowVendorAcceptWindowHours * 60 * 60 * 1000);
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking payment secured in escrow',
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
 * Confirm booking (provider accept)
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

  const escrowConfig = await getEscrowConfig();
  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.confirmedDate = new Date();
  booking.escrow.autoReleaseAt = new Date(
    new Date(booking.eventDate).getTime() + escrowConfig.escrowAutoReleaseWindowHours * 60 * 60 * 1000
  );
  booking.escrow.releaseStatus = booking.escrow?.releaseStatus || 'held';
  booking.escrow.status = booking.escrow?.enabled ? 'held' : 'inactive';

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
 * Reject booking (provider)
 * PATCH /api/bookings/:id/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
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
      message: 'Not authorized to reject this booking',
    });
  }

  if (booking.status !== BOOKING_STATUS.PENDING) {
    return res.status(400).json({
      success: false,
      message: 'Can only reject pending bookings',
    });
  }

  const { reason } = req.body;
  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledDate = new Date();
  booking.cancellationReason = reason || 'Vendor rejected the booking';
  booking.escrow.status = 'inactive';
  booking.escrow.releaseStatus = 'pending';
  booking.escrow.refundPolicy = 'Full refund due to vendor rejection';

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.escrow?.enabled) {
    booking.payment.refundStatus = 'pending';
    booking.payment.refundAmount = booking.pricing?.totalAmount || 0;
  }

  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking rejected and set for refund',
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

  // Handle escrow refund if payment was made and escrow is active
  if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.escrow?.enabled) {
    const refundDecision = getEscrowRefundDecision({
      amount: booking.pricing?.totalAmount || 0,
      eventDate: booking.eventDate,
      cancelledAt: new Date(),
      enabled: true,
    });

    booking.payment.refundStatus = refundDecision.refundAmount > 0 ? 'pending' : 'none';
    booking.payment.refundAmount = refundDecision.refundAmount;
    booking.escrow.refundPolicy = refundDecision.reason;
  } else if (booking.payment.status === PAYMENT_STATUS.COMPLETED) {
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

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.escrow?.enabled) {
    booking.payment.refundStatus = 'none';
    booking.payment.refundAmount = 0;
    booking.escrow.releaseStatus = 'released';
    booking.escrow.releaseDate = new Date();
  }

  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking marked as completed',
    booking,
  });
});

/**
 * Release escrow funds to the provider
 * PATCH /api/bookings/:id/release-escrow
 */
const releaseEscrow = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (booking.serviceProvider.toString() !== req.userId) {
    return res.status(403).json({ success: false, message: 'Not authorized to release escrow' });
  }

  if (!booking.escrow?.enabled || booking.escrow?.releaseStatus === 'released') {
    return res.status(400).json({ success: false, message: 'Escrow is not active for this booking' });
  }

  booking.escrow = releaseEscrowFunds({ escrow: booking.escrow, releasedAt: new Date() });
  await booking.save();

  res.status(200).json({ success: true, message: 'Escrow released to the provider', booking });
});

/**
 * Raise a dispute for escrow funds
 * PATCH /api/bookings/:id/dispute-escrow
 */
const disputeEscrow = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (
    booking.client.toString() !== req.userId &&
    booking.serviceProvider.toString() !== req.userId
  ) {
    return res.status(403).json({ success: false, message: 'Not authorized to dispute escrow' });
  }

  const { reason } = req.body;

  booking.escrow = markEscrowDisputed({
    escrow: booking.escrow,
    initiatedBy: booking.client.toString() === req.userId ? 'client' : 'provider',
    reason: reason || 'Escrow dispute raised',
    disputedAt: new Date(),
  });
  await booking.save();

  res.status(200).json({ success: true, message: 'Escrow dispute opened', booking });
});

module.exports = {
  createBooking,
  checkoutCart,
  getBookingById,
  getMyClientBookings,
  getMyProviderBookings,
  confirmBooking,
  cancelBooking,
  completeBooking,
  createBookingPaymentSession,
  markBookingPaymentSuccess,
  releaseEscrow,
  disputeEscrow,
};
