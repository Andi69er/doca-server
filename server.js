// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient } from "./userManager.js";
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

  // --- DAS IST DIE NEUE LOGIK FÜR TRENNUNGEN ---
  ws.on("close", () => {
    console.log(`⌛️ Verbindung von ${clientId} getrennt. Starte 5-Sekunden-Timer zum Aufräumen.`);
    
    // Starte einen Timer. Wenn der Spieler nicht innerhalb von 5s zurückkommt, räumen wir auf.
    globalThis.cleanupTimers[clientId] = setTimeout(() => {
        console.log(`⏰ Timer für ${clientId} abgelaufen. Führe endgültiges Aufräumen durch.`);
        leaveRoom(clientId);
        removeClient(clientId);
        broadcast({ type: "online_list", users: getOnlineUserNames() });
        delete globalThis.cleanupTimers[clientId];
    }, 5000); // 5 Sekunden Wartezeit
  });
});

function handleMessage(ws, clientId, data) {
  // --- DAS IST DER GEGENTEILIGE TEIL DER LOGIK ---
  // Wenn eine Nachricht von einem Spieler kommt, für den ein Timer läuft,
  // bedeutet das, er hat sich erfolgreich neu verbunden.
  if (globalThis.cleanupTimers[clientId]) {
      console.log(`↪️ ${clientId} hat sich rechtzeitig zurückgemeldet. Aufräum-Timer wird gestoppt.`);
      clearTimeout(globalThis.cleanupTimers[clientId]);
      delete globalThis.cleanupTimers[clientId];
  }

  // Die normale Nachrichtenverarbeitung
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