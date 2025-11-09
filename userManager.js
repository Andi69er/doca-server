// userManager.js — DOCA WebDarts PRO
globalThis.clients = {};
globalThis.userNames = {};
globalThis.userRooms = {};

export function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  globalThis.userNames[id] = "Gast-" + id;
  return id;
}

export function setUserName(clientId, name) {
  if (globalThis.userNames[clientId] && name) {
    globalThis.userNames[clientId] = name;
  }
}

export function removeClient(clientId) {
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
}

export function getUserName(clientId) {
  return globalThis.userNames[clientId];
}

export function findClientIdByName(username) {
    for (const id in globalThis.userNames) {
        if (globalThis.userNames[id] === username) return id;
    }
    return null;
}

export function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {}).filter(name => !name.startsWith("Gast-"));
}

export function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of Object.values(globalThis.clients)) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

export function broadcastToPlayers(playerIds, obj) {
    if (!obj) return;
    const msg = JSON.stringify(obj);
    playerIds.forEach(id => {
        const ws = globalThis.clients[id];
        if (ws && ws.readyState === ws.OPEN) ws.send(msg);
    });
}

export function sendToClient(clientId, obj) {
  const ws = globalThis.clients[clientId];
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}