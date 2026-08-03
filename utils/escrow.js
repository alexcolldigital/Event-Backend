const normalizeEscrowOptions = (options = {}) => {
  const enabled = Boolean(options.enabled);
  const releaseTime = options.releaseTime || 'after_customer_confirmation';
  const releaseHours = Number(options.releaseHours || 24);
  const disputePolicy = options.disputePolicy || 'standard';

  return {
    enabled,
    releaseTime,
    releaseHours: Number.isFinite(releaseHours) && releaseHours > 0 ? releaseHours : 24,
    disputePolicy,
    status: enabled ? 'active' : 'inactive',
  };
};

const getEscrowSummary = (options = {}) => {
  const normalized = normalizeEscrowOptions(options);

  const releaseLabels = {
    immediate: 'Immediately',
    after_customer_confirmation: 'After customer confirmation',
    custom: `${normalized.releaseHours} Hours`,
    '24_hours': '24 Hours',
    '48_hours': '48 Hours',
  };

  const disputeLabels = {
    standard: 'Standard dispute handling',
    mediation: 'Mediation-assisted dispute resolution',
    marketplace: 'Marketplace-managed dispute resolution',
  };

  return {
    enabled: normalized.enabled,
    releaseLabel: releaseLabels[normalized.releaseTime] || normalized.releaseTime,
    disputeLabel: disputeLabels[normalized.disputePolicy] || 'Standard dispute handling',
  };
};

const getEscrowRefundDecision = ({ amount, eventDate, cancelledAt, enabled = false, policy = {} } = {}) => {
  if (!enabled || !amount || !eventDate || !cancelledAt) {
    return {
      refundAmount: 0,
      refundPercentage: 0,
      reason: 'No escrow refund required',
    };
  }

  const defaultPolicy = {
    refundTiers: [
      { daysBefore: 7, percentage: 100 },
      { daysBefore: 2, percentage: 50 },
      { daysBefore: 0, percentage: 0 },
    ],
    noRefundHours: 24,
  };

  const resolvedPolicy = {
    ...defaultPolicy,
    ...policy,
  };

  const diffMs = new Date(eventDate).getTime() - new Date(cancelledAt).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < resolvedPolicy.noRefundHours) {
    return {
      refundAmount: 0,
      refundPercentage: 0,
      reason: `No refund because cancellation was within ${resolvedPolicy.noRefundHours} hours of the event`,
    };
  }

  const tiers = Array.isArray(resolvedPolicy.refundTiers)
    ? resolvedPolicy.refundTiers.slice().sort((a, b) => b.daysBefore - a.daysBefore)
    : defaultPolicy.refundTiers;

  const matchingTier = tiers.find((tier) => diffDays >= tier.daysBefore) || tiers[tiers.length - 1];
  const refundAmount = Math.round(amount * (matchingTier.percentage / 100));

  return {
    refundAmount,
    refundPercentage: matchingTier.percentage,
    reason: `${matchingTier.percentage}% refund because cancellation occurred ${diffDays.toFixed(1)} days before the event`,
  };
};

const releaseEscrowFunds = ({ escrow = {}, releasedAt = new Date() } = {}) => ({
  ...escrow,
  releaseStatus: 'released',
  releaseDate: releasedAt,
});

const markEscrowDisputed = ({ escrow = {}, initiatedBy = 'customer', reason = 'Dispute raised', disputedAt = new Date() } = {}) => ({
  ...escrow,
  releaseStatus: 'disputed',
  disputedBy: initiatedBy,
  disputeReason: reason,
  disputeDate: disputedAt,
});

module.exports = {
  normalizeEscrowOptions,
  getEscrowSummary,
  getEscrowRefundDecision,
  releaseEscrowFunds,
  markEscrowDisputed,
};
