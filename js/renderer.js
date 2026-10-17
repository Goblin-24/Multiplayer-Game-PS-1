/**
 * ALLEY RATS: SKATE & SPRAY
 * High-DPI Canvas Alley Scene & Environmental World Renderer
 * Features:
 * - UK/US urban brick alley with authentic weathered brickwork (#A94335, #25272B)
 * - Concrete sidewalk (#B8B2A8) and curb with grind rail
 * - Interactive pigeons with startled wing-flap flight dynamics
 * - Street props: drainpipes, air conditioners, street signs, posters, hanging skate shoes
 * - Atmospheric dusk sky, powerlines, and ambient dust motes
 */

import { CONFIG } from './config.js';
import { Sound } from './audio.js';

export class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = canvas.clientWidth || 1200;
    this.height = canvas.clientHeight || 700;

    // Interactive pigeons
    this.pigeons = [
      {
        id: 'pig_1',
        x: 0.18,
        y: 0.71,
        groundY: 0.71,
        state: 'pecking', // 'idle', 'pecking', 'flying', 'perched'
        time: 0,
        bob: 0,
        dir: 1,
        vx: 0,
        vy: 0,
        wingAngle: 0
      },
      {
        id: 'pig_2',
        x: 0.82,
        y: 0.71,
        groundY: 0.71,
        state: 'pecking',
        time: 2.2,
        bob: 0,
        dir: -1,
        vx: 0,
        vy: 0,
        wingAngle: 0
      }
    ];

    // Ambient dust particles
    this.dustParticles = [];
    for (let i = 0; i < 26; i++) {
      this.dustParticles.push({
        x: Math.random(),
        y: Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.0003,
        vy: (Math.random() - 0.5) * 0.0002,
        size: 1 + Math.random() * 2,
        alpha: 0.15 + Math.random() * 0.35
      });
    }

    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Scare / Startle pigeons into flight
   */
  scarePigeons(nearNormX = null) {
    for (const pig of this.pigeons) {
      if (pig.state !== 'flying') {
        if (nearNormX === null || Math.abs(pig.x - nearNormX) < 0.14) {
          pig.state = 'flying';
          pig.vx = (pig.x > 0.5 ? -0.15 : 0.15) + (Math.random() - 0.5) * 0.08;
          pig.vy = -0.25 - Math.random() * 0.15;
          pig.dir = pig.vx >= 0 ? 1 : -1;
          Sound.playPigeonFlutter();
        }
      }
    }
  }

  update(dt = 0.016, skaterNormX = null) {
    // Check if skater is close enough to scare pigeons
    if (skaterNormX !== null) {
      this.scarePigeons(skaterNormX);
    }

    // Update pigeons
    for (const pig of this.pigeons) {
      pig.time += dt * 3.5;

      if (pig.state === 'pecking' || pig.state === 'idle') {
        pig.bob = Math.sin(pig.time * 4) * 1.5;
        // Periodic direction change
        if (Math.random() < 0.008) {
          pig.dir *= -1;
        }
      } else if (pig.state === 'flying') {
        // Wing flapping
        pig.wingAngle = Math.sin(pig.time * 22) * 0.8;
        pig.x += pig.vx * dt;
        pig.y += pig.vy * dt;
        pig.vy += 0.18 * dt; // Gravity arc

        // Land after flying arc
        if (pig.y >= pig.groundY) {
          pig.y = pig.groundY;
          pig.state = 'idle';
          pig.vx = 0;
          pig.vy = 0;
          pig.wingAngle = 0;
        }

        // Wrap around bounds
        if (pig.x < 0.02) { pig.x = 0.02; pig.vx = Math.abs(pig.vx); pig.dir = 1; }
        if (pig.x > 0.98) { pig.x = 0.98; pig.vx = -Math.abs(pig.vx); pig.dir = -1; }
      }
    }

    // Update dust motes
    for (const p of this.dustParticles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = 1;
      if (p.x > 1) p.x = 0;
      if (p.y < 0) p.y = 0.7;
      if (p.y > 0.7) p.y = 0;
    }
  }

  /**
   * Render complete urban alley backdrop
   */
  renderAlleyBackdrop(showPaintZoneGuide = false) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const wallTop = h * 0.06;
    const wallBottom = h * 0.74;
    const wallHeight = wallBottom - wallTop;

    ctx.save();

    // 1. DUSK URBAN SKY & SILHOUETTES
    const skyGrad = ctx.createLinearGradient(0, 0, 0, wallTop);
    skyGrad.addColorStop(0, '#10121a');
    skyGrad.addColorStop(0.6, '#1d212d');
    skyGrad.addColorStop(1, '#2c2538');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, wallTop);

    // Distant rooftop silhouettes
    ctx.fillStyle = '#0d0f17';
    ctx.fillRect(w * 0.05, 0, w * 0.16, wallTop);
    ctx.fillRect(w * 0.44, 0, w * 0.22, wallTop);
    ctx.fillRect(w * 0.82, 0, w * 0.16, wallTop);

    // Overhead powerlines
    ctx.strokeStyle = '#080a0f';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, wallTop * 0.4);
    ctx.quadraticCurveTo(w * 0.5, wallTop * 0.92, w, wallTop * 0.3);
    ctx.stroke();

    // Hanging skate shoes
    this._drawHangingSkateShoes(ctx, w * 0.48, wallTop * 0.65);

    // 2. THE BIG GRAFFITI BRICK WALL (Using requested #A94335 palette)
    this._drawBrickWall(ctx, 0, wallTop, w, wallHeight);

    // 3. ARCHITECTURAL DETAILS (Pipes, AC units, street signs, posters)
    this._drawWallProps(ctx, w, wallTop, wallHeight);

    // 4. PAINT ZONE GUIDE (Dashed neon guide)
    if (showPaintZoneGuide) {
      const b = CONFIG.wallBounds;
      ctx.strokeStyle = 'rgba(140, 255, 87, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(b.minX * w, b.minY * h, (b.maxX - b.minX) * w, (b.maxY - b.minY) * h);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(140, 255, 87, 0.85)';
      ctx.font = 'bold 11px "Outfit", monospace';
      ctx.fillText('🎨 GRAFFITI SPRAY ZONE — CLICK & DRAG TO TAG WALL', b.minX * w + 12, b.minY * h + 22);
    }

    // 5. AMBIENT DUST PARTICLES
    ctx.fillStyle = '#F3E8D0';
    for (const p of this.dustParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 6. CONCRETE PAVEMENT & METAL RAILING (Bottom 25%)
    this._drawPavementAndRailing(ctx, w, wallBottom, h - wallBottom);

    // 7. PIGEONS
    for (const pig of this.pigeons) {
      this._drawPigeon(ctx, pig.x * w, pig.y * h + pig.bob, pig.dir, pig.wingAngle, pig.state);
    }

    ctx.restore();
  }

  _drawBrickWall(ctx, x, y, width, height) {
    // Mortar color
    ctx.fillStyle = '#1c1f26';
    ctx.fillRect(x, y, width, height);

    const brickH = 22;
    const brickW = 48;
    const rows = Math.ceil(height / brickH);
    const cols = Math.ceil(width / brickW) + 1;

    for (let r = 0; r < rows; r++) {
      const rowY = y + r * brickH;
      const offsetX = (r % 2 === 0) ? 0 : -brickW / 2;

      for (let c = 0; c < cols; c++) {
        const brickX = c * brickW + offsetX;

        // Brick variations using #A94335 base palette
        const hash = (r * 31 + c * 17) % 6;
        let brickColor = '#A94335'; // Suggested primary brick red
        if (hash === 1) brickColor = '#b54b3c';
        else if (hash === 2) brickColor = '#94382c';
        else if (hash === 3) brickColor = '#7e2d22';
        else if (hash === 4) brickColor = '#9e3e31';
        else if (hash === 5) brickColor = '#bb5142';

        ctx.fillStyle = brickColor;
        ctx.fillRect(brickX + 1.5, rowY + 1.5, brickW - 3, brickH - 3);

        // Subtle highlights & shadow
        ctx.fillStyle = 'rgba(243, 232, 208, 0.08)'; // Cream highlight
        ctx.fillRect(brickX + 1.5, rowY + 1.5, brickW - 3, 2);
        ctx.fillStyle = 'rgba(10, 14, 20, 0.22)';
        ctx.fillRect(brickX + 1.5, rowY + brickH - 4, brickW - 3, 2);
      }
    }

    // Wall vignette
    const wallVignette = ctx.createLinearGradient(0, y, 0, y + height);
    wallVignette.addColorStop(0, 'rgba(10, 12, 16, 0.45)');
    wallVignette.addColorStop(0.35, 'rgba(0, 0, 0, 0.05)');
    wallVignette.addColorStop(1, 'rgba(10, 12, 16, 0.6)');
    ctx.fillStyle = wallVignette;
    ctx.fillRect(x, y, width, height);
  }

  _drawWallProps(ctx, w, wallTop, wallHeight) {
    // 1. Drainpipe on left
    const pipeX = w * 0.06;
    ctx.fillStyle = '#25272B';
    ctx.fillRect(pipeX, wallTop, 16, wallHeight);
    ctx.fillStyle = '#475569';
    ctx.fillRect(pipeX + 2, wallTop, 5, wallHeight);
    for (let py = wallTop + 50; py < wallTop + wallHeight; py += 80) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(pipeX - 4, py, 24, 7);
      ctx.strokeStyle = '#0a0d14';
      ctx.strokeRect(pipeX - 4, py, 24, 7);
    }

    // 2. Air conditioning unit on right
    const acX = w * 0.88;
    const acY = wallTop + 60;
    ctx.fillStyle = '#334155';
    ctx.fillRect(acX, acY, 70, 50);
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(acX, acY, 70, 50);
    ctx.fillStyle = '#1e293b';
    for (let vy = acY + 8; vy < acY + 42; vy += 7) {
      ctx.fillRect(acX + 8, vy, 38, 3);
    }
    ctx.beginPath();
    ctx.arc(acX + 54, acY + 25, 12, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Street sign: "NO SKATING - FINE £500"
    const signX = w * 0.38;
    const signY = wallTop + 35;
    ctx.save();
    ctx.translate(signX, signY);
    ctx.rotate(0.025);
    ctx.fillStyle = '#F3E8D0'; // Cream
    ctx.fillRect(0, 0, 110, 52);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#A94335';
    ctx.strokeRect(0, 0, 110, 52);

    ctx.fillStyle = '#A94335';
    ctx.font = '900 12px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO SKATING', 55, 20);

    ctx.fillStyle = '#25272B';
    ctx.font = 'bold 9px "Outfit", sans-serif';
    ctx.fillText('BY ORDER OF COUNCIL', 55, 33);
    ctx.fillText('MAX PENALTY £500', 55, 45);

    // Neon spray cross-out
    ctx.strokeStyle = '#8CFF57'; // Neon Green
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.lineTo(100, 42);
    ctx.stroke();
    ctx.restore();

    // 4. Posters
    this._drawStreetPosters(ctx, w * 0.22, wallTop + wallHeight * 0.65);
    this._drawStreetPosters(ctx, w * 0.74, wallTop + wallHeight * 0.62);
  }

  _drawStreetPosters(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    // Poster 1: "PUNK GIG"
    ctx.fillStyle = '#FF8A3D';
    ctx.fillRect(0, 0, 48, 64);
    ctx.fillStyle = '#25272B';
    ctx.font = '900 9px sans-serif';
    ctx.fillText('PUNK GIG', 4, 14);
    ctx.fillText('THE RATS', 4, 28);
    ctx.fillText('ALLEYWAY', 4, 42);
    ctx.fillText('FRIDAY 9PM', 4, 56);

    // Poster 2 torn overlay
    ctx.fillStyle = '#A970FF';
    ctx.beginPath();
    ctx.moveTo(35, 10);
    ctx.lineTo(75, 10);
    ctx.lineTo(75, 55);
    ctx.lineTo(40, 48);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F3E8D0';
    ctx.font = '900 8px sans-serif';
    ctx.fillText('SK8', 42, 28);
    ctx.fillText('JAM', 42, 40);

    ctx.restore();
  }

  _drawPavementAndRailing(ctx, w, topY, height) {
    // 1. Concrete curb top edge
    ctx.fillStyle = '#B8B2A8'; // Concrete grey
    ctx.fillRect(0, topY, w, 8);
    ctx.fillStyle = '#FF8A3D'; // Yellow/orange curb markings
    for (let cx = 0; cx < w; cx += 50) {
      if ((cx / 50) % 2 === 0) {
        ctx.fillRect(cx, topY, 35, 8);
      }
    }

    // 2. Road surface (#25272B Dark Asphalt)
    const paveGrad = ctx.createLinearGradient(0, topY + 8, 0, topY + height);
    paveGrad.addColorStop(0, '#333842');
    paveGrad.addColorStop(0.35, '#25272B');
    paveGrad.addColorStop(1, '#181a1d');
    ctx.fillStyle = paveGrad;
    ctx.fillRect(0, topY + 8, w, height - 8);

    // Expansion joints
    ctx.strokeStyle = '#181a1d';
    ctx.lineWidth = 2.5;
    for (let sx = 0; sx < w; sx += 140) {
      ctx.beginPath();
      ctx.moveTo(sx, topY + 8);
      ctx.lineTo(sx - 35, topY + height);
      ctx.stroke();
    }

    // 3. Skate Grind Rail (Situating from 0.405 to 0.695)
    const railX1 = w * 0.41;
    const railX2 = w * 0.69;
    const railY = topY + 45;

    // Ground shadow under rail
    ctx.fillStyle = 'rgba(10, 14, 20, 0.45)';
    ctx.fillRect(railX1, railY + 22, railX2 - railX1, 8);

    // Support legs
    [railX1 + 12, (railX1 + railX2) / 2, railX2 - 12].forEach(px => {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(px - 3, railY, 6, 24);
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 3, railY, 6, 24);
    });

    // Steel rail pipe with skate wax shine
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.roundRect(railX1, railY - 4, railX2 - railX1, 8, 4);
    ctx.fill();
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wax sheen highlight
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(railX1 + 6, railY - 3, railX2 - railX1 - 12, 2);

    // 4. Kicker Ramp on right
    const rampX = w * 0.88;
    const rampY = topY + 30;
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(rampX, rampY + 36);
    ctx.lineTo(rampX + 65, rampY + 36);
    ctx.lineTo(rampX + 65, rampY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(rampX, rampY + 33, 14, 4);
  }

  _drawHangingSkateShoes(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.strokeStyle = '#F3E8D0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-6, 22);
    ctx.moveTo(0, 0);
    ctx.lineTo(8, 26);
    ctx.stroke();

    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.roundRect(-16, 18, 14, 8, [2, 4, 1, 1]);
    ctx.fill();
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(-16, 24, 14, 2);

    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.roundRect(2, 22, 14, 8, [4, 2, 1, 1]);
    ctx.fill();
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(2, 28, 14, 2);

    ctx.restore();
  }

  _drawPigeon(ctx, x, y, dir, wingAngle = 0, state = 'idle') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);

    // Wing flapping if flying
    if (state === 'flying') {
      ctx.save();
      ctx.rotate(wingAngle);
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(-2, -6, 10, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(7, -4, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Neck green sheen
    ctx.fillStyle = '#8CFF57';
    ctx.fillRect(5, -3, 3, 3);

    // Beak
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.moveTo(11, -4);
    ctx.lineTo(15, -3);
    ctx.lineTo(11, -2);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.arc(8, -5, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    if (state !== 'flying') {
      ctx.strokeStyle = '#FF8A3D';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-2, 5);
      ctx.lineTo(-2, 11);
      ctx.moveTo(3, 5);
      ctx.lineTo(3, 11);
      ctx.stroke();
    }

    ctx.restore();
  }
}
