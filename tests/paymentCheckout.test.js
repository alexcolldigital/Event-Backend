const { buildCheckoutSessionPayload } = require('../utils/payment');

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
});
