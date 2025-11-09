// userManager.js — DOCA WebDarts PRO
globalThis.clients = {};
globalThis.userNames = {};
globalThis.userRooms = {};

function registerClient(ws) {
  const id = Math.random().toString(36).substring(2, 8);
  globalThis.clients[id] = ws;
  globalThis.userNames[id] = "Gast-" + id; // Temporärer Name
  return id;
}

function setUserName(clientId, name) {
  if (globalThis.userNames[clientId] && name) {
    globalThis.userNames[clientId] = name;
    console.log(`✅ Benutzer ${clientId} authentifiziert als: ${name}`);
    broadcastOnlineList();
  }
}

function removeClient(clientId) {
  const username = globalThis.userNames[clientId];
  delete globalThis.clients[clientId];
  delete globalThis.userNames[clientId];
  console.log(`🧹 Client ${clientId} (${username}) vollständig entfernt.`);
}

function getUserName(clientId) {
  return globalThis.userNames[clientId];
}

// NEUE HILFSFUNKTION: Findet eine Client-ID anhand des Benutzernamens
function findClientIdByName(username) {
    for (const id in globalThis.userNames) {
        if (globalThis.userNames[id] === username) {
            return id;
        }
    }
    return null;
}

function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {}).filter(name => !name.startsWith("Gast-"));
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of Object.values(globalThis.clients)) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

function broadcastToPlayers(playerIds, obj) {
    const msg = JSON.stringify(obj);
    playerIds.forEach(id => {
        const ws = globalThis.clients[id];
        if (ws && ws.readyState === ws.OPEN) {
            ws.send(msg);
        }
    });
}

function broadcastOnlineList() {
    broadcast({ type: "online_list", users: getOnlineUserNames() });
}

function sendToClient(clientId, obj) {
  const ws = globalThis.clients[clientId];
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

export {
  registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient, broadcastToPlayers, findClientIdByName
};