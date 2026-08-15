const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, // null = broadcast
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['broadcast', 'targeted', 'role_based', 'system'], default: 'broadcast' },
    notifType: {
      type: String,
      enum: ['booking_update', 'booking_accepted', 'booking_rejected', 'payment_confirmation',
             'booking_reminder', 'cancellation_alert', 'promotional', 'new_message', 'deposit_paid', 'general'],
      default: 'general',
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId }, // bookingId, messageId, etc.
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    targetRole: { type: String, enum: ['all', 'client', 'service_provider', 'admin'], default: 'all' },
    channel: { type: String, enum: ['in_app', 'email', 'push', 'all'], default: 'in_app' },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentAt: Date,
    scheduledAt: Date,
    status: { type: String, enum: ['draft', 'scheduled', 'sent'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
