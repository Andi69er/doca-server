// roomManager.js (FINAL v4.0)
import * as userManager from "./userManager.js";

const rooms = new Map();

export function createRoom(clientId, name, options) {
    if (!clientId) return;
    const id = Math.random().toString(36).slice(2, 9);
    rooms.set(id, {
        id,
        name,
        ownerId: clientId,
        players: [clientId],
        options, // Optionen werden hier 1:1 gespeichert
        maxPlayers: 2
    });
    updateRoomList();
}

export function updateRoomList() {
    const list = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        owner: userManager.getUserName(r.ownerId) || "Gast",
        playerCount: r.players.length,
        maxPlayers: r.maxPlayers,
        options: r.options || {} // Optionen werden hier 1:1 gesendet
    }));
    userManager.broadcast({ type: "room_update", rooms: list });
}