/**
 * Cancellation & Refund Utility
 * Tiered refund policy (admin-configurable) + provider-strike / auto-suspend logic
 */

const PlatformSetting = require('../models/PlatformSetting');

/**
 * Default tiered policy:
 *   >= 7 days  → 100 % refund
 *   >= 2 days  → 50  % refund
 *   <  2 days  → 0   % refund
 *
 * Stored in PlatformSetting as key = 'cancellationPolicy'
 * value = [{ minDays: 7, refundPct: 100 }, { minDays: 2, refundPct: 50 }, { minDays: 0, refundPct: 0 }]
 * Tiers must be sorted descending by minDays.
 */
const DEFAULT_POLICY = [
  { minDays: 7, refundPct: 100 },
  { minDays: 2, refundPct: 50 },
  { minDays: 0, refundPct: 0 },
];

const DEFAULT_STRIKE_THRESHOLD = 3;

/**
 * Load cancellation policy tiers from DB (falls back to DEFAULT_POLICY).
 */
const loadPolicy = async () => {
  const setting = await PlatformSetting.findOne({ key: 'cancellationPolicy' });
  if (setting && Array.isArray(setting.value) && setting.value.length) {
    return setting.value;
  }
  return DEFAULT_POLICY;
};

/**
 * Load provider strike threshold from DB (falls back to DEFAULT_STRIKE_THRESHOLD).
 */
const loadStrikeThreshold = async () => {
  const setting = await PlatformSetting.findOne({ key: 'providerStrikeThreshold' });
  return setting ? Number(setting.value) : DEFAULT_STRIKE_THRESHOLD;
};

/**
 * Calculate refund amount for a CLIENT-initiated cancellation.
 *
 * @param {number} paidAmount   - Total amount already paid by the client
 * @param {Date}   eventDate    - The event date
 * @returns {{ refundPct, refundAmount, daysUntilEvent }}
 */
const calcClientRefund = async (paidAmount, eventDate) => {
  const policy = await loadPolicy();
  const now = Date.now();
  const daysUntilEvent = Math.floor((new Date(eventDate).getTime() - now) / (1000 * 60 * 60 * 24));

  // Find the first tier whose minDays <= daysUntilEvent (tiers sorted desc)
  const tier = policy.find((t) => daysUntilEvent >= t.minDays) || { refundPct: 0 };
  const refundPct = tier.refundPct;
  const refundAmount = Math.round((paidAmount * refundPct) / 100 * 100) / 100;

  return { refundPct, refundAmount, daysUntilEvent };
};

/**
 * Apply a strike to a provider and auto-suspend if threshold is reached.
 * Mutates and saves the User document.
 *
 * @param {import('../models/User')} provider  - Mongoose User document
 * @returns {{ strikes: number, suspended: boolean }}
 */
const applyProviderStrike = async (provider) => {
  const threshold = await loadStrikeThreshold();
  provider.strikeCount = (provider.strikeCount || 0) + 1;

  if (provider.strikeCount >= threshold && !provider.isSuspended) {
    provider.isSuspended = true;
    provider.suspensionReason = `Auto-suspended after ${provider.strikeCount} provider cancellation strike(s).`;
    provider.suspendedAt = new Date();
  }

  await provider.save();
  return { strikes: provider.strikeCount, suspended: provider.isSuspended };
};

module.exports = { calcClientRefund, applyProviderStrike, loadPolicy, loadStrikeThreshold };
