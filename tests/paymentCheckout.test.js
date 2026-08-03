const { buildCheckoutSessionPayload } = require('../utils/payment');

describe('Payment checkout payload', () => {
  it('builds a Stripe checkout payload for a booking', () => {
    const booking = {
      _id: 'booking-123',
      bookingNumber: 'EC-123',
      pricing: { totalAmount: 268750 },
      service: { name: 'Premium Planning' },
    };

    const payload = buildCheckoutSessionPayload({
      booking,
      origin: 'http://localhost:3000',
    });

    expect(payload.mode).toBe('payment');
    expect(payload.success_url).toContain('/bookings');
    expect(payload.cancel_url).toContain('/bookings');
    expect(payload.line_items[0].quantity).toBe(1);
    expect(payload.line_items[0].price_data.unit_amount).toBe(26875000);
  });
});
