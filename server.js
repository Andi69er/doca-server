// ======================================================
// DOCA WebDarts Server - by Andi69er & ChatGPT
// ======================================================

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Server & WebSocket Setup
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Data Structures ---
const clients = new Map(); // clientId -> ws
const users = {}; // username -> clientId
const rooms = {}; // roomId -> {name, players[], options}

// --- Helper Functions ---
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastRoom(roomId, data) {
  const room = rooms[roomId];
  if (!room) return;
  room.players.forEach((username) => {
    const id = users[username];
    const ws = clients.get(id);
    send(ws, data);
  });
}

// --- WebSocket Handling ---
wss.on("connection", (ws, req) => {
  const id = Math.random().toString(36).substring(2, 9);
  clients.set(id, ws);
  console.log(`[WS] ➕ connect ${id} (${req.socket.remoteAddress})`);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return console.error("[WS] ❌ Invalid JSON:", msg);
    }

    switch (data.type) {
      case "auth":
        users[data.user] = id;
        ws.username = data.user;
        console.log(`[AUTH] ${id} -> ${data.user}`);
        send(ws, { type: "auth_ok", user: data.user });
        break;

      case "create_room":
        const roomId = Math.random().toString(36).substring(2, 9);
        rooms[roomId] = {
          name: data.name,
          players: [ws.username],
          options: data.options,
        };
        console.log(`[ROOM] ${id} created room ${roomId} (${data.name})`);
        broadcastAllRooms();
        send(ws, { type: "room_created", roomId });
        break;

      case "join_room":
        if (!rooms[data.roomId]) return;
        const room = rooms[data.roomId];
        if (!room.players.includes(ws.username)) {
          room.players.push(ws.username);
        }
        broadcastRoom(data.roomId, {
          type: "player_joined",
          players: room.players,
        });
        broadcastAllRooms();
        break;

      case "leave_room":
        Object.keys(rooms).forEach((rid) => {
          const r = rooms[rid];
          if (r.players.includes(ws.username)) {
            r.players = r.players.filter((p) => p !== ws.username);
            if (r.players.length === 0) delete rooms[rid];
          }
        });
        broadcastAllRooms();
        break;

      case "list_rooms":
        send(ws, { type: "room_list", rooms });
        break;

      case "list_online":
        send(ws, { type: "online_list", users: Object.keys(users) });
        break;

      case "game_action":
        if (data.roomId) broadcastRoom(data.roomId, data);
        break;

      default:
        console.log("[WS] ⚠️ Unbekannter Typ:", data.type);
    }
  });

  ws.on("close", () => {
    console.log(`[WS] ❌ disconnect ${id}`);
    clients.delete(id);

    if (ws.username) {
      delete users[ws.username];
      Object.keys(rooms).forEach((rid) => {
        const r = rooms[rid];
        if (r.players.includes(ws.username)) {
          r.players = r.players.filter((p) => p !== ws.username);
          if (r.players.length === 0) delete rooms[rid];
        }
      });
      broadcastAllRooms();
    }
  });
});

function broadcastAllRooms() {
  const data = { type: "room_list", rooms };
  clients.forEach((ws) => send(ws, data));
}

// --- Express Test Route ---
app.get("/", (req, res) => {
  res.send("✅ DOCA WebDarts Server läuft erfolgreich!");
});

// --- Server Start ---
const PORT = process.env.PORT || 10000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 DOCA WebDarts Server läuft auf Port ${PORT}`);
  console.log("🌐 Bereit unter: https://doca-server.onrender.com");
});
