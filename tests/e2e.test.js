/**
 * End-to-End Integration Test
 * Full journey: register → login → admin adds services → customer browses/carts/checkout
 *               → admin confirms booking → customer pays → chat with notifications
 */

const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let app;

jest.mock('../utils/gateway', () => ({
  initializeCheckout: jest.fn(async ({ booking }) => ({
    checkoutUrl: `https://checkout.test/event-compass/${booking._id}`,
    gateway: 'paystack',
    reference: `TEST-${booking._id}`,
  })),
  refund: jest.fn(async () => ({ status: true })),
  transferToProvider: jest.fn(async () => ({ status: true })),
}));

jest.mock('../utils/email', () => ({
  sendWelcomeEmail: jest.fn(async () => true),
  sendPasswordResetEmail: jest.fn(async () => true),
  sendApprovalEmail: jest.fn(async () => true),
  sendTwoFactorEmail: jest.fn(async () => true),
  sendEmailVerificationEmail: jest.fn(async () => true),
  sendBookingConfirmationEmail: jest.fn(async () => true),
}));

// ─── Shared state across tests ────────────────────────────────────────────────
let adminToken, customerToken, providerToken;
let adminId, customerId, providerId;
let canopyServiceId, chairServiceId;
let bookingId;
let adminDeleteBookingId;
let conversationId;

const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_EMAIL = `e2e_admin_${RUN_ID}@example.com`;
const ADMIN_PASSWORD = 'Admin123!';

const CUSTOMER = {
  firstName:   'Test',
  lastName:    'Customer',
  email:       `testcustomer_${RUN_ID}@example.com`,
  phoneNumber: `+23480${RUN_ID.slice(-8)}`,
  password:    'Customer123!',
  passwordConfirm: 'Customer123!',
};

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  app = require('../server');
  const User = require('../models/User');
  const { USER_ROLES } = require('../config/constants');

  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MongoDB connection timed out')), 15000);
      mongoose.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      mongoose.connection.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  await User.deleteOne({ email: CUSTOMER.email });
  await User.deleteOne({ phoneNumber: CUSTOMER.phoneNumber });

  let admin = await User.findOne({ email: ADMIN_EMAIL }).select('+password');
  if (!admin) {
    admin = new User({
      firstName: 'Event',
      lastName: 'Admin',
      email: ADMIN_EMAIL,
      phoneNumber: `+23470${RUN_ID.slice(-8)}`,
      password: ADMIN_PASSWORD,
      role: USER_ROLES.ADMIN,
      isEmailVerified: true,
      isActive: true,
      isBlocked: false,
    });
  } else {
    admin.password = ADMIN_PASSWORD;
    admin.role = USER_ROLES.ADMIN;
    admin.isActive = true;
    admin.isBlocked = false;
    admin.failedLoginAttempts = 0;
    admin.lockUntil = undefined;
  }
  await admin.save();
}, 20000);

afterAll(async () => {
  const User = require('../models/User');
  const Service = require('../models/Service');
  const Booking = require('../models/Booking');
  const Message = require('../models/Message');

  const serviceIds = [canopyServiceId, chairServiceId].filter(Boolean);
  if (conversationId) {
    await Message.deleteMany({ conversationId });
  }
  if (bookingId) {
    await Message.deleteMany({ booking: bookingId });
  }
  if (adminDeleteBookingId) {
    await Booking.deleteOne({ _id: adminDeleteBookingId });
  }
  if (customerId) {
    await Booking.deleteMany({ client: customerId });
  }
  if (serviceIds.length > 0) {
    await Service.deleteMany({ _id: { $in: serviceIds } });
  }
  await User.deleteMany({ email: { $in: [ADMIN_EMAIL, CUSTOMER.email] } });

  await mongoose.connection.close();
}, 10000);

// ─── 1. Customer Registration ─────────────────────────────────────────────────
describe('1. Customer Registration', () => {
  it('registers a new customer account', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(CUSTOMER)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(CUSTOMER.email);
    expect(res.body.user.role).toBe('client');
    customerId = res.body.user._id || res.body.user.id;
  });

  it('rejects duplicate email registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(CUSTOMER)
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

// ─── 2. Login ─────────────────────────────────────────────────────────────────
describe('2. Login', () => {
  it('admin logs in successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    adminToken = res.body.token;
    adminId    = res.body.user._id || res.body.user.id;
  });

  it('customer logs in successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CUSTOMER.email, password: CUSTOMER.password })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    customerToken = res.body.token;
    customerId    = res.body.user._id || res.body.user.id;
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: CUSTOMER.email, password: 'wrongpassword' })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('returns current user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe(CUSTOMER.email);
  });
});

