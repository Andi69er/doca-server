// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient, clearCleanupTimer } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList } from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

// Ein globales Objekt, um die Aufräum-Timer zu speichern
globalThis.cleanupTimers = {};

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
    console.log(`⌛️ Verbindung von ${clientId} getrennt. Starte 5-Sekunden-Timer zum Aufräumen.`);
    
    // KORREKTUR: Räume nicht sofort auf. Starte einen Timer.
    globalThis.cleanupTimers[clientId] = setTimeout(() => {
        console.log(`⏰ Timer für ${clientId} abgelaufen. Führe Aufräumen durch.`);
        leaveRoom(clientId);
        removeClient(clientId);
        broadcast({ type: "online_list", users: getOnlineUserNames() });
        delete globalThis.cleanupTimers[clientId];
    }, 5000); // 5 Sekunden warten
  });
});

function handleMessage(ws, clientId, data) {
  // KORREKTUR: Wenn der Benutzer eine Nachricht sendet, ist er offensichtlich noch da.
  // Wir brechen jeden laufenden Aufräum-Timer für ihn ab.
  if (globalThis.cleanupTimers[clientId]) {
      console.log(`↪️ ${clientId} hat sich rechtzeitig zurückgemeldet. Aufräum-Timer gestoppt.`);
      clearTimeout(globalThis.cleanupTimers[clientId]);
      delete globalThis.cleanupTimers[clientId];
  }

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