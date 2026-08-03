/**
 * Booking Scheduler Runner
 * Execute periodic booking escrow transitions.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { processExpiredAcceptances, processAutoRelease } = require('../utils/bookingScheduler');

const run = async () => {
  try {
    await connectDB();

    console.log('Running booking scheduler...');
    const expired = await processExpiredAcceptances();
    console.log('Expired acceptances processed:', expired.length);

    const released = await processAutoRelease();
    console.log('Auto-released bookings processed:', released.length);
  } catch (error) {
    console.error('Booking scheduler failed:', error);
  } finally {
    mongoose.connection.close();
  }
};

run();
