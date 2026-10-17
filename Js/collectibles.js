/**
 * ALLEY RATS: SKATE & SPRAY
 * Collectibles & Item Pickup System
 * Items:
 * - Skate Tokens / Coins (+50 pts)
 * - Energy Drink Boost (+3.5s Nitro speed)
 * - Spray Can (+100 pts + Paint trail)
 * - Golden Skateboard Wheel (+500 pts rare jackpot)
 * - Trick Multiplier (x2 combo boost)
 */

function createPRNG(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Collectible {
  constructor(data) {
    this.id = data.id;
    this.type = data.type; // 'coin', 'boost', 'spray_can', 'golden_wheel', 'multiplier'
    this.worldX = data.worldX;
    this.heightFromGround = data.heightFromGround || 40; // Pixels above ground
    this.width = data.width || 34;
    this.height = data.height || 34;
    this.points = data.points || 50;

    this.collected = false;
    this.collectAnim = 0; // 0..1 for floating fade out
    this.floatTimer = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.floatTimer += dt * 4;
    if (this.collected && this.collectAnim < 1) {
      this.collectAnim = Math.min(1, this.collectAnim + dt * 2.8);
    }
  }

  getHitbox(groundY) {
    const floatOffset = Math.sin(this.floatTimer) * 6;
    const y = groundY - this.heightFromGround + floatOffset;
    return {
      x: this.worldX,
      y: y - this.height / 2,
      width: this.width,
      height: this.height
    };
  }

  render(ctx, screenX, groundY) {
    const floatOffset = Math.sin(this.floatTimer) * 6;
    let drawY = groundY - this.heightFromGround + floatOffset;

    ctx.save();
    ctx.translate(screenX + this.width / 2, drawY);

    if (this.collected) {
      // Floating score number
      const fadeY = -this.collectAnim * 40;
      ctx.globalAlpha = Math.max(0, 1 - this.collectAnim);
      ctx.font = '900 16px "Outfit", sans-serif';
      ctx.fillStyle = '#8CFF57';
      ctx.strokeStyle = '#0a0d14';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(`+${this.points}`, 0, fadeY);
      ctx.fillText(`+${this.points}`, 0, fadeY);
      ctx.restore();
      return;
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0a0d14';

    if (this.type === 'coin') {
      // Golden skate token
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#0a0d14';
      ctx.font = '900 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RAT', 0, 0);
    } else if (this.type === 'boost') {
      // Energy drink can
      ctx.fillStyle = '#35D7FF';
      ctx.beginPath();
      ctx.roundRect(-8, -16, 16, 32, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FF8A3D';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(2, 0);
      ctx.lineTo(-1, 8);
      ctx.lineTo(4, 0);
      ctx.lineTo(-1, 0);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'spray_can') {
      // Spray can pickup
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.roundRect(-8, -14, 16, 28, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-4, -18, 8, 4);
      ctx.strokeRect(-4, -18, 8, 4);
    } else if (this.type === 'golden_wheel') {
      // Rare golden wheel
      ctx.fillStyle = '#ffe600';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Multiplier token
      ctx.fillStyle = '#A970FF';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F3E8D0';
      ctx.font = '900 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', 0, 0);
    }

    ctx.restore();
  }
}

export class CollectibleManager {
  constructor(courseSeed = 7421) {
    this.seed = courseSeed;
    this.rng = createPRNG(courseSeed + 999);
    this.collectibles = [];
    this.nextSpawnDistance = 350;
    this.itemIndex = 0;
  }

  reset(courseSeed = this.seed) {
    this.seed = courseSeed;
    this.rng = createPRNG(courseSeed + 999);
    this.collectibles = [];
    this.nextSpawnDistance = 350;
    this.itemIndex = 0;
  }

  update(playerDistance, viewportWidth) {
    while (this.nextSpawnDistance < playerDistance + viewportWidth + 800) {
      this._spawnNextCollectible(this.nextSpawnDistance);
      this.nextSpawnDistance += 180 + Math.floor(this.rng() * 220);
    }

    // Prune collected and off-screen items
    const pruneThreshold = playerDistance - 400;
    this.collectibles = this.collectibles.filter(item => 
      item.worldX > pruneThreshold && (!item.collected || item.collectAnim < 1)
    );
  }

  _spawnNextCollectible(worldX) {
    this.itemIndex++;
    const roll = this.rng();
    const id = `item_${this.itemIndex}`;

    // Vary heights (some low on ground, some high above ramps to reward jumping!)
    const heightFromGround = roll < 0.35 ? 30 : (roll < 0.7 ? 80 : 130);

    let type = 'coin';
    let points = 50;

    if (roll < 0.6) {
      type = 'coin';
      points = 50;
    } else if (roll < 0.78) {
      type = 'boost';
      points = 75;
    } else if (roll < 0.90) {
      type = 'spray_can';
      points = 100;
    } else if (roll < 0.96) {
      type = 'multiplier';
      points = 150;
    } else {
      type = 'golden_wheel';
      points = 500;
    }

    this.collectibles.push(new Collectible({
      id,
      type,
      worldX,
      heightFromGround,
      points
    }));
  }

  getActiveCollectibles() {
    return this.collectibles;
  }
}
