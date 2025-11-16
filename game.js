export default class Game {
    /**
     * @param {Array<string>} players - array of clientIds (filtered to truthy before passing)
     * @param {object} options - may contain startingScore, startingPlayerId, startingMode, ...
     */
    constructor(players, options = {}) {
        this.players = Array.isArray(players) ? players.slice() : [];
        this.options = Object.assign({ startingScore: 501 }, options || {});
        this.isStarted = true;
        this.winner = null;

        // Set currentPlayerIndex based on provided startingPlayerId if present and valid
        this.currentPlayerIndex = 0;
        if (this.options.startingPlayerId) {
            const idx = this.players.indexOf(this.options.startingPlayerId);
            if (idx !== -1) {
                this.currentPlayerIndex = idx;
            } else {
                // If provided ID not found, keep default 0
                this.currentPlayerIndex = 0;
            }
        } else if (this.options.startingMode === "bull" && typeof this.options.bullStarterIndex === "number") {
            // optional: allow explicit index for bull-mode if passed
            if (this.options.bullStarterIndex >= 0 && this.options.bullStarterIndex < this.players.length) {
                this.currentPlayerIndex = this.options.bullStarterIndex;
            }
        } else {
            // default: index 0
            this.currentPlayerIndex = 0;
        }

        this.scores = {};
        this.throwHistory = {}; // Persistent history for the game

        // initialize scores and throwHistory only for present players
        this.players.forEach(pId => {
            if (pId) {
                this.scores[pId] = parseInt(this.options.startingScore) || 501;
                this.throwHistory[pId] = [];
            }
        });
    }

    getState() {
        return {
            isStarted: this.isStarted,
            winner: this.winner,
            scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex],
            players: this.players,
            options: this.options,
            throwHistory: this.throwHistory,
        };
    }

    handleAction(clientId, action) {
        if (this.winner) {
            return false;
        }

        // The 'undo' action is special, as it can be triggered by the player who just threw,
        // even if it's not their turn anymore.
        if (action.type === "undo_throw" || action.type === "undo") {
            return this.handleUndo(clientId);
        }

        // For all other actions, it must be the current player's turn.
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }
        
        if (action.type === "player_throw" || action.type === "throw") {
            // Expect payload.points (total for the throw)
            const points = (action.payload && action.payload.points) || typeof action.payload === 'number' && action.payload || null;
            if (points === null) return false;
            return this.handleThrow(clientId, points);
        }

        return false;
    }

    handleThrow(clientId, points) {
        if (typeof points !== 'number' || points < 0 || points > 180) {
            return false;
        }

        const currentScore = this.scores[clientId];
        const newScore = currentScore - points;

        if (newScore < 0 || newScore === 1) { // Bust logic
            this.throwHistory[clientId].push(0); // Record a bust as a score of 0
            this.nextPlayer();
            return true;
        }

        this.scores[clientId] = newScore;
        this.throwHistory[clientId].push(points);

        if (newScore === 0) { // Checkout logic
            this.winner = clientId;
            // Don't switch player on a winning throw
            return true;
        }

        // Switch to the next player after every valid throw
        this.nextPlayer();
        return true;
    }

    handleUndo(clientId) {
        // Determine who threw last. It's the player BEFORE the current one in the turn order.
        const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
        const lastPlayerId = this.players[lastPlayerIndex];

        // Only the player who threw last can undo their throw.
        if (clientId !== lastPlayerId) {
            return false;
        }

        // Check if there is a throw to undo for that player.
        if (!this.throwHistory[lastPlayerId] || this.throwHistory[lastPlayerId].length === 0) {
            return false;
        }

        // Remove the last throw and add the points back to the score.
        const lastThrow = this.throwHistory[lastPlayerId].pop();
        // lastThrow could be 0 (bust) — adding 0 is fine
        this.scores[lastPlayerId] += lastThrow || 0;

        // It is now that player's turn again.
        this.currentPlayerIndex = lastPlayerIndex;
        this.winner = null; // Clear winner status in case the winning throw is undone.
        
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}
