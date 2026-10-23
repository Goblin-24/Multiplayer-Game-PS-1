/**
 * ALLEY RATS: SKATE & SPRAY — Official Client Multiplayer Library SDK
 * 
 * Provides:
 * - window.Multiplayer.join({ roomId, serverUrl, playerInfo })
 * - EventEmitter pattern with on(), off(), emit()
 * - Shared State Store: set(path, value) and get(path)
 * - Realtime Cursor, Graffiti Stroke, Race Telemetry Dispatching
 * - Accidental Disconnect Handling: localStorage identity persistence & auto-reconnect
 * - Offline Progress Accumulation & Authoritative Server Reconciliation
 * - In-Game Top-Bar Pop-Up Announcements on Player Join & Reconnect
 */

(function(root) {
  'use strict';

  /**
   * Lightweight EventEmitter
   */
  class EventEmitter {
    constructor() {
      this._events = new Map();
    }

    on(event, listener) {
      if (!this._events.has(event)) {
        this._events.set(event, new Set());
      }
      this._events.get(event).add(listener);
      return () => this.off(event, listener);
    }

    off(event, listener) {
      if (this._events.has(event)) {
        this._events.get(event).delete(listener);
      }
    }

    emit(event, ...args) {
      if (this._events.has(event)) {
        for (const listener of this._events.get(event)) {
          try {
            listener(...args);
          } catch (err) {
            console.error(`[Multiplayer SDK] Error in event listener for "${event}":`, err);
          }
        }
      }
    }

    removeAllListeners() {
      this._events.clear();
    }
  }

  /**
   * Multiplayer Session Class
   */
  class MultiplayerSession extends EventEmitter {
    constructor(options = {}) {
      super();
      this.roomId = (options.roomId || 'RAT-0001').toUpperCase().trim();
      this.serverUrl = options.serverUrl || this._getDefaultServerUrl();
      this.playerInfo = options.playerInfo || { name: 'SKATER', customization: {} };

      // Session State
      this.ws = null;
      this.clientId = null;
      this.isHost = false;
      this.isConnected = false;
      this.isP2P = false;
      this.bc = null;
      this.peer = null;
      this.peerConnections = new Set();
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 15;
      this.reconnectTimer = null;
      this.heartbeatTimer = null;
      this.pendingReconcileResolvers = new Map();

      // Shared Room State Model
      this.state = {
        roomId: this.roomId,
        players: {},
        lobby: { graffiti: [] },
        race: { status: 'waiting' }
      };

      // Persistent Identity Storage Key
      this.storageKey = `alley_rats_session_${this.roomId}`;
      this._loadSavedSession();
    }

    _getDefaultServerUrl() {
      if (typeof window !== 'undefined' && window.location) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}`;
      }
      return 'ws://localhost:3000';
    }

    _loadSavedSession() {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(this.storageKey);
          if (raw) {
            const data = JSON.parse(raw);
            if (data && data.clientId) {
              this.savedClientId = data.clientId;
              this.savedScore = data.score || 0;
              this.savedDistance = data.distance || 0;
            }
          }
        }
      } catch (e) {}
    }

    _persistSession(score = 0, distance = 0) {
      try {
        if (typeof localStorage !== 'undefined' && this.clientId) {
          localStorage.setItem(this.storageKey, JSON.stringify({
            clientId: this.clientId,
            roomId: this.roomId,
            name: this.playerInfo.name,
            score,
            distance,
            savedAt: Date.now()
          }));
        }
      } catch (e) {}
    }

    /**
     * Connect to Realtime WebSocket Server (with automatic Real P2P WebRTC / BroadcastChannel fallback)
     */
    connect() {
      return new Promise((resolve) => {
        let isResolved = false;

        const fallbackToP2P = () => {
          if (!isResolved && !this.isConnected) {
            isResolved = true;
            if (this.ws) {
              try { this.ws.close(); } catch {}
              this.ws = null;
            }
            console.log('[Multiplayer SDK] WebSocket server not reachable. Engaging Real P2P Room Transport...');
            this._connectP2P().then(resolve);
          }
        };

        // If explicitly running offline / file protocol or no serverUrl
        if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || !this.serverUrl || this.serverUrl.startsWith('p2p'))) {
          return this._connectP2P().then(resolve);
        }

        // Normalize URL to ws:// or wss://
        let wsUrl = this.serverUrl.replace(/^http/, 'ws');
        if (!wsUrl.includes('/ws')) {
          wsUrl = wsUrl.replace(/\/+$/, '') + '/ws';
        }
        wsUrl += `?room=${encodeURIComponent(this.roomId)}`;

        console.log(`[Multiplayer SDK] Connecting to: ${wsUrl}`);

        try {
          this.ws = new WebSocket(wsUrl);
        } catch (err) {
          console.warn('[Multiplayer SDK] WebSocket creation failed:', err);
          return fallbackToP2P();
        }

        const timeout = setTimeout(() => {
          if (!this.isConnected && !isResolved) {
            fallbackToP2P();
          }
        }, 1800);

        this.ws.onopen = () => {
          console.log('[Multiplayer SDK] WebSocket connected. Sending handshake...');
          this.reconnectAttempts = 0;
          this.isReconnecting = false;

          // Send client_connect handshake with reconnect token if available
          this._sendRaw({
            type: 'client_connect',
            roomId: this.roomId,
            timestamp: Date.now(),
            payload: {
              name: this.playerInfo.name,
              customization: this.playerInfo.customization,
              reconnectId: this.savedClientId || null,
              lastScore: this.savedScore || 0,
              lastDistance: this.savedDistance || 0
            }
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            this._handlePacket(packet, () => {
              if (!isResolved) {
                isResolved = true;
                clearTimeout(timeout);
                resolve(this);
              }
            });
          } catch (err) {
            console.warn('[Multiplayer SDK] Error handling message:', err);
          }
        };

        this.ws.onclose = () => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          clearInterval(this.heartbeatTimer);

          if (wasConnected) {
            console.warn('[Multiplayer SDK] Disconnected from server. Initiating auto-reconnect...');
            this.emit('disconnected');
            this._scheduleReconnect();
          } else if (!isResolved) {
            clearTimeout(timeout);
            fallbackToP2P();
          }
        };

        this.ws.onerror = () => {
          if (!this.isConnected && !isResolved) {
            clearTimeout(timeout);
            fallbackToP2P();
          }
        };
      });
    }

    /**
     * Real P2P WebRTC + BroadcastChannel Mesh Transport
     * Connects real players across internet, local devices & browser tabs without bots!
     */
    _connectP2P() {
      return new Promise((resolve) => {
        this.isP2P = true;
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.clientId = this.savedClientId || ('client_' + Math.random().toString(36).substr(2, 8));
        this.savedClientId = this.clientId;
        this._persistSession();

        // Register local real player
        this.state.players[this.clientId] = {
          id: this.clientId,
          name: this.playerInfo.name || 'SKATER',
          customization: this.playerInfo.customization || {},
          ready: false,
          isHost: false,
          x: 0.25,
          y: 0.82
        };

        // 1. BroadcastChannel for zero-latency multi-tab sync on same machine
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            this.bc = new BroadcastChannel('alley_rats_p2p_' + this.roomId);
            this.bc.onmessage = (event) => {
              if (event && event.data && event.data.senderId !== this.clientId) {
                this._handleP2PPacket(event.data);
              }
            };
          } catch (e) {
            console.warn('[Multiplayer SDK] BroadcastChannel warning:', e);
          }
        }

        // 2. PeerJS for WebRTC DataChannel connection across internet / devices
        this._initPeerJS();

        // Broadcast join to peers
        this._broadcastP2P({
          type: 'client_connect',
          senderId: this.clientId,
          roomId: this.roomId,
          payload: {
            id: this.clientId,
            name: this.playerInfo.name,
            customization: this.playerInfo.customization,
            isHost: this.isHost
          }
        });

        // Resolve session ready
        this.emit('connected', {
          roomId: this.roomId,
          clientId: this.clientId,
          isHost: this.isHost
        });
        this.emit('players_updated', this.state.players);

        resolve(this);
      });
    }

    _initPeerJS() {
      if (typeof window === 'undefined' || !window.Peer) return;

      const roomPeerId = 'alley-rats-p2p-' + this.roomId.toLowerCase().replace(/[^a-z0-9]/g, '');

      try {
        const hostPeer = new window.Peer(roomPeerId, { debug: 0 });

        hostPeer.on('open', (id) => {
          console.log(`[Multiplayer SDK] Registered as Room Host on WebRTC network: ${id}`);
          this.peer = hostPeer;
          this.isHost = true;
          if (this.state.players[this.clientId]) {
            this.state.players[this.clientId].isHost = true;
          }
          this.emit('players_updated', this.state.players);

          hostPeer.on('connection', (conn) => {
            this._handleIncomingPeerConnection(conn);
          });
        });

        hostPeer.on('error', (err) => {
          if (err && (err.type === 'unavailable-id' || err.type === 'server-error')) {
            try { hostPeer.destroy(); } catch {}
            this._connectAsGuestPeer(roomPeerId);
          } else {
            console.warn('[Multiplayer SDK] PeerJS status:', err);
          }
        });
      } catch (err) {
        console.warn('[Multiplayer SDK] PeerJS initialization error:', err);
      }
    }

    _connectAsGuestPeer(hostPeerId) {
      if (typeof window === 'undefined' || !window.Peer) return;

      try {
        const guestPeer = new window.Peer(null, { debug: 0 });
        guestPeer.on('open', () => {
          this.peer = guestPeer;
          this.isHost = false;
          const conn = guestPeer.connect(hostPeerId, { reliable: true });
          this._handleIncomingPeerConnection(conn);
        });

        guestPeer.on('error', (err) => {
          console.warn('[Multiplayer SDK] Guest Peer status:', err);
        });
      } catch (e) {}
    }

    _handleIncomingPeerConnection(conn) {
      if (!this.peerConnections) this.peerConnections = new Set();
      this.peerConnections.add(conn);

      conn.on('open', () => {
        console.log('[Multiplayer SDK] WebRTC P2P DataChannel connected with real opponent!');
        conn.send({
          type: 'client_connect',
          senderId: this.clientId,
          roomId: this.roomId,
          payload: {
            id: this.clientId,
            name: this.playerInfo.name,
            customization: this.playerInfo.customization,
            isHost: this.isHost,
            state: this.state
          }
        });
      });

      conn.on('data', (data) => {
        if (data && data.senderId !== this.clientId) {
          this._handleP2PPacket(data);
          // If Host, relay to other peers so all participants stay synchronized
          if (this.isHost && this.peerConnections.size > 1) {
            for (const otherConn of this.peerConnections) {
              if (otherConn !== conn && otherConn.open) {
                try { otherConn.send(data); } catch {}
              }
            }
          }
        }
      });

      conn.on('close', () => {
        this.peerConnections.delete(conn);
      });

      conn.on('error', () => {
        this.peerConnections.delete(conn);
      });
    }

    _broadcastP2P(packet) {
      packet.senderId = this.clientId;
      packet.roomId = this.roomId;
      packet.timestamp = Date.now();

      // Post to local BroadcastChannel
      if (this.bc) {
        try { this.bc.postMessage(packet); } catch {}
      }

      // Send to all connected WebRTC peers
      if (this.peerConnections && this.peerConnections.size > 0) {
        for (const conn of this.peerConnections) {
          if (conn.open) {
            try { conn.send(packet); } catch {}
          }
        }
      }
    }

    _handleP2PPacket(packet) {
      if (!packet || !packet.type) return;

      if (packet.type === 'client_connect') {
        const p = packet.payload;
        if (p && p.id && p.id !== this.clientId) {
          const isNew = !this.state.players[p.id];
          this.state.players[p.id] = {
            id: p.id,
            name: p.name || 'SKATER',
            customization: p.customization || {},
            ready: Boolean(p.ready),
            isHost: Boolean(p.isHost),
            x: p.x || 0.45,
            y: p.y || 0.82
          };

          // If Host, synchronize room state back to guest
          if (this.isHost) {
            this._broadcastP2P({
              type: 'state_change',
              senderId: this.clientId,
              payload: this.state
            });
          }

          if (isNew) {
            this.showToast(`🛹 ${p.name || 'A skater'} joined the alley!`);
            this.emit('player_join', this.state.players[p.id]);
          }
          this.emit('players_updated', this.state.players);
        }
        return;
      }

      if (packet.type === 'state_set') {
        const { path, value } = packet.payload || {};
        if (path) {
          this._setLocalPath(path, value);
          this.emit('state_change', this.state);
          this.emit('players_updated', this.state.players);
        }
        return;
      }

      // Delegate all other standard game packets to _handlePacket
      this._handlePacket(packet);
    }

    _scheduleReconnect() {
      if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
        return;
      }
      this.isReconnecting = true;
      this.reconnectAttempts++;

      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 10000);
      console.log(`[Multiplayer SDK] Reconnect attempt #${this.reconnectAttempts} in ${Math.round(delay)}ms...`);

      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.connect()
          .then(() => {
            console.log('[Multiplayer SDK] Successfully reconnected to room!');
            this.showToast('🟢 Reconnected to game server!');
          })
          .catch(() => {
            this.isReconnecting = false;
            this._scheduleReconnect();
          });
      }, delay);
    }

    /**
     * Packet Ingestion & Routing
     */
    _handlePacket(packet, onInitialConnectResolved) {
      const { type, payload } = packet;

      switch (type) {
        // -----------------------------------------------------------
        // HANDSHAKE ACKNOWLEDGEMENT
        // -----------------------------------------------------------
        case 'connected': {
          this.clientId = payload.clientId;
          this.isHost = Boolean(payload.isHost);
          this.isConnected = true;
          this.savedClientId = this.clientId;
          this._persistSession();

          if (payload.state) {
            this.state = Object.assign(this.state, payload.state);
          }

          this._startHeartbeat();
          if (onInitialConnectResolved) onInitialConnectResolved();

          this.emit('connected', {
            roomId: this.roomId,
            clientId: this.clientId,
            isHost: this.isHost
          });
          break;
        }

        // -----------------------------------------------------------
        // SHARED STATE UPDATE
        // -----------------------------------------------------------
        case 'state_change': {
          this.state = Object.assign(this.state, payload);
          this.emit('state_change', this.state);
          break;
        }

        // -----------------------------------------------------------
        // PLAYER ROSTER UPDATES
        // -----------------------------------------------------------
        case 'players_updated': {
          if (payload) {
            this.state.players = payload;
            if (payload[this.clientId]) {
              this.isHost = Boolean(payload[this.clientId].isHost);
            }
            this.emit('players_updated', this.state.players);
            this.emit('state_change', this.state);
          }
          break;
        }

        // -----------------------------------------------------------
        // PLAYER JOINED ANNOUNCEMENT (TOP-BAR POP-UP)
        // -----------------------------------------------------------
        case 'player_join': {
          if (payload && payload.id) {
            this.state.players[payload.id] = payload;
            this.emit('player_join', payload);
            this.emit('players_updated', this.state.players);

            // Trigger Top-Bar Pop-Up
            if (payload.id !== this.clientId) {
              const name = payload.name || 'A skater';
              this.showToast(`🛹 ${name} joined the alley!`);
            }
          }
          break;
        }

        // -----------------------------------------------------------
        // PLAYER RECONNECTED ANNOUNCEMENT (TOP-BAR POP-UP)
        // -----------------------------------------------------------
        case 'player_reconnected': {
          if (payload) {
            const name = payload.name || 'Skater';
            const pointsGained = payload.pointsGained || 0;
            const msg = pointsGained > 0
              ? `⚡ ${name} reconnected! (+${pointsGained} pts synced)`
              : `⚡ ${name} reconnected to alley!`;

            this.showToast(msg);
            this.emit('player_reconnected', payload);
          }
          break;
        }

        case 'player_leave': {
          if (payload && payload.playerId) {
            const pId = payload.playerId;
            if (this.state.players[pId]) {
              this.state.players[pId].afk = true;
              this.state.players[pId].connected = false;
            }
            this.emit('player_leave', pId);
            this.emit('players_updated', this.state.players);
          }
          break;
        }

        // -----------------------------------------------------------
        // REALTIME EVENTS
        // -----------------------------------------------------------
        case 'cursor': {
          this.emit('cursor', payload);
          break;
        }

        case 'graffiti_stroke': {
          if (this.state.lobby && this.state.lobby.graffiti) {
            this.state.lobby.graffiti.push(payload);
          }
          this.emit('graffiti_stroke', payload);
          break;
        }

        case 'graffiti_cleared': {
          if (this.state.lobby) {
            this.state.lobby.graffiti = [];
          }
          this.emit('graffiti_cleared');
          break;
        }

        case 'skater_move': {
          this.emit('skater_move', payload);
          break;
        }

        case 'race_countdown': {
          this.state.race.status = 'countdown';
          this.emit('race_countdown', payload);
          break;
        }

        case 'race_progress': {
          this.emit('race_progress', payload);
          break;
        }

        case 'race_finish': {
          this.emit('race_finish', payload);
          break;
        }

        case 'surprise_event': {
          this.emit('surprise_event', payload);
          break;
        }

        case 'reconcile_response': {
          const resolver = this.pendingReconcileResolvers.get(payload.raceId || 'active');
          if (resolver) {
            resolver(payload);
            this.pendingReconcileResolvers.delete(payload.raceId || 'active');
          }
          this.emit('reconcile_response', payload);
          break;
        }

        default:
          this.emit(type, payload);
          break;
      }
    }

    _startHeartbeat() {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this._sendRaw({ type: 'ping', timestamp: Date.now() });
        }
      }, 15000);
    }

    _sendRaw(msg) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      } else if (this.isP2P) {
        this._broadcastP2P(msg);
      }
    }

    /**
     * Set a shared state key or nested dot path (LWW)
     */
    set(path, value) {
      this._setLocalPath(path, value);
      this._sendRaw({
        type: 'state_set',
        roomId: this.roomId,
        payload: { path, value }
      });
    }

    _setLocalPath(dotPath, value) {
      if (!dotPath) return;
      const parts = dotPath.split('.');
      let curr = this.state;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
        curr = curr[p];
      }
      curr[parts[parts.length - 1]] = value;
    }

    /**
     * Get value from local shared state
     */
    get(path) {
      const parts = path.split('.');
      let curr = this.state;
      for (const p of parts) {
        if (curr && typeof curr === 'object') curr = curr[p];
        else return undefined;
      }
      return curr;
    }

    /**
     * Send realtime event to room peers
     */
    sendEvent(type, payload) {
      this._sendRaw({
        type,
        roomId: this.roomId,
        payload
      });
    }

    clearGraffiti() {
      this._sendRaw({
        type: 'graffiti_cleared',
        roomId: this.roomId,
        payload: {}
      });
    }

    /**
     * Submit accumulated offline progress for server validation
     */
    reconcileProgress(snapshot) {
      if (this.isP2P) {
        return Promise.resolve({ accepted: true, ...snapshot });
      }
      return new Promise((resolve) => {
        const raceKey = snapshot.raceId || 'active';
        this.pendingReconcileResolvers.set(raceKey, resolve);

        // Fallback resolve after 3 seconds if server response drops
        setTimeout(() => {
          if (this.pendingReconcileResolvers.has(raceKey)) {
            this.pendingReconcileResolvers.delete(raceKey);
            resolve({ accepted: true, ...snapshot });
          }
        }, 3000);

        this._sendRaw({
          type: 'reconcile_progress',
          roomId: this.roomId,
          payload: snapshot
        });
      });
    }

    /**
     * Display in-game top-bar pop-up notification
     */
    showToast(message, duration = 3200) {
      if (typeof document === 'undefined') return;

      const toast = document.getElementById('lobby-toast');
      if (toast) {
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');

        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => toast.classList.add('hidden'), 300);
        }, duration);
      }
    }

    /**
     * Disconnect and teardown session
     */
    disconnect() {
      clearTimeout(this.reconnectTimer);
      clearInterval(this.heartbeatTimer);
      if (this.isP2P) {
        this._broadcastP2P({
          type: 'player_leave',
          senderId: this.clientId,
          payload: { playerId: this.clientId }
        });
        if (this.bc) {
          try { this.bc.close(); } catch {}
          this.bc = null;
        }
        if (this.peerConnections) {
          for (const conn of this.peerConnections) {
            try { conn.close(); } catch {}
          }
          this.peerConnections.clear();
        }
        if (this.peer) {
          try { this.peer.destroy(); } catch {}
          this.peer = null;
        }
      }
      if (this.ws) {
        try { this.ws.close(); } catch {}
      }
      this.isConnected = false;
      this.isReconnecting = false;
      this.removeAllListeners();
    }
  }

  /**
   * Global Multiplayer Factory
   */
  const Multiplayer = {
    join: function(options) {
      const session = new MultiplayerSession(options);
      return session.connect();
    },
    MultiplayerSession
  };

  // Export to window
  if (typeof window !== 'undefined') {
    window.Multiplayer = Multiplayer;
  }

  // Export for CommonJS / Module bundlers if used
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Multiplayer;
  }

  return Multiplayer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
