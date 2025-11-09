// userManager.js — DOCA WebDarts PRO
globalThis.clients = {};
globalThis.userNames = {};
globalThis.userRooms = {};

function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  globalThis.userNames[id] = "Gast-" + id;
  globalThis.userRooms[id] = null;
  return id;
}

function setUserName(clientId, name) {
  if (globalThis.userNames[clientId]) {
    globalThis.userNames[clientId] = name || `Gast-${clientId.slice(0,4)}`;
    console.log(`✅ Benutzer ${clientId} authentifiziert als: ${name}`);
    broadcastOnlineList();
  }
}

function removeClient(clientId) {
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
}

function getUserName(clientId) {
  return globalThis.userNames[clientId] || "Unbekannt";
}

function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {});
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of Object.values(globalThis.clients)) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function broadcastOnlineList() {
    broadcast({ type: "online_list", users: getOnlineUserNames() });
}

function sendToClient(clientId, obj) {
  const ws = globalThis.clients[clientId];
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

export {
  registerClient,
  removeClient,
  getUserName,
  getOnlineUserNames,
  broadcast,
  sendToClient,
  setUserName,
};