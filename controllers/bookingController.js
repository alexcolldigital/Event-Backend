/**
 * Booking Controller
 * Handles booking creation and management
 */

const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { asyncHandler } = require('../middleware/errorHandler');
const { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PLAN, RESCHEDULE_STATUS, REFUND_STATUS } = require('../config/constants');
const { sendBookingConfirmationEmail, sendDepositPaidEmail, sendBalanceDueReminderEmail } = require('../utils/email');
const { isBookingWithinCoverage } = require('../utils/locationMatcher');
const { buildCartCheckoutPayloads } = require('../utils/cartCheckout');
const { buildCheckoutSessionPayload } = require('../utils/payment');
const { normalizeEscrowOptions, getEscrowRefundDecision, releaseEscrowFunds, markEscrowDisputed } = require('../utils/escrow');
const gateway = require('../utils/gateway');
const PlatformSetting = require('../models/PlatformSetting');
const Payout = require('../models/Payout');
const push = require('../utils/pushNotification');

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
    paymentPlan,
    instantBooking,
    bookingRequestNote,
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
    const hasLocationConstraint =
      (serviceCoverage.states && serviceCoverage.states.length > 0) ||
      (serviceCoverage.lgas && serviceCoverage.lgas.length > 0);
    if (
      hasLocationConstraint &&
      bookingLocation &&
      Object.keys(bookingLocation).length > 0 &&
      !isBookingWithinCoverage(serviceCoverage, bookingLocation)
    ) {
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
  const escrow = normalizeEscrowOptions(escrowInput);

  // vendor accept deadline (default 24 hours, admin-configurable)
  const vendorAcceptHoursSetting = await PlatformSetting.findOne({ key: 'vendorAcceptHours' });
  const vendorAcceptHours = (vendorAcceptHoursSetting && Number(vendorAcceptHoursSetting.value)) || 24;
  const vendorAcceptDeadline = new Date(Date.now() + vendorAcceptHours * 60 * 60 * 1000);

  const selectedPlan = paymentPlan || PAYMENT_PLAN.FULL;
  let depositAmount = 0;
  let balanceDue = 0;
  if (selectedPlan === PAYMENT_PLAN.SPLIT_50_50) {
    depositAmount = totalAmount / 2;
    balanceDue = totalAmount / 2;
  } else if (selectedPlan === PAYMENT_PLAN.DEPOSIT_20) {
    depositAmount = totalAmount * 0.2;
    balanceDue = totalAmount * 0.8;
  } else {
    depositAmount = totalAmount;
    balanceDue = 0;
  }

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
    escrow,
    vendorAcceptDeadline,
    paymentPlan: selectedPlan,
    depositAmount,
    balanceDue,
    instantBooking: !!instantBooking,
    bookingRequestNote,
    status: instantBooking ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING,
    confirmedDate: instantBooking ? new Date() : undefined,
  });

  await booking.save();
  booking = await booking.populate('client serviceProvider service venue');

  res.status(201).json({
    success: true,
    message: 'Booking created successfully. Awaiting provider confirmation before payment.',
    booking: {
      ...booking.toObject(),
      escrow: booking.escrow,
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
  const checkoutLinks = [];

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
      const hasLocationConstraint =
        (serviceCoverage.states && serviceCoverage.states.length > 0) ||
        (serviceCoverage.lgas && serviceCoverage.lgas.length > 0);
      if (
        hasLocationConstraint &&
        bookingLocation &&
        Object.keys(bookingLocation).length > 0 &&
        !isBookingWithinCoverage(serviceCoverage, bookingLocation)
      ) {
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
    const populatedBooking = await booking.populate('client serviceProvider service venue');
    createdBookings.push(populatedBooking);

    // No checkout URL at booking creation — payment only unlocks after provider confirms
  }

  res.status(201).json({
    success: true,
    message: createdBookings.length > 0 ? 'Cart checked out successfully' : 'No bookings were created',
    bookings: createdBookings.map((booking) => ({
      ...booking.toObject(),
      escrow: booking.escrow,
      checkoutUrl: (checkoutLinks.find((link) => String(link.bookingId) === String(booking._id)) || {}).checkoutUrl || null,
    })),
    checkouts: checkoutLinks,
  });
});

/**
 * Get booking by ID
 * GET /api/bookings/:id
 */
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('client', 'firstName lastName email phoneNumber')
    .populate('serviceProvider', 'firstName lastName email phoneNumber businessName role')
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
    .populate('client')
    .populate('service')
    .populate('venue');

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  if (booking.client._id.toString() !== req.userId) {
    return res.status(403).json({ success: false, message: 'Not authorized to pay for this booking' });
  }

  if (booking.status !== BOOKING_STATUS.CONFIRMED) {
    return res.status(400).json({ success: false, message: 'Payment is only available after the booking has been confirmed by the provider.' });
  }

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.balancePaid) {
    return res.status(400).json({ success: false, message: 'Booking payment is already completed' });
  }

  // Determine amount: deposit (first payment) or balance (second payment)
  const isDepositPlan = booking.paymentPlan === PAYMENT_PLAN.SPLIT_50_50 || booking.paymentPlan === PAYMENT_PLAN.DEPOSIT_20;
  const isDepositPayment = isDepositPlan && !booking.depositPaid;
  const isBalancePayment = isDepositPlan && booking.depositPaid && !booking.balancePaid;
  const amountOverride = isDepositPayment ? booking.depositAmount : isBalancePayment ? booking.balanceDue : booking.pricing.totalAmount;
  const resolvedPaymentType = isDepositPayment ? 'deposit' : isBalancePayment ? 'balance' : 'full';

  const preferredGateway = req.body.gateway || null; // 'paystack' or 'flutterwave'
  const origin = req.body.origin || process.env.EXPO_PUBLIC_APP_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;

  try {
    const init = await gateway.initializeCheckout({ booking, origin, amountOverride, preferredGateway, paymentType: resolvedPaymentType });

    booking.payment.method = init.gateway || 'paystack';
    booking.payment.transactionId = init.reference || booking.payment.transactionId;
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment session created successfully',
      checkoutUrl: init.checkoutUrl,
      gateway: init.gateway,
      paymentType: resolvedPaymentType,
      amountDue: amountOverride,
      booking,
    });
  } catch (error) {
    console.error('Error creating payment session:', error);
    res.status(500).json({ success: false, message: 'Failed to create payment session. Please try again later.', error: error.message });
  }
});

