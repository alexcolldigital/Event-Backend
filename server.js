/**
 * Event Compass Backend - Main Server File
 * Entry point for the Express.js application
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const User = require('./models/User');
const Service = require('./models/Service');
const { USER_ROLES } = require('./config/constants');

// Import routes
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Initialize Express app
const app = express();

const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production';
if (trustProxy) {
  app.set('trust proxy', true);
  console.log('⚙️  Express trust proxy enabled');
}

const initializeDatabase = async () => {
  const connection = await connectDB();

  if (
    connection &&
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD
  ) {
    const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL });

    if (!existingAdmin) {
      await User.create({
        firstName: 'Event',
        lastName: 'Admin',
        email: process.env.ADMIN_EMAIL,
        phoneNumber: '+2340000000000',
        password: process.env.ADMIN_PASSWORD,
        role: USER_ROLES.ADMIN,
        isEmailVerified: true,
      });
      console.log(`Default admin account created: ${process.env.ADMIN_EMAIL}`);
    }

    if (process.env.NODE_ENV === 'development') {
      let demoProvider = await User.findOne({ email: 'provider@eventcompass.com' });
      if (!demoProvider) {
        demoProvider = await User.create({
          firstName: 'Ada',
          lastName: 'Nnamdi',
          email: 'provider@eventcompass.com',
          phoneNumber: '+2348012345678',
          password: 'Demo12345',
          role: USER_ROLES.SERVICE_PROVIDER,
          businessName: 'Ada Event Planning',
          businessType: 'event_planner',
          businessDescription: 'Premium event planning and vendor coordination.',
          isEmailVerified: true,
          isBusinessVerified: true,
        });
        console.log('Demo provider account created: provider@eventcompass.com');
      }

      const serviceCount = await Service.countDocuments();
      if (serviceCount === 0) {
        await Service.insertMany([
          {
            name: 'Premium Event Planning Package',
            description:
              'Full-service event planning with vendor coordination, timeline management, and day-of execution.',
            provider: demoProvider._id,
            providerType: 'event_planner',
            serviceType: 'Event Planning',
            category: 'Planning',
            pricing: {
              basePrice: 250000,
              unit: 'fixed',
              currency: 'NGN',
            },
            availability: {
              isAvailable: true,
              leadTime: 14,
              advanceBooking: 30,
            },
            coverageArea: {
              states: ['Lagos', 'Abuja'],
              nationwide: false,
            },
            images: [
              {
                url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
                isMain: true,
              },
            ],
            isFeatured: true,
            tags: ['wedding', 'corporate', 'planning'],
          },
          {
            name: 'Elegant Venue Decoration',
            description:
              'Modern floral styling, table setting, stage backdrop, and ambient decor for premium events.',
            provider: demoProvider._id,
            providerType: 'event_planner',
            serviceType: 'Decor',
            category: 'Decoration',
            pricing: {
              basePrice: 180000,
              unit: 'fixed',
              currency: 'NGN',
            },
            availability: {
              isAvailable: true,
              leadTime: 7,
              advanceBooking: 14,
            },
            coverageArea: {
              states: ['Lagos'],
              nationwide: false,
            },
            images: [
              {
                url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80',
                isMain: true,
              },
            ],
            isFeatured: true,
            tags: ['decor', 'wedding', 'styling'],
          },
        ]);
        console.log('Demo services created');
      }
    }
  }
};

// Connect to database
initializeDatabase().catch((error) => {
  console.error(`Database initialization failed: ${error.message}`);
});

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Base route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Event Compass API Server is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    uptime: process.uptime(),
    database: dbStates[mongoose.connection.readyState] || 'unknown',
  });
});

const requireDatabase = async (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  try {
    const connection = await connectDB();
    if (connection && mongoose.connection.readyState === 1) {
      return next();
    }
  } catch (error) {
    console.error('Database retry failed:', error.message);
  }

  return res.status(503).json({
    success: false,
    message: 'Database is not connected. Please check MongoDB configuration.',
  });
};

// API Routes
app.use('/api/auth', requireDatabase, authRoutes);
app.use('/api/services', requireDatabase, serviceRoutes);
app.use('/api/bookings', requireDatabase, bookingRoutes);
app.use('/api/admin', requireDatabase, adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const DEFAULT_PORT = 5000;
const PORT = Number(process.env.PORT) || DEFAULT_PORT;

let server = null;

const startServer = (port = PORT) => {
  server = app.listen(port, () => {
    const address = server && server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    process.env.PORT = String(actualPort);
    console.log(`✅ Event Compass Server is running on port ${actualPort}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.MONGODB_URI ? 'configured' : 'not configured'}`);
    console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is busy. Trying ${port + 1}...`);
      setImmediate(() => startServer(port + 1));
      return;
    }

    console.error('Server startup error:', error);
    process.exit(1);
  });

  return server;
};

startServer(PORT);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down server');
  if (server && server.listening) {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down server');
  if (server && server.listening) {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
