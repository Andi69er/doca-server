// userManager.js — DOCA WebDarts PRO (korrigierte Version)
// Verbesserte Namensverwaltung + Echtzeit-Sync für Raumzustände

const clients = new Map();     // clientId -> ws
const users = new Map();       // clientId -> { username }
const sockets = new WeakMap(); // ws -> clientId

function makeClientId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Register a new connection. Returns clientId (string).
 * Updates name if already registered.
 */
export function addUser(ws, username = "Gast") {
  if (!ws) return null;

  if (sockets.has(ws)) {
    const existing = sockets.get(ws);
    const current = users.get(existing) || {};
    current.username = username || current.username || `Gast-${existing}`;
    users.set(existing, current);
    return existing;
  }

  const clientId = makeClientId();
  clients.set(clientId, ws);
  users.set(clientId, { username: username || `Gast-${clientId}` });
  sockets.set(ws, clientId);

  // 🔹 Sofortige Bestätigung an Client (eigene ID + Name)
  try {
    ws.send(JSON.stringify({
      type: "connected",
      clientId,
      name: username || `Gast-${clientId}`
    }));
  } catch {}

  return clientId;
}

/**
 * Entfernt einen Benutzer (ws oder clientId)
 */
export function removeUser(target) {
  let clientId = typeof target === "string" ? target : sockets.get(target);
  if (!clientId) return false;
  const ws = clients.get(clientId);
  if (ws) sockets.delete(ws);
  clients.delete(clientId);
  users.delete(clientId);
  return true;
}

/**
 * Liefert clientId für ws oder clientId selbst.
 */
export function getClientId(target) {
  if (!target) return null;
  if (typeof target === "string") return target;
  return sockets.get(target) || null;
}

/**
 * Setzt oder überschreibt Benutzernamen.
 */
export function setUserName(target, username) {
  const clientId = getClientId(target);
  if (!clientId) return false;
  const rec = users.get(clientId) || {};
  rec.username = username || rec.username || `Gast-${clientId}`;
  users.set(clientId, rec);
  return true;
}

/**
 * Holt Benutzernamen anhand clientId oder ws.
 */
export function getUserName(target) {
  const clientId = getClientId(target);
  if (!clientId) return null;
  const info = users.get(clientId);
  return info?.username || `Gast-${clientId}`;
}

/**
 * Liste aller Online-Benutzernamen
 */
export function getOnlineUserNames() {
  const arr = [];
  for (const [id, info] of users.entries()) {
    arr.push(info.username || `Gast-${id}`);
  }
  return arr;
}

/**
 * Sendet ein Objekt an einen einzelnen Client.
 */
export function sendToClient(target, obj) {
  const clientId = getClientId(target);
  if (!clientId) return false;
  const ws = clients.get(clientId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

/**
 * Broadcast an alle verbundenen Clients.
 */
export function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.values()) {
    try {
      if (ws && ws.readyState === ws.OPEN) ws.send(data);
    } catch {}
  }
}

/**
 * Broadcast an bestimmte Spieler (clientIds)
 */
export function broadcastToPlayers(playerIds = [], obj) {
  if (!Array.isArray(playerIds)) return;
  const data = JSON.stringify(obj);
  for (const pid of playerIds) {
    const ws = clients.get(pid);
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch {}
    }
  }
}

/**
 * Debug-Übersicht (clientId + Name)
 */
export function listOnlineUsers() {
  return Array.from(users.entries()).map(([id, u]) => ({ id, username: u.username }));
}
