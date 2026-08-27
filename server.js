/**
 * Event Compass Backend - Main Server File
 * Entry point for the Express.js application
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const { sanitizeInputs, stripXSS, preventHPP, globalApiLimiter } = require('./middleware/security');
const User = require('./models/User');
const Service = require('./models/Service');
const { USER_ROLES } = require('./config/constants');

// Import routes
const authRoutes = require('./routes/authRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const messageRoutes = require('./routes/messageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const bookingController = require('./controllers/bookingController');
const scheduler = require('./utils/scheduler');
const { getEmailStatus, verifyEmailTransport } = require('./utils/email');

// Initialize Express app + HTTP server + Socket.IO
const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      'https://event-compass-theta.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:19006',
      'http://localhost:19007',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Attach io to app so controllers can emit events
app.set('io', io);

// ─── Socket.IO real-time messaging ──────────────────────────────────────────
io.on('connection', (socket) => {
  // Join personal room (userId) and any conversation rooms
  socket.on('join', ({ userId, conversationIds = [] }) => {
    if (userId) socket.join(String(userId));
    conversationIds.forEach((id) => socket.join(id));
  });

  socket.on('join_conversation', ({ conversationId }) => {
    if (conversationId) socket.join(conversationId);
  });

  socket.on('leave_conversation', ({ conversationId }) => {
    if (conversationId) socket.leave(conversationId);
  });

  // Typing indicators
  socket.on('typing_start', ({ conversationId, userId, userName }) => {
    socket.to(conversationId).emit('typing_start', { userId, userName, conversationId });
  });

  socket.on('typing_stop', ({ conversationId, userId }) => {
    socket.to(conversationId).emit('typing_stop', { userId, conversationId });
  });

  socket.on('disconnect', () => {});
});

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

    {
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
          { name: 'Premium Event Planning Package', description: 'Full-service event planning with vendor coordination, timeline management, and day-of execution.', provider: demoProvider._id, providerType: 'event_planner', serviceType: 'Event Planning', category: 'Event Planners and Managers', pricing: { basePrice: 250000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: true, tags: ['wedding', 'corporate', 'planning'] },
          { name: 'Corporate Event Management', description: 'End-to-end corporate event management including venue sourcing, logistics, and on-site coordination.', provider: demoProvider._id, providerType: 'event_planner', serviceType: 'Event Planning', category: 'Event Planners and Managers', pricing: { basePrice: 300000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['corporate', 'planning'] },
          { name: 'Elegant Venue Decoration', description: 'Modern floral styling, table setting, stage backdrop, and ambient decor for premium events.', provider: demoProvider._id, providerType: 'event_planner', serviceType: 'Decor', category: 'Event Decorators', pricing: { basePrice: 180000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: true, tags: ['decor', 'wedding', 'styling'] },
          { name: 'Floral & Balloon Decoration', description: 'Creative floral arrangements and balloon art for weddings, birthdays, and corporate events.', provider: demoProvider._id, providerType: 'event_planner', serviceType: 'Decor', category: 'Event Decorators', pricing: { basePrice: 95000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1478146059778-26028b07395a?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['decor', 'floral'] },
          { name: 'Professional Event Photography', description: 'High-quality event photography with same-day preview and full gallery delivery within 7 days.', provider: demoProvider._id, providerType: 'events_service_provider', serviceType: 'Photography', category: 'Events Services Providers and Vendors', pricing: { basePrice: 120000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['photography', 'wedding'] },
          { name: 'Authentic Nigerian Catering', description: 'Full catering service with authentic Nigerian cuisine, serving up to 500 guests.', provider: demoProvider._id, providerType: 'food_caterer', serviceType: 'Catering', category: 'Food Caterers', pricing: { basePrice: 350000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['catering', 'food', 'wedding'] },
          { name: 'Continental Buffet Service', description: 'Premium continental buffet catering for corporate events and weddings, up to 300 guests.', provider: demoProvider._id, providerType: 'food_caterer', serviceType: 'Catering', category: 'Food Caterers', pricing: { basePrice: 280000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: true, tags: ['catering', 'buffet'] },
          { name: 'Live Band Entertainment', description: 'Professional live band for weddings, corporate events, and parties.', provider: demoProvider._id, providerType: 'music_dj_and_live_performance', serviceType: 'Live Band', category: 'Music (D-J and Live Performances)', pricing: { basePrice: 200000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: true, tags: ['music', 'band'] },
          { name: 'DJ Services & Sound System', description: 'Professional DJ with state-of-the-art sound system and lighting for any event.', provider: demoProvider._id, providerType: 'music_dj_and_live_performance', serviceType: 'DJ', category: 'Music (D-J and Live Performances)', pricing: { basePrice: 80000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['dj', 'music'] },
          { name: 'Premium Event Venue - Victoria Island', description: 'Elegant event hall with capacity for 500 guests, full AV setup, and dedicated parking.', provider: demoProvider._id, providerType: 'events_venue_owner_and_manager', serviceType: 'Venue', category: 'Events Venues', pricing: { basePrice: 500000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: true, tags: ['venue', 'hall', 'wedding'] },
          { name: 'Outdoor Garden Venue', description: 'Beautiful outdoor garden venue for intimate events, capacity 150 guests.', provider: demoProvider._id, providerType: 'events_venue_owner_and_manager', serviceType: 'Venue', category: 'Events Venues', pricing: { basePrice: 200000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['venue', 'outdoor'] },
          { name: 'Bridal Makeup & Glam', description: 'Professional bridal makeup, hair styling, and full glam for the bride and bridal party.', provider: demoProvider._id, providerType: 'makeup_artist', serviceType: 'Makeup', category: 'Make-up Artists', pricing: { basePrice: 75000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['makeup', 'bridal'] },
          { name: '40x80 Canopy Tent Rental', description: 'Large 40x80 canopy tent rental with setup and takedown, suitable for 300+ guests.', provider: demoProvider._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Canopy Rental', category: 'Canopies and Tent', pricing: { basePrice: 120000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1478146059778-26028b07395a?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['canopy', 'tent', 'rental'] },
          { name: 'Chivalry Chair Rental (100 units)', description: 'Premium chivalry chair rental for weddings and formal events, 100-unit package.', provider: demoProvider._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Chair Rental', category: 'Chairs', pricing: { basePrice: 50000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['chairs', 'rental'] },
          { name: 'Banquet Table Rental (20 units)', description: 'Banquet table rental with linen covers, 20-unit package for events.', provider: demoProvider._id, providerType: 'events_facilities_rental_and_hiring_company', serviceType: 'Table Rental', category: 'Tables', pricing: { basePrice: 30000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['tables', 'rental'] },
          { name: 'Drinks & Beverages Supply', description: 'Full drinks supply including soft drinks, water, and alcoholic beverages for events.', provider: demoProvider._id, providerType: 'drinks_supplier', serviceType: 'Drinks Supply', category: 'Drinks Suppliers', pricing: { basePrice: 150000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['drinks', 'beverages'] },
          { name: 'Professional MC Services', description: 'Experienced MC for weddings, corporate events, and parties with bilingual capability.', provider: demoProvider._id, providerType: 'mc_and_compares', serviceType: 'MC', category: 'MCs and Compares', pricing: { basePrice: 60000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['mc', 'host'] },
          { name: 'Stand-up Comedy & Entertainment', description: 'Professional comedian and entertainer for events, corporate shows, and parties.', provider: demoProvider._id, providerType: 'comedian_and_entertainer', serviceType: 'Comedy', category: 'Comedians and Entertainers', pricing: { basePrice: 100000, unit: 'fixed', currency: 'NGN' }, availability: { isAvailable: true }, images: [{ url: 'https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=1200&q=80', isMain: true }], isFeatured: false, tags: ['comedy', 'entertainment'] },
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
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const allowedOrigins = [
  'https://event-compass-theta.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:19006',
  'http://localhost:19007',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-device-name'],
}));
app.use(morgan('dev')); // Logging

// Security: NoSQL injection prevention, XSS stripping, HPP
app.use(sanitizeInputs);
app.use(stripXSS);
app.use(preventHPP);

// Global API rate limiting
app.use('/api/', globalApiLimiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Paystack webhook (needs raw body for signature verification)
app.post('/api/bookings/webhook/paystack', express.raw({ type: '*/*' }), bookingController.handlePaystackWebhookRaw);

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
app.use('/api/messages', requireDatabase, messageRoutes);
app.use('/api/admin', requireDatabase, adminRoutes);

const frontendDistPath = path.join(__dirname, '../frontend/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }

    if (req.accepts('html')) {
      return res.sendFile(frontendIndexPath);
    }

    return next();
  });
}

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
  server = httpServer.listen(port, () => {
    const address = server && server.address();
    const actualPort = address && typeof address === 'object' ? address.port : port;
    process.env.PORT = String(actualPort);
    console.log(`✅ Event Compass Server is running on port ${actualPort}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🗄️  Database: ${process.env.MONGODB_URI ? 'configured' : 'not configured'}`);
    console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL}`);
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is busy. Trying ${port + 1}...`);
      server.close(() => startServer(port + 1));
      return;
    }
    console.error('Server startup error:', error);
    process.exit(1);
  });

  return server;
};

if (process.env.NODE_ENV !== 'test') {
  startServer(PORT);

  // Start background schedulers (expired acceptances, auto-releases)
  try {
    scheduler.startSchedulers();
    console.log('Scheduler started: processExpiredAcceptances and auto-releases');
  } catch (e) {
    console.warn('Failed to start scheduler', e.message || e);
  }
}

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
