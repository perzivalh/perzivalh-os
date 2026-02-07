/**
 * Conversation Memory Module
 * Stores and retrieves chat history for AI context
 * 
 * USAGE:
 * - addMessage(session, role, content) - Add message to history
 * - getHistoryForAI(session) - Get formatted history for AI prompt
 * - clearHistory(session) - Reset history
 */

const MAX_HISTORY_LENGTH = 15;

/**
 * Add a message to conversation history
 * @param {Object} sessionData - Current session.data object
 * @param {string} role - "user" or "bot"
 * @param {string} content - Message content
 * @returns {Array} Updated history array
 */
function addMessage(sessionData, role, content) {
    const history = sessionData?.chat_history || [];

    history.push({
        role,
        content: content?.substring(0, 500) || "", // Limit message length
        ts: Date.now(),
    });

    // Keep only last N messages
    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    return history;
}

/**
 * Get conversation history formatted for AI prompt
 * @param {Object} sessionData - Current session.data object
 * @returns {string} Formatted history string
 */
function getHistoryForAI(sessionData) {
    const history = sessionData?.chat_history || [];

    if (history.length === 0) {
        return "(Primera interacción)";
    }

    return history
        .map((msg) => {
            const prefix = msg.role === "user" ? "USUARIO" : "PODITO";
            return `${prefix}: ${msg.content}`;
        })
        .join("\n");
}

/**
 * Get summary of conversation for context
 * @param {Object} sessionData - Current session.data object
 * @returns {Object} Conversation summary
 */
function getConversationSummary(sessionData) {
    const history = sessionData?.chat_history || [];
    const aiActions = sessionData?.ai_actions || [];

    return {
        messageCount: history.length,
        lastUserMessage: history.filter(m => m.role === "user").slice(-1)[0]?.content || null,
        lastBotMessage: history.filter(m => m.role === "bot").slice(-1)[0]?.content || null,
        clarificationsAsked: aiActions.filter(a => a === "clarify").length,
        servicesDiscussed: sessionData?.services_discussed || [],
        currentNode: sessionData?.current_node_id || null,
    };
}

/**
 * Track AI action for loop prevention
 * @param {Object} sessionData - Current session.data object
 * @param {string} action - AI action taken
 * @returns {Array} Updated actions array
 */
function trackAIAction(sessionData, action) {
    const actions = sessionData?.ai_actions || [];
    actions.push(action);

    // Keep only last 10 actions
    while (actions.length > 10) {
        actions.shift();
    }

    return actions;
}

/**
 * Check if we're in a loop (same action repeated)
 * @param {Object} sessionData - Current session.data object
 * @param {string} action - Action to check
 * @returns {boolean} True if loop detected
 */
function isLooping(sessionData, action) {
    const actions = sessionData?.ai_actions || [];
    const lastThree = actions.slice(-3);

    // Loop if same action 3 times in a row
    return lastThree.length >= 3 && lastThree.every(a => a === action);
}

/**
 * Clear conversation history
 * @returns {Array} Empty history array
 */
function clearHistory() {
    return [];
}

module.exports = {
    addMessage,
    getHistoryForAI,
    getConversationSummary,
    trackAIAction,
    isLooping,
    clearHistory,
    MAX_HISTORY_LENGTH,
};
