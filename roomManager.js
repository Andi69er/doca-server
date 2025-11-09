// roomManager.js
import { broadcast, sendToClient, getUserName } from "./userManager.js";

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Raum erstellen
   */
  createRoom(clientId, name = "Neuer Raum", options = {}) {
    const id = "r" + Math.random().toString(36).substr(2, 6);
    const creatorName = getUserName(clientId) || "Gast";

    const roomData = {
      id,
      name,
      players: [clientId],
      maxPlayers: 2,
      options: {
        startingScore: Number(options.startingScore) || 501,
        finishType: options.finishType || "double_out",
        doubleIn: !!options.doubleIn,
        startChoice: options.startChoice || "first",
      },
      creatorName,
    };

    this.rooms.set(id, roomData);
    console.log(`🎯 Raum erstellt: ${name} (${id}) von ${creatorName}`);
    this.updateRooms();
    return id;
  }

  /**
   * Raum beitreten
   */
  joinRoom(clientId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.players.includes(clientId)) return;
    if (room.players.length >= room.maxPlayers) return;

    room.players.push(clientId);
    this.updateRooms();
  }

  /**
   * Raum verlassen
   */
  leaveRoom(clientId) {
    for (const [id, room] of this.rooms.entries()) {
      if (room.players.includes(clientId)) {
        room.players = room.players.filter((p) => p !== clientId);
        if (room.players.length === 0) {
          this.rooms.delete(id);
        }
        this.updateRooms();
        break;
      }
    }
  }

  /**
   * Räume an alle Clients senden
   */
  updateRooms() {
    const list = [...this.rooms.values()].map((r) => ({
      id: r.id,
      name: r.name,
      players: r.players,
      maxPlayers: r.maxPlayers,
      creatorName: r.creatorName,
      options: r.options,
    }));
    broadcast({ type: "room_update", rooms: list });
  }
}

export const roomManager = new RoomManager();
