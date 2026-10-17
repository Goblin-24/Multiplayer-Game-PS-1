/**
 * ALLEY RATS: SKATE & SPRAY
 * In-Canvas Multiplayer Cursors & Floating Name Tags
 */

import { CONFIG } from './config.js';

export class CursorManager {
  constructor() {
    // Local player cursor
    this.localCursor = {
      x: 0.5,
      y: 0.5,
      visible: false,
      isSpraying: false,
      cursorType: 'spray-can',
      color: '#39ff14',
      name: 'YOU'
    };

    // Remote players cursors: Map of clientId -> { x, y, targetX, targetY, cursorType, color, name, isSpraying, lastUpdate }
    this.remoteCursors = new Map();

    // Active spray mist particles emitted from cursor nozzle
    this.mistParticles = [];

    // Cursor throttling
    this.lastSentTime = 0;
  }

  setLocalCustomization(cust) {
    if (cust.cursorType) this.localCursor.cursorType = cust.cursorType;
    if (cust.paintColor) this.localCursor.color = cust.paintColor;
    if (cust.name) this.localCursor.name = cust.name;
  }

  updateLocalPosition(normX, normY, isSpraying = false, onBroadcastCallback = null) {
    this.localCursor.x = normX;
    this.localCursor.y = normY;
    this.localCursor.visible = true;
    this.localCursor.isSpraying = isSpraying;

    // Emit spray mist if spraying
    if (isSpraying) {
      this._spawnMistParticle(normX, normY, this.localCursor.color);
    }

    // Throttle network broadcast
    const now = performance.now();
    if (now - this.lastSentTime >= CONFIG.cursorUpdateInterval) {
      this.lastSentTime = now;
      if (onBroadcastCallback) {
        onBroadcastCallback(
          normX,
          normY,
          this.localCursor.cursorType,
          this.localCursor.color,
          this.localCursor.name
        );
      }
    }
  }

  setLocalVisible(visible) {
    this.localCursor.visible = visible;
  }

  updateRemoteCursor(data) {
    const { clientId, x, y, cursorType, color, name } = data;
    if (!clientId) return;

    if (!this.remoteCursors.has(clientId)) {
      this.remoteCursors.set(clientId, {
        x: x || 0.5,
        y: y || 0.5,
        targetX: x || 0.5,
        targetY: y || 0.5,
        cursorType: cursorType || 'spray-can',
        color: color || '#ffe600',
        name: name || 'SKATER',
        isSpraying: false,
        lastUpdate: performance.now()
      });
    } else {
      const cur = this.remoteCursors.get(clientId);
      cur.targetX = x;
      cur.targetY = y;
      if (cursorType) cur.cursorType = cursorType;
      if (color) cur.color = color;
      if (name) cur.name = name;
      cur.lastUpdate = performance.now();
    }
  }

  removeRemoteCursor(clientId) {
    this.remoteCursors.delete(clientId);
  }

  _spawnMistParticle(normX, normY, color) {
    for (let i = 0; i < 2; i++) {
      this.mistParticles.push({
        normX,
        normY,
        vx: (Math.random() - 0.5) * 0.003,
        vy: (Math.random() - 0.5) * 0.003,
        size: 3 + Math.random() * 4,
        color,
        alpha: 0.75,
        life: 0.35
      });
    }
  }

  update(dt = 0.016) {
    // Lerp remote cursors smoothly toward their target positions
    const now = performance.now();
    for (const [clientId, cur] of this.remoteCursors.entries()) {
      // Remove stale cursors if no update for 15s
      if (now - cur.lastUpdate > 15000) {
        this.remoteCursors.delete(clientId);
        continue;
      }
      cur.x += (cur.targetX - cur.x) * 0.35;
      cur.y += (cur.targetY - cur.y) * 0.35;
    }

    // Update mist particles
    for (let i = this.mistParticles.length - 1; i >= 0; i--) {
      const p = this.mistParticles[i];
      p.normX += p.vx;
      p.normY += p.vy;
      p.alpha -= dt * 2.8;
      p.size *= 0.95;
      if (p.alpha <= 0) {
        this.mistParticles.splice(i, 1);
      }
    }
  }

  render(ctx, width, height, showNameTags = true) {
    // 1. Draw spray mist particles
    for (const p of this.mistParticles) {
      const px = p.normX * width;
      const py = p.normY * height;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 2. Draw remote cursors
    for (const [, cur] of this.remoteCursors.entries()) {
      const px = cur.x * width;
      const py = cur.y * height;
      this._renderSingleCursor(ctx, px, py, cur.cursorType, cur.color, cur.name, showNameTags, width, height, false);
    }

    // 3. Draw local cursor (if inside canvas)
    if (this.localCursor.visible) {
      const px = this.localCursor.x * width;
      const py = this.localCursor.y * height;
      this._renderSingleCursor(
        ctx,
        px,
        py,
        this.localCursor.cursorType,
        this.localCursor.color,
        this.localCursor.name,
        showNameTags,
        width,
        height,
        true
      );
    }
  }

  _renderSingleCursor(ctx, x, y, cursorType, color, name, showNameTag, canvasWidth, canvasHeight, isLocal) {
    ctx.save();
    ctx.translate(x, y);

    // Render cursor visual according to type
    if (cursorType === 'spray-can') {
      this._renderCartoonSprayCan(ctx, color);
    } else if (cursorType === 'brush') {
      this._renderSkateBrush(ctx, color);
    } else if (cursorType === 'marker') {
      this._renderStreetMarker(ctx, color);
    } else if (cursorType === 'sticker') {
      this._renderStickerCursor(ctx);
    } else {
      this._renderPointerArrow(ctx, color);
    }

    ctx.restore();

    // Floating Name Tag positioned immediately above cursor
    if (showNameTag && name) {
      this._renderFloatingNameTag(ctx, x, y, name, color, canvasWidth, canvasHeight, isLocal);
    }
  }

  _renderCartoonSprayCan(ctx, color) {
    ctx.save();
    // Tilt spray can 30 degrees pointing nozzle at hotspot (0, 0)
    ctx.rotate(-Math.PI / 6);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#05070a';

    // Nozzle tip aligned with hotspot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-4, -4, 8, 8, 2);
    ctx.fill();
    ctx.stroke();

    // Nozzle tiny spray dot (in player's color)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // Metal collar dome
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(-9, 6);
    ctx.quadraticCurveTo(-7, 4, -4, 4);
    ctx.lineTo(4, 4);
    ctx.quadraticCurveTo(7, 4, 9, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Can Cylinder Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-10, 6, 20, 26, [2, 2, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Can Label / Stripe
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-10, 13, 20, 9);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RAT', 0, 20);

    // Can base lip
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-9, 31, 18, 3);
    ctx.strokeRect(-9, 31, 18, 3);

    ctx.restore();
  }

  _renderSkateBrush(ctx, color) {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#05070a';

    // Bristles at tip
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-4, 9);
    ctx.lineTo(4, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Metal ferrule
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-4, 9, 8, 5);
    ctx.strokeRect(-4, 9, 8, 5);

    // Wooden handle
    ctx.fillStyle = '#e0ac69';
    ctx.fillRect(-3, 14, 6, 18);
    ctx.strokeRect(-3, 14, 6, 18);

    ctx.restore();
  }

  _renderStreetMarker(ctx, color) {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#05070a';

    // Chisel tip
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3, 6);
    ctx.lineTo(3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Thick barrel
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-5, 5, 10, 24, 2);
    ctx.fill();
    ctx.stroke();

    // Accent ring
    ctx.fillStyle = color;
    ctx.fillRect(-5, 10, 10, 4);

    ctx.restore();
  }

  _renderPointerArrow(ctx, color) {
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#05070a';
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 19);
    ctx.lineTo(5, 14);
    ctx.lineTo(11, 23);
    ctx.lineTo(15, 21);
    ctx.lineTo(9, 12);
    ctx.lineTo(16, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderStickerCursor(ctx) {
    ctx.save();
    ctx.rotate(-0.1);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0a0d14';

    // Sticker square preview
    ctx.fillStyle = '#F3E8D0';
    ctx.beginPath();
    ctx.roundRect(-16, -16, 32, 32, 6);
    ctx.fill();
    ctx.stroke();

    // Stamped icon
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👑', 0, 0);

    ctx.restore();
  }

  _renderFloatingNameTag(ctx, x, y, name, color, canvasWidth, canvasHeight, isLocal) {
    ctx.save();

    // Text formatting
    const tagText = `[${name}]`;
    ctx.font = '900 11px "Outfit", sans-serif';
    const textWidth = ctx.measureText(tagText).width;
    const tagWidth = textWidth + 14;
    const tagHeight = 19;

    // Position tag 24px above cursor hotspot
    let tagX = x;
    let tagY = y - 26;

    // Clamp inside canvas boundary so name tags never clip or disappear
    const halfW = tagWidth / 2;
    if (tagX - halfW < 8) tagX = halfW + 8;
    if (tagX + halfW > canvasWidth - 8) tagX = canvasWidth - halfW - 8;
    if (tagY - tagHeight / 2 < 8) tagY = y + 36; // flip below cursor if too high

    ctx.translate(tagX, tagY);

    // Pill background with dark semi-transparent fill and player's neon border
    ctx.fillStyle = 'rgba(10, 13, 20, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = isLocal ? 2.2 : 1.6;

    ctx.beginPath();
    ctx.roundRect(-tagWidth / 2, -tagHeight / 2, tagWidth, tagHeight, 6);
    ctx.fill();
    ctx.stroke();

    // Mini spray dot inside tag
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(-tagWidth / 2 + 7, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Text label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, 3, 0);

    ctx.restore();
  }
}
