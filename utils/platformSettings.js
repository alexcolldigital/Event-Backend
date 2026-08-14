/**
 * Platform Settings Helper
 * Loads and caches live editable settings from the database.
 */

const PlatformSetting = require('../models/PlatformSetting');

const DEFAULT_SETTINGS = {
  escrowVendorAcceptWindowHours: 24,
  escrowAutoReleaseWindowHours: 72,
  refundTiers: [
    { daysBefore: 7, percentage: 100 },
    { daysBefore: 2, percentage: 50 },
    { daysBefore: 0, percentage: 0 },
  ],
  platformCommissionPercentage: 15,
  serviceFeePercentage: 10,
  commissionRate: 10,
  minCommission: 0,
  providerStrikeThreshold: 3,
  providerSuspendAfterStrikes: true,
};

const getPlatformSetting = async (key) => {
  const setting = await PlatformSetting.findOne({ key });
  return setting ? setting.value : DEFAULT_SETTINGS[key];
};

const getEscrowConfig = async () => ({
  escrowVendorAcceptWindowHours: await getPlatformSetting('escrowVendorAcceptWindowHours'),
  escrowAutoReleaseWindowHours: await getPlatformSetting('escrowAutoReleaseWindowHours'),
  refundTiers: await getPlatformSetting('refundTiers'),
  platformCommissionPercentage: await getPlatformSetting('platformCommissionPercentage'),
});

module.exports = {
  getPlatformSetting,
  getEscrowConfig,
};
