// userManager.js (REVISED & ROBUST - WITH FIX)
const users = new Map(); // Key: username, Value: { clientId, ws, disconnectTimer }
const clientToUser = new Map(); // Key: clientId, Value: username

function makeClientId() { return Math.random().toString(36).substring(2, 9); }

// Sendet eine Nachricht an ALLE verbundenen Clients
export function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const user of users.values()) {
        if (user.ws && user.ws.readyState === 1) {
            user.ws.send(data);
        }
    }
}

// Sendet die aktuelle Online-Liste an alle
export function broadcastOnlineList() {
    console.log("   -> Antwort: Sende Online-Liste an alle Clients...");
    const userList = Array.from(users.keys());
    broadcast({ type: "online_list", users: userList });
}

// Registriert eine neue Verbindung und weist eine temporäre ID zu
export function registerConnection(ws) {
    const clientId = makeClientId();
    const tempUsername = `Gast-${clientId.slice(0, 5)}`;
    
    // Zuerst als temporärer Gast speichern
    users.set(tempUsername, { clientId, ws, disconnectTimer: null });
    clientToUser.set(clientId, tempUsername);

    sendToClient(clientId, { type: "connected", clientId, name: tempUsername });
    return clientId;
}

// Authentifiziert einen Benutzer und macht seine Identität persistent
export function authenticate(clientId, username) {
    const oldUsername = clientToUser.get(clientId);
    if (!oldUsername) return false;

    // Wenn der Benutzer bereits unter diesem Namen bekannt ist (Wiederverbindung)
    if (users.has(username)) {
        console.log(`Benutzer ${username} verbindet sich erneut.`);
        const existingUser = users.get(username);

        // Alten temporären Gast-Eintrag entfernen
        if (oldUsername && oldUsername.startsWith('Gast-')) {
            users.delete(oldUsername);
        }
        
        // Timeout für die Trennung abbrechen, falls vorhanden
        if (existingUser.disconnectTimer) {
            clearTimeout(existingUser.disconnectTimer);
            existingUser.disconnectTimer = null;
            console.log(`   -> Reconnection-Timer für ${username} gestoppt.`);
        }
        
        // Neue Verbindungsdaten zuweisen
        existingUser.ws = users.get(oldUsername).ws;
        existingUser.clientId = clientId;
        clientToUser.set(clientId, username);

    } else { // Neuer Benutzer
        console.log(`Neuer Benutzer authentifiziert: ${username}`);
        const guestData = users.get(oldUsername);
        users.delete(oldUsername); // Temporären Gast-Eintrag entfernen
        
        users.set(username, { ...guestData, disconnectTimer: null });
        clientToUser.set(clientId, username);
    }

    sendToClient(clientId, { type: "auth_ok", message: `Authentifiziert als ${username}` });
    broadcastOnlineList();
    return true;
}

// Startet den Prozess zum Entfernen eines Benutzers bei Verbindungsabbruch
export function startUserRemoval(clientId) {
    const username = clientToUser.get(clientId);
    if (!username) return;

    const user = users.get(username);
    if (!user) return;
    
    // Wenn der Benutzer ein Gast ist, sofort entfernen
    if (username.startsWith('Gast-')) {
        console.log(`Gast ${username} wird sofort entfernt.`);
        clientToUser.delete(clientId);
        users.delete(username);
        broadcastOnlineList();
        const roomManager = import('./roomManager.js').then(rm => rm.handleFinalUserRemoval(username));
        return username;
    }

    // Für registrierte Benutzer einen Timer starten
    console.log(`Verbindung für ${username} verloren. Starte 10s Reconnection-Timer.`);
    user.ws = null; // WebSocket-Objekt entfernen

    user.disconnectTimer = setTimeout(async () => {
        console.log(`Reconnection-Timer für ${username} abgelaufen. Benutzer wird entfernt.`);
        users.delete(username);
        clientToUser.delete(clientId);
        broadcastOnlineList();
        // Hier muss der roomManager informiert werden, dass der User endgültig weg ist
        const roomManager = await import('./roomManager.js');
        roomManager.handleFinalUserRemoval(username);
    }, 10000); // 10 Sekunden Grace Period

    return username;
}

export function getUserName(clientId) { return clientToUser.get(clientId) || null; }
export function getClientId(username) { return users.get(username)?.clientId || null; }

export function sendToUser(username, obj) {
    const user = users.get(username);
    if (user && user.ws && user.ws.readyState === 1) {
        user.ws.send(JSON.stringify(obj));
        return true;
    }
    return false;
}

export function sendToClient(clientId, obj) {
    const username = clientToUser.get(clientId);
    if (username) return sendToUser(username, obj);
    return false;
}

export function broadcastToUsers(usernames = [], obj) {
    for (const username of usernames) sendToUser(username, obj);
}