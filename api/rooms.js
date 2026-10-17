'use strict';

module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const roomId = (req.query && req.query.id ? req.query.id : 'RAT-0001').toUpperCase();

  res.status(200).json({
    roomId,
    activePlayers: 1,
    totalRegisteredPlayers: 1,
    graffitiStrokeCount: 0,
    raceStatus: 'waiting',
    platform: 'vercel-serverless',
    timestamp: Date.now()
  });
};

