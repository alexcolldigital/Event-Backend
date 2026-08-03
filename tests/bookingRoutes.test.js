describe('booking routes', () => {
  it('registers the reject booking route without throwing', () => {
    jest.resetModules();

    expect(() => require('../routes/bookingRoutes')).not.toThrow();
  });
});
