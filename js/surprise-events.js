/**
 * ALLEY RATS: SKATE & SPRAY
 * Surprise Humor Event Manager
 * Features:
 * - Giant Rubber Duck (bouncing across the street with quacks!)
 * - Runaway Shopping Trolley (high-speed wobble hazard)
 * - Pigeon Apocalypse (feathers swirling across screen)
 * - Tiny Dog Enormous Confidence (barking chase with escape bonus)
 * - Inflatable Dinosaur (giant inflatable T-Rex obstacle)
 * - Garden Gnome Invasion (parade of gnomes)
 * - Fake Finish Line ("YOU MADE IT! ... JUST KIDDING, SEND IT!")
 * - Skateboard Speed Demon (hyper-boost nitro mode)
 */

import { Sound } from './audio.js';

export class SurpriseEventManager {
  constructor(courseSeed = 7421) {
    this.seed = courseSeed;
    this.activeEvent = null;
    this.eventCooldown = 22; // Seconds between surprise events
    this.eventTimer = 0;
    this.eventHistory = [];
    
    // Feathers particle pool for Pigeon Apocalypse
    this.feathers = [];

    // Chasing tiny dog state
    this.dogOffset = -180;
  }

  reset() {
    this.activeEvent = null;
    this.eventTimer = 18; // First event triggers after ~18s
    this.eventHistory = [];
    this.feathers = [];
    this.dogOffset = -180;
  }

  update(dt, playerSpeed, onEventStart = null, onEventEnd = null) {
    // 1. Cooldown & Trigger Next Event
    if (!this.activeEvent) {
      this.eventTimer -= dt;
      if (this.eventTimer <= 0) {
        this._triggerRandomEvent(onEventStart);
        this.eventTimer = this.eventCooldown + Math.random() * 12;
      }
    } else {
      // 2. Update Active Event Duration
      this.activeEvent.duration -= dt;
      this.activeEvent.timeElapsed += dt;

      // Event specific animations
      if (this.activeEvent.type === 'duck') {
        this.activeEvent.duckX += (playerSpeed * 0.45) * dt;
        this.activeEvent.duckBounce = Math.abs(Math.sin(this.activeEvent.timeElapsed * 5)) * 40;
      } else if (this.activeEvent.type === 'pigeon_apocalypse') {
        this._updateFeathers(dt);
      } else if (this.activeEvent.type === 'tiny_dog') {
        // Dog runs behind player
        this.dogOffset = Math.min(-60, this.dogOffset + dt * 15);
      }

      // Check event completion
      if (this.activeEvent.duration <= 0) {
        if (onEventEnd) onEventEnd(this.activeEvent);
        this.activeEvent = null;
      }
    }
  }

  _triggerRandomEvent(onEventStart) {
    const events = [
      {
        type: 'duck',
        title: '🦆 GIANT RUBBER DUCK!',
        subtitle: 'Watch out for the squeaky monster!',
        duration: 9.0,
        duckX: 700,
        duckBounce: 0
      },
      {
        type: 'pigeon_apocalypse',
        title: '🐦 PIGEON APOCALYPSE!',
        subtitle: 'Feathers everywhere! Low visibility!',
        duration: 7.5
      },
      {
        type: 'tiny_dog',
        title: '🐕 TINY DOG, ENORMOUS CONFIDENCE!',
        subtitle: 'Outrun the pocket menace for a 500pt bonus!',
        duration: 8.0
      },
      {
        type: 'fake_finish',
        title: '🏁 FAKE FINISH LINE!',
        subtitle: 'YOU MADE IT!... Just kidding! SEND IT!',
        duration: 6.0
      },
      {
        type: 'speed_demon',
        title: '⚡ SPEED DEMON!',
        subtitle: 'Possessed board! Hyper speed unlocked!',
        duration: 5.5
      }
    ];

    // Pick event that wasn't just played
    const lastType = this.eventHistory.length > 0 ? this.eventHistory[this.eventHistory.length - 1] : null;
    const pool = events.filter(e => e.type !== lastType);
    const selected = pool[Math.floor(Math.random() * pool.length)];

    this.activeEvent = {
      ...selected,
      timeElapsed: 0
    };
    this.eventHistory.push(selected.type);

    // Audio cue
    if (selected.type === 'duck') {
      Sound.playClick(0.6); // Quack proxy
    } else if (selected.type === 'pigeon_apocalypse') {
      Sound.playPigeonFlutter();
      this._spawnFeathers(32);
    } else if (selected.type === 'speed_demon') {
      Sound.playReadyBeep(true);
    }

    if (onEventStart) {
      onEventStart(this.activeEvent);
    }
  }

