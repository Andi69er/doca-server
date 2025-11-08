// roomManager.js
// Raum-Manager + Game-Integration (nutzt Game mit 3-Dart-Runden)

import { Game } from "./gameLogic.js";

function makeId(prefix = "room") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

class RoomManager {
  constructor() {
    this.clients = new Map();
    this.rooms = new Map();
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { console.error(e); }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const { ws } of this.clients.values()) {
      try { if (ws.readyState === ws.OPEN) ws.send(s); } catch (e) {}
    }
  }

  broadcastToClientIds(ids, obj) {
    const s = JSON.stringify(obj);
    ids.forEach(id => {
      const c = this.clients.get(id);
      if (c && c.ws && c.ws.readyState === c.ws.OPEN) {
        try { c.ws.send(s); } catch (e) {}
      }
    });
  }

  broadcastRoomUpdate() {
    const rooms = Array.from(this.rooms.values()).map(r => ({
      id: r.id,
      name: r.name,
      players: r.players.map(id => this.clients.get(id)?.name || "unknown"),
      maxPlayers: r.maxPlayers,
      hasGame: !!r.game
    }));
    this.broadcast({ type: "room_update", rooms });
  }

  broadcastOnlineList() {
    const users = Array.from(this.clients.values()).map(c => c.name || "Gast");
    this.broadcast({ type: "online_list", users });
  }

  createRoom(name = "Neuer Raum", maxPlayers = 2) {
    const id = makeId("room");
    const room = { id, name, maxPlayers: Number(maxPlayers) || 2, players: [], game: null };
    this.rooms.set(id, room);
    this.log(`Neuer Raum erstellt: ${name} (${id})`);
    this.broadcastRoomUpdate();
    return room;
  }

  addClientToRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);
    if (!client || !room) return { ok:false, reason:"Client oder Raum nicht gefunden" };
    if (room.players.includes(clientId)) return { ok:false, reason:"Bereits im Raum" };
    if (room.players.length >= room.maxPlayers) return { ok:false, reason:"Raum voll" };

    if (client.roomId) this.removeClientFromRoom(clientId, client.roomId);

    room.players.push(clientId);
    client.roomId = roomId;

    if (room.game) room.game.addPlayer(clientId);

    this.log(`Client ${client.name} ist Raum beigetreten: ${room.name} (${room.id})`);
    this.broadcastRoomUpdate();
    this.broadcastOnlineList();
    if (room.game) this.broadcastToClientIds(room.players, room.game.getState());
    return { ok:true };
  }

  removeClientFromRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);
    if (!client || !room) return;
    const idx = room.players.indexOf(clientId);
    if (idx !== -1) room.players.splice(idx,1);
    if (client.roomId === roomId) client.roomId = null;

    if (room.game) {
      room.game.removePlayer(clientId);
      if (room.game.players.length <= 1) room.game.started = false;
    }

    this.log(`Client ${client.name} hat Raum verlassen: ${room.name} (${room.id})`);
    this.broadcastRoomUpdate();
    this.broadcastOnlineList();
    if (room.game) this.broadcastToClientIds(room.players, room.game.getState());
  }

  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.roomId) this.removeClientFromRoom(clientId, client.roomId);
    this.clients.delete(clientId);
    this.log(`Client entfernt: ${client.name}`);
    this.broadcastOnlineList();
  }

  log(msg) {
    console.log(msg);
    this.broadcast({ type: "server_log", message: msg });
  }

  startGameInRoom(roomId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return { ok:false, message: "Raum nicht gefunden" };
    if (room.game && room.game.started) return { ok:false, message:"Spiel läuft bereits" };
    const players = Array.from(room.players);
    const startingScore = Number(options.startingScore) || 501;
    const game = new Game(roomId, players, startingScore);
    const state = game.start();
    room.game = game;
    this.log(`Spiel gestartet in Raum ${room.name} (${room.id}) mit ${players.length} Spielern`);
    this.broadcastToClientIds(room.players, state);
    return { ok:true, state };
  }

  handlePlayerThrow(clientId, roomId, value) {
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return { ok:false, message: "Kein Spiel aktiv" };
    const res = room.game.playerThrow(clientId, value);
    // broadcast updated state to room
    this.broadcastToClientIds(room.players, room.game.getState());
    if (res.message) this.log(`Throw result: ${res.message} (player ${clientId}, value ${value})`);
    return res;
  }

  handleConnection(ws, req) {
    const clientId = Math.random().toString(36).slice(2,9);
    let name = "Gast";
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.searchParams.get("name")) name = url.searchParams.get("name");
    } catch(e) {}

    const client = { ws, id: clientId, name, roomId: null };
    this.clients.set(clientId, client);

    this.send(ws, { type: "connected", clientId, name });
    this.log(`🔌 Neue Verbindung hergestellt: ${name} (${clientId})`);
    this.broadcastOnlineList();

    ws.on("message", (raw) => {
      let data;
      try { data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString()); }
      catch (err) { this.send(ws, { type:"server_log", message:"Ungültiges JSON empfangen" }); return; }

      const t = (data.type || "").toString();

      switch (t) {
        case "ping":
          this.send(ws, { type:"pong", message: data.message || "pong" });
          break;

        case "set_name":
          if (data.name && typeof data.name === "string") {
            client.name = data.name.substring(0,32);
            this.send(ws, { type:"server_log", message: `Name gesetzt: ${client.name}` });
            this.broadcastOnlineList();
            this.broadcastRoomUpdate();
          }
          break;

        case "chat_message": {
          const text = data.message ? String(data.message).slice(0,1000) : "";
          if (client.roomId) {
            const room = this.rooms.get(client.roomId);
            if (room) this.broadcastToClientIds(room.players, { type:"chat_message", from: client.name, message: text });
          } else {
            this.broadcast({ type:"chat_message", from: client.name, message: text });
          }
          break;
        }

        case "list_rooms": {
          const rooms = Array.from(this.rooms.values()).map((r) => ({
            id: r.id,
            name: r.name,
            players: r.players.map((id) => this.clients.get(id)?.name || "unknown"),
            maxPlayers: r.maxPlayers,
            hasGame: !!r.game
          }));
          this.send(ws, { type:"room_update", rooms });
          break;
        }

        case "create_room": {
          const name = data.name ? String(data.name).slice(0,64) : "Neuer Raum";
          const maxPlayers = Number(data.maxPlayers) || 2;
          const room = this.createRoom(name, maxPlayers);
          this.addClientToRoom(clientId, room.id);
          this.send(ws, { type:"server_log", message: `Raum erstellt und beigetreten: ${room.name}` });
          this.send(ws, { type:"joined_room", roomId: room.id });
          break;
        }

        case "join_room": {
          const roomId = data.roomId;
          if (!roomId || !this.rooms.has(roomId)) { this.send(ws, { type:"server_log", message:"Raum nicht gefunden"}); break; }
          const res = this.addClientToRoom(clientId, roomId);
          if (res.ok) this.send(ws, { type:"joined_room", roomId });
          else this.send(ws, { type:"server_log", message:`Beitritt fehlgeschlagen: ${res.reason}` });
          break;
        }

        case "leave_room": {
          const roomId = data.roomId || client.roomId;
          if (roomId && this.rooms.has(roomId)) {
            this.removeClientFromRoom(clientId, roomId);
            this.send(ws, { type:"left_room", roomId });
          } else {
            this.send(ws, { type:"server_log", message:"Kein Raum zu verlassen" });
          }
          break;
        }

        case "start_game": {
          const roomId = data.roomId || client.roomId;
          if (!roomId) { this.send(ws, { type:"server_log", message:"Du bist in keinem Raum" }); break; }
          const opts = { startingScore: Number(data.startingScore) || 501 };
          const res = this.startGameInRoom(roomId, opts);
          if (!res.ok) this.send(ws, { type:"server_log", message:`Spielstart fehlgeschlagen: ${res.message}` });
          break;
        }

        case "throw_dart": {
          const roomId = data.roomId || client.roomId;
          const value = Number(data.value) || 0;
          if (!roomId) { this.send(ws, { type:"server_log", message:"Du bist in keinem Raum" }); break; }
          const res = this.handlePlayerThrow(clientId, roomId, value);
          if (!res.ok) this.send(ws, { type:"server_log", message:`Wurf fehlgeschlagen: ${res.message}` });
          break;
        }

        default:
          this.send(ws, { type:"server_log", message:`Unbekannter Nachrichtentyp: ${t}` });
          break;
      }
    });

    ws.on("close", () => {
      this.log(`Verbindung getrennt: ${client.name} (${clientId})`);
      this.removeClient(clientId);
    });

    ws.on("error", (err) => {
      console.error("WebSocket-Fehler clientId=", clientId, err);
      this.removeClient(clientId);
    });
  }
}

export const roomManager = new RoomManager();
