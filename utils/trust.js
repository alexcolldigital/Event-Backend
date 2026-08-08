const LINK_REGEX = /(https?:\/\/|www\.)\S+|@[A-Za-z0-9_]+|\b\d{7,15}\b/g;

const sanitizeChatMessage = (message) => {
  if (typeof message !== 'string') {
    throw new Error('Chat message must be a string.');
  }

  const trimmed = message.trim();
  if (!trimmed) {
    throw new Error('Chat message cannot be empty.');
  }

  const hasPhone = /\b\+?\d[\d\s().-]{7,}\d\b/.test(trimmed);
  const hasSocialHandle = /@\w+/.test(trimmed) || /(?:instagram|facebook|twitter|x\.com|tiktok|linkedin|whatsapp)\s*[:@]/i.test(trimmed);
  const hasUrl = /(https?:\/\/|www\.)\S+/i.test(trimmed);

  if (hasPhone || hasSocialHandle || hasUrl) {
    const reason = [];
    if (hasPhone) reason.push('phone number');
    if (hasSocialHandle) reason.push('social handle');
    if (hasUrl) reason.push('URL/link');
    throw new Error(`Chat message contains prohibited ${reason.join(', ')}. Please keep communication within the app.`);
  }

  return trimmed;
};

const computeVendorTrustScore = (vendor = {}) => {
  const base = Number(vendor.trustScore) || 0;
  let score = base;

  if (vendor.isVerified) score += 20;
  if (vendor.isEmailVerified) score += 15;
  if (vendor.isPhoneVerified) score += 15;
  if (vendor.isBusinessVerified) score += 15;
  if (Array.isArray(vendor.verificationDocuments) && vendor.verificationDocuments.some((doc) => doc && doc.status === 'approved')) score += 10;
  if (Number(vendor.averageRating) >= 4.5) score += 10;
  if (Number(vendor.totalReviews) >= 10) score += 5;
  if (Number(vendor.completedBookings) >= 10) score += 5;
  if (Number(vendor.strikeCount) > 0) score -= 25;

  score = Math.max(0, Math.min(100, score));
  return Math.round(score);
};

const getVendorBadges = (vendor = {}) => {
  const badges = [];
  const score = computeVendorTrustScore(vendor);

  if (vendor.isVerified || vendor.isBusinessVerified || vendor.isEmailVerified) badges.push('Verified');
  if (Number(vendor.averageRating) >= 4.5 || Number(vendor.totalReviews) >= 10) badges.push('Top Rated');
  if (score >= 80) badges.push('Trusted Vendor');
  if (Number(vendor.completedBookings) >= 15) badges.push('Fast Response');

  return [...new Set(badges)];
};

module.exports = {
  sanitizeChatMessage,
  computeVendorTrustScore,
  getVendorBadges,
};
