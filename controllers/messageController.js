const { Message, ChatSession } = require('../models/Message');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitizeChatMessage } = require('../utils/trust');
const { uploadToCloudinary } = require('../utils/fileUpload');
const push = require('../utils/pushNotification');
const { sendNewMessageEmail } = require('../utils/email');
const {
  initializeChatSession,
  endChatSession,
  confirmEndChatSession,
  getChatSessionInfo,
} = require('../utils/chatSession');

// ─── helpers ────────────────────────────────────────────────────────────────

const isParticipant = (booking, userId, userRole) => {
  if (userRole === 'admin') return true;
  const participants = [String(booking.client), String(booking.serviceProvider)];
  return participants.includes(String(userId));
};

// ─── Send message (text / image / file) ─────────────────────────────────────

const sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, bookingId, content } = req.body;

  if (!receiverId) {
    return res.status(400).json({ success: false, message: 'receiverId is required' });
  }

  const receiver = await User.findById(receiverId);
  if (!receiver) {
    return res.status(404).json({ success: false, message: 'Receiver not found' });
  }

  // If booking-linked, verify participation
  if (bookingId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (!isParticipant(booking, req.userId, req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking chat' });
    }
  }

  const conversationId = Message.buildConversationId(req.userId, receiverId, bookingId || null);

  let type = 'text';
  let attachment = {};
  let messageContent = content ? sanitizeChatMessage(content) : '';

  // Handle file / image upload
  if (req.file) {
    const isImage = (req.file.mimetype || '').startsWith('image/');
    type = isImage ? 'image' : 'file';

    const uploaded = typeof req.file.path === 'string' && /^https?:\/\//.test(req.file.path)
      ? { url: req.file.path, publicId: req.file.filename || null }
      : await uploadToCloudinary(req.file, 'chat');

    attachment = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      name: req.file.originalname || 'attachment',
      size: req.file.size,
      mimeType: req.file.mimetype || 'application/octet-stream',
    };
    if (!messageContent) messageContent = isImage ? '📷 Image' : `📎 ${req.file.originalname || 'File'}`;
  }

  if (!messageContent && type === 'text') {
    return res.status(400).json({ success: false, message: 'Message content is required' });
  }

  const message = await Message.create({
    conversationId,
    booking: bookingId || null,
    sender: req.userId,
    receiver: receiverId,
    content: messageContent,
    type,
    attachment: type !== 'text' ? attachment : undefined,
    readBy: [{ user: req.userId, readAt: new Date() }],
    status: 'sent',
    lastActivityAt: new Date(),
  });

  // Initialize or update chat session
  await initializeChatSession(conversationId, req.userId, receiverId, bookingId);

  await message.populate('sender', 'firstName lastName profileImage role');
  await message.populate('receiver', 'firstName lastName profileImage role');

  // Emit via Socket.IO if available
  const io = req.app.get('io');
  if (io) {
    io.to(conversationId).emit('new_message', message);
    io.to(String(receiverId)).emit('new_message_notification', { conversationId, message });
  }

  // Push + email new message notification (non-blocking)
  try {
    const senderName = `${message.sender.firstName} ${message.sender.lastName}`;
    const preview = messageContent.length > 80 ? messageContent.slice(0, 80) + '…' : messageContent;
    if (receiver.fcmToken) push.notifyNewMessage(receiver, senderName, preview);
    if (receiver.email) {
      await sendNewMessageEmail(receiver.email, {
        firstName: receiver.firstName,
        senderName,
        preview,
        conversationUrl: `${process.env.FRONTEND_URL || ''}/messages/${message.conversationId}`,
      });
    }
  } catch (_) {}

  res.status(201).json({ success: true, message: 'Message sent', data: message });
});

// ─── Get all conversations for current user ──────────────────────────────────

