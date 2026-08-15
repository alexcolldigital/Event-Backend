const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');

// Custom Cloudinary storage engine (compatible with cloudinary v2)
const chatStorage = {
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'event-compass/chat', resource_type: 'auto' },
      (error, result) => {
        if (error) return cb(error);
        cb(null, { path: result.secure_url, filename: result.public_id });
      }
    );
    file.stream.pipe(uploadStream);
  },
  _removeFile(req, file, cb) {
    cloudinary.uploader.destroy(file.filename, cb);
  },
};

const chatUpload = multer({
  storage: chatStorage,
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

// Delete a message
router.delete('/:id', authenticate, messageController.deleteMessage);

module.exports = router;
