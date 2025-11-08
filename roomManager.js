// roomManager.js (Endgültige Version)
import { handleThrow, startGame, handleBull, handleUndo } from "./gameLogic.js";

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(name, ownerId) {
    const id = "room-" + Math.random().toString(36).substring(2, 8);
    this.rooms.set(id, {
      id,
      name,
      ownerId,
      players: [ownerId],
      started: false,
      state: null,
    });
    return this.rooms.get(id);
  }

  joinRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (!room.players.includes(playerId)) room.players.push(playerId);
    return room;
  }

  leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter((id) => id !== playerId);
  }

  handleMessage(ws, clientId, msg, sendToClient, broadcast) {
    const { type } = msg;

    switch (type) {
      case "create_room": {
        const room = this.createRoom(msg.name, clientId);
        sendToClient(ws, { type: "joined_room", roomId: room.id });
        this.broadcastRooms(broadcast);
        break;
      }

      case "join_room": {
        const room = this.joinRoom(msg.roomId, clientId);
        if (room) {
          sendToClient(ws, { type: "joined_room", roomId: room.id });
          this.broadcastRooms(broadcast);
        }
        break;
      }

      case "leave_room": {
        this.leaveRoom(msg.roomId, clientId);
        this.broadcastRooms(broadcast);
        break;
      }

      case "start_game": {
        const room = [...this.rooms.values()].find((r) =>
          r.players.includes(clientId)
        );
        if (room) {
          room.state = startGame(room.players, msg);
          room.started = true;
          this.updateGame(room, broadcast);
        }
        break;
      }

      case "throw_dart": {
        const room = [...this.rooms.values()].find((r) =>
          r.players.includes(clientId)
        );
        if (!room || !room.state) return;
        room.state = handleThrow(room.state, clientId, msg.value, msg.mult);
        this.updateGame(room, broadcast);
        break;
      }

      case "bull_shot": {
        const room = [...this.rooms.values()].find((r) =>
          r.players.includes(clientId)
        );
        if (!room || !room.state) return;
        room.state = handleBull(room.state, clientId, msg.mult);
        this.updateGame(room, broadcast);
        break;
      }

      case "undo_throw": {
        const room = [...this.rooms.values()].find((r) =>
          r.players.includes(clientId)
        );
        if (!room || !room.state) return;
        room.state = handleUndo(room.state, clientId);
        this.updateGame(room, broadcast);
        break;
      }

      default:
        break;
    }
  }

  broadcastRooms(broadcast) {
    const list = [...this.rooms.values()].map((r) => ({
      id: r.id,
      name: r.name,
      players: r.players,
      maxPlayers: 2,
    }));
    broadcast({ type: "room_update", rooms: list });
  }

  updateGame(room, broadcast) {
    broadcast({
      type: "game_state",
      ...room.state,
    });
  }
}

export const roomManager = new RoomManager();
