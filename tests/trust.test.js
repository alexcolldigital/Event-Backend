const { sanitizeChatMessage, computeVendorTrustScore, getVendorBadges } = require('../utils/trust');

describe('trust and messaging safeguards', () => {
  it('blocks phone numbers, social handles, and URLs in chat messages', () => {
    expect(() => sanitizeChatMessage('Call me on 08012345678')).toThrow(/phone|social|url|link/i);
    expect(() => sanitizeChatMessage('My Instagram is @eventcompass')).toThrow(/social|handle/i);
    expect(() => sanitizeChatMessage('Check https://example.com')).toThrow(/url|link/i);

    expect(sanitizeChatMessage('Hi, I will arrive by 5pm.')).toBe('Hi, I will arrive by 5pm.');
  });

  it('scores verified vendors highly and awards trust badges', () => {
    const vendor = {
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      isBusinessVerified: true,
      averageRating: 4.8,
      totalReviews: 18,
      strikeCount: 0,
      completedBookings: 22,
      verificationDocuments: [{ status: 'approved' }, { status: 'approved' }],
    };

    const score = computeVendorTrustScore(vendor);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(getVendorBadges(vendor)).toEqual(expect.arrayContaining(['Verified', 'Top Rated', 'Trusted Vendor']));
  });
});
