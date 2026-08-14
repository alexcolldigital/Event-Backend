/**
 * Email Utility
 * Handles sending emails
 */

const nodemailer = require('nodemailer');

const isEmailConfigured = () =>
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  !process.env.SMTP_USER.includes('your_') &&
  !process.env.SMTP_PASS.includes('your_');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (email, firstName, activationUrl) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping welcome email');
    return;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Welcome to Event Compass',
    html: `
      <h2>Welcome to Event Compass, ${firstName}!</h2>
      <p>Thank you for joining our event management marketplace.</p>
      <p><a href="${activationUrl}">Click here to verify your email</a></p>
      <p>If you didn't create this account, please ignore this email.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', email);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

/**
 * Send booking confirmation email
 */
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping booking confirmation email');
    return;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: `Booking Confirmation - ${bookingDetails.bookingNumber}`,
    html: `
      <h2>Booking Confirmed!</h2>
      <p>Your booking has been confirmed.</p>
      <ul>
        <li><strong>Booking Number:</strong> ${bookingDetails.bookingNumber}</li>
        <li><strong>Event Date:</strong> ${bookingDetails.eventDate}</li>
        <li><strong>Total Amount:</strong> ${bookingDetails.totalAmount}</li>
        <li><strong>Status:</strong> ${bookingDetails.status}</li>
      </ul>
      <p>Thank you for using Event Compass!</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Booking confirmation email sent to:', email);
  } catch (error) {
    console.error('Error sending booking email:', error);
  }
};

/**
 * Send payment receipt email
 */
const sendPaymentReceiptEmail = async (email, paymentDetails) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping payment receipt email');
    return;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: `Payment Receipt - ${paymentDetails.transactionId}`,
    html: `
      <h2>Payment Receipt</h2>
      <p>Your payment has been received.</p>
      <ul>
        <li><strong>Transaction ID:</strong> ${paymentDetails.transactionId}</li>
        <li><strong>Amount:</strong> ${paymentDetails.amount}</li>
        <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
        <li><strong>Status:</strong> ${paymentDetails.status}</li>
      </ul>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Payment receipt email sent to:', email);
  } catch (error) {
    console.error('Error sending payment email:', error);
  }
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping password reset email');
    return;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};

/**
 * Send email verification email
 */
const sendEmailVerificationEmail = async (email, firstName, verificationUrl) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping verification email');
    return;
  }
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Verify Your Email - Event Compass',
    html: `
      <h2>Hello ${firstName},</h2>
      <p>Please verify your email address to activate your Event Compass account.</p>
      <p><a href="${verificationUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Verify Email</a></p>
      <p>This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
  }
};

/**
 * Send 2FA code email
 */
const sendTwoFactorEmail = async (email, firstName, code) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping 2FA email');
    return;
  }
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your Login Verification Code - Event Compass',
    html: `
      <h2>Hello ${firstName},</h2>
      <p>Your two-factor authentication code is:</p>
      <h1 style="letter-spacing:8px;font-size:36px;color:#4F46E5;">${code}</h1>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p>If you didn't attempt to login, please change your password immediately.</p>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending 2FA email:', error);
  }
};

/**
 * Send service provider approval email
 */
const sendApprovalEmail = async (email, providerName) => {
  if (!isEmailConfigured()) {
    console.log('Email not configured; skipping approval email');
    return;
  }

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your Service Provider Account Has Been Approved',
    html: `
      <h2>Welcome to Event Compass, ${providerName}!</h2>
      <p>Your service provider account has been approved.</p>
      <p>You can now start listing your services and accepting bookings.</p>
      <p><a href="${process.env.FRONTEND_URL}/dashboard">Go to Dashboard</a></p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Approval email sent to:', email);
  } catch (error) {
    console.error('Error sending approval email:', error);
  }
};

/**
 * Send deposit paid email
 */
const sendDepositPaidEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { bookingNumber, depositAmount, balanceDue, eventDate, paymentPlan } = details;
  const planLabel = paymentPlan === 'deposit_20' ? '20%' : '50%';
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: `Deposit Received - Booking #${bookingNumber}`,
    html: `
      <h2>Deposit Payment Confirmed!</h2>
      <p>Your ${planLabel} deposit for booking <strong>#${bookingNumber}</strong> has been received.</p>
      <ul>
        <li><strong>Deposit Paid:</strong> &#8358;${Number(depositAmount).toLocaleString()}</li>
        <li><strong>Balance Due:</strong> &#8358;${Number(balanceDue).toLocaleString()}</li>
        <li><strong>Event Date:</strong> ${new Date(eventDate).toDateString()}</li>
      </ul>
      <p style="color:#dc2626;"><strong>Important:</strong> You must complete the remaining balance before your event date to avoid cancellation.</p>
      <p>Thank you for using Event Compass!</p>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending deposit paid email:', error);
  }
};

/**
 * Send balance due reminder email
 */
const sendBalanceDueReminderEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { bookingNumber, balanceDue, eventDate, daysLeft } = details;
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: `Balance Payment Reminder - Booking #${bookingNumber}`,
    html: `
      <h2>Balance Payment Reminder</h2>
      <p>Your event is in <strong>${daysLeft} day(s)</strong> and you still have an outstanding balance.</p>
      <ul>
        <li><strong>Booking:</strong> #${bookingNumber}</li>
        <li><strong>Balance Due:</strong> &#8358;${Number(balanceDue).toLocaleString()}</li>
        <li><strong>Event Date:</strong> ${new Date(eventDate).toDateString()}</li>
      </ul>
      <p style="color:#dc2626;"><strong>Please complete your payment before the event date to avoid cancellation.</strong></p>
    `,
  };
  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending balance reminder email:', error);
  }
};

module.exports = {
  sendWelcomeEmail,
  sendBookingConfirmationEmail,
  sendPaymentReceiptEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendEmailVerificationEmail,
  sendTwoFactorEmail,
  sendDepositPaidEmail,
  sendBalanceDueReminderEmail,
};