const getConversations = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const userObjectId = require('mongoose').Types.ObjectId.createFromHexString(userId);

  const conversations = await Message.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: [{ sender: userObjectId }, { receiver: userObjectId }],
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$receiver', userObjectId] },
                  {
                    $not: {
                      $in: [userObjectId, '$readBy.user'],
                    },
                  },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { 'lastMessage.createdAt': -1 } },
  ]);

  await Message.populate(conversations, [
    { path: 'lastMessage.sender', select: 'firstName lastName profileImage role businessName' },
    { path: 'lastMessage.receiver', select: 'firstName lastName profileImage role businessName' },
    { path: 'lastMessage.booking', select: 'bookingNumber status' },
  ]);

  const resolvedConversations = await Promise.all(
    conversations.map(async (conversation) => {
      const lastMessage = conversation.lastMessage || {};
      const lastMessageSenderId = lastMessage.sender && (typeof lastMessage.sender === 'object' ? lastMessage.sender._id : lastMessage.sender);
      const lastMessageReceiverId = lastMessage.receiver && (typeof lastMessage.receiver === 'object' ? lastMessage.receiver._id : lastMessage.receiver);

      if (!lastMessage.sender && lastMessageReceiverId) {
        const peer = await User.findById(lastMessageReceiverId).select('firstName lastName businessName role profileImage');
        if (peer) conversation.lastMessage.sender = peer;
      }

      if (!lastMessage.receiver && lastMessageSenderId) {
        const peer = await User.findById(lastMessageSenderId).select('firstName lastName businessName role profileImage');
        if (peer) conversation.lastMessage.receiver = peer;
      }

      if (!lastMessage.sender && !lastMessage.receiver && conversation._id) {
        const ids = String(conversation._id).split('_').filter(Boolean);
        const peerId = ids.find((id) => String(id) !== String(userId));
        if (peerId) {
          const peer = await User.findById(peerId).select('firstName lastName businessName role profileImage');
          if (peer) {
            conversation.lastMessage.sender = peer;
            conversation.lastMessage.receiver = { _id: userId };
          }
        }
      }

      return conversation;
    })
  );

  res.status(200).json({ success: true, conversations: resolvedConversations });
});

// ─── Get messages for a conversation ─────────────────────────────────────────

const getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  // Verify user belongs to this conversation
  const [userA, userB] = conversationId.split('_');
  const userIds = [userA, userB];
  if (req.user.role !== 'admin' && !userIds.includes(String(req.userId))) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this conversation' });
  }

  const messages = await Message.find({ conversationId, isDeleted: false })
    .populate('sender', 'firstName lastName profileImage role businessName')
    .populate('receiver', 'firstName lastName profileImage role businessName')
    .populate('booking', 'bookingNumber status')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Message.countDocuments({ conversationId, isDeleted: false });

  res.status(200).json({ success: true, messages, total, page: parseInt(page) });
});

// ─── Get messages by bookingId (legacy + convenience) ────────────────────────

const getBookingMessages = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
  if (!isParticipant(booking, req.userId, req.user.role)) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this chat' });
  }

  const messages = await Message.find({ booking: bookingId, isDeleted: false })
    .populate('sender', 'firstName lastName profileImage role businessName')
    .populate('receiver', 'firstName lastName profileImage role businessName')
    .sort({ createdAt: 1 });

  res.status(200).json({ success: true, messages });
});

// ─── Mark messages as read ────────────────────────────────────────────────────

const markRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.userId;

  await Message.updateMany(
    {
      conversationId,
      receiver: userId,
      'readBy.user': { $ne: userId },
    },
    {
      $push: { readBy: { user: userId, readAt: new Date() } },
      $set: { status: 'read' },
    }
  );

  // Notify sender that messages were read
  const io = req.app.get('io');
  if (io) {
    io.to(conversationId).emit('messages_read', { conversationId, readBy: userId });
  }

  res.status(200).json({ success: true, message: 'Messages marked as read' });
});

// ─── Delete a message (soft delete) ──────────────────────────────────────────

