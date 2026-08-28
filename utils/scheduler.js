const Booking = require('../models/Booking');
const PlatformSetting = require('../models/PlatformSetting');
const gateway = require('./gateway');
const Payout = require('../models/Payout');
const User = require('../models/User');
const { BOOKING_STATUS, PAYMENT_STATUS, PAYMENT_PLAN } = require('../config/constants');
const push = require('./pushNotification');
const inApp = require('./inAppNotification');
const { sendBalanceDueReminderEmail, sendBookingReminderEmail } = require('./email');

// ─── helpers ─────────────────────────────────────────────────────────────────

const _sendEventReminder = async (booking, daysLabel) => {
  try {
    const client = await User.findById(booking.client);
    if (!client) return;
    const svc = await require('../models/Service').findById(booking.service).select('name').catch(() => null);
    await push.notifyBookingReminder(client, booking);
    await inApp.create(booking.client, { title: `Event Reminder \u23f0 (${daysLabel})`, message: `Your event for booking #${booking.bookingNumber} is in ${daysLabel}. Make sure everything is ready!`, notifType: 'booking_reminder', relatedId: booking._id });
    if (client.email) {
      await sendBookingReminderEmail(client.email, { firstName: client.firstName, bookingNumber: booking.bookingNumber, eventDate: booking.eventDate, eventTime: booking.eventTime, serviceName: svc?.name });
    }
  } catch (err) {
    console.error('Event reminder failed for booking', booking._id, err.message);
  }
};

const processExpiredAcceptances = async () => {
  try {
    const now = new Date();
    const bookings = await Booking.find({
      status: BOOKING_STATUS.PENDING,
      vendorAcceptDeadline: { $lte: now },
      'payment.status': PAYMENT_STATUS.COMPLETED,
    });

    for (const booking of bookings) {
      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancelledDate = new Date();
      booking.cancellationReason = 'Provider did not respond in time';
      booking.payment.refundStatus = 'pending';

      try {
        await gateway.refund({ booking, amount: booking.pricing?.totalAmount || 0 });
        booking.payment.refundStatus = 'completed';
      } catch (err) {
        booking.payment.refundStatus = 'pending';
      }

      await booking.save();

      // Push cancellation alert to client
      try {
        const client = await User.findById(booking.client);
        push.notifyCancellation(client, booking);
        await inApp.create(booking.client, { title: 'Booking Cancelled', message: `Booking #${booking.bookingNumber} was cancelled (provider did not respond in time).`, notifType: 'cancellation_alert', relatedId: booking._id });
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
      'payment.status': PAYMENT_STATUS.COMPLETED,
    });

    for (const booking of bookings) {
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

    // 1-day reminder (tomorrow)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const oneDayBookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      eventDate: { $gte: tomorrow, $lt: dayAfter },
      reminderSent: { $ne: true },
    });
    for (const booking of oneDayBookings) {
      await _sendEventReminder(booking, '1 day');
      booking.reminderSent = true;
      await booking.save();
    }

    // 3-day reminder
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const threeDaysEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const threeDayBookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      eventDate: { $gte: threeDays, $lt: threeDaysEnd },
      reminder3DaySent: { $ne: true },
    });
    for (const booking of threeDayBookings) {
      await _sendEventReminder(booking, '3 days');
      booking.reminder3DaySent = true;
      await booking.save();
    }

    // 7-day reminder
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const sevenDayBookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      eventDate: { $gte: sevenDays, $lt: sevenDaysEnd },
      reminder7DaySent: { $ne: true },
    });
    for (const booking of sevenDayBookings) {
      await _sendEventReminder(booking, '7 days');
      booking.reminder7DaySent = true;
      await booking.save();
    }
  } catch (err) {
    console.error('processBookingReminders error', err);
  }
};

const processBalanceDueReminders = async () => {
  try {
    const now = new Date();

    // 7-day balance reminder
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDayEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    const bookings7 = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      paymentPlan: { $in: [PAYMENT_PLAN.SPLIT_50_50, PAYMENT_PLAN.DEPOSIT_20] },
      depositPaid: true,
      balancePaid: { $ne: true },
      eventDate: { $gte: sevenDaysFromNow, $lt: sevenDayEnd },
      balanceReminder7DaySent: { $ne: true },
    });
    for (const booking of bookings7) {
      try {
        const client = await User.findById(booking.client);
        push.notifyBalanceDueReminder(client, booking, 7);
        await inApp.create(booking.client, { title: 'Balance Due in 7 Days ⚠️', message: `Your event is in 7 days. Please pay the remaining \u20A6${Number(booking.balanceDue).toLocaleString()} for booking #${booking.bookingNumber}.`, notifType: 'booking_reminder', relatedId: booking._id });
        if (client?.email) {
          await sendBalanceDueReminderEmail(client.email, { bookingNumber: booking.bookingNumber, balanceDue: booking.balanceDue, eventDate: booking.eventDate, daysLeft: 7 });
        }
        booking.balanceReminder7DaySent = true;
        await booking.save();
      } catch (err) {
        console.error('7-day balance reminder failed for booking', booking._id, err.message);
      }
    }

    // 3-day balance reminder
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const threeDayEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const bookings3 = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      paymentPlan: { $in: [PAYMENT_PLAN.SPLIT_50_50, PAYMENT_PLAN.DEPOSIT_20] },
      depositPaid: true,
      balancePaid: { $ne: true },
      eventDate: { $gte: threeDaysFromNow, $lt: threeDayEnd },
      balanceReminder3DaySent: { $ne: true },
    });
    for (const booking of bookings3) {
      try {
        const client = await User.findById(booking.client);
        push.notifyBalanceDueReminder(client, booking, 3);
        await inApp.create(booking.client, { title: 'Balance Due in 3 Days 🚨', message: `URGENT: Your event is in 3 days. Pay the remaining \u20A6${Number(booking.balanceDue).toLocaleString()} for booking #${booking.bookingNumber} now to avoid cancellation.`, notifType: 'booking_reminder', relatedId: booking._id });
        if (client?.email) {
          await sendBalanceDueReminderEmail(client.email, { bookingNumber: booking.bookingNumber, balanceDue: booking.balanceDue, eventDate: booking.eventDate, daysLeft: 3 });
        }
        booking.balanceReminder3DaySent = true;
        await booking.save();
      } catch (err) {
        console.error('3-day balance reminder failed for booking', booking._id, err.message);
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
