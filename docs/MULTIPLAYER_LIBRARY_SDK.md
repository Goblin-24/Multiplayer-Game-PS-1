# ALLEY RATS: SKATE & SPRAY — Multiplayer Client Library SDK

## 1. Overview & Integration Target

The frontend of **Alley Rats: Skate & Spray** is engineered to interact with an external client multiplayer library via the global namespace `window.Multiplayer` (or modular import). 

In `js/multiplayer-adapter.js`, the game uses a dynamic adapter pattern:
- **`MockNetworkAdapter`**: Used during local development and offline testing (generates simulated bots like `BRICKB0Y` and `PIGEONSLAYER`).
- **`RealMultiplayerAdapter`**: Connects directly to the real multiplayer backend via `window.Multiplayer.join(...)`.

This document specifies the exact client library SDK contract, class signatures, event names, and methods required to build or connect the official multiplayer SDK library.

---

## 2. Global SDK Contract: `window.Multiplayer`

The frontend expects a singleton or factory object on `window.Multiplayer` exposing a single entry point method: `join(options)`.

### 2.1 `Multiplayer.join(options)`

```typescript
interface JoinOptions {
  roomId: string;             // Room code (e.g. 'RAT-7421')
  serverUrl?: string;         // Backend WebSocket/HTTP URL (e.g. 'ws://localhost:3000')
  playerInfo: {
    name: string;             // Skater handle (e.g. 'NEON_VIPER')
    customization: SkaterCustomization; // Character & deck visual configuration
  };
}

// Returns a Promise resolving to a MultiplayerSession instance
window.Multiplayer.join(options: JoinOptions): Promise<MultiplayerSession>;
```

---

## 3. `MultiplayerSession` Instance Interface

The resolved session instance must implement the following API methods and event-emitter capabilities:

```typescript
interface MultiplayerSession {
  // Properties
  clientId: string;            // Unique socket/client identifier assigned by server
  roomId: string;              // Active room code
  isHost: boolean;             // True if this client has host privileges
  isConnected: boolean;        // True if the connection is active

  // State Management (Shared Key-Value Store)
  set(path: string, value: any): void;
  get(path: string): any;

  // Real-Time Event Dispatching
  sendEvent(eventType: string, payload: any): void;

  // Event Subscription
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;

  // Teardown
  disconnect(): void;
}
```

---

## 4. Key-Value Path Conventions (`mp.set` and `mp.get`)

The game frontend leverages `mp.set(path, value)` to update specific sub-paths of the room state:

| Path Pattern | Example Value | Description |
|---|---|---|
| `players.${clientId}.ready` | `true` / `false` | Toggles player readiness in the lobby. |
| `players.${clientId}.customization` | `{ hoodieColor: '#ff007f', ... }` | Live updates player outfit/deck styling. |
| `lobby.graffiti` | `[ stroke1, stroke2, ... ]` | Appends or updates graffiti stroke data. |
| `race.status` | `'waiting'` \| `'countdown'` \| `'racing'` | Updates high-level race phase. |

When any peer calls `mp.set(path, value)`, the server reconciles the shared room state and emits `state_change` to all room members.

---

## 5. Event Catalog (Incoming & Outgoing)

### 5.1 Outgoing Events (`session.sendEvent(type, payload)`)

| Event Name | Typical Frequency | Payload Schema | Description |
|---|---|---|---|
| `'cursor'` | 25 Hz (Throttled) | `{ clientId, x, y, cursorType, color, name }` | Local mouse/spray cursor position (0..1 normalized coords). |
| `'graffiti_stroke'` | On mouse stroke | `{ strokeId, clientId, color, size, points: [{x, y}] }` | Spray can, marker, or paintbrush stroke points on the wall. |
| `'start_race'` | Once per race | `{ roomId }` | Emitted by the host to begin the race countdown. |
| `'race_progress'` | Every 300ms | `{ raceId, playerId, distance, speed, score, status }` | Live racer telemetric snapshot. |
| `'race_finish'` | Once per race | `{ raceId, playerId, completionTime, finalScore }` | Sent when the local player crosses the finish line. |
| `'reconcile_progress'` | On reconnect | `{ raceId, playerId, distance, score, checkpoint }` | Submits accumulated offline progress for validation. |

### 5.2 Incoming Events (`session.on(type, callback)`)

| Event Name | Trigger Condition | Callback Argument |
|---|---|---|
| `'state_change'` | When any shared room state key changes | `(newState: RoomState) => void` |
| `'player_join'` | When a new player enters the room | `(player: PlayerState) => void` |
| `'player_leave'` | When a player exits or disconnects | `(playerId: string) => void` |
| `'cursor'` | Remote peer moved their cursor | `(cursorData: RemoteCursorData) => void` |
| `'graffiti_stroke'` | Remote peer painted on the wall | `(strokeData: GraffitiStroke) => void` |
| `'graffiti_cleared'`| Host cleared the wall | `() => void` |
| `'race_countdown'` | Host triggered race countdown | `({ countdownSeconds, raceId, courseSeed }) => void` |
| `'race_progress'` | Remote peer telemetry update | `(progressData: RaceProgressSnapshot) => void` |
| `'surprise_event'` | Dynamic surprise event triggered | `(eventData: SurpriseEvent) => void` |
| `'connected'` | Connection established | `({ roomId, clientId }) => void` |
| `'disconnected'` | Network dropped or server closed | `() => void` |
| `'error'` | Protocol or network error | `({ message: string }) => void` |

