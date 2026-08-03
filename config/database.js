/**
 * Database Configuration
 * Handles MongoDB connection and initialization
 */

const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * @returns {Promise} - MongoDB connection promise
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('open', resolve);
      mongoose.connection.once('error', reject);
    });
    return mongoose.connection;
  }

  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;

    if (!uri) {
      console.error('MongoDB connection failed: missing MongoDB connection string. Set MONGODB_URI, MONGO_URI, or MONGODB_URL.');
      return null;
    }

    const trimmedUri = uri.trim();
    if (!/^mongodb(\+srv)?:\/\//i.test(trimmedUri)) {
      console.error('MongoDB connection failed: invalid connection string scheme. It must start with "mongodb://" or "mongodb+srv://".');
      return null;
    }

    const conn = await mongoose.connect(trimmedUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    return null;
  }
};

module.exports = connectDB;
