// game.js (FINAL & CORRECTED PLAYER SWITCH)
export default class Game {
    constructor(players, options) {
        this.players = players; // Array with clientIds
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        this.currentPlayerIndex = 0;
        this.turnThrows = [];
        this.scores = {};
        players.forEach(pId => { this.scores[pId] = parseInt(this.options.startingScore); });
    }

    getState() {
        return {
            isStarted: this.isStarted, winner: this.winner, scores: this.scores,
            currentPlayerId: this.players[this.currentPlayerIndex],
            turnThrows: this.turnThrows,
            players: this.players, // Wichtig für die UI
            options: this.options,
        };
    }

    handleAction(clientId, action) {
        if (this.winner || clientId !== this.players[this.currentPlayerIndex]) return false;
        switch (action.type) {
            case "player_throw": return this.handleThrow(action.payload.points);
            case "undo_throw": return this.handleUndo();
            default: return false;
        }
    }

    handleThrow(points) {
        if (typeof points !== 'number' || points < 0 || points > 180) return false;
        const clientId = this.players[this.currentPlayerIndex];
        const newScore = this.scores[clientId] - points;

        if (newScore < 0 || newScore === 1) { // Bust logic
            this.nextPlayer(); // Turn endet bei Bust
            return true;
        }

        this.scores[clientId] = newScore;
        this.turnThrows.push(points);

        if (newScore === 0) { // Checkout logic (simple version)
            this.winner = clientId;
            return true; // Spiel ist vorbei, kein Spielerwechsel
        }

        // *** DIE ENTSCHEIDENDE KORREKTUR ***
        // Nach JEDEM gültigen Wurf (der kein Sieg oder Bust ist) wird der Spieler gewechselt.
        this.nextPlayer();
        return true;
    }
    
    handleUndo() {
        if (this.turnThrows.length === 0) return false;
        const clientId = this.players[this.currentPlayerIndex];
        const lastThrow = this.turnThrows.pop();
        this.scores[clientId] += lastThrow;
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnThrows = [];
    }
}