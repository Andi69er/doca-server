// userManager.js — DOCA WebDarts PRO (final, robust, copy & paste)

const clients = new Map(); // clientId -> WebSocket
const users = new Map();   // clientId -> { username }
const sockets = new WeakMap(); // ws -> clientId

/**
 * Neuen Benutzer hinzufügen.
 */
export function addUser(ws, username = "Gast") {
  const clientId = Math.random().toString(36).substring(2, 8);
  clients.set(clientId, ws);
  users.set(clientId, { username });
  sockets.set(ws, clientId);
  return clientId;
}

/**
 * Benutzer entfernen.
 */
export function removeUser(ws) {
  const clientId = sockets.get(ws);
  if (!clientId) return;
  clients.delete(clientId);
  users.delete(clientId);
  sockets.delete(ws);
}

/**
 * Client-ID zu WebSocket.
 */
export function getClientId(ws) {
  return sockets.get(ws) || null;
}

/**
 * Benutzername anhand ID.
 */
export function getUserName(clientId) {
  return users.get(clientId)?.username || "Unbekannt";
}

/**
 * Broadcast an alle verbundenen Clients.
 */
export function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of clients.values()) {
    try {
      ws.send(data);
    } catch (e) {
      console.error("Broadcast error:", e);
    }
  }
}

/**
 * Nur an bestimmte Spieler senden.
 */
export function broadcastToPlayers(playerIds, message) {
  const data = JSON.stringify(message);
  for (const pid of playerIds) {
    const ws = clients.get(pid);
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (e) {
        console.error("Send error:", e);
      }
    }
  }
}

/**
 * Aktive Benutzerliste holen.
 */
export function listOnlineUsers() {
  return Array.from(users.entries()).map(([id, u]) => ({
    id,
    username: u.username
  }));
}