// ─── 3. Admin Creates Services ────────────────────────────────────────────────
describe('3. Admin Creates Services (Canopy & Chairs)', () => {
  it('admin creates a canopy rental service with image', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:        '40x80 Canopy Tent Rental',
        description: 'Large 40x80 canopy tent with setup and takedown, suitable for 300+ guests.',
        serviceType: 'Canopy Rental',
        category:    'Canopies and Tent',
        providerType: 'events_facilities_rental_and_hiring_company',
        pricing: { basePrice: 120000, unit: 'fixed', currency: 'NGN' },
        images: [{ url: 'https://images.unsplash.com/photo-1478146059778-26028b07395a?auto=format&fit=crop&w=1200&q=80', isMain: true }],
        tags: ['canopy', 'tent', 'rental'],
        isActive: true,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.service.name).toBe('40x80 Canopy Tent Rental');
    canopyServiceId = res.body.service._id;
  });

  it('admin creates a chair rental service with image', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:        'Chivalry Chair Rental (100 units)',
        description: 'Premium chivalry chair rental for weddings and formal events, 100-unit package.',
        serviceType: 'Chair Rental',
        category:    'Chairs',
        providerType: 'events_facilities_rental_and_hiring_company',
        pricing: { basePrice: 50000, unit: 'fixed', currency: 'NGN' },
        images: [{ url: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?auto=format&fit=crop&w=1200&q=80', isMain: true }],
        tags: ['chairs', 'rental'],
        isActive: true,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.service.name).toBe('Chivalry Chair Rental (100 units)');
    chairServiceId = res.body.service._id;
  });

  it('rejects service creation without admin token', async () => {
    const res = await request(app)
      .post('/api/admin/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Hack', description: 'x', serviceType: 'x', providerType: 'events_service_provider' })
      .expect(403);

    expect(res.body.success).toBe(false);
  });
});

// ─── 4. Customer Browses Services ─────────────────────────────────────────────
describe('4. Customer Browses Services', () => {
  it('lists all services publicly', async () => {
    const res = await request(app)
      .get('/api/services')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.services)).toBe(true);
    expect(res.body.services.length).toBeGreaterThan(0);
  });

  it('fetches the canopy service by ID', async () => {
    const res = await request(app)
      .get(`/api/services/${canopyServiceId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.service._id).toBe(canopyServiceId);
    expect(res.body.service.name).toContain('Canopy');
    expect(res.body.service.images.length).toBeGreaterThan(0);
  });

  it('fetches the chair service by ID', async () => {
    const res = await request(app)
      .get(`/api/services/${chairServiceId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.service._id).toBe(chairServiceId);
    expect(res.body.service.name).toContain('Chair');
  });

  it('searches services by keyword', async () => {
    const res = await request(app)
      .get('/api/services/search?q=canopy')
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});

// ─── 5. Cart Checkout (Customer selects services + event info) ────────────────
describe('5. Customer Adds Services to Cart and Checks Out', () => {
  it('checks out a cart with canopy + chairs and event details', async () => {
    const res = await request(app)
      .post('/api/bookings/checkout')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cartItems: [
          { serviceId: canopyServiceId, quantity: 1, specialRequirements: 'Setup by 8am' },
          { serviceId: chairServiceId,  quantity: 100, specialRequirements: 'Arrange in rows' },
        ],
        bookingDetails: {
          eventDate:      '2026-12-20T10:00:00.000Z',
          eventEndDate:   '2026-12-20T22:00:00.000Z',
          eventTime:      '10:00 AM',
          numberOfGuests: 200,
          clientNotes:    'Birthday party for 200 guests',
          bookingLocation: {
            country: 'Nigeria',
            state:   'Lagos',
            city:    'Ikeja',
            address: '18, Allen Avenue, Ikeja',
          },
          eventType: 'birthday_party',
          eventName: 'John\'s 30th Birthday',
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings.length).toBe(2);

    // Save first booking ID for subsequent tests
    bookingId = res.body.bookings[0]._id;

    res.body.bookings.forEach((b) => {
      expect(b.status).toBe('pending');
      expect(b.client).toBeDefined();
      expect(b.pricing.totalAmount).toBeGreaterThan(0);
    });
  });

  it('rejects checkout without authentication', async () => {
    const res = await request(app)
      .post('/api/bookings/checkout')
      .send({ cartItems: [{ serviceId: canopyServiceId, quantity: 1 }], bookingDetails: { eventDate: '2026-12-20T10:00:00.000Z' } })
      .expect(401);

    expect(res.body.success).toBe(false);
  });
});

// ─── 6. Customer Views Their Bookings ─────────────────────────────────────────
describe('6. Customer Views Bookings', () => {
  it('customer retrieves their bookings list', async () => {
    const res = await request(app)
      .get('/api/bookings/client/my-bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings.length).toBeGreaterThan(0);
  });

  it('customer retrieves a specific booking by ID', async () => {
    const res = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.booking._id).toBe(bookingId);
    expect(res.body.booking.status).toBe('pending');
  });
});

// ─── 7. Admin Confirms the Booking ────────────────────────────────────────────
describe('7. Admin Confirms Booking', () => {
  it('admin sees all pending bookings', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?status=pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
  });

  it('admin confirms the customer booking', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('confirmed');
  });

  it('booking status is now confirmed when customer checks', async () => {
    const res = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.booking.status).toBe('confirmed');
  });
});

// ─── 8. Customer Initiates Payment ────────────────────────────────────────────
describe('8. Customer Initiates Payment', () => {
  it('creates a payment session for the confirmed booking', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/payment-session`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ origin: 'https://event-compass-theta.vercel.app' })
      .expect(200);

    expect(res.body.success).toBe(true);
    // checkoutUrl may be present if Paystack is reachable
    // We just verify the endpoint responds correctly
    expect(res.body.booking).toBeDefined();
  });

  it('marks booking payment as successful (simulates webhook callback)', async () => {
    const res = await request(app)
      .post(`/api/bookings/${bookingId}/payment-success`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.booking.payment.status).toBe('completed');
    expect(res.body.booking.escrow.releaseStatus).toBe('held');
  });
});

// ─── 9. Chat: Customer Messages Admin About Booking ───────────────────────────
describe('9. Chat - Customer Messages Admin About Booking', () => {
  it('customer sends a message to admin about the booking', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        receiverId: adminId,
        bookingId,
        content: 'Hi, I just paid for my booking. Can you confirm the canopy setup time?',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toContain('canopy setup time');
    conversationId = res.body.data.conversationId;
  });

  it('admin replies to the customer message', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        receiverId: customerId,
        bookingId,
        content: 'Hello! Your booking is confirmed. The canopy will be set up by 8am on the event day.',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toContain('8am');
  });

  it('customer retrieves the conversation messages', async () => {
    const res = await request(app)
      .get(`/api/messages/conversation/${conversationId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('admin retrieves their conversations list', async () => {
    const res = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.conversations)).toBe(true);
    expect(res.body.conversations.length).toBeGreaterThan(0);
    const bookingConversation = res.body.conversations.find((c) => c._id === conversationId);
    expect(bookingConversation).toBeDefined();
    expect(bookingConversation.unreadCount).toBeGreaterThanOrEqual(1);
  });

  it('customer retrieves their conversations list', async () => {
    const res = await request(app)
      .get('/api/messages/conversations')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.conversations)).toBe(true);
  });

  it('admin marks conversation as read', async () => {
    const res = await request(app)
      .patch(`/api/messages/conversation/${conversationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it('retrieves booking-linked messages', async () => {
    const res = await request(app)
      .get(`/api/messages/booking/${bookingId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 10. Admin Dashboard & Notifications ──────────────────────────────────────
describe('10. Admin Dashboard and Notifications', () => {
  it('admin views dashboard statistics', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.stats.users.total).toBeGreaterThan(0);
    expect(res.body.stats.bookings.total).toBeGreaterThan(0);
  });

  it('admin views all users', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('admin views all bookings', async () => {
    const res = await request(app)
      .get('/api/admin/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.bookings)).toBe(true);
  });

  it('admin views all services', async () => {
    const res = await request(app)
      .get('/api/admin/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.services)).toBe(true);
  });
});

// ─── 11. Cleanup: Admin Completes Booking ─────────────────────────────────────
describe('11. Admin Completes Booking', () => {
  it('admin marks the booking as completed', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('completed');
  });
});

// 12. Admin Deletes Services
describe('12. Admin Deletes Services', () => {
  it('admin deletes a service with no linked bookings', async () => {
    const res = await request(app)
      .delete(`/api/admin/services/${chairServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Service deleted successfully');

    await request(app)
      .get(`/api/admin/services/${chairServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('admin removes a booked service from listings while preserving booking history', async () => {
    const Booking = require('../models/Booking');

    const deleteBooking = await Booking.create({
      bookingNumber: `EC-DELETE-${RUN_ID}`,
      client: customerId,
      serviceProvider: adminId,
      service: canopyServiceId,
      bookingType: 'service',
      eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      pricing: { basePrice: 120000, totalAmount: 120000, currency: 'NGN' },
    });
    adminDeleteBookingId = deleteBooking._id;

    const res = await request(app)
      .delete(`/api/admin/services/${canopyServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Service removed from listings. Booking history was preserved.');

    await request(app)
      .get(`/api/admin/services/${canopyServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const bookingRes = await request(app)
      .get(`/api/admin/bookings/${adminDeleteBookingId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(bookingRes.body.success).toBe(true);
    expect(String(bookingRes.body.booking.service?._id || bookingRes.body.booking.service)).toBe(canopyServiceId);
  });
});
