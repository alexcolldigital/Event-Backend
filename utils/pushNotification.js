/**
 * Push Notification Utility
 * Firebase Cloud Messaging via firebase-admin
 */

let admin = null;

const getAdmin = () => {
  if (admin) return admin;
  try {
    admin = require('firebase-admin');
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (!serviceAccount) {
      console.warn('FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
      admin = null;
      return null;
    }

    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    return admin;
  } catch (err) {
    console.warn('firebase-admin not available:', err.message);
    admin = null;
    return null;
  }
};

/**
 * Send a push notification to a single FCM token
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} body
 * @param {object} data  - extra key/value pairs (all strings)
 */
const sendPush = async (fcmToken, title, body, data = {}) => {
  const fb = getAdmin();
  if (!fb || !fcmToken) return;

  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  try {
    await fb.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
};

// ─── Typed helpers ────────────────────────────────────────────────────────────

const notifyBookingUpdate = (fcmToken, booking) =>
  sendPush(
    fcmToken,
    'Booking Update',
    `Your booking #${booking.bookingNumber} is now ${booking.status}.`,
    { type: 'booking_update', bookingId: String(booking._id) }
  );

const notifyPaymentConfirmation = (fcmToken, booking) =>
  sendPush(
    fcmToken,
    'Payment Confirmed',
    `Payment for booking #${booking.bookingNumber} was successful.`,
    { type: 'payment_confirmation', bookingId: String(booking._id) }
  );

const notifyBookingReminder = (fcmToken, booking) =>
  sendPush(
    fcmToken,
    'Booking Reminder',
    `Reminder: Your booking #${booking.bookingNumber} is tomorrow.`,
    { type: 'booking_reminder', bookingId: String(booking._id) }
  );

const notifyCancellation = (fcmToken, booking) =>
  sendPush(
    fcmToken,
    'Booking Cancelled',
    `Booking #${booking.bookingNumber} has been cancelled.`,
    { type: 'cancellation_alert', bookingId: String(booking._id) }
  );

const notifyPromotion = (fcmToken, title, message) =>
  sendPush(fcmToken, title, message, { type: 'promotional' });

const notifyNewMessage = (fcmToken, senderName, preview) =>
  sendPush(
    fcmToken,
    `New message from ${senderName}`,
    preview,
    { type: 'new_message' }
  );

module.exports = {
  sendPush,
  notifyBookingUpdate,
  notifyPaymentConfirmation,
  notifyBookingReminder,
  notifyCancellation,
  notifyPromotion,
  notifyNewMessage,
};
