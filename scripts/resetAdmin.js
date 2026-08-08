/**
 * Show/Reset Admin Script
 * Run: node backend/scripts/resetAdmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function resetAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const admins = await User.find({ role: 'admin' }).select('+password');
    if (!admins.length) {
      console.log('No admin users found.');
      process.exit(0);
    }

    console.log(`Found ${admins.length} admin(s):\n`);
    for (const admin of admins) {
      console.log('  Name   :', admin.firstName, admin.lastName);
      console.log('  Email  :', admin.email);
      console.log('  Phone  :', admin.phoneNumber);
      console.log('  Active :', admin.isActive);
      console.log('  Blocked:', admin.isBlocked);
      console.log('');
    }

    // Reset password for first admin
    const admin = admins[0];
    admin.password = 'Admin@1234';
    admin.isActive = true;
    admin.isBlocked = false;
    await admin.save();

    console.log('✅ Password reset for:', admin.email);
    console.log('   New password: Admin@1234');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

resetAdmin();
