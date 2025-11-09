import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import RoomManager from "./roomManager.js";
import UserManager from "./userManager.js";
import GameLogic from "./gameLogic.js"; // <== Default-Import, kein { }

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 10000;

const roomManager = new RoomManager();
const userManager = new UserManager();
const gameLogic = new GameLogic(roomManager, userManager);

wss.on("connection", (ws) => {
  console.log("✅ Neuer Client verbunden.");

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("❌ Ungültiges JSON:", message);
      return;
    }

    const { type, payload } = data;

    switch (type) {
      // Benutzer anmelden
      case "login": {
        userManager.addUser(ws, payload.username);
        broadcastOnlineList();
        break;
      }

      // Benutzer abmelden
      case "logout": {
        userManager.removeUser(ws);
        broadcastOnlineList();
        break;
      }

      // Raum erstellen
      case "create_room": {
        const room = roomManager.createRoom(payload.username, payload.mode);
        ws.send(JSON.stringify({ type: "room_created", payload: { roomId: room.id } }));
        break;
      }

      // Raum beitreten
      case "join_room": {
        const { roomId, username } = payload;
        const room = roomManager.getRoom(roomId);

        if (!room) {
          ws.send(JSON.stringify({ type: "error", payload: { message: "Raum nicht gefunden." } }));
          return;
        }

        roomManager.addPlayerToRoom(roomId, ws, username);

        // Jetzt beide Clients synchronisieren
        const players = roomManager.getPlayersInRoom(roomId).map(p => p.username);

        roomManager.broadcastToRoom(roomId, {
          type: "room_update",
          payload: {
            roomId,
            players,
            status: "waiting"
          }
        });

        console.log(`👥 Spieler ${username} ist Raum ${roomId} beigetreten.`);
        break;
      }

      // Chatnachricht
      case "chat_message": {
        const { roomId, username, message: msg } = payload;
        roomManager.broadcastToRoom(roomId, {
          type: "chat_message",
          payload: { username, message: msg }
        });
        break;
      }

      // Spiel starten
      case "start_game": {
        const { roomId } = payload;
        const room = roomManager.getRoom(roomId);
        if (room) {
          room.gameActive = true;
          roomManager.broadcastToRoom(roomId, {
            type: "game_started",
            payload: { roomId }
          });
        }
        break;
      }

      // Punkte eingeben
      case "score_input": {
        gameLogic.handleScoreInput(payload);
        break;
      }

      default:
        console.warn("⚠️ Unbekannter Nachrichtentyp:", type);
        break;
    }
  });

  ws.on("close", () => {
    const username = userManager.getUsernameBySocket(ws);
    userManager.removeUser(ws);
    roomManager.removePlayerFromAllRooms(ws);
    broadcastOnlineList();
    console.log(`❌ ${username || "Unbekannter Benutzer"} getrennt.`);
  });
});

function broadcastOnlineList() {
  const online = userManager.getAllUsernames();
  const msg = JSON.stringify({ type: "online_list", payload: online });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

server.listen(PORT, () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
});
