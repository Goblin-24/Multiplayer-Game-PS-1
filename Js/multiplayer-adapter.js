/**
 * ALLEY RATS: SKATE & SPRAY
 * Multiplayer Adapter Architecture
 * Supports both Real Multiplayer (window.Multiplayer contract) and Local Mock Mode
 */

import { CONFIG } from './config.js';
import './multiplayer.js';

/**
 * Base Event Emitter for clean pub/sub
 */
class EventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(fn);
    }
  }

  emit(event, ...args) {
    if (this._listeners.has(event)) {
      for (const fn of this._listeners.get(event)) {
        try {
          fn(...args);
        } catch (err) {
          console.error(`[Adapter] Error in listener for event "${event}":`, err);
        }
      }
    }
  }

  removeAllListeners() {
    this._listeners.clear();
  }
}

/**
 * Mock Multiplayer Adapter for local offline testing
 * Simulates real multiplayer behavior cleanly without pretending bots are real online humans.
 */
class MockMultiplayerAdapter extends EventEmitter {
  constructor() {
    super();
    this.isMock = true;
    this.isConnected = false;
    this.roomId = null;
    this.localClientId = 'client_local_' + Math.floor(1000 + Math.random() * 9000);
    this.isHost = true;
    
    // Room state
    this.state = {
      players: {},
      lobby: {
        graffiti: []
      },
      race: {
        status: 'waiting'
      }
    };

    this.simulatedBots = [];
    this.simInterval = null;
    this.cursorInterval = null;
  }

  async connect(roomId, localPlayerInfo) {
    this.roomId = roomId;
    this.isConnected = true;

    // Register local player
    this.state.players[this.localClientId] = {
      id: this.localClientId,
      name: localPlayerInfo.name || 'YOU',
      ready: false,
      isHost: true,
      isMock: false,
      customization: localPlayerInfo.customization || Object.assign({}, CONFIG.defaultCustomization),
      x: 0.25,
      y: CONFIG.groundY
    };

    // Pre-seed 2 mock participants clearly marked as simulated test bots
    this.simulatedBots = [
      {
        id: 'mock_bot_01',
        name: 'BRICKB0Y',
        ready: false,
        isHost: false,
        isMock: true,
        x: 0.55,
        y: CONFIG.groundY,
        cursorX: 0.52,
        cursorY: 0.35,
        targetCursorX: 0.52,
        targetCursorY: 0.35,
        customization: {
          name: 'BRICKB0Y',
          skinTone: '#e0ac69',
          headwear: 'beanie',
          headwearColor: '#ff6b00',
          hoodieColor: '#0284c7', // cyan blue
          pantsColor: '#334155',
          deckGraphic: 'checker',
          deckColor: '#1e293b',
          wheelColor: '#ffe600',
          cursorType: 'spray-can',
          paintColor: '#ffe600'
        }
      },
      {
        id: 'mock_bot_02',
        name: 'PIGEONSLAYER',
        ready: true,
        isHost: false,
        isMock: true,
        x: 0.78,
        y: CONFIG.groundY,
        cursorX: 0.72,
        cursorY: 0.45,
        targetCursorX: 0.72,
        targetCursorY: 0.45,
        customization: {
          name: 'PIGEONSLAYER',
          skinTone: '#c68642',
          headwear: 'cap_back',
          headwearColor: '#39ff14',
          hoodieColor: '#e11d48', // crimson
          pantsColor: '#0f172a',
          deckGraphic: 'rat',
          deckColor: '#09090b',
          wheelColor: '#ff007f',
          cursorType: 'spray-can',
          paintColor: '#ff007f'
        }
      }
    ];

    // Add bots to players state
    for (const bot of this.simulatedBots) {
      this.state.players[bot.id] = {
        id: bot.id,
        name: bot.name,
        ready: bot.ready,
        isHost: false,
        isMock: true,
        customization: bot.customization,
        x: bot.x,
        y: bot.y
      };
    }

    // Start bot simulations (cursor wandering & periodic graffiti sprays)
    this._startBotSimulation();

    // Notify listeners
    this.emit('connected', { roomId, isMock: true, clientId: this.localClientId });
    this.emit('state_sync', this.state);
    this.emit('players_updated', this.state.players);

    return { success: true, roomId, clientId: this.localClientId };
  }

