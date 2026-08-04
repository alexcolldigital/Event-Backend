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

const getEscrowRefundDecision = ({ amount, eventDate, cancelledAt, enabled = false } = {}) => {
  if (!enabled || !amount || !eventDate || !cancelledAt) {
    return {
      refundAmount: 0,
      refundPercentage: 0,
      reason: 'No escrow refund required',
    };
  }

  const diffMs = new Date(eventDate).getTime() - new Date(cancelledAt).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 7) {
    return {
      refundAmount: amount,
      refundPercentage: 100,
      reason: 'Full refund because cancellation was more than 7 days before the event',
    };
  }

  if (diffDays >= 2) {
    const refundAmount = Math.round(amount * 0.5);
    return {
      refundAmount,
      refundPercentage: 50,
      reason: 'Half refund because cancellation was within 2-7 days of the event',
    };
  }

  return {
    refundAmount: Math.round(amount * 0.5),
    refundPercentage: 50,
    reason: 'Half refund because cancellation was within 48 hours of the event',
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
