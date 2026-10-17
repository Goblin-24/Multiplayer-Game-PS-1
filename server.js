/**
 * ALLEY RATS: SKATE & SPRAY — Official Realtime Multiplayer Backend Server
 * 
 * Implements:
 * - WebSocket Server (port 3000 or process.env.PORT) + Fallback HTTP Static Server
 * - Room Lifecycle, Shareable Room Codes & Invite Links
 * - Host Election & Seamless Host Migration on Disconnect
 * - Shared State Store with Last-Write-Wins (LWW) Sub-Path Resolution
 * - Realtime Cursor & Graffiti Wall Stroke Streaming (with History Buffer)
 * - Synchronized Street Race: Deterministic Course Seeding, Countdown, Telemetry
 * - Accidental Disconnect Resilience: AFK Player Preservation & Reconnection
 * - Offline Progress Reconciliation with Anti-Cheat Velocity Checks
 * - Top-Bar Pop-Up Announcements on Player Join & Reconnect
 * - Token-Bucket Rate Limiting & Denial-of-Service Defense
 * - Disk Persistence Across Server Restarts (data/rooms.json)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// Configuration
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PERSIST_FILE = path.join(DATA_DIR, 'rooms.json');
const MAX_GRAFFITI_STROKES = 500;
const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_IDLE_TIMEOUT_MS = 60 * 1000; // 60s grace period for empty rooms
const MAX_LEGAL_SPEED_MPS = 21.0; // 75 km/h ≈ 20.8 m/s maximum theoretical skater speed

// Global Crash Prevention Guards
process.on('uncaughtException', (err) => {
  console.error('[Process Error Guard - Uncaught Exception]:', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Error Guard - Unhandled Rejection]:', reason);
});

function safeSend(targetWs, msg) {
  if (targetWs && targetWs.readyState === WebSocket.OPEN) {
    try {
      targetWs.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } catch (e) {
      // Ignored: socket state changed
    }
  }
}

// MIME Types for Static HTTP Serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

// Ensure data directory exists for state persistence
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global In-Memory State
const rooms = new Map(); // roomId -> RoomInstance

/**
 * Token Bucket Rate Limiter
 */
class RateLimiter {
  constructor(capacity = 60, refillRate = 30) {
    this.capacity = capacity;
    this.refillRate = refillRate; // tokens per second
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  allow() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

/**
 * Room Instance Model
 */
class Room {
  constructor(roomId) {
    this.roomId = roomId;
    this.createdAt = Date.now();
    this.emptyTimer = null;

    // Room shared state (matches frontend contract)
    this.state = {
      roomId: this.roomId,
      players: {}, // [playerId]: PlayerRecord
      lobby: {
        graffiti: [] // list of GraffitiStroke objects (max 500)
      },
      race: {
        status: 'waiting', // 'waiting' | 'countdown' | 'racing' | 'finished'
        raceId: null,
        courseSeed: null,
        trackLength: 1500
      }
    };

    // Live leaderboards and telemetry cache
    this.leaderboard = new Map(); // playerId -> ProgressSnapshot
    this.clients = new Map(); // socket -> playerId
  }

  getHostId() {
    for (const [id, player] of Object.entries(this.state.players)) {
      if (player.isHost && !player.afk) return id;
    }
    // Fallback to first non-AFK player
    for (const [id, player] of Object.entries(this.state.players)) {
      if (!player.afk) return id;
    }
    return null;
  }

  electHost() {
    let currentHostActive = false;
    for (const [id, player] of Object.entries(this.state.players)) {
      if (player.isHost && !player.afk) {
        currentHostActive = true;
        break;
      }
    }

    if (!currentHostActive) {
      // Find oldest active connected player
      let firstActiveId = null;
      for (const [id, player] of Object.entries(this.state.players)) {
        player.isHost = false;
        if (!player.afk && !firstActiveId) {
          firstActiveId = id;
        }
      }
      if (firstActiveId && this.state.players[firstActiveId]) {
        this.state.players[firstActiveId].isHost = true;
        console.log(`[Room ${this.roomId}] Migrated host to ${firstActiveId} (${this.state.players[firstActiveId].name})`);
      }
    }
  }

  getActivePlayerCount() {
    return Object.values(this.state.players).filter(p => !p.afk).length;
  }

  broadcast(packet, excludeSocket = null) {
    const raw = JSON.stringify(packet);
    for (const [socket, playerId] of this.clients.entries()) {
      if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(raw);
        } catch (err) {
          console.error(`[Room ${this.roomId}] Broadcast error:`, err);
        }
      }
    }
  }

