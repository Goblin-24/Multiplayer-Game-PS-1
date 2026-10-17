/**
 * ALLEY RATS: SKATE & SPRAY
 * Main Racing Game Engine, Parallax World & Simulation Controller
 */

import { CONFIG } from './config.js';
import { Sound } from './audio.js';
import { RacingPhysics } from './physics.js';
import { ObstacleManager } from './obstacles.js';
import { SurpriseEventManager } from './surprise-events.js';
import { CollectibleManager } from './collectibles.js';
import { RaceScoring } from './scoring.js';
import { RecoveryManager } from './recovery-manager.js';
import { RacingLeaderboard } from './leaderboard.js';
import { RacingNetwork } from './racing-network.js';
import { Skater } from './skater.js';

export class RacingController {
  constructor(canvas, networkManager, onReturnToLobby = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.networkManager = networkManager;
    this.onReturnToLobby = onReturnToLobby;

    // Submodules
    this.physics = new RacingPhysics({ groundY: 620, baseSpeed: 380 });
    this.obstacles = new ObstacleManager(7421);
    this.surpriseEvents = new SurpriseEventManager(7421);
    this.collectibles = new CollectibleManager(7421);
    this.scoring = new RaceScoring();
    this.recovery = new RecoveryManager();
    this.leaderboard = new RacingLeaderboard();
    this.network = new RacingNetwork(networkManager, this.recovery);

    // State
    this.isActive = false;
    this.isPaused = false;
    this.raceId = null;
    this.localPlayerId = null;
    this.courseSeed = 7421;
    this.sessionId = 'session_' + Math.random().toString(36).substr(2, 6);

    // Camera & World Scroll
    this.worldDistance = 0; // Pixels traveled
    this.playerScreenX = 220; // Player stays around left third

    // Skater renderer instance
    this.playerSkater = null;

    // Parallax background scroll offsets
    this.bgSkylineX = 0;
    this.bgStreetX = 0;
    this.bgRoadX = 0;

    // Lifelines & 1-Minute Race Timer
    this.lifelines = 2;
    this.maxLifelines = 2;
    this.raceTimeLimit = 60.0;
    this.raceElapsedTime = 0;
    this.raceTimeRemaining = 60.0;
    this.difficulty = 1.0;
    this.finalRushAnnounced = false;
    this.remoteRacers = new Map();

    // HUD Elements
    this._initHUDElements();
  }

