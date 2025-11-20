// roomManager.js – KORRIGIERT: Nur der designierte Starter kann das Spiel beginnen.
import Game from "./game.js";
import CricketGame from "./cricketGame.js";
import { broadcast, broadcastToPlayers, sendToClient, getUserName } from "./userManager.js";

const rooms = new Map();
const userRooms = new Map(); // Speichert, in welchem Raum ein User ist: clientId -> roomId

function getState(room) {
    const gameState = room.game ? room.game.getState() : {};
    return { 
        type: "game_state", 
        gameMode: room.gameMode,
        id: room.id,
        name: room.name,
        ownerId: room.ownerId, // Wichtig für die Client-Logik
        players: room.players,
        playerNames: room.playerNames,
        options: room.options,
        ...gameState 
    };
}

export function broadcastRoomList() {
    const roomList = Array.from(rooms.values()).map(r => ({
        id: r.id,
        name: r.name,
        owner: r.ownerUsername,
        playerCount: r.players.filter(Boolean).length,
        maxPlayers: 2,
        isStarted: !!r.game,
        variant: r.gameMode || "x01"
    }));
    broadcast({ type: "room_update", rooms: roomList });
}

export function createRoom(clientId, username, name, options = {}) {
    const room = {
        id: crypto.randomUUID().slice(0, 8),
        name: name || `${username}s Raum`,
        ownerId: clientId,
        ownerUsername: username,
        players: [clientId, null],
        playerNames: [username, null],
        options: options, // Enthält die "starter"-Option aus dem Modal
        game: null,
        gameMode: options.variant || "x01"
    };
    rooms.set(room.id, room);
    userRooms.set(clientId, room.id);
    broadcastRoomList();
    sendToClient(clientId, { type: "room_created", roomId: room.id });
}

export function joinRoom(clientId, username, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const emptySlotIndex = room.players.indexOf(null);
    if (emptySlotIndex !== -1) {
        room.players[emptySlotIndex] = clientId;
        room.playerNames[emptySlotIndex] = username;
        userRooms.set(clientId, roomId);
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
        broadcastRoomList();
    }
}

export function leaveRoom(clientId) {
    const roomId = userRooms.get(clientId);
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const playerIndex = room.players.indexOf(clientId);
    if (playerIndex !== -1) {
        room.players[playerIndex] = null;
        room.playerNames[playerIndex] = null;
        userRooms.delete(clientId);

        if (room.players.every(p => p === null)) {
            setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.players.every(p => p === null)) {
                    rooms.delete(roomId);
                    broadcastRoomList();
                }
            }, 10000);
        } else {
            broadcastToPlayers(room.players.filter(Boolean), getState(room));
            broadcastRoomList();
        }
    }
}

export function startGame(clientId) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);

    if (!room || room.game || room.players.filter(Boolean).length !== 2) {
        return;
    }
    
    const ownerId = room.ownerId;
    const opponentId = room.players.find(p => p && p !== ownerId);
    let designatedStarter = null;

    switch (room.options?.starter) {
        case 'Ich':
            designatedStarter = ownerId;
            break;
        case 'Gegner':
            designatedStarter = opponentId;
            break;
        case 'Ausbullen':
        default:
             // Bei "Ausbullen" darf jeder starten, da es nur die Routine initiiert.
             // Wenn Sie das nicht wollen, entfernen Sie die nächsten Zeilen.
             // Zur Sicherheit lasse ich es erstmal so, dass nur der Owner den Bull-Start auslösen kann.
            designatedStarter = ownerId; 
            break;
    }

    if (clientId === designatedStarter) {
        const gamePlayers = room.players.filter(Boolean);
        const sortedPlayers = [...gamePlayers].sort((a, b) => {
            if (a === designatedStarter) return -1;
            if (b === designatedStarter) return 1;
            return 0;
        });

        room.game = room.gameMode === "cricket"
            ? new CricketGame(sortedPlayers, room.options)
            : new Game(sortedPlayers, room.options);

        broadcastToPlayers(room.players.filter(Boolean), getState(room));
        broadcastRoomList();
    }
}

export function handleGameAction(clientId, action) {
    const roomId = userRooms.get(clientId);
    const room = rooms.get(roomId);
    if (room && room.game && room.game.handleAction(clientId, action)) {
        broadcastToPlayers(room.players.filter(Boolean), getState(room));
        if (room.game.winner) {
            broadcastRoomList();
        }
    }
}