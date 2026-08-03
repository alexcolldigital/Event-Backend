const { normalizeEscrowOptions, getEscrowSummary, getEscrowRefundDecision, releaseEscrowFunds, markEscrowDisputed } = require('../utils/escrow');

describe('escrow policy helpers', () => {
  it('defaults to disabled escrow when no options are provided', () => {
    expect(normalizeEscrowOptions()).toEqual({
      enabled: false,
      releaseTime: 'after_customer_confirmation',
      releaseHours: 24,
      disputePolicy: 'standard',
      status: 'inactive',
    });
  });

  it('keeps custom release hours when escrow is enabled', () => {
    const options = normalizeEscrowOptions({
      enabled: true,
      releaseTime: 'custom',
      releaseHours: 72,
    });

    expect(options.enabled).toBe(true);
    expect(options.releaseTime).toBe('custom');
    expect(options.releaseHours).toBe(72);
    expect(options.status).toBe('active');
  });

  it('creates a readable summary for escrow-enabled bookings', () => {
    const summary = getEscrowSummary({
      enabled: true,
      releaseTime: '48_hours',
      disputePolicy: 'standard',
    });

    expect(summary.enabled).toBe(true);
    expect(summary.releaseLabel).toBe('48 Hours');
    expect(summary.disputeLabel).toBe('Standard dispute handling');
  });

  it('returns a full refund when cancelling far ahead of the event and a partial refund for a booking cancelled several days before the event', () => {
    const fullRefund = getEscrowRefundDecision({
      amount: 50000,
      eventDate: new Date('2026-09-20T10:00:00Z'),
      cancelledAt: new Date('2026-09-10T10:00:00Z'),
      enabled: true,
    });

    const partialRefund = getEscrowRefundDecision({
      amount: 50000,
      eventDate: new Date('2026-09-20T10:00:00Z'),
      cancelledAt: new Date('2026-09-17T10:00:00Z'),
      enabled: true,
    });

    expect(fullRefund.refundAmount).toBe(50000);
    expect(fullRefund.refundPercentage).toBe(100);
    expect(partialRefund.refundAmount).toBe(25000);
    expect(partialRefund.refundPercentage).toBe(50);
  });

  it('uses configured refund tiers and no-refund rules for last-minute cancellations', () => {
    const noRefund = getEscrowRefundDecision({
      amount: 50000,
      eventDate: new Date('2026-09-20T10:00:00Z'),
      cancelledAt: new Date('2026-09-20T08:00:00Z'),
      enabled: true,
      policy: {
        fullRefundDays: 7,
        partialRefundDays: 2,
        noRefundDays: 1,
      },
    });

    expect(noRefund.refundAmount).toBe(0);
    expect(noRefund.refundPercentage).toBe(0);
    expect(noRefund.reason).toContain('No refund');
  });

  it('transitions escrow to released or disputed states when requested', () => {
    const releasedEscrow = releaseEscrowFunds({
      escrow: {
        enabled: true,
        releaseStatus: 'held',
      },
    });

    const disputedEscrow = markEscrowDisputed({
      escrow: {
        enabled: true,
        releaseStatus: 'held',
      },
      initiatedBy: 'client',
      reason: 'Service was not delivered',
    });

    expect(releasedEscrow.releaseStatus).toBe('released');
    expect(disputedEscrow.releaseStatus).toBe('disputed');
    expect(disputedEscrow.disputeReason).toBe('Service was not delivered');
    expect(disputedEscrow.disputedBy).toBe('client');
  });
});
