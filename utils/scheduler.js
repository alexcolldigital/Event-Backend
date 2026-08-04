const Booking = require('../models/Booking');
const PlatformSetting = require('../models/PlatformSetting');
const gateway = require('./gateway');
const Payout = require('../models/Payout');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../config/constants');

const processExpiredAcceptances = async () => {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      status: BOOKING_STATUS.PENDING,
      vendorAcceptDeadline: { $lte: now },
      'payment.status': PAYMENT_STATUS.COMPLETED,
      escrowStatus: 'held',
    });

    for (const booking of bookings) {
      // Auto-cancel and refund
      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancelledDate = new Date();
      booking.cancellationReason = 'Provider did not respond in time';

      const refundDecision = require('./escrow').getEscrowRefundDecision({
        amount: booking.pricing?.totalAmount || 0,
        eventDate: booking.eventDate,
        cancelledAt: new Date(),
        enabled: true,
      });

      try {
        await gateway.refund({ booking, amount: refundDecision.refundAmount });
        booking.payment.refundStatus = refundDecision.refundAmount > 0 ? 'completed' : 'none';
        booking.payment.refundAmount = refundDecision.refundAmount;
        booking.escrow.refundPolicy = refundDecision.reason;
        booking.escrow.releaseStatus = 'refunded';
      } catch (err) {
        booking.payment.refundStatus = 'pending';
      }

      await booking.save();
    }
  } catch (err) {
    console.error('processExpiredAcceptances error', err);
  }
};

const processAutoReleases = async () => {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      autoReleaseAt: { $lte: now },
      escrowStatus: 'held',
    });

    for (const booking of bookings) {
      // skip if disputed
      if (booking.escrow && booking.escrow.releaseStatus === 'disputed') continue;

      // compute platform commission
      const commissionSetting = await PlatformSetting.findOne({ key: 'commissionPercentage' });
      const commissionPercent = (commissionSetting && Number(commissionSetting.value)) || 10;
      const commission = Math.round(((booking.pricing?.totalAmount || 0) * commissionPercent) / 100);
      const payoutAmount = (booking.pricing?.totalAmount || 0) - commission;

      // populate provider details to access bank info and recipient codes
      const User = require('../models/User');
      const provider = await User.findById(booking.serviceProvider);

      // create payout record
      const payout = await Payout.create({
        booking: booking._id,
        provider: booking.serviceProvider,
        amount: payoutAmount,
        commission,
        transferMethod: 'paystack',
        status: 'processing',
        metadata: { gateway: 'paystack', originalPaymentTransactionId: booking.payment.transactionId },
      });

      // attempt transfer
      try {
        const transferRes = await gateway.transferToProvider({ payout, provider });
        // paystack returns data.reference or transfer code
        payout.transferReference = transferRes && (transferRes.data && (transferRes.data.reference || transferRes.data.transfer_code)) || transferRes && transferRes.data;
        payout.status = 'completed';
        payout.completedAt = new Date();
        await payout.save();

        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedDate = new Date();
        booking.escrow.releaseStatus = 'released';
        booking.escrow.releaseDate = new Date();
        await booking.save();
      } catch (err) {
        payout.status = 'failed';
        payout.failureReason = err.message || 'Transfer failed';
        await payout.save();
        console.error('Auto-release transfer failed', err);
      }
    }
  } catch (err) {
    console.error('processAutoReleases error', err);
  }
};

const startSchedulers = (intervalMinutes = 15) => {
  // run immediately then interval
  processExpiredAcceptances();
  processAutoReleases();

  setInterval(() => {
    processExpiredAcceptances();
    processAutoReleases();
  }, intervalMinutes * 60 * 1000);
};

module.exports = {
  processExpiredAcceptances,
  processAutoReleases,
  startSchedulers,
};
