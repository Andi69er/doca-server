// userManager.js

export class UserManager {
  constructor() {
    this.clients = new Map(); // clientId → WebSocket
    this.names = new Map();   // clientId → username
  }

  addClient(clientId, ws) {
    this.clients.set(clientId, ws);
  }

  removeClient(clientId) {
    this.clients.delete(clientId);
    this.names.delete(clientId);
  }

  setUserName(clientId, name) {
    this.names.set(clientId, name);
  }

  getUserName(clientId) {
    return this.names.get(clientId) || "Gast";
  }

  getClientSocket(clientId) {
    return this.clients.get(clientId);
  }

  getOnlineUsers() {
    return [...this.names.values()];
  }
}

export const userManager = new UserManager();

/**
 * Globale Hilfsfunktionen (von roomManager.js oder server.js nutzbar)
 */
export function broadcast(data) {
  const json = JSON.stringify(data);
  for (const ws of userManager.clients.values()) {
    if (ws.readyState === 1) ws.send(json);
  }
}

export function sendToClient(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

export function sendToClientId(clientId, data) {
  const ws = userManager.getClientSocket(clientId);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

// Exportiere getUserName einzeln (damit roomManager es verwenden kann)
export function getUserName(clientId) {
  return userManager.getUserName(clientId);
}
