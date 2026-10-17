/**
 * ALLEY RATS: SKATE & SPRAY
 * 2D Racing Physics & Collision Engine
 * Supports:
 * - Gravity, jump velocity, variable air control
 * - Ducking / sliding (lowers hitbox to pass under barriers/signs)
 * - Ground & rail snapping with grind physics
 * - Forgiving AABB collision detection with inner hitboxes
 * - Knockback, invincibility frames, and boost acceleration
 */

export class RacingPhysics {
  constructor(options = {}) {
    this.gravity = options.gravity || 1550; // px/s^2 smooth natural skateboard arc
    this.jumpForce = options.jumpForce || -700; // px/s high floaty Ollie
    this.groundY = options.groundY || 620; // Default ground Y in world coordinates
    this.baseSpeed = options.baseSpeed || 380; // px/s balanced midway forward scroll
    this.maxSpeed = options.maxSpeed || 720;
    
    // Player physical dimensions
    this.width = 64;
    this.height = 74;
    this.duckHeight = 38; // 50% height when ducking

    // State
    this.reset();
  }

  reset() {
    this.y = this.groundY;
    this.vy = 0;
    this.speed = this.baseSpeed;
    this.targetSpeed = this.baseSpeed;
    
    this.onGround = true;
    this.isJumping = false;
    this.isDucking = false;
    this.isGrinding = false;
    this.isBoosting = false;
    this.boostTimer = 0;
    
    // Collision reactions
    this.isInvincible = false;
    this.invincibleTimer = 0;
    this.isKnockedBack = false;
    this.knockbackTimer = 0;
    
    // Trick / air state
    this.airTime = 0;
    this.trickRotation = 0;
    this.isDoingTrick = false;
  }

  jump() {
    if (this.onGround || this.isGrinding) {
      this.vy = this.jumpForce;
      this.onGround = false;
      this.isJumping = true;
      this.isGrinding = false;
      this.isDucking = false;
      this.airTime = 0;
      return true;
    }
    return false;
  }

  duck(isDucking) {
    if (this.onGround) {
      this.isDucking = isDucking;
    } else {
      // Fast fall if ducking in air
      if (isDucking && this.vy < 300) {
        this.vy += 450;
      }
      this.isDucking = isDucking;
    }
  }

  applyBoost(duration = 3.5, speedMultiplier = 1.45) {
    this.isBoosting = true;
    this.boostTimer = duration;
    this.targetSpeed = Math.min(this.maxSpeed, this.baseSpeed * speedMultiplier);
  }

  applyKnockback(slowdownMultiplier = 0.45, invincibilityDuration = 1.4) {
    if (this.isInvincible) return false;

    this.isKnockedBack = true;
    this.knockbackTimer = 0.35;
    this.isInvincible = true;
    this.invincibleTimer = invincibilityDuration;

    // Slow down speed
    this.speed = Math.max(220, this.speed * slowdownMultiplier);
    this.targetSpeed = this.baseSpeed;
    this.isBoosting = false;
    this.boostTimer = 0;
    return true;
  }

  update(dt) {
    // Clamp dt to avoid physics explodes on tab switch
    const safeDt = Math.min(dt, 0.05);

    // 1. Boost timer
    if (this.isBoosting) {
      this.boostTimer -= safeDt;
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
        this.targetSpeed = this.baseSpeed;
      }
    }

    // 2. Speed interpolation (acceleration / deceleration)
    if (this.speed < this.targetSpeed) {
      this.speed = Math.min(this.targetSpeed, this.speed + 380 * safeDt);
    } else if (this.speed > this.targetSpeed) {
      this.speed = Math.max(this.targetSpeed, this.speed - 280 * safeDt);
    }

    // 3. Invincibility timer
    if (this.isInvincible) {
      this.invincibleTimer -= safeDt;
      if (this.invincibleTimer <= 0) {
        this.isInvincible = false;
      }
    }

    // 4. Knockback timer
    if (this.isKnockedBack) {
      this.knockbackTimer -= safeDt;
      if (this.knockbackTimer <= 0) {
        this.isKnockedBack = false;
      }
    }

    // 5. Vertical simulation (Gravity & jumping)
    if (!this.onGround && !this.isGrinding) {
      this.airTime += safeDt;
      this.vy += this.gravity * safeDt;
      this.y += this.vy * safeDt;

      // Landing detection
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.onGround = true;
        this.isJumping = false;
        this.isDoingTrick = false;
        this.trickRotation = 0;
      }
    }

    // 6. Air trick rotation
    if (!this.onGround && this.isDoingTrick) {
      this.trickRotation += safeDt * 18;
    }
  }

  /**
   * Get player's active AABB collision hitbox (inset for generous gameplay feel)
   */
  getHitbox(playerX) {
    const currentHeight = this.isDucking ? this.duckHeight : this.height;
    const topY = this.y - currentHeight;

    // 15% inner padding for forgiving cartoon hitbox
    const padX = this.width * 0.18;
    const padY = currentHeight * 0.14;

    return {
      x: playerX + padX,
      y: topY + padY,
      width: this.width - padX * 2,
      height: currentHeight - padY * 2
    };
  }

  /**
   * Fast AABB vs AABB intersection test
   */
  static checkCollision(boxA, boxB) {
    return (
      boxA.x < boxB.x + boxB.width &&
      boxA.x + boxA.width > boxB.x &&
      boxA.y < boxB.y + boxB.height &&
      boxA.y + boxA.height > boxB.y
    );
  }
}