  _spawnFeathers(count = 24) {
    this.feathers = [];
    for (let i = 0; i < count; i++) {
      this.feathers.push({
        x: Math.random() * 1200,
        y: -20 - Math.random() * 100,
        vx: -120 - Math.random() * 180,
        vy: 60 + Math.random() * 90,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 6,
        size: 14 + Math.random() * 18,
        color: Math.random() < 0.7 ? '#F3E8D0' : '#94a3b8'
      });
    }
  }

  _updateFeathers(dt) {
    for (const f of this.feathers) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.rotSpeed * dt;
      if (f.y > 800) f.y = -20;
      if (f.x < -40) f.x = 1240;
    }
  }

  /**
   * Render surprise event graphics on Canvas
   */
  render(ctx, width, height, playerScreenX, groundY) {
    if (!this.activeEvent) return;

    ctx.save();

    if (this.activeEvent.type === 'duck') {
      // Giant Rubber Duck bouncing on street
      const duckX = playerScreenX + this.activeEvent.duckX;
      const duckY = groundY - this.activeEvent.duckBounce - 80;

      if (duckX > -120 && duckX < width + 120) {
        this._renderGiantDuck(ctx, duckX, duckY);
      }
    } else if (this.activeEvent.type === 'pigeon_apocalypse') {
      // Feathers swirling across screen
      for (const f of this.feathers) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, f.size, f.size * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0a0d14';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    } else if (this.activeEvent.type === 'tiny_dog') {
      // Tiny barking terrier chasing the player
      const dogX = playerScreenX + this.dogOffset;
      if (dogX > -80) {
        this._renderChasingDog(ctx, dogX, groundY - 24, this.activeEvent.timeElapsed);
      }
    } else if (this.activeEvent.type === 'fake_finish') {
      // Fake Finish Line Banner
      const bannerX = playerScreenX + 320;
      this._renderFakeFinishBanner(ctx, bannerX, groundY);
    }

    ctx.restore();
  }

  _renderGiantDuck(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0a0d14';

    // Duck body
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Duck head
    ctx.beginPath();
    ctx.arc(38, -24, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Orange Beak
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.moveTo(56, -26);
    ctx.lineTo(82, -20);
    ctx.lineTo(56, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cartoon Eye
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.arc(48, -30, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(49, -32, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _renderChasingDog(ctx, x, y, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.2, 1.2);
    const bob = Math.abs(Math.sin(time * 16)) * 6;

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0a0d14';
    ctx.fillStyle = '#b45309';

    // Body
    ctx.beginPath();
    ctx.roundRect(0, -bob, 28, 16, 6);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(28, -6 - bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.moveTo(24, -14 - bob);
    ctx.lineTo(28, -20 - bob);
    ctx.lineTo(31, -14 - bob);
    ctx.fill();
    ctx.stroke();

    // Bark bubble
    if (Math.sin(time * 8) > 0.4) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(28, -34, 44, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0a0d14';
      ctx.font = '900 10px sans-serif';
      ctx.fillText('YAP! YAP!', 32, -22);
    }

    ctx.restore();
  }

  _renderFakeFinishBanner(ctx, x, groundY) {
    ctx.save();
    ctx.translate(x, groundY - 140);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0a0d14';

    // Banner poles
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 8, 140);
    ctx.strokeRect(0, 0, 8, 140);

    // Banner fabric
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(8, 10, 160, 44);
    ctx.strokeRect(8, 10, 160, 44);

    ctx.fillStyle = '#0a0d14';
    ctx.font = '900 14px "Rubik Dirt", "Impact", sans-serif';
    ctx.fillText('YOU MADE IT!', 20, 36);

    ctx.restore();
  }
}
