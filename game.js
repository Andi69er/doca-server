// Dateiname: Game.js (oder wie auch immer du sie nennst)
// Diese Datei enthält die reine Spiellogik. Sie ist der "Motor".

export default class Game {
    constructor(players, options = {}) {
        // Bereitet das Spieler-Array vor.
        this.players = Array.isArray(players) ? players.filter(p => p) : [];

        // Setzt die Spieloptionen.
        this.options = Object.assign({ startingScore: 501 }, options || {});

        this.isStarted = true;
        this.winner = null;

        // Bestimmt den Startspieler.
        this.currentPlayerIndex = 0;
        if (this.options.startingPlayerId) {
            const idx = this.players.indexOf(this.options.startingPlayerId);
            if (idx !== -1) this.currentPlayerIndex = idx;
        }

        // Initialisiert die Punktestände und die Wurf-Historie.
        this.scores = {};
        this.throwHistory = {};
        this.turnHistory = {};
        this.throwCountThisTurn = 0; // 0, 1 oder 2

        this.players.forEach(id => {
            this.scores[id] = parseInt(this.options.startingScore) || 501;
            this.throwHistory[id] = [];
            this.turnHistory[id] = [];
        });
    }

    /**
     * Gibt den vollständigen Zustand des Spiels zurück.
     * Dieses Objekt wird an die Clients gesendet.
     */
    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex],
            players: this.players,
            options: this.options,
            throwHistory: this.throwHistory,
            turnHistory: this.turnHistory,
            throwCountThisTurn: this.throwCountThisTurn
        };
    }
    
    /**
     * NEUE HILFSFUNKTION:
     * Gibt eine Liste der Spieler-IDs zurück. Dies erleichtert dem Server
     * das Senden von Nachrichten an alle Spieler im Spiel.
     */
    getPlayerIds() {
        return this.players;
    }


    /**
     * Verarbeitet eine Aktion von einem Spieler.
     * Dies ist die Hauptfunktion, die vom Server aufgerufen wird.
     */
    handleAction(clientId, action) {
        if (this.winner) return false;
        if (!action || !action.type) return false;

        // Verarbeitet einen "Undo"-Befehl.
        if (action.type === "undo" || action.type === "undo_throw") {
            return this.handleUndo(clientId);
        }

        // Prüft, ob der richtige Spieler am Zug ist.
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }

        // Extrahiert die geworfene Punktzahl aus der Aktion.
        let points = null;
        if (action.payload && typeof action.payload.points === "number") {
            points = action.payload.points;
        } else if (action.payload && typeof action.payload.value === "number" && typeof action.payload.mult === "number") {
            points = action.payload.value * action.payload.mult;
        } else if (typeof action.payload === "number") {
            points = action.payload;
        }

        if (points === null || isNaN(points)) return false;

        return this.handleThrow(clientId, points);
    }

    /**
     * Verarbeitet einen einzelnen Wurf.
     */
    handleThrow(clientId, points) {
        if (typeof points !== "number" || points < 0 || points > 180) return false;

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        this.throwHistory[clientId].push(points);

        // Szenario 1: BUST (überworfen)
        if (newScore < 0 || newScore === 1) {
            this.turnHistory[clientId].push({ dart: this.throwCountThisTurn, result: "BUST", points: points });
            // Nach einem Bust ist der Zug sofort vorbei.
            this.nextPlayer();
            return true;
        }

        // Szenario 2: Gültiger Wurf
        this.scores[clientId] = newScore;
        this.turnHistory[clientId].push({ dart: this.throwCountThisTurn, result: "OK", points: points });

        // Szenario 2a: GEWINN
        if (newScore === 0) {
            this.winner = clientId;
            return true;
        }

        // Szenario 2b: Zug geht weiter oder ist vorbei
        this.throwCountThisTurn++;
        if (this.throwCountThisTurn >= 3) {
            this.nextPlayer(); // Nach 3 Darts ist der nächste Spieler dran.
        }

        return true;
    }

    /**
     * Macht den letzten Wurf rückgängig.
     */
    handleUndo(clientId) {
        // WICHTIG: Undo gilt für den Spieler, der ZULETZT geworfen hat,
        // auch wenn der currentPlayer schon gewechselt hat.
        const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
        const lastPlayerId = this.players[lastPlayerIndex];

        // Nur der Spieler, der geworfen hat, kann Undo auslösen.
        if (clientId !== lastPlayerId) return false;
        if (this.throwHistory[lastPlayerId].length === 0) return false;

        const lastThrow = this.throwHistory[lastPlayerId].pop();
        this.scores[lastPlayerId] += lastThrow;

        if (this.turnHistory[lastPlayerId].length > 0) {
            this.turnHistory[lastPlayerId].pop();
        }

        // Setzt den Zug auf den rückgängig gemachten Spieler zurück.
        this.currentPlayerIndex = lastPlayerIndex;
        this.throwCountThisTurn = this.throwHistory[lastPlayerId].length % 3;
        this.winner = null;

        return true;
    }

    /**
     * Wechselt zum nächsten Spieler.
     */
    nextPlayer() {
        if (this.players.length === 0) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.throwCountThisTurn = 0; // Setzt den Dart-Zähler für den neuen Spieler zurück.
    }
}