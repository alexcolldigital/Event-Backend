const express = require('express');
const router = express.Router();
const multer = require('multer');
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');

// Keep multipart parsing simple and let the controller upload to Cloudinary once.
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
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

// Clear an entire chat conversation after provider/admin confirms no further questions
router.delete('/conversation/:conversationId', authenticate, messageController.clearConversation);

// End chat session with satisfaction check
router.post('/conversation/:conversationId/end', authenticate, messageController.endChatSessionController);

// Confirm end of chat session (client confirms)
router.post('/conversation/:conversationId/confirm-end', authenticate, messageController.confirmEndChatSessionController);

// Get chat session status with dormancy info
router.get('/conversation/:conversationId/status', authenticate, messageController.getChatSessionStatus);

// Delete a message
router.delete('/:id', authenticate, messageController.deleteMessage);

module.exports = router;
