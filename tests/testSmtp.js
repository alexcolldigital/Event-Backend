require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL } = process.env;

console.log('SMTP config:', { SMTP_HOST, SMTP_PORT, SMTP_USER, FROM_EMAIL });

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 465),
  secure: Number(SMTP_PORT || 465) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

transporter.verify((err, success) => {
  if (err) return console.error('❌ SMTP connection failed:', err.message);
  console.log('✅ SMTP connected successfully');
});

transporter.sendMail({
  from: FROM_EMAIL,
  to: SMTP_USER,          // sends to yourself as a test
  subject: 'Event Compass SMTP Test',
  text: 'If you see this, SMTP is working!',
}, (err, info) => {
  if (err) return console.error('❌ Send failed:', err.message);
  console.log('✅ Test email sent:', info.messageId);
});
