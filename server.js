// Wir importieren die WebSocket-Bibliothek
const WebSocket = require('ws');

// Render.com gibt uns den Port über eine Umgebungsvariable vor.
// Falls wir doch lokal testen, nehmen wir als Fallback 8080.
const port = process.env.PORT || 8080;

// Wir erstellen die Server-Instanz
const wss = new WebSocket.Server({ port: port });

// Diese Funktion läuft, wenn sich ein neuer Client verbindet
wss.on('connection', function connection(ws) {
  
  console.log('Ein neuer Client hat sich verbunden!');
  
  // Sende eine Willkommensnachricht an den verbundenen Client
  ws.send('Willkommen! Du bist mit dem WebSocket-Server verbunden.');

  // Diese Funktion läuft, wenn eine Nachricht vom Client ankommt
  ws.on('message', function incoming(message) {
    // Wichtig: Die Nachricht kommt als Buffer an, wir wandeln sie in Text um.
    const messageText = message.toString('utf-8');
    
    console.log('Nachricht vom Client erhalten: %s', messageText);

    // Wir schicken die Nachricht zurück an den Client.
    ws.send(`Der Server hat deine Nachricht empfangen: "${messageText}"`);
  });

  // Diese Funktion läuft, wenn die Verbindung getrennt wird
  ws.on('close', () => {
    console.log('Ein Client hat die Verbindung getrennt.');
  });
  
});

// Startnachricht für das Server-Log
console.log(`WebSocket-Server gestartet und lauscht auf Port ${port}`);