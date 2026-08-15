jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  })),
}));

describe('email configuration guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'development';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'eventcompass2@gmail.com';
    process.env.SMTP_PASS = 'secret-password';
    process.env.FROM_EMAIL = 'noreply@eventcompass.com';
    delete process.env.EMAILS_ENABLED;
    delete process.env.ENABLE_EMAILS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('skips sending emails unless explicitly enabled in development', async () => {
    const nodemailer = require('nodemailer');
    const { sendEmailVerificationEmail } = require('../utils/email');

    await expect(
      sendEmailVerificationEmail('user@example.com', 'Test User', 'https://example.com/verify')
    ).resolves.toBeUndefined();

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });
});
