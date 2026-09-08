// Core game state machine. Decoupled from the DOM: main.js wires UI events
// into this class and reacts to the callbacks it exposes.
(function (global) {
  "use strict";

  const DEFAULT_RADIUS_SEARCH_M = 50000;

  class Game {
    constructor(multiplayer, { isHost, playerName, roomCode }) {
      this.mp = multiplayer;
      this.isHost = isHost;
      this.roomCode = roomCode;
      this.selfId = null; // filled once peer connection opens
      this.playerName = playerName;
      this.players = new Map(); // id -> {name, score}
      this.polygon = null; // host only
      this.roundCount = 5;
      this.roundTimeSeconds = 90;
      this.areaDiagonalKm = 1000;
      this.roundIndex = -1;
      this.roundLocations = []; // host only, filled at start
      this.currentGuesses = new Map(); // host only, per-round: id -> {lat,lng}
      this.roundTimer = null;

      this.handlers = {
        onPlayersChanged: () => {},
        onRoundStart: () => {},
        onRoundResult: () => {},
        onGameEnd: () => {},
      };

      this.mp.onMessage((msg, fromId) => this._handleMessage(msg, fromId));
    }

    on(event, fn) {
      this.handlers[event] = fn;
    }

    setSelf(id) {
      this.selfId = id;
      this.players.set(id, { name: this.playerName, score: 0 });
    }

    // ---- Host setup ----

    setArea(polygon) {
      this.polygon = polygon;
      this.areaDiagonalKm = Geometry.polygonDiagonalKm(polygon);
    }

    setRoundOptions(roundCount, roundTimeSeconds) {
      this.roundCount = roundCount;
      this.roundTimeSeconds = roundTimeSeconds;
    }

    startGame() {
      if (!this.isHost) return;
      this.roundLocations = [];
      for (let i = 0; i < this.roundCount; i++) {
        this.roundLocations.push(Geometry.randomPointInPolygon(this.polygon));
      }
      this.mp.broadcast({
        type: "game-config",
        roundCount: this.roundCount,
        roundTimeSeconds: this.roundTimeSeconds,
      });
      this._resetScores();
      this._startRound(0);
    }

    _resetScores() {
      for (const p of this.players.values()) p.score = 0;
    }

    _startRound(index) {
      this.roundIndex = index;
      this.currentGuesses = new Map();
      const location = this.roundLocations[index];
      const payload = {
        type: "round-start",
        roundIndex: index,
        lat: location.lat,
        lng: location.lng,
        roundTimeSeconds: this.roundTimeSeconds,
      };
      this.mp.broadcast(payload);
      this._handleRoundStart(payload);

      clearTimeout(this.roundTimer);
      this.roundTimer = setTimeout(() => {
        this._finalizeRound();
      }, this.roundTimeSeconds * 1000);
    }

    /** Guest or host: submit own guess for the current round. */
    submitGuess(location) {
      const message = {
        type: "guess",
        roundIndex: this.roundIndex,
        lat: location.lat,
        lng: location.lng,
      };
      if (this.isHost) {
        this._registerGuess(this.selfId, location);
        this._maybeFinalizeEarly();
      } else {
        this.mp.sendToHost(message);
      }
    }

    _registerGuess(playerId, location) {
      this.currentGuesses.set(playerId, location);
    }

    _maybeFinalizeEarly() {
      const connectedCount = this.players.size;
      if (this.currentGuesses.size >= connectedCount && connectedCount > 0) {
        clearTimeout(this.roundTimer);
        this._finalizeRound();
      }
    }

    _finalizeRound() {
      if (!this.isHost) return;
      const actual = this.roundLocations[this.roundIndex];
      const results = [];
      for (const [id, player] of this.players.entries()) {
        const guess = this.currentGuesses.get(id);
        let distanceKm = null;
        let score = 0;
        if (guess) {
          distanceKm = Geometry.haversineDistanceKm(actual, guess);
          score = Geometry.scoreForDistance(distanceKm, this.areaDiagonalKm);
        }
        player.score += score;
        results.push({
          id,
          name: player.name,
          location: guess || null,
          distanceKm,
          score,
          totalScore: player.score,
        });
      }

      const payload = {
        type: "round-result",
        roundIndex: this.roundIndex,
        actual,
        guesses: results,
      };
      this.mp.broadcast(payload);
      this._handleRoundResult(payload);
    }

    /** Host only: called (e.g. by a "Continue" button) to advance the game. */
    nextRound() {
      if (!this.isHost) return;
      const next = this.roundIndex + 1;
      if (next >= this.roundCount) {
        const finalPlayers = Array.from(this.players.entries()).map(([id, p]) => ({
          id,
          name: p.name,
          score: p.score,
        }));
        const payload = { type: "game-end", players: finalPlayers };
        this.mp.broadcast(payload);
        this._handleGameEnd(payload);
      } else {
        this._startRound(next);
      }
    }

    // ---- Message handling (shared by host and guest for their own echo) ----

    _handleMessage(msg, fromId) {
      switch (msg.type) {
        case "peer-connected":
          // Wait for join-info before adding to the roster.
          break;
        case "peer-disconnected":
          this.players.delete(fromId);
          this.handlers.onPlayersChanged(this._playerList());
          break;
        case "join-info":
          this.players.set(fromId, { name: msg.name, score: 0 });
          this.handlers.onPlayersChanged(this._playerList());
          this.mp.sendTo(fromId, {
            type: "players-update",
            players: this._playerList(),
          });
          this.mp.broadcast({ type: "players-update", players: this._playerList() });
          break;
        case "players-update":
          this.players = new Map(msg.players.map((p) => [p.id, { name: p.name, score: p.score }]));
          this.handlers.onPlayersChanged(this._playerList());
          break;
        case "game-config":
          this.roundCount = msg.roundCount;
          this.roundTimeSeconds = msg.roundTimeSeconds;
          break;
        case "round-start":
          this._handleRoundStart(msg);
          break;
        case "guess":
          if (this.isHost) {
            this._registerGuess(fromId, { lat: msg.lat, lng: msg.lng });
            this._maybeFinalizeEarly();
          }
          break;
        case "round-result":
          this._handleRoundResult(msg);
          break;
        case "game-end":
          this._handleGameEnd(msg);
          break;
        case "host-disconnected":
          this.handlers.onHostDisconnected && this.handlers.onHostDisconnected();
          break;
        default:
          break;
      }
    }

    _handleRoundStart(msg) {
      this.roundIndex = msg.roundIndex;
      this.handlers.onRoundStart(msg);
    }

    _handleRoundResult(msg) {
      for (const g of msg.guesses) {
        const player = this.players.get(g.id);
        if (player) player.score = g.totalScore;
      }
      this.handlers.onRoundResult(msg);
    }

    _handleGameEnd(msg) {
      this.handlers.onGameEnd(msg);
    }

    _playerList() {
      return Array.from(this.players.entries()).map(([id, p]) => ({
        id,
        name: p.name,
        score: p.score,
      }));
    }

    /** Public accessor: current roster as [{id, name, score}]. */
    playerList() {
      return this._playerList();
    }

    announceJoin() {
      this.mp.sendToHost({ type: "join-info", name: this.playerName });
    }
  }

  global.Game = Game;
  global.DEFAULT_RADIUS_SEARCH_M = DEFAULT_RADIUS_SEARCH_M;
})(typeof window !== "undefined" ? window : globalThis);
