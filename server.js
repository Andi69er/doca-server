// DOCA WebDarts Server – Render kompatibel (ES Module)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

import { createRoom, joinRoom, leaveRoom, updateRoomList, getRoomByClientId } from "./roomManager.js";
import { getUserName, registerUser, removeUser, broadcast } from "./userManager.js";
import { handleGameMessage } from "./gameLogic.js";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log("🚀 DOCA WebDarts Server gestartet …");

wss.on("connection", (ws, req) => {
  const clientId = Math.random().toString(36).slice(2, 9);
  ws.id = clientId;
  registerUser(ws, clientId);
  console.log(`[WS] ➕ Client verbunden: ${clientId}`);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("❌ Ungültige Nachricht:", msg);
      return;
    }

    switch (data.type) {
      case "auth":
        ws.username = data.user || "Gast";
        console.log(`[AUTH] ${clientId} -> ${ws.username}`);
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
      case "list_rooms":
        updateRoomList();
        break;
      case "game_action":
        handleGameMessage(clientId, data);
        break;
      default:
        console.log("⚠️ Unbekannter Nachrichtentyp:", data.type);
    }
  });

  ws.on("close", () => {
    console.log(`[WS] ❌ Client getrennt: ${clientId}`);
    removeUser(clientId);
    leaveRoom(clientId);
  });
});

app.get("/", (req, res) => {
  res.send("✅ DOCA WebDarts Server läuft erfolgreich auf Render!");
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server läuft auf Port ${PORT}`);
});
