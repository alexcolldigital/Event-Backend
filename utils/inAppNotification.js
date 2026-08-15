/**
 * In-App Notification Utility
 * Creates persisted Notification records for the user's in-app feed
 */

const Notification = require('../models/Notification');

const create = async (recipientId, { title, message, notifType = 'general', relatedId = null }) => {
  try {
    await Notification.create({
      recipient: recipientId,
      title,
      message,
      type: 'system',
      notifType,
      relatedId,
      status: 'sent',
      sentAt: new Date(),
    });
  } catch (err) {
    console.error('inAppNotification.create failed (non-fatal):', err.message);
  }
};

module.exports = { create };
