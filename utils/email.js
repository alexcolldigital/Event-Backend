/**
 * Email Utility — powered by Nodemailer (host SMTP)
 */

const nodemailer = require('nodemailer');

const isTruthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
const isFalsey = (v) => ['0', 'false', 'no', 'off'].includes(String(v || '').toLowerCase());

const getSmtpConfig = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? isTruthy(process.env.SMTP_SECURE)
      : port === 465;

  return {
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && !isFalsey(process.env.SMTP_REQUIRE_TLS),
    user: process.env.SMTP_USER,
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
  };
};

const isEmailConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    !process.env.SMTP_USER.includes('your_') &&
    !process.env.SMTP_PASS.includes('your_')
  );

const isEmailEnabled = () => {
  const flag = process.env.EMAILS_ENABLED ?? process.env.ENABLE_EMAILS;
  if (flag !== undefined) return isTruthy(flag);
  return isEmailConfigured();
};

const getTransporter = () => {
  const smtp = getSmtpConfig();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    // Render instances may not have outbound IPv6 connectivity.
    family: 4,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    auth: {
      user: smtp.user,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

const sendMail = async ({ to, subject, html }) => {
  if (!isEmailEnabled()) return false;
  await getTransporter().sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
  return true;
};

const getEmailStatus = () => {
  const smtp = getSmtpConfig();
  return {
    enabled: isEmailEnabled(),
    configured: isEmailConfigured(),
    host: smtp.host || 'not set',
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTLS,
    user: smtp.user ? smtp.user.replace(/(.{2}).*(@.*)?$/, '$1***$2') : 'not set',
    from: smtp.from || 'not set',
  };
};

const verifyEmailTransport = async () => {
  if (!isEmailEnabled()) return { ok: true, skipped: true, status: getEmailStatus() };
  try {
    await getTransporter().verify();
    return { ok: true, status: getEmailStatus() };
  } catch (error) {
    return { ok: false, status: getEmailStatus(), error: error.message };
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
    .hdr{background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 40px;text-align:center}
    .hdr h1{color:#fff;margin:0;font-size:22px;font-weight:700}
    .bdy{padding:32px 40px}
    .bdy p{line-height:1.7;margin:0 0 14px;font-size:15px}
    .box{background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;padding:16px 20px;margin:18px 0}
    .box table{width:100%;border-collapse:collapse}
    .box td{padding:5px 0;font-size:14px}
    .box td:first-child{color:#666;width:45%}
    .box td:last-child{font-weight:600;color:#1a1a2e}
    .btn{display:inline-block;background:#16a34a;color:#fff!important;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;margin:6px 0}
    .btn-red{background:#dc2626}.btn-green{background:#16a34a}
    .alert{border-radius:8px;padding:13px 16px;margin:14px 0;font-size:14px}
    .aw{background:#fef9c3;border:1px solid #fde047;color:#854d0e}
    .ae{background:#fee2e2;border:1px solid #fca5a5;color:#991b1b}
    .as{background:#dcfce7;border:1px solid #86efac;color:#166534}
    .ftr{background:#f0fdf4;padding:18px 40px;text-align:center;font-size:12px;color:#888;border-top:1px solid #bbf7d0}
    .ftr a{color:#16a34a;text-decoration:none}
    hr{border:none;border-top:1px solid #bbf7d0;margin:22px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr"><h1>🧭 Event Compass</h1></div>
    <div class="bdy">${body}</div>
    <div class="ftr">&copy; ${new Date().getFullYear()} Event Compass &nbsp;|&nbsp;<a href="${process.env.FRONTEND_URL || '#'}">Platform</a> &nbsp;|&nbsp;<a href="mailto:support@eventcompass.com">Support</a></div>
  </div>
</body></html>`;

// ─── Email functions ──────────────────────────────────────────────────────────

const sendWelcomeEmail = async (email, firstName, activationUrl) => {
  try {
    await sendMail({
      to: email,
      subject: 'Welcome to Event Compass',
      html: layout('Welcome', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Thank you for joining Event Compass!</p>
        ${activationUrl ? `<p style="text-align:center"><a href="${activationUrl}" class="btn">Verify Email</a></p>` : ''}
        <p>If you didn't create this account, please ignore this email.</p>`),
    });
  } catch (e) { console.error('Welcome email error:', e.message); }
};

const sendVerificationCodeEmail = async (email, firstName, code) => {
  try {
    return await sendMail({
      to: email,
      subject: `Your Event Compass Verification Code: ${code}`,
      html: layout('Verification Code', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to verify your account:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:18px 40px;font-size:38px;font-weight:800;letter-spacing:12px;color:#16a34a">${code}</span>
        </div>
        <div class="alert aw">⏱️ This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</div>
        <p>If you did not request this, please ignore this email.</p>`),
    });
  } catch (e) { console.error('Verification code email error:', e.message); return false; }
};

const sendTwoFactorEmail = async (email, firstName, code) => {
  try {
    await sendMail({
      to: email,
      subject: 'Your Login Verification Code - Event Compass',
      html: layout('Login Code', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your two-factor authentication code is:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:18px 40px;font-size:38px;font-weight:800;letter-spacing:12px;color:#16a34a">${code}</span>
        </div>
        <div class="alert aw">⏱️ Expires in <strong>10 minutes</strong>. Do not share it.</div>
        <p>If you didn't attempt to login, please change your password immediately.</p>`),
    });
  } catch (e) { console.error('2FA email error:', e.message); }
};

const sendEmailVerificationEmail = async (email, firstName, verificationUrl) => {
  try {
    await sendMail({
      to: email,
      subject: 'Verify Your Email - Event Compass',
      html: layout('Verify Email', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Please verify your email address to activate your account.</p>
        <p style="text-align:center"><a href="${verificationUrl}" class="btn">Verify Email</a></p>
        <p>This link expires in 24 hours.</p>`),
    });
  } catch (e) { console.error('Email verification error:', e.message); }
};

const sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    await sendMail({
      to: email,
      subject: 'Password Reset Request - Event Compass',
      html: layout('Reset Password', `
        <p>Click the link below to reset your password:</p>
        <p style="text-align:center"><a href="${resetUrl}" class="btn">Reset Password</a></p>
        <p>This link expires in 24 hours. If you didn't request this, ignore this email.</p>`),
    });
  } catch (e) { console.error('Password reset email error:', e.message); }
};

const sendPasswordResetCodeEmail = async (email, firstName, code) => {
  try {
    await sendMail({
      to: email,
      subject: `Your Event Compass Password Reset Code: ${code}`,
      html: layout('Reset Password', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to reset your password:</p>
        <div style="text-align:center;margin:28px 0">
          <span style="display:inline-block;background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:18px 40px;font-size:38px;font-weight:800;letter-spacing:12px;color:#16a34a">${code}</span>
        </div>
        <div class="alert aw">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</div>
        <p>If you did not request this, please ignore this email.</p>`),
    });
  } catch (e) { console.error('Password reset code email error:', e.message); }
};

const sendApprovalEmail = async (email, providerName) => {
  try {
    await sendMail({
      to: email,
      subject: 'Your Service Provider Account Has Been Approved',
      html: layout('Account Approved', `
        <p>Hi <strong>${providerName}</strong>,</p>
        <p>Your service provider account has been approved. You can now list services and accept bookings.</p>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/dashboard" class="btn">Go to Dashboard</a></p>`),
    });
  } catch (e) { console.error('Approval email error:', e.message); }
};

const sendBookingConfirmationEmail = async (email, bookingDetails) => {
  try {
    await sendMail({
      to: email,
      subject: `Booking Confirmation - ${bookingDetails.bookingNumber}`,
      html: layout('Booking Confirmed', `
        <p>Your booking has been confirmed.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingDetails.bookingNumber}</td></tr>
          <tr><td>Event Date</td><td>${bookingDetails.eventDate}</td></tr>
          <tr><td>Total Amount</td><td>${bookingDetails.totalAmount}</td></tr>
          <tr><td>Status</td><td>${bookingDetails.status}</td></tr>
        </table></div>`),
    });
  } catch (e) { console.error('Booking confirmation email error:', e.message); }
};

const sendPaymentReceiptEmail = async (email, paymentDetails) => {
  try {
    await sendMail({
      to: email,
      subject: `Payment Receipt - ${paymentDetails.transactionId}`,
      html: layout('Payment Receipt', `
        <p>Your payment has been received.</p>
        <div class="box"><table>
          <tr><td>Transaction ID</td><td>${paymentDetails.transactionId}</td></tr>
          <tr><td>Amount</td><td>${paymentDetails.amount}</td></tr>
          <tr><td>Date</td><td>${new Date().toLocaleDateString()}</td></tr>
          <tr><td>Status</td><td>${paymentDetails.status}</td></tr>
        </table></div>`),
    });
  } catch (e) { console.error('Payment receipt email error:', e.message); }
};

const sendDepositPaidEmail = async (email, details) => {
  const { bookingNumber, depositAmount, balanceDue, eventDate, paymentPlan } = details;
  const planLabel = paymentPlan === 'deposit_20' ? '20%' : '50%';
  try {
    await sendMail({
      to: email,
      subject: `Deposit Received - Booking #${bookingNumber}`,
      html: layout('Deposit Confirmed', `
        <p>Your ${planLabel} deposit for booking <strong>#${bookingNumber}</strong> has been received.</p>
        <div class="box"><table>
          <tr><td>Deposit Paid</td><td>&#8358;${Number(depositAmount).toLocaleString()}</td></tr>
          <tr><td>Balance Due</td><td>&#8358;${Number(balanceDue).toLocaleString()}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
        </table></div>
        <div class="alert ae">⚠️ Complete the remaining balance before your event date to avoid cancellation.</div>`),
    });
  } catch (e) { console.error('Deposit paid email error:', e.message); }
};

const sendBalanceDueReminderEmail = async (email, details) => {
  const { bookingNumber, balanceDue, eventDate, daysLeft } = details;
  try {
    await sendMail({
      to: email,
      subject: `Balance Payment Reminder - Booking #${bookingNumber}`,
      html: layout('Balance Reminder', `
        <p>Your event is in <strong>${daysLeft} day(s)</strong> and you have an outstanding balance.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Balance Due</td><td>&#8358;${Number(balanceDue).toLocaleString()}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
        </table></div>
        <div class="alert ae">⚠️ Please complete payment before the event date to avoid cancellation.</div>`),
    });
  } catch (e) { console.error('Balance reminder email error:', e.message); }
};

const sendBookingReminderEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, eventTime, serviceName } = details;
  try {
    await sendMail({
      to: email,
      subject: `⏰ Reminder: Your Event is Tomorrow — Booking #${bookingNumber}`,
      html: layout('Booking Reminder', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your upcoming event is <strong>tomorrow</strong>. Here are your details:</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${eventTime ? `<tr><td>Time</td><td>${eventTime}</td></tr>` : ''}
        </table></div>
        <div class="alert as">✅ Your booking is confirmed. Please ensure everything is ready!</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/bookings" class="btn">View Booking</a></p>`),
    });
  } catch (e) { console.error('Booking reminder email error:', e.message); }
};

const sendCancellationAlertEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, serviceName, reason, refundEligible } = details;
  try {
    await sendMail({
      to: email,
      subject: `Booking Cancelled — #${bookingNumber}`,
      html: layout('Booking Cancelled', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your booking has been <strong>cancelled</strong>.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
        </table></div>
        ${refundEligible
          ? '<div class="alert aw">💳 A refund has been initiated and will be processed within 3–5 business days.</div>'
          : '<div class="alert ae">ℹ️ This booking was not eligible for a refund per the cancellation policy.</div>'}
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Cancellation alert email error:', e.message); }
};

const sendBookingAcceptedEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, serviceName, providerName, totalAmount, checkoutUrl } = details;
  try {
    await sendMail({
      to: email,
      subject: `🎉 Booking Accepted — #${bookingNumber}`,
      html: layout('Booking Accepted', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p><strong>${providerName || 'Your service provider'}</strong> has accepted your booking.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          <tr><td>Total Amount</td><td>&#8358;${Number(totalAmount || 0).toLocaleString()}</td></tr>
        </table></div>
        <div class="alert as">✅ Proceed to payment to secure your slot.</div>
        <p style="text-align:center"><a href="${checkoutUrl || (process.env.FRONTEND_URL || '#') + '/bookings'}" class="btn btn-green">Proceed to Payment</a></p>`),
    });
  } catch (e) { console.error('Booking accepted email error:', e.message); }
};

const sendBookingRejectedEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, serviceName, reason } = details;
  try {
    await sendMail({
      to: email,
      subject: `Booking Request Declined — #${bookingNumber}`,
      html: layout('Booking Declined', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your booking request has been <strong>declined</strong> by the service provider.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
        </table></div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/search" class="btn">Find Another Provider</a></p>`),
    });
  } catch (e) { console.error('Booking rejected email error:', e.message); }
};

const sendServiceAddedEmail = async (email, details) => {
  const { firstName, serviceName, serviceType, category, basePrice, serviceId } = details;
  try {
    await sendMail({
      to: email,
      subject: `Your Service "${serviceName}" is Now Live!`,
      html: layout('Service Published', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your service is now visible to clients on Event Compass.</p>
        <div class="box"><table>
          <tr><td>Service Name</td><td>${serviceName}</td></tr>
          <tr><td>Type</td><td>${serviceType || 'N/A'}</td></tr>
          <tr><td>Category</td><td>${category || 'N/A'}</td></tr>
          <tr><td>Base Price</td><td>&#8358;${Number(basePrice || 0).toLocaleString()}</td></tr>
        </table></div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/services/${serviceId || ''}" class="btn">View Listing</a></p>`),
    });
  } catch (e) { console.error('Service added email error:', e.message); }
};

const sendProviderSuspensionEmail = async (email, details) => {
  const { firstName, strikeCount, threshold } = details;
  try {
    await sendMail({
      to: email,
      subject: '⚠️ Your Event Compass Account Has Been Suspended',
      html: layout('Account Suspended', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your account has been suspended due to <strong>${strikeCount} cancellation strike(s)</strong> (threshold: ${threshold}).</p>
        <div class="alert ae">🚫 You can no longer accept new bookings while suspended.</div>
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Provider suspension email error:', e.message); }
};

const sendPromotionalEmail = async (email, details) => {
  const { firstName, title, message, ctaUrl, ctaLabel } = details;
  try {
    await sendMail({
      to: email,
      subject: `🎁 ${title} — Event Compass`,
      html: layout(title, `
        <p>Hi${firstName ? ` <strong>${firstName}</strong>` : ''},</p>
        <p>${message}</p>
        ${ctaUrl ? `<p style="text-align:center"><a href="${ctaUrl}" class="btn">${ctaLabel || 'Explore Now'}</a></p>` : ''}`),
    });
  } catch (e) { console.error('Promotional email error:', e.message); }
};

const sendNewMessageEmail = async (email, details) => {
  const { firstName, senderName, preview, conversationUrl } = details;
  try {
    await sendMail({
      to: email,
      subject: `💬 New Message from ${senderName}`,
      html: layout('New Message', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have a new message from <strong>${senderName}</strong>:</p>
        <div class="box"><p style="margin:0;font-style:italic;color:#555">&ldquo;${preview}&rdquo;</p></div>
        <p style="text-align:center"><a href="${conversationUrl || (process.env.FRONTEND_URL || '#') + '/messages'}" class="btn">Reply Now</a></p>`),
    });
  } catch (e) { console.error('New message email error:', e.message); }
};

module.exports = {
  sendWelcomeEmail,
  sendVerificationCodeEmail,
  sendTwoFactorEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetCodeEmail,
  sendApprovalEmail,
  sendBookingConfirmationEmail,
  sendPaymentReceiptEmail,
  sendDepositPaidEmail,
  sendBalanceDueReminderEmail,
  sendBookingReminderEmail,
  sendCancellationAlertEmail,
  sendBookingAcceptedEmail,
  sendBookingRejectedEmail,
  sendServiceAddedEmail,
  sendProviderSuspensionEmail,
  sendPromotionalEmail,
  sendNewMessageEmail,
  getEmailStatus,
  verifyEmailTransport,
};
