/**
 * ALLEY RATS: SKATE & SPRAY
 * Race Scoring, Combo Multipliers & Event Deduplication
 */

export class RaceScoring {
  constructor(options = {}) {
    this.distancePerPixel = options.distancePerPixel || 0.15; // meters per pixel
    this.checkpointInterval = options.checkpointInterval || 500; // Checkpoint every 500m
    
    this.reset();
  }

  reset() {
    this.distance = 0; // In meters
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.maxComboTimer = 2.8; // Seconds to chain tricks before combo drops
    
    this.currentCheckpoint = 0;
    this.collectedItems = new Set();
    this.avoidedObstacles = new Set();
    this.eventSequence = 0;
    this.pendingEvents = [];
  }

  update(dt, pixelsMoved) {
    // 1. Distance accumulation
    const metersDelta = pixelsMoved * this.distancePerPixel;
    this.distance += metersDelta;
    // Base distance points (1 point every 2 meters)
    this.score += Math.floor(metersDelta * 0.5);

    // 2. Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
      }
    }

    // 3. Checkpoint detection
    const reachedCheckpoint = Math.floor(this.distance / this.checkpointInterval);
    if (reachedCheckpoint > this.currentCheckpoint) {
      this.currentCheckpoint = reachedCheckpoint;
      this.addScore(500 * this.currentCheckpoint, 'checkpoint');
      return { isCheckpoint: true, checkpointNumber: this.currentCheckpoint };
    }

    return { isCheckpoint: false };
  }

  addScore(basePoints, reason = 'bonus') {
    const totalAdded = Math.round(basePoints * this.combo);
    this.score += totalAdded;

    this.eventSequence++;
    const event = {
      seq: this.eventSequence,
      type: reason,
      points: totalAdded,
      distance: Math.round(this.distance),
      timestamp: Date.now()
    };
    this.pendingEvents.push(event);

    return totalAdded;
  }

  addCollectible(item) {
    if (!item || this.collectedItems.has(item.id)) {
      return 0; // Strictly prevent duplicate collection
    }
    this.collectedItems.add(item.id);

    // Multiplier token increments combo directly
    if (item.type === 'multiplier') {
      this.combo = Math.min(8, this.combo + 1);
      this.comboTimer = this.maxComboTimer;
    }

    const pts = this.addScore(item.points, `collect_${item.type}`);
    return pts;
  }

  addAvoidedObstacle(obs) {
    if (!obs || this.avoidedObstacles.has(obs.id)) {
      return 0;
    }
    this.avoidedObstacles.add(obs.id);

    // Boost combo for jumping cleanly over obstacles
    this.combo = Math.min(8, this.combo + 1);
    this.comboTimer = this.maxComboTimer;

    return this.addScore(obs.scoreValue || 60, 'avoid_obstacle');
  }

  addTrick(trickName, basePoints = 120) {
    this.combo = Math.min(8, this.combo + 1);
    this.comboTimer = this.maxComboTimer;
    return this.addScore(basePoints, `trick_${trickName}`);
  }

  resetComboOnHit() {
    this.combo = 1;
    this.comboTimer = 0;
  }

  getSnapshot(raceId, playerId, sessionId, courseSeed) {
    return {
      raceId,
      playerId,
      sessionId,
      courseSeed,
      distance: Math.round(this.distance),
      score: this.score,
      combo: this.combo,
      checkpoint: this.currentCheckpoint,
      collectiblesCount: this.collectedItems.size,
      lastEventSequence: this.eventSequence,
      timestamp: Date.now()
    };
  }
}
