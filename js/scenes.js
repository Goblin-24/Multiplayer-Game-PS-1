/**
 * ALLEY RATS: SKATE & SPRAY
 * Scene State & Game Loop Manager
 */

import { CONFIG } from './config.js';
import { WorldRenderer } from './renderer.js';
import { GraffitiEngine } from './graffiti.js';
import { CursorManager } from './cursors.js';
import { Skater } from './skater.js';
import { Sound } from './audio.js';
import { RacingController } from './racing.js';

export const SCENES = {
  MENU: 'menu',
  LOBBY: 'lobby',
  RACE: 'race'
};

export class SceneManager {
  constructor(canvas, networkManager, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.networkManager = networkManager;
    this.onRaceExitToLobby = callbacks.onRaceExitToLobby || null;

    this.currentScene = SCENES.MENU;
    this.worldRenderer = new WorldRenderer(canvas);
    this.graffitiEngine = new GraffitiEngine(canvas.clientWidth || 1200, canvas.clientHeight || 700);
    this.cursorManager = new CursorManager();
    this.racingController = new RacingController(canvas, networkManager, () => {
      this.setScene(SCENES.LOBBY);
      if (this.onRaceExitToLobby) {
        this.onRaceExitToLobby();
      }
    });

    // Skaters collection: Map of clientId -> Skater
    this.skaters = new Map();
    this.localClientId = null;
    this.localSkater = null;

    // Menu background skater
    this.menuSkater = new Skater({
      id: 'menu_skater',
      name: 'RAT_KING',
      x: -0.1,
      y: CONFIG.groundY,
      isMenu: true,
      ready: true,
      customization: Object.assign({}, CONFIG.defaultCustomization, {
        hoodieColor: '#ff007f',
        wheelColor: '#39ff14',
        deckGraphic: 'rat'
      })
    }, true);
    this.menuSkater.vx = 0.35; // cruises across menu screen

    // Keyboard controls state
    this.keys = {
      left: false,
      right: false,
      space: false
    };

    // Active tool state for local graffiti
    this.activeTool = 'spray-can'; // 'spray-can', 'marker', 'brush', 'sticker'
    this.activeSticker = 'rat_crown';
    this.activeColor = CONFIG.sprayPalette[0].hex;
    this.activeSize = 12;

    // Settings reference
    this.settings = {
      showNameTags: true,
      screenShake: true,
      reducedMotion: false
    };

    // Camera shake offset
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;

    this.animId = null;
    this.lastTime = performance.now();

    this._bindEvents();
    this._startLoop();
  }

  setScene(scene) {
    console.log(`[SceneManager] Changing scene from ${this.currentScene} to ${scene}`);
    const prevScene = this.currentScene;
    this.currentScene = scene;

    if (prevScene === SCENES.RACE && scene !== SCENES.RACE) {
      this.racingController.stop();
    }

    if (scene === SCENES.MENU) {
      this.cursorManager.setLocalVisible(false);
      this.menuSkater.normX = -0.1;
      this.menuSkater.vx = 0.35;
    } else if (scene === SCENES.LOBBY) {
      this.cursorManager.setLocalVisible(true);
      Sound.playLandSound();
      if (!this.localSkater) {
        const localId = this.localClientId || 'client_local';
        const skater = new Skater({
          id: localId,
          name: 'SKATER',
          x: 0.25,
          y: CONFIG.groundY,
          ready: false,
          customization: Object.assign({}, CONFIG.defaultCustomization)
        }, true);
        this.skaters.set(localId, skater);
        this.localSkater = skater;
      }
    } else if (scene === SCENES.RACE) {
      this.cursorManager.setLocalVisible(false);
    }
  }

  startRace(options) {
    this.setScene(SCENES.RACE);
    this.racingController.start(options);
  }

  setSettings(settings) {
    this.settings = Object.assign(this.settings, settings);
    if (settings.cursorStyle) {
      this.cursorManager.setLocalCustomization({ cursorType: settings.cursorStyle });
    }
  }

