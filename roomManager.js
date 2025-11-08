// roomManager.js
// DOCA WebDarts PRO – Raum-, Spiel- und Signalling-Manager

import { Game } from "./gameLogic.js";

// Maps
const rooms = new Map();     // roomId -> { id, name, players, game }
const clients = new Map();   // ws -> { id, name, roomId }

// Utility
function genId(prefix = "r") {
  return prefix + Math.random().toString(36).substring(2, 8);
}

function send(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (err) {
    console.error("Send error:", err);
  }
}

function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const pid of room.players) {
    for (const [sock, info] of clients.entries()) {
      if (info.id === pid) send(sock, data);
    }
  }
}

function broadcastAll(data) {
  for (const [ws] of clients) send(ws, data);
}

function updateOnlineList() {
  const users = [...clients.values()].map(c => c.name);
  broadcastAll({ type: "online_list", users });
}

function updateRooms() {
  const list = [...rooms.values()].map(r => ({
    id: r.id,
    name: r.name,
    players: r.players,
    maxPlayers: 2,
  }));
  broadcastAll({ type: "room_update", rooms: list });
}

// Handle new connection
function handleConnection(ws, req) {
  const clientId = genId("p");
  const name = `Gast-${clientId.slice(-3)}`;
  clients.set(ws, { id: clientId, name, roomId: null });

  send(ws, { type: "connected", clientId, name });
  send(ws, { type: "server_log", message: `Willkommen ${name}` });
  updateOnlineList();
  updateRooms();

  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);
      handleMessage(ws, data);
    } catch (e) {
      console.error("Bad message:", msg);
    }
  });

  ws.on("close", () => handleDisconnect(ws));
}

function handleDisconnect(ws) {
  const c = clients.get(ws);
  if (!c) return;
  if (c.roomId) {
    const room = rooms.get(c.roomId);
    if (room) {
      room.players = room.players.filter(p => p !== c.id);
      if (room.game) room.game.removePlayer(c.id);
      broadcast(room.id, { type: "server_log", message: `${c.name} hat den Raum verlassen.` });
      if (room.players.length === 0) rooms.delete(room.id);
    }
  }
  clients.delete(ws);
  updateOnlineList();
  updateRooms();
}

function handleMessage(ws, data) {
  const c = clients.get(ws);
  if (!c) return;

  // Signalling (WebRTC)
  if (data.type === "signal") {
    const targetId = data.to;
    for (const [sock, info] of clients.entries()) {
      if (info.id === targetId) {
        send(sock, {
          type: "signal",
          from: c.id,
          signalType: data.signalType,
          data: data.data,
        });
        return;
      }
    }
    return;
  }

  // Ping
  if (data.type === "ping") {
    send(ws, { type: "pong", message: data.message || "pong" });
    return;
  }

  // Chat
  if (data.type === "chat_message") {
    if (!c.roomId) return;
    broadcast(c.roomId, { type: "chat_message", from: c.name, message: data.message });
    return;
  }

  // Create room
  if (data.type === "create_room") {
    const rid = genId("r");
    const room = {
      id: rid,
      name: data.name || "Neuer Raum",
      players: [c.id],
      game: null,
    };
    rooms.set(rid, room);
    c.roomId = rid;
    room.game = new Game(rid, [c.id], { startingScore: data.startingScore || 501 });
    send(ws, { type: "joined_room", roomId: rid });
    broadcastAll({ type: "server_log", message: `${c.name} hat ${room.name} erstellt.` });
    updateRooms();
    return;
  }

  // Join room
  if (data.type === "join_room") {
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
    return;
  }

  // Leave room
  if (data.type === "leave_room") {
    const room = rooms.get(c.roomId);
    if (room) {
      room.players = room.players.filter(pid => pid !== c.id);
      if (room.game) room.game.removePlayer(c.id);
      broadcast(room.id, { type: "left_room", roomId: room.id });
      if (room.players.length === 0) rooms.delete(room.id);
    }
    c.roomId = null;
    updateRooms();
    return;
  }

  // Start game
  if (data.type === "start_game") {
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
    return;
  }

  // Throw
  if (data.type === "throw_dart") {
    const room = rooms.get(c.roomId);
    if (!room || !room.game) return;
    const res = room.game.playerThrow(c.id, data.value, data.mult);
    broadcast(room.id, res.state || res);
    return;
  }

  // Undo
  if (data.type === "undo_throw") {
    const room = rooms.get(c.roomId);
    if (!room || !room.game) return;
    const res = room.game.undoLastThrow(c.id);
    if (res.ok) broadcast(room.id, res.state);
    send(ws, { type: "server_log", message: res.message });
    return;
  }

  // Bull shot
  if (data.type === "bull_shot") {
    const room = rooms.get(c.roomId);
    if (!room || !room.game) return;
    const res = room.game.handleBullShot(c.id, data.mult);
    broadcast(room.id, res.state);
    return;
  }

  // Request room members
  if (data.type === "request_room_members") {
    const room = rooms.get(c.roomId);
    if (!room) return;
    const list = room.players.map(pid => ({
      id: pid,
      name: [...clients.values()].find(v => v.id === pid)?.name || pid,
    }));
    send(ws, { type: "room_members", roomId: room.id, members: list });
    return;
  }

  // Unknown
  send(ws, { type: "server_log", message: `Unbekannter Typ: ${data.type}` });
}

export const roomManager = {
  handleConnection,
  handleMessage,
  broadcast,
  send,
};
