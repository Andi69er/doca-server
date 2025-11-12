// game.js (REVISED & CORRECTED)
export default class Game {
    constructor(players, options) {
        this.players = players; // Array mit usernames
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        this.turnThrows = [];
        this.scores = {};
        // Initialisiere Scores für jeden username
        players.forEach(username => { this.scores[username] = parseInt(this.options.startingScore); });
    }

    getState() {
        return {
            isStarted: this.isStarted, winner: this.winner, scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex], // Bleibt 'currentPlayerId', enthält aber username
            turnThrows: this.turnThrows,
        };
    }

    // handleAction erwartet jetzt den username
    handleAction(username, action) {
        if (this.winner || username !== this.players[this.currentPlayerIndex]) return false;
        switch (action.type) {
            case "player_throw": return this.handleThrow(action.payload.points);
            case "undo_throw": return this.handleUndo();
            default: return false;
        }
    }

    handleThrow(points) {
        if (typeof points !== 'number' || points < 0 || points > 180) return false;
        const username = this.players[this.currentPlayerIndex];
        const newScore = this.scores[username] - points;
        if (newScore < 0 || newScore === 1) { this.nextPlayer(); return true; }
        this.scores[username] = newScore;
        this.turnThrows.push(points);
        if (newScore === 0) { this.winner = username; return true; }
        if (this.turnThrows.length >= 3) this.nextPlayer();
        return true;
    }
    
    handleUndo() {
        if (this.turnThrows.length === 0) return false;
        const username = this.players[this.currentPlayerIndex];
        this.scores[username] += this.turnThrows.pop();
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
    }
}