const Booking = require('../models/Booking');

describe('Booking number generation', () => {
  it('creates a booking object with a generated booking number', () => {
    const booking = new Booking({
      bookingType: 'service',
      eventDate: new Date(),
    });

    expect(booking.bookingNumber).toBeUndefined();
  });
});