/**
 * Mark a booking payment as successful and place it in escrow
 * POST /api/bookings/:id/payment-success
 */
const markBookingPaymentSuccess = asyncHandler(async (req, res) => {
  const { paymentType } = req.body; // 'deposit', 'balance', or 'full'
  const booking = await Booking.findById(req.params.id).populate('client');

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found' });
  }

  const clientId = booking.client?._id?.toString() || booking.client?.toString();
  if (clientId !== req.userId) {
    return res.status(403).json({ success: false, message: 'Not authorized to finalize this payment' });
  }

  const isDepositPlan = booking.paymentPlan === PAYMENT_PLAN.SPLIT_50_50 || booking.paymentPlan === PAYMENT_PLAN.DEPOSIT_20;

  if (isDepositPlan && paymentType === 'deposit' && !booking.depositPaid) {
    booking.depositPaid = true;
    booking.payment.status = PAYMENT_STATUS.PENDING; // still pending until balance paid
    booking.payment.paymentDate = new Date();
    booking.payment.method = booking.payment.method || 'paystack';
    await booking.save();

    // Notify deposit paid
    try {
      const client = booking.client;
      push.notifyDepositPaid(client, booking);
      if (client.email) {
        await sendDepositPaidEmail(client.email, {
          bookingNumber: booking.bookingNumber,
          depositAmount: booking.depositAmount,
          balanceDue: booking.balanceDue,
          eventDate: booking.eventDate,
          paymentPlan: booking.paymentPlan,
        });
      }
    } catch (_) {}

    return res.status(200).json({ success: true, message: 'Deposit payment confirmed. Please complete the balance before your event.', booking });
  }

  if (isDepositPlan && paymentType === 'balance' && booking.depositPaid && !booking.balancePaid) {
    booking.balancePaid = true;
    booking.payment.status = PAYMENT_STATUS.COMPLETED;
    booking.payment.paymentDate = new Date();
    booking.escrow.enabled = booking.escrow?.enabled ?? true;
    booking.escrow.status = booking.escrow?.enabled ? 'active' : 'inactive';
    booking.escrow.releaseStatus = 'held';
    booking.escrow.holdAmount = booking.pricing?.totalAmount || 0;
    booking.escrow.holdDate = new Date();
    await booking.save();

    try {
      const client = booking.client;
      push.notifyPaymentConfirmation(client, booking);
      if (client.email) {
        await sendBookingConfirmationEmail(client.email, {
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          totalAmount: booking.pricing.totalAmount,
          status: 'fully paid',
        });
      }
    } catch (_) {}

    return res.status(200).json({ success: true, message: 'Balance payment confirmed. Booking is fully paid.', booking });
  }

  // Full payment
  if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.balancePaid) {
    return res.status(200).json({ success: true, message: 'Booking payment already completed', booking });
  }

  booking.payment.status = PAYMENT_STATUS.COMPLETED;
  booking.payment.paymentDate = new Date();
  booking.payment.method = booking.payment.method || 'paystack';
  booking.depositPaid = true;
  booking.balancePaid = true;
  booking.escrow.enabled = booking.escrow?.enabled ?? true;
  booking.escrow.status = booking.escrow?.enabled ? 'active' : 'inactive';
  booking.escrow.releaseStatus = 'held';
  booking.escrow.holdAmount = booking.pricing?.totalAmount || 0;
  booking.escrow.holdDate = new Date();
  await booking.save();

  try {
    const client = booking.client;
    push.notifyPaymentConfirmation(client, booking);
  } catch (_) {}

  res.status(200).json({ success: true, message: 'Booking payment secured in escrow', booking });
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
 * Reject booking (provider)
 * PATCH /api/bookings/:id/reject
 */
const rejectBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim())
    return res.status(400).json({ success: false, message: 'Rejection reason is required' });

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  if (booking.serviceProvider.toString() !== req.userId)
    return res.status(403).json({ success: false, message: 'Not authorized to reject this booking' });

  if (booking.status !== BOOKING_STATUS.PENDING)
    return res.status(400).json({ success: false, message: 'Can only reject pending bookings' });

  booking.status = BOOKING_STATUS.REJECTED;
  booking.cancelledDate = new Date();
  booking.cancellationReason = reason.trim();
  await booking.save();

  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    if (client) push.notifyBookingUpdate(client, booking);
  } catch (_) {}

  res.status(200).json({ success: true, message: 'Booking rejected', booking });
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
  // set autoReleaseAt (event date + configurable window, default 72 hours)
  const autoWindowSetting = await PlatformSetting.findOne({ key: 'autoReleaseWindowHours' });
  const autoWindowHours = (autoWindowSetting && Number(autoWindowSetting.value)) || 72;
  try {
    const eventDateMs = booking.eventDate ? new Date(booking.eventDate).getTime() : Date.now();
    booking.autoReleaseAt = new Date(eventDateMs + autoWindowHours * 60 * 60 * 1000);
  } catch (e) {
    booking.autoReleaseAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  }
  await booking.save();

  // Generate payment checkout URL for the client
  let checkoutUrl = null;
  let checkoutGateway = null;
  try {
    const populatedBooking = await booking.populate('client');
    const origin =
      req.body.origin || process.env.EXPO_PUBLIC_APP_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const isDepositPlan = booking.paymentPlan === PAYMENT_PLAN.SPLIT_50_50 || booking.paymentPlan === PAYMENT_PLAN.DEPOSIT_20;
    const paymentType = isDepositPlan ? 'deposit' : 'full';
    const amountOverride = isDepositPlan ? booking.depositAmount : booking.pricing.totalAmount;
    const init = await gateway.initializeCheckout({ booking: populatedBooking, origin, amountOverride, paymentType });
    if (init && init.checkoutUrl) {
      checkoutUrl = init.checkoutUrl;
      checkoutGateway = init.gateway;
      booking.payment.method = init.gateway || booking.payment.method;
      booking.payment.transactionId = init.reference || booking.payment.transactionId;
      await booking.save();
    }
  } catch (checkoutErr) {
    console.error('Failed to generate checkout URL on confirm (non-fatal):', checkoutErr.message || checkoutErr);
  }

  // Send confirmation email + push (non-blocking)
  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    if (client) {
      if (client.email) {
        await sendBookingConfirmationEmail(client.email, {
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          totalAmount: booking.pricing.totalAmount,
          status: booking.status,
        });
      }
      push.notifyBookingUpdate(client, booking);
    }
  } catch (emailErr) {
    console.error('Booking confirmation notification failed (non-fatal):', emailErr.message || emailErr);
  }

  res.status(200).json({
    success: true,
    message: 'Booking confirmed successfully',
    booking,
    checkoutUrl,
    checkoutGateway,
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

  // Push cancellation alert to both parties (non-blocking)
  try {
    const User = require('../models/User');
    const [client, provider] = await Promise.all([
      User.findById(booking.client),
      User.findById(booking.serviceProvider),
    ]);
    push.notifyCancellation(client, booking);
    push.notifyCancellation(provider, booking);
  } catch (_) {}

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

  // Push booking update to client (non-blocking)
  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    push.notifyBookingUpdate(client, booking);
  } catch (_) {}

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

/**
 * Handle Paystack webhook (raw body expected)
 * POST /api/bookings/webhook/paystack
 */
const handlePaystackWebhookRaw = async (req, res) => {
  try {
    const crypto = require('crypto');
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.body && req.body.toString ? req.body.toString() : '';

    if (!process.env.PAYSTACK_SECRET || !signature) {
      console.warn('Paystack webhook missing configuration or signature');
      return res.status(400).send('Bad Request');
    }

    const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET).update(rawBody).digest('hex');
    if (hash !== signature) {
      console.warn('Invalid paystack webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(rawBody || '{}');
    const data = payload.data || {};

    if (!data) return res.status(200).send('No data');

    const bookingId = (data.metadata && (data.metadata.bookingId || data.metadata.booking_id)) || null;
    const reference = data.reference || data.id || null;
    const amount = data.amount ? Number(data.amount) / 100 : null;

    if (!bookingId) {
      console.warn('Paystack webhook without booking metadata');
      return res.status(200).send('ignored');
    }

    const booking = await Booking.findById(bookingId).populate('client');
    if (!booking) return res.status(404).send('Booking not found');

    if (payload.event === 'charge.success' || (data.status && data.status === 'success')) {
      await _handleSuccessfulPayment(booking, reference, amount);
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Paystack webhook processing error', err);
    return res.status(500).send('error');
  }
};

/**
 * Handle Flutterwave webhook
 * POST /api/bookings/webhook/flutterwave
 */
const handleFlutterwaveWebhook = async (req, res) => {
  try {
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;
    const signature = req.headers['verif-hash'];
    if (secretHash && signature !== secretHash) {
      console.warn('Invalid Flutterwave webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const payload = req.body || {};
    const data = payload.data || {};

    if (payload.event !== 'charge.completed' || data.status !== 'successful') {
      return res.status(200).send('ignored');
    }

    const bookingId = (data.meta && (data.meta.bookingId || data.meta.booking_id)) || null;
    const reference = data.tx_ref || data.id || null;
    const amount = data.amount ? Number(data.amount) : null;

    if (!bookingId) {
      console.warn('Flutterwave webhook without booking metadata');
      return res.status(200).send('ignored');
    }

    const booking = await Booking.findById(bookingId).populate('client');
    if (!booking) return res.status(404).send('Booking not found');

    await _handleSuccessfulPayment(booking, reference, amount);

    return res.status(200).send('ok');
  } catch (err) {
    console.error('Flutterwave webhook processing error', err);
    return res.status(500).send('error');
  }
};

/**
 * Shared logic for handling a successful payment from any gateway
 */
const _handleSuccessfulPayment = async (booking, reference, amount) => {
  const isDepositPlan = booking.paymentPlan === PAYMENT_PLAN.SPLIT_50_50 || booking.paymentPlan === PAYMENT_PLAN.DEPOSIT_20;

  if (isDepositPlan && !booking.depositPaid) {
    // First payment = deposit
    booking.depositPaid = true;
    booking.payment.transactionId = reference || booking.payment.transactionId;
    booking.payment.paymentDate = new Date();
    await booking.save();

    try {
      const client = booking.client;
      require('../utils/pushNotification').notifyDepositPaid(client, booking);
      if (client?.email) {
        await sendDepositPaidEmail(client.email, {
          bookingNumber: booking.bookingNumber,
          depositAmount: booking.depositAmount,
          balanceDue: booking.balanceDue,
          eventDate: booking.eventDate,
          paymentPlan: booking.paymentPlan,
        });
      }
    } catch (_) {}
    return;
  }

  if (isDepositPlan && booking.depositPaid && !booking.balancePaid) {
    // Second payment = balance
    booking.balancePaid = true;
    booking.payment.status = PAYMENT_STATUS.COMPLETED;
    booking.payment.transactionId = reference || booking.payment.transactionId;
    booking.payment.paymentDate = new Date();
    booking.escrow.enabled = booking.escrow?.enabled ?? true;
    booking.escrow.status = 'active';
    booking.escrow.releaseStatus = 'held';
    booking.escrow.holdAmount = booking.pricing?.totalAmount || 0;
    booking.escrow.holdDate = new Date();
    await booking.save();

    try {
      const client = booking.client;
      require('../utils/pushNotification').notifyPaymentConfirmation(client, booking);
    } catch (_) {}
    return;
  }

  // Full payment
  booking.payment.status = PAYMENT_STATUS.COMPLETED;
  booking.payment.transactionId = reference || booking.payment.transactionId;
  booking.payment.paymentDate = new Date();
  booking.depositPaid = true;
  booking.balancePaid = true;
  booking.escrow.enabled = booking.escrow?.enabled ?? true;
  booking.escrow.status = 'active';
  booking.escrow.releaseStatus = 'held';
  booking.escrow.holdAmount = amount || booking.pricing?.totalAmount || 0;
  booking.escrow.holdDate = new Date();
  await booking.save();

  try {
    const client = booking.client;
    require('../utils/pushNotification').notifyPaymentConfirmation(client, booking);
  } catch (_) {}
};

/**
 * Check availability for a service/venue on a date
 * GET /api/bookings/availability
 */
const checkAvailability = asyncHandler(async (req, res) => {
  const { serviceId, venueId, date } = req.query;
  if (!date || (!serviceId && !venueId)) {
    return res.status(400).json({ success: false, message: 'date and serviceId or venueId required' });
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const query = {
    eventDate: { $gte: start, $lte: end },
    status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
  };
  if (serviceId) query.service = serviceId;
  if (venueId) query.venue = venueId;

  const existing = await Booking.find(query).select('eventDate eventTime eventEndDate status');
  res.status(200).json({ success: true, date, bookings: existing, isAvailable: existing.length === 0 });
});

/**
 * Request reschedule
 * PATCH /api/bookings/:id/reschedule
 */
const requestReschedule = asyncHandler(async (req, res) => {
  const { newDate, newTime, reason } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  const isParty =
    booking.client.toString() === req.userId ||
    booking.serviceProvider.toString() === req.userId;
  if (!isParty && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  if ([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
    return res.status(400).json({ success: false, message: 'Cannot reschedule a completed or cancelled booking' });
  }

  booking.reschedule = {
    requestedBy: req.userId,
    newDate,
    newTime,
    reason,
    status: RESCHEDULE_STATUS.PENDING,
    requestedAt: new Date(),
  };
  await booking.save();

  const io = req.app.get('io');
  if (io) io.emit('booking_reschedule_request', { bookingId: booking._id });

  res.status(200).json({ success: true, message: 'Reschedule request sent', booking });
});

/**
 * Respond to reschedule request (accept/reject)
 * PATCH /api/bookings/:id/reschedule/respond
 */
const respondReschedule = asyncHandler(async (req, res) => {
  const { accept } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  const isOtherParty =
    (booking.reschedule?.requestedBy?.toString() !== req.userId) &&
    (booking.client.toString() === req.userId || booking.serviceProvider.toString() === req.userId);
  if (!isOtherParty && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to respond' });
  }
  if (!booking.reschedule || booking.reschedule.status !== RESCHEDULE_STATUS.PENDING) {
    return res.status(400).json({ success: false, message: 'No pending reschedule request' });
  }

  if (accept) {
    booking.eventDate = booking.reschedule.newDate || booking.eventDate;
    booking.eventTime = booking.reschedule.newTime || booking.eventTime;
    booking.reschedule.status = RESCHEDULE_STATUS.ACCEPTED;
  } else {
    booking.reschedule.status = RESCHEDULE_STATUS.REJECTED;
  }
  booking.reschedule.respondedAt = new Date();
  await booking.save();

  res.status(200).json({ success: true, message: accept ? 'Reschedule accepted' : 'Reschedule rejected', booking });
});

/**
 * Request a refund
 * PATCH /api/bookings/:id/refund
 */
const requestRefund = asyncHandler(async (req, res) => {
  const { reason, amount } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  if (booking.client.toString() !== req.userId) {
    return res.status(403).json({ success: false, message: 'Only the client can request a refund' });
  }
  if (booking.payment.status !== PAYMENT_STATUS.COMPLETED) {
    return res.status(400).json({ success: false, message: 'No completed payment to refund' });
  }
  if (booking.refundRequest?.status === REFUND_STATUS.REQUESTED) {
    return res.status(400).json({ success: false, message: 'Refund already requested' });
  }

  booking.refundRequest = {
    requestedBy: req.userId,
    reason,
    amount: amount || booking.pricing?.totalAmount,
    status: REFUND_STATUS.REQUESTED,
    requestedAt: new Date(),
  };
  await booking.save();

  res.status(200).json({ success: true, message: 'Refund request submitted', booking });
});

/**
 * Respond to refund request (admin/provider)
 * PATCH /api/bookings/:id/refund/respond
 */
const respondRefund = asyncHandler(async (req, res) => {
  const { approve, responseNote } = req.body;
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  const canRespond =
    req.user.role === 'admin' || booking.serviceProvider.toString() === req.userId;
  if (!canRespond) return res.status(403).json({ success: false, message: 'Not authorized' });

  if (!booking.refundRequest || booking.refundRequest.status !== REFUND_STATUS.REQUESTED) {
    return res.status(400).json({ success: false, message: 'No pending refund request' });
  }

  booking.refundRequest.status = approve ? REFUND_STATUS.APPROVED : REFUND_STATUS.REJECTED;
  booking.refundRequest.respondedAt = new Date();
  booking.refundRequest.responseNote = responseNote || '';

  if (approve) {
    booking.payment.refundStatus = 'pending';
    booking.payment.refundAmount = booking.refundRequest.amount;
  }
  await booking.save();

  res.status(200).json({ success: true, message: approve ? 'Refund approved' : 'Refund rejected', booking });
});

/**
 * Pay balance (for split/deposit plans)
 * PATCH /api/bookings/:id/pay-balance
 */
const payBalance = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate('client');
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  const clientId = booking.client?._id?.toString() || booking.client?.toString();
  if (clientId !== req.userId) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  if (booking.balancePaid) {
    return res.status(400).json({ success: false, message: 'Balance already paid' });
  }
  if (!booking.depositPaid) {
    return res.status(400).json({ success: false, message: 'Deposit must be paid first' });
  }

  const preferredGateway = req.body.gateway || null;
  const origin = req.body.origin || process.env.EXPO_PUBLIC_APP_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;

  let checkoutUrl = null;
  let gatewayUsed = null;
  try {
    const init = await gateway.initializeCheckout({
      booking,
      origin,
      amountOverride: booking.balanceDue,
      preferredGateway,
      paymentType: 'balance',
    });
    if (init?.checkoutUrl) {
      checkoutUrl = init.checkoutUrl;
      gatewayUsed = init.gateway;
      booking.payment.method = init.gateway || booking.payment.method;
      await booking.save();
    }
  } catch (err) {
    console.error('Balance payment init failed:', err.message);
  }

  res.status(200).json({ success: true, message: 'Balance payment session created', checkoutUrl, gateway: gatewayUsed, amountDue: booking.balanceDue, booking });
});

module.exports = {
  createBooking,
  checkoutCart,
  getBookingById,
  getMyClientBookings,
  getMyProviderBookings,
  confirmBooking,
  rejectBooking,
  cancelBooking,
  completeBooking,
  createBookingPaymentSession,
  markBookingPaymentSuccess,
  releaseEscrow,
  disputeEscrow,
  handlePaystackWebhookRaw,
  handleFlutterwaveWebhook,
  checkAvailability,
  requestReschedule,
  respondReschedule,
  requestRefund,
  respondRefund,
  payBalance,
};
