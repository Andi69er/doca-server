// roomManager.js (RESTORED & FINAL v5.0)
import { getUserName, broadcast, broadcastToPlayers, getClientId } from "./userManager.js";

const rooms = new Map();
const userRooms = new Map();

export function createRoom(clientId, name, options = {}) {
    if (!clientId) return null;
    if (userRooms.has(clientId)) return userRooms.get(clientId);

    const id = Math.random().toString(36).slice(2, 9);
    const room = {
        id, name, ownerId: clientId,
        players: [clientId], // Creator is automatically a player
        options, maxPlayers: 2
    };
    rooms.set(id, room);
    userRooms.set(clientId, id);
    updateRoomList();
    return id;
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room || room.players.includes(clientId) || room.players.length >= room.maxPlayers) return false;
    
    leaveRoom(clientId); // Leave any previous room
    
    room.players.push(clientId);
    userRooms.set(clientId, roomId);
    updateRoomList();
    return true;
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return false;
    const room = rooms.get(roomId);
    userRooms.delete(clientId);
    if (!room) return false;
    
    room.players = room.players.filter(p => p !== clientId);
    if (room.players.length === 0) {
        rooms.delete(roomId);
    } else {
        if (room.ownerId === clientId) room.ownerId = room.players[0];
    }
    updateRoomList();
    return true;
}

export function getRoomByClientId(clientId) {
    const roomId = userRooms.get(clientId);
    return roomId ? rooms.get(roomId) : null;
}

export function getRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return {
        ...room,
        playerNames: room.players.map(p => getUserName(p) || "Gast")
    };
}

export function updateRoomList() {
    const list = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        owner: getUserName(r.ownerId) || "Gast",
        playerCount: r.players.length,
        options: r.options || {}
    }));
    broadcast({ type: "room_update", rooms: list });
}