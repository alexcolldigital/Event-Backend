const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let app;
let User;

beforeAll(async () => {
  app = require('../server');
  User = require('../models/User');

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
}, 20000);

describe('email verification gate', () => {
  it('requires email verification before allowing a user to authenticate', async () => {
    const email = `verify_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'Password123!';

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Verify',
        lastName: 'User',
        email,
        phoneNumber: `+234${String(Date.now()).slice(-9)}`,
        country: 'Nigeria',
        countryCode: 'NG',
        dialCode: '+234',
        password,
        passwordConfirm: password,
      })
      .expect(201);

    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.token).toBeUndefined();
    expect(registerRes.body.requiresEmailVerification).toBe(true);

    const loginBeforeVerify = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(403);

    expect(loginBeforeVerify.body.success).toBe(false);
    expect(loginBeforeVerify.body.requiresEmailVerification).toBe(true);

    const user = await User.findOne({ email });
    const verificationToken = user.getEmailVerificationToken();
    await user.save();

    const verifyRes = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);

    const loginAfterVerify = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginAfterVerify.body.success).toBe(true);
    expect(loginAfterVerify.body.token).toBeDefined();
  });

  it('defaults registration to email verification and does not require SMS verification', async () => {
    const email = `email_only_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'Password123!';

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Email',
        lastName: 'Only',
        email,
        phoneNumber: `+234${String(Date.now()).slice(-9)}`,
        country: 'Nigeria',
        countryCode: 'NG',
        dialCode: '+234',
        password,
        passwordConfirm: password,
      })
      .expect(201);

    expect(registerRes.body.success).toBe(true);
    expect(registerRes.body.token).toBeUndefined();
    expect(registerRes.body.requiresEmailVerification).toBe(true);
    expect(registerRes.body.requiresPhoneVerification).toBeUndefined();
  });
});
