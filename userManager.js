// userManager.js
const users = new Map();

/**
 * Benutzer hinzufügen
 */
export function addUser(id, ws) {
  users.set(id, ws);
  console.log(`✅ Benutzer verbunden: ${id}`);
}

/**
 * Benutzer entfernen
 */
export function removeUser(id) {
  users.delete(id);
  console.log(`❌ Benutzer getrennt: ${id}`);
}

/**
 * Nachricht an spezifischen Client
 */
export function sendToClient(id, message) {
  const ws = users.get(id);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Nachricht an alle Clients (optional mit Ausschluss)
 */
export function broadcast(message, exceptId = null) {
  const data = JSON.stringify(message);
  for (const [id, ws] of users) {
    if (ws.readyState === ws.OPEN && id !== exceptId) {
      ws.send(data);
    }
  }
}

/**
 * Liste aller verbundenen Benutzer
 */
export function getAllUsers() {
  return Array.from(users.keys());
}
