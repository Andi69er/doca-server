// serverdaten/userManager.js (FINALE, ROBUSTE VERSION)
const clients = new Map(); // clientId -> ws
const users = new Map(); // clientId -> { username }
const sockets = new WeakMap(); // ws -> clientId

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1) ws.send(data);
    }
}

export function broadcastOnlineList() {
    const userList = Array.from(users.values())
        .map(u => u.username)
        .filter((name, index, self) => self.indexOf(name) === index && !name.startsWith('Gast-')); // Nur eingeloggte, eindeutige Namen
    broadcast({ type: "online_list", users: userList });
}

export function addUser(ws) {
    const clientId = makeClientId();
    const defaultUsername = `Gast-${clientId.slice(0, 5)}`;
    clients.set(clientId, ws);
    users.set(clientId, { username: defaultUsername });
    sockets.set(ws, clientId);
    sendToClient(clientId, { type: "connected", clientId, name: defaultUsername });
    return clientId;
}

export function removeUser(clientId) {
    if (!clientId) return false;
    clients.delete(clientId);
    users.delete(clientId);
    broadcastOnlineList();
    return true;
}

export function authenticate(clientId, username) {
    if (!clientId || !username) return false;
    const user = users.get(clientId);
    if (user) {
        user.username = username;
        sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}`, clientId });
        broadcastOnlineList();
        return true;
    }
    return false;
}

export function getUserName(clientId) { return users.get(clientId)?.username || null; }

// NEUE, WICHTIGE FUNKTION
export function getClientIdByUsername(username) {
    for (const [clientId, user] of users.entries()) {
        if (user.username === username) {
            return clientId;
        }
    }
    return null;
}

export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

export function broadcastToPlayers(playerIds = [], obj) {
    for (const pid of playerIds) sendToClient(pid, obj);
}