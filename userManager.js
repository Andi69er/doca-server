// userManager.js (FINAL & CORRECTED)
const clients = new Map();      // Map<clientId, ws>
const users = new Map();        // Map<username, { clientId: string }>
const clientToUser = new Map(); // Map<clientId, username>

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1) ws.send(data);
    }
}

export function broadcastOnlineList() {
    const userList = Array.from(users.keys()).filter(u => !u.startsWith('Gast-'));
    broadcast({ type: "online_list", users: userList });
}

export function addUser(ws) {
    const clientId = makeClientId();
    clients.set(clientId, ws);
    sendToClient(clientId, { type: "connected", clientId });
    return clientId;
}

export function removeUser(clientId) {
    if (!clientId) return false;
    const username = clientToUser.get(clientId);
    clients.delete(clientId);
    clientToUser.delete(clientId);
    if (username && users.get(username)?.clientId === clientId) {
        users.delete(username);
    }
    broadcastOnlineList();
    return true;
}

export function authenticate(clientId, username) {
    if (!clientId || !username) return false;

    // Alte Verbindung für denselben Benutzernamen trennen
    if (users.has(username)) {
        const oldClientId = users.get(username).clientId;
        const oldSocket = clients.get(oldClientId);
        if (oldSocket && oldSocket.readyState === 1) {
            oldSocket.close(4001, "New connection established by the same user");
        }
    }
    
    users.set(username, { clientId });
    clientToUser.set(clientId, username);
    sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}` });
    broadcastOnlineList();
    return true;
}

export function getUserName(clientId) { return clientToUser.get(clientId) || null; }

export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

export function sendToUser(username, obj) {
    const user = users.get(username);
    if (user) {
        return sendToClient(user.clientId, obj);
    }
    return false;
}

export function broadcastToPlayers(usernames = [], obj) {
    for (const username of usernames) {
        sendToUser(username, obj);
    }
}