  _initHUDElements() {
    this.hudView = document.getElementById('racing-hud-view');
    this.distanceEl = document.getElementById('race-stat-distance');
    this.scoreEl = document.getElementById('race-stat-score');
    this.comboEl = document.getElementById('race-stat-combo');
    this.speedEl = document.getElementById('race-stat-speed');
    this.lifelinesEl = document.getElementById('race-stat-lifelines');
    this.timerEl = document.getElementById('race-stat-timer');
    this.checkpointBanner = document.getElementById('race-checkpoint-banner');
    this.rushBanner = document.getElementById('race-rush-banner');
    this.surpriseBanner = document.getElementById('race-surprise-banner');
    this.surpriseTitle = document.getElementById('surprise-banner-title');
    this.surpriseSubtitle = document.getElementById('surprise-banner-subtitle');
    
    // Pause Modal
    this.pauseModal = document.getElementById('race-pause-modal');
    this.btnResume = document.getElementById('btn-race-resume');
    this.btnRestart = document.getElementById('btn-race-restart');
    this.btnExitToLobby = document.getElementById('btn-race-exit-lobby');
    this.btnSimulateDisconnect = document.getElementById('btn-test-disconnect');
    this.btnSimulateReconnect = document.getElementById('btn-test-reconnect');

    // Finish Modal
    this.finishModal = document.getElementById('race-finish-modal');
    this.finishRankEl = document.getElementById('finish-stat-rank');
    this.finishDistEl = document.getElementById('finish-stat-dist');
    this.finishScoreEl = document.getElementById('finish-stat-score');
    this.btnFinishLobby = document.getElementById('btn-finish-lobby');

    // Mobile On-Screen Buttons
    this.mobileJump = document.getElementById('btn-mobile-jump');
    this.mobileDuck = document.getElementById('btn-mobile-duck');
    this.mobileBoost = document.getElementById('btn-mobile-boost');

    // Event Bindings
    if (this.btnResume) {
      this.btnResume.addEventListener('click', () => {
        Sound.playClick();
        this.resume();
      });
    }

    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => {
        Sound.playClick();
        this.restart();
      });
    }

    if (this.btnExitToLobby) {
      this.btnExitToLobby.addEventListener('click', () => {
        Sound.playClick();
        this.exitToLobby();
      });
    }

    if (this.btnFinishLobby) {
      this.btnFinishLobby.addEventListener('click', () => {
        Sound.playClick();
        this.exitToLobby();
      });
    }

    // Testing buttons for disconnect resilience
    if (this.btnSimulateDisconnect) {
      this.btnSimulateDisconnect.addEventListener('click', () => {
        this.network.simulateDisconnect();
        this.leaderboard.setConnectionStatus('OFFLINE_SOLO');
      });
    }

    if (this.btnSimulateReconnect) {
      this.btnSimulateReconnect.addEventListener('click', () => {
        const snap = this.scoring.getSnapshot(this.raceId, this.localPlayerId, this.sessionId, this.courseSeed);
        this.network.simulateReconnect(snap);
      });
    }

    // Mobile touch controls
    if (this.mobileJump) {
      this.mobileJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.handleJump();
      });
    }

    if (this.mobileDuck) {
      this.mobileDuck.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.physics.duck(true);
      });
      this.mobileDuck.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.physics.duck(false);
      });
    }

    if (this.mobileBoost) {
      this.mobileBoost.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.handleBoostTrick();
      });
    }
  }

  /**
   * Start race lifecycle
   */
  start({ raceId, courseSeed = 7421, localPlayerId, localCustomization, players = {} }) {
    this.raceId = raceId || 'race_' + Math.floor(1000 + Math.random() * 9000);
    this.courseSeed = courseSeed;
    this.localPlayerId = localPlayerId || 'local_racer';
    this.worldDistance = 0;
    this.isActive = true;
    this.isPaused = false;

    // Reset lifelines, timers and difficulty
    this.lifelines = 2;
    this.raceTimeLimit = 60.0;
    this.raceElapsedTime = 0;
    this.raceTimeRemaining = 60.0;
    this.difficulty = 1.0;
    this.finalRushAnnounced = false;
    this.remoteRacers.clear();
    this._updateLifelinesUI();

    // Reset submodules
    this.physics.reset();
    this.obstacles.reset(this.courseSeed);
    this.surpriseEvents.reset();
    this.collectibles.reset(this.courseSeed);
    this.scoring.reset();

    // Check for offline recovery data
    const savedRecovery = this.recovery.loadRecovery(this.raceId);
    if (savedRecovery && savedRecovery.distance > 0) {
      console.log('[RacingController] Restoring offline race recovery snapshot:', savedRecovery);
      this.worldDistance = savedRecovery.distance / this.scoring.distancePerPixel;
      this.scoring.distance = savedRecovery.distance;
      this.scoring.score = savedRecovery.score;
      this.scoring.currentCheckpoint = savedRecovery.checkpoint;
    }

    // Skater instance from customization
    this.playerSkater = new Skater({
      id: this.localPlayerId,
      name: (localCustomization && localCustomization.name) || 'YOU',
      ready: true,
      customization: localCustomization || {}
    }, true);
    this.playerSkater.normX = 0;
    this.playerSkater.normY = 0;
    this.playerSkater.facing = 1;

    // Leaderboard setup
    this.leaderboard.setLocalPlayerId(this.localPlayerId);
    this.leaderboard.setConnectionStatus('CONNECTED');
    this.leaderboard.updatePlayer(this.localPlayerId, {
      name: localCustomization.name || 'YOU',
      distance: 0,
      score: 0,
      color: localCustomization.paintColor || '#8CFF57',
      isLocal: true
    });

    // Seed other players into leaderboard & remoteRacers collection
    for (const [id, p] of Object.entries(players)) {
      if (id !== this.localPlayerId) {
        this.leaderboard.updatePlayer(id, {
          name: p.name,
          color: p.customization ? p.customization.paintColor : '#35D7FF',
          distance: 0,
          score: 0,
          isMock: Boolean(p.isMock)
        });

        const oppSkater = new Skater({
          id,
          name: p.name || 'SKATER',
          ready: true,
          customization: p.customization || {}
        }, false);
        oppSkater.normX = 0;
        oppSkater.normY = 0;
        oppSkater.facing = 1;

        this.remoteRacers.set(id, {
          playerId: id,
          name: p.name || 'SKATER',
          color: (p.customization && p.customization.paintColor) || '#35D7FF',
          distance: 0,
          speed: 0,
          score: 0,
          skater: oppSkater
        });
      }
    }

    // Start network syncing
    this.network.start(
      this.raceId,
      this.localPlayerId,
      (remoteData) => {
        this.leaderboard.updatePlayer(remoteData.playerId, remoteData);
        let opp = this.remoteRacers.get(remoteData.playerId);
        if (!opp) {
          const oppSkater = new Skater({
            id: remoteData.playerId,
            name: remoteData.name || 'SKATER',
            customization: remoteData.customization || {}
          }, false);
          opp = {
            playerId: remoteData.playerId,
            name: remoteData.name || 'SKATER',
            color: remoteData.color || '#35D7FF',
            distance: remoteData.distance || 0,
            speed: remoteData.speed || 0,
            score: remoteData.score || 0,
            skater: oppSkater
          };
          this.remoteRacers.set(remoteData.playerId, opp);
        }
        opp.distance = Number(remoteData.distance) || 0;
        opp.speed = Number(remoteData.speed) || 0;
        opp.score = Number(remoteData.score) || 0;
        if (remoteData.name) opp.name = remoteData.name;
        if (remoteData.color) opp.color = remoteData.color;
      },
      (connStatus) => {
        this.leaderboard.setConnectionStatus(connStatus);
      }
    );

    // Show HUD
    if (this.hudView) this.hudView.classList.remove('hidden');
    if (this.pauseModal) this.pauseModal.classList.add('hidden');
    if (this.finishModal) this.finishModal.classList.add('hidden');

    Sound.playCountdownBeep(true);
  }

  handleJump() {
    if (!this.isActive || this.isPaused) return;
    const jumped = this.physics.jump();
    if (jumped) {
      Sound.playOlliePop();
      if (this.playerSkater) {
        this.playerSkater.ollie();
        this.playerSkater.jumpY = 0; // Physics.y is sole vertical displacement authority
      }
    }
  }

  handleDuck(isDucking) {
    if (!this.isActive || this.isPaused) return;
    this.physics.duck(isDucking);
  }

  handleBoostTrick() {
    if (!this.isActive || this.isPaused) return;
    if (this.physics.onGround) {
      // Ground push speed burst
      this.physics.applyBoost(3.0, 1.45);
      Sound.playReadyBeep(true);
    } else {
      // Mid-air 360 kickflip trick!
      const tricked = this.playerSkater ? this.playerSkater.kickflip() : false;
      if (tricked) {
        this.scoring.addTrick('kickflip', 180);
      }
    }
  }

  handleTrick() {
    this.handleBoostTrick();
  }

  togglePause() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  pause() {
    if (!this.isActive) return;
    this.isPaused = true;
    if (this.pauseModal) this.pauseModal.classList.remove('hidden');
  }

  resume() {
    this.isPaused = false;
    if (this.pauseModal) this.pauseModal.classList.add('hidden');
  }

  restart() {
    this.start({
      raceId: this.raceId,
      courseSeed: this.courseSeed,
      localPlayerId: this.localPlayerId,
      localCustomization: this.playerSkater.customization
    });
  }

  finishRace(reason = 'finish') {
    this.isActive = false;
    this.leaderboard.setConnectionStatus('FINISHED');
    this.network.stop();

    const finalRank = this.leaderboard.getLocalRank();
    const finalDist = Math.round(this.scoring.distance);
    const finalScore = this.scoring.score;

    const titleEl = document.getElementById('finish-modal-title');
    if (titleEl) {
      if (reason === 'out_of_lives') {
        titleEl.textContent = '💥 WIPEOUT! OUT OF LIFELINES!';
        titleEl.style.color = '#FF007F';
      } else if (reason === 'time_limit') {
        titleEl.textContent = '⏱️ TIME UP! 1-MINUTE SPRINT!';
        titleEl.style.color = '#FFE600';
      } else {
        titleEl.textContent = '🏁 RACE FINISHED!';
        titleEl.style.color = '#39FF14';
      }
    }

    if (this.finishRankEl) this.finishRankEl.textContent = `#${finalRank}`;
    if (this.finishDistEl) this.finishDistEl.textContent = `${finalDist} m`;
    if (this.finishScoreEl) this.finishScoreEl.textContent = `${finalScore} pts`;

    if (this.finishModal) this.finishModal.classList.remove('hidden');
    Sound.playReadyBeep(true);
  }

  exitToLobby() {
    this.isActive = false;
    this.isPaused = false;
    this.network.stop();
    this.recovery.clearRecovery();

    if (this.hudView) this.hudView.classList.add('hidden');
    if (this.pauseModal) this.pauseModal.classList.add('hidden');
    if (this.finishModal) this.finishModal.classList.add('hidden');

    if (this.onReturnToLobby) {
      this.onReturnToLobby();
    }
  }

  stop() {
    this.isActive = false;
    this.isPaused = false;
    this.network.stop();
    if (this.hudView) this.hudView.classList.add('hidden');
    if (this.pauseModal) this.pauseModal.classList.add('hidden');
    if (this.finishModal) this.finishModal.classList.add('hidden');
  }

  /**
   * Main game loop step
   */
  update(dt, viewportWidth, viewportHeight) {
    if (!this.isActive || this.isPaused) return;

    // 1-Minute Race Timer (60 seconds)
    this.raceElapsedTime += dt;
    this.raceTimeRemaining = Math.max(0, this.raceTimeLimit - this.raceElapsedTime);

    // Difficulty escalation: speed & obstacle frequency ramp up after 35 seconds
    if (this.raceElapsedTime > 35) {
      const rushTime = this.raceElapsedTime - 35; // 0 to 25s
      this.difficulty = 1.0 + (rushTime / 25.0) * 0.9;
      this.physics.baseSpeed = 380 * (1.0 + (rushTime / 25.0) * 0.32);

      if (!this.finalRushAnnounced) {
        this.finalRushAnnounced = true;
        this._showRushBanner();
      }
    } else {
      this.difficulty = 1.0;
    }

    // Check time limit
    if (this.raceTimeRemaining <= 0) {
      this.finishRace('time_limit');
      return;
    }

    // Check race finish distance condition (2500m)
    if (this.scoring.distance >= 2500) {
      this.finishRace('finish');
      return;
    }

    // Ground position relative to canvas
    const groundY = viewportHeight * 0.80;
    this.physics.groundY = groundY;

    // 1. Physics update
    this.physics.update(dt);
    const pixelsMoved = this.physics.speed * dt;
    this.worldDistance += pixelsMoved;

    // 2. Parallax background offsets
    this.bgSkylineX = (this.bgSkylineX + pixelsMoved * 0.12) % viewportWidth;
    this.bgStreetX = (this.bgStreetX + pixelsMoved * 0.45) % viewportWidth;
    this.bgRoadX = (this.bgRoadX + pixelsMoved * 1.0) % 200;

    // 3. Obstacle & Collectible Spawning (with dynamic difficulty)
    this.obstacles.update(this.worldDistance, viewportWidth, this.difficulty);
    this.collectibles.update(this.worldDistance, viewportWidth);

    // 4. Surprise Events
    this.surpriseEvents.update(dt, this.physics.speed, 
      (event) => this._showSurpriseBanner(event),
      (event) => this._hideSurpriseBanner()
    );

    // 5. Scoring & Checkpoint Progress
    const progressRes = this.scoring.update(dt, pixelsMoved);
    if (progressRes.isCheckpoint) {
      this._showCheckpointBanner(progressRes.checkpointNumber);
      Sound.playReadyBeep(true);
    }

    // 6. Collision testing
    const playerHitbox = this.physics.getHitbox(this.playerScreenX);

    // Test Obstacles
    for (const obs of this.obstacles.getActiveObstacles()) {
      obs.update(dt, this.physics.speed);
      const screenX = obs.worldX - this.worldDistance + this.playerScreenX;
      const obsHitbox = obs.getHitbox(groundY, screenX);

      // Check jump-over / avoid bonus
      if (!obs.passed && obsHitbox.x + obsHitbox.width < playerHitbox.x) {
        obs.passed = true;
        this.scoring.addAvoidedObstacle(obs);
      }

      // Check collision
      if (!obs.hit && RacingPhysics.checkCollision(playerHitbox, obsHitbox)) {
        if (obs.isRamp) {
          // Launch into high air!
          this.physics.vy = -980;
          this.physics.onGround = false;
          this.physics.isJumping = true;
          this.scoring.addScore(150, 'ramp_launch');
          Sound.playOlliePop();
        } else if (obs.isRail) {
          // Snap onto rail grind!
          this.physics.isGrinding = true;
          if (this.playerSkater) this.playerSkater.isGrinding = true;
          this.scoring.addScore(200, 'rail_grind');
          Sound.startGrindSound();
        } else {
          // Interactive check 1: Bow down / duck under overhead obstacle
          if (obs.requiresDuck && this.physics.isDucking) {
            this.scoring.addScore(120, 'duck_dodge');
            continue;
          }

          // Interactive check 2: Jump over ground obstacle
          if (!obs.requiresDuck && this.physics.isJumping && (this.physics.y < groundY - 20 || playerHitbox.y + playerHitbox.height <= obsHitbox.y + obsHitbox.height * 0.75)) {
            this.scoring.addScore(100, 'jump_clear');
            continue;
          }

          // Hit street obstacle
          obs.hit = true;
          const knocked = this.physics.applyKnockback();
          if (knocked) {
            this.scoring.resetComboOnHit();
            Sound.playLandSound();

            // Diminish 1 lifeline
            this.lifelines = Math.max(0, this.lifelines - 1);
            this._updateLifelinesUI();

            if (this.lifelines <= 0) {
              this.finishRace('out_of_lives');
              return;
            }
          }
        }
      }
    }

    // Test Collectibles
    for (const item of this.collectibles.getActiveCollectibles()) {
      item.update(dt);
      if (!item.collected) {
        const itemHitbox = item.getHitbox(groundY);
        if (RacingPhysics.checkCollision(playerHitbox, itemHitbox)) {
          item.collected = true;
          this.scoring.addCollectible(item);
          Sound.playClick(1.4);
        }
      }
    }

    // 7. Update Skater Visuals
    if (this.playerSkater) {
      this.playerSkater.update(dt);
      this.playerSkater.jumpY = 0; // Sole vertical displacement authority is physics.y
      this.playerSkater.isRolling = true;
    }

    // 8. Update Leaderboard & Telemetry
    this.leaderboard.updatePlayer(this.localPlayerId, {
      distance: Math.round(this.scoring.distance),
      score: this.scoring.score
    });

    const snapshot = this.scoring.getSnapshot(this.raceId, this.localPlayerId, this.sessionId, this.courseSeed);
    snapshot.name = (this.playerSkater && this.playerSkater.name) || 'YOU';
    snapshot.color = (this.playerSkater && this.playerSkater.customization && this.playerSkater.customization.paintColor) || '#8CFF57';
    snapshot.customization = (this.playerSkater && this.playerSkater.customization) || {};
    snapshot.speed = Math.round(this.physics.speed);
    this.network.sendProgress(snapshot);

    // Save checkpoint snapshot periodically to LocalStorage
    if (Date.now() - this.recovery.lastSavedTime > 3000) {
      this.recovery.saveCheckpoint(snapshot);
    }

    // 9. Update UI Counters
    this._updateHUDStats();
  }

  _updateHUDStats() {
    if (this.distanceEl) this.distanceEl.textContent = `${Math.round(this.scoring.distance)} m`;
    if (this.scoreEl) this.scoreEl.textContent = `${this.scoring.score} pts`;
    if (this.comboEl) {
      this.comboEl.textContent = `x${this.scoring.combo}`;
      this.comboEl.className = `stat-combo-tag combo-${this.scoring.combo}`;
    }
    if (this.speedEl) {
      const kmh = Math.round(this.physics.speed * 0.08);
      this.speedEl.textContent = `${kmh} km/h`;
    }
    if (this.timerEl) {
      const totalSec = Math.ceil(this.raceTimeRemaining);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      this.timerEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      if (totalSec <= 15) {
        this.timerEl.style.color = '#FF007F';
        this.timerEl.style.textShadow = '0 0 10px #FF007F';
      } else {
        this.timerEl.style.color = '#FFE600';
        this.timerEl.style.textShadow = 'none';
      }
    }
  }

  _updateLifelinesUI() {
    if (!this.lifelinesEl) return;
    if (this.lifelines === 2) {
      this.lifelinesEl.textContent = '🛹 🛹';
      this.lifelinesEl.style.filter = 'drop-shadow(0 0 6px #39ff14)';
    } else if (this.lifelines === 1) {
      this.lifelinesEl.textContent = '🛹 ❌';
      this.lifelinesEl.style.filter = 'drop-shadow(0 0 6px #ffe600)';
      Sound.playCountdownBeep(false);
    } else {
      this.lifelinesEl.textContent = '❌ ❌';
      this.lifelinesEl.style.filter = 'drop-shadow(0 0 8px #ff007f)';
    }
  }

  _showRushBanner() {
    if (!this.rushBanner) return;
    this.rushBanner.classList.remove('hidden');
    Sound.playReadyBeep(true);
    setTimeout(() => {
      if (this.rushBanner) this.rushBanner.classList.add('hidden');
    }, 3500);
  }

  _showCheckpointBanner(num) {
    if (!this.checkpointBanner) return;
    this.checkpointBanner.textContent = `🚩 CHECKPOINT ${num} REACHED! (+${num * 500} PTS)`;
    this.checkpointBanner.classList.remove('hidden');
    this.checkpointBanner.classList.add('show');
    setTimeout(() => {
      this.checkpointBanner.classList.remove('show');
      setTimeout(() => this.checkpointBanner.classList.add('hidden'), 300);
    }, 2400);
  }

  _showSurpriseBanner(event) {
    if (!this.surpriseBanner || !this.surpriseTitle) return;
    this.surpriseTitle.textContent = event.title;
    if (this.surpriseSubtitle) this.surpriseSubtitle.textContent = event.subtitle;
    this.surpriseBanner.classList.remove('hidden');
  }

  _hideSurpriseBanner() {
    if (this.surpriseBanner) this.surpriseBanner.classList.add('hidden');
  }

  /**
   * Main render pass for the 2D racing world
   */
  render(width, height) {
    const ctx = this.ctx;
    const groundY = height * 0.80;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // 1. LAYER 1: DUSK SKY & DISTANT ROOFTOPS (0.12x parallax)
    this._renderSkylineParallax(ctx, width, height, this.bgSkylineX);

    // 2. LAYER 2: STREETSCAPE BUILDINGS & GRAFFITI (0.45x parallax)
    this._renderStreetscapeParallax(ctx, width, groundY, this.bgStreetX);

    // 3. LAYER 3: ASPHALT ROAD & CURB (1.0x parallax)
    this._renderAsphaltRoad(ctx, width, groundY, height - groundY, this.bgRoadX);

    // 4. COLLECTIBLES
    for (const item of this.collectibles.getActiveCollectibles()) {
      const screenX = item.worldX - this.worldDistance + this.playerScreenX;
      if (screenX > -60 && screenX < width + 60) {
        item.render(ctx, screenX, groundY);
      }
    }

    // 5. OBSTACLES (Cars, Bins, Ramps, Rails, Cones)
    for (const obs of this.obstacles.getActiveObstacles()) {
      const screenX = obs.worldX - this.worldDistance + this.playerScreenX;
      if (screenX > -180 && screenX < width + 180) {
        obs.render(ctx, screenX, groundY);
      }
    }

    // 6. SURPRISE HUMOR EVENTS (Duck, Inflatable Dino, Tiny Dog)
    this.surpriseEvents.render(ctx, width, height, this.playerScreenX, groundY);

    // 6.5 OPPONENT RACERS (Fixture 2: Realtime opponents ahead, alongside, behind)
    this._renderOpponentRacers(ctx, groundY, width);

    // 7. PLAYER SKATER
    this._renderPlayerRacer(ctx, groundY);

    ctx.restore();
  }

  _renderSkylineParallax(ctx, width, height, offset) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.55);
    skyGrad.addColorStop(0, '#10121a');
    skyGrad.addColorStop(0.7, '#1d212d');
    skyGrad.addColorStop(1, '#2c2538');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height * 0.55);

    // Distant dark rooftop silhouettes (repeating across width)
    ctx.fillStyle = '#0f1118';
    const buildingW = 160;
    const count = Math.ceil(width / buildingW) + 2;

    for (let i = -1; i < count; i++) {
      const x = i * buildingW - (offset % buildingW);
      const bHeight = 90 + ((i * 37) % 70);
      ctx.fillRect(x, height * 0.45 - bHeight, buildingW - 8, bHeight + 40);

      // Antenna / Chimney
      ctx.fillRect(x + 20, height * 0.45 - bHeight - 18, 4, 18);
    }
  }

  _renderStreetscapeParallax(ctx, width, groundY, offset) {
    const wallH = 220;
    const topY = groundY - wallH;

    // Terraced brick facades (#A94335, #25272B)
    const facadeW = 280;
    const count = Math.ceil(width / facadeW) + 2;

    for (let i = -1; i < count; i++) {
      const x = i * facadeW - (offset % facadeW);

      // Building wall
      ctx.fillStyle = (i % 2 === 0) ? '#A94335' : '#8e3529';
      ctx.fillRect(x, topY, facadeW, wallH);

      // Windows
      ctx.fillStyle = '#1c1f26';
      ctx.fillRect(x + 30, topY + 40, 50, 60);
      ctx.fillRect(x + 120, topY + 40, 50, 60);
      ctx.fillRect(x + 200, topY + 40, 50, 60);

      // Window frames & yellow glow
      ctx.fillStyle = '#ffe600';
      ctx.fillRect(x + 35, topY + 45, 18, 22);
      ctx.fillRect(x + 205, topY + 45, 18, 22);

      // Graffiti Tag on building
      ctx.font = '900 24px "Rubik Dirt", sans-serif';
      ctx.fillStyle = '#8CFF57';
      ctx.fillText('ALLEY RAT', x + 40, topY + 160);
    }
  }

  _renderAsphaltRoad(ctx, width, topY, height, offset) {
    // 1. Concrete curb (#B8B2A8)
    ctx.fillStyle = '#B8B2A8';
    ctx.fillRect(0, topY - 14, width, 14);

    // Curb wear lines (#FF8A3D)
    ctx.fillStyle = '#FF8A3D';
    for (let cx = -(offset % 60); cx < width; cx += 60) {
      ctx.fillRect(cx, topY - 14, 32, 14);
    }

    // 2. Asphalt Road Surface (#25272B)
    const roadGrad = ctx.createLinearGradient(0, topY, 0, topY + height);
    roadGrad.addColorStop(0, '#2d3138');
    roadGrad.addColorStop(0.35, '#25272B');
    roadGrad.addColorStop(1, '#17181c');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, topY, width, height);

    // 3. Dashed Highway Centerline (#ffe600)
    ctx.fillStyle = '#ffe600';
    const dashW = 70;
    const gap = 50;
    const stride = dashW + gap;

    for (let dx = -(offset % stride); dx < width; dx += stride) {
      ctx.fillRect(dx, topY + 42, dashW, 8);
    }
  }

  /**
   * Fixture 2: Render realtime opponent skater avatars and visual indicators
   * (Ahead, alongside, or behind with exact meter delta tags)
   */
  _renderOpponentRacers(ctx, groundY, width) {
    if (!this.remoteRacers || this.remoteRacers.size === 0) return;

    const myDistance = this.scoring.distance;

    for (const [id, opp] of this.remoteRacers.entries()) {
      if (!opp) continue;
      if (opp.currentDistance === undefined) opp.currentDistance = Number(opp.distance) || 0;
      opp.currentDistance += ((Number(opp.distance) || 0) - opp.currentDistance) * 0.25;

      const oppDistance = opp.currentDistance;
      const deltaMeters = oppDistance - myDistance;
      const deltaScreenX = deltaMeters / this.scoring.distancePerPixel;
      const oppScreenX = this.playerScreenX + deltaScreenX;
      const oppName = opp.name || 'SKATER';

      // 1. If opponent is on-screen (or near edge), render skater avatar & overhead pill
      if (oppScreenX >= -70 && oppScreenX <= width + 70) {
        ctx.save();
        ctx.translate(oppScreenX, groundY);

        // Skater avatar
        if (opp.skater) {
          opp.skater.afk = Boolean(opp.afk);
          opp.skater.isRolling = true;
          opp.skater.render(ctx, 0, 0, false);
        }

        // Tag badge above opponent skater
        ctx.save();
        const tagY = -95;
        const deltaText = deltaMeters >= 0 
          ? `+${Math.round(deltaMeters)}m` 
          : `${Math.round(deltaMeters)}m`;
        const afkTag = opp.afk ? ' [AFK]' : '';
        const badgeText = `${oppName}${afkTag} [${deltaText}]`;

        ctx.font = '900 12px "Fredoka", sans-serif';
        const textWidth = ctx.measureText(badgeText).width;
        const boxW = textWidth + 18;
        const boxH = 22;

        // Badge background
        ctx.fillStyle = opp.afk ? 'rgba(40, 15, 15, 0.92)' : 'rgba(15, 17, 24, 0.88)';
        ctx.strokeStyle = opp.afk ? '#DC2626' : (deltaMeters >= 0 ? '#39FF14' : '#FF8A3D');
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(-boxW / 2, tagY - boxH / 2, boxW, boxH, 6);
        } else {
          ctx.rect(-boxW / 2, tagY - boxH / 2, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        // Pointer notch
        ctx.fillStyle = opp.afk ? '#DC2626' : (deltaMeters >= 0 ? '#39FF14' : '#FF8A3D');
        ctx.beginPath();
        ctx.moveTo(0, tagY + boxH / 2 + 5);
        ctx.lineTo(-4, tagY + boxH / 2);
        ctx.lineTo(4, tagY + boxH / 2);
        ctx.fill();

        // Text
        ctx.fillStyle = opp.afk ? '#FCA5A5' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, 0, tagY);

        ctx.restore();
        ctx.restore();
      } else {
        // 2. Opponent is OFF-SCREEN: Render edge indicator pills (Ahead or Behind)
        ctx.save();
        const isAhead = oppScreenX > width;
        const indicatorX = isAhead ? width - 85 : 85;
        const indicatorY = groundY - 110;
        const deltaText = isAhead 
          ? `+${Math.round(deltaMeters)}m ⏩` 
          : `⏪ ${Math.round(Math.abs(deltaMeters))}m`;
        const afkTag = opp.afk ? ' [AFK]' : '';
        const pillText = `${oppName}${afkTag} ${deltaText}`;

        ctx.font = '900 11px "Fredoka", sans-serif';
        const pWidth = ctx.measureText(pillText).width;
        const pBoxW = Math.max(90, pWidth + 14);
        const pBoxH = 22;

        ctx.fillStyle = isAhead ? 'rgba(0, 240, 255, 0.90)' : 'rgba(255, 0, 127, 0.90)';
        ctx.strokeStyle = '#10121A';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(indicatorX - pBoxW / 2, indicatorY - pBoxH / 2, pBoxW, pBoxH, 6);
        } else {
          ctx.rect(indicatorX - pBoxW / 2, indicatorY - pBoxH / 2, pBoxW, pBoxH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10121A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pillText, indicatorX, indicatorY);

        ctx.restore();
      }
    }
  }

  _renderPlayerRacer(ctx, groundY) {
    if (!this.playerSkater) return;

    ctx.save();
    // Position skater
    const playerX = this.playerScreenX;
    const playerY = this.physics.y;

    ctx.translate(playerX, playerY);

    // Invincible blink animation
    if (this.physics.isInvincible && Math.sin(Date.now() * 0.035) > 0) {
      ctx.globalAlpha = 0.45;
    }

    // Ducking scale
    if (this.physics.isDucking) {
      ctx.scale(1, 0.65);
    }

    // Boost flame / nitro trail
    if (this.physics.isBoosting) {
      ctx.fillStyle = '#35D7FF';
      ctx.beginPath();
      ctx.moveTo(-35, 10);
      ctx.lineTo(-75 - Math.random() * 25, 12);
      ctx.lineTo(-35, 16);
      ctx.fill();

      ctx.fillStyle = '#FF8A3D';
      ctx.beginPath();
      ctx.moveTo(-32, 11);
      ctx.lineTo(-55 - Math.random() * 15, 13);
      ctx.lineTo(-32, 15);
      ctx.fill();
    }

    // Render customized character
    this.playerSkater.render(ctx, 0, 0, false);

    ctx.restore();
  }
}
