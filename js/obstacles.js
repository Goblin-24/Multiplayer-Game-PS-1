/**
 * ALLEY RATS: SKATE & SPRAY
 * Data-Driven Racing Obstacle Engine & Deterministic Course Generator
 * Categories:
 * - Street Obstacles: Cars, Taxis, Vans, Bins, Cones, Potholes, Puddles, Barriers, Hydrants, Trolleys
 * - People & Animals: Pedestrians, Dogs, Cats, Skate Punks
 * - Skatepark Features: Kick Ramps (launch into air), Grind Rails (grind with sparks)
 */

// Seeded PRNG (Mulberry32) for deterministic course generation across all multiplayer clients
function createPRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Obstacle {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.worldX = data.worldX;
    this.worldYOffset = data.worldYOffset || 0; // Negative = off ground (e.g. overhead signs)
    this.width = data.width || 60;
    this.height = data.height || 50;
    
    // Physics & Interaction
    this.hit = false;
    this.passed = false;
    this.requiresDuck = Boolean(data.requiresDuck);
    this.isRamp = Boolean(data.isRamp);
    this.isRail = Boolean(data.isRail);
    this.isMoving = Boolean(data.isMoving);
    this.moveSpeed = data.moveSpeed || 0;
    this.scoreValue = data.scoreValue || 50;
    
    // Custom properties
    this.color = data.color || '#FF8A3D';
    this.name = data.name || data.type;
    this.effect = data.effect || 'slowdown'; // 'slowdown', 'slip', 'launch', 'grind'
    
    // Animation
    this.animTime = Math.random() * 5;
    this.hitAnimation = 0;
  }

  update(dt, playerSpeed) {
    this.animTime += dt;
    if (this.isMoving) {
      this.worldX -= this.moveSpeed * dt;
    }
    if (this.hit && this.hitAnimation < 1) {
      this.hitAnimation = Math.min(1, this.hitAnimation + dt * 4);
    }
  }

  getHitbox(groundY, screenX = null) {
    const bottomY = groundY + this.worldYOffset;
    const topY = bottomY - this.height;

    // Generous inset so cartoon hitboxes feel fair
    const insetX = this.width * 0.12;
    const insetY = this.height * 0.12;
    const posX = (screenX !== null ? screenX : this.worldX);

    return {
      x: posX + insetX,
      y: topY + insetY,
      width: this.width - insetX * 2,
      height: this.height - insetY * 2
    };
  }

  _renderNeonRays(ctx, neonColor, actionText) {
    ctx.save();
    const pulse = 0.7 + Math.sin(this.animTime * 6) * 0.3;
    const cx = this.width / 2;
    const cy = this.height / 2;

    // 1. Radial Neon Glow Halo
    const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(this.width, this.height) * 1.15);
    grad.addColorStop(0, neonColor);
    grad.addColorStop(0.35, neonColor + '55');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - this.width * 1.4, cy - this.height * 1.4, this.width * 2.8, this.height * 2.8);

    // 2. Beaming Vertical Hazard Rays
    ctx.strokeStyle = neonColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.65 * pulse;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      const ox = cx + i * (this.width / 3.2);
      ctx.moveTo(ox, cy);
      ctx.lineTo(ox + i * 8, -36 - Math.abs(i) * 5);
      ctx.stroke();
    }

    // 3. Floating Neon Action Prompt Pill (JUMP! / DUCK! / RAMP!)
    if (actionText) {
      ctx.font = '900 12px "Rubik Dirt", Impact, sans-serif';
      ctx.textAlign = 'center';
      const textY = this.requiresDuck ? this.height + 20 : -18;
      
      const textW = ctx.measureText(actionText).width + 14;
      ctx.fillStyle = '#0a0d14';
      ctx.beginPath();
      ctx.roundRect(cx - textW / 2, textY - 13, textW, 18, 4);
      ctx.fill();
      ctx.strokeStyle = neonColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = neonColor;
      ctx.shadowColor = neonColor;
      ctx.shadowBlur = 10 * pulse;
      ctx.fillText(actionText, cx, textY);
    }

    ctx.restore();
  }

  render(ctx, screenX, groundY) {
    const drawY = groundY + this.worldYOffset - this.height;

    ctx.save();
    ctx.translate(screenX, drawY);

    if (this.hit) {
      ctx.rotate(this.hitAnimation * 0.45);
      ctx.translate(0, this.hitAnimation * 10);
    }

    // Neon Glowing Rays & Warning Label
    let neonColor = '#FF007F';
    let actionLabel = '⬆️ JUMP!';

    if (this.isRamp) {
      neonColor = '#39FF14';
      actionLabel = '🚀 RAMP!';
    } else if (this.isRail) {
      neonColor = '#FFE600';
      actionLabel = '⚡ RAIL!';
    } else if (this.requiresDuck) {
      neonColor = '#00F0FF';
      actionLabel = '⬇️ DUCK!';
    } else if (this.type === 'puddle') {
      neonColor = '#35D7FF';
      actionLabel = 'SLIDE';
    }

    this._renderNeonRays(ctx, neonColor, actionLabel);

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0a0d14';
    ctx.lineJoin = 'round';

    switch (this.type) {
      case 'car':
      case 'taxi':
        this._renderCar(ctx);
        break;
      case 'overhead_sign':
        this._renderOverheadSign(ctx);
        break;
      case 'trash_can':
        this._renderTrashCan(ctx);
        break;
      case 'cone':
        this._renderCone(ctx);
        break;
      case 'puddle':
        this._renderPuddle(ctx);
        break;
      case 'fire_hydrant':
        this._renderHydrant(ctx);
        break;
      case 'barrier':
        this._renderBarrier(ctx);
        break;
      case 'shopping_trolley':
        this._renderTrolley(ctx);
        break;
      case 'ramp':
        this._renderRamp(ctx);
        break;
      case 'rail':
        this._renderRail(ctx);
        break;
      case 'pedestrian':
        this._renderPedestrian(ctx);
        break;
      case 'dog':
        this._renderDog(ctx);
        break;
      default:
        this._renderDefaultBox(ctx);
    }

    ctx.restore();
  }

  _renderOverheadSign(ctx) {
    // Metal suspension cables from top
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(12, -45);
    ctx.lineTo(12, 0);
    ctx.moveTo(this.width - 12, -45);
    ctx.lineTo(this.width - 12, 0);
    ctx.stroke();

    // Heavy Caution Beam
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, this.width, this.height);

    // Hazard Caution Diagonal Stripes
    ctx.fillStyle = '#00F0FF';
    for (let x = 6; x < this.width - 6; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 9, 0);
      ctx.lineTo(x + 3, this.height);
      ctx.lineTo(x - 6, this.height);
      ctx.closePath();
      ctx.fill();
    }

    // Neon text: LOW CLEARANCE / CAUTION
    ctx.fillStyle = '#FFE600';
    ctx.font = '900 11px "Rubik Dirt", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ LOW ROOF', this.width / 2, this.height / 2 + 4);
  }

  _renderCar(ctx) {
    const isTaxi = (this.type === 'taxi');
    const bodyColor = isTaxi ? '#ffe600' : '#A94335';

    // Car Body Chassis
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(0, 24, this.width, this.height - 24, [10, 10, 4, 4]);
    ctx.fill();
    ctx.stroke();

    // Cabin roof
    ctx.fillStyle = '#25272B';
    ctx.beginPath();
    ctx.roundRect(16, 0, this.width - 34, 28, [12, 12, 0, 0]);
    ctx.fill();
    ctx.stroke();

    // Windows
    ctx.fillStyle = '#35D7FF';
    ctx.fillRect(20, 6, 22, 16);
    ctx.fillRect(48, 6, 26, 16);

    // Taxi checkerboard stripe or roof sign
    if (isTaxi) {
      ctx.fillStyle = '#25272B';
      for (let x = 4; x < this.width - 8; x += 12) {
        ctx.fillRect(x, 26, 6, 6);
      }
      // Roof Light
      ctx.fillStyle = '#FF8A3D';
      ctx.fillRect(this.width / 2 - 12, -8, 24, 9);
      ctx.strokeRect(this.width / 2 - 12, -8, 24, 9);
    }

    // Headlights
    ctx.fillStyle = '#F3E8D0';
    ctx.beginPath();
    ctx.arc(6, 32, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Rubber Wheels
    [-4, this.width - 24].forEach(wx => {
      ctx.fillStyle = '#1e2433';
      ctx.beginPath();
      ctx.arc(wx + 10, this.height - 2, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(wx + 10, this.height - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  _renderTrashCan(ctx) {
    // Metal wheelie bin / trash can
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(this.width - 4, 0);
    ctx.lineTo(this.width - 10, this.height);
    ctx.lineTo(10, this.height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lid
    ctx.fillStyle = '#8CFF57'; // Green lid
    ctx.beginPath();
    ctx.roundRect(0, -6, this.width, 8, 4);
    ctx.fill();
    ctx.stroke();

    // Trash overflow detail
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(10, -12, 14, 8);
  }

  _renderCone(ctx) {
    // Traffic cone
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.moveTo(this.width / 2, 0);
    ctx.lineTo(this.width - 4, this.height - 6);
    ctx.lineTo(4, this.height - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // White reflective band
    ctx.fillStyle = '#F3E8D0';
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 7, 16);
    ctx.lineTo(this.width / 2 + 7, 16);
    ctx.lineTo(this.width / 2 + 12, 28);
    ctx.lineTo(this.width / 2 - 12, 28);
    ctx.closePath();
    ctx.fill();

    // Base plate
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.roundRect(0, this.height - 7, this.width, 7, 2);
    ctx.fill();
    ctx.stroke();
  }

  _renderPuddle(ctx) {
    ctx.fillStyle = '#35D7FF';
    ctx.beginPath();
    ctx.ellipse(this.width / 2, this.height - 4, this.width / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ripple
    ctx.strokeStyle = '#F3E8D0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(this.width / 2, this.height - 4, this.width / 3, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _renderHydrant(ctx) {
    // Red US/UK fire hydrant
    ctx.fillStyle = '#A94335';
    ctx.beginPath();
    ctx.roundRect(8, 10, this.width - 16, this.height - 10, 4);
    ctx.fill();
    ctx.stroke();

    // Top cap
    ctx.beginPath();
    ctx.arc(this.width / 2, 10, 10, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    // Side nozzle bolts
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(0, 20, 8, 8);
    ctx.strokeRect(0, 20, 8, 8);
    ctx.fillRect(this.width - 8, 20, 8, 8);
    ctx.strokeRect(this.width - 8, 20, 8, 8);
  }

  _renderBarrier(ctx) {
    // Striped road construction barrier
    ctx.fillStyle = '#25272B';
    ctx.fillRect(6, 20, 8, this.height - 20);
    ctx.fillRect(this.width - 14, 20, 8, this.height - 20);
    ctx.strokeRect(6, 20, 8, this.height - 20);
    ctx.strokeRect(this.width - 14, 20, 8, this.height - 20);

    // Striped crossbar
    ctx.fillStyle = '#FF8A3D';
    ctx.fillRect(0, 0, this.width, 22);
    ctx.strokeRect(0, 0, this.width, 22);

    // White stripes
    ctx.fillStyle = '#F3E8D0';
    for (let bx = 6; bx < this.width; bx += 20) {
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + 10, 0);
      ctx.lineTo(bx + 4, 22);
      ctx.lineTo(bx - 6, 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  _renderTrolley(ctx) {
    // Metal wire shopping cart
    ctx.fillStyle = '#cbd5e1';
    ctx.strokeRect(4, 4, this.width - 12, this.height - 16);
    // Wire grid
    ctx.lineWidth = 1.5;
    for (let gx = 10; gx < this.width - 12; gx += 8) {
      ctx.beginPath();
      ctx.moveTo(gx, 4);
      ctx.lineTo(gx, this.height - 12);
      ctx.stroke();
    }
    // Handle
    ctx.lineWidth = 3.5;
    ctx.fillStyle = '#FF8A3D';
    ctx.fillRect(this.width - 8, 0, 6, 14);
    // Wheels
    ctx.fillStyle = '#25272B';
    ctx.beginPath();
    ctx.arc(10, this.height - 4, 5, 0, Math.PI * 2);
    ctx.arc(this.width - 12, this.height - 4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _renderRamp(ctx) {
    // Wooden skate launch ramp
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.moveTo(0, this.height);
    ctx.quadraticCurveTo(this.width * 0.45, this.height, this.width, 0);
    ctx.lineTo(this.width, this.height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Metal transition plate
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, this.height - 4, 16, 4);

    // Neon launch arrow
    ctx.fillStyle = '#8CFF57';
    ctx.font = '900 12px sans-serif';
    ctx.fillText('▲ UP', this.width / 2 - 8, this.height - 12);
  }

  _renderRail(ctx) {
    // Steel skate grind rail
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, this.width, 8);
    ctx.strokeRect(0, 0, this.width, 8);

    // Support legs
    ctx.fillStyle = '#64748b';
    ctx.fillRect(10, 8, 6, this.height - 8);
    ctx.fillRect(this.width - 16, 8, 6, this.height - 8);
    ctx.strokeRect(10, 8, 6, this.height - 8);
    ctx.strokeRect(this.width - 16, 8, 6, this.height - 8);

    // Yellow grind tag
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(this.width / 2 - 12, 1, 24, 6);
  }

  _renderPedestrian(ctx) {
    // Cartoon pedestrian walking
    const stepBob = Math.sin(this.animTime * 6) * 3;
    ctx.fillStyle = '#A970FF';
    ctx.beginPath();
    ctx.roundRect(8, 16 + stepBob, this.width - 16, this.height - 24, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = '#ffd1a4';
    ctx.beginPath();
    ctx.arc(this.width / 2, 8 + stepBob, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Coffee cup in hand
    ctx.fillStyle = '#F3E8D0';
    ctx.fillRect(2, 22 + stepBob, 6, 8);
  }

  _renderDog(ctx) {
    // Funny small dog
    const runBob = Math.abs(Math.sin(this.animTime * 10)) * 4;
    ctx.fillStyle = '#b45309';
    // Body
    ctx.beginPath();
    ctx.roundRect(8, 12 - runBob, this.width - 16, 16, 6);
    ctx.fill();
    ctx.stroke();

    // Head & snout
    ctx.beginPath();
    ctx.arc(10, 10 - runBob, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wagging tail
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.width - 8, 16 - runBob);
    ctx.lineTo(this.width + 4, 6 - runBob + Math.sin(this.animTime * 20) * 6);
    ctx.stroke();
  }

  _renderDefaultBox(ctx) {
    ctx.fillStyle = this.color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeRect(0, 0, this.width, this.height);
  }
}

export class ObstacleManager {
  constructor(courseSeed = 7421) {
    this.seed = courseSeed;
    this.rng = createPRNG(courseSeed);
    this.obstacles = [];
    this.nextSpawnDistance = 900; // Start first obstacle after 900px runway
    this.obstacleIndex = 0;
  }

  reset(courseSeed = this.seed) {
    this.seed = courseSeed;
    this.rng = createPRNG(courseSeed);
    this.obstacles = [];
    this.nextSpawnDistance = 900;
    this.obstacleIndex = 0;
  }

  /**
   * Procedurally generate next obstacles deterministically based on player distance
   */
  update(playerDistance, viewportWidth, difficulty = 1.0) {
    // Spawn ahead of camera
    while (this.nextSpawnDistance < playerDistance + viewportWidth + 800) {
      this._spawnNextObstacle(this.nextSpawnDistance);
      // Spacing between obstacles scales with difficulty (balanced density, faster spawn rate after 35s)
      const baseSpacing = 680 + Math.floor(this.rng() * 420);
      const scaledSpacing = Math.max(450, Math.round(baseSpacing / Math.max(1, difficulty)));
      this.nextSpawnDistance += scaledSpacing;
    }

    // Prune off-screen obstacles behind player
    const pruneThreshold = playerDistance - 400;
    this.obstacles = this.obstacles.filter(obs => obs.worldX > pruneThreshold);
  }

  _spawnNextObstacle(worldX) {
    this.obstacleIndex++;
    const roll = this.rng();
    const id = `obs_${this.obstacleIndex}`;

    let data = { id, worldX };

    if (roll < 0.12) {
      // Traffic Cone (Jump over for bonus!)
      data = { ...data, type: 'cone', width: 44, height: 48, scoreValue: 75 };
    } else if (roll < 0.22) {
      // Trash can (Knocks over)
      data = { ...data, type: 'trash_can', width: 52, height: 62, effect: 'slowdown', scoreValue: 50 };
    } else if (roll < 0.32) {
      // Overhead Hanging Sign (Requires Ducking / Bow Down!)
      data = { 
        ...data, 
        type: 'overhead_sign', 
        width: 110, 
        height: 38, 
        worldYOffset: -46, 
        requiresDuck: true, 
        scoreValue: 120 
      };
    } else if (roll < 0.42) {
      // Puddle (Slippery speed burst or slide)
      data = { ...data, type: 'puddle', width: 72, height: 16, effect: 'slip', scoreValue: 40 };
    } else if (roll < 0.54) {
      // Skate Ramp (Launch high into air for trick combos!)
      data = { ...data, type: 'ramp', width: 84, height: 50, isRamp: true, effect: 'launch', scoreValue: 150 };
    } else if (roll < 0.65) {
      // Grind Rail (Land to 50-50 grind)
      data = { ...data, type: 'rail', width: 140, height: 38, isRail: true, effect: 'grind', scoreValue: 200 };
    } else if (roll < 0.76) {
      // Road Barrier
      data = { ...data, type: 'barrier', width: 78, height: 54, scoreValue: 90 };
    } else if (roll < 0.86) {
      // Fire Hydrant
      data = { ...data, type: 'fire_hydrant', width: 42, height: 52, scoreValue: 60 };
    } else if (roll < 0.94) {
      // Taxi / Car (Larger street vehicle)
      const isTaxi = this.rng() < 0.5;
      data = { ...data, type: isTaxi ? 'taxi' : 'car', width: 130, height: 65, scoreValue: 120 };
    } else {
      // Shopping trolley or dog
      data = { ...data, type: 'shopping_trolley', width: 64, height: 56, scoreValue: 80 };
    }

    this.obstacles.push(new Obstacle(data));
  }

  getActiveObstacles() {
    return this.obstacles;
  }
}
