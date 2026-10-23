/**
 * ALLEY RATS: SKATE & SPRAY
 * Live Racing Leaderboard & Connection Status HUD
 */

export class RacingLeaderboard {
  constructor(containerEl) {
    this.container = containerEl || document.getElementById('race-leaderboard-container');
    this.listEl = document.getElementById('race-leaderboard-list');
    this.statusBadgeEl = document.getElementById('race-connection-status');
    this.isCollapsed = false;
    this.players = new Map(); // id -> { name, distance, score, color, isLocal, status, rank }
    this.localPlayerId = null;

    this._bindCollapseToggle();
  }

  _bindCollapseToggle() {
    const toggleBtn = document.getElementById('btn-toggle-leaderboard');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.isCollapsed = !this.isCollapsed;
        if (this.container) {
          this.container.classList.toggle('collapsed', this.isCollapsed);
        }
      });
    }
  }

  setLocalPlayerId(id) {
    this.localPlayerId = id;
  }

  updatePlayer(id, data) {
    const existing = this.players.get(id) || {};
    const afk = Boolean(data.afk !== undefined ? data.afk : (data.connected === false || data.status === 'afk' || data.status === 'disconnected' || existing.afk));
    this.players.set(id, {
      id,
      name: data.name || existing.name || 'SKATER',
      distance: data.distance !== undefined ? Number(data.distance) : (existing.distance || 0),
      score: data.score !== undefined ? Number(data.score) : (existing.score || 0),
      color: data.color || existing.color || '#8CFF57',
      isLocal: Boolean(data.isLocal || id === this.localPlayerId),
      isMock: Boolean(data.isMock !== undefined ? data.isMock : existing.isMock),
      afk: afk,
      status: afk ? 'afk' : (data.status || existing.status || 'racing')
    });

    this.render();
  }

  removePlayer(id) {
    this.players.delete(id);
    this.render();
  }

  setConnectionStatus(status) {
    if (!this.statusBadgeEl) return;

    this.statusBadgeEl.className = 'status-badge-race';
    if (status === 'CONNECTED') {
      this.statusBadgeEl.textContent = '🟢 CONNECTED';
      this.statusBadgeEl.classList.add('status-connected');
    } else if (status === 'OFFLINE_SOLO') {
      this.statusBadgeEl.textContent = '🟡 OFFLINE — SOLO MODE';
      this.statusBadgeEl.classList.add('status-offline');
    } else if (status === 'SYNC_PENDING') {
      this.statusBadgeEl.textContent = '⏳ SYNC PENDING';
      this.statusBadgeEl.classList.add('status-syncing');
    } else if (status === 'SYNCED') {
      this.statusBadgeEl.textContent = '✅ PROGRESS SYNCED';
      this.statusBadgeEl.classList.add('status-synced');
    } else if (status === 'RECONNECTING') {
      this.statusBadgeEl.textContent = '🔄 RECONNECTING...';
      this.statusBadgeEl.classList.add('status-reconnecting');
    }
  }

  /**
   * Sort entries by distance (primary) and score (tiebreaker), then render
   */
  render() {
    if (!this.listEl) return;

    const sorted = Array.from(this.players.values()).sort((a, b) => {
      if (b.distance !== a.distance) {
        return b.distance - a.distance;
      }
      return b.score - a.score;
    });

    this.listEl.innerHTML = '';
    sorted.forEach((p, index) => {
      const rank = index + 1;
      const isMe = p.isLocal;
      const isAfk = Boolean(p.afk || p.status === 'afk' || p.status === 'disconnected');

      const row = document.createElement('div');
      row.className = `leaderboard-row ${isMe ? 'local-player-row' : ''} ${isAfk ? 'player-afk-row' : ''}`;

      let statusTag = '';
      if (isAfk) {
        statusTag = '<span class="badge-bot" style="background:#dc2626; color:#ffffff; font-weight:900; border-color:#991b1b; padding:1px 5px; border-radius:3px; margin-left:4px; font-size:10px;">AFK</span>';
      } else if (p.status === 'offline') {
        statusTag = '<span class="lb-status-offline">[SOLO]</span>';
      } else if (p.status === 'finished') {
        statusTag = '<span class="lb-status-finished">🏁 FINISHED</span>';
      }

      row.innerHTML = `
        <div class="lb-rank">#${rank}</div>
        <div class="lb-avatar-dot" style="background-color: ${isAfk ? '#dc2626' : p.color};"></div>
        <div class="lb-name-col">
          <span class="lb-name" style="${isAfk ? 'color:#f87171;' : ''}">${p.name}${isMe ? ' (YOU)' : ''}</span>
          ${statusTag}
        </div>
        <div class="lb-stats-col">
          <span class="lb-dist" style="${isAfk ? 'opacity:0.7;' : ''}">${Math.round(p.distance)}m</span>
          <span class="lb-score" style="${isAfk ? 'opacity:0.7;' : ''}">${p.score}pts</span>
        </div>
      `;

      this.listEl.appendChild(row);
    });
  }

  getLocalRank() {
    if (!this.localPlayerId) return 1;
    const sorted = Array.from(this.players.values()).sort((a, b) => {
      if (b.distance !== a.distance) return b.distance - a.distance;
      return b.score - a.score;
    });
    const idx = sorted.findIndex(p => p.id === this.localPlayerId);
    return idx >= 0 ? idx + 1 : 1;
  }
}
