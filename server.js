// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import { registerClient, removeClient, getUserName, getOnlineUserNames, setUserName, broadcast, sendToClient } from "./userManager.js";
import { createRoom, joinRoom, leaveRoom, getRoomByClientId, updateRoomList } from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);
  
  ws.send(JSON.stringify({ type: "connected", clientId, name: getUserName(clientId) }));
  
  // Sendet die aktualisierte Online-Liste an alle
  broadcast({ type: "online_list", users: getOnlineUserNames() });
  
  // --- KORREKTUR: DIESE EINE ZEILE IST DIE LÖSUNG ---
  // Sendet dem neuen Benutzer (und allen anderen) sofort die aktuelle Raumliste
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
    console.log(`❌ Benutzer getrennt: ${clientId}`);
    leaveRoom(clientId);
    removeClient(clientId);
    broadcast({ type: "online_list", users: getOnlineUserNames() });
  });
});

function handleMessage(ws, clientId, data) {
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