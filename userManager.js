// userManager.js — DOCA WebDarts PRO
// Stabil, robuste Named exports. Arbeitet mit WebSocket-Instanzen oder clientId strings.

const clients = new Map();     // clientId -> ws
const users = new Map();       // clientId -> { username }
const sockets = new WeakMap(); // ws -> clientId

/**
 * Generiert neue, collisionsarme clientId
 */
function makeClientId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Register a new connection. Returns clientId (string).
 * If ws already registered, returns existing id (and updates name if provided).
 */
export function addUser(ws, username = "Gast") {
  if (!ws) return null;
  if (sockets.has(ws)) {
    const existing = sockets.get(ws);
    if (username) users.set(existing, { username });
    return existing;
  }
  const clientId = makeClientId();
  clients.set(clientId, ws);
  users.set(clientId, { username });
  sockets.set(ws, clientId);
  return clientId;
}

/**
 * Remove a connection. Accepts either ws or clientId.
 */
export function removeUser(target) {
  let clientId = null;
  if (!target) return false;
  if (typeof target === "string") clientId = target;
  else clientId = sockets.get(target);

  if (!clientId) return false;
  const ws = clients.get(clientId);
  if (ws) sockets.delete(ws);
  clients.delete(clientId);
  users.delete(clientId);
  return true;
}

/**
 * Get clientId for a ws (or return the value if already clientId).
 */
export function getClientId(target) {
  if (!target) return null;
  if (typeof target === "string") return target;
  return sockets.get(target) || null;
}

/**
 * Set/override username for a client (clientId or ws accepted).
 */
export function setUserName(target, username) {
  const clientId = getClientId(target);
  if (!clientId) return false;
  const record = users.get(clientId) || {};
  // KORREKTUR: Backticks `...` hinzugefügt
  record.username = username || record.username || `Gast-${clientId}`;
  users.set(clientId, record);
  return true;
}

/**
 * Get username by clientId or ws.
 */
export function getUserName(target) {
  const clientId = getClientId(target);
  if (!clientId) return null;
  return users.get(clientId)?.username || null;
}

/**
 * Return a list of online usernames (strings).
 */
export function getOnlineUserNames() {
  const arr = [];
  for (const [id, info] of users.entries()) {
    // KORREKTUR: Backticks `...` hinzugefügt
    arr.push(info.username || `Gast-${id}`);
  }
  return arr;
}

/**
 * Send a message object to a single clientId (or ws).
 */
export function sendToClient(target, obj) {
  const clientId = getClientId(target);
  if (!clientId) return false;
  const ws = clients.get(clientId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Broadcast a message object to all connected clients.
 */
export function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.values()) {
    try {
      if (ws && ws.readyState === ws.OPEN) ws.send(data);
    } catch (e) {
      // ignore individual send errors
    }
  }
}

/**
 * Send to a list of playerIds (clientIds).
 */
export function broadcastToPlayers(playerIds = [], obj) {
  if (!Array.isArray(playerIds)) return;
  const data = JSON.stringify(obj);
  for (const pid of playerIds) {
    const ws = clients.get(pid);
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (e) {}
    }
  }
}

/**
 * Expose all clients (debug).
 */
export function listOnlineUsers() {
  return Array.from(users.entries()).map(([id, u]) => ({ id, username: u.username }));
}