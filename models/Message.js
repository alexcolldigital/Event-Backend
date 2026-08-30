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
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Build a stable conversationId from two user IDs (order-independent)
messageSchema.statics.buildConversationId = function (userIdA, userIdB, bookingId) {
  const sorted = [String(userIdA), String(userIdB)].sort().join('_');
  return bookingId ? `${sorted}_${bookingId}` : sorted;
};

// Create a new model for ChatSession to track conversation status and dormancy
const chatSessionSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    participantA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participantB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    endReason: {
      type: String,
      enum: ['user_satisfied', 'user_unsatisfied', 'want_follow_up', 'dormant'],
      default: null,
    },
    satisfactionFeedback: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

const Message = mongoose.model('Message', messageSchema);
const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = { Message, ChatSession };
