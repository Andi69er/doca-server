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
      broadcast({ type: "chat_message", from: getUserName(clientId), message: data.message });
      break;
    case "create_room":
      createRoom(clientId, data.name, data.options);
      break;
    case "join_room":
      joinRoom(clientId, data.roomId);
      break;
    case "leave_room":
      leaveRoom(clientId);
      break;
    case "list_online":
      sendToClient(clientId, { type: "online_list", users: getOnlineUserNames() });
      break;
    case "start_game":
    case "throw_dart":
    case "bull_shot":
    case "undo_throw":
      handleClientMessage(clientId, data);
      break;
    default:
      console.warn("⚠️ Unbekannter Nachrichtentyp:", data.type);
  }
}

function getOnlineUserNames() {
  return Object.values(globalThis.userNames || {});
}
