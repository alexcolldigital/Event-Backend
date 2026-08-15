/**
 * Booking Controller
 * Handles booking creation and management
 */

const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { asyncHandler } = require('../middleware/errorHandler');
const { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PLAN, RESCHEDULE_STATUS, REFUND_STATUS } = require('../config/constants');
const { sendBookingConfirmationEmail, sendDepositPaidEmail, sendBalanceDueReminderEmail, sendCancellationAlertEmail, sendBookingAcceptedEmail, sendBookingRejectedEmail, sendProviderSuspensionEmail } = require('../utils/email');
const { calcClientRefund, applyProviderStrike, loadStrikeThreshold } = require('../utils/cancellation');
const { isBookingWithinCoverage } = require('../utils/locationMatcher');
const { buildCartCheckoutPayloads } = require('../utils/cartCheckout');
const { buildCheckoutSessionPayload } = require('../utils/payment');
const gateway = require('../utils/gateway');
const PlatformSetting = require('../models/PlatformSetting');
const Payout = require('../models/Payout');
const push = require('../utils/pushNotification');
const inApp = require('../utils/inAppNotification');

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
    if (service.priceOnRequest) {
      pricing = { basePrice: 0, quantity: numberOfGuests || 1, unitPrice: 0, subtotal: 0, priceOnRequest: true };
    } else {
      pricing = {
        basePrice: service.pricing.basePrice,
        quantity: numberOfGuests || 1,
        unitPrice: service.pricing.basePrice,
        subtotal: service.pricing.basePrice * (numberOfGuests || 1),
      };
    }
  } else {
    const Venue = require('../models/Venue');
    const venue = await Venue.findById(venueId);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found' });
    }
    serviceProvider = venue.owner;
    pricing = {
      basePrice: venue.rentalPrice?.daily || venue.rentalPrice?.hourly || 0,
      quantity: duration || 1,
      unitPrice: venue.rentalPrice?.daily || venue.rentalPrice?.hourly || 0,
      subtotal: (venue.rentalPrice?.daily || venue.rentalPrice?.hourly || 0) * (duration || 1),
    };
  }

  const feeSetting = await PlatformSetting.findOne({ key: 'feePercentage' });
  const subtotal = pricing.subtotal || 0;
  const feeRate = feeSetting ? Number(feeSetting.value) / 100 : 0.10;
  const serviceAndDeliveryFee = subtotal * feeRate;
  const totalAmount = subtotal + serviceAndDeliveryFee;

  const bookingNumber = `EC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // vendor accept deadline (default 24 hours, admin-configurable)
  const vendorAcceptHoursSetting = await PlatformSetting.findOne({ key: 'vendorAcceptHours' });
  const vendorAcceptHours = (vendorAcceptHoursSetting && Number(vendorAcceptHoursSetting.value)) || 24;
  const vendorAcceptDeadline = new Date(Date.now() + vendorAcceptHours * 60 * 60 * 1000);

  const selectedPlan = paymentPlan || PAYMENT_PLAN.FULL;
  let depositAmount = 0;
  let balanceDue = 0;
  if (selectedPlan === PAYMENT_PLAN.SPLIT_50_50) {
    depositAmount = Math.round(totalAmount * 0.5 * 100) / 100;
    balanceDue = Math.round((totalAmount - depositAmount) * 100) / 100;
  } else if (selectedPlan === PAYMENT_PLAN.DEPOSIT_20) {
    depositAmount = Math.round(totalAmount * 0.2 * 100) / 100;
    balanceDue = Math.round((totalAmount - depositAmount) * 100) / 100;
  } else {
    depositAmount = totalAmount;
    balanceDue = 0;
  }

  // Balance must be paid 2 days before the event date
  const balanceDeadline = selectedPlan !== PAYMENT_PLAN.FULL
    ? new Date(new Date(eventDate).getTime() - 2 * 24 * 60 * 60 * 1000)
    : null;

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
      serviceAndDeliveryFee,
      totalAmount,
    },
    vendorAcceptDeadline,
    paymentPlan: selectedPlan,
    depositAmount,
    balanceDue,
    balanceDeadline,
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
    booking,
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
    const { serviceId, venueId, eventId, eventDate, eventEndDate, eventTime, duration, numberOfGuests, specialRequirements, clientNotes, bookingLocation } = payload;

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

    const feeSettingCheckout = await PlatformSetting.findOne({ key: 'feePercentage' });
    const checkoutSubtotal = pricing.subtotal || 0;
    const feeRateCheckout = feeSettingCheckout ? Number(feeSettingCheckout.value) / 100 : 0.10;
    const serviceAndDeliveryFeeCheckout = checkoutSubtotal * feeRateCheckout;
    const totalAmount = checkoutSubtotal + serviceAndDeliveryFeeCheckout;

    const bookingNumber = `EC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

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
        serviceAndDeliveryFee: serviceAndDeliveryFeeCheckout,
        totalAmount,
      },
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
    await _upsertPaymentRecord(booking, booking.payment.transactionId, booking.depositAmount, 'deposit');

    // Notify deposit paid
    try {
      const client = booking.client;
      push.notifyDepositPaid(client, booking);
      await inApp.create(client._id || client, { title: 'Deposit Confirmed', message: `Deposit for booking #${booking.bookingNumber} received. Balance due: ₦${Number(booking.balanceDue).toLocaleString()}.`, notifType: 'deposit_paid', relatedId: booking._id });
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
    await booking.save();
    await _upsertPaymentRecord(booking, booking.payment.transactionId, booking.balanceDue, 'balance');

    try {
      const client = booking.client;
      push.notifyPaymentConfirmation(client, booking);
      await inApp.create(client._id || client, { title: 'Payment Confirmed', message: `Full payment for booking #${booking.bookingNumber} confirmed.`, notifType: 'payment_confirmation', relatedId: booking._id });
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
  await booking.save();
  await _upsertPaymentRecord(booking, booking.payment.transactionId, booking.pricing?.totalAmount || 0, 'full');

  try {
    const client = booking.client;
    push.notifyPaymentConfirmation(client, booking);
  } catch (_) {}

  res.status(200).json({ success: true, message: 'Booking payment confirmed', booking });
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
    if (client) {
      push.notifyBookingRejected(client, booking);
      await inApp.create(client._id, {
        title: 'Booking Rejected',
        message: `Your booking #${booking.bookingNumber} was declined. Reason: ${booking.cancellationReason || 'No reason provided'}.`,
        notifType: 'booking_rejected',
        relatedId: booking._id,
      });
      if (client.email) {
        const svc = await require('../models/Service').findById(booking.service).select('name').catch(() => null);
        await sendBookingRejectedEmail(client.email, { firstName: client.firstName, bookingNumber: booking.bookingNumber, eventDate: booking.eventDate, serviceName: svc?.name, reason: booking.cancellationReason });
      }
    }
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
      push.notifyBookingAccepted(client, booking);
      await inApp.create(client._id, {
        title: 'Booking Accepted! 🎉',
        message: `Your booking #${booking.bookingNumber} has been accepted. Proceed to payment.`,
        notifType: 'booking_accepted',
        relatedId: booking._id,
      });
      if (client.email) {
        const svc = await require('../models/Service').findById(booking.service).select('name').catch(() => null);
        const provider = await require('../models/User').findById(booking.serviceProvider).select('firstName lastName businessName').catch(() => null);
        await sendBookingAcceptedEmail(client.email, { firstName: client.firstName, bookingNumber: booking.bookingNumber, eventDate: booking.eventDate, serviceName: svc?.name, providerName: provider?.businessName || `${provider?.firstName||''} ${provider?.lastName||''}`.trim(), totalAmount: booking.pricing.totalAmount, checkoutUrl });
      }
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
 *
 * Behaviour:
 *  - CLIENT cancels: tiered refund based on days-until-event (admin-configurable policy)
 *  - PROVIDER cancels after accepting (status === confirmed): full refund to client + strike;
 *    enough strikes auto-suspends the provider account
 *  - PROVIDER cancels before accepting (status === pending): no payment taken yet, no refund needed
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const booking = await Booking.findById(req.params.id);

  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

  const isClient = booking.client.toString() === req.userId;
  const isProvider = booking.serviceProvider.toString() === req.userId;

  if (!isClient && !isProvider && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking' });
  }

  if (booking.status === BOOKING_STATUS.CANCELLED) {
    return res.status(400).json({ success: false, message: 'Booking is already cancelled' });
  }

  if ([BOOKING_STATUS.COMPLETED].includes(booking.status)) {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed booking' });
  }

  const hasPaid = booking.payment.status === PAYMENT_STATUS.COMPLETED ||
    booking.depositPaid;
  const paidAmount = booking.depositPaid && !booking.balancePaid
    ? booking.depositAmount
    : booking.pricing?.totalAmount || 0;

  let refundAmount = 0;
  let refundPct = 0;
  let providerStrikeResult = null;
  let cancelledBy = isClient ? 'client' : 'provider';

  // ── Provider cancels after accepting ──────────────────────────────────────
  if (isProvider && booking.status === BOOKING_STATUS.CONFIRMED) {
    // Full refund regardless of timing
    refundPct = 100;
    refundAmount = hasPaid ? paidAmount : 0;

    // Apply strike + possible auto-suspend
    try {
      const User = require('../models/User');
      const provider = await User.findById(booking.serviceProvider);
      if (provider) {
        providerStrikeResult = await applyProviderStrike(provider);
        const threshold = await loadStrikeThreshold();
        if (providerStrikeResult.suspended && provider.email) {
          await sendProviderSuspensionEmail(provider.email, {
            firstName: provider.firstName,
            strikeCount: providerStrikeResult.strikes,
            threshold,
          });
        }
      }
    } catch (_) {}
  }

  // ── Client cancels (or provider cancels a still-pending booking) ──────────
  if (isClient && hasPaid) {
    const result = await calcClientRefund(paidAmount, booking.eventDate);
    refundPct = result.refundPct;
    refundAmount = result.refundAmount;
  }

  // ── Persist cancellation ──────────────────────────────────────────────────
  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledDate = new Date();
  booking.cancellationReason = reason;
  booking.cancellationMeta = { cancelledBy, refundPct, refundAmount };

  if (hasPaid) {
    booking.payment.refundStatus = refundAmount > 0 ? 'pending' : 'none';
    booking.payment.refundAmount = refundAmount;
  }

  await booking.save();

  // ── Notifications ─────────────────────────────────────────────────────────
  try {
    const User = require('../models/User');
    const [client, provider] = await Promise.all([
      User.findById(booking.client),
      User.findById(booking.serviceProvider),
    ]);
    const cancelMsg = `Booking #${booking.bookingNumber} has been cancelled.`;
    const serviceName = booking.service?.name || booking.venue?.name || 'N/A';

    if (client) {
      push.notifyCancellation(client, booking);
      await inApp.create(client._id, { title: 'Booking Cancelled', message: cancelMsg, notifType: 'cancellation_alert', relatedId: booking._id });
      if (client.email) {
        await sendCancellationAlertEmail(client.email, {
          firstName: client.firstName,
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          serviceName,
          reason: booking.cancellationReason,
          refundEligible: refundAmount > 0,
          refundAmount,
          refundPct,
        });
      }
    }
    if (provider) {
      push.notifyCancellation(provider, booking);
      await inApp.create(provider._id, { title: 'Booking Cancelled', message: cancelMsg, notifType: 'cancellation_alert', relatedId: booking._id });
      if (provider.email) {
        await sendCancellationAlertEmail(provider.email, {
          firstName: provider.firstName,
          bookingNumber: booking.bookingNumber,
          eventDate: booking.eventDate,
          serviceName,
          reason: booking.cancellationReason,
          refundEligible: false,
        });
      }
    }
  } catch (_) {}

  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    refundPct,
    refundAmount,
    providerStrike: providerStrikeResult,
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

  if (booking.payment.status === PAYMENT_STATUS.COMPLETED) {
    booking.payment.refundStatus = 'none';
    booking.payment.refundAmount = 0;
  }

  await booking.save();

  // Push booking update to client (non-blocking)
  try {
    const User = require('../models/User');
    const client = await User.findById(booking.client);
    push.notifyBookingUpdate(client, booking);
    if (client) await inApp.create(client._id, { title: 'Booking Completed', message: `Your booking #${booking.bookingNumber} has been marked as completed.`, notifType: 'booking_update', relatedId: booking._id });
  } catch (_) {}

  res.status(200).json({
    success: true,
    message: 'Booking marked as completed',
    booking,
  });
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
 * Upsert a Payment record so the admin can see all payments
 */
const _upsertPaymentRecord = async (booking, reference, paidAmount, paymentType) => {
  try {
    const client = booking.client?._id || booking.client;
    const provider = booking.serviceProvider?._id || booking.serviceProvider;
    const total = booking.pricing?.totalAmount || 0;
    const feeSettingPayment = await PlatformSetting.findOne({ key: 'feePercentage' });
    const feeRatePayment = feeSettingPayment ? Number(feeSettingPayment.value) / 100 : 0.10;
    const commissionRate = feeRatePayment;
    const platformFee = paidAmount * commissionRate;
    const payeeAmount = paidAmount - platformFee;
    const txnId = reference || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await Payment.findOneAndUpdate(
      { booking: booking._id, 'metadata.paymentType': paymentType },
      {
        transactionId: txnId,
        payer: client,
        payee: provider,
        booking: booking._id,
        amount: paidAmount,
        currency: booking.pricing?.currency || 'NGN',
        platformFee,
        payeeAmount,
        paymentMethod: booking.payment?.method || 'paystack',
        paystackReference: booking.payment?.method !== 'flutterwave' ? txnId : undefined,
        flutterwaveReference: booking.payment?.method === 'flutterwave' ? txnId : undefined,
        status: PAYMENT_STATUS.COMPLETED,
        description: `${paymentType} payment for booking ${booking.bookingNumber}`,
        metadata: {
          paymentType,
          invoiceNumber: booking.bookingNumber,
          eventName: booking.event?.name || '',
          serviceName: booking.service?.name || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    console.error('Failed to upsert Payment record (non-fatal):', err.message);
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
    await _upsertPaymentRecord(booking, reference, booking.depositAmount || amount, 'deposit');

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
    await booking.save();
    await _upsertPaymentRecord(booking, reference, booking.balanceDue || amount, 'balance');

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
  await booking.save();
  await _upsertPaymentRecord(booking, reference, amount || booking.pricing?.totalAmount || 0, 'full');

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
  handlePaystackWebhookRaw,
  handleFlutterwaveWebhook,
  checkAvailability,
  requestReschedule,
  respondReschedule,
  requestRefund,
  respondRefund,
  payBalance,
};
