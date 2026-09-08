// Peer-to-peer multiplayer using PeerJS (public signaling broker only,
// no custom backend server or database involved). The host acts as the
// star-topology hub: every guest connects directly to the host, and the
// host relays/broadcasts game state to all guests.
(function (global) {
  "use strict";

  class Multiplayer {
    constructor() {
      this.peer = null;
      this.isHost = false;
      this.connections = new Map(); // peerId -> DataConnection (host only)
      this.hostConnection = null; // DataConnection (guest only)
      this.messageHandlers = [];
      this.playerId = null;
    }

    onMessage(handler) {
      this.messageHandlers.push(handler);
    }

    _dispatch(message, fromPeerId) {
      for (const handler of this.messageHandlers) {
        handler(message, fromPeerId);
      }
    }

    /**
     * Starts hosting a room with the given room code as the PeerJS id.
     * Resolves once the peer is open and ready to accept connections.
     */
    hostGame(roomCode) {
      this.isHost = true;
      this.playerId = roomCode;
      return new Promise((resolve, reject) => {
        this.peer = new Peer(roomCode);
        this.peer.on("open", (id) => resolve(id));
        this.peer.on("error", (err) => reject(err));
        this.peer.on("connection", (conn) => {
          conn.on("open", () => {
            this.connections.set(conn.peer, conn);
            this._dispatch({ type: "peer-connected", peerId: conn.peer }, conn.peer);
          });
          conn.on("data", (data) => this._dispatch(data, conn.peer));
          conn.on("close", () => {
            this.connections.delete(conn.peer);
            this._dispatch({ type: "peer-disconnected", peerId: conn.peer }, conn.peer);
          });
        });
      });
    }

    /**
     * Joins a room hosted at roomCode. Resolves once connected to the host.
     */
    joinGame(roomCode) {
      this.isHost = false;
      return new Promise((resolve, reject) => {
        this.peer = new Peer();
        this.peer.on("error", (err) => reject(err));
        this.peer.on("open", (id) => {
          this.playerId = id;
          const conn = this.peer.connect(roomCode, { reliable: true });
          this.hostConnection = conn;
          conn.on("open", () => resolve(id));
          conn.on("data", (data) => this._dispatch(data, roomCode));
          conn.on("error", (err) => reject(err));
          conn.on("close", () => {
            this._dispatch({ type: "host-disconnected" }, roomCode);
          });
        });
      });
    }

    /** Host only: sends a message to every connected guest. */
    broadcast(message) {
      if (!this.isHost) return;
      for (const conn of this.connections.values()) {
        conn.send(message);
      }
    }

    /** Host only: sends a message to a single guest. */
    sendTo(peerId, message) {
      const conn = this.connections.get(peerId);
      if (conn) conn.send(message);
    }

    /** Guest only: sends a message to the host. */
    sendToHost(message) {
      if (this.hostConnection) this.hostConnection.send(message);
    }

    listPlayerIds() {
      return Array.from(this.connections.keys());
    }

    destroy() {
      if (this.peer) {
        this.peer.destroy();
      }
      this.connections.clear();
      this.hostConnection = null;
    }
  }

  global.Multiplayer = Multiplayer;
})(typeof window !== "undefined" ? window : globalThis);
