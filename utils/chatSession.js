const { Message, ChatSession } = require('../models/Message');

const DORMANCY_PERIOD_DAYS = 7;
const DORMANCY_PERIOD_MS = DORMANCY_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Initialize or update a chat session when messages are exchanged
 * @param {String} conversationId - The conversation ID
 * @param {String} participantA - User ID A
 * @param {String} participantB - User ID B
 * @param {String} bookingId - Optional booking ID
 */
async function initializeChatSession(conversationId, participantA, participantB, bookingId = null) {
  try {
    let session = await ChatSession.findOne({ conversationId });

    if (!session) {
      session = new ChatSession({
        conversationId,
        participantA,
        participantB,
        booking: bookingId || null,
        lastActivityAt: new Date(),
        isActive: true,
      });
    } else {
      // Update lastActivityAt on each message
      session.lastActivityAt = new Date();
      session.isActive = true; // Reactivate if was dormant
    }

    await session.save();
    return session;
  } catch (error) {
    console.error('Error initializing chat session:', error);
    return null;
  }
}

/**
 * Mark a chat session as ended by admin/service provider (awaits client confirmation)
 */
async function endChatSession(conversationId, userId, reason, feedback = null) {
  try {
    const session = await ChatSession.findOneAndUpdate(
      { conversationId },
      {
        isActive: false,
        endedBy: userId,
        endReason: reason,
        satisfactionFeedback: feedback,
        lastActivityAt: new Date(),
        $addToSet: { endConfirmedBy: userId },
      },
      { new: true }
    );
    return session;
  } catch (error) {
    console.error('Error ending chat session:', error);
    return null;
  }
}

/**
 * Confirm end of chat session by the other party (client).
 * Once both parties confirm, schedules messages for deletion in 24 hours.
 * @param {String} conversationId
 * @param {String} userId - The confirming user's ID
 * @returns {{ session, bothConfirmed }}
 */
async function confirmEndChatSession(conversationId, userId) {
  try {
    const session = await ChatSession.findOne({ conversationId });
    if (!session || session.isActive) return { session: null, bothConfirmed: false };

    // Add this user's confirmation
    await ChatSession.updateOne(
      { conversationId },
      { $addToSet: { endConfirmedBy: userId } }
    );

    const updated = await ChatSession.findOne({ conversationId });
    const participants = [String(updated.participantA), String(updated.participantB)];
    const confirmed = (updated.endConfirmedBy || []).map(String);
    const bothConfirmed = participants.every((p) => confirmed.includes(p));

    if (bothConfirmed && !updated.scheduledDeleteAt) {
      updated.scheduledDeleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await updated.save();
    }

    return { session: updated, bothConfirmed };
  } catch (error) {
    console.error('Error confirming end chat session:', error);
    return { session: null, bothConfirmed: false };
  }
}

/**
 * Find and clear dormant chat sessions (older than 7 days without activity)
 * @returns {Object} - Statistics of cleared sessions
 */
async function clearDormantSessions() {
  try {
    const sevenDaysAgo = new Date(Date.now() - DORMANCY_PERIOD_MS);

    // Find dormant, active sessions
    const dormantSessions = await ChatSession.find({
      lastActivityAt: { $lt: sevenDaysAgo },
      isActive: true,
    });

    const results = {
      cleared: 0,
      failed: 0,
      conversationIds: [],
    };

    for (const session of dormantSessions) {
      try {
        // Mark all messages in this conversation as deleted
        const deleteResult = await Message.updateMany(
          { conversationId: session.conversationId, isDeleted: false },
          {
            $set: {
              isDeleted: true,
              content: '[This message was cleared due to 7 days of inactivity]',
            },
          }
        );

        // Mark the session as inactive and set endReason as dormant
        await ChatSession.findOneAndUpdate(
          { conversationId: session.conversationId },
          {
            isActive: false,
            endReason: 'dormant',
            lastActivityAt: new Date(),
          }
        );

        results.cleared++;
        results.conversationIds.push(session.conversationId);
      } catch (error) {
        console.error(`Error clearing dormant session ${session.conversationId}:`, error);
        results.failed++;
      }
    }

    return results;
  } catch (error) {
    console.error('Error clearing dormant sessions:', error);
    return { cleared: 0, failed: 0, conversationIds: [], error: error.message };
  }
}

/**
 * Get chat session info for frontend
 * @param {String} conversationId - The conversation ID
 */
async function getChatSessionInfo(conversationId) {
  try {
    const session = await ChatSession.findOne({ conversationId })
      .populate('endedBy', 'firstName lastName role')
      .lean();

    if (!session) return null;

    return {
      conversationId: session.conversationId,
      isActive: session.isActive,
      lastActivityAt: session.lastActivityAt,
      endedBy: session.endedBy,
      endReason: session.endReason,
      satisfactionFeedback: session.satisfactionFeedback,
      endConfirmedBy: session.endConfirmedBy || [],
      scheduledDeleteAt: session.scheduledDeleteAt || null,
      dormancyWarning: session.isActive 
        ? calculateDormancyWarning(session.lastActivityAt)
        : null,
    };
  } catch (error) {
    console.error('Error getting chat session info:', error);
    return null;
  }
}

/**
 * Calculate if a session is approaching dormancy
 * @param {Date} lastActivityAt - Last activity timestamp
 */
function calculateDormancyWarning(lastActivityAt) {
  const now = new Date();
  const daysInactive = (now - new Date(lastActivityAt)) / (24 * 60 * 60 * 1000);
  const daysUntilClear = DORMANCY_PERIOD_DAYS - daysInactive;

  return {
    daysInactive: Math.floor(daysInactive),
    daysUntilClear: Math.ceil(daysUntilClear),
    willBeCleared: daysUntilClear <= 0,
    dormancyDays: DORMANCY_PERIOD_DAYS,
  };
}

module.exports = {
  initializeChatSession,
  endChatSession,
  confirmEndChatSession,
  clearDormantSessions,
  getChatSessionInfo,
  calculateDormancyWarning,
  DORMANCY_PERIOD_DAYS,
};
