/**
 * Booking Scheduler Utilities
 * Handles deadline-based booking transitions and auto-release.
 */

const Booking = require('../models/Booking');
const User = require('../models/User');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');
const { getEscrowConfig } = require('./platformSettings');
const { getEscrowRefundDecision, releaseEscrowFunds, markEscrowDisputed } = require('./escrow');
const { refundPayment } = require('./payment');

const processExpiredAcceptances = async () => {
  const now = new Date();
  const expiredBookings = await Booking.find({
    status: BOOKING_STATUS.PENDING,
    'escrow.vendorAcceptDeadline': { $lte: now },
    'escrow.releaseStatus': 'held',
  });

  const results = [];
  for (const booking of expiredBookings) {
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancelledDate = now;
    booking.cancellationReason = 'Vendor did not respond before the acceptance deadline';
    booking.escrow.status = 'inactive';
    booking.escrow.releaseStatus = 'pending';
    booking.escrow.refundPolicy = 'Full refund due to vendor non-response';

    if (booking.payment.status === PAYMENT_STATUS.COMPLETED && booking.escrow?.enabled) {
      const refundDecision = getEscrowRefundDecision({
        amount: booking.pricing?.totalAmount || 0,
        eventDate: booking.eventDate,
        cancelledAt: now,
        enabled: true,
      });
      booking.payment.refundStatus = refundDecision.refundAmount > 0 ? 'pending' : 'none';
      booking.payment.refundAmount = refundDecision.refundAmount;
    }

    await booking.save();
    results.push({ bookingId: booking._id, status: booking.status });
  }

  return results;
};

const processAutoRelease = async () => {
  const now = new Date();
  const confirmedBookings = await Booking.find({
    status: BOOKING_STATUS.CONFIRMED,
    'escrow.autoReleaseAt': { $lte: now },
    'escrow.releaseStatus': 'held',
    'escrow.status': { $ne: 'disputed' },
  });

  const results = [];
  for (const booking of confirmedBookings) {
    booking.escrow = releaseEscrowFunds({ escrow: booking.escrow, releasedAt: now });
    booking.completedDate = now;
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.payment.refundStatus = 'none';
    booking.payment.refundAmount = 0;

    await booking.save();
    results.push({ bookingId: booking._id, status: booking.status });
  }

  return results;
};

module.exports = {
  processExpiredAcceptances,
  processAutoRelease,
};
