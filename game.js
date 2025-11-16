export default class Game {
    constructor(players, options = {}) {

        // Prepare player array
        this.players = Array.isArray(players) ? players.filter(p => p) : [];

        // Options
        this.options = Object.assign({ startingScore: 501 }, options || {});

        this.isStarted = true;
        this.winner = null;

        // Determine starting player
        this.currentPlayerIndex = 0;

        if (this.options.startingPlayerId) {
            const idx = this.players.indexOf(this.options.startingPlayerId);
            if (idx !== -1) this.currentPlayerIndex = idx;
        }

        // Score + history
        this.scores = {};
        this.throwHistory = {};      // Array of points PER THROW
        this.turnHistory = {};       // Array of TURNS (groups of 3)

        this.throwCountThisTurn = 0; // 0..2

        this.players.forEach(id => {
            this.scores[id] = parseInt(this.options.startingScore) || 501;
            this.throwHistory[id] = [];
            this.turnHistory[id] = [];
        });
    }

    // Game state for client
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

    // Main action handler
    handleAction(clientId, action) {

        if (this.winner) return false;

        if (!action || !action.type) return false;

        // Undo request
        if (action.type === "undo" || action.type === "undo_throw") {
            return this.handleUndo(clientId);
        }

        // Must be this player's turn
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }

        let points = null;

        // Allow: .points
        if (action.payload && typeof action.payload.points === "number") {
            points = action.payload.points;
        }

        // Allow: .value + .mult
        if (
            action.payload &&
            typeof action.payload.value === "number" &&
            typeof action.payload.mult === "number"
        ) {
            points = action.payload.value * action.payload.mult;
        }

        // Allow: payload = number
        if (typeof action.payload === "number") {
            points = action.payload;
        }

        if (points === null || isNaN(points)) return false;

        return this.handleThrow(clientId, points);
    }

    // Handle single dart thrown
    handleThrow(clientId, points) {

        if (typeof points !== "number" || points < 0 || points > 180) return false;

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        // Log the throw
        this.throwHistory[clientId].push(points);

        // ----- BUST -----
        if (newScore < 0 || newScore === 1) {

            // Bust: record bust in last turn group
            this.turnHistory[clientId].push({
                dart: this.throwCountThisTurn,
                result: "BUST",
                points: points
            });

            // BUST ends the turn completely
            this.throwCountThisTurn = 0;
            this.nextPlayer();
            return true;
        }

        // ----- VALID -----
        this.scores[clientId] = newScore;

        this.turnHistory[clientId].push({
            dart: this.throwCountThisTurn,
            result: "OK",
            points: points
        });

        // WIN?
        if (newScore === 0) {
            this.winner = clientId;
            return true;
        }

        // 3 darts thrown => change player
        this.throwCountThisTurn++;

        if (this.throwCountThisTurn >= 3) {
            this.throwCountThisTurn = 0;
            this.nextPlayer();
        }

        return true;
    }

    // Undo last dart
    handleUndo(clientId) {

        // Undo always applies to the last player who threw
        const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
        const lastPlayerId = this.players[lastPlayerIndex];

        if (clientId !== lastPlayerId) return false;

        if (this.throwHistory[lastPlayerId].length === 0) return false;

        const lastThrow = this.throwHistory[lastPlayerId].pop();

        // Adjust score
        this.scores[lastPlayerId] += lastThrow;

        // Remove last turn info
        if (this.turnHistory[lastPlayerId].length > 0) {
            this.turnHistory[lastPlayerId].pop();
        }

        // Restore turn to that player
        this.currentPlayerIndex = lastPlayerIndex;

        // Reset turn counter (safe fallback)
        this.throwCountThisTurn =
            Math.min( Math.max( this.throwHistory[lastPlayerId].length % 3, 0 ), 2 );

        this.winner = null;

        return true;
    }

    // Switch to next player
    nextPlayer() {
        if (this.players.length === 0) return;

        this.currentPlayerIndex =
            (this.currentPlayerIndex + 1) % this.players.length;

        this.throwCountThisTurn = 0;
    }
}
