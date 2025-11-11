import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { dirname } from "path";
import RoomManager from "./roomManager.js";
import UserManager from "./userManager.js";
import GameLogic from "./gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Manager-Instanzen
const roomManager = new RoomManager();
const userManager = new UserManager();
const gameLogic = new GameLogic(roomManager, userManager, wss);

console.log("🚀 Initialisierung DOCA WebDarts Server...");

// WebSocket-Verbindung
wss.on("connection", (ws) => {
  const userId = userManager.addUser(ws);
  console.log(`✅ Neuer Client verbunden: ${userId}`);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "auth":
          userManager.authenticate(userId, data.user);
          break;
        case "create_room":
          roomManager.createRoom(userId, data.name, data.options);
          break;
        case "join_room":
          roomManager.joinRoom(userId, data.roomId);
          break;
        case "leave_room":
          roomManager.leaveRoom(userId);
          break;
        case "list_rooms":
          roomManager.listRooms(ws);
          break;
        case "list_online":
          userManager.listOnline(ws);
          break;
        case "chat":
          gameLogic.handleChat(userId, data.message);
          break;
        case "throw":
          gameLogic.handleThrow(userId, data.value);
          break;
        default:
          console.log("⚠️ Unbekannter Typ:", data.type);
      }
    } catch (err) {
      console.error("❌ Fehler bei Nachricht:", err);
    }
  });

  ws.on("close", () => {
    console.log(`❌ Client getrennt: ${userId}`);
    roomManager.leaveRoom(userId);
    userManager.removeUser(userId);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});