  setLocalCustomization(customization) {
    this.cursorManager.setLocalCustomization(customization);
    if (this.localSkater) {
      this.localSkater.updateCustomization(customization);
    }
  }

  setSprayColor(color) {
    this.activeColor = color;
    this.cursorManager.setLocalCustomization({ paintColor: color });
  }

  setBrushSize(size) {
    this.activeSize = size;
  }

  setCursorType(type, stickerId = 'rat_crown') {
    this.activeTool = type;
    this.activeSticker = stickerId;
    this.cursorManager.setLocalCustomization({ cursorType: type });
  }

  clearGraffiti() {
    this.graffitiEngine.clear();
  }

  triggerScreenShake(intensity = 8) {
    if (!this.settings.screenShake || this.settings.reducedMotion) return;
    this.shakeIntensity = intensity;
  }

  /**
   * Sync skaters collection with multiplayer players state
   */
  syncPlayers(players, localClientId) {
    this.localClientId = localClientId;
    const currentIds = new Set(Object.keys(players));

    for (const [id] of this.skaters.entries()) {
      if (!currentIds.has(id)) {
        this.skaters.delete(id);
      }
    }

    for (const [id, p] of Object.entries(players)) {
      const isLocal = (id === localClientId);

      if (!this.skaters.has(id)) {
        const skater = new Skater(p, isLocal);
        this.skaters.set(id, skater);
        if (isLocal) {
          this.localSkater = skater;
        }
      } else {
        const skater = this.skaters.get(id);
        skater.updateCustomization(p.customization);
        skater.setReady(p.ready);
        skater.isHost = Boolean(p.isHost);
        skater.isMock = Boolean(p.isMock);
        skater.afk = Boolean(p.afk || p.connected === false);
        if (p.name) skater.name = p.name;
        if (isLocal) {
          this.localSkater = skater;
        }
      }
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this.worldRenderer.resize();
      this.graffitiEngine.resize(this.worldRenderer.width, this.worldRenderer.height);
    });

