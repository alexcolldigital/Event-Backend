/**
 * Payment Utility
 * Delegates to Paystack (primary) / Flutterwave (fallback) via gateway.js
 */

const gateway = require('./gateway');

/**
 * Build a checkout payload descriptor (used for logging / audit)
 */
const buildCheckoutSessionPayload = ({ booking, origin }) => ({
  amount: booking?.pricing?.totalAmount || 0,
  currency: booking?.pricing?.currency || 'NGN',
  email: booking?.client?.email || null,
  bookingId: booking?._id,
  bookingNumber: booking?.bookingNumber,
  successUrl: `${origin}/bookings/payment-result?bookingId=${booking?._id}&status=success`,
  cancelUrl: `${origin}/bookings/payment-result?bookingId=${booking?._id}&status=cancelled`,
});

/**
 * Initialize a checkout session (Paystack → Flutterwave fallback)
 */
const createPaymentIntent = async (booking, origin) => {
  return gateway.initializeCheckout({ booking, origin });
};

/**
 * Verify a transaction by reference
 * Tries Paystack first, then Flutterwave
 */
const confirmPayment = async (reference) => {
  const fetch = global.fetch || require('node-fetch');

  if (process.env.PAYSTACK_SECRET) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
    });
    const data = await res.json();
    if (data?.status) return { gateway: 'paystack', ...data.data };
  }

  if (process.env.FLUTTERWAVE_SECRET) {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/${reference}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET}` },
    });
    const data = await res.json();
    if (data?.status === 'success') return { gateway: 'flutterwave', ...data.data };
  }

  throw new Error('Could not verify payment with any gateway');
};

/**
 * Refund a payment
 */
const refundPayment = async (booking, amount = null) => {
  return gateway.refund({ booking, amount });
};

module.exports = {
  buildCheckoutSessionPayload,
  createPaymentIntent,
  confirmPayment,
  refundPayment,
};