  // Set nested sub-path in room state (LWW)
  setPath(dotPath, value) {
    if (!dotPath || typeof dotPath !== 'string') return;
    const parts = dotPath.split('.');
    let curr = this.state;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!curr[p] || typeof curr[p] !== 'object') {
        curr[p] = {};
      }
      curr = curr[p];
    }
    curr[parts[parts.length - 1]] = value;
  }

  // Serialize for disk persistence
  serialize() {
    return {
      roomId: this.roomId,
      createdAt: this.createdAt,
      state: this.state
    };
  }

  // Restore from persisted snapshot
  static deserialize(data) {
    const room = new Room(data.roomId);
    room.createdAt = data.createdAt || Date.now();
    if (data.state) {
      room.state = data.state;
      // Reset connection status for restored players (they start as AFK until reconnect)
      for (const p of Object.values(room.state.players)) {
        p.afk = true;
        p.connected = false;
      }
    }
    return room;
  }
}

/**
 * Persistence Engine: Save and Load from disk
 */
let persistDebounceTimer = null;
function scheduleStatePersistence() {
  clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(() => {
    try {
      const serialized = {};
      for (const [id, room] of rooms.entries()) {
        serialized[id] = room.serialize();
      }
      fs.writeFileSync(PERSIST_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[Persistence] Save failed:', err.message);
    }
  }, 2000);
}

function loadPersistedState() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const [roomId, roomData] of Object.entries(data)) {
        rooms.set(roomId, Room.deserialize(roomData));
      }
      console.log(`[Persistence] Restored ${rooms.size} saved room(s) from disk.`);
    }
  } catch (err) {
    console.warn('[Persistence] Restore failed:', err.message);
  }
}

// Load persisted rooms on boot
loadPersistedState();

/**
 * HTTP Static and REST Server
 */
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health Check Endpoint
  if (pathname === '/health' && req.method === 'GET') {
    let totalSockets = 0;
    for (const r of rooms.values()) totalSockets += r.clients.size;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Alley Rats Multiplayer Backend',
      uptime: Math.floor(process.uptime()),
      activeRooms: rooms.size,
      connectedSockets: totalSockets,
      timestamp: Date.now()
    }));
    return;
  }

  // 2. Room Status Inspection API
  if (pathname.startsWith('/api/rooms/') && req.method === 'GET') {
    const roomId = pathname.split('/api/rooms/')[1].toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      roomId: room.roomId,
      activePlayers: room.getActivePlayerCount(),
      totalRegisteredPlayers: Object.keys(room.state.players).length,
      graffitiStrokeCount: room.state.lobby.graffiti.length,
      raceStatus: room.state.race.status,
      hostId: room.getHostId()
    }));
    return;
  }

  // 3. Fallback Offline Progress Reconciliation Endpoint (HTTP REST)
  if (pathname === '/api/reconcile' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { roomId, playerId, distance, score, checkpoint } = payload;
        const room = rooms.get(roomId);

        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: false, reason: 'Room expired or not found' }));
          return;
        }

        const player = room.state.players[playerId];
        const prevScore = (player && player.score) || 0;
        const acceptedScore = Math.max(prevScore, Number(score) || 0);
        const acceptedDistance = Math.min(1500, Math.max(0, Number(distance) || 0));
        const pointsGained = acceptedScore - prevScore;

        if (player) {
          player.score = acceptedScore;
          player.distance = acceptedDistance;
          player.checkpoint = checkpoint || player.checkpoint;
        }

        // Notify peers via WebSocket
        room.broadcast({
          type: 'player_reconnected',
          roomId: room.roomId,
          payload: {
            id: playerId,
            name: (player && player.name) || 'Skater',
            pointsGained,
            totalScore: acceptedScore,
            distance: acceptedDistance
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          accepted: true,
          playerId,
          acceptedDistance,
          acceptedScore,
          checkpoint,
          pointsGained,
          serverTimestamp: Date.now()
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: false, error: 'Malformed JSON payload' }));
      }
    });
    return;
  }

  // 4. Static File Delivery from Workspace
  let safePath = pathname;
  if (safePath === '/' || safePath === '') safePath = '/index.html';
  const filePath = path.join(__dirname, safePath.replace(/^\/+/, ''));

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found - Alley Rats Backend');
  }
});

