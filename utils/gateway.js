const fetch = global.fetch || require('node-fetch');

const initializeCheckout = async ({ booking, origin } = {}) => {
  const amount = Math.round((booking.pricing?.totalAmount || 0) * 100); // kobos
  const email = booking.client?.email || booking.client; // may be id
  const metadata = {
    bookingId: booking._id ? booking._id.toString() : null,
    bookingNumber: booking.bookingNumber,
  };

  // Try Paystack first
  if (process.env.PAYSTACK_SECRET) {
    try {
      const res = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email || 'no-reply@eventcompass.com',
          amount,
          metadata,
          callback_url: `${origin}/payment-callback?bookingId=${metadata.bookingId}`,
        }),
      });

      const payload = await res.json();
      if (payload && payload.status && payload.data && payload.data.authorization_url) {
        return { checkoutUrl: payload.data.authorization_url, gateway: 'paystack', reference: payload.data.reference };
      }
    } catch (err) {
      console.warn('Paystack initialize failed, falling back to Flutterwave', err.message || err);
    }
  }

  // Fallback to Flutterwave
  if (process.env.FLUTTERWAVE_SECRET) {
    try {
      const res = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: `EC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          amount: (booking.pricing?.totalAmount || 0).toString(),
          currency: booking.pricing?.currency || 'NGN',
          redirect_url: `${origin}/payment-callback?bookingId=${metadata.bookingId}`,
          customer: {
            email: email || 'no-reply@eventcompass.com',
            phonenumber: booking.client?.phoneNumber || undefined,
            name: booking.client?.firstName ? `${booking.client.firstName} ${booking.client.lastName || ''}` : undefined,
          },
          meta: metadata,
        }),
      });

      const payload = await res.json();
      if (payload && payload.status === 'success' && payload.data && payload.data.link) {
        return { checkoutUrl: payload.data.link, gateway: 'flutterwave', reference: payload.data.id };
      }
    } catch (err) {
      console.warn('Flutterwave initialize failed', err.message || err);
    }
  }

  throw new Error('No payment gateway available or initialization failed');
};

const refund = async ({ booking, amount = null } = {}) => {
  // Try Paystack refund if PAYSTACK_SECRET and booking.payment.transactionId
  if (process.env.PAYSTACK_SECRET && booking.payment && booking.payment.transactionId) {
    try {
      const res = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: booking.payment.transactionId,
          amount: amount ? Math.round(amount * 100) : undefined,
        }),
      });
      const payload = await res.json();
      return payload;
    } catch (err) {
      console.warn('Paystack refund failed', err.message || err);
    }
  }

  // Flutterwave refund (best-effort)
  if (process.env.FLUTTERWAVE_SECRET && booking.payment && booking.payment.transactionId) {
    try {
      const res = await fetch(`https://api.flutterwave.com/v3/transactions/${booking.payment.transactionId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: amount || undefined }),
      });
      const payload = await res.json();
      return payload;
    } catch (err) {
      console.warn('Flutterwave refund failed', err.message || err);
    }
  }

  throw new Error('No gateway refund available');
};

const createPaystackRecipient = async (provider) => {
  if (!process.env.PAYSTACK_SECRET) throw new Error('PAYSTACK_SECRET missing');

  const name = provider.accountHolderName || `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
  const body = {
    type: 'nuban',
    name,
    account_number: provider.accountNumber,
    bank_code: provider.bankCode,
    currency: 'NGN',
  };

  const res = await fetch('https://api.paystack.co/transferrecipient', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  if (!payload || !payload.status || !payload.data) {
    throw new Error('Failed to create paystack recipient');
  }

  return payload.data.recipient_code || payload.data.recipientCode || null;
};

const transferToProvider = async ({ payout, provider } = {}) => {
  // Ensure provider object
  const User = require('../models/User');
  let prov = provider;
  if (!prov) {
    prov = await User.findById(payout.provider);
    if (!prov) throw new Error('Provider not found');
  }

  // Use Paystack transfer flow when available
  if (process.env.PAYSTACK_SECRET) {
    try {
      // Ensure recipient exists
      let recipientCode = prov.payoutRecipients && prov.payoutRecipients.paystack && prov.payoutRecipients.paystack.recipientCode;
      if (!recipientCode) {
        recipientCode = await createPaystackRecipient(prov);
        // Save recipient code
        prov.payoutRecipients = prov.payoutRecipients || {};
        prov.payoutRecipients.paystack = prov.payoutRecipients.paystack || {};
        prov.payoutRecipients.paystack.recipientCode = recipientCode;
        prov.payoutRecipients.paystack.lastSyncedAt = new Date();
        await prov.save();
      }

      const res = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'balance',
          reason: `Payout for booking ${payout.booking}`,
          amount: Math.round(payout.amount * 100),
          recipient: recipientCode,
          reference: `PAYOUT-${payout._id || Date.now()}`,
        }),
      });

      const payload = await res.json();
      if (!payload || !payload.status) {
        throw new Error((payload && payload.message) || 'Paystack transfer failed');
      }

      return payload;
    } catch (err) {
      console.warn('Paystack transfer failed', err.message || err);
      throw err;
    }
  }

  // Flutterwave transfers would be implemented here
  throw new Error('No transfer gateway available');
};

module.exports = {
  initializeCheckout,
  refund,
  transferToProvider,
};
