/**
 * Email Utility
 * Handles sending emails
 */

const nodemailer = require('nodemailer');

const isTruthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const isEmailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      !process.env.SMTP_USER.includes('your_') &&
      !process.env.SMTP_PASS.includes('your_')
  );

const isEmailEnabled = () => {
  const explicitFlag = process.env.EMAILS_ENABLED ?? process.env.ENABLE_EMAILS;

  if (explicitFlag !== undefined) {
    return isTruthy(explicitFlag);
  }

  return process.env.NODE_ENV === 'production' && isEmailConfigured();
};

const getTransporter = () => {
  if (!isEmailEnabled()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (email, firstName, activationUrl) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping welcome email');
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
    await getTransporter().sendMail(mailOptions);
    console.log('Welcome email sent to:', email);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

/**
 * Send booking confirmation email
 */
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping booking confirmation email');
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
    await getTransporter().sendMail(mailOptions);
    console.log('Booking confirmation email sent to:', email);
  } catch (error) {
    console.error('Error sending booking email:', error);
  }
};

/**
 * Send payment receipt email
 */
const sendPaymentReceiptEmail = async (email, paymentDetails) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping payment receipt email');
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
    await getTransporter().sendMail(mailOptions);
    console.log('Payment receipt email sent to:', email);
  } catch (error) {
    console.error('Error sending payment email:', error);
  }
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping password reset email');
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
    await getTransporter().sendMail(mailOptions);
    console.log('Password reset email sent to:', email);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
};

/**
 * Send email verification email
 */
const sendEmailVerificationEmail = async (email, firstName, verificationUrl) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping verification email');
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
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
  }
};

/**
 * Send 2FA code email
 */
const sendTwoFactorEmail = async (email, firstName, code) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping 2FA email');
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
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending 2FA email:', error);
  }
};

/**
 * Send service provider approval email
 */
const sendApprovalEmail = async (email, providerName) => {
  if (!isEmailEnabled()) {
    console.log('Email delivery is disabled; skipping approval email');
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
    await getTransporter().sendMail(mailOptions);
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
    await getTransporter().sendMail(mailOptions);
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
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending balance reminder email:', error);
  }
};

