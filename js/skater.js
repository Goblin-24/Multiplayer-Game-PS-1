/**
 * ALLEY RATS: SKATE & SPRAY
 * Data-Driven Cartoon Skater & Skateboard 2D Canvas Engine
 * Features:
 * - Fluid pushing foot-cycle & body lean physics
 * - High-flying Ollie pops with board tilt
 * - 360 Kickflip trick animation with deck spin & knee tuck
 * - Interactive 50-50 rail grinds with showering truck sparks
 * - Expressive cartoon expressions, blinking eyes, and hair/hat dynamics
 * - Data-driven customization for skin, apparel, decks and wheels
 */

import { Sound } from './audio.js';

export class Skater {
  constructor(playerData, isLocal = false) {
    this.id = playerData.id;
    this.name = playerData.name || 'SKATER';
    this.isLocal = isLocal;
    this.isHost = Boolean(playerData.isHost);
    this.isMock = Boolean(playerData.isMock);
    this.isMenu = Boolean(playerData.isMenu || playerData.id === 'menu_skater');
    this.ready = Boolean(playerData.ready);
    this.afk = Boolean(playerData.afk || playerData.connected === false);
    this.customization = Object.assign({}, playerData.customization);

    // Position coordinates (normalized 0..1)
    this.normX = playerData.x !== undefined ? playerData.x : 0.3;
    this.normY = playerData.y !== undefined ? playerData.y : 0.82;

    // Movement & physics
    this.vx = 0;
    this.facing = 1; // 1 = right, -1 = left
    this.speed = 0.32;
    this.leanAngle = 0; // Dynamic board lean during turns

    // Animation timers & state
    this.idleTime = Math.random() * 10;
    this.rollTime = 0;
    this.isRolling = false;
    this.isPushing = false;
    this.pushTime = 0;
    this.blinkTimer = 2 + Math.random() * 3;
    this.isBlinking = false;

    // Jump / Ollie state
    this.isJumping = false;
    this.jumpY = 0; // Negative offset in air
    this.jumpVelocity = 0;
    this.jumpRotation = 0;

    // Kickflip trick state
    this.isKickflipping = false;
    this.kickflipTime = 0;
    this.deckFlipScaleY = 1; // Oscillates from 1 -> -1 -> 1 for 3D flip illusion
    this.deckFlipRot = 0;

    // Grind rail state
    this.isGrinding = false;
    this.grindHeight = -28; // Rail top offset
    this.sparks = [];

    // Dust particles on landing
    this.dustParticles = [];

    // Remote movement interpolation
    this.targetNormX = this.normX;
  }

  applyRemoteMovement(data) {
    if (data.normX !== undefined) {
      this.targetNormX = data.normX;
      if (Math.abs(this.normX - data.normX) > 0.35) {
        this.normX = data.normX;
      }
    }
    if (data.normY !== undefined) {
      this.normY = data.normY;
    }
    if (data.facing !== undefined) {
      this.facing = data.facing;
    }
    if (data.vx !== undefined) {
      this.vx = data.vx;
    }
    if (data.isPushing && !this.isPushing) {
      this.triggerPush();
    }
    if ((data.isOllie || data.isJumping) && !this.isJumping && !this.isGrinding) {
      this.ollie();
    }
    if ((data.isKickflip || data.isKickflipping) && !this.isKickflipping && !this.isGrinding) {
      this.kickflip();
    }
    if (data.isGrinding !== undefined) {
      this.isGrinding = Boolean(data.isGrinding);
    }
    if (data.afk !== undefined) {
      this.afk = Boolean(data.afk);
    }
  }

  updateCustomization(customization) {
    this.customization = Object.assign(this.customization, customization);
    if (customization.name) {
      this.name = customization.name;
    }
  }

  setReady(ready) {
    this.ready = ready;
  }

  /**
   * Pop an Ollie
   */
  ollie() {
    if (this.isJumping || this.isGrinding) return false;
    this.isJumping = true;
    this.jumpVelocity = -9.8;
    this.jumpRotation = -0.16 * this.facing;
    return true;
  }

  /**
   * Pop a 360 Kickflip
   */
  kickflip() {
    if (this.isJumping || this.isGrinding) return false;
    this.isJumping = true;
    this.isKickflipping = true;
    this.kickflipTime = 0;
    this.jumpVelocity = -10.5;
    this.jumpRotation = -0.22 * this.facing;
    Sound.playKickflipSound();
    return true;
  }

