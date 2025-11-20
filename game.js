// game.js (VOLLSTÄNDIG - mit korrigiertem Konstruktor)
export default class Game {
    constructor(players, options, startingPlayerId) { // startingPlayerId wird vom roomManager übergeben
        this.players = players.filter(p => p); // Nur aktive Spieler berücksichtigen
        this.options = { startingScore: 501, ...options };
        this.isStarted = true;
        this.winner = null;
        
        const startIndex = this.players.indexOf(startingPlayerId);
        this.currentPlayerIndex = (startIndex !== -1) ? startIndex : 0;
        
        this.scores = {};
        this.throwHistory = {};

        this.players.forEach(pId => {
            this.scores[pId] = parseInt(this.options.startingScore);
            this.throwHistory[pId] = [];
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
        if (this.winner) return false;
        if (action.type === "undo_throw") return this.handleUndo(clientId);
        if (clientId !== this.players[this.currentPlayerIndex]) return false;
        if (action.type === "player_throw") return this.handleThrow(clientId, action.payload.points);
        return false;
    }

    handleThrow(clientId, points) {
        if (typeof points !== 'number' || points < 0 || points > 180) return false;
        const newScore = this.scores[clientId] - points;
        if (newScore < 0 || newScore === 1) { // Bust
            this.throwHistory[clientId].push('BUST');
            this.nextPlayer();
            return true;
        }
        this.scores[clientId] = newScore;
        this.throwHistory[clientId].push(points);
        if (newScore === 0) { this.winner = clientId; return true; }
        this.nextPlayer();
        return true;
    }

    handleUndo(clientId) {
        const lastPlayerIndex = (this.currentPlayerIndex + this.players.length - 1) % this.players.length;
        const lastPlayerId = this.players[lastPlayerIndex];
        if (clientId !== lastPlayerId || !this.throwHistory[lastPlayerId]?.length) return false;
        const lastThrow = this.throwHistory[lastPlayerId].pop();
        if(lastThrow !== 'BUST') this.scores[lastPlayerId] += lastThrow;
        this.currentPlayerIndex = lastPlayerIndex;
        this.winner = null;
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
}