  _startBotSimulation() {
    this._stopBotSimulation();

    // Bot cursor movement simulation (smooth wandering)
    this.cursorInterval = setInterval(() => {
      if (!this.isConnected) return;

      for (const bot of this.simulatedBots) {
        // Change target cursor position randomly within graffiti wall
        if (Math.random() < 0.15) {
          bot.targetCursorX = CONFIG.wallBounds.minX + Math.random() * (CONFIG.wallBounds.maxX - CONFIG.wallBounds.minX);
          bot.targetCursorY = CONFIG.wallBounds.minY + Math.random() * (CONFIG.wallBounds.maxY - CONFIG.wallBounds.minY);
        }

        // Lerp cursor toward target
        bot.cursorX += (bot.targetCursorX - bot.cursorX) * 0.12;
        bot.cursorY += (bot.targetCursorY - bot.cursorY) * 0.12;

        this.emit('cursor_moved', {
          clientId: bot.id,
          x: bot.cursorX,
          y: bot.cursorY,
          cursorType: bot.customization.cursorType,
          name: bot.name,
          color: bot.customization.paintColor
        });
      }
    }, 45);

    // Occasional bot graffiti strokes or readiness toggles
    this.simInterval = setInterval(() => {
      if (!this.isConnected) return;

      // Occasional graffiti tag
      if (Math.random() < 0.3) {
        const bot = this.simulatedBots[Math.floor(Math.random() * this.simulatedBots.length)];
        const startX = bot.cursorX;
        const startY = bot.cursorY;
        const strokeId = 'mock_stroke_' + Date.now();
        const points = [];
        
        const count = 5 + Math.floor(Math.random() * 8);
        let curX = startX;
        let curY = startY;

        for (let i = 0; i < count; i++) {
          curX += (Math.random() - 0.5) * 0.04;
          curY += (Math.random() - 0.5) * 0.04;
          // clamp to wall
          curX = Math.max(CONFIG.wallBounds.minX, Math.min(CONFIG.wallBounds.maxX, curX));
          curY = Math.max(CONFIG.wallBounds.minY, Math.min(CONFIG.wallBounds.maxY, curY));
          points.push({ x: curX, y: curY });
        }

        const stroke = {
          strokeId,
          clientId: bot.id,
          color: bot.customization.paintColor,
          size: 10 + Math.floor(Math.random() * 8),
          points
        };

        this.state.lobby.graffiti.push(stroke);
        this.emit('graffiti_stroke', stroke);
      }

      // Occasional ready flip for BRICKB0Y to test host race readiness
      if (Math.random() < 0.1) {
        const brickboy = this.simulatedBots.find(b => b.id === 'mock_bot_01');
        if (brickboy) {
          brickboy.ready = !brickboy.ready;
          if (this.state.players[brickboy.id]) {
            this.state.players[brickboy.id].ready = brickboy.ready;
          }
          this.emit('players_updated', this.state.players);
        }
      }
    }, 4000);
  }

