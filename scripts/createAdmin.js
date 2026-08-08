/**
 * Create Admin User Script
 * Run: node backend/scripts/createAdmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const ADMIN = {
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@eventcompass.com',
  phoneNumber: '08000000000',
  password: 'Admin@1234',
  role: 'admin',
};

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ email: ADMIN.email });
    if (existing) {
      console.log('Admin already exists:', ADMIN.email);
      process.exit(0);
    }

    const admin = new User(ADMIN);
    await admin.save();

    console.log('✅ Admin created successfully!');
    console.log('   Email   :', ADMIN.email);
    console.log('   Password:', ADMIN.password);
    console.log('   Role    :', ADMIN.role);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createAdmin();
