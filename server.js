// server.js - minimal, verbose, tested
const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

console.log(`[SERVER] Starting WebSocket server on port ${port}`);

let room = {
  players: [],            // { ws, id: 'p1'|'p2' }
  settings: null,
  state: null,
  lastState: null,
  bull: null              // { p1: throws|null, p2: throws|null }
};

function createInitialState(settings) {
  const startScore = parseInt(settings['spiel-typ']) || 501;
  const starter = settings.starter || 'p1';
  const initialPlayer = (name) => ({
    name: name || 'Spieler',
    score: startScore,
    legDarts: 0,
    lastThrow: null,
    legsWon: 0,
    stats: { matchDarts:0, matchScore:0, matchAvg:"0.00", first9Darts:0, first9Score:0, first9Avg:"0.00", checkoutAttempts:0, checkoutHits:0 }
  });
  return {
    p1: initialPlayer(settings['name-spieler1']),
    p2: initialPlayer(settings['name-spieler2']),
    currentPlayer: starter,
    legStarter: starter,
    inProgress: true,
    legJustFinished: false,
    awaitingCheckdart: false,
    settings: { startScore, targetValue: parseInt(settings.anzahl)||3, matchMode: settings['match-modus'] || 'best-of', checkout: settings['check-out'] || 'Double Out' },
    lastThrower: null
  };
}

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  room.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  });
}

function logRoom() {
  console.log("[ROOM] players:", room.players.map(p => p.id));
  console.log("[ROOM] settings:", room.settings ? JSON.stringify(room.settings) : null);
  console.log("[ROOM] state:", room.state ? { currentPlayer: room.state.currentPlayer, inProgress: room.state.inProgress } : null);
  console.log("[ROOM] bull:", room.bull);
}

function processScore(score) {
  if (!room.state) return;
  const key = room.state.currentPlayer;
  const player = room.state[key];
  const newScore = player.score - score;
  let bust = false;
  if (newScore < 0) bust = true;
  if (newScore === 1 && room.state.settings.checkout === 'Double Out') bust = true;

  // save last state for undo
  room.lastState = JSON.parse(JSON.stringify(room.state));

  // update stats (very simple)
  player.lastThrow = bust ? `BUST (${score})` : score;
  if (!bust) player.score = newScore;
  player.legDarts += 3;

  // finish
  if (newScore === 0 && !bust) {
    player.legsWon++;
    room.state.legJustFinished = true;
    // check match finished
    let target = room.state.settings.targetValue;
    if (room.state.settings.matchMode === 'best-of') target = Math.ceil(target/2);
    if (player.legsWon >= target) {
      room.state.inProgress = false;
      room.state.awaitingCheckdart = true; // request checkdart before final stats
    } else {
      // prepare next leg
      room.state.p1.score = room.state.settings.startScore;
      room.state.p2.score = room.state.settings.startScore;
      room.state.p1.legDarts = 0;
      room.state.p2.legDarts = 0;
      room.state.legStarter = room.state.legStarter === 'p1' ? 'p2' : 'p1';
      room.state.currentPlayer = room.state.legStarter;
    }
  } else {
    // switch turn
    room.state.currentPlayer = key === 'p1' ? 'p2' : 'p1';
    room.state.lastThrower = key;
  }
}

wss.on('connection', (ws) => {
  if (room.players.length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
    ws.close();
    return;
  }
  const id = room.players.length === 0 ? 'p1' : 'p2';
  room.players.push({ ws, id });
  console.log(`[SERVER] New connection: ${id}`);
  logRoom();

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { console.warn('[SERVER] invalid json', msg); return; }
    console.log(`[SERVER] recv from ${id}:`, data);

    // WebRTC passthrough (if any)
    if (['offer','answer','candidate'].includes(data.type)) {
      const other = room.players.find(p => p.ws !== ws);
      if (other && other.ws.readyState === WebSocket.OPEN) other.ws.send(JSON.stringify(data));
      return;
    }

    // Host (p1) controls settings / start
    if (id === 'p1') {
      if (data.type === 'settings_update') {
        room.settings = data.settings;
        console.log('[SERVER] settings updated by host:', room.settings);
        broadcast({ type: 'settings_update', settings: room.settings });
      }
      if (data.type === 'start_game' && data.settings) {
        room.settings = data.settings;
        console.log('[SERVER] start requested, settings:', room.settings);
        if (room.settings.starter === 'bull') {
          room.bull = { p1: null, p2: null };
          broadcast({ type: 'bull_off_start' });
        } else {
          room.state = createInitialState(room.settings);
          broadcast({ type: 'start_game', gameState: room.state });
        }
      }
    }

    // bull submissions
    if (data.type === 'submit_bull_throw' && room.bull) {
      room.bull[id] = data.throws;
      console.log(`[SERVER] bull ${id} throws:`, data.throws);
      const otherId = id === 'p1' ? 'p2' : 'p1';
      if (room.bull[otherId]) {
        // decide winner: check sequential greater dart; fallback to total
        let winner = null;
        for (let i=0;i<3;i++) {
          if (room.bull.p1[i] > room.bull.p2[i]) { winner = 'p1'; break; }
          if (room.bull.p2[i] > room.bull.p1[i]) { winner = 'p2'; break; }
        }
        if (!winner) {
          const s1 = room.bull.p1.reduce((a,b)=>a+b,0);
          const s2 = room.bull.p2.reduce((a,b)=>a+b,0);
          if (s1 > s2) winner = 'p1';
          else if (s2 > s1) winner = 'p2';
        }
        if (winner) {
          room.settings.starter = winner;
          room.bull = null;
          room.state = createInitialState(room.settings);
          broadcast({ type: 'bull_off_result', winner, message: `${winner} gewinnt Bull` });
          setTimeout(()=> broadcast({ type: 'start_game', gameState: room.state }), 800);
        } else {
          room.bull = { p1: null, p2: null };
          broadcast({ type: 'bull_off_tie', message: 'Gleichstand! Nochmal werfen.' });
        }
      } else {
        broadcast({ type: 'bull_off_update', message: `${id} hat geworfen. Warte.` });
      }
    }

    // score submit
    if (data.type === 'submit_score' && room.state && room.state.currentPlayer === id) {
      console.log('[SERVER] submit_score', id, data.score);
      processScore(data.score);
      broadcast({ type: 'game_update', gameState: room.state });
    }

    // undo
    if (data.type === 'undo_throw') {
      if (room.lastState && room.state && room.state.lastThrower === id) {
        room.state = room.lastState;
        room.lastState = null;
        broadcast({ type: 'game_update', gameState: room.state });
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Undo not allowed' }));
      }
    }

    // checkdart report from client
    if (data.type === 'checkdart' && room.state) {
      room.state.lastCheckDarts = data.darts;
      room.state.awaitingCheckdart = false;
      broadcast({ type: 'game_update', gameState: room.state });
    }

    // new game
    if (data.type === 'new_game') {
      room.settings = null;
      room.state = null;
      room.lastState = null;
      room.bull = null;
      broadcast({ type: 'new_game' });
    }
  });

  ws.on('close', () => {
    console.log(`[SERVER] ${id} disconnected`);
    room.players = room.players.filter(p => p.ws !== ws);
    // reset room on disconnect
    room.settings = null; room.state = null; room.lastState = null; room.bull = null;
    if (room.players.length) broadcast({ type: 'new_game' });
    logRoom();
  });
});
