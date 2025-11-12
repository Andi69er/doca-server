// userManager.js (FINAL & COMPLETE)
const clients = new Map();
const users = new Map();
const sockets = new WeakMap();

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

// Sendet eine Nachricht an ALLE verbundenen Clients
export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1) ws.send(data);
    }
}

// Sendet die aktuelle Online-Liste an alle
export function broadcastOnlineList() {
    console.log("   -> Antwort: Sende Online-Liste an alle Clients...");
    const userList = Array.from(users.values()).map(u => u.username);
    broadcast({ type: "online_list", users: userList });
}

// Fügt einen neuen Benutzer hinzu, wenn eine neue Verbindung aufgebaut wird
export function addUser(ws) {
    const clientId = makeClientId();
    const defaultUsername = `Gast-${clientId.slice(0, 5)}`;
    clients.set(clientId, ws);
    users.set(clientId, { username: defaultUsername });
    sockets.set(ws, clientId);
    sendToClient(clientId, { type: "connected", clientId, name: defaultUsername });
    broadcastOnlineList();
    return clientId;
}

// Entfernt einen Benutzer bei Verbindungsabbruch
export function removeUser(clientId) {
    if (!clientId) return false;
    clients.delete(clientId);
    users.delete(clientId);
    broadcastOnlineList();
    return true;
}

// Weist einem Benutzer nach dem Login seinen richtigen Namen zu
export function authenticate(clientId, username) {
    if (!clientId || !username) return false;
    const user = users.get(clientId);
    if (user) {
        user.username = username;
        sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}` });
        broadcastOnlineList();
    }
    return !!user;
}

// Holt den Namen eines Benutzers
export function getUserName(clientId) { return users.get(clientId)?.username || null; }

// Sendet eine Nachricht an einen EINZELNEN Client
export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

// Sendet eine Nachricht an eine Gruppe von Spielern (z.B. in einem Raum)
export function broadcastToPlayers(playerIds = [], obj) {
    for (const pid of playerIds) sendToClient(pid, obj);
}