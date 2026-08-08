const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },
    attachment: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
      name: { type: String, default: null },
      size: { type: Number, default: null },
      mimeType: { type: String, default: null },
    },
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Build a stable conversationId from two user IDs (order-independent)
messageSchema.statics.buildConversationId = function (userIdA, userIdB, bookingId) {
  const sorted = [String(userIdA), String(userIdB)].sort().join('_');
  return bookingId ? `${sorted}_${bookingId}` : sorted;
};

module.exports = mongoose.model('Message', messageSchema);
