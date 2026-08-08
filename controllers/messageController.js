const Message = require('../models/Message');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitizeChatMessage } = require('../utils/trust');
const { uploadToCloudinary } = require('../utils/fileUpload');
const push = require('../utils/pushNotification');

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
    const isImage = req.file.mimetype.startsWith('image/');
    type = isImage ? 'image' : 'file';
    const uploaded = await uploadToCloudinary(req.file, 'chat');
    attachment = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    };
    if (!messageContent) messageContent = isImage ? '📷 Image' : `📎 ${req.file.originalname}`;
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
  });

  await message.populate('sender', 'firstName lastName profileImage role');
  await message.populate('receiver', 'firstName lastName profileImage role');

  // Emit via Socket.IO if available
  const io = req.app.get('io');
  if (io) {
    io.to(conversationId).emit('new_message', message);
    io.to(String(receiverId)).emit('new_message_notification', { conversationId, message });
  }

  // Push new message notification (non-blocking)
  try {
    if (receiver.fcmToken && receiver.preferences?.notifications !== false) {
      const senderName = `${message.sender.firstName} ${message.sender.lastName}`;
      const preview = messageContent.length > 60 ? messageContent.slice(0, 60) + '…' : messageContent;
      push.notifyNewMessage(receiver.fcmToken, senderName, preview);
    }
  } catch (_) {}

  res.status(201).json({ success: true, message: 'Message sent', data: message });
});

// ─── Get all conversations for current user ──────────────────────────────────

const getConversations = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Get latest message per conversation
  const conversations = await Message.aggregate([
    {
      $match: {
        isDeleted: false,
        $or: [{ sender: require('mongoose').Types.ObjectId.createFromHexString(userId) }, { receiver: require('mongoose').Types.ObjectId.createFromHexString(userId) }],
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
                  { $eq: ['$receiver', require('mongoose').Types.ObjectId.createFromHexString(userId)] },
                  {
                    $not: {
                      $in: [require('mongoose').Types.ObjectId.createFromHexString(userId), '$readBy.user'],
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

  // Populate sender/receiver on each last message
  await Message.populate(conversations, [
    { path: 'lastMessage.sender', select: 'firstName lastName profileImage role businessName' },
    { path: 'lastMessage.receiver', select: 'firstName lastName profileImage role businessName' },
    { path: 'lastMessage.booking', select: 'bookingNumber status' },
  ]);

  res.status(200).json({ success: true, conversations });
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

module.exports = {
  sendMessage,
  getConversations,
  getMessages,
  getBookingMessages,
  markRead,
  deleteMessage,
};
