// userManager.js — DOCA WebDarts PRO
// Vollständige Datei — Copy & Paste

globalThis.clients = {};       // clientId -> ws
globalThis.userNames = {};     // clientId -> username
globalThis.userRooms = {};     // clientId -> roomId
globalThis.cleanupTimers = {}; // clientId -> timeoutId

/**
 * Register a new WebSocket client and return its clientId.
 */
export function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  globalThis.userNames[id] = "Gast-" + id;
  return id;
}

/**
 * Set or change a client's username.
 */
export function setUserName(clientId, name) {
  if (!clientId || !name) return;
  globalThis.userNames[clientId] = name;
}

/**
 * Remove a client from internal maps (immediate).
 */
export function removeClient(clientId) {
  if (!clientId) return;
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
  // userRooms is managed by room manager; keep as-is here
  if (globalThis.cleanupTimers[clientId]) {
    clearTimeout(globalThis.cleanupTimers[clientId]);
    delete globalThis.cleanupTimers[clientId];
  }
}

/**
 * Get a username by clientId.
 */
export function getUserName(clientId) {
  return globalThis.userNames[clientId] ?? null;
}

/**
 * Find a clientId by username (returns first match or null)
 */
export function findClientIdByName(username) {
  if (!username) return null;
  for (const id in globalThis.userNames) {
    if (globalThis.userNames[id] === username) return id;
  }
  return null;
}

/**
 * Return an array of online user names (deduplicated).
 * Includes guests unless you want to hide them.
 */
export function getOnlineUserNames() {
  const arr = Object.values(globalThis.userNames || {});
  // dedupe preserving order
  const seen = new Set();
  const out = [];
  for (const n of arr) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Broadcast a JSONable object to all connected clients.
 */
export function broadcast(obj) {
  try {
    const msg = JSON.stringify(obj);
    for (const ws of Object.values(globalThis.clients)) {
      if (ws && ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  } catch (e) {
    console.error("broadcast error", e);
  }
}

/**
 * Send an object to a list of player clientIds (if connected).
 */
export function broadcastToPlayers(playerIds, obj) {
  if (!obj || !Array.isArray(playerIds)) return;
  const msg = JSON.stringify(obj);
  playerIds.forEach((id) => {
    const ws = globalThis.clients[id];
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  });
}

/**
 * Send directly to a single client.
 */
export function sendToClient(clientId, obj) {
  const ws = globalThis.clients[clientId];
  if (!ws) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    console.error("sendToClient error", e);
  }
}
