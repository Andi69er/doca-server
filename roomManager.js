// roomManager.js
import { broadcast, sendToClient } from "./userManager.js";

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /**
   * Raum erstellen
   */
  createRoom(clientId, name = "Neuer Raum", options = {}, creatorName = "Unbekannt") {
    const id = "r" + Math.random().toString(36).substr(2, 6);

    const roomData = {
      id,
      name,
      players: [clientId],
      maxPlayers: 2,
      options: {
        startingScore: options.startingScore || 501,
        finishType: options.finishType || "double_out",
        doubleIn: !!options.doubleIn,
        startChoice: options.startChoice || "first"
      },
      creatorName
    };

    this.rooms.set(id, roomData);
    console.log(`🎯 Raum erstellt: ${name} (${id}) von ${creatorName}`);
    this.updateRooms();
    return id;
  }

  /**
   * Raumliste an alle senden
   */
  updateRooms() {
    broadcast({
      type: "room_update",
      rooms: Array.from(this.rooms.values())
    });
  }

  /**
   * Nachricht vom Client verarbeiten
   */
  handleMessage(ws, data, clientId) {
    switch (data.type) {
      case "create_room":
        // Fallback für alte Clients
        const creatorName = data.creatorName || "Unbekannt";
        const roomId = this.createRoom(clientId, data.name, {
          startingScore: data.startingScore,
          finishType: data.finishType,
          doubleIn: data.doubleIn,
          startChoice: data.startChoice
        }, creatorName);

        sendToClient(clientId, { type: "joined_room", roomId });
        break;

      case "list_rooms":
        sendToClient(clientId, {
          type: "room_update",
          rooms: Array.from(this.rooms.values())
        });
        break;

      default:
        // Nur wirklich Unbekanntes loggen
        if (data.type !== "list_online" && data.type !== "auth") {
          sendToClient(clientId, {
            type: "server_log",
            message: `Unbekannter Typ: ${data.type}`
          });
        }
        break;
    }
  }
}

export const roomManager = new RoomManager();
