// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient, findClientIdByName } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList } from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

globalThis.cleanupTimers = {};

// Funktion, um einen Benutzer endgültig zu entfernen
function cleanupUser(username) {
    const clientId = findClientIdByName(username);
    if (clientId) {
        console.log(`⏰ Timer für ${username} (${clientId}) abgelaufen. Führe endgültiges Aufräumen durch.`);
        leaveRoom(clientId);
        removeClient(clientId);
        broadcast({ type: "online_list", users: getOnlineUserNames() });
    }
    delete globalThis.cleanupTimers[username];
}

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);
  ws.send(JSON.stringify({ type: "connected", clientId, name: getUserName(clientId) }));
  broadcast({ type: "online_list", users: getOnlineUserNames() });
  updateRoomList();

  ws.on("message", (msg) => {
    try { 
      const data = JSON.parse(msg); 
      handleMessage(ws, clientId, data); 
    } 
    catch (e) { 
      console.error("❌ Ungültige Nachricht:", e); 
    }
  });

  ws.on("close", () => {
    const username = getUserName(clientId);
    // Starte den Timer nur für authentifizierte Benutzer, nicht für frische Gäste
    if (username && !username.startsWith("Gast-")) {
        console.log(`⌛️ Verbindung von ${username} (${clientId}) getrennt. Starte 5-Sekunden-Timer.`);
        // Wenn bereits ein Timer für diesen User läuft, lösche ihn (sollte nicht passieren, aber sicher ist sicher)
        if (globalThis.cleanupTimers[username]) clearTimeout(globalThis.cleanupTimers[username]);
        
        globalThis.cleanupTimers[username] = setTimeout(() => cleanupUser(username), 5000);
    } else {
        // Gäste sofort entfernen
        removeClient(clientId);
    }
  });
});

function handleMessage(ws, clientId, data) {
  // Wenn eine "auth"-Nachricht kommt, stoppen wir einen eventuellen Timer für diesen BENUTZERNAMEN
  if (data.type === "auth" && data.user) {
      const username = data.user;
      if (globalThis.cleanupTimers[username]) {
          console.log(`↪️ ${username} hat sich rechtzeitig zurückgemeldet. Aufräum-Timer gestoppt.`);
          clearTimeout(globalThis.cleanupTimers[username]);
          delete globalThis.cleanupTimers[username];
      }
  }

  // Normale Nachrichtenverarbeitung
  switch (data.type) {
    case "auth": 
      setUserName(clientId, data.user); 
      break;
    case "chat_global": 
      broadcast({ type: "chat_global", user: getUserName(clientId), message: data.message }); 
      break;
    case "create_room": 
      createRoom(clientId, data.name, data); 
      break;
    case "join_room": 
      joinRoom(clientId, data.roomId); 
      break;
    case "leave_room": 
      leaveRoom(clientId); 
      break;
    case "list_rooms": 
      updateRoomList(); 
      break;
    case "list_online": 
      sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() }); 
      break;
    default: 
      console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
  }
}