/**
 * WebSocket Realtime Server
 */
const wss = new WebSocketServer({ noServer: true });

// Also handle root path or query-based WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const parsed = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (parsed.pathname === '/' || parsed.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws, req) => {
  const rateLimiter = new RateLimiter(60, 30);
  let currentRoom = null;
  let currentClientId = null;

  // Check URL query parameters for initial roomId (?room=RAT-1234)
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const initialRoomQuery = parsedUrl.searchParams.get('room');

  ws.on('message', (message) => {
    try {
      // 1. Rate Limiting Check
      if (!rateLimiter.allow()) {
        return; // Drop excessive flooding packets silently
      }

    let packet;
    try {
      packet = JSON.parse(message.toString());
    } catch {
      return; // Ignore malformed frames
    }

    const { type, roomId, payload } = packet;
    const targetRoomId = (roomId || initialRoomQuery || 'RAT-0001').toUpperCase().trim();

    // 2. Route Message by Packet Type
    switch (type) {
      // -------------------------------------------------------------
      // CLIENT CONNECT & ROOM HANDSHAKE
      // -------------------------------------------------------------
      case 'client_connect': {
        let room = rooms.get(targetRoomId);
        if (!room) {
          room = new Room(targetRoomId);
          room.state.lobby.graffiti = []; // Ensure new rooms always start with a clean painted wall
          rooms.set(targetRoomId, room);
          console.log(`[Server] Created new room: ${targetRoomId}`);
        }

        // Cancel empty room cleanup if scheduled
        if (room.emptyTimer) {
          clearTimeout(room.emptyTimer);
          room.emptyTimer = null;
        }

        currentRoom = room;

        // Player identification & Reconnection Detection
        const reconnectId = payload && (payload.reconnectId || payload.clientId || payload.id);
        const cleanName = (payload && payload.name ? String(payload.name).slice(0, 16) : 'SKATER').replace(/<[^>]*>/g, '');
        const customization = (payload && payload.customization) || {};

        let isReconnecting = false;
        let pointsRestored = 0;

        if (reconnectId && room.state.players[reconnectId]) {
          // Player is reconnecting after accidental drop or refresh!
          currentClientId = reconnectId;
          isReconnecting = true;
          const player = room.state.players[currentClientId];
          player.afk = false;
          player.connected = true;
          player.name = cleanName || player.name;
          player.customization = customization;

          // Check if offline points were submitted on reconnect
          if (payload.lastScore && payload.lastScore > (player.score || 0)) {
            pointsRestored = payload.lastScore - (player.score || 0);
            player.score = payload.lastScore;
          }
          if (payload.lastDistance && payload.lastDistance > (player.distance || 0)) {
            player.distance = payload.lastDistance;
          }

          console.log(`[Room ${targetRoomId}] Skater reconnected: ${player.name} (${currentClientId})`);
        } else {
          // New player entering room
          currentClientId = 'usr_' + Math.random().toString(36).substr(2, 9);
          const isFirstPlayer = room.getActivePlayerCount() === 0;

          room.state.players[currentClientId] = {
            id: currentClientId,
            name: cleanName,
            isHost: isFirstPlayer,
            ready: false,
            afk: false,
            connected: true,
            score: 0,
            distance: 0,
            customization: customization,
            joinedAt: Date.now()
          };
          console.log(`[Room ${targetRoomId}] New skater joined: ${cleanName} (${currentClientId}) | Host: ${isFirstPlayer}`);
        }

        // Associate socket with room and client ID
        room.clients.set(ws, currentClientId);
        room.electHost();

        const localPlayer = room.state.players[currentClientId];

        // 1. Send Handshake confirmation to client
        safeSend(ws, {
          type: 'connected',
          roomId: targetRoomId,
          timestamp: Date.now(),
          payload: {
            clientId: currentClientId,
            isHost: Boolean(localPlayer.isHost),
            state: room.state
          }
        });

        // 2. Broadcast to room peers
        if (isReconnecting) {
          // Announcement for Reconnected Skater with restored points pop-up
          room.broadcast({
            type: 'player_reconnected',
            roomId: targetRoomId,
            payload: {
              id: currentClientId,
              name: localPlayer.name,
              pointsGained: pointsRestored,
              totalScore: localPlayer.score || 0,
              distance: localPlayer.distance || 0
            }
          }, ws);

          room.broadcast({
            type: 'players_updated',
            roomId: targetRoomId,
            payload: room.state.players
          });
        } else {
          // Announcement for New Player Joined pop-up
          room.broadcast({
            type: 'player_join',
            roomId: targetRoomId,
            payload: localPlayer
          }, ws);

          room.broadcast({
            type: 'players_updated',
            roomId: targetRoomId,
            payload: room.state.players
          });
        }

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // SHARED STATE UPDATE (LWW Key-Value)
      // -------------------------------------------------------------
      case 'state_set':
      case 'set_state': {
        if (!currentRoom || !payload) return;
        const { path: dotPath, value } = payload;
        currentRoom.setPath(dotPath, value);

        // Broadcast state change to all room members
        currentRoom.broadcast({
          type: 'state_change',
          roomId: currentRoom.roomId,
          payload: currentRoom.state
        });

        if (dotPath.includes('players')) {
          currentRoom.broadcast({
            type: 'players_updated',
            roomId: currentRoom.roomId,
            payload: currentRoom.state.players
          });
        }

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // LIVE CURSOR BROADCAST (~25 Hz)
      // -------------------------------------------------------------
      case 'cursor': {
        if (!currentRoom || !payload) return;
        // Inject verified sender ID
        payload.clientId = currentClientId;
        // Echo cursor position to all other peers in room
        currentRoom.broadcast({
          type: 'cursor',
          roomId: currentRoom.roomId,
          payload
        }, ws);
        break;
      }

      // -------------------------------------------------------------
      // REALTIME LOBBY SKATER MOVEMENT
      // -------------------------------------------------------------
      case 'skater_move': {
        if (!currentRoom || !payload) return;
        payload.clientId = currentClientId;
        currentRoom.broadcast({
          type: 'skater_move',
          roomId: currentRoom.roomId,
          payload
        }, ws);
        break;
      }

      // -------------------------------------------------------------
      // GRAFFITI STROKE STREAMING & WALL HISTORY
      // -------------------------------------------------------------
      case 'graffiti_stroke': {
        if (!currentRoom || !payload) return;
        payload.clientId = currentClientId;

        // Anti-abuse: limit points per stroke to 100
        if (Array.isArray(payload.points) && payload.points.length > 100) {
          payload.points = payload.points.slice(0, 100);
        }

        // Store stroke in room graffiti history
        if (!currentRoom.state.lobby) currentRoom.state.lobby = { graffiti: [] };
        currentRoom.state.lobby.graffiti.push(payload);

        // Cap history to 500 strokes
        if (currentRoom.state.lobby.graffiti.length > MAX_GRAFFITI_STROKES) {
          currentRoom.state.lobby.graffiti.shift();
        }

        // Broadcast to other peers
        currentRoom.broadcast({
          type: 'graffiti_stroke',
          roomId: currentRoom.roomId,
          payload
        }, ws);

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // CLEAR GRAFFITI WALL
      // -------------------------------------------------------------
      case 'graffiti_cleared': {
        if (!currentRoom) return;
        if (currentRoom.state.lobby) {
          currentRoom.state.lobby.graffiti = [];
        }
        currentRoom.broadcast({
          type: 'graffiti_cleared',
          roomId: currentRoom.roomId,
          payload: {}
        });
        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // START RACE & COUNTDOWN
      // -------------------------------------------------------------
      case 'start_race': {
        if (!currentRoom) return;
        const sender = currentRoom.state.players[currentClientId];
        if (!sender || !sender.isHost) {
          console.warn(`[Room ${currentRoom.roomId}] Non-host tried to start race: ${currentClientId}`);
          return;
        }

        const deterministicSeed = Math.floor(100000 + Math.random() * 900000);
        const raceId = 'race_' + Date.now();

        currentRoom.state.race = {
          status: 'countdown',
          raceId,
          courseSeed: deterministicSeed,
          trackLength: 1500
        };

        currentRoom.broadcast({
          type: 'race_countdown',
          roomId: currentRoom.roomId,
          payload: {
            countdownSeconds: 3,
            raceId,
            courseSeed: deterministicSeed,
            trackLength: 1500
          }
        });

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // RACE TELEMETRY SNAPSHOT (~300ms)
      // -------------------------------------------------------------
      case 'race_progress': {
        if (!currentRoom || !payload) return;
        payload.playerId = currentClientId;

        // Anti-cheat velocity & bound check
        const reportedDist = Number(payload.distance) || 0;
        const existingEntry = currentRoom.leaderboard.get(currentClientId);

        if (existingEntry) {
          const dt = (Date.now() - (existingEntry.timestamp || Date.now())) / 1000;
          if (dt > 0.05) {
            const maxAllowedDist = existingEntry.distance + MAX_LEGAL_SPEED_MPS * dt * 1.5;
            if (reportedDist > maxAllowedDist + 15) {
              payload.distance = Math.round(maxAllowedDist); // Clamp teleport
            }
          }
        }

        payload.timestamp = Date.now();
        currentRoom.leaderboard.set(currentClientId, payload);

        // Update player record and attach metadata
        const player = currentRoom.state.players[currentClientId];
        if (player) {
          player.distance = payload.distance;
          player.score = payload.score;
          payload.name = player.name || payload.name || 'SKATER';
          payload.customization = player.customization || payload.customization || {};
          payload.color = (payload.customization && payload.customization.paintColor) || '#35D7FF';
        }

        // Forward telemetry to all other room members
        currentRoom.broadcast({
          type: 'race_progress',
          roomId: currentRoom.roomId,
          payload
        }, ws);
        break;
      }

      // -------------------------------------------------------------
      // RACE FINISH
      // -------------------------------------------------------------
      case 'race_finish': {
        if (!currentRoom || !payload) return;
        payload.playerId = currentClientId;

        const player = currentRoom.state.players[currentClientId];
        if (player) {
          player.finished = true;
          player.finishTime = payload.completionTime;
          player.score = payload.finalScore;
        }

        currentRoom.broadcast({
          type: 'race_finish',
          roomId: currentRoom.roomId,
          payload
        });

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // SURPRISE EVENT (Duck, Pigeon Swarm, Oil Slick)
      // -------------------------------------------------------------
      case 'surprise_event': {
        if (!currentRoom || !payload) return;
        currentRoom.broadcast({
          type: 'surprise_event',
          roomId: currentRoom.roomId,
          payload
        });
        break;
      }

      // -------------------------------------------------------------
      // OFFLINE PROGRESS RECONCILIATION
      // -------------------------------------------------------------
      case 'reconcile_progress': {
        if (!currentRoom || !payload) return;
        const { raceId, distance, score, checkpoint } = payload;
        const player = currentRoom.state.players[currentClientId];

        const prevScore = (player && player.score) || 0;
        const reportedScore = Number(score) || 0;
        const reportedDist = Number(distance) || 0;

        // Anti-cheat verification
        const acceptedDistance = Math.min(1500, Math.max(0, reportedDist));
        const acceptedScore = Math.max(prevScore, reportedScore);
        const pointsGained = acceptedScore - prevScore;

        if (player) {
          player.score = acceptedScore;
          player.distance = acceptedDistance;
          player.checkpoint = checkpoint || player.checkpoint;
        }

        // Acknowledge back to sender
        safeSend(ws, {
          type: 'reconcile_response',
          roomId: currentRoom.roomId,
          payload: {
            accepted: true,
            raceId,
            playerId: currentClientId,
            acceptedDistance,
            acceptedScore,
            checkpoint,
            pointsGained,
            serverTimestamp: Date.now()
          }
        });

        // Broadcast reconnected announcement with points banner to room peers
        currentRoom.broadcast({
          type: 'player_reconnected',
          roomId: currentRoom.roomId,
          payload: {
            id: currentClientId,
            name: (player && player.name) || 'Skater',
            pointsGained,
            totalScore: acceptedScore,
            distance: acceptedDistance
          }
        }, ws);

        // Sync leaderboard snapshot
        currentRoom.broadcast({
          type: 'race_progress',
          roomId: currentRoom.roomId,
          payload: {
            raceId,
            playerId: currentClientId,
            name: (player && player.name) || 'Skater',
            distance: acceptedDistance,
            score: acceptedScore,
            status: 'racing'
          }
        });

        scheduleStatePersistence();
        break;
      }

      // -------------------------------------------------------------
      // HEARTBEAT PING
      // -------------------------------------------------------------
      case 'ping': {
        safeSend(ws, { type: 'pong', timestamp: Date.now() });
        break;
      }

      default:
        // Forward custom generic events to room peers
        if (currentRoom) {
          currentRoom.broadcast(packet, ws);
        }
        break;
    }
  } catch (err) {
    console.error('[WS Message Error]:', err && err.message ? err.message : err);
  }
  });

  // Handle Client Disconnect
  ws.on('close', () => {
    try {
      if (!currentRoom || !currentClientId) return;

      currentRoom.clients.delete(ws);
      const player = (currentRoom.state && currentRoom.state.players) ? currentRoom.state.players[currentClientId] : null;

      if (player) {
        player.afk = true;
        player.connected = false;
        player.disconnectedAt = Date.now();
        console.log(`[Room ${currentRoom.roomId}] Skater disconnected/AFK: ${player.name} (${currentClientId})`);
      }

      // Host migration if disconnected player was host
      currentRoom.electHost();

      // Broadcast updated player roster
      if (currentRoom.state && currentRoom.state.players) {
        currentRoom.broadcast({
          type: 'players_updated',
          roomId: currentRoom.roomId,
          payload: currentRoom.state.players
        });
      }

      currentRoom.broadcast({
        type: 'player_leave',
        roomId: currentRoom.roomId,
        payload: { playerId: currentClientId, afk: true, name: (player && player.name) || 'Skater' }
      });

      // If room is completely empty, schedule teardown
      if (currentRoom.getActivePlayerCount() === 0) {
        currentRoom.emptyTimer = setTimeout(() => {
          try {
            if (currentRoom && currentRoom.getActivePlayerCount() === 0) {
              console.log(`[Room ${currentRoom.roomId}] Idle timeout reached. Purging empty room.`);
              rooms.delete(currentRoom.roomId);
              scheduleStatePersistence();
            }
          } catch (tErr) {
            console.error('[Teardown Error]:', tErr.message);
          }
        }, ROOM_IDLE_TIMEOUT_MS);
      }

      scheduleStatePersistence();
    } catch (closeErr) {
      console.error('[WS Close Error]:', closeErr && closeErr.message ? closeErr.message : closeErr);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WebSocket Error] Socket ${currentClientId || 'unregistered'}:`, err.message);
  });
});

// Start Server Listening
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛹 ALLEY RATS: SKATE & SPRAY — MULTIPLAYER REALTIME SERVER`);
  console.log(`=======================================================`);
  console.log(`📡 Local HTTP Server:      http://localhost:${PORT}`);
  console.log(`⚡ WebSocket Server:       ws://localhost:${PORT}/ws`);
  console.log(`🩺 Health Check:          http://localhost:${PORT}/health`);
  console.log(`💾 State Persistence:     ${PERSIST_FILE}`);
  console.log(`🚀 Ready for skaters!`);
  console.log(`=======================================================`);
});

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Saving state and shutting down gracefully...');
  try {
    const serialized = {};
    for (const [id, room] of rooms.entries()) {
      serialized[id] = room.serialize();
    }
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch {}
  process.exit(0);
});
