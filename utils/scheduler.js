const Booking = require('../models/Booking');
const PlatformSetting = require('../models/PlatformSetting');
const gateway = require('./gateway');
const Payout = require('../models/Payout');
const User = require('../models/User');
const { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PLAN } = require('../config/constants');
const push = require('./pushNotification');
const { sendBalanceDueReminderEmail } = require('./email');

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

      // Push cancellation alert to client
      try {
        const client = await User.findById(booking.client);
        push.notifyCancellation(client, booking);
      } catch (_) {}
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
      if (booking.escrow && booking.escrow.releaseStatus === 'disputed') continue;

      const commissionSetting = await PlatformSetting.findOne({ key: 'commissionPercentage' });
      const commissionPercent = (commissionSetting && Number(commissionSetting.value)) || 10;
      const commission = Math.round(((booking.pricing?.totalAmount || 0) * commissionPercent) / 100);
      const payoutAmount = (booking.pricing?.totalAmount || 0) - commission;

      const provider = await User.findById(booking.serviceProvider);

      const payout = await Payout.create({
        booking: booking._id,
        provider: booking.serviceProvider,
        amount: payoutAmount,
        commission,
        transferMethod: 'paystack',
        status: 'processing',
        metadata: { gateway: 'paystack', originalPaymentTransactionId: booking.payment.transactionId },
      });

      try {
        const transferRes = await gateway.transferToProvider({ payout, provider });
        payout.transferReference =
          (transferRes && transferRes.data && (transferRes.data.reference || transferRes.data.transfer_code)) ||
          (transferRes && transferRes.data);
        payout.status = 'completed';
        payout.completedAt = new Date();
        await payout.save();

        booking.status = BOOKING_STATUS.COMPLETED;
        booking.completedDate = new Date();
        booking.escrow.releaseStatus = 'released';
        booking.escrow.releaseDate = new Date();
        await booking.save();

        // Push booking update to client
        try {
          const client = await User.findById(booking.client);
          push.notifyBookingUpdate(client, booking);
        } catch (_) {}
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

const processBookingReminders = async () => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const bookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      eventDate: { $gte: tomorrow, $lt: dayAfter },
      reminderSent: { $ne: true },
    });

    for (const booking of bookings) {
      try {
        const client = await User.findById(booking.client);
        await push.notifyBookingReminder(client, booking);
        booking.reminderSent = true;
        await booking.save();
      } catch (err) {
        console.error('Reminder push failed for booking', booking._id, err.message);
      }
    }
  } catch (err) {
    console.error('processBookingReminders error', err);
  }
};

const processBalanceDueReminders = async () => {
  try {
    const now = new Date();
    // Find deposit-plan bookings where balance is unpaid and event is within 7 days
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const bookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      paymentPlan: { $in: [PAYMENT_PLAN.SPLIT_50_50, PAYMENT_PLAN.DEPOSIT_20] },
      depositPaid: true,
      balancePaid: { $ne: true },
      eventDate: { $gte: now, $lte: sevenDaysFromNow },
      reminderScheduled: { $ne: true },
    });

    for (const booking of bookings) {
      try {
        const client = await User.findById(booking.client);
        const daysLeft = Math.ceil((new Date(booking.eventDate) - now) / (1000 * 60 * 60 * 24));
        push.notifyBalanceDueReminder(client, booking, daysLeft);
        if (client?.email) {
          await sendBalanceDueReminderEmail(client.email, {
            bookingNumber: booking.bookingNumber,
            balanceDue: booking.balanceDue,
            eventDate: booking.eventDate,
            daysLeft,
          });
        }
        booking.reminderScheduled = true;
        await booking.save();
      } catch (err) {
        console.error('Balance due reminder failed for booking', booking._id, err.message);
      }
    }
  } catch (err) {
    console.error('processBalanceDueReminders error', err);
  }
};

const startSchedulers = (intervalMinutes = 15) => {
  processExpiredAcceptances();
  processAutoReleases();
  processBookingReminders();
  processBalanceDueReminders();

  setInterval(() => {
    processExpiredAcceptances();
    processAutoReleases();
    processBookingReminders();
    processBalanceDueReminders();
  }, intervalMinutes * 60 * 1000);
};

module.exports = {
  processExpiredAcceptances,
  processAutoReleases,
  processBookingReminders,
  processBalanceDueReminders,
  startSchedulers,
};
