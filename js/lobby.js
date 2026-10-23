/**
 * ALLEY RATS: SKATE & SPRAY
 * Multiplayer Graffiti Lobby Controller, HUD & Player Roster
 */

import { CONFIG } from './config.js';
import { Sound } from './audio.js';

export class LobbyController {
  constructor(callbacks = {}) {
    this.onLeaveRoom = callbacks.onLeaveRoom || (() => {});
    this.onToggleReady = callbacks.onToggleReady || (() => {});
    this.onStartRace = callbacks.onStartRace || (() => {});
    this.onOpenSettings = callbacks.onOpenSettings || (() => {});
    this.onSprayColorChange = callbacks.onSprayColorChange || (() => {});
    this.onBrushSizeChange = callbacks.onBrushSizeChange || (() => {});
    this.onCursorTypeChange = callbacks.onCursorTypeChange || (() => {});
    this.onClearGraffiti = callbacks.onClearGraffiti || (() => {});

    this.container = document.getElementById('lobby-view');
    this.roomId = null;
    this.isLocalReady = false;
    this.isHost = false;
    this.isMockMode = false;
    this.players = {};

    this._initElements();
  }

  _initElements() {
    this.roomCodeDisplay = document.getElementById('lobby-room-code');
    this.playerCountDisplay = document.getElementById('lobby-player-count');
    this.btnCopyLink = document.getElementById('btn-lobby-copy-link');
    this.btnLeaveRoom = document.getElementById('btn-lobby-leave');
    this.btnSettings = document.getElementById('btn-lobby-settings');
    this.btnReady = document.getElementById('btn-lobby-ready');
    this.btnStartRace = document.getElementById('btn-lobby-start-race');
    this.rosterList = document.getElementById('roster-player-list');
    this.rosterStatusMsg = document.getElementById('roster-status-message');
    this.modeBadge = document.getElementById('lobby-mode-badge');

    this.toastEl = document.getElementById('lobby-toast');
    this.raceCountdownOverlay = document.getElementById('race-countdown-overlay');
    this.countdownNumber = document.getElementById('countdown-number');

    // Graffiti Toolbar Elements
    this.swatchContainer = document.getElementById('lobby-spray-swatches');
    this.sizeButtons = document.querySelectorAll('.brush-size-btn');
    this.toolButtons = document.querySelectorAll('.lobby-tool-btn');
    this.btnClearGraffiti = document.getElementById('btn-clear-graffiti');

    // Event listeners
    if (this.btnCopyLink) {
      this.btnCopyLink.addEventListener('click', () => {
        Sound.playClick();
        this.copyInviteLink();
      });
    }

    if (this.btnLeaveRoom) {
      this.btnLeaveRoom.addEventListener('click', () => {
        Sound.playClick(0.9);
        this.onLeaveRoom();
      });
    }

    if (this.btnSettings) {
      this.btnSettings.addEventListener('click', () => {
        Sound.playClick();
        this.onOpenSettings();
      });
    }

    if (this.btnReady) {
      this.btnReady.addEventListener('click', () => {
        this.isLocalReady = !this.isLocalReady;
        Sound.playReadyBeep(this.isLocalReady);
        this.updateReadyButtonUI();
        this.onToggleReady(this.isLocalReady);
      });
    }

    if (this.btnStartRace) {
      this.btnStartRace.addEventListener('click', () => {
        Sound.playClick(1.3);
        this.onStartRace();
      });
    }

    if (this.btnClearGraffiti) {
      this.btnClearGraffiti.addEventListener('click', () => {
        Sound.playClick();
        this.onClearGraffiti();
        this.showToast('Graffiti wall cleared!');
      });
    }

    // Build spray color swatches in toolbar
    this._buildToolbarSwatches();

    // Brush size selectors
    this.sizeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.playClick();
        this.sizeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const size = parseInt(btn.dataset.size, 10) || 12;
        this.onBrushSizeChange(size);
      });
    });

    // Tool selectors (spray-can, marker, brush)
    this.toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        Sound.playClick();
        this.toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool || 'spray-can';
        this.onCursorTypeChange(tool);
      });
    });
  }

  _buildToolbarSwatches() {
    if (!this.swatchContainer) return;
    this.swatchContainer.innerHTML = '';
    CONFIG.sprayPalette.forEach((c, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spray-toolbar-swatch' + (idx === 0 ? ' active' : '');
      btn.style.backgroundColor = c.hex;
      btn.title = c.name;
      btn.addEventListener('click', () => {
        Sound.playSprayCanRattle();
        this.swatchContainer.querySelectorAll('.spray-toolbar-swatch').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.onSprayColorChange(c.hex);
      });
      this.swatchContainer.appendChild(btn);
    });
  }

  setRoomInfo(roomId, isHost) {
    this.roomId = roomId;
    this.isHost = isHost;
    this.isMockMode = false;
    this.isLocalReady = false;

    if (this.roomCodeDisplay) {
      this.roomCodeDisplay.textContent = roomId;
    }

    if (this.modeBadge) {
      this.modeBadge.innerHTML = '🟢 ONLINE MULTIPLAYER';
      this.modeBadge.className = 'status-badge real-mode';
    }

    this.updateReadyButtonUI();
    this.updateHostControls();
  }

  updateReadyButtonUI() {
    if (!this.btnReady) return;
    if (this.isLocalReady) {
      this.btnReady.textContent = 'CANCEL READY';
      this.btnReady.className = 'btn-lobby-ready is-ready';
    } else {
      this.btnReady.textContent = 'READY UP!';
      this.btnReady.className = 'btn-lobby-ready not-ready';
    }
  }

  updatePlayers(players, localClientId) {
    this.players = players;
    const playerList = Object.values(players);
    const count = playerList.length;

    // Update count display
    if (this.playerCountDisplay) {
      this.playerCountDisplay.textContent = `${count}/${CONFIG.maxPlayers} SKATERS`;
    }

    // Determine if local player is host
    const localPlayer = players[localClientId];
    if (localPlayer) {
      this.isHost = Boolean(localPlayer.isHost);
      this.isLocalReady = Boolean(localPlayer.ready);
      this.updateReadyButtonUI();
    }

    // Render roster list
    if (this.rosterList) {
      this.rosterList.innerHTML = '';
      playerList.forEach(player => {
        const item = document.createElement('div');
        const isAfk = Boolean(player.afk || player.connected === false);
        const cust = player.customization || {};
        const isMe = Boolean(localPlayer && player.id === localPlayer.id);

        item.className = 'roster-item' + (isAfk ? ' player-afk' : (player.ready ? ' player-ready' : ''));

        item.innerHTML = `
          <div class="roster-avatar-box" style="border-color: ${isAfk ? '#dc2626' : (cust.paintColor || '#39ff14')}; background-color: ${cust.hoodieColor || '#7c3aed'}; opacity: ${isAfk ? '0.6' : '1'}">
            <span class="avatar-hat" style="color: ${cust.headwearColor || '#ff007f'}">🧢</span>
          </div>
          <div class="roster-info">
            <div class="roster-name-row">
              <span class="roster-player-name" style="${isAfk ? 'color:#f87171;' : ''}">${player.name || 'SKATER'}${isMe ? ' (YOU)' : ''}</span>
              ${player.isHost ? '<span class="badge-host">👑 HOST</span>' : ''}
              ${isAfk ? '<span class="badge-bot" style="background:#dc2626; color:#fff; font-weight:900; border-color:#991b1b;">AFK</span>' : ''}
            </div>
            <div class="roster-deck-tag">
              <span class="deck-swatch" style="background-color: ${cust.wheelColor || '#39ff14'}"></span>
              <span class="deck-name">${cust.deckGraphic || 'FLAME'} BOARD</span>
            </div>
          </div>
          <div class="roster-status-badge ${isAfk ? 'badge-not-ready' : (player.ready ? 'badge-ready' : 'badge-not-ready')}" style="${isAfk ? 'border-color:#dc2626; color:#dc2626; background:rgba(220,38,38,0.18);' : ''}">
            ${isAfk ? 'DISCONNECTED' : (player.ready ? 'READY' : 'NOT READY')}
          </div>
        `;
        this.rosterList.appendChild(item);
      });
    }

    // Update host controls & status message
    this.updateHostControls();
  }

  updateHostControls() {
    if (!this.btnStartRace) return;
    const playerList = Object.values(this.players);
    const count = playerList.length;
    const allReady = (count > 0) && playerList.every(p => p.ready);

    if (this.isHost) {
      this.btnStartRace.classList.remove('hidden');

      if (count <= 1) {
        // Solo test mode allowed with informative text
        this.btnStartRace.disabled = false;
        this.btnStartRace.title = 'Start Solo Practice Run';
        this.btnStartRace.textContent = 'SOLO PRACTICE RUN';
        if (this.rosterStatusMsg) {
          this.rosterStatusMsg.textContent = 'Solo mode: You can test the alley or wait for friends to join.';
        }
      } else if (allReady) {
        this.btnStartRace.disabled = false;
        this.btnStartRace.title = 'All skaters are ready! Start the race.';
        this.btnStartRace.textContent = '🏁 START RACE!';
        if (this.rosterStatusMsg) {
          this.rosterStatusMsg.textContent = '🔥 ALL SKATERS READY! Host can start the race.';
        }
      } else {
        this.btnStartRace.disabled = true;
        this.btnStartRace.title = 'Waiting for all skaters to click Ready Up.';
        this.btnStartRace.textContent = 'WAITING FOR READY...';
        const readyCount = playerList.filter(p => p.ready).length;
        if (this.rosterStatusMsg) {
          this.rosterStatusMsg.textContent = `Waiting for players to ready up (${readyCount}/${count} ready).`;
        }
      }
    } else {
      this.btnStartRace.classList.add('hidden');
      if (this.rosterStatusMsg) {
        if (allReady) {
          this.rosterStatusMsg.textContent = 'All skaters ready! Waiting for host to start.';
        } else {
          this.rosterStatusMsg.textContent = 'Waiting for all skaters to ready up.';
        }
      }
    }
  }

  triggerRaceCountdown(countdownSeconds = 3, onComplete = null) {
    if (!this.raceCountdownOverlay || !this.countdownNumber) return;

    this.raceCountdownOverlay.classList.remove('hidden');
    let current = countdownSeconds;
    this.countdownNumber.textContent = current;
    Sound.playCountdownBeep(false);

    const interval = setInterval(() => {
      current--;
      if (current > 0) {
        this.countdownNumber.textContent = current;
        Sound.playCountdownBeep(false);
      } else if (current === 0) {
        this.countdownNumber.textContent = 'SEND IT!';
        this.countdownNumber.style.color = '#39ff14';
        Sound.playCountdownBeep(true);
      } else {
        clearInterval(interval);
        setTimeout(() => {
          this.raceCountdownOverlay.classList.add('hidden');
          this.countdownNumber.style.color = '';
          if (onComplete) onComplete();
        }, 900);
      }
    }, 1000);
  }

  copyInviteLink() {
    if (!this.roomId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', this.roomId);
    const link = url.toString();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        this.showToast('✅ Invite Link Copied to Clipboard!');
      }).catch(() => {
        this._fallbackCopy(link);
      });
    } else {
      this._fallbackCopy(link);
    }
  }

  _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      this.showToast('✅ Invite Link Copied to Clipboard!');
    } catch {
      this.showToast(`Room Code: ${this.roomId}`);
    }
    document.body.removeChild(ta);
  }

  showToast(message, duration = 2800) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    this.toastEl.classList.add('show');

    setTimeout(() => {
      this.toastEl.classList.remove('show');
      setTimeout(() => this.toastEl.classList.add('hidden'), 300);
    }, duration);
  }

  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }
}
