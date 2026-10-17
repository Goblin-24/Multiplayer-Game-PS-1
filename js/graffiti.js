/**
 * ALLEY RATS: SKATE & SPRAY
 * Real-Time Graffiti Wall Engine & Offscreen Canvas Layer
 * Features:
 * - Persistent offscreen canvas for high-performance rendering
 * - Aerosol spray texture with soft cores and randomized edge splatters
 * - Realistic paint drip runs when spraying continuously in place
 * - Skate sticker stamper (King Rat, Skull Crossbones, Toxic, Anarchy, Flame)
 * - Network-ready stroke & sticker payload batching
 */

import { CONFIG } from './config.js';
import { Sound } from './audio.js';

export class GraffitiEngine {
  constructor(canvasWidth = CONFIG.virtualWidth, canvasHeight = CONFIG.virtualHeight) {
    this.width = canvasWidth;
    this.height = canvasHeight;

    // Dedicated offscreen canvas for persistent graffiti marks
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.width;
    this.offscreenCanvas.height = this.height;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: false });

    // Active stroke in progress
    this.isPainting = false;
    this.currentStroke = null;
    this.lastPoint = null;
    this.lastBroadcastTime = 0;

    // Drip accumulation tracking
    this.dwellTime = 0;
    this.dwellPoint = null;

    // Active strokes history
    this.strokes = [];

    // Wall starts clean for new rooms
  }

  resize(newWidth, newHeight) {
    if (newWidth === this.width && newHeight === this.height) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.offscreenCanvas, 0, 0);

    this.width = newWidth;
    this.height = newHeight;
    this.offscreenCanvas.width = newWidth;
    this.offscreenCanvas.height = newHeight;

    this.offscreenCtx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
  }

  _drawInitialStreetTags() {
    const ctx = this.offscreenCtx;
    ctx.save();

    // 1. "ALLEY RATS" vibrant colorful neon tag
    const grad = ctx.createLinearGradient(this.width * 0.14, 0, this.width * 0.35, 0);
    grad.addColorStop(0, '#39FF14');
    grad.addColorStop(0.35, '#00F0FF');
    grad.addColorStop(0.7, '#FF007F');
    grad.addColorStop(1, '#FFE600');

    ctx.font = '900 64px "Rubik Dirt", "Impact", sans-serif';
    ctx.fillStyle = '#0a0d14';
    ctx.fillText('ALLEY RATS', this.width * 0.14 + 3, this.height * 0.32 + 3);
    ctx.fillStyle = grad;
    ctx.fillText('ALLEY RATS', this.width * 0.14, this.height * 0.32);

    // 2. "SKATE OR DIE" stencil tag
    ctx.font = 'bold 36px "Permanent Marker", cursive, sans-serif';
    ctx.fillStyle = '#8CFF57';
    ctx.fillText('SKATE OR DIE', this.width * 0.62, this.height * 0.26);

    // 3. Stencil Rat silhouette
    ctx.fillStyle = '#25272B';
    ctx.beginPath();
    ctx.arc(this.width * 0.48, this.height * 0.42, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.width * 0.48 - 18, this.height * 0.42 - 16, 11, 0, Math.PI * 2);
    ctx.arc(this.width * 0.48 + 18, this.height * 0.42 - 16, 11, 0, Math.PI * 2);
    ctx.fill();

    // 4. Initial paint drips
    ctx.fillStyle = '#ff007f';
    [0.15, 0.22, 0.31, 0.65, 0.72].forEach((rx) => {
      ctx.beginPath();
      ctx.roundRect(this.width * rx, this.height * 0.32, 6, 35 + (rx * 100) % 40, 3);
      ctx.fill();
    });

    ctx.restore();
  }

  isWithinWall(normX, normY) {
    const b = CONFIG.wallBounds;
    return normX >= b.minX && normX <= b.maxX && normY >= b.minY && normY <= b.maxY;
  }

  /**
   * Stamp a skate sticker on the wall
   */
  stampSticker(normX, normY, stickerId = 'rat_crown', clientId = 'local', onBatchCallback = null) {
    if (!this.isWithinWall(normX, normY)) return false;

    const px = normX * this.width;
    const py = normY * this.height;

    this._drawSticker(px, py, stickerId);
    Sound.playStickerSlap();

    const payload = {
      type: 'sticker',
      stickerId,
      clientId,
      x: normX,
      y: normY
    };

    this.strokes.push(payload);
    if (onBatchCallback) {
      onBatchCallback(payload, true);
    }
    return true;
  }

  _drawSticker(px, py, stickerId) {
    const ctx = this.offscreenCtx;
    ctx.save();
    ctx.translate(px, py);
    // Slight random sticker tilt
    ctx.rotate((Math.random() - 0.5) * 0.2);

    const size = 46;
    // Sticker paper backing & border
    ctx.fillStyle = '#F3E8D0';
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-size / 2, -size / 2, size, size, 8);
    ctx.fill();
    ctx.stroke();

    // Sticker graphic
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '26px sans-serif';

    if (stickerId === 'skull_cross') {
      ctx.fillText('💀', 0, 0);
    } else if (stickerId === 'toxic_ooze') {
      ctx.fillText('☣️', 0, 0);
    } else if (stickerId === 'anarchy') {
      ctx.fillText('⭐', 0, 0);
    } else if (stickerId === 'fire_flame') {
      ctx.fillText('🔥', 0, 0);
    } else {
      ctx.fillText('👑', 0, 0);
    }

    ctx.restore();
  }

  /**
   * Start painting stroke
   */
  startStroke(normX, normY, color, size, clientId, onBatchCallback) {
    if (!this.isWithinWall(normX, normY)) return false;

    this.isPainting = true;
    const strokeId = 'stroke_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    this.currentStroke = {
      type: 'stroke',
      strokeId,
      clientId,
      color,
      size,
      points: [{ x: normX, y: normY }]
    };

    this.lastPoint = { x: normX * this.width, y: normY * this.height };
    this.dwellPoint = { x: normX * this.width, y: normY * this.height };
    this.dwellTime = 0;
    this.lastBroadcastTime = performance.now();

    Sound.startSprayHiss();
    this._renderSprayPoint(this.lastPoint.x, this.lastPoint.y, color, size);

    if (onBatchCallback) {
      onBatchCallback(this.currentStroke, false);
    }
    return true;
  }

  /**
   * Add point & handle drip accumulation
   */
  addStrokePoint(normX, normY, onBatchCallback) {
    if (!this.isPainting || !this.currentStroke) return;

    const clampedX = Math.max(CONFIG.wallBounds.minX, Math.min(CONFIG.wallBounds.maxX, normX));
    const clampedY = Math.max(CONFIG.wallBounds.minY, Math.min(CONFIG.wallBounds.maxY, normY));

    const curPx = { x: clampedX * this.width, y: clampedY * this.height };
    this.currentStroke.points.push({ x: clampedX, y: clampedY });

    if (this.lastPoint) {
      this._renderSpraySegment(
        this.lastPoint.x,
        this.lastPoint.y,
        curPx.x,
        curPx.y,
        this.currentStroke.color,
        this.currentStroke.size
      );

      // Check if dwelling in one spot -> create paint drip!
      const dist = Math.hypot(curPx.x - this.dwellPoint.x, curPx.y - this.dwellPoint.y);
      if (dist < 12) {
        this.dwellTime += 0.05;
        if (this.dwellTime >= 0.35) {
          this._createPaintDrip(curPx.x, curPx.y, this.currentStroke.color, this.currentStroke.size);
          this.dwellTime = 0;
        }
      } else {
        this.dwellPoint = curPx;
        this.dwellTime = 0;
      }
    }
    this.lastPoint = curPx;

    const now = performance.now();
    if (now - this.lastBroadcastTime >= CONFIG.paintUpdateInterval) {
      this.lastBroadcastTime = now;
      if (onBatchCallback) {
        onBatchCallback(this.currentStroke, false);
      }
    }
  }

  _createPaintDrip(x, y, color, size) {
    const ctx = this.offscreenCtx;
    ctx.save();
    ctx.fillStyle = color;
    const dripLen = size * (2 + Math.random() * 3.5);
    const dripWidth = Math.max(2.5, size * 0.35);

    ctx.beginPath();
    ctx.roundRect(x - dripWidth / 2, y, dripWidth, dripLen, dripWidth / 2);
    ctx.fill();

    // Drip bulb tear at bottom
    ctx.beginPath();
    ctx.arc(x, y + dripLen, dripWidth * 1.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  endStroke(onBatchCallback) {
    if (!this.isPainting || !this.currentStroke) return;

    Sound.stopSprayHiss();
    this.strokes.push(this.currentStroke);

    if (onBatchCallback) {
      onBatchCallback(this.currentStroke, true);
    }

    this.isPainting = false;
    this.currentStroke = null;
    this.lastPoint = null;
  }

  renderRemoteStroke(stroke) {
    if (!stroke) return;

    if (stroke.type === 'sticker') {
      const px = stroke.x * this.width;
      const py = stroke.y * this.height;
      this._drawSticker(px, py, stroke.stickerId);
      this.strokes.push(stroke);
      return;
    }

    if (!stroke.points || stroke.points.length === 0) return;

    const { color, size, points } = stroke;
    let prevPx = { x: points[0].x * this.width, y: points[0].y * this.height };

    this._renderSprayPoint(prevPx.x, prevPx.y, color, size);

    for (let i = 1; i < points.length; i++) {
      const curPx = { x: points[i].x * this.width, y: points[i].y * this.height };
      this._renderSpraySegment(prevPx.x, prevPx.y, curPx.x, curPx.y, color, size);
      prevPx = curPx;
    }

    this.strokes.push(stroke);
  }

  _renderSprayPoint(x, y, color, size) {
    const ctx = this.offscreenCtx;
    ctx.save();

    const radGrad = ctx.createRadialGradient(x, y, 0, x, y, size);
    radGrad.addColorStop(0, color);
    radGrad.addColorStop(0.65, color);
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    const splatterCount = Math.floor(size * 0.9);
    ctx.fillStyle = color;
    for (let i = 0; i < splatterCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = size * (0.8 + Math.random() * 0.75);
      const dotX = x + Math.cos(angle) * dist;
      const dotY = y + Math.sin(angle) * dist;
      const dotRadius = 0.8 + Math.random() * 1.6;

      ctx.beginPath();
      ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _renderSpraySegment(x1, y1, x2, y2, color, size) {
    const ctx = this.offscreenCtx;
    ctx.save();

    ctx.lineWidth = size * 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.floor(dist / 6));
    ctx.fillStyle = color;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * (size * 1.4);
      const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * (size * 1.4);
      const dotRadius = 0.6 + Math.random() * 1.6;

      ctx.beginPath();
      ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  clear() {
    this.offscreenCtx.clearRect(0, 0, this.width, this.height);
    this.strokes = [];
  }

  draw(ctx, destWidth, destHeight) {
    ctx.drawImage(this.offscreenCanvas, 0, 0, destWidth, destHeight);
  }
}
