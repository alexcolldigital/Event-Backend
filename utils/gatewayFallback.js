/**
 * Gateway fallback helper
 * Selects a primary payment gateway and falls back to a secondary one if needed.
 */

const initializePaystackCheckout = async ({ amount, email, metadata, callbackUrl }) => {
  // placeholder stub for a real Paystack checkout initialization
  return {
    gateway: 'paystack',
    checkoutUrl: `https://paystack.com/checkout?amount=${amount}&email=${encodeURIComponent(email)}`,
    transactionReference: `PS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  };
};

const initializeFlutterwaveCheckout = async ({ amount, email, metadata, callbackUrl }) => {
  return {
    gateway: 'flutterwave',
    checkoutUrl: `https://flutterwave.com/checkout?amount=${amount}&email=${encodeURIComponent(email)}`,
    transactionReference: `FW-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  };
};

const initializeEscrowCheckout = async ({ amount, email, metadata, callbackUrl }) => {
  try {
    return await initializePaystackCheckout({ amount, email, metadata, callbackUrl });
  } catch (error) {
    console.warn('Paystack checkout failed, falling back to Flutterwave:', error.message);
    return await initializeFlutterwaveCheckout({ amount, email, metadata, callbackUrl });
  }
};

const transferToProvider = async ({ amount, provider, reference, gateway = 'paystack' }) => {
  // placeholder stub for a real vendor payout transfer
  const transactionReference = `${gateway === 'flutterwave' ? 'FW' : 'PS'}-PAYOUT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    success: true,
    gateway,
    transactionReference,
    amount,
    currency: 'NGN',
    providerId: provider?._id || provider,
    message: `Simulated payout to provider via ${gateway}`,
  };
};

module.exports = {
  initializeEscrowCheckout,
  initializePaystackCheckout,
  initializeFlutterwaveCheckout,
  transferToProvider,
};
