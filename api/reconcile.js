'use strict';

module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ accepted: false, error: 'Method Not Allowed' });
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (parseErr) {
        return res.status(400).json({ accepted: false, error: 'Malformed JSON payload' });
      }
    }
    payload = payload || {};

    const { roomId, playerId, raceId, distance, score, checkpoint } = payload;
    const acceptedScore = Math.max(0, Number(score) || 0);
    const acceptedDistance = Math.min(1500, Math.max(0, Number(distance) || 0));

    return res.status(200).json({
      accepted: true,
      raceId: raceId || null,
      roomId: (roomId || 'RAT-0001').toUpperCase(),
      playerId: playerId || 'anonymous',
      acceptedDistance,
      acceptedScore,
      checkpoint: checkpoint || 0,
      pointsGained: acceptedScore,
      platform: 'vercel-serverless',
      serverTimestamp: Date.now()
    });
  } catch (err) {
    return res.status(400).json({ accepted: false, error: err.message || 'Internal error' });
  }
};

