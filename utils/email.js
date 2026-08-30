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
// Design mirrors the app UI:
//   • Background #f5f7f2  — authStyles.screen
//   • Card border-radius 28px, border rgba(15,23,42,.08), layered shadow — authStyles.card / BookingDetailScreen card
//   • Hero banner #1f7a4d (HomeScreen / BookingDetailScreen hero)
//   • Typography: #0f172a primary, #64748b muted, weight 800 headings / 600 body
//   • Info box: left-border accent, #f5f7f2 bg, row dividers — BookingDetailScreen pricing card
//   • Buttons: border-radius 18px, weight 800, green shadow — Button.jsx primary
//   • Alert pills: match tagGreen / warning / danger tokens from BookingDetailScreen
//   • OTP block: mirrors VerifyScreen otpBox style
const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#f5f7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased}
  .outer{padding:28px 16px 48px}
  .wrap{max-width:580px;margin:0 auto;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid rgba(15,23,42,0.08);box-shadow:0 10px 15px -3px rgba(15,23,42,0.05),0 4px 6px -4px rgba(15,23,42,0.03)}
  .hdr{background:#1f7a4d;padding:24px 32px 20px}
  .hdr-logo{display:block;margin-bottom:14px}
  .hdr-logo img{height:40px;width:auto;max-width:160px;display:block}
  .hdr-logo-text{display:inline-block;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px}
  .hdr-title{color:#ffffff;font-size:22px;font-weight:800;line-height:1.25;margin-bottom:4px}
  .hdr-sub{color:rgba(255,255,255,0.75);font-size:13px;font-weight:600}
  .bdy{padding:28px 32px}
  .bdy p{line-height:1.75;margin-bottom:14px;font-size:15px;color:#0f172a;font-weight:500}
  .bdy strong{color:#0f172a;font-weight:800}
  .box{background:#f5f7f2;border-radius:20px;border:1px solid rgba(15,23,42,0.08);border-left:4px solid #1f7a4d;padding:18px 20px;margin:18px 0}
  .box table{width:100%;border-collapse:collapse}
  .box tr{border-bottom:1px solid rgba(15,23,42,0.07)}
  .box tr:last-child{border-bottom:none}
  .box td{padding:9px 0;font-size:14px;vertical-align:top}
  .box td:first-child{color:#64748b;font-weight:600;width:40%;word-break:break-word}
  .box td:last-child{font-weight:800;color:#0f172a;text-align:right;word-break:break-word}
  .otp-wrap{text-align:center;margin:28px 0}
  .otp-block{display:inline-block;background:#f5f7f2;border:2px solid #1f7a4d;border-radius:20px;padding:16px 24px;font-size:32px;font-weight:800;letter-spacing:10px;color:#1f7a4d;max-width:100%}
  .btn{display:inline-block;background:#1f7a4d;color:#ffffff!important;padding:14px 28px;border-radius:18px;text-decoration:none;font-weight:800;font-size:15px;letter-spacing:0.1px;box-shadow:0 4px 16px rgba(31,122,77,0.22)}
  .btn-red{background:#dc2626!important;box-shadow:0 4px 16px rgba(220,38,38,0.22)!important}
  .btn-green{background:#1f7a4d!important}
  .alert{border-radius:16px;padding:14px 18px;margin:16px 0;font-size:14px;font-weight:600;line-height:1.6;border:1px solid}
  .aw{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
  .ae{background:#fef2f2;border-color:#fecaca;color:#991b1b}
  .as{background:#ecfdf3;border-color:#86efac;color:#15803d}
  hr{border:none;border-top:1px solid rgba(15,23,42,0.08);margin:22px 0}
  .ftr{background:#f5f7f2;padding:18px 32px;text-align:center;font-size:12px;color:#64748b;font-weight:600;border-top:1px solid rgba(15,23,42,0.08)}
  .ftr a{color:#1f7a4d;text-decoration:none;font-weight:700}
  @media(max-width:600px){
    .outer{padding:12px 8px 32px}
    .hdr,.bdy,.ftr{padding-left:16px;padding-right:16px}
    .hdr{padding-top:18px;padding-bottom:14px}
    .hdr-logo img{height:32px}
    .hdr-title{font-size:18px}
    .bdy{padding-top:20px;padding-bottom:20px}
    .bdy p{font-size:14px}
    .wrap{border-radius:16px}
    .box{padding:12px 14px}
    .box td{font-size:12px;padding:7px 0}
    .box td:first-child{width:45%}
    .otp-block{font-size:26px;letter-spacing:8px;padding:14px 16px}
    .btn{padding:12px 20px;font-size:14px;display:block;text-align:center}
    .alert{font-size:13px;padding:12px 14px}
  }
`;

const layout = (title, body) => {
  const year = new Date().getFullYear();
  const appUrl = process.env.FRONTEND_URL || '#';
  const logoUrl = process.env.LOGO_URL || `${appUrl}/assets/icon.png`;
  const logoHtml = `<a href="${appUrl}" class="hdr-logo" style="text-decoration:none">
      <img src="${logoUrl}" alt="Event Compass" width="160" height="40" style="height:40px;width:auto;max-width:160px;display:block" />
    </a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
<div class="outer">
  <div class="wrap">
    <div class="hdr">
      ${logoHtml}
      <div class="hdr-title">${title}</div>
      <div class="hdr-sub">Book premium event services instantly</div>
    </div>
    <div class="bdy">${body}</div>
    <div class="ftr">&copy; ${year} Event Compass &nbsp;&bull;&nbsp; <a href="${appUrl}">Open App</a> &nbsp;&bull;&nbsp; <a href="mailto:support@eventcompass.com">Support</a></div>
  </div>
</div>
</body></html>`;
};

// ─── Email functions ──────────────────────────────────────────────────────────

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatMoney = (value, currency = 'NGN') => {
  const amount = Number(value || 0);
  const symbol = currency === 'NGN' ? 'NGN ' : `${escapeHtml(currency)} `;
  return `${symbol}${Number.isFinite(amount) ? amount.toLocaleString() : '0'}`;
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toDateString();
};

const formatLocation = (location = {}) => {
  if (!location || typeof location !== 'object') return '';
  return [
    location.address,
    location.lga,
    location.city,
    location.state,
    location.country,
  ].filter(Boolean).join(', ');
};

const paymentPlanLabel = (paymentPlan) => (
  paymentPlan === 'deposit_20'
    ? '20% Deposit + Balance'
    : paymentPlan === 'split_50_50'
      ? '50/50 Split'
      : 'Full Payment'
);

const renderRows = (rows) => rows
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
  .join('');

const renderReceiptDetails = (receipt, fallback = {}) => {
  if (!receipt) return '';

  const event = receipt.eventDetails || {};
  const amounts = receipt.amounts || {};
  const payment = receipt.payment || {};
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const currency = amounts.currency || 'NGN';
  const location = formatLocation(event.bookingLocation);

  const eventRows = renderRows([
    ['Receipt #', receipt.receiptNumber],
    ['Booking #', receipt.bookingNumber || fallback.bookingNumber],
    ['Event Date', formatDate(event.eventDate || fallback.eventDate)],
    ['End Date', event.eventEndDate ? formatDate(event.eventEndDate) : ''],
    ['Event Time', event.eventTime],
    ['Duration', event.duration],
    ['Guests', event.numberOfGuests],
    ['Location', location],
    ['Special Requirements', event.specialRequirements],
    ['Client Notes', event.clientNotes],
  ]);

  const itemRows = items.length
    ? items.map((item) => `
      <tr>
        <td>${escapeHtml(item.name || 'Service')}${item.category ? `<br><span style="color:#64748b;font-size:12px;font-weight:600">${escapeHtml(item.category)}</span>` : ''}</td>
        <td style="text-align:center">${escapeHtml(item.quantity || 1)}</td>
        <td style="text-align:right">${formatMoney(item.unitPrice, currency)}</td>
        <td style="text-align:right">${formatMoney(item.amount, currency)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#64748b">No services listed</td></tr>`;

  const amountRows = [
    ['Subtotal', formatMoney(amounts.subtotal ?? fallback.subtotal, currency)],
    ['Service & Delivery Fee', formatMoney(amounts.serviceAndDeliveryFee, currency)],
    ['Discount', amounts.discount ? `-${formatMoney(amounts.discount, currency)}` : ''],
    ['Tax', amounts.tax ? formatMoney(amounts.tax, currency) : ''],
    ['Total Amount', formatMoney(amounts.totalAmount ?? fallback.totalAmount, currency)],
    ['Amount Paid', formatMoney(amounts.amountPaid ?? fallback.amount, currency)],
    ['Balance Due', formatMoney(amounts.balanceDue ?? fallback.balanceDue, currency)],
    ['Payment Plan', paymentPlanLabel(payment.paymentPlan || fallback.paymentPlan)],
    ['Payment Type', payment.paymentType],
    ['Payment Method', payment.method],
    ['Transaction ID', payment.transactionId],
    ['Payment Date', payment.paymentDate ? formatDate(payment.paymentDate) : ''],
  ];

  return `
    <hr>
    <p><strong>Event details, selected services, and amounts</strong></p>
    <div class="box"><table>${eventRows}</table></div>
    <div class="box">
      <table>
        <thead>
          <tr>
            <td style="font-weight:800;color:#0f172a">Service</td>
            <td style="font-weight:800;color:#0f172a;text-align:center">Qty</td>
            <td style="font-weight:800;color:#0f172a;text-align:right">Unit</td>
            <td style="font-weight:800;color:#0f172a;text-align:right">Amount</td>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="box"><table>${renderRows(amountRows)}</table></div>`;
};

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
      html: layout('Verify Your Email', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Use the code below to verify your account:</p>
        <div class="otp-wrap"><div class="otp-block">${code}</div></div>
        <div class="alert aw">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</div>
        <p>If you did not request this, please ignore this email.</p>`),
    });
  } catch (e) { console.error('Verification code email error:', e.message); return false; }
};

const sendTwoFactorEmail = async (email, firstName, code) => {
  try {
    await sendMail({
      to: email,
      subject: 'Your Login Verification Code - Event Compass',
      html: layout('Confirm It\'s You', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your two-factor authentication code is:</p>
        <div class="otp-wrap"><div class="otp-block">${code}</div></div>
        <div class="alert aw">Expires in <strong>10 minutes</strong>. Do not share it.</div>
        <p>If you didn't attempt to login, please change your password immediately.</p>`),
    });
  } catch (e) { console.error('2FA email error:', e.message); }
};

const sendEmailVerificationEmail = async (email, firstName, verificationUrl) => {
  try {
    await sendMail({
      to: email,
      subject: 'Verify Your Email - Event Compass',
      html: layout('Verify Your Email', `
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
        <div class="otp-wrap"><div class="otp-block">${code}</div></div>
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
        <div class="alert as">You are now verified on Event Compass.</div>
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
        </table></div>
        ${renderReceiptDetails(bookingDetails.receipt, bookingDetails)}`),
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
        </table></div>
        ${renderReceiptDetails(paymentDetails.receipt, paymentDetails)}`),
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
        ${renderReceiptDetails(details.receipt, details)}
        <div class="alert ae">Complete the remaining balance before your event date to avoid cancellation.</div>`),
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
        <div class="alert ae">Please complete payment before the event date to avoid cancellation.</div>`),
    });
  } catch (e) { console.error('Balance reminder email error:', e.message); }
};

const sendBookingReminderEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, eventTime, serviceName } = details;
  try {
    await sendMail({
      to: email,
      subject: `Reminder: Your Event is Tomorrow — Booking #${bookingNumber}`,
      html: layout('Booking Reminder', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your upcoming event is <strong>tomorrow</strong>. Here are your details:</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${eventTime ? `<tr><td>Time</td><td>${eventTime}</td></tr>` : ''}
        </table></div>
        <div class="alert as">Your booking is confirmed. Please ensure everything is ready!</div>
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
          ? '<div class="alert aw">A refund has been initiated and will be processed within 3–5 business days.</div>'
          : '<div class="alert ae">This booking was not eligible for a refund per the cancellation policy.</div>'}
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Cancellation alert email error:', e.message); }
};

const sendBookingAcceptedEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, serviceName, providerName, totalAmount, checkoutUrl } = details;
  try {
    await sendMail({
      to: email,
      subject: `Booking Accepted — #${bookingNumber}`,
      html: layout('Booking Accepted', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p><strong>${providerName || 'Your service provider'}</strong> has accepted your booking.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          <tr><td>Total Amount</td><td>&#8358;${Number(totalAmount || 0).toLocaleString()}</td></tr>
        </table></div>
        ${renderReceiptDetails(details.receipt, details)}
        <div class="alert as">Proceed to payment to secure your slot.</div>
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
      subject: 'Your Event Compass Account Has Been Suspended',
      html: layout('Account Suspended', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your account has been suspended due to <strong>${strikeCount} cancellation strike(s)</strong> (threshold: ${threshold}).</p>
        <div class="alert ae">You can no longer accept new bookings while suspended.</div>
        <p style="text-align:center"><a href="mailto:support@eventcompass.com" class="btn btn-red">Contact Support</a></p>`),
    });
  } catch (e) { console.error('Provider suspension email error:', e.message); }
};

const sendPromotionalEmail = async (email, details) => {
  const { firstName, title, message, ctaUrl, ctaLabel } = details;
  try {
    await sendMail({
      to: email,
      subject: `${title} — Event Compass`,
      html: layout(title, `
        <p>Hi${firstName ? ` <strong>${firstName}</strong>` : ''},</p>
        <p>${message}</p>
        ${ctaUrl ? `<p style="text-align:center"><a href="${ctaUrl}" class="btn">${ctaLabel || 'Explore Now'}</a></p>` : ''}`),
    });
  } catch (e) { console.error('Promotional email error:', e.message); }
};

const sendNewBookingAlertEmail = async (email, details) => {
  const { firstName, bookingNumber, clientName, eventDate, serviceName, totalAmount, paymentPlan, depositAmount, balanceDue, bookingUrl } = details;
  const planLabel = paymentPlan === 'deposit_20' ? '20% Deposit' : paymentPlan === 'split_50_50' ? '50/50 Split' : 'Full Payment';
  try {
    await sendMail({
      to: email,
      subject: `New Booking Request — #${bookingNumber}`,
      html: layout('New Booking Request 📋', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have a new booking request that requires your confirmation.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Client</td><td>${clientName}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          <tr><td>Total Amount</td><td>&#8358;${Number(totalAmount || 0).toLocaleString()}</td></tr>
          <tr><td>Payment Plan</td><td>${planLabel}</td></tr>
          ${depositAmount ? `<tr><td>Deposit Amount</td><td>&#8358;${Number(depositAmount).toLocaleString()}</td></tr>` : ''}
          ${balanceDue ? `<tr><td>Balance Due</td><td>&#8358;${Number(balanceDue).toLocaleString()}</td></tr>` : ''}
        </table></div>
        ${renderReceiptDetails(details.receipt, details)}
        <div class="alert aw">Please confirm or reject this booking within 24 hours.</div>
        <p style="text-align:center"><a href="${bookingUrl || (process.env.FRONTEND_URL || '#') + '/bookings'}" class="btn">Review Booking</a></p>`),
    });
  } catch (e) { console.error('New booking alert email error:', e.message); }
};

const sendPaymentReceivedEmail = async (email, details) => {
  const { firstName, bookingNumber, clientName, paymentType, amount, depositPaid, balanceDue, totalAmount, eventDate } = details;
  const label = paymentType === 'deposit' ? 'Deposit' : paymentType === 'balance' ? 'Balance' : 'Full Payment';
  try {
    await sendMail({
      to: email,
      subject: `${label} Received — Booking #${bookingNumber}`,
      html: layout(`${label} Payment Received 💰`, `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>A <strong>${label.toLowerCase()}</strong> payment has been made by <strong>${clientName}</strong> for booking <strong>#${bookingNumber}</strong>.</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Client</td><td>${clientName}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          <tr><td>${label} Paid</td><td>&#8358;${Number(amount).toLocaleString()}</td></tr>
          <tr><td>Total Amount</td><td>&#8358;${Number(totalAmount || 0).toLocaleString()}</td></tr>
          ${balanceDue > 0 ? `<tr><td>Remaining Balance</td><td>&#8358;${Number(balanceDue).toLocaleString()}</td></tr>` : ''}
        </table></div>
        ${renderReceiptDetails(details.receipt, details)}
        ${balanceDue > 0
          ? '<div class="alert aw">The client still has an outstanding balance to pay before the event.</div>'
          : '<div class="alert as">This booking is now fully paid. Funds are held in escrow until the event is completed.</div>'}
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/bookings" class="btn">View Booking</a></p>`),
    });
  } catch (e) { console.error('Payment received email error:', e.message); }
};

const sendServiceUpdatedEmail = async (email, details) => {
  const { firstName, serviceName, serviceId } = details;
  try {
    await sendMail({
      to: email,
      subject: `Your Service "${serviceName}" Has Been Updated`,
      html: layout('Service Updated ✅', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your service listing <strong>"${serviceName}"</strong> has been successfully updated on Event Compass.</p>
        <div class="alert as">Your changes are now live and visible to clients.</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/services/${serviceId || ''}" class="btn">View Listing</a></p>`),
    });
  } catch (e) { console.error('Service updated email error:', e.message); }
};

const sendFullPaymentConfirmationEmail = async (email, details) => {
  const { firstName, bookingNumber, eventDate, eventTime, serviceName, providerName, totalAmount, paymentPlan } = details;
  try {
    await sendMail({
      to: email,
      subject: `Payment Confirmed — Booking #${bookingNumber} is Fully Paid`,
      html: layout('Booking Fully Paid 🎉', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your booking is now <strong>fully paid</strong> and confirmed. See you at the event!</p>
        <div class="box"><table>
          <tr><td>Booking #</td><td>${bookingNumber}</td></tr>
          <tr><td>Service</td><td>${serviceName || 'N/A'}</td></tr>
          <tr><td>Provider</td><td>${providerName || 'N/A'}</td></tr>
          <tr><td>Event Date</td><td>${new Date(eventDate).toDateString()}</td></tr>
          ${eventTime ? `<tr><td>Event Time</td><td>${eventTime}</td></tr>` : ''}
          <tr><td>Total Paid</td><td>&#8358;${Number(totalAmount || 0).toLocaleString()}</td></tr>
          <tr><td>Payment Plan</td><td>${paymentPlan === 'deposit_20' ? '20% Deposit + Balance' : paymentPlan === 'split_50_50' ? '50/50 Split' : 'Full Payment'}</td></tr>
        </table></div>
        ${renderReceiptDetails(details.receipt, details)}
        <div class="alert as">Your slot is secured. No further payment is required.</div>
        <p style="text-align:center"><a href="${process.env.FRONTEND_URL || '#'}/bookings" class="btn">View Booking</a></p>`),
    });
  } catch (e) { console.error('Full payment confirmation email error:', e.message); }
};

const sendNewMessageEmail = async (email, details) => {
  const { firstName, senderName, preview, conversationUrl } = details;
  try {
    await sendMail({
      to: email,
      subject: `New Message from ${senderName}`,
      html: layout('New Message', `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>You have a new message from <strong>${senderName}</strong>:</p>
        <div class="box"><p style="margin:0;font-style:italic;color:#64748b">&ldquo;${preview}&rdquo;</p></div>
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
  sendNewBookingAlertEmail,
  sendPaymentReceivedEmail,
  sendServiceUpdatedEmail,
  sendFullPaymentConfirmationEmail,
  getEmailStatus,
  verifyEmailTransport,
};
