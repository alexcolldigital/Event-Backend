/**
 * Payment Utility
 * Handles payment processing with Stripe
 */

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const buildCheckoutSessionPayload = ({ booking, origin }) => ({
  mode: 'payment',
  line_items: [
    {
      price_data: {
        currency: 'ngn',
        product_data: {
          name: booking?.service?.name || 'Event Compass booking',
          description: `Booking ${booking?.bookingNumber || booking?._id}`,
        },
        unit_amount: Math.round((booking?.pricing?.totalAmount || 0) * 100),
      },
      quantity: 1,
    },
  ],
  success_url: `${origin}/payment-result?bookingId=${booking?._id}&status=success`,
  cancel_url: `${origin}/payment-result?bookingId=${booking?._id}&status=cancelled`,
  metadata: {
    bookingId: booking?._id,
    bookingNumber: booking?.bookingNumber,
  },
});

/**
 * Create payment intent
 */
const createPaymentIntent = async (amount, description, metadata = {}) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Amount in cents
      currency: 'ngn',
      description: description,
      metadata: metadata,
    });

    return paymentIntent;
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

/**
 * Confirm payment
 */
const confirmPayment = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error('Error confirming payment:', error);
    throw error;
  }
};

/**
 * Refund payment
 */
const refundPayment = async (paymentIntentId, amount = null) => {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount && { amount: Math.round(amount * 100) }),
    });

    return refund;
  } catch (error) {
    console.error('Error refunding payment:', error);
    throw error;
  }
};

/**
 * Create customer
 */
const createCustomer = async (email, name, phone) => {
  try {
    const customer = await stripe.customers.create({
      email: email,
      name: name,
      phone: phone,
    });

    return customer;
  } catch (error) {
    console.error('Error creating customer:', error);
    throw error;
  }
};

/**
 * Create setup intent for saved payment methods
 */
const createSetupIntent = async (customerId) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
    });

    return setupIntent;
  } catch (error) {
    console.error('Error creating setup intent:', error);
    throw error;
  }
};

/**
 * Capture payment using saved payment method
 */
const chargeCustomer = async (customerId, amount, description) => {
  try {
    // Get customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    if (paymentMethods.data.length === 0) {
      throw new Error('No payment method found for customer');
    }

    // Use the first payment method
    const paymentMethod = paymentMethods.data[0];

    const charge = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'ngn',
      customer: customerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: description,
    });

    return charge;
  } catch (error) {
    console.error('Error charging customer:', error);
    throw error;
  }
};

/**
 * Handle webhook event
 */
const handleWebhookEvent = (event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.data.object);
      return {
        status: 'completed',
        data: event.data.object,
      };

    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object);
      return {
        status: 'failed',
        data: event.data.object,
      };

    case 'charge.refunded':
      console.log('Charge refunded:', event.data.object);
      return {
        status: 'refunded',
        data: event.data.object,
      };

    default:
      console.log('Unhandled event type:', event.type);
      return null;
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  refundPayment,
  createCustomer,
  createSetupIntent,
  chargeCustomer,
  handleWebhookEvent,
  buildCheckoutSessionPayload,
};
