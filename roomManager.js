// ============================================================
// DOCA WebDarts PRO – Raum- und Spielverwaltung
// ============================================================

import { Game } from "./gameLogic.js";

const rooms = new Map();    // roomId -> {id,name,players,game}
const clients = new Map();  // ws -> {id,name,roomId}

function genId(prefix = "r") {
  return prefix + Math.random().toString(36).substring(2, 8);
}

// Hilfsfunktionen --------------------------------------------
function send(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (e) {
    console.error("Send error:", e);
  }
}

function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const pid of room.players) {
    const entry = [...clients.entries()].find(([, v]) => v.id === pid);
    if (entry) send(entry[0], data);
  }
}

function broadcastAll(data) {
  for (const [ws] of clients) send(ws, data);
}

function updateOnlineList() {
  const users = [...clients.values()].map((c) => c.name);
  broadcastAll({ type: "online_list", users });
}

function updateRooms() {
  const roomList = [...rooms.values()].map((r) => ({
    id: r.id,
    name: r.name,
    players: r.players.map((pid) => pid),
    maxPlayers: 2,
  }));
  broadcastAll({ type: "room_update", rooms: roomList });
}

// ============================================================
// Verbindung & Nachrichten
// ============================================================

function handleConnection(ws) {
  const clientId = genId("p");
  clients.set(ws, { id: clientId, name: `Gast-${clientId.slice(-3)}`, roomId: null });

  send(ws, { type: "server_log", message: "Willkommen bei DOCA WebDarts!" });
  updateOnlineList();
  updateRooms();

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, data);
    } catch (err) {
      console.error("Ungültige Nachricht:", msg);
    }
  });

  ws.on("close", () => handleDisconnect(ws));
}

function handleDisconnect(ws) {
  const c = clients.get(ws);
  if (!c) return;
  if (c.roomId && rooms.has(c.roomId)) {
    const r = rooms.get(c.roomId);
    r.players = r.players.filter((pid) => pid !== c.id);
    if (r.game) r.game.removePlayer(c.id);
    broadcast(r.id, { type: "server_log", message: `${c.name} hat den Raum verlassen.` });
    if (r.players.length === 0) rooms.delete(r.id);
  }
  clients.delete(ws);
  updateOnlineList();
  updateRooms();
}

// ============================================================
// Hauptnachrichten
// ============================================================

function handleMessage(ws, data) {
  const c = clients.get(ws);
  if (!c) return;

  switch (data.type) {
    case "ping":
      send(ws, { type: "pong", message: data.message || "pong" });
      break;

    case "chat_message":
      if (!c.roomId) return;
      broadcast(c.roomId, { type: "chat_message", from: c.name, message: data.message });
      break;

    case "create_room": {
      const rid = genId("r");
      const name = data.name || "Neuer Raum";
      const room = { id: rid, name, players: [c.id], game: null };
      rooms.set(rid, room);
      c.roomId = rid;
      room.game = new Game(rid, [c.id], { startingScore: data.startingScore || 501 });
      send(ws, { type: "joined_room", roomId: rid });
      broadcastAll({ type: "server_log", message: `${c.name} hat ${name} erstellt.` });
      updateRooms();
      break;
    }

    case "join_room": {
      const room = rooms.get(data.roomId);
      if (!room) {
        send(ws, { type: "server_log", message: "Raum nicht gefunden." });
        return;
      }
      if (room.players.length >= 2) {
        send(ws, { type: "server_log", message: "Raum ist voll." });
        return;
      }
      room.players.push(c.id);
      c.roomId = room.id;
      if (room.game) room.game.addPlayer(c.id);
      broadcast(room.id, { type: "joined_room", roomId: room.id });
      broadcastAll({ type: "server_log", message: `${c.name} ist ${room.name} beigetreten.` });
      updateRooms();
      break;
    }

    case "leave_room": {
      const room = rooms.get(c.roomId);
      if (room) {
        room.players = room.players.filter((pid) => pid !== c.id);
        if (room.game) room.game.removePlayer(c.id);
        broadcast(room.id, { type: "left_room", roomId: room.id });
        if (room.players.length === 0) rooms.delete(room.id);
      }
      c.roomId = null;
      updateRooms();
      break;
    }

    case "start_game": {
      const room = rooms.get(c.roomId);
      if (!room || !room.game) return;
      const opt = {
        startingScore: data.startingScore || 501,
        variant: data.variant || "standard",
        finishType: data.finishType || "double_out",
        doubleIn: !!data.doubleIn,
        startChoice: data.startChoice || "first",
      };
      room.game = new Game(room.id, room.players, opt);
      const state = room.game.start(c.id);
      broadcast(room.id, state);
      broadcast(room.id, { type: "server_log", message: "Spiel gestartet!" });
      break;
    }

    case "throw_dart": {
      const room = rooms.get(c.roomId);
      if (!room || !room.game) return;
      const res = room.game.playerThrow(c.id, data.value, data.mult);
      broadcast(room.id, res.state);
      break;
    }

    case "undo_throw": {
      const room = rooms.get(c.roomId);
      if (!room || !room.game) return;
      const res = room.game.undoLastThrow(c.id);
      if (res.ok) broadcast(room.id, res.state);
      send(ws, { type: "server_log", message: res.message });
      break;
    }

    case "bull_shot": {
      const room = rooms.get(c.roomId);
      if (!room || !room.game) return;
      const res = room.game.handleBullShot(c.id, data.mult);
      broadcast(room.id, res.state);
      break;
    }

    default:
      send(ws, { type: "server_log", message: `Unbekannter Typ: ${data.type}` });
  }
}

// ============================================================
// Export
// ============================================================

export const roomManager = {
  handleConnection,
  broadcast,
  send,
};