  _stopBotSimulation() {
    if (this.cursorInterval) {
      clearInterval(this.cursorInterval);
      this.cursorInterval = null;
    }
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  /**
   * Update local player ready state
   */
  setReady(isReady) {
    if (!this.state.players[this.localClientId]) return;
    this.state.players[this.localClientId].ready = isReady;
    this.emit('players_updated', this.state.players);
  }

  /**
   * Update local player skater customization
   */
  updateCustomization(customization) {
    if (!this.state.players[this.localClientId]) return;
    this.state.players[this.localClientId].customization = customization;
    this.state.players[this.localClientId].name = customization.name;
    this.emit('players_updated', this.state.players);
  }

  /**
   * Send local cursor position
   */
  sendCursor(x, y, cursorType, color, name) {
    // In mock mode, local cursor is drawn by local loop, but we can reflect it if needed
  }

  /**
   * Send graffiti paint stroke
   */
  sendGraffitiStroke(stroke) {
    stroke.clientId = this.localClientId;
    this.state.lobby.graffiti.push(stroke);
    // In mock mode, stroke is already drawn locally, but we store it in room history
  }

  /**
   * Clear all graffiti (host command)
   */
  clearGraffiti() {
    this.state.lobby.graffiti = [];
    this.emit('graffiti_cleared');
  }

  /**
   * Host starts race
   */
  startRace() {
    this.state.race.status = 'countdown';
    this.emit('race_countdown', { countdownSeconds: 3 });
  }

  /**
   * Add extra mock bot for testing lobby fill
   */
  addMockBot() {
    if (Object.keys(this.state.players).length >= CONFIG.maxPlayers) {
      return false;
    }
    const idx = Object.keys(this.state.players).length + 1;
    const names = ['NEON_VIPER', 'RAD_GIZMO', 'OLLIE_QUEEN', 'CURB_CRUSHER', 'CONCRETE_GHOST'];
    const botName = names[(idx - 2) % names.length] || `RAT_BOT_${idx}`;
    const botId = `mock_bot_${Date.now()}`;
    const colors = ['#00f0ff', '#b026ff', '#39ff14', '#ff6b00', '#ffe600'];
    const botColor = colors[idx % colors.length];

    const bot = {
      id: botId,
      name: botName,
      ready: true,
      isHost: false,
      isMock: true,
      x: 0.15 + Math.random() * 0.7,
      y: CONFIG.groundY,
      cursorX: 0.3 + Math.random() * 0.4,
      cursorY: 0.2 + Math.random() * 0.3,
      targetCursorX: 0.5,
      targetCursorY: 0.3,
      customization: {
        name: botName,
        skinTone: '#ffd1a4',
        headwear: 'punk',
        headwearColor: botColor,
        hoodieColor: '#1e293b',
        pantsColor: '#475569',
        deckGraphic: 'toxic',
        deckColor: '#09090b',
        wheelColor: botColor,
        cursorType: 'spray-can',
        paintColor: botColor
      }
    };

    this.simulatedBots.push(bot);
    this.state.players[botId] = bot;
    this.emit('players_updated', this.state.players);
    return true;
  }

  sendEvent(type, payload) {
    if (type === 'race_progress') {
      this.emit('race_progress', payload);
    }
  }

  async reconcileProgress(snapshot) {
    // Simulated authoritative server reconciliation
    return {
      accepted: true,
      raceId: snapshot.raceId,
      playerId: snapshot.playerId,
      acceptedDistance: snapshot.distance,
      acceptedScore: snapshot.score,
      checkpoint: snapshot.checkpoint,
      lastAcceptedEventSequence: snapshot.lastEventSequence,
      timestamp: Date.now()
    };
  }

  /**
   * Disconnect and clean up
   */
  disconnect() {
    this._stopBotSimulation();
    this.isConnected = false;
    this.roomId = null;
    this.state.players = {};
    this.emit('disconnected');
    this.removeAllListeners();
  }
}

/**
 * Real Multiplayer Adapter
 * Conforms to team's agreed multiplayer.js library contract:
 * - Multiplayer.join(...)
 * - mp.set(key, value)
 * - mp.get(key)
 * - mp.on(event, callback)
 * - mp.off(event, callback)
 */
class RealMultiplayerAdapter extends EventEmitter {
  constructor(serverUrl = CONFIG.serverUrl) {
    super();
    this.isMock = false;
    this.serverUrl = serverUrl;
    this.isConnected = false;
    this.roomId = null;
    this.localClientId = null;
    this.isHost = false;
    this.mpInstance = null;
    this.state = {
      players: {},
      lobby: { graffiti: [] },
      race: { status: 'waiting' }
    };
  }

