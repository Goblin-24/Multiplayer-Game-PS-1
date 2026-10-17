'use strict';

module.exports = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  res.status(200).json({
    status: 'ok',
    service: 'Alley Rats Multiplayer Backend (Vercel Serverless)',
    platform: 'vercel',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
};

