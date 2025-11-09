// server.js — DOCA WebDarts PRO Server
import { WebSocketServer } from "ws";
import {
  handleClientMessage,
  registerClient,
  removeClient,
  getUserName,
  broadcast,
  sendToClient,
} from "./userManager.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRooms,
  removeEmptyRooms,
  getRoomById,
  getRoomByClientId,
  updateRoomList,
} from "./roomManager.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

wss.on("connection", (ws) => {
  const clientId = registerClient(ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);

  ws.send(JSON.stringify({ type: "connected", clientId, name: getUserName(clientId) }));
  broadcast({ type: "online_list", users: getOnlineUserNames() });
  updateRoomList(); // Send current room list to the new user

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, clientId, data);
    } catch (e) {
      console.error("❌ Ungültige Nachricht:", e);
    }
  });

  ws.on("close", () => {
    console.log(`❌ Benutzer getrennt: ${clientId}`);
    leaveRoom(clientId); // Make sure user leaves any room
    removeClient(clientId);
    removeEmptyRooms();
    broadcast({ type: "online_list", users: getOnlineUserNames() });
  });
});

function handleMessage(ws, clientId, data) {
  switch (data.type) {
    case "ping":
      sendToClient(clientId, { type: "pong", message: "pong" });
      break;
    case "chat_message":
    case "chat_global": // Handling both chat types
      broadcast({ type: "chat_global", user: getUserName(clientId), message: data.message });
      break;
    case "create_room":
      // FIX: Pass the entire data object as options, not data.options
      createRoom(clientId, data.name, data);
      break;
    case "join_room":
      joinRoom(clientId, data.roomId);
      break;
    case "leave_room":
      leaveRoom(clientId);
      break;
    case "list_online":
    case "request_online": // Handling both types
      sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() });
      break;
    case "list_rooms":
      updateRoomList();
      break;
    case "start_game":
    case "throw_dart":
    case "bull_shot":
    case "undo_throw":
    case "player_throw": // Handling game actions
      handleClientMessage(clientId, data);
      break;
    default:
      console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
  }
}

function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {});
}