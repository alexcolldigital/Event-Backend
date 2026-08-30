const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

router.get('/contact', supportController.getSupportContact);

module.exports = router;
