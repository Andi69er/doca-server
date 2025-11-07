// ===========================================
// roomManager.js
// ===========================================

export const roomManager = {
  rooms: new Map(),

  handleMessage(ws, data) {
    console.log("🎯 roomManager-Event:", data);
    // Hier später: Matchlogik, Scores, etc.
  },
};