// ─── Shared HTML layout ──────────────────────────────────────────────────────
const layout = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    body{margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Arial,sans-serif;color:#333}
    .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
    .hdr{background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 40px;text-align:center}
    .hdr h1{color:#fff;margin:0;font-size:22px;font-weight:700}
    .bdy{padding:32px 40px}
    .bdy p{line-height:1.7;margin:0 0 14px;font-size:15px}
    .box{background:#f8f7ff;border-left:4px solid #4F46E5;border-radius:6px;padding:16px 20px;margin:18px 0}
    .box table{width:100%;border-collapse:collapse}
    .box td{padding:5px 0;font-size:14px}
    .box td:first-child{color:#666;width:45%}
    .box td:last-child{font-weight:600;color:#1a1a2e}
    .btn{display:inline-block;background:#4F46E5;color:#fff!important;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:6px 0}
    .btn-red{background:#dc2626}.btn-green{background:#16a34a}
    .alert{border-radius:8px;padding:13px 16px;margin:14px 0;font-size:14px}
    .aw{background:#fef9c3;border:1px solid #fde047;color:#854d0e}
    .ae{background:#fee2e2;border:1px solid #fca5a5;color:#991b1b}
    .as{background:#dcfce7;border:1px solid #86efac;color:#166534}
    .ftr{background:#f8f7ff;padding:18px 40px;text-align:center;font-size:12px;color:#888;border-top:1px solid #ede9fe}
    .ftr a{color:#4F46E5;text-decoration:none}
    hr{border:none;border-top:1px solid #ede9fe;margin:22px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr"><h1>&#129517; Event Compass</h1></div>
    <div class="bdy">${body}</div>
    <div class="ftr">&copy; ${new Date().getFullYear()} Event Compass &nbsp;|&nbsp;<a href="${process.env.FRONTEND_URL||'#'}">Platform</a> &nbsp;|&nbsp;<a href="mailto:support@eventcompass.com">Support</a></div>
  </div>
</body></html>`;

/**
 * Booking reminder email
 */
const sendBookingReminderEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, bookingNumber, eventDate, eventTime, serviceName } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `⏰ Reminder: Your Event is Tomorrow — Booking #${bookingNumber}`,
      html: layout('Booking Reminder', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your upcoming event is <strong>tomorrow</strong>. Here are your details:</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName||'N/A'}</td></tr>
          <tr><td>Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${eventTime?`<tr><td>Time</td><td>${eventTime}</td></tr>`:''}
        </table></div>
        <div class="alert as">✅ Your booking is confirmed. Please ensure everything is ready!</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL||'#'}/bookings" class="btn">View Booking</a></p>
        <p>We hope you have a wonderful event! 🎉</p>`),
    });
  } catch (e) { console.error('Booking reminder email error:', e); }
};

/**
 * Cancellation alert email
 */
const sendCancellationAlertEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, bookingNumber, eventDate, serviceName, reason, refundEligible } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `❌ Booking Cancelled — #${bookingNumber}`,
      html: layout('Booking Cancelled', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your booking has been <strong>cancelled</strong>.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName||'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${reason?`<tr><td>Reason</td><td>${reason}</td></tr>`:''}
        </table></div>
        ${refundEligible
          ?'<div class="alert aw">💳 A refund has been initiated and will be processed within 3–5 business days.</div>'
          :'<div class="alert ae">ℹ️ This booking was not eligible for a refund per the cancellation policy.</div>'}
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Cancellation alert email error:', e); }
};

/**
 * Promotional notification email
 */
const sendPromotionalEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, title, message, ctaUrl, ctaLabel } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `🎁 ${title} — Event Compass`,
      html: layout(title, `
        <p>Hi${firstName?` <strong>${firstName}</strong>`:''},</p>
        <p>${message}</p>
        ${ctaUrl?`<p style="text-align:center"><a href="${ctaUrl}" class="btn">${ctaLabel||'Explore Now'}</a></p>`:''}
        <hr/>
        <p style="font-size:12px;color:#999">You're receiving this because you have an Event Compass account. Manage preferences in your profile settings.</p>`),
    });
  } catch (e) { console.error('Promotional email error:', e); }
};

/**
 * New message notification email
 */
const sendNewMessageEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, senderName, preview, conversationUrl } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `💬 New Message from ${senderName}`,
      html: layout('New Message', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have a new message from <strong>${senderName}</strong>:</p>
        <div class="box"><p style="margin:0;font-style:italic;color:#555">&ldquo;${preview}&rdquo;</p></div>
        <p style="text-align:center"><a href="${conversationUrl||(process.env.FRONTEND_URL||'#')+'/messages'}" class="btn">Reply Now</a></p>
        <p style="font-size:12px;color:#999">Manage message notifications in your profile settings.</p>`),
    });
  } catch (e) { console.error('New message email error:', e); }
};

/**
 * Booking accepted email
 */
const sendBookingAcceptedEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, bookingNumber, eventDate, serviceName, providerName, totalAmount, checkoutUrl } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `🎉 Booking Accepted — #${bookingNumber}`,
      html: layout('Booking Accepted', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p><strong>${providerName||'Your service provider'}</strong> has <strong>accepted</strong> your booking request.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName||'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          <tr><td>Total Amount</td><td>&#8358;${Number(totalAmount||0).toLocaleString()}</td></tr>
        </table></div>
        <div class="alert as">✅ Proceed to payment to secure your slot.</div>
        <p style="text-align:center"><a href="${checkoutUrl||(process.env.FRONTEND_URL||'#')+'/bookings'}" class="btn btn-green">Proceed to Payment</a></p>`),
    });
  } catch (e) { console.error('Booking accepted email error:', e); }
};

/**
 * Booking rejected email
 */
const sendBookingRejectedEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, bookingNumber, eventDate, serviceName, reason } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `Booking Request Declined — #${bookingNumber}`,
      html: layout('Booking Declined', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your booking request has been <strong>declined</strong> by the service provider.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName||'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${reason?`<tr><td>Reason</td><td>${reason}</td></tr>`:''}
        </table></div>
        <div class="alert aw">💡 There are many other great providers on Event Compass. Browse alternatives below.</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL||'#'}/search" class="btn">Find Another Provider</a></p>`),
    });
  } catch (e) { console.error('Booking rejected email error:', e); }
};

/**
 * Service added confirmation email (to provider)
 */
const sendServiceAddedEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, serviceName, serviceType, category, basePrice, serviceId } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `✅ Your Service "${serviceName}" is Now Live!`,
      html: layout('Service Published', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your service has been successfully listed on Event Compass and is now visible to clients.</p>
        <div class="box"><table>
          <tr><td>Service Name</td><td>${serviceName}</td></tr>
          <tr><td>Type</td><td>${serviceType||'N/A'}</td></tr>
          <tr><td>Category</td><td>${category||'N/A'}</td></tr>
          <tr><td>Base Price</td><td>&#8358;${Number(basePrice||0).toLocaleString()}</td></tr>
        </table></div>
        <div class="alert as">🚀 Clients can now discover and book your service. Keep your availability up to date!</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL||'#'}/services/${serviceId||''}" class="btn">View Your Listing</a></p>`),
    });
  } catch (e) { console.error('Service added email error:', e); }
};

/**
 * Provider account suspended email
 */
const sendProviderSuspensionEmail = async (email, details) => {
  if (!isEmailConfigured()) return;
  const { firstName, strikeCount, threshold } = details;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: '⚠️ Your Event Compass Account Has Been Suspended',
      html: layout('Account Suspended', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your service provider account has been <strong>automatically suspended</strong> because you have accumulated <strong>${strikeCount} cancellation strike(s)</strong> (threshold: ${threshold}).</p>
        <div class="alert ae">🚫 You can no longer accept new bookings while your account is suspended.</div>
        <p>Each strike is issued when a provider cancels a booking <em>after</em> it has already been accepted. This protects clients from last-minute disruptions.</p>
        <p>To appeal this suspension, please contact our support team.</p>
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Provider suspension email error:', e); }
};

/**
 * Verification code (OTP) email
 */
const sendVerificationCodeEmail = async (email, firstName, code) => {
  if (!isEmailConfigured()) return;
  try {
    await getTransporter().sendMail({
      from: process.env.FROM_EMAIL, to: email,
      subject: `Your Event Compass Verification Code: ${code}`,
      html: layout('Verification Code', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to complete your action on Event Compass:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="display:inline-block;background:#f8f7ff;border:2px dashed #4F46E5;border-radius:12px;padding:18px 40px;font-size:38px;font-weight:800;letter-spacing:12px;color:#4F46E5">${code}</span>
        </div>
        <div class="alert aw">⏱️ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</div>
        <p>If you did not request this, please ignore this email or contact support immediately.</p>`),
    });
  } catch (e) { console.error('Verification code email error:', e); }
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
  sendBookingReminderEmail,
  sendCancellationAlertEmail,
  sendPromotionalEmail,
  sendNewMessageEmail,
  sendBookingAcceptedEmail,
  sendBookingRejectedEmail,
  sendServiceAddedEmail,
  sendVerificationCodeEmail,
  sendProviderSuspensionEmail,
};
