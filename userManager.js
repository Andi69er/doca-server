// userManager.js (FINALE, STABILE VERSION 13.0 - mit Fehlerbehandlung)
const clients = new Map(); // clientId -> ws
const users = new Map(); // clientId -> { username }
const sockets = new WeakMap(); // ws -> clientId

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

// --- KORRIGIERTE BROADCAST-FUNKTION ---
export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        try {
            if (ws && ws.readyState === 1) { // 1 === WebSocket.OPEN
                ws.send(data);
            }
        } catch (error) {
            // Fängt Fehler wie EPIPE ab, wenn ein Client genau beim Senden die Verbindung verliert.
            console.error(`Broadcast-Fehler beim Senden an einen Client (wird ignoriert):`, error.code);
        }
    }
}

export function broadcastOnlineList() {
    const userList = Array.from(users.values())
        .map(u => u.username)
        .filter(Boolean); // Stellt sicher, dass nur gültige Namen gesendet werden
    broadcast({ type: "online_list", users: userList });
}

export function addUser(ws, req) {
    // KORREKTUR: Echte IP-Adresse aus den Headern auslesen
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`✅ Client verbindet sich von IP: ${ip}`);

    const clientId = makeClientId();
    clients.set(clientId, ws);
    users.set(clientId, { username: `Gast-${clientId.slice(0, 4)}` });
    sockets.set(ws, clientId);
    sendToClient(clientId, { type: "connected", clientId });
    return clientId;
}

export function removeUser(ws) {
    const clientId = sockets.get(ws);
    if (!clientId) return;
    
    const username = users.get(clientId)?.username || 'Unbekannt';
    console.log(`❌ Client ${username} (${clientId}) hat die Verbindung getrennt.`);

    sockets.delete(ws);
    clients.delete(clientId);
    users.delete(clientId);
    broadcastOnlineList();
}

export function authenticate(clientId, username) {
    if (!clientId || !username) return false;
    const user = users.get(clientId);
    if (user) {
        console.log(`🔐 Authentifiziere Client ${clientId} als: ${username}`);
        user.username = username;
        sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}`, clientId });
        broadcastOnlineList();
        return true;
    }
    return false;
}

export function getUserName(clientId) { return users.get(clientId)?.username || null; }

// --- KORRIGIERTE SEND-FUNKTION ---
export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        try {
            ws.send(JSON.stringify(obj));
            return true;
        } catch (error) {
            console.error(`Send-Fehler an Client ${clientId} (wird ignoriert):`, error.code);
            return false;
        }
    }
    return false;
}

export function broadcastToPlayers(playerIds = [], obj) {
    for (const pid of playerIds) {
        if(pid) sendToClient(pid, obj);
    }
}

export function getClientId(ws) {
    return sockets.get(ws);
}