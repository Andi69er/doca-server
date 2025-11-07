// server.js - FIXED VERSION 30 (Legauswahl, Bull-Off, Start-Trigger, Checkdart-Fix)

const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

let gameRoom = {
  players: [],
  gameState: null,
  gameSettings: null,
  lastState: null,
  bullOffState: null
};

function createInitialGameState(settings) {
  const startScore = parseInt(settings['spiel-typ']) || 501;
  const starter = settings.starter;
  const initialPlayerState = (name) => ({
    name,
    score: startScore,
    legDarts: 0,
    lastThrow: null,
    legsWon: 0,
    highestFinish: 0,
    stats: {
      matchDarts: 0,
      matchScore: 0,
      matchAvg: "0.00",
      first9Darts: 0,
      first9Score: 0,
      first9Avg: "0.00",
      checkoutAttempts: 0,
      checkoutHits: 0,
      s0_19: 0, s20_39: 0, s40_59: 0, s60_79: 0, s80_99: 0,
      s100: 0, s140: 0, s171: 0, s180: 0
    }
  });

  return {
    p1: initialPlayerState(settings['name-spieler1']),
    p2: initialPlayerState(settings['name-spieler2']),
    currentPlayer: starter,
    legStarter: starter,
    inProgress: true,
    legJustFinished: false,
    settings: {
      startScore,
      targetValue: parseInt(settings.anzahl) || 3,
      matchMode: settings['match-modus'],
      checkout: settings['check-out']
    },
    lastThrower: null
  };
}

function updateStats(player, score) {
  player.stats.matchDarts += 3;
  player.stats.matchScore += score;
  player.stats.matchAvg = ((player.stats.matchScore) / player.stats.matchDarts * 3).toFixed(2);

  if (player.legDarts < 9) {
    player.stats.first9Darts += 3;
    player.stats.first9Score += score;
    player.stats.first9Avg = ((player.stats.first9Score) / player.stats.first9Darts * 3).toFixed(2);
  }

  if (score >= 180) player.stats.s180++;
  else if (score >= 171) player.stats.s171++;
  else if (score >= 140) player.stats.s140++;
  else if (score >= 100) player.stats.s100++;
  else if (score >= 80) player.stats.s80_99++;
  else if (score >= 60) player.stats.s60_79++;
  else if (score >= 40) player.stats.s40_59++;
  else if (score >= 20) player.stats.s20_39++;
  else player.stats.s0_19++;
}

function processScore(gameState, score) {
  const playerKey = gameState.currentPlayer;
  const player = gameState[playerKey];
  const newScore = player.score - score;

  let isBust = false;
  if (newScore < 0) isBust = true;
  else if (newScore === 1 && gameState.settings.checkout === 'Double Out') isBust = true;

  const isCheckoutAttempt = (gameState.settings.checkout === 'Double Out' &&
    player.score <= 170 &&
    ![169, 168, 166, 165, 163, 162, 159].includes(player.score));

  if (isCheckoutAttempt) player.stats.checkoutAttempts++;

  updateStats(player, isBust ? 0 : score);
  player.legDarts += 3;

  if (isBust) {
    player.lastThrow = `BUST (${score})`;
  } else {
    player.score = newScore;
    player.lastThrow = score;
  }

  if (newScore === 0 && !isBust) {
    player.legsWon++;
    if (isCheckoutAttempt) player.stats.checkoutHits++;
    player.highestFinish = Math.max(player.highestFinish, score);
    gameState.legJustFinished = true;

    let target = gameState.settings.targetValue;
    if (gameState.settings.matchMode === 'best-of') target = Math.ceil(target / 2);

    if (player.legsWon >= target) {
      gameState.inProgress = false;
    } else {
      // Neues Leg starten
      gameState.p1.score = gameState.settings.startScore;
      gameState.p2.score = gameState.settings.startScore;
      gameState.p1.legDarts = 0;
      gameState.p2.legDarts = 0;
      gameState.legStarter = gameState.legStarter === 'p1' ? 'p2' : 'p1';
      gameState.currentPlayer = gameState.legStarter;
    }
  } else {
    gameState.currentPlayer = playerKey === 'p1' ? 'p2' : 'p1';
    gameState.lastThrower = playerKey;
    gameState.legJustFinished = false;
  }
  return gameState;
}

function determineBullOffWinner() {
  const b = gameRoom.bullOffState;
  if (!b?.p1_throws || !b?.p2_throws) return;

  let winner = null;
  for (let i = 0; i < 3; i++) {
    if (b.p1_throws[i] > b.p2_throws[i]) { winner = 'p1'; break; }
    if (b.p2_throws[i] > b.p1_throws[i]) { winner = 'p2'; break; }
  }

  if (winner) {
    gameRoom.gameSettings.starter = winner;
    startGameFromBullOff();
  } else {
    broadcast({ type: 'bull_off_tie', message: 'Gleichstand – erneut werfen!' });
    gameRoom.bullOffState = { p1_throws: null, p2_throws: null };
  }
}

function startGameFromBullOff() {
  const winner = gameRoom.gameSettings.starter;
  const winnerName = winner === 'p1' ? gameRoom.gameSettings['name-spieler1'] : gameRoom.gameSettings['name-spieler2'];
  broadcast({ type: 'bull_off_update', message: `${winnerName} hat das Ausbullen gewonnen!` });

  setTimeout(() => {
    gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
    gameRoom.lastState = null;
    gameRoom.bullOffState = null;
    broadcast({ type: 'start_game', gameState: gameRoom.gameState });
  }, 2000);
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const p of gameRoom.players) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

wss.on('connection', ws => {
  if (gameRoom.players.length >= 2) { ws.close(); return; }
  const playerIndex = gameRoom.players.length;
  const playerKey = `p${playerIndex + 1}`;
  gameRoom.players.push({ ws, key: playerKey });
  ws.send(JSON.stringify({ type: 'welcome', playerIndex }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    const sourceKey = `p${playerIndex + 1}`;

    if (['offer', 'answer', 'candidate'].includes(data.type)) {
      const other = gameRoom.players.find(p => p.ws !== ws);
      if (other) other.ws.send(JSON.stringify(data));
      return;
    }

    if (playerIndex === 0) {
      if (data.type === 'settings_update') {
        gameRoom.gameSettings = data.settings;
        broadcast(data);
      }
      if (data.type === 'start_game' && data.settings) {
        gameRoom.gameSettings = data.settings;
        if (gameRoom.gameSettings.starter === 'bull') {
          gameRoom.bullOffState = { p1_throws: null, p2_throws: null };
          broadcast({ type: 'bull_off_start' });
        } else {
          gameRoom.gameState = createInitialGameState(gameRoom.gameSettings);
          broadcast({ type: 'start_game', gameState: gameRoom.gameState });
        }
      }
    }

    if (data.type === 'submit_bull_throw' && gameRoom.bullOffState) {
      gameRoom.bullOffState[`${sourceKey}_throws`] = data.throws;
      if (gameRoom.bullOffState.p1_throws && gameRoom.bullOffState.p2_throws) {
        broadcast({ type: 'bull_off_update', message: 'Ergebnis wird ermittelt...' });
        determineBullOffWinner();
      } else {
        broadcast({ type: 'bull_off_update', message: 'Warte auf Gegner...' });
      }
    }

    if (data.type === 'submit_score' && gameRoom.gameState?.currentPlayer === sourceKey) {
      gameRoom.lastState = JSON.parse(JSON.stringify(gameRoom.gameState));
      gameRoom.gameState = processScore(gameRoom.gameState, data.score);
      broadcast({ type: 'game_update', gameState: gameRoom.gameState });
    }

    if (data.type === 'undo_throw' && gameRoom.lastState && gameRoom.gameState.lastThrower === sourceKey) {
      gameRoom.gameState = gameRoom.lastState;
      gameRoom.lastState = null;
      broadcast({ type: 'game_update', gameState: gameRoom.gameState });
    }

    if (data.type === 'new_game') {
      gameRoom = { players: gameRoom.players, gameState: null, gameSettings: null, lastState: null, bullOffState: null };
      broadcast({ type: 'new_game' });
    }
  });

  ws.on('close', () => {
    gameRoom.players = gameRoom.players.filter(p => p.ws !== ws);
    if (gameRoom.players.length < 2) {
      gameRoom.gameState = null;
      gameRoom.gameSettings = null;
      gameRoom.bullOffState = null;
      if (gameRoom.players.length > 0) broadcast({ type: 'new_game' });
    }
  });
});

console.log(`✅ Server läuft auf Port ${port} (Version 30 – Legauswahl, Bull-Off & Checkdart-Fix)`);