const deleteMessage = asyncHandler(async (req, res) => {
  const msg = await Message.findById(req.params.id);
  if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
  if (String(msg.sender) !== String(req.userId) && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  msg.isDeleted = true;
  msg.content = 'This message was deleted';
  await msg.save();

  const io = req.app.get('io');
  if (io) io.to(msg.conversationId).emit('message_deleted', { messageId: msg._id });

  res.status(200).json({ success: true, message: 'Message deleted' });
});

const clearConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  if (!conversationId) {
    return res.status(400).json({ success: false, message: 'conversationId is required' });
  }

  const [userA, userB] = conversationId.split('_');
  const userIds = [userA, userB].filter(Boolean);
  if (req.user.role !== 'admin' && !userIds.includes(String(req.userId))) {
    return res.status(403).json({ success: false, message: 'Not authorized to clear this conversation' });
  }

  const result = await Message.updateMany(
    { conversationId, isDeleted: false },
    { $set: { isDeleted: true, content: 'This message was deleted' } }
  );

  const io = req.app.get('io');
  if (io) io.to(conversationId).emit('conversation_cleared', { conversationId, deletedCount: result.modifiedCount || result.nModified || result.matchedCount || 0 });

  res.status(200).json({
    success: true,
    message: 'Conversation cleared',
    deletedCount: result.modifiedCount || result.nModified || result.matchedCount || 0,
  });
});

// ─── End chat session with satisfaction check ───────────────────────────────

const endChatSessionController = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { reason, feedback } = req.body;

  if (!conversationId) {
    return res.status(400).json({ success: false, message: 'conversationId is required' });
  }

  if (!reason || !['user_satisfied', 'user_unsatisfied', 'want_follow_up'].includes(reason)) {
    return res.status(400).json({
      success: false,
      message: 'Valid reason is required: user_satisfied, user_unsatisfied, or want_follow_up',
    });
  }

  // Verify user is admin or service provider (can be either participant)
  const [userA, userB] = conversationId.split('_');
  const userIds = [userA, userB].filter(Boolean);
  const isAuthorized = req.user.role === 'admin' || req.user.role === 'serviceProvider' || userIds.includes(String(req.userId));

  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Only admin or service providers can end chat sessions',
    });
  }

  // End the chat session
  const session = await endChatSession(conversationId, req.userId, reason, feedback || null);

  if (!session) {
    return res.status(400).json({ success: false, message: 'Chat session not found' });
  }

  // Emit event to notify other participant
  const io = req.app.get('io');
  if (io) {
    io.to(conversationId).emit('chat_session_ended', {
      conversationId,
      endedBy: req.userId,
      reason,
      feedback,
      timestamp: new Date(),
    });
  }

  res.status(200).json({
    success: true,
    message: 'Chat session ended',
    data: session,
  });
});

// ─── Get chat session info with dormancy status ──────────────────────────────

const getChatSessionStatus = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  if (!conversationId) {
    return res.status(400).json({ success: false, message: 'conversationId is required' });
  }

  // Verify user belongs to this conversation
  const [userA, userB] = conversationId.split('_');
  const userIds = [userA, userB];
  if (req.user.role !== 'admin' && !userIds.includes(String(req.userId))) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this session' });
  }

  const sessionInfo = await getChatSessionInfo(conversationId);

  if (!sessionInfo) {
    return res.status(404).json({ success: false, message: 'Chat session not found' });
  }

  res.status(200).json({
    success: true,
    data: sessionInfo,
  });
});

// ─── Client confirms end of chat session ────────────────────────────────────

const confirmEndChatSessionController = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  if (!conversationId) {
    return res.status(400).json({ success: false, message: 'conversationId is required' });
  }

  // Any participant can confirm
  const [userA, userB] = conversationId.split('_');
  const userIds = [userA, userB].filter(Boolean);
  if (req.user.role !== 'admin' && !userIds.includes(String(req.userId))) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const { session, bothConfirmed } = await confirmEndChatSession(conversationId, req.userId);

  if (!session) {
    return res.status(400).json({ success: false, message: 'Chat session not found or still active' });
  }

  const io = req.app.get('io');
  if (io) {
    io.to(conversationId).emit('chat_end_confirmed', {
      conversationId,
      confirmedBy: req.userId,
      bothConfirmed,
      scheduledDeleteAt: session.scheduledDeleteAt,
    });
  }

  res.status(200).json({
    success: true,
    message: bothConfirmed
      ? 'Both parties confirmed. Messages will be deleted in 24 hours.'
      : 'Confirmation recorded. Waiting for the other party.',
    bothConfirmed,
    scheduledDeleteAt: session.scheduledDeleteAt,
  });
});

module.exports = {
  sendMessage,
  getConversations,
  getMessages,
  getBookingMessages,
  markRead,
  deleteMessage,
  clearConversation,
  endChatSessionController,
  confirmEndChatSessionController,
  getChatSessionStatus,
};
