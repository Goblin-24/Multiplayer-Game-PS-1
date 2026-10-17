/**
 * ALLEY RATS: SKATE & SPRAY
 * Racing Network Adapter & Remote Progress Synchronizer
 * Handles:
 * - Throttled local race progress broadcast (every 300ms or on checkpoint)
 * - Remote racer progress reception
 * - Mock mode simulation of bot racer progress
 * - Disconnect detection and offline continuation
 */

export class RacingNetwork {
  constructor(networkManager, recoveryManager) {
    this.networkManager = networkManager;
    this.recoveryManager = recoveryManager;
    this.lastBroadcastTime = 0;
    this.broadcastInterval = 80; // ms (smooth 12Hz realtime sync)
    this.isOnline = true;
    this.mockProgressInterval = null;
  }

  start(raceId, localPlayerId, onRemoteProgress, onConnectionChange) {
    this.raceId = raceId;
    this.localPlayerId = localPlayerId;
    this.onRemoteProgress = onRemoteProgress;
    this.onConnectionChange = onConnectionChange;

    const adapter = this.networkManager.getAdapter();

    // Listen for remote race progress events
    if (adapter) {
      adapter.on('race_progress', (data) => {
        if (data.playerId !== this.localPlayerId && this.onRemoteProgress) {
          this.onRemoteProgress(data);
        }
      });

      adapter.on('player_leave', (playerId) => {
        if (this.onRemoteProgress) {
          this.onRemoteProgress({
            playerId: playerId,
            afk: true,
            status: 'afk'
          });
        }
      });

      adapter.on('players_updated', (players) => {
        if (players && typeof players === 'object') {
          for (const [id, p] of Object.entries(players)) {
            if (id !== this.localPlayerId && this.onRemoteProgress) {
              const isAfk = Boolean(p.afk || p.connected === false);
              this.onRemoteProgress({
                playerId: id,
                name: p.name,
                color: (p.customization && p.customization.paintColor) || '#35D7FF',
                afk: isAfk,
                status: isAfk ? 'afk' : undefined
              });
            }
          }
        }
      });

      adapter.on('disconnected', () => {
        this.isOnline = false;
        if (this.onConnectionChange) {
          this.onConnectionChange('OFFLINE_SOLO');
        }
      });

      adapter.on('connected', () => {
        this.isOnline = true;
        if (this.onConnectionChange) {
          this.onConnectionChange('CONNECTED');
        }
      });
    }

    // In Mock Mode: simulate realistic bot progress
    if (adapter && adapter.isMock) {
      this._startMockBotProgress();
    }
  }

  stop() {
    if (this.mockProgressInterval) {
      clearInterval(this.mockProgressInterval);
      this.mockProgressInterval = null;
    }
  }

  _startMockBotProgress() {
    let bot1Dist = 0;
    let bot1Score = 0;
    let bot2Dist = 0;
    let bot2Score = 0;

    this.mockProgressInterval = setInterval(() => {
      // Simulate bots skating forward at varying speeds
      bot1Dist += 18 + Math.random() * 12;
      bot1Score += Math.floor(10 + Math.random() * 25);

      bot2Dist += 16 + Math.random() * 14;
      bot2Score += Math.floor(8 + Math.random() * 30);

      if (this.onRemoteProgress) {
        this.onRemoteProgress({
          playerId: 'mock_bot_01',
          name: 'BRICKB0Y',
          color: '#35D7FF',
          distance: Math.round(bot1Dist),
          score: bot1Score,
          status: 'racing',
          isMock: true
        });

        this.onRemoteProgress({
          playerId: 'mock_bot_02',
          name: 'PIGEONSLAYER',
          color: '#ff007f',
          distance: Math.round(bot2Dist),
          score: bot2Score,
          status: 'racing',
          isMock: true
        });
      }
    }, 450);
  }

  /**
   * Broadcast local progress update (throttled)
   */
  sendProgress(snapshot, forceImmediate = false) {
    const now = performance.now();
    if (!forceImmediate && now - this.lastBroadcastTime < this.broadcastInterval) {
      return;
    }
    this.lastBroadcastTime = now;

    const adapter = this.networkManager.getAdapter();
    if (adapter && adapter.isConnected && typeof adapter.sendEvent === 'function') {
      adapter.sendEvent('race_progress', snapshot);
    }
  }

  /**
   * Simulate a disconnect for testing offline resilience
   */
  simulateDisconnect() {
    this.isOnline = false;
    if (this.onConnectionChange) {
      this.onConnectionChange('OFFLINE_SOLO');
    }
  }

  /**
   * Simulate reconnection & reconciliation
   */
  async simulateReconnect(localSnapshot) {
    this.isOnline = true;
    if (this.onConnectionChange) {
      this.onConnectionChange('RECONNECTING');
    }

    setTimeout(async () => {
      const adapter = this.networkManager.getAdapter();
      if (this.onConnectionChange) {
        this.onConnectionChange('SYNC_PENDING');
      }

      if (this.recoveryManager && adapter) {
        const res = await this.recoveryManager.reconcileWithServer(adapter, localSnapshot);
        if (res && res.accepted) {
          if (this.onConnectionChange) {
            this.onConnectionChange('SYNCED');
          }
          setTimeout(() => {
            if (this.isOnline && this.onConnectionChange) {
              this.onConnectionChange('CONNECTED');
            }
          }, 1500);
          return;
        }
      }

      setTimeout(() => {
        if (this.onConnectionChange) {
          this.onConnectionChange('SYNCED');
        }
      }, 800);
    }, 600);
  }
}
