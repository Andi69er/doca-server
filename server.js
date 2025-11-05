const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: port });

// Eine einfache Variable, um die verbundenen Spieler zu speichern.
// Für den Anfang verbinden wir einfach die ersten beiden, die sich verbinden.
let players = [];

wss.on('connection', function connection(ws) {
  
  if (players.length >= 2) {
    console.log('Ein dritter Spieler hat versucht, sich zu verbinden. Abgelehnt.');
    ws.send(JSON.stringify({ type: 'error', message: 'Das Spiel ist bereits voll.' }));
    ws.close();
    return;
  }

  const playerIndex = players.push(ws) - 1;
  console.log(`Spieler ${playerIndex + 1} hat sich verbunden.`);

  // Sende dem Spieler seine Nummer
  ws.send(JSON.stringify({ type: 'welcome', playerIndex: playerIndex }));

  ws.on('message', function incoming(message) {
    const messageText = message.toString('utf-8');
    
    // Wir leiten jetzt nicht mehr einfach Text weiter, sondern strukturierte Daten (JSON)
    // Wir parsen die ankommende Nachricht
    const data = JSON.parse(messageText);

    // Finde den anderen Spieler
    const otherPlayerIndex = 1 - playerIndex;
    const otherPlayer = players[otherPlayerIndex];

    // Leite die Nachricht nur weiter, wenn der andere Spieler existiert und verbunden ist.
    if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) {
      console.log(`Leite Nachricht von Spieler ${playerIndex + 1} an Spieler ${otherPlayerIndex + 1} weiter.`);
      otherPlayer.send(JSON.stringify(data));
    } else {
      console.log('Anderer Spieler nicht verbunden, Nachricht wird verworfen.');
    }
  });

  ws.on('close', () => {
    console.log(`Spieler ${playerIndex + 1} hat die Verbindung getrennt.`);
    // Entferne den Spieler aus dem Array
    players = players.filter(p => p !== ws);
  });
  
});

console.log(`Intelligenter WebSocket-Server gestartet und lauscht auf Port ${port}`);