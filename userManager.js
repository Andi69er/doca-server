// userManager.js
const users = new Map();

/**
 * Einen neuen Benutzer registrieren
 */
export function addUser(id, ws) {
  users.set(id, ws);
  console.log(`✅ Benutzer hinzugefügt: ${id}`);
}

/**
 * Benutzer entfernen, wenn Verbindung getrennt wurde
 */
export function removeUser(id) {
  users.delete(id);
  console.log(`❌ Benutzer entfernt: ${id}`);
}

/**
 * Nachricht an einen bestimmten Client senden
 */
export function sendToClient(id, message) {
  const ws = users.get(id);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn(`⚠️ sendToClient: Verbindung zu ${id} nicht offen`);
  }
}

/**
 * Nachricht an alle Clients senden (Broadcast)
 */
export function broadcast(message, exceptId = null) {
  const json = JSON.stringify(message);
  for (const [id, ws] of users) {
    if (id !== exceptId && ws.readyState === ws.OPEN) {
      ws.send(json);
    }
  }
}

/**
 * Aktuelle Liste aller verbundenen Benutzer zurückgeben
 */
export function listUsers() {
  return Array.from(users.keys());
}
