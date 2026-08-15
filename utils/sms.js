/**
 * SMS Utility — Twilio
 * Docs: https://www.twilio.com/docs/sms/quickstart/node
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID   — from https://console.twilio.com
 *   TWILIO_AUTH_TOKEN    — from https://console.twilio.com
 *   TWILIO_PHONE_NUMBER  — your Twilio number e.g. +12345678900
 */

const twilio = require('twilio');

const isConfigured = () =>
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER &&
  !process.env.TWILIO_ACCOUNT_SID.includes('your_') &&
  !process.env.TWILIO_AUTH_TOKEN.includes('your_') &&
  !process.env.TWILIO_PHONE_NUMBER.includes('your_');

/**
 * Normalise a phone number to E.164 format (+XXXXXXXXXXX).
 * Handles Nigerian numbers: 08012345678 → +2348012345678
 */
const toE164 = (phone) => {
  const digits = phone.replace(/\D/g, '');

  // Already has country code (11+ digits starting with country code)
  if (phone.startsWith('+')) return `+${digits}`;

  // Nigerian local format: 0XXXXXXXXXX (11 digits)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }

  // Nigerian without leading zero: 8012345678 (10 digits)
  if (digits.length === 10) {
    return `+234${digits}`;
  }

  // Already has 234 prefix without +
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits}`;
  }

  // Fallback: prepend + and hope for the best
  return `+${digits}`;
};

/**
 * Send an SMS via Twilio
 * @param {string} to   - Recipient phone number (any common format)
 * @param {string} body - Message text
 */
const sendSms = async (to, body) => {
  const e164 = toE164(to);

  if (!isConfigured()) {
    console.log(`[Twilio not configured] Would send to ${e164}: "${body}"`);
    return { sid: 'dev-mode', status: 'skipped' };
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const message = await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: e164,
  });

  console.log(`[Twilio SMS] Sent to ${e164} | SID: ${message.sid} | Status: ${message.status}`);
  return message;
};

/**
 * Send phone OTP via SMS
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} otp         - 6-digit OTP code
 */
const sendPhoneOtpSms = async (phoneNumber, otp) => {
  return sendSms(
    phoneNumber,
    `Your Event Compass verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`
  );
};

module.exports = { sendSms, sendPhoneOtpSms, toE164 };
