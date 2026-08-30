/**
 * Background job to clear dormant chat sessions
 * Run this as a scheduled cron job or call the endpoint
 */

const { clearDormantSessions } = require('../utils/chatSession');
const { asyncHandler } = require('../middleware/errorHandler');

const runDormancyCleaner = asyncHandler(async (req, res) => {
  try {
    const results = await clearDormantSessions();

    console.log(`[Dormancy Cleaner] Cleared ${results.cleared} sessions, ${results.failed} failed`);

    res.status(200).json({
      success: true,
      message: 'Dormancy cleaner completed',
      data: results,
    });
  } catch (error) {
    console.error('[Dormancy Cleaner] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error running dormancy cleaner',
      error: error.message,
    });
  }
});

module.exports = { runDormancyCleaner };
