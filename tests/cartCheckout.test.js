const { buildCartCheckoutPayloads } = require('../utils/cartCheckout');

describe('buildCartCheckoutPayloads', () => {
  it('creates one booking payload per cart item and preserves the selected booking details', () => {
    const payloads = buildCartCheckoutPayloads({
      userId: 'user-123',
      bookingDetails: {
        eventDate: '2026-09-10T09:00:00.000Z',
        bookingLocation: {
          country: 'Nigeria',
          state: 'Lagos',
          city: 'Ikeja',
          address: '18, Allen Avenue',
        },
      },
      cartItems: [
        {
          serviceId: 'service-1',
          quantity: 2,
          specialRequirements: 'Need extra chairs',
        },
        {
          serviceId: 'service-2',
          quantity: 1,
          specialRequirements: 'Deliver by 10am',
        },
      ],
    });

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      client: 'user-123',
      serviceId: 'service-1',
      eventDate: '2026-09-10T09:00:00.000Z',
      numberOfGuests: 2,
      specialRequirements: 'Need extra chairs',
      bookingLocation: {
        country: 'Nigeria',
        state: 'Lagos',
        city: 'Ikeja',
        address: '18, Allen Avenue',
      },
    });
    expect(payloads[1]).toMatchObject({
      serviceId: 'service-2',
      numberOfGuests: 1,
      specialRequirements: 'Deliver by 10am',
    });
  });

  it('throws a helpful error when the cart is empty', () => {
    expect(() =>
      buildCartCheckoutPayloads({
        userId: 'user-123',
        bookingDetails: {
          eventDate: '2026-09-10T09:00:00.000Z',
        },
        cartItems: [],
      })
    ).toThrow('Cart is empty');
  });
});
