// ===========================================
// roomManager.js
// Einfacher Raum- und Client-Manager für DOCA WebDarts
// - Exportiert "roomManager" mit handleConnection(ws, req)
// - Verwaltet: clients (Map), rooms (Map)
// - Unterstützte Client-Nachrichten (JSON): ping, chat_message, list_rooms, create_room, join_room, leave_room
// - Sendet an Clients ebenfalls JSON-Nachrichten mit "type" Feld
// ===========================================

/*
  Nachrichtenschema (Beispiele):

  Client -> Server:
  { type: "ping", message: "Client verbunden", name: "Andi" }
  { type: "chat_message", message: "Hallo Welt" }
  { type: "list_rooms" }
  { type: "create_room", name: "Raum 1", maxPlayers: 2 }
  { type: "join_room", roomId: "room-123" }
  { type: "leave_room", roomId: "room-123" }

  Server -> Client:
  { type: "pong", message: "Pong" }
  { type: "server_log", message: "Text" }
  { type: "online_list", users: ["A","B"] }
  { type: "room_update", rooms: [{ id, name, players: [...], maxPlayers }] }
  { type: "chat_message", from: "A", message: "Hi" }
*/

function makeId(prefix = "room") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

class RoomManager {
  constructor() {
    // clients: Map from clientId -> { ws, name, roomId (optional) }
    this.clients = new Map();
    // rooms: Map from roomId -> { id, name, maxPlayers, players: [clientId,...] }
    this.rooms = new Map();

    // optional default lobby
    // this.createRoom("Lobby", 100);
  }

  // Utility: send json safely
  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch (err) {
      // swallow - ws may be closed
      console.error("Fehler beim Senden:", err);
    }
  }

  // Broadcast to all connected clients
  broadcast(obj) {
    const str = JSON.stringify(obj);
    for (const { ws } of this.clients.values()) {
      try {
        if (ws.readyState === ws.OPEN) ws.send(str);
      } catch (err) {
        // ignore per-client send errors
      }
    }
  }

  // Send update about rooms to everyone
  broadcastRoomUpdate() {
    const rooms = Array.from(this.rooms.values()).map((r) => ({
      id: r.id,
      name: r.name,
      players: r.players.map((id) => this.clients.get(id)?.name || "unknown"),
      maxPlayers: r.maxPlayers,
    }));
    this.broadcast({ type: "room_update", rooms });
  }

  // Send online list to everyone
  broadcastOnlineList() {
    const users = Array.from(this.clients.values()).map((c) => c.name || "Gast");
    this.broadcast({ type: "online_list", users });
  }

  createRoom(name = "Neuer Raum", maxPlayers = 2) {
    const id = makeId("room");
    const room = { id, name, maxPlayers: Number(maxPlayers) || 2, players: [] };
    this.rooms.set(id, room);
    this.log(`Neuer Raum erstellt: ${name} (${id})`);
    this.broadcastRoomUpdate();
    return room;
  }

  // internal helper to add client to a room
  addClientToRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);
    if (!client || !room) return { ok: false, reason: "Client oder Raum nicht gefunden" };

    if (room.players.includes(clientId)) return { ok: false, reason: "Bereits im Raum" };
    if (room.players.length >= room.maxPlayers) return { ok: false, reason: "Raum voll" };

    // remove from previous room if any
    if (client.roomId) this.removeClientFromRoom(clientId, client.roomId);

    room.players.push(clientId);
    client.roomId = roomId;

    this.log(`Client ${client.name || clientId} ist Raum beigetreten: ${room.name} (${room.id})`);
    this.broadcastRoomUpdate();
    return { ok: true };
  }

  removeClientFromRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    const room = this.rooms.get(roomId);
    if (!client || !room) return;

    const idx = room.players.indexOf(clientId);
    if (idx !== -1) room.players.splice(idx, 1);
    if (client.roomId === roomId) client.roomId = null;

    this.log(`Client ${client.name || clientId} hat Raum verlassen: ${room.name} (${room.id})`);

    // if room becomes empty, optional: delete it (here we keep rooms unless explicitly removed)
    // if (room.players.length === 0) this.rooms.delete(roomId);

    this.broadcastRoomUpdate();
  }

  // Remove client entirely
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.roomId) this.removeClientFromRoom(clientId, client.roomId);
    this.clients.delete(clientId);
    this.log(`Client entfernt: ${client.name || clientId}`);
    this.broadcastOnlineList();
  }

  // Logging helper (also broadcast to clients optionally)
  log(msg) {
    console.log(msg);
    this.broadcast({ type: "server_log", message: msg });
  }

  // The main entry: handle a newly established ws connection
  handleConnection(ws, req) {
    // create a clientId
    const clientId = Math.random().toString(36).slice(2, 9);
    // try to get name from query string if provided: ?name=Andi
    let name = "Gast";
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.searchParams.get("name")) name = url.searchParams.get("name");
    } catch (e) {
      // ignore
    }

    const client = { ws, id: clientId, name, roomId: null };
    this.clients.set(clientId, client);

    // acknowledge to client with their id (so client can later refer)
    this.send(ws, { type: "connected", clientId, name });
    this.log(`🔌 Neue Verbindung hergestellt: ${name} (${clientId})`);
    this.broadcastOnlineList();

    ws.on("message", (raw) => {
      let data;
      try {
        data = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(raw.toString());
      } catch (err) {
        this.send(ws, { type: "server_log", message: "Ungültiges JSON empfangen" });
        return;
      }

      // Normalize type
      const t = (data.type || "").toString();

      switch (t) {
        case "ping":
          this.send(ws, { type: "pong", message: data.message || "pong" });
          break;

        case "set_name":
          // client can set their display name
          if (data.name && typeof data.name === "string") {
            client.name = data.name.substring(0, 32);
            this.send(ws, { type: "server_log", messa_