    // Keyboard input for skater movement & tricks
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (this.currentScene === SCENES.RACE) {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
          e.preventDefault();
          this.racingController.handleJump();
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          this.racingController.handleDuck(true);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'KeyK') {
          e.preventDefault();
          this.racingController.handleBoostTrick();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.racingController.togglePause();
        }
        return;
      }

      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.keys.left = true;
        if (this.localSkater) this.localSkater.triggerPush();
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.keys.right = true;
        if (this.localSkater) this.localSkater.triggerPush();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.keys.space = true;
        if (this.currentScene === SCENES.LOBBY && this.localSkater) {
          const popped = this.localSkater.ollie();
          if (popped) {
            Sound.playOlliePop();
            this.triggerScreenShake(5);
            this._broadcastSkaterMove({ isOllie: true });
          }
        }
      } else if (e.code === 'KeyK') {
        // Kickflip trick!
        if (this.currentScene === SCENES.LOBBY && this.localSkater) {
          const popped = this.localSkater.kickflip();
          if (popped) {
            this.triggerScreenShake(7);
            this._broadcastSkaterMove({ isKickflip: true });
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.currentScene === SCENES.RACE) {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.racingController.handleDuck(false);
        }
        return;
      }

      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        this.keys.left = false;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        this.keys.right = false;
      } else if (e.code === 'Space') {
        this.keys.space = false;
      }
    });

    // Canvas Pointer events for Graffiti, Stickers & Cursors
    const canvas = this.canvas;

    const getNormalizedPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      };
    };

    const handlePointerDown = (e) => {
      if (this.currentScene !== SCENES.LOBBY) return;
      const pos = getNormalizedPos(e);
      const adapter = this.networkManager.getAdapter();

      // Check if user clicked to scare a pigeon
      if (pos.y >= 0.65 && pos.y <= 0.76) {
        this.worldRenderer.scarePigeons(pos.x);
      }

      // Check if clicked on wall
      if (this.graffitiEngine.isWithinWall(pos.x, pos.y)) {
        if (this.activeTool === 'sticker') {
          // Stamp sticker on wall!
          this.graffitiEngine.stampSticker(
            pos.x,
            pos.y,
            this.activeSticker,
            this.localClientId || 'local',
            (payload) => {
              if (adapter && adapter.isConnected) {
                adapter.sendGraffitiStroke(payload);
              }
            }
          );
        } else {
          // Spray / Brush stroke
          this.graffitiEngine.startStroke(
            pos.x,
            pos.y,
            this.activeColor,
            this.activeSize,
            this.localClientId || 'local',
            (stroke, isFinal) => {
              if (adapter && adapter.isConnected) {
                adapter.sendGraffitiStroke(stroke);
              }
            }
          );
          this.cursorManager.updateLocalPosition(pos.x, pos.y, true);
        }
      } else if (pos.y >= CONFIG.pavementMinY) {
        // Clicked on pavement -> skater skate to location!
        if (this.localSkater) {
          const dx = pos.x - this.localSkater.normX;
          this.localSkater.facing = dx >= 0 ? 1 : -1;
          this.localSkater.vx = dx * 2.4;
          this.localSkater.triggerPush();
          this._broadcastSkaterMove({ isPushing: true });
        }
      }
    };

    const handlePointerMove = (e) => {
      if (this.currentScene !== SCENES.LOBBY) return;
      const pos = getNormalizedPos(e);
      const adapter = this.networkManager.getAdapter();

      // Update cursor position and broadcast
      this.cursorManager.updateLocalPosition(
        pos.x,
        pos.y,
        this.graffitiEngine.isPainting,
        (nx, ny, cType, col, nm) => {
          if (adapter && adapter.isConnected) {
            adapter.sendCursor(nx, ny, cType, col, nm);
          }
        }
      );

      // Add graffiti stroke point
      if (this.graffitiEngine.isPainting) {
        this.graffitiEngine.addStrokePoint(pos.x, pos.y, (stroke, isFinal) => {
          if (adapter && adapter.isConnected) {
            adapter.sendGraffitiStroke(stroke);
          }
        });
      }
    };

    const handlePointerUp = () => {
      if (this.currentScene !== SCENES.LOBBY) return;
      const adapter = this.networkManager.getAdapter();
      if (this.graffitiEngine.isPainting) {
        this.graffitiEngine.endStroke((stroke) => {
          if (adapter && adapter.isConnected) {
            adapter.sendGraffitiStroke(stroke);
          }
        });
      }
      this.cursorManager.localCursor.isSpraying = false;
    };

    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    // Touch support for tablets and mobile devices
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handlePointerDown(e);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handlePointerMove(e);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      handlePointerUp();
    });

    canvas.addEventListener('mouseenter', () => {
      if (this.currentScene === SCENES.LOBBY) {
        this.cursorManager.setLocalVisible(true);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.cursorManager.setLocalVisible(false);
      handlePointerUp();
    });
  }

  _startLoop() {
    const loop = (timestamp) => {
      const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
      this.lastTime = timestamp;

      this._update(dt);
      this._render();

      this.animId = requestAnimationFrame(loop);
    };

    this.animId = requestAnimationFrame(loop);
  }

  _update(dt) {
    const skaterNormX = (this.currentScene === SCENES.LOBBY && this.localSkater) ? this.localSkater.normX : null;
    this.worldRenderer.update(dt, skaterNormX);
    this.cursorManager.update(dt);

    // Screen shake decay
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.1) this.shakeIntensity = 0;
      this.shakeOffsetX = (Math.random() - 0.5) * this.shakeIntensity * 2;
      this.shakeOffsetY = (Math.random() - 0.5) * this.shakeIntensity * 2;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    if (this.currentScene === SCENES.RACE) {
      this.racingController.update(dt, this.worldRenderer.width, this.worldRenderer.height);
      return;
    }

    if (this.currentScene === SCENES.MENU) {
      // Menu skater cruises across
      this.menuSkater.update(dt);
      if (this.menuSkater.normX > 1.15) {
        this.menuSkater.normX = -0.15;
      }
    } else if (this.currentScene === SCENES.LOBBY) {
      // Local skater keyboard movement
      if (this.localSkater) {
        let isMoving = false;
        if (this.keys.left) {
          this.localSkater.facing = -1;
          this.localSkater.vx = -this.localSkater.speed;
          isMoving = true;
        } else if (this.keys.right) {
          this.localSkater.facing = 1;
          this.localSkater.vx = this.localSkater.speed;
          isMoving = true;
        }

        const isActive = isMoving || Math.abs(this.localSkater.vx) > 0.005 || 
          this.localSkater.isJumping || this.localSkater.isGrinding || this.localSkater.isPushing;

        this.skaterSendTimer = (this.skaterSendTimer || 0) + dt;
        if (this.skaterSendTimer >= 0.04 || (isActive && this.skaterSendTimer >= 0.025)) {
          this.skaterSendTimer = 0;
          this._broadcastSkaterMove();
        }
      }

      // Update all lobby skaters
      for (const skater of this.skaters.values()) {
        skater.update(dt);
      }
    }
  }

  _broadcastSkaterMove(extra = {}) {
    if (!this.localSkater) return;
    const adapter = this.networkManager.getAdapter();
    if (adapter && adapter.isConnected && typeof adapter.sendEvent === 'function') {
      adapter.sendEvent('skater_move', Object.assign({
        clientId: this.localClientId,
        normX: this.localSkater.normX,
        normY: this.localSkater.normY,
        facing: this.localSkater.facing,
        vx: this.localSkater.vx,
        isPushing: this.localSkater.isPushing,
        isJumping: this.localSkater.isJumping,
        isKickflipping: this.localSkater.isKickflipping,
        isGrinding: this.localSkater.isGrinding
      }, extra));
    }
  }

  updateRemoteSkater(data) {
    if (!data || !data.clientId || data.clientId === this.localClientId) return;
    const skater = this.skaters.get(data.clientId);
    if (skater) {
      skater.applyRemoteMovement(data);
    }
  }

  _render() {
    const ctx = this.ctx;
    const w = this.worldRenderer.width;
    const h = this.worldRenderer.height;

    ctx.save();
    // Clear viewport
    ctx.clearRect(0, 0, w, h);

    // Camera shake translation
    if (this.shakeIntensity > 0) {
      ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
    }

    if (this.currentScene === SCENES.RACE) {
      this.racingController.render(w, h);
      ctx.restore();
      return;
    }

    // 1. Render Alley Background (Brick wall, sky, pavement, rail, props)
    const showGuide = (this.currentScene === SCENES.LOBBY);
    this.worldRenderer.renderAlleyBackdrop(showGuide);

    // 2. Render Persistent Graffiti Layer on top of the brick wall
    this.graffitiEngine.draw(ctx, w, h);

    // 3. Render Skaters on pavement
    if (this.currentScene === SCENES.MENU) {
      this.menuSkater.render(ctx, w, h, false);
    } else if (this.currentScene === SCENES.LOBBY) {
      // Sort skaters by Y coordinate for depth
      const sortedSkaters = Array.from(this.skaters.values()).sort((a, b) => a.normY - b.normY);
      for (const skater of sortedSkaters) {
        skater.render(ctx, w, h, this.settings.showNameTags);
      }
    }

    // 4. Render In-Canvas Multiplayer Cursors & Floating Name Tags
    if (this.currentScene === SCENES.LOBBY) {
      this.cursorManager.render(ctx, w, h, this.settings.showNameTags);
    }

    ctx.restore();
  }
}
