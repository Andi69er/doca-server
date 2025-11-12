// serverdaten/roomManager.js (FINALE, STABILE VERSION 2.0)
import { getUserName, broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map(); // clientId -> roomId

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.players.filter(p => p).length, maxPlayers: r.maxPlayers, isStarted: !!r.game?.isStarted,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    if (!room) return null;
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state",
        id: room.id, name: room.name, ownerId: room.ownerId,
        players: room.players,
        playerNames: room.playerNames,
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

export function createRoom(clientId, name, options) {
    if (userRooms.has(clientId)) leaveRoom(clientId);
    const ownerUsername = getUserName(clientId);
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${ownerUsername}`,
        ownerId: clientId, ownerUsername: ownerUsername,
        players: [clientId, null], // Slot 0 für den Ersteller
        playerNames: [ownerUsername, null], // Name in Slot 0
        maxPlayers: 2, options: { ...options, startingScore: options.distance }, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: roomId });
}

export function joinRoom(clientId, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const username = getUserName(clientId);

    // KERNLOGIK 1: Spieler verbindet sich neu (Name ist schon im Raum)
    const playerIndex = room.playerNames.indexOf(username);
    if (playerIndex !== -1) {
        room.players[playerIndex] = clientId; // Alte (jetzt ungültige) ID mit der neuen überschreiben
        userRooms.set(clientId, roomId);
        console.log(`[${username}] hat sich neu verbunden in Slot ${playerIndex}.`);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
        return;
    }

    // KERNLOGIK 2: Neuer Spieler betritt einen leeren Slot
    const emptyIndex = room.playerNames.indexOf(null);
    if (emptyIndex !== -1) {
        room.players[emptyIndex] = clientId;
        room.playerNames[emptyIndex] = username;
        userRooms.set(clientId, roomId);
        console.log(`[${username}] ist beigetreten in Slot ${emptyIndex}.`);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);

    if (playerIndex !== -1) {
        const username = room.playerNames[playerIndex];
        
        // KERNLOGIK 3: Slot NICHT leeren, nur die ClientID entfernen.
        // Der Name bleibt, um den Platz zu reservieren.
        console.log(`[${username}] hat Verbindung getrennt. Slot ${playerIndex} wird reserviert.`);
        room.players[playerIndex] = null;
        userRooms.delete(clientId);

        // Allen mitteilen, dass der Spieler (vorübergehend) weg ist
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function startGame(clientId) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room && room.ownerId === clientId && room.players.filter(p=>p).length > 1) {
        room.game = new Game(room.players.filter(p=>p), room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}

export function handleGameAction(clientId, action) {
    const room = userRooms.has(clientId) ? rooms.get(userRooms.get(clientId)) : null;
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
    }
}