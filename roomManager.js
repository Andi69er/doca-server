// roomManager.js (FINAL & CORRECTED)
import { getUserName, broadcast, broadcastToPlayers, sendToClient, sendToUser } from "./userManager.js";
import Game from "./game.js";

const rooms = new Map();
const userRooms = new Map();

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id, name: r.name, owner: r.owner,
        playerCount: r.players.length, maxPlayers: r.maxPlayers, isStarted: !!r.game,
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

function getFullRoomState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return {
        type: "game_state", id: room.id, name: room.name, owner: room.owner,
        players: room.players, playerNames: room.players,
        maxPlayers: room.maxPlayers, options: room.options, ...gameState,
    };
}

export function createRoom(clientId, name, options) {
    const username = getUserName(clientId);
    if (!username) return;
    if (userRooms.has(username)) leaveRoom(clientId);
    
    const roomId = Math.random().toString(36).slice(2, 9);
    const room = {
        id: roomId, name: name || `Raum von ${username}`, owner: username,
        players: [username], maxPlayers: 2, options: options || {}, game: null,
    };
    rooms.set(roomId, room);
    userRooms.set(username, roomId);
    sendToClient(clientId, { type: "room_created", roomId: room.id });
    broadcastRoomList();
}

export function joinRoom(clientId, roomId) {
    const username = getUserName(clientId);
    if (!username) return;
    const room = rooms.get(roomId);
    if (!room) return sendToClient(clientId, { type: "error", message: "Raum nicht gefunden." });
    
    if (userRooms.has(username) && userRooms.get(username) !== roomId) leaveRoom(clientId);
    if (!room.players.includes(username)) {
        if (room.players.length >= room.maxPlayers) return sendToClient(clientId, { type: "error", message: "Raum ist voll." });
        room.players.push(username);
    }
    
    userRooms.set(username, roomId);
    broadcastToPlayers(room.players, getFullRoomState(room));
    broadcastRoomList();
}

export function leaveRoom(clientId) {
    const username = getUserName(clientId);
    if (!username) return;
    const roomId = userRooms.get(username);
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    userRooms.delete(username);
    
    if (room) {
        room.players = room.players.filter(pUsername => pUsername !== username);
        if (room.players.length === 0) {
            rooms.delete(roomId);
        } else {
            if (room.owner === username) room.owner = room.players[0];
            broadcastToPlayers(room.players, getFullRoomState(room));
        }
    }
    broadcastRoomList();
}

export function startGame(clientId) {
    const username = getUserName(clientId);
    const room = rooms.get(userRooms.get(username));
    if (room && room.owner === username && room.players.length > 1) {
        room.game = new Game(room.players, room.options);
        broadcastToPlayers(room.players, getFullRoomState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const username = getUserName(clientId);
    const room = rooms.get(userRooms.get(username));
    if (room?.game?.handleAction(username, action)) {
        broadcastToPlayers(room.players, getFullRoomState(room));
        if (room.game.winner) {
            broadcastRoomList();
        }
    }
}

export function handleGlobalChat(clientId, message) {
    const username = getUserName(clientId);
    if (username && message) {
        broadcast({ type: "chat_global", user: username, message: message });
    }
}

export function handleCameraStarted(clientId) {
    const username = getUserName(clientId);
    const room = rooms.get(userRooms.get(username));
    if (room) {
        const opponent = room.players.find(p => p !== username);
        if (opponent) {
            sendToUser(opponent, { type: "webrtc_camera_started_by_opponent" });
        }
    }
}

export function handleWebRTCSignal(clientId, payload) {
    const username = getUserName(clientId);
    if (!username || !payload || !payload.target) return;
    payload.from = username; // Füge den Absender hinzu
    sendToUser(payload.target, { type: "webrtc_signal", payload });
}