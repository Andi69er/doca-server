// userManager.js (REVISED & CORRECTED)
const clients = new Map(); // Map<clientId, ws>
const users = new Map();   // Map<username, { clientId: string }>
const clientToUser = new Map(); // Map<clientId, username>

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
    const userList = Array.from(users.keys());
    broadcast({ type: "online_list", users: userList });
}

// Fügt eine neue Verbindung hinzu und generiert eine temporäre ID
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

// Entfernt einen Benutzer bei Verbindungsabbruch
export function removeUser(clientId) {
    if (!clientId) return false;
    
    const username = clientToUser.get(clientId);
    clients.delete(clientId);
    clientToUser.delete(clientId);
    
    // Wichtig: Den Benutzer nur entfernen, wenn dies seine letzte aktive Verbindung war.
    // Dies verhindert, dass er bei einem Seitenwechsel sofort als "offline" gilt.
    if (username && users.get(username)?.clientId === clientId) {
        users.delete(username);
    }
    
    broadcastOnlineList();
    return true;
}

// Weist einem Benutzer nach dem Login seinen richtigen Namen zu
// Dies ist die Schlüsselfunktion für die persistente Logik
export function authenticate(clientId, username) {
    if (!clientId || !username) return false;

    const oldUsername = clientToUser.get(clientId);
    
    // Wenn der Benutzer bereits unter einem anderen Namen angemeldet war, diesen entfernen
    if (oldUsername && oldUsername !== username) {
        users.delete(oldUsername);
    }

    // WICHTIG: Alte Verbindung für denselben Benutzernamen übernehmen/schließen
    if (users.has(username)) {
        const oldClientId = users.get(username).clientId;
        const oldSocket = clients.get(oldClientId);
        if (oldSocket && oldSocket.readyState === 1) {
            // Optional: Alte Verbindung schließen, um doppelte Logins zu verhindern
            // oldSocket.close(1000, "New connection established");
        }
    }
    
    users.set(username, { clientId });
    clientToUser.set(clientId, username);

    sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}` });
    broadcastOnlineList();
    return true;
}

// Holt den Namen eines Benutzers anhand seiner clientId
export function getUserName(clientId) { return clientToUser.get(clientId) || null; }

// Sendet eine Nachricht an einen EINZELNEN Client (via clientId)
export function sendToClient(clientId, obj) {
    const ws = clients.get(clientId);
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

// Sendet eine Nachricht an eine Gruppe von Spielern (via username)
export function broadcastToPlayers(usernames = [], obj) {
    for (const username of usernames) {
        const user = users.get(username);
        if (user) {
            sendToClient(user.clientId, obj);
        }
    }
}