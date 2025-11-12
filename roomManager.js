// serverdaten/roomManager.js (FINALE, ROBUSTE VERSION)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map(); // roomId -> room object
const userRooms = new Map(); // clientId -> roomId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state", // Immer game_state senden, das ist universeller
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players, // Wichtig: Behält die ClientIDs
        playerNames: room.players.map(pId => getUserName(pId)),
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

// ZENTRALE NEUE FUNKTION: Aktualisiert die clientId für einen Benutzer, der sich neu verbindet
export function updateUserConnection(username, newClientId) {
    for (const room of rooms.values()) {
        const playerIndex = room.playerNames.indexOf(username);
        if (playerIndex !== -1) {
            const oldClientId = room.players[playerIndex];
            room.players[playerIndex] = newClientId; // Ersetze die alte ID mit der neuen
            userRooms.set(newClientId, room.id);
            userRooms.delete(oldClientId);
            
            if (room.ownerUsername === username) {
                room.ownerId = newClientId; // Besitzer-ID aktualisieren!
            }
            console.log(`[${username}] hat sich neu verbunden. ClientID aktualisiert in Raum [${room.id}].`);
            broadcastToPlayers(room.players, getFullRoomState(room));
            return;
        }
    }
}

export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const ownerUsername = getUserName(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${ownerUsername}`, 
        ownerId: clientId, ownerUsername: ownerUsername, // Speichere beides!
        players: [clientId], playerNames: [ownerUsername],
        maxPlayers: 2, options, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, {type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });

    const username = getUserName(clientId);
    if (room.playerNames.includes(username)) {
        // Der Spieler ist dem Namen nach schon da, wahrscheinlich ein Reconnect
        updateUserConnection(username, clientId);
        return;
    }
    
    if (room.players.length >= room.maxPlayers) return;

    room.players.push(clientId);
    room.playerNames.push(username);
    userRooms.set(clientId, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    userRooms.delete(clientId);
    if (room) {
        const username = getUserName(clientId);
        room.players = room.players.filter(pId => pId !== clientId);
        room.playerNames = room.playerNames.filter(name => name !== username);

        if (room.players.length === 0) {
            rooms.delete(roomId);
        } else {
            if (room.ownerId === clientId) {
                room.ownerId = room.players[0];
                room.ownerUsername = room.playerNames[0];
            }
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}