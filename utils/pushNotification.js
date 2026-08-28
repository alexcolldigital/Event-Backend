/**
 * Push Notification Utility
 * Uses Expo Push Notification HTTP API (matches frontend getExpoPushTokenAsync)
 */

const https = require('https');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send one or more push messages via Expo Push API
 * @param {object|object[]} messages
 */
const sendExpoPush = (messages) => {
  const body = JSON.stringify(Array.isArray(messages) ? messages : [messages]);
  return new Promise((resolve) => {
    const req = https.request(
      EXPO_PUSH_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', (err) => {
      console.error('Expo push request error:', err.message);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
};

/**
 * Send a push notification to a single Expo push token
 * @param {string} expoPushToken  - ExponentPushToken[xxx] or bare device token
 * @param {string} title
 * @param {string} body
 * @param {object} data           - extra key/value pairs
 */
const sendPush = async (expoPushToken, title, body, data = {}) => {
  if (!expoPushToken) return;
  try {
    await sendExpoPush({ to: expoPushToken, title, body, data, sound: 'default', priority: 'high' });
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
};

// ─── Per-type preference check ────────────────────────────────────────────────

/**
 * Returns true if the user has this notification type enabled
 * Falls back to true when the preference key is absent
 */
const isPrefEnabled = (user, prefKey) => {
  if (!user) return false;
  if (user.preferences?.notifications === false) return false;
  const pushPrefs = user.preferences?.pushPrefs;
  if (pushPrefs && pushPrefs[prefKey] === false) return false;
  return !!user.fcmToken;
};

// ─── Typed helpers ────────────────────────────────────────────────────────────

const notifyBookingUpdate = (user, booking) => {
  if (!isPrefEnabled(user, 'bookingUpdates')) return;
  return sendPush(
    user.fcmToken,
    'Booking Update',
    `Your booking #${booking.bookingNumber} is now ${booking.status}.`,
    { type: 'booking_update', bookingId: String(booking._id) }
  );
};

const notifyBookingAccepted = (user, booking) => {
  if (!isPrefEnabled(user, 'bookingUpdates')) return;
  return sendPush(
    user.fcmToken,
    'Booking Accepted! 🎉',
    `Your booking #${booking.bookingNumber} has been accepted. Proceed to payment.`,
    { type: 'booking_accepted', bookingId: String(booking._id) }
  );
};

const notifyBookingRejected = (user, booking) => {
  if (!isPrefEnabled(user, 'bookingUpdates')) return;
  return sendPush(
    user.fcmToken,
    'Booking Rejected',
    `Your booking #${booking.bookingNumber} was declined. Reason: ${booking.cancellationReason || 'No reason provided'}.`,
    { type: 'booking_rejected', bookingId: String(booking._id) }
  );
};

const notifyPaymentConfirmation = (user, booking) => {
  if (!isPrefEnabled(user, 'paymentConfirmation')) return;
  return sendPush(
    user.fcmToken,
    'Payment Confirmed',
    `Payment for booking #${booking.bookingNumber} was successful.`,
    { type: 'payment_confirmation', bookingId: String(booking._id) }
  );
};

const notifyBookingReminder = (user, booking) => {
  if (!isPrefEnabled(user, 'bookingReminder')) return;
  return sendPush(
    user.fcmToken,
    'Booking Reminder',
    `Reminder: Your booking #${booking.bookingNumber} is tomorrow.`,
    { type: 'booking_reminder', bookingId: String(booking._id) }
  );
};

const notifyCancellation = (user, booking) => {
  if (!isPrefEnabled(user, 'cancellationAlert')) return;
  return sendPush(
    user.fcmToken,
    'Booking Cancelled',
    `Booking #${booking.bookingNumber} has been cancelled.`,
    { type: 'cancellation_alert', bookingId: String(booking._id) }
  );
};

const notifyDepositPaid = (user, booking) => {
  if (!isPrefEnabled(user, 'paymentConfirmation')) return;
  return sendPush(
    user.fcmToken,
    'Deposit Received',
    `Your deposit for booking #${booking.bookingNumber} is confirmed. Balance due: \u20A6${Number(booking.balanceDue).toLocaleString()}.`,
    { type: 'deposit_paid', bookingId: String(booking._id) }
  );
};

const notifyBalanceDueReminder = (user, booking, daysLeft) => {
  if (!isPrefEnabled(user, 'bookingReminder')) return;
  return sendPush(
    user.fcmToken,
    'Balance Payment Reminder',
    `Your event is in ${daysLeft} day(s). Please pay the remaining \u20A6${Number(booking.balanceDue).toLocaleString()} for booking #${booking.bookingNumber}.`,
    { type: 'balance_due_reminder', bookingId: String(booking._id) }
  );
};

const notifyPromotion = (user, title, message) => {
  if (!isPrefEnabled(user, 'promotional')) return;
  return sendPush(user.fcmToken, title, message, { type: 'promotional' });
};

const notifyNewMessage = (user, senderName, preview) => {
  if (!isPrefEnabled(user, 'newMessage')) return;
  return sendPush(
    user.fcmToken,
    `New message from ${senderName}`,
    preview,
    { type: 'new_message' }
  );
};

const notifyNewBooking = (user, booking) => {
  if (!isPrefEnabled(user, 'bookingUpdates')) return;
  return sendPush(
    user.fcmToken,
    'New Booking Request 📋',
    `Booking #${booking.bookingNumber} received. Please confirm or reject.`,
    { type: 'new_booking', bookingId: String(booking._id) }
  );
};

const notifyPaymentReceived = (user, booking, paymentType, amount) => {
  if (!isPrefEnabled(user, 'paymentConfirmation')) return;
  const label = paymentType === 'deposit' ? 'Deposit' : paymentType === 'balance' ? 'Balance' : 'Full payment';
  return sendPush(
    user.fcmToken,
    `${label} Received 💰`,
    `${label} of \u20A6${Number(amount).toLocaleString()} received for booking #${booking.bookingNumber}.`,
    { type: 'payment_received', bookingId: String(booking._id) }
  );
};

const notifyServiceUpdated = (user, serviceName) => {
  if (!isPrefEnabled(user, 'bookingUpdates')) return;
  return sendPush(
    user.fcmToken,
    'Service Updated ✅',
    `Your service "${serviceName}" has been updated successfully.`,
    { type: 'service_updated' }
  );
};

module.exports = {
  sendPush,
  notifyBookingUpdate,
  notifyBookingAccepted,
  notifyBookingRejected,
  notifyPaymentConfirmation,
  notifyBookingReminder,
  notifyCancellation,
  notifyPromotion,
  notifyNewMessage,
  notifyDepositPaid,
  notifyBalanceDueReminder,
  notifyNewBooking,
  notifyPaymentReceived,
  notifyServiceUpdated,
};