  async connect(roomId, localPlayerInfo) {
    this.roomId = roomId;

    try {
      // Check if global Multiplayer library is loaded
      if (typeof window.Multiplayer !== 'undefined') {
        this.mpInstance = await window.Multiplayer.join({
          roomId,
          serverUrl: this.serverUrl,
          playerInfo: {
            name: localPlayerInfo.name,
            customization: localPlayerInfo.customization
          }
        });

        this.localClientId = this.mpInstance.clientId || this.mpInstance.id || ('client_' + Math.random().toString(36).substr(2, 6));
        this.isConnected = true;
        this.isHost = Boolean(this.mpInstance.isHost);

        // Listen for shared state changes
        this.mpInstance.on('state_change', (newState) => {
          this.state = Object.assign(this.state, newState);
          this.emit('players_updated', this.state.players);
        });

        // Listen for cursors
        this.mpInstance.on('cursor', (data) => {
          if (data.clientId !== this.localClientId) {
            this.emit('cursor_moved', data);
          }
        });

        // Listen for graffiti strokes
        this.mpInstance.on('graffiti_stroke', (stroke) => {
          if (stroke.clientId !== this.localClientId) {
            this.state.lobby.graffiti.push(stroke);
            this.emit('graffiti_stroke', stroke);
          }
        });

        // Listen for player joins/leaves
        this.mpInstance.on('player_join', (player) => {
          this.state.players[player.id] = player;
          this.emit('players_updated', this.state.players);
          this.emit('player_join', player);
        });

        this.mpInstance.on('player_reconnected', (data) => {
          this.emit('player_reconnected', data);
        });

        this.mpInstance.on('player_leave', (playerId) => {
          if (this.state.players[playerId]) {
            this.state.players[playerId].afk = true;
          }
          this.emit('players_updated', this.state.players);
          this.emit('player_leave', playerId);
        });

        this.mpInstance.on('race_countdown', (data) => {
          this.emit('race_countdown', data);
        });

        this.mpInstance.on('race_progress', (data) => {
          this.emit('race_progress', data);
        });

        this.mpInstance.on('race_finish', (data) => {
          this.emit('race_finish', data);
        });

        this.mpInstance.on('surprise_event', (data) => {
          this.emit('surprise_event', data);
        });

        this.mpInstance.on('graffiti_cleared', () => {
          this.state.lobby.graffiti = [];
          this.emit('graffiti_cleared');
        });

        this.mpInstance.on('skater_move', (data) => {
          this.emit('skater_move', data);
        });

        this.mpInstance.on('disconnected', () => {
          this.emit('disconnected');
        });

        this.emit('connected', { roomId, isMock: false, clientId: this.localClientId });
        return { success: true, roomId, clientId: this.localClientId };
      } else {
        throw new Error('window.Multiplayer library not found on page.');
      }
    } catch (err) {
      console.warn('[RealMultiplayerAdapter] Connection failed:', err.message);
      this.emit('error', { message: 'Could not connect to online multiplayer server. Ensure server is running.' });
      throw err;
    }
  }

  setReady(isReady) {
    if (this.mpInstance && typeof this.mpInstance.set === 'function') {
      this.mpInstance.set(`players.${this.localClientId}.ready`, isReady);
    }
  }

  updateCustomization(customization) {
    if (this.mpInstance && typeof this.mpInstance.set === 'function') {
      this.mpInstance.set(`players.${this.localClientId}.customization`, customization);
    }
  }

  sendCursor(x, y, cursorType, color, name) {
    if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent('cursor', {
        clientId: this.localClientId,
        x, y, cursorType, color, name
      });
    }
  }

  sendGraffitiStroke(stroke) {
    if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent('graffiti_stroke', stroke);
    }
  }

  clearGraffiti() {
    if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent('graffiti_cleared', {});
    }
  }

  startRace() {
    if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent('start_race', { roomId: this.roomId });
    }
  }

  sendEvent(type, payload) {
    if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent(type, payload);
    }
  }

  async reconcileProgress(snapshot) {
    if (this.mpInstance && typeof this.mpInstance.reconcileProgress === 'function') {
      return await this.mpInstance.reconcileProgress(snapshot);
    } else if (this.mpInstance && typeof this.mpInstance.sendEvent === 'function') {
      this.mpInstance.sendEvent('reconcile_progress', snapshot);
      return { accepted: true, ...snapshot };
    }
    return { accepted: false, reason: 'Reconciliation API not connected' };
  }

  disconnect() {
    if (this.mpInstance && typeof this.mpInstance.disconnect === 'function') {
      this.mpInstance.disconnect();
    }
    this.isConnected = false;
    this.removeAllListeners();
  }
}

/**
 * Factory & Active Adapter Singleton
 */
class NetworkManager {
  constructor() {
    this.mode = CONFIG.mockMode ? 'mock' : 'real';
    this.adapter = this.createAdapter();
  }

  createAdapter() {
    if (this.mode === 'mock') {
      return new MockMultiplayerAdapter();
    } else {
      return new RealMultiplayerAdapter(CONFIG.serverUrl);
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    if (this.adapter && this.adapter.isConnected) {
      this.adapter.disconnect();
    }
    this.mode = mode;
    this.adapter = this.createAdapter();
    console.log(`[NetworkManager] Switched mode to: ${mode.toUpperCase()}`);
  }

  getAdapter() {
    return this.adapter;
  }
}

export const Network = new NetworkManager();
