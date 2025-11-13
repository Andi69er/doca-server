// game.js (REBUILT FROM STABLE BASE)
export default class Game {
    constructor(players, options) {
        this.players = players; // Array of clientIds
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        
        this.scores = {};
        this.throwHistory = {}; // Persistent history for the game

        players.forEach(pId => {
            if (pId) {
                this.scores[pId] = parseInt(this.options.startingScore);
                this.throwHistory[pId] = []; // Initialize history for each player
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
        if (action.type === "undo_throw") {
            return this.handleUndo(clientId);
        }

        // For all other actions, it must be the current player's turn.
        if (clientId !== this.players[this.currentPlayerIndex]) {
            return false;
        }
        
        if (action.type === "player_throw") {
            return this.handleThrow(clientId, action.payload.points);
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
        this.scores[lastPlayerId] += lastThrow;

        // It is now that player's turn again.
        this.currentPlayerIndex = lastPlayerIndex;
        this.winner = null; // Clear winner status in case the winning throw is undone.
        
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}