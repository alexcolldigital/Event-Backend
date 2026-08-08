const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');

// Cloudinary storage for chat attachments (images + files)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'event-compass/chat',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
}).single('attachment');

// Send message (text or with attachment)
router.post('/', authenticate, chatUpload, messageController.sendMessage);

// Get all conversations for current user
router.get('/conversations', authenticate, messageController.getConversations);

// Get messages by conversationId
router.get('/conversation/:conversationId', authenticate, messageController.getMessages);

// Get messages by bookingId
router.get('/booking/:bookingId', authenticate, messageController.getBookingMessages);

// Mark conversation as read
router.patch('/conversation/:conversationId/read', authenticate, messageController.markRead);

// Delete a message
router.delete('/:id', authenticate, messageController.deleteMessage);

module.exports = router;