  /**
   * Trigger push foot cycle
   */
  triggerPush() {
    if (!this.isPushing && !this.isJumping && !this.isGrinding) {
      this.isPushing = true;
      this.pushTime = 0;
    }
  }

  /**
   * Update physics, trick cycles and particle effects
   */
  update(dt = 0.016) {
    this.idleTime += dt * 3.2;

    // Blinking logic
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.isBlinking = true;
      if (this.blinkTimer <= -0.14) {
        this.isBlinking = false;
        this.blinkTimer = 2.5 + Math.random() * 4;
      }
    }

    // Rail grinding check (Grind rail is situated between normalized 0.40 and 0.69)
    const onRailX = (this.normX >= 0.405 && this.normX <= 0.695);

    if (this.isJumping && onRailX && this.jumpY >= this.grindHeight - 8 && this.jumpVelocity > 0) {
      // Snapped onto grind rail!
      this.isGrinding = true;
      this.isJumping = false;
      this.isKickflipping = false;
      this.jumpY = this.grindHeight;
      this.jumpVelocity = 0;
      this.jumpRotation = 0.04 * this.facing;
      Sound.startGrindSound();
    }

    if (this.isGrinding) {
      // Skater is grinding across the rail
      this.jumpY = this.grindHeight;
      // Emit metal sparks from trucks
      this._spawnGrindSparks();

      // Ensure minimum speed on rail
      if (Math.abs(this.vx) < 0.15) {
        this.vx = 0.22 * this.facing;
      }

      // Check if dismounted end of rail
      if (!onRailX) {
        this.isGrinding = false;
        this.isJumping = true;
        this.jumpVelocity = -3.5; // Small dismount hop
        Sound.stopGrindSound();
        Sound.playLandSound();
      }
    }

    // Air physics (Jumping & tricks)
    if (this.isJumping) {
      this.jumpY += this.jumpVelocity;
      this.jumpVelocity += 0.49; // Gravity
      this.jumpRotation *= 0.94;

      // Kickflip 3D flip spin
      if (this.isKickflipping) {
        this.kickflipTime += dt * 14;
        this.deckFlipScaleY = Math.cos(this.kickflipTime);
        this.deckFlipRot += dt * 18 * this.facing;
      }

      // Landing on pavement
      if (this.jumpY >= 0) {
        this.jumpY = 0;
        this.isJumping = false;
        this.isKickflipping = false;
        this.deckFlipScaleY = 1;
        this.deckFlipRot = 0;
        this.jumpRotation = 0;
        this._spawnDust();
        Sound.playLandSound();
      }
    }

    // Rolling & Pushing physics
    if (this.isMenu) {
      this.isRolling = true;
      this.normX += this.vx * dt;
      this.rollTime += dt * 16;
      this.leanAngle = 0.05 * this.facing;
    } else if (!this.isLocal && this.targetNormX !== undefined) {
      // Extrapolate remote player position between network packets using dead-reckoning
      if (Math.abs(this.vx) > 0.005) {
        this.targetNormX += this.vx * dt;
        this.targetNormX = Math.max(0.04, Math.min(0.96, this.targetNormX));
        this.isRolling = true;
        this.rollTime += dt * (12 + Math.abs(this.vx) * 30);
        this.leanAngle = (this.vx * 0.15 * this.facing);
      } else {
        this.isRolling = false;
        this.leanAngle = 0;
      }
      // Smooth natural glide towards target position
      this.normX += (this.targetNormX - this.normX) * Math.min(1, dt * 18);
    } else {
      if (Math.abs(this.vx) > 0.001) {
        this.isRolling = true;
        this.normX += this.vx * dt;
        this.rollTime += dt * (12 + Math.abs(this.vx) * 30);
        this.leanAngle = (this.vx * 0.15 * this.facing);

        // Clamp within alley pavement bounds
        this.normX = Math.max(0.04, Math.min(0.96, this.normX));
        
        // Gentle friction (faster deceleration if not grinding)
        if (!this.isGrinding) {
          this.vx *= 0.93;
        }
      } else {
        this.isRolling = false;
        this.vx = 0;
        this.leanAngle = 0;
      }
    }

    // Pushing foot animation cycle
    if (this.isPushing) {
      this.pushTime += dt * 5.5;
      if (this.pushTime >= Math.PI) {
        this.isPushing = false;
        this.pushTime = 0;
      }
    }

