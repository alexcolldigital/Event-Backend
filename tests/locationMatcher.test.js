const { isBookingWithinCoverage } = require('../utils/locationMatcher');

describe('isBookingWithinCoverage', () => {
  it('accepts bookings in the same state when the service covers that state', () => {
    const serviceCoverage = {
      country: 'Nigeria',
      state: 'Lagos',
      city: '',
      lga: '',
      address: '',
      nationwide: false,
    };

    const bookingLocation = {
      country: 'Nigeria',
      state: 'Lagos',
      city: 'Ikeja',
      lga: 'Ikeja LGA',
      address: '12, Adeola Odeku',
    };

    expect(isBookingWithinCoverage(serviceCoverage, bookingLocation)).toBe(true);
  });

  it('rejects bookings outside the specified state', () => {
    const serviceCoverage = {
      country: 'Nigeria',
      state: 'Lagos',
      city: '',
      lga: '',
      address: '',
      nationwide: false,
    };

    const bookingLocation = {
      country: 'Nigeria',
      state: 'Abuja',
      city: 'Gwarinpa',
      lga: 'Municipal Area Council',
      address: '12, Ahmadu Bello Way',
    };

    expect(isBookingWithinCoverage(serviceCoverage, bookingLocation)).toBe(false);
  });

  it('allows nationwide service coverage for any Nigerian booking', () => {
    const serviceCoverage = {
      country: 'Nigeria',
      state: '',
      city: '',
      lga: '',
      address: '',
      nationwide: true,
    };

    const bookingLocation = {
      country: 'Nigeria',
      state: 'Kano',
      city: 'Kano Municipal',
      lga: 'Kano Municipal LGA',
      address: '1, Ibrahim Taiwo Road',
    };

    expect(isBookingWithinCoverage(serviceCoverage, bookingLocation)).toBe(true);
  });
});