---

## 6. Complete Drop-In Reference Implementation (`multiplayer.js`)

Below is a complete, production-ready, zero-dependency browser SDK client library that can be loaded via `<script src="js/multiplayer.js"></script>` to connect the frontend to any WebSocket server conforming to the protocol:

```javascript
/**
 * ALLEY RATS: SKATE & SPRAY — Official Client Multiplayer SDK
 * Exposes window.Multiplayer conforming to the frontend game engine contract.
 */
(function(window) {
  'use strict';

  class EventEmitter {
    constructor() {
      this._events = {};
    }
    on(event, listener) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(listener);
    }
    off(event, listener) {
      if (!this._events[event]) return;
      this._events[event] = this._events[event].filter(l => l !== listener);
    }
    emit(event, ...args) {
      if (!this._events[event]) return;
      this._events[event].forEach(l => {
        try { l(...args); } catch (e) { console.error(`[Multiplayer SDK] Error in event '${event}':`, e); }
      });
    }
  }

  class MultiplayerSession extends EventEmitter {
    constructor(options) {
      super();
      this.roomId = options.roomId;
      this.serverUrl = options.serverUrl || (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;
      this.playerInfo = options.playerInfo;
      
      this.ws = null;
      this.clientId = null;
      this.isHost = false;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.heartbeatTimer = null;

      this.state = {
        roomId: this.roomId,
        players: {},
        lobby: { graffiti: [] },
        race: { status: 'waiting' }
      };
    }

    connect() {
      return new Promise((resolve, reject) => {
        const url = `${this.serverUrl}/ws?room=${encodeURIComponent(this.roomId)}`;
        this.ws = new WebSocket(url);

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            this.ws.close();
            reject(new Error('Connection timed out to multiplayer server'));
          }
        }, 8000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          // Send handshake
          this._sendRaw({
            type: 'client_connect',
            roomId: this.roomId,
            payload: this.playerInfo
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            this._handlePacket(packet, resolve);
          } catch (err) {
            console.warn('[Multiplayer SDK] Malformed frame:', err);
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          clearInterval(this.heartbeatTimer);
          this.emit('disconnected');
        };

        this.ws.onerror = (err) => {
          this.emit('error', { message: 'WebSocket connection error' });
        };
      });
    }

    _handlePacket(packet, resolveInitialConnect) {
      const { type, payload } = packet;

      switch (type) {
        case 'connected':
          this.clientId = payload.clientId;
          this.isHost = Boolean(payload.isHost);
          this.isConnected = true;
          if (payload.state) this.state = payload.state;
          this._startHeartbeat();
          if (resolveInitialConnect) resolveInitialConnect(this);
          this.emit('connected', { roomId: this.roomId, clientId: this.clientId });
          break;

        case 'state_change':
          this.state = Object.assign(this.state, payload);
          this.emit('state_change', this.state);
          break;

        case 'player_join':
          this.state.players[payload.id] = payload;
          this.emit('player_join', payload);
          this.emit('state_change', this.state);
          break;

        case 'player_leave':
          delete this.state.players[payload.playerId];
          this.emit('player_leave', payload.playerId);
          this.emit('state_change', this.state);
          break;

        case 'cursor':
          this.emit('cursor', payload);
          break;

        case 'graffiti_stroke':
          if (this.state.lobby && this.state.lobby.graffiti) {
            this.state.lobby.graffiti.push(payload);
          }
          this.emit('graffiti_stroke', payload);
          break;

        case 'graffiti_cleared':
          if (this.state.lobby) this.state.lobby.graffiti = [];
          this.emit('graffiti_cleared');
          break;

        case 'race_countdown':
          this.state.race.status = 'countdown';
          this.emit('race_countdown', payload);
          break;

        case 'race_progress':
          this.emit('race_progress', payload);
          break;

        case 'surprise_event':
          this.emit('surprise_event', payload);
          break;

        default:
          this.emit(type, payload);
          break;
      }
    }

    _startHeartbeat() {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
          this._sendRaw({ type: 'ping', timestamp: Date.now() });
        }
      }, 15000);
    }

    _sendRaw(msg) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }

    set(path, value) {
      this._sendRaw({
        type: 'state_set',
        roomId: this.roomId,
        payload: { path, value }
      });
    }

    get(path) {
      const parts = path.split('.');
      let curr = this.state;
      for (const p of parts) {
        if (curr && typeof curr === 'object') curr = curr[p];
        else return undefined;
      }
      return curr;
    }

    sendEvent(type, payload) {
      this._sendRaw({
        type,
        roomId: this.roomId,
        payload
      });
    }

    disconnect() {
      clearInterval(this.heartbeatTimer);
      if (this.ws) {
        this.ws.close();
      }
      this.isConnected = false;
    }
  }

  // Export to window
  window.Multiplayer = {
    join: function(options) {
      const session = new MultiplayerSession(options);
      return session.connect();
    }
  };

})(typeof window !== 'undefined' ? window : this);
```
