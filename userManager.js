// userManager.js (FINAL & COMPLETE - CORRECTED VERSION)
const clients = new Map(); // Map<clientId, ws>
const users = new Map();   // Map<username, { clientId: string }>
const clientToUser = new Map(); // Map<clientId, username>

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.values()) {
        if (ws && ws.readyState === 1) ws.send(data);
    }
}

export function broadcastOnlineList() {
    const userList = Array.from(users.keys());
    broadcast({ type: "online_list", users: userList });
}

export function addUser(ws) {
    const clientId = makeClientId();
    const tempUsername = `Gast-${clientId.slice(0, 5)}`;
    
    clients.set(clientId, ws);
    clientToUser.set(clientId, tempUsername);
    users.set(tempUsername, { clientId });
    
    sendToClient(clientId, { type: "connected", clientId, name: tempUsername });
    broadcastOnlineList();
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

    const oldUsername = clientToUser.get(clientId);
    
    if (oldUsername && oldUsername !== username) {
        users.delete(oldUsername);
    }
    
    if (users.has(username)) {
        const oldClientId = users.get(username).clientId;
        const oldSocket = clients.get(oldClientId);
        if (oldSocket && oldSocket.readyState === 1) {
            // Optional: Alte Verbindung benachrichtigen oder schließen
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

export function broadcastToPlayers(usernames = [], obj) {
    for (const username of usernames) {
        const user = users.get(username);
        if (user) {
            sendToClient(user.clientId, obj);
        }
    }
}