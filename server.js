// server.js
import WebSocket, { WebSocketServer } from "ws";
import { roomManager } from "./roomManager.js";
import { userManager, getUserName } from "./userManager.js";
import { gameLogic } from "./gameLogic.js";

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);

wss.on("connection", (ws) => {
  const clientId = Math.random().toString(36).substr(2, 6);
  userManager.addClient(clientId, ws);
  console.log(`✅ Benutzer verbunden: ${clientId}`);

  sendToClient(ws, { type: "connected", clientId });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.error("❌ Ungültige Nachricht", raw);
      return;
    }
    handleMessage(clientId, msg);
  });

  ws.on("close", () => {
    console.log(`❌ Benutzer getrennt: ${clientId}`);
    roomManager.leaveRoom(clientId);
    userManager.removeClient(clientId);
  });
});

function handleMessage(clientId, msg) {
  switch (msg.type) {
    case "auth":
      userManager.setUserName(clientId, msg.name);
      console.log(`👤 Authentifiziert: ${msg.name} (${clientId})`);
      break;

    case "create_room":
      roomManager.createRoom(clientId, msg.name, msg.options || {});
      break;

    case "join_room":
      roomManager.joinRoom(clientId, msg.roomId);
      break;

    case "leave_room":
      roomManager.leaveRoom(clientId);
      break;

    case "list_rooms":
      roomManager.updateRooms();
      break;

    case "ping":
      sendToClientId(clientId, { type: "pong" });
      break;

    case "start_game":
      gameLogic.startGame(clientId, msg.roomId);
      break;

    case "throw_dart":
      gameLogic.handleThrow(clientId, msg.roomId, msg.value, msg.mult);
      break;

    default:
      console.log("⚠️ Unbekannter Typ vom Client:", msg.type);
      break;
  }
}

// Hilfsfunktionen
export function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(json);
  });
}

export function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

export function sendToClientId(clientId, data) {
  const ws = userManager.getClientSocket(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}
