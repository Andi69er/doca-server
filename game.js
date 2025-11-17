// Dateiname: Game.js (KORRIGIERT)
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
        // this.throwCountThisTurn wird nicht mehr benötigt, da der Client die Summe sendet.

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
            // throwCountThisTurn ist nicht mehr relevant
        };
    }
    
    /**
     * Gibt eine Liste der Spieler-IDs zurück.
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

        if (action.type === "undo" || action.type === "undo_throw") {
            return this.handleUndo(clientId);
        }

        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }

        let points = null;
        if (action.payload && typeof action.payload.points === "number") {
            points = action.payload.points;
        } else if (typeof action.payload === "number") {
            points = action.payload;
        }

        if (points === null || isNaN(points)) return false;

        return this.handleThrow(clientId, points);
    }

    /**
     * ========================================================================
     * HIER IST DIE EINE, ENTSCHEIDENDE KORREKTUR
     * ========================================================================
     * Verarbeitet die Eingabe einer kompletten Runde (z.B. 120 Punkte).
     */
    handleThrow(clientId, points) {
        if (typeof points !== "number" || points < 0 || points > 180) return false;

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        this.throwHistory[clientId].push(points);

        // Szenario 1: BUST (überworfen)
        if (newScore < 0 || newScore === 1) {
            this.turnHistory[clientId].push({ result: "BUST", points: points });
            // Nach einem Bust ist der Zug sofort vorbei.
            this.nextPlayer();
            return true;
        }

        // Szenario 2: Gültiger Wurf
        this.scores[clientId] = newScore;
        this.turnHistory[clientId].push({ result: "OK", points: points });

        // Szenario 2a: GEWINN
        if (newScore === 0) {
            this.winner = clientId;
            return true; // Bei Gewinn nicht zum nächsten Spieler wechseln
        }

        // Szenario 2b: Der Zug ist nach einer gültigen Eingabe immer vorbei.
        // Wir entfernen die Logik mit `throwCountThisTurn`, da der Client die Summe sendet.
        this.nextPlayer();

        return true;
    }

    /**
     * Macht den letzten Wurf rückgängig.
     */
    handleUndo(clientId) {
        // Undo gilt für den Spieler, der ZULETZT geworfen hat.
        // Da der Spielerwechsel sofort stattfindet, ist der "letzte" Spieler
        // der vor dem aktuellen Spieler.
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
        this.winner = null;

        return true;
    }

    /**
     * Wechselt zum nächsten Spieler.
     */
    nextPlayer() {
        if (this.players.length === 0) return;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}