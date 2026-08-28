const { buildCheckoutSessionPayload } = require('../utils/payment');
const { buildCartCheckoutPayloads } = require('../utils/cartCheckout');

describe('Payment checkout payload', () => {
  it('builds a gateway checkout descriptor for a booking', () => {
    const booking = {
      _id: 'booking-123',
      bookingNumber: 'EC-123',
      pricing: { totalAmount: 268750, currency: 'NGN' },
      service: { name: 'Premium Planning' },
      client: { email: 'client@example.com' },
    };

    const payload = buildCheckoutSessionPayload({
      booking,
      origin: 'http://localhost:3000',
    });

    expect(payload.amount).toBe(268750);
    expect(payload.currency).toBe('NGN');
    expect(payload.email).toBe('client@example.com');
    expect(payload.bookingId).toBe('booking-123');
    expect(payload.bookingNumber).toBe('EC-123');
    expect(payload.successUrl).toBe('http://localhost:3000/bookings/payment-result?bookingId=booking-123&status=success');
    expect(payload.cancelUrl).toBe('http://localhost:3000/bookings/payment-result?bookingId=booking-123&status=cancelled');
  });

  it.each(['deposit_20', 'split_50_50'])('preserves the %s cart payment plan', (paymentPlan) => {
    const [payload] = buildCartCheckoutPayloads({
      userId: 'client-123',
      bookingDetails: { eventDate: '2026-09-04', paymentPlan },
      cartItems: [{ serviceId: 'service-123', quantity: 1 }],
    });

    expect(payload.paymentPlan).toBe(paymentPlan);
  });
});
