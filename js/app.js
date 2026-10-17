/**
 * ALLEY RATS: SKATE & SPRAY
 * Main Application Orchestrator & Screen Router
 */

import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Sound } from './audio.js';
import { Network } from './multiplayer-adapter.js';
import { SceneManager, SCENES } from './scenes.js';
import { SettingsManager } from './settings.js';
import { CustomizationManager } from './customization.js';
import { MenuController } from './menu.js';
import { LobbyController } from './lobby.js';

class AlleyRatsApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.sceneManager = null;
    this.settingsManager = null;
    this.customizationManager = null;
    this.menuController = null;
    this.lobbyController = null;
    this.currentRoomId = null;
    this.localClientId = null;

    this.init();
  }

  async init() {
    console.log(`🛹 Initializing ${CONFIG.appName} (${CONFIG.version})`);

    // 1. Setup Scene Manager
    this.sceneManager = new SceneManager(this.canvas, Network, {
      onRaceExitToLobby: () => {
        this.lobbyController.show();
      }
    });

    // 2. Setup Settings Manager
    this.settingsManager = new SettingsManager((settings) => {
      this.sceneManager.setSettings(settings);
    });
    this.sceneManager.setSettings(this.settingsManager.getSettings());

    // 3. Setup Customization Manager
    this.customizationManager = new CustomizationManager((customization) => {
      this.sceneManager.setLocalCustomization(customization);
      const adapter = Network.getAdapter();
      if (adapter && adapter.isConnected) {
        adapter.updateCustomization(customization);
      }
    });
    this.sceneManager.setLocalCustomization(this.customizationManager.getCustomization());

    // 4. Setup Menu Controller
    this.menuController = new MenuController({
      onCreateRoom: (roomId) => this.handleCreateRoom(roomId),
      onJoinRoom: (roomId) => this.handleJoinRoom(roomId),
      onOpenSettings: () => this.settingsManager.open(),
      onOpenCustomization: () => this.customizationManager.open(),
      onQuitConfirm: () => this.handleQuitGame()
    });

    // 5. Setup Lobby Controller
    this.lobbyController = new LobbyController({
      onLeaveRoom: () => this.handleLeaveRoom(),
      onToggleReady: (ready) => {
        const adapter = Network.getAdapter();
        if (adapter && adapter.isConnected) {
          adapter.setReady(ready);
        }
      },
      onStartRace: () => {
        const adapter = Network.getAdapter();
        if (adapter && adapter.isConnected) {
          adapter.startRace();
        }
      },
      onOpenSettings: () => this.settingsManager.open(),
      onSprayColorChange: (color) => this.sceneManager.setSprayColor(color),
      onBrushSizeChange: (size) => this.sceneManager.setBrushSize(size),
      onCursorTypeChange: (type) => this.sceneManager.setCursorType(type),
      onClearGraffiti: () => {
        const adapter = Network.getAdapter();
        if (adapter && adapter.isConnected) {
          adapter.clearGraffiti();
        }
        this.sceneManager.clearGraffiti();
      },
      onAddMockBot: () => {
        const adapter = Network.getAdapter();
        if (adapter && adapter.isMock) {
          const added = adapter.addMockBot();
          if (added) {
            this.lobbyController.showToast('🤖 Added new mock skater to alley!');
          } else {
            this.lobbyController.showToast('Lobby is at maximum capacity (8 skaters).');
          }
        }
      }
    });

    // 6. Global user gesture listener for Web Audio
    const startAudioOnGesture = () => {
      Sound.init();
      Sound.resumeContext();
      window.removeEventListener('click', startAudioOnGesture);
      window.removeEventListener('keydown', startAudioOnGesture);
    };
    window.addEventListener('click', startAudioOnGesture);
    window.addEventListener('keydown', startAudioOnGesture);

    // 7. Check URL for invite room parameter (?room=xxx)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');

    if (roomParam && roomParam.trim().length >= 3) {
      console.log(`[App] Auto-joining room from URL parameter: ${roomParam}`);
      await this.handleJoinRoom(roomParam.trim());
    } else {
      this.showMainMenu();
    }
  }

  showMainMenu() {
    this.currentRoomId = null;
    this.sceneManager.setScene(SCENES.MENU);
    this.lobbyController.hide();
    this.menuController.show();
    // Clean URL query param
    this._updateUrlRoom(null);
  }

  async handleCreateRoom(roomId) {
    console.log(`[App] Creating room: ${roomId}`);
    this.sceneManager.clearGraffiti();
    await this._connectToRoom(roomId, true);
    const adapter = Network.getAdapter();
    if (adapter && adapter.isConnected && typeof adapter.clearGraffiti === 'function') {
      adapter.clearGraffiti();
    }
  }

  async handleJoinRoom(roomId) {
    console.log(`[App] Joining room: ${roomId}`);
    await this._connectToRoom(roomId, false);
  }

  async _connectToRoom(roomId, isCreatingHost = false) {
    const cust = this.customizationManager.getCustomization();
    let adapter = Network.getAdapter();

    // Hook adapter event listeners
    this._setupAdapterListeners(adapter);

    try {
      const res = await adapter.connect(roomId, {
        name: cust.name,
        customization: cust
      });

      this.currentRoomId = roomId;
      this.localClientId = res.clientId;
      Storage.saveLastRoom(roomId);
      this._updateUrlRoom(roomId);

      // Transition to lobby
      this.menuController.hide();
      this.lobbyController.setRoomInfo(roomId, isCreatingHost || adapter.isHost, adapter.isMock);
      if (adapter.state && adapter.state.players) {
        this.lobbyController.updatePlayers(adapter.state.players, this.localClientId);
        this.sceneManager.syncPlayers(adapter.state.players, this.localClientId);
      }
      this.lobbyController.show();
      this.sceneManager.setScene(SCENES.LOBBY);

      this.lobbyController.showToast(
        adapter.isMock 
          ? `Joined Room ${roomId} (Local Test Mode)` 
          : `Connected to Online Room ${roomId}!`
      );
    } catch (err) {
      console.warn('[App] Realtime WebSocket connection failed, falling back to local multiplayer sandbox:', err);
      // Fallback automatically to Local Mock Mode with AI Bots (ideal for Vercel serverless)
      Network.setMode('mock');
      const fallbackAdapter = Network.getAdapter();
      this._setupAdapterListeners(fallbackAdapter);

      try {
        const res = await fallbackAdapter.connect(roomId, {
          name: cust.name,
          customization: cust
        });

        this.currentRoomId = roomId;
        this.localClientId = res.clientId;
        Storage.saveLastRoom(roomId);
        this._updateUrlRoom(roomId);

        this.menuController.hide();
        this.lobbyController.setRoomInfo(roomId, isCreatingHost || fallbackAdapter.isHost, true);
        if (fallbackAdapter.state && fallbackAdapter.state.players) {
          this.lobbyController.updatePlayers(fallbackAdapter.state.players, this.localClientId);
          this.sceneManager.syncPlayers(fallbackAdapter.state.players, this.localClientId);
        }
        this.lobbyController.show();
        this.sceneManager.setScene(SCENES.LOBBY);

        this.lobbyController.showToast(
          '⚡ Online server unreachable on this host. Switched to Local Sandbox with AI skaters!'
        );
      } catch (mockErr) {
        console.error('[App] Failed to start local multiplayer mode:', mockErr);
        alert('Could not join room: ' + (mockErr.message || 'Unknown network error'));
        this.showMainMenu();
      }
    }
  }

  _setupAdapterListeners(adapter) {
    adapter.removeAllListeners();

    adapter.on('connected', (data) => {
      if (data && data.clientId) {
        this.localClientId = data.clientId;
      }
    });

    adapter.on('players_updated', (players) => {
      this.lobbyController.updatePlayers(players, this.localClientId);
      this.sceneManager.syncPlayers(players, this.localClientId);
    });

    adapter.on('player_join', (player) => {
      if (player && player.id !== this.localClientId) {
        this.lobbyController.showToast(`🛹 ${player.name || 'A skater'} joined the alley!`);
      }
    });

    adapter.on('player_reconnected', (data) => {
      if (data) {
        const name = data.name || 'Skater';
        const pts = data.pointsGained || 0;
        this.lobbyController.showToast(pts > 0 ? `⚡ ${name} reconnected! (+${pts} pts synced)` : `⚡ ${name} reconnected to alley!`);
      }
    });

    adapter.on('cursor_moved', (data) => {
      this.sceneManager.cursorManager.updateRemoteCursor(data);
    });

    adapter.on('skater_move', (data) => {
      this.sceneManager.updateRemoteSkater(data);
    });

    adapter.on('graffiti_stroke', (stroke) => {
      this.sceneManager.graffitiEngine.renderRemoteStroke(stroke);
    });

    adapter.on('graffiti_cleared', () => {
      this.sceneManager.clearGraffiti();
    });

    adapter.on('race_countdown', (payload) => {
      const countdownSeconds = (payload && payload.countdownSeconds) || 3;
      if (payload && payload.courseSeed) {
        this.currentCourseSeed = payload.courseSeed;
      }
      this.lobbyController.triggerRaceCountdown(countdownSeconds, () => {
        this.sceneManager.triggerScreenShake(12);
        this.lobbyController.showToast('🚀 RACE IN PROGRESS! SKATE FAST OR BAIL!');
        this.startRace();
      });
    });

    adapter.on('disconnected', () => {
      console.log('[App] Adapter disconnected.');
      this.showMainMenu();
    });

    adapter.on('error', (err) => {
      this.lobbyController.showToast(`Network error: ${err.message}`);
    });
  }

  startRace() {
    this.lobbyController.hide();
    const cust = this.customizationManager.getCustomization();
    const adapter = Network.getAdapter();
    const players = (adapter && adapter.state && adapter.state.players) || this.lobbyController.players || {};
    this.sceneManager.startRace({
      raceId: this.currentRoomId || 'race_' + Math.floor(1000 + Math.random() * 9000),
      courseSeed: this.currentCourseSeed || (adapter && adapter.state && adapter.state.race && adapter.state.race.courseSeed) || 7421,
      localPlayerId: this.localClientId || 'local_racer',
      localCustomization: cust,
      players: players
    });
  }

  handleLeaveRoom() {
    const confirmed = confirm('Leave the multiplayer alley and return to main menu?');
    if (!confirmed) return;

    const adapter = Network.getAdapter();
    if (adapter && adapter.isConnected) {
      adapter.disconnect();
    }
    this.showMainMenu();
  }

  handleQuitGame() {
    this.menuController.hide();
    const exitScreen = document.getElementById('exit-screen');
    if (exitScreen) {
      exitScreen.classList.remove('hidden');
    }
  }

  _updateUrlRoom(roomId) {
    const url = new URL(window.location.href);
    if (roomId) {
      url.searchParams.set('room', roomId);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  }
}

// Start game when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.alleyRatsGame = new AlleyRatsApp();
});
