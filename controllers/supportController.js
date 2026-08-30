const PlatformSetting = require('../models/PlatformSetting');
const { asyncHandler } = require('../middleware/errorHandler');

const SUPPORT_CONTACT_KEY = 'supportContact';

const DEFAULT_SUPPORT_CONTACT = {
  phoneNumber: '',
  whatsappUrl: '',
};

const getSupportContactValue = async () => {
  const setting = await PlatformSetting.findOne({ key: SUPPORT_CONTACT_KEY });
  return {
    ...DEFAULT_SUPPORT_CONTACT,
    ...(setting?.value || {}),
  };
};

const getSupportContact = asyncHandler(async (req, res) => {
  const supportContact = await getSupportContactValue();
  res.json({ success: true, supportContact });
});

module.exports = {
  SUPPORT_CONTACT_KEY,
  DEFAULT_SUPPORT_CONTACT,
  getSupportContact,
  getSupportContactValue,
};