    // Update grinding sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.35; // Spark gravity
      s.life -= dt * 3.5;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
      }
    }

    // Update dust particles
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= dt * 2.8;
      p.size *= 0.94;
      if (p.alpha <= 0) {
        this.dustParticles.splice(i, 1);
      }
    }
  }

  _spawnGrindSparks() {
    for (let i = 0; i < 3; i++) {
      this.sparks.push({
        x: (this.facing === 1 ? -18 : 18) + (Math.random() - 0.5) * 8,
        y: 12,
        vx: -this.facing * (2 + Math.random() * 4),
        vy: -Math.random() * 3,
        size: 1.5 + Math.random() * 2,
        color: Math.random() < 0.6 ? '#ffe600' : '#ff8a3d',
        life: 0.35
      });
    }
  }

  _spawnDust() {
    for (let i = 0; i < 7; i++) {
      this.dustParticles.push({
        x: (Math.random() - 0.5) * 36,
        y: 2,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -Math.random() * 1.6,
        size: 4 + Math.random() * 4,
        alpha: 0.85
      });
    }
  }

  /**
   * Render skater, skateboard, shadows, sparks and overhead name badge
   */
  render(ctx, width, height, showNameTag = true) {
    const x = this.normX * width;
    const y = this.normY * height + this.jumpY;
    const cust = this.customization || {};

    ctx.save();
    ctx.translate(x, y);

    if (this.afk) {
      ctx.globalAlpha = 0.65;
    }

    // 1. Landing Dust Particles
    for (const p of this.dustParticles) {
      ctx.fillStyle = `rgba(184, 178, 168, ${p.alpha})`; // Concrete dust color
      ctx.beginPath();
      ctx.arc(p.x, p.y + 12, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Grinding Sparks
    for (const s of this.sparks) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Ground / Rail Shadow
    const shadowScale = Math.max(0.35, 1 - Math.abs(this.jumpY) / 120);
    ctx.fillStyle = 'rgba(25, 28, 35, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 14 - this.jumpY, 40 * shadowScale, 9 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // 4. Skater Direction & Lean
    ctx.scale(this.facing, 1);
    if (this.jumpRotation !== 0) {
      ctx.rotate(this.jumpRotation);
    }
    if (this.leanAngle !== 0) {
      ctx.rotate(this.leanAngle);
    }

    // Idle / rolling bounce
    const bobY = this.isRolling 
      ? Math.sin(this.rollTime) * 2 
      : Math.sin(this.idleTime) * 3.2;

    // --- 5. RENDER SKATEBOARD ---
    this._renderSkateboard(ctx, cust, bobY);

    // --- 6. RENDER SKATER CHARACTER BODY ---
    this._renderSkaterBody(ctx, cust, bobY);

    // --- 6.5 AFK / DISCONNECTED RUBBER STAMP ---
    if (this.afk) {
      this._renderAFKStamp(ctx, bobY);
    }

    ctx.restore();

    // --- 7. OVERHEAD NAME TAG & STATUS BADGE ---
    if (showNameTag) {
      this._renderOverheadBadge(ctx, x, y + bobY - 98);
    }
  }

  _renderSkateboard(ctx, cust, bobY) {
    const deckColor = cust.deckColor || '#25272B';
    const wheelColor = cust.wheelColor || '#8CFF57';
    const graphic = cust.deckGraphic || 'flame';

    ctx.save();
    ctx.translate(0, 8);

    // 3D Kickflip flip scale & rotation effect
    if (this.isKickflipping) {
      ctx.scale(1, this.deckFlipScaleY);
      ctx.rotate(this.deckFlipRot * 0.1);
    }

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0a0d14';

    // Deck base ply (layered maple wood)
    ctx.fillStyle = deckColor;
    ctx.beginPath();
    ctx.moveTo(-36, -3);
    ctx.quadraticCurveTo(-42, -7, -46, -11);
    ctx.quadraticCurveTo(-44, 2, -34, 4);
    ctx.lineTo(34, 4);
    ctx.quadraticCurveTo(44, 2, 46, -11);
    ctx.quadraticCurveTo(42, -7, 36, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Grip tape edge
    ctx.fillStyle = '#14171f';
    ctx.fillRect(-32, -3, 64, 2);

    // Render customizable graphic
    this._renderDeckGraphic(ctx, graphic, cust);

    // Metal Trucks (Axles & Baseplates)
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-24, 4, 8, 5);
    ctx.fillRect(16, 4, 8, 5);
    ctx.strokeRect(-24, 4, 8, 5);
    ctx.strokeRect(16, 4, 8, 5);

    // Urethane Neon Wheels with rotation
    const wheelRot = this.rollTime;
    [-24, 20].forEach(wx => {
      ctx.save();
      ctx.translate(wx + 4, 11);
      ctx.rotate(wheelRot);

      ctx.fillStyle = wheelColor;
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bearing core
      ctx.fillStyle = '#F3E8D0';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Wheel graphic line
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(-5, -1, 10, 2);
      ctx.restore();
    });

    ctx.restore();
  }

  _renderDeckGraphic(ctx, graphic, cust) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-34, -4, 68, 7);
    ctx.clip();

    if (graphic === 'checker') {
      ctx.fillStyle = '#F3E8D0';
      for (let i = -30; i < 30; i += 8) {
        ctx.fillRect(i, -3, 4, 6);
      }
    } else if (graphic === 'flame') {
      ctx.fillStyle = '#FF8A3D';
      ctx.beginPath();
      ctx.moveTo(-30, 2);
      ctx.lineTo(-20, -3);
      ctx.lineTo(-10, 2);
      ctx.lineTo(0, -4);
      ctx.lineTo(10, 2);
      ctx.lineTo(20, -3);
      ctx.lineTo(30, 2);
      ctx.lineTo(30, 4);
      ctx.lineTo(-30, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.moveTo(-25, 2);
      ctx.lineTo(-15, -1);
      ctx.lineTo(-5, 2);
      ctx.lineTo(5, -2);
      ctx.lineTo(15, 2);
      ctx.lineTo(25, -1);
      ctx.fill();
    } else if (graphic === 'toxic') {
      ctx.fillStyle = '#8CFF57';
      ctx.fillRect(-28, -2, 56, 3);
      [-18, -4, 10, 22].forEach(dx => {
        ctx.beginPath();
        ctx.arc(dx, 2, 2.5, 0, Math.PI);
        ctx.fill();
      });
    } else if (graphic === 'rat') {
      ctx.fillStyle = '#A970FF';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-4, -4, 2.5, 0, Math.PI * 2);
      ctx.arc(4, -4, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (graphic === 'lightning') {
      ctx.fillStyle = '#35D7FF';
      ctx.beginPath();
      ctx.moveTo(-24, -3);
      ctx.lineTo(-8, 3);
      ctx.lineTo(-12, 0);
      ctx.lineTo(12, -3);
      ctx.lineTo(4, 3);
      ctx.lineTo(26, -3);
      ctx.fill();
    } else {
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-34, -4, 68, 7);
    }
    ctx.restore();
  }

  _renderSkaterBody(ctx, cust, bobY) {
    const skinTone = cust.skinTone || '#ffd1a4';
    const hoodieColor = cust.hoodieColor || '#A970FF';
    const pantsColor = cust.pantsColor || '#25272B';
    const shoesColor = cust.shoesColor || '#F3E8D0';
    const headwear = cust.headwear || 'beanie';
    const headwearColor = cust.headwearColor || '#ff007f';

    ctx.save();
    ctx.translate(0, bobY);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0a0d14';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Pushing foot offset
    let pushLegAngle = 0;
    let pushFootY = 0;
    if (this.isPushing) {
      const p = Math.sin(this.pushTime);
      pushLegAngle = -p * 0.45;
      pushFootY = p * 6;
    }

    // --- 1. SNEAKERS ---
    // Back Foot (kicking or on tail)
    ctx.save();
    ctx.translate(-24, pushFootY);
    ctx.rotate(pushLegAngle);
    ctx.fillStyle = shoesColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, 16, 9, [3, 6, 2, 2]);
    ctx.fill();
    ctx.stroke();
    // Rubber toe cap
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 6, 16, 3);
    ctx.strokeRect(0, 6, 16, 3);
    ctx.restore();

    // Front Foot (angled forward on front bolts)
    ctx.fillStyle = shoesColor;
    ctx.beginPath();
    ctx.roundRect(8, -1, 18, 9, [5, 4, 2, 2]);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(8, 5, 18, 3);
    ctx.strokeRect(8, 5, 18, 3);

    // --- 2. LEGS / BAGGY PANTS ---
    ctx.fillStyle = pantsColor;

    // Back leg
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-16, -26);
    ctx.lineTo(-20, 2 + pushFootY);
    ctx.lineTo(-11, 2 + pushFootY);
    ctx.lineTo(-9, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Front leg
    ctx.beginPath();
    ctx.moveTo(8, -26);
    ctx.lineTo(16, 1);
    ctx.lineTo(22, 1);
    ctx.lineTo(14, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pelvis / Belt
    ctx.beginPath();
    ctx.roundRect(-16, -28, 28, 10, 4);
    ctx.fill();
    ctx.stroke();

    // --- 3. TORSO / HOODIE ---
    // Slight forward lean when skating
    const torsoLean = this.isRolling ? 0.08 : 0;
    ctx.save();
    ctx.rotate(torsoLean);

    ctx.fillStyle = hoodieColor;
    ctx.beginPath();
    ctx.roundRect(-18, -55, 36, 29, [10, 10, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Kangaroo pocket
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.roundRect(-12, -38, 24, 9, 3);
    ctx.fill();
    ctx.stroke();

    // Chest Stencil
    ctx.fillStyle = '#F3E8D0';
    ctx.font = '900 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RAT', 0, -44);

    // --- 4. ARMS & SPRAY CAN ---
    // Back Arm (balance)
    ctx.fillStyle = hoodieColor;
    ctx.beginPath();
    ctx.moveTo(-16, -50);
    ctx.quadraticCurveTo(-28, -44, -32, -36);
    ctx.lineTo(-28, -32);
    ctx.quadraticCurveTo(-22, -40, -14, -46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Back hand
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.arc(-30, -32, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Front Arm (holding miniature spray can)
    ctx.fillStyle = hoodieColor;
    ctx.beginPath();
    ctx.moveTo(14, -50);
    ctx.quadraticCurveTo(26, -42, 32, -38);
    ctx.lineTo(29, -32);
    ctx.quadraticCurveTo(22, -38, 12, -46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front hand
    ctx.fillStyle = skinTone;
    ctx.beginPath();
    ctx.arc(31, -34, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spray can in hand
    ctx.fillStyle = cust.paintColor || '#8CFF57';
    ctx.fillRect(32, -42, 6, 12);
    ctx.strokeRect(32, -42, 6, 12);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(33, -45, 4, 3);

    // --- 5. HEAD & EXPRESSIVE FACE ---
    ctx.fillStyle = skinTone;
    ctx.fillRect(-5, -60, 10, 7);
    ctx.strokeRect(-5, -60, 10, 7);

    // Head circle
    ctx.beginPath();
    ctx.ellipse(0, -68, 14, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Smirk mouth
    ctx.strokeStyle = '#0a0d14';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(3, -64, 5, 0.2, Math.PI * 0.8);
    ctx.stroke();

    // Comic eyes / Blinking
    if (this.isBlinking) {
      // Closed slit
      ctx.beginPath();
      ctx.moveTo(2, -70);
      ctx.lineTo(6, -70);
      ctx.moveTo(7, -70);
      ctx.lineTo(11, -70);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#0a0d14';
      ctx.beginPath();
      ctx.arc(4, -70, 2.5, 0, Math.PI * 2);
      ctx.arc(9, -70, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Catchlight
      ctx.fillStyle = '#F3E8D0';
      ctx.beginPath();
      ctx.arc(5, -71, 0.9, 0, Math.PI * 2);
      ctx.arc(10, -71, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- 6. HEADWEAR & HAIR ---
    this._renderHeadwear(ctx, headwear, headwearColor, cust);

    ctx.restore(); // Restore torso lean
    ctx.restore(); // Restore main skater
  }

  _renderHeadwear(ctx, headwear, headwearColor, cust) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a0d14';

    if (headwear === 'beanie') {
      ctx.fillStyle = headwearColor;
      ctx.beginPath();
      ctx.moveTo(-15, -72);
      ctx.quadraticCurveTo(-14, -90, 0, -91);
      ctx.quadraticCurveTo(14, -90, 15, -72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Ribbed fold
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.roundRect(-16, -74, 32, 7, 3);
      ctx.fill();
      ctx.stroke();
    } else if (headwear === 'cap_back') {
      ctx.fillStyle = headwearColor;
      ctx.beginPath();
      ctx.arc(0, -74, 15, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Snapback bill
      ctx.fillStyle = '#25272B';
      ctx.beginPath();
      ctx.moveTo(-14, -72);
      ctx.quadraticCurveTo(-26, -74, -28, -78);
      ctx.lineTo(-14, -75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (headwear === 'bucket') {
      ctx.fillStyle = headwearColor;
      ctx.beginPath();
      ctx.moveTo(-12, -74);
      ctx.lineTo(-10, -88);
      ctx.lineTo(10, -88);
      ctx.lineTo(12, -74);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Flared brim
      ctx.beginPath();
      ctx.roundRect(-18, -75, 36, 6, 2);
      ctx.fill();
      ctx.stroke();
    } else if (headwear === 'punk') {
      ctx.fillStyle = headwearColor;
      const spikes = [-12, -6, 0, 6, 12];
      for (const sx of spikes) {
        ctx.beginPath();
        ctx.moveTo(sx - 4, -76);
        ctx.lineTo(sx * 1.3, -95);
        ctx.lineTo(sx + 4, -76);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (headwear === 'afro') {
      ctx.fillStyle = cust.hairColor || '#1e1b18';
      ctx.beginPath();
      ctx.arc(0, -74, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (headwear === 'bandana') {
      ctx.fillStyle = headwearColor;
      ctx.beginPath();
      ctx.roundRect(-15, -78, 30, 8, 2);
      ctx.fill();
      ctx.stroke();
      // Tie knot
      ctx.beginPath();
      ctx.moveTo(-14, -74);
      ctx.lineTo(-22, -70);
      ctx.lineTo(-20, -78);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = cust.hairColor || '#1e1b18';
      ctx.beginPath();
      ctx.arc(-2, -76, 14, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  _renderAFKStamp(ctx, bobY = 0) {
    ctx.save();
    ctx.translate(0, bobY - 48);
    ctx.rotate(-0.30); // ~-17 deg authentic stamp angle

    const stampW = 78;
    const stampH = 34;

    // Outer double border
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-stampW / 2, -stampH / 2, stampW, stampH, 4);
    } else {
      ctx.rect(-stampW / 2, -stampH / 2, stampW, stampH);
    }
    ctx.fill();
    ctx.stroke();

    // Inner dashed line
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(-stampW / 2 + 3, -stampH / 2 + 3, stampW - 6, stampH - 6);
    ctx.setLineDash([]);

    // Big AFK text
    ctx.font = '900 18px "Rubik Dirt", "Impact", sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText('AFK', 0, -3);

    // Subtitle DISCONNECTED
    ctx.font = '900 7px "Outfit", sans-serif';
    ctx.fillText('DISCONNECTED', 0, 10);

    ctx.restore();
  }

  _renderOverheadBadge(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    const displayName = (this.isHost ? '👑 ' : '') + this.name + (this.afk ? ' [AFK]' : (this.isMock ? ' [BOT]' : ''));
    ctx.font = 'bold 12px "Outfit", sans-serif';
    const textWidth = ctx.measureText(displayName).width;
    const badgeWidth = Math.max(textWidth + 24, 76);
    const badgeHeight = 22;

    // Dark pill container
    ctx.fillStyle = 'rgba(10, 14, 23, 0.9)';
    ctx.strokeStyle = this.afk ? '#ef4444' : (this.ready ? '#8CFF57' : '#94a3b8');
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight, 11);
    } else {
      ctx.rect(-badgeWidth / 2, -badgeHeight / 2, badgeWidth, badgeHeight);
    }
    ctx.fill();
    ctx.stroke();

    // Name text
    ctx.fillStyle = this.afk ? '#fca5a5' : '#F3E8D0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, 0, 0);

    // Glowing status dot
    ctx.fillStyle = this.afk ? '#ef4444' : (this.ready ? '#8CFF57' : '#FF8A3D');
    ctx.beginPath();
    ctx.arc(-badgeWidth / 2 + 8, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Small ready tag
    const statusText = this.afk ? 'DISCONNECTED' : (this.isGrinding ? 'GRINDING!' : (this.ready ? 'READY' : 'NOT READY'));
    ctx.font = '900 9px "Outfit", sans-serif';
    ctx.fillStyle = this.afk ? '#ef4444' : (this.isGrinding ? '#ffe600' : (this.ready ? '#8CFF57' : '#FF8A3D'));
    ctx.fillText(statusText, 0, 17);

    ctx.restore();
  }
}
