// roomManager.js – unverändert + Cricket
import Game from "./game.js";
import CricketGame from "./cricketGame.js";
import { broadcast, broadcastToPlayers, sendToClient } from "./userManager.js";

const rooms = new Map();
const userRooms = new Map();

export function createRoom(clientId, username, name, options = {}) {
    const roomId = crypto.randomUUID().slice(0,8);
    const mode = options.variant === "cricket" ? "cricket" : "x01";
    rooms.set(roomId, {
        id: roomId, name, ownerId: clientId, ownerUsername: username,
        players: [clientId, null], playerNames: [username, null],
        options, game: null, gameMode: mode
    });
    userRooms.set(clientId, roomId);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId });
}

export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const idx = room.playerNames.indexOf(null);
    if (idx !== -1) {
        room.players[idx] = clientId;
        room.playerNames[idx] = username;
        userRooms.set(clientId, roomId);
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
        broadcastRoomList();
    }
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (room) {
        room.players = room.players.map(p => p === clientId ? null : p);
        room.playerNames = room.playerNames.map(n => n === getUserName(clientId) ? null : n);
        userRooms.delete(clientId);
        if (room.players.every(p => !p)) {
            setTimeout(() => { if (rooms.has(roomId) && rooms.get(roomId).players.every(p => !p)) rooms.delete(roomId); broadcastRoomList(); }, 15000);
        } else {
            broadcastToPlayers(room.players.filter(Boolean), getState(room));
            broadcastRoomList();
        }
    }
}

function getState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return { type: "game_state", gameMode: room.gameMode, ...room, ...gameState };
}

export function broadcastRoomList() {
    broadcast({ type: "room_update", rooms: Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.ownerUsername,
        playerCount: r.playerNames.filter(Boolean).length, isStarted: !!r.game
    })) });
}

export function startGame(clientId) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (room && room.ownerId === clientId && room.players.filter(Boolean).length === 2) {
        room.game = room.gameMode === "cricket" 
            ? new CricketGame(room.players.filter(Boolean), room.options)
            : new Game(room.players.filter(Boolean), room.options);
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
    }
}

export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (room?.game?.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
    }
}