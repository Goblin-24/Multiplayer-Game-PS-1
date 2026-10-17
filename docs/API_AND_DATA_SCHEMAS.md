# ALLEY RATS: SKATE & SPRAY — API & Data Schemas (TypeScript & JSON Schema)

This document provides definitive TypeScript interface definitions and JSON Schema specifications for all data contracts, entity models, network packets, and persistent storage objects used across **Alley Rats: Skate & Spray**.

---

## 1. Skater & Customization Schemas

```typescript
export interface SkaterCustomization {
  name: string;                   // Skater display name (max 16 chars)
  skinTone: string;               // Hex color (e.g. '#ffd1a4', '#e0ac69', '#8d5524')
  headwear: HeadwearType;         // Headwear item ID
  headwearColor: string;          // Hex color of hat/beanie
  hairColor: string;              // Hex color
  hoodieColor: string;            // Hex color of hoodie torso
  hoodieGraphic: HoodieGraphic;   // Graphic print ID
  pantsColor: string;             // Hex color of jeans/chinos
  shoesColor: string;             // Hex color of skate kicks
  deckGraphic: DeckGraphic;       // Deck bottom art graphic ID
  deckColor: string;              // Base background hex of the skateboard
  wheelColor: string;             // Polyurethane wheel hex color
  cursorType: CursorType;         // Preferred tool cursor style
  paintColor: string;             // Selected graffiti spray hex color
  brushSize: number;              // Brush/cap diameter (6, 12, 22, 34)
}

export type HeadwearType = 'beanie' | 'cap_back' | 'bucket' | 'punk' | 'afro' | 'bandana' | 'none';
export type HoodieGraphic = 'rat' | 'spray' | 'skull' | 'plain';
export type DeckGraphic = 'flame' | 'toxic' | 'checker' | 'rat' | 'lightning' | 'hazard' | 'plain';
export type CursorType = 'spray-can' | 'pointer' | 'brush' | 'marker' | 'sticker';
```

---

## 2. Player & Room State Schemas

```typescript
export interface PlayerState {
  id: string;                     // Unique client UUID / socket ID
  name: string;                   // Skater handle
  ready: boolean;                 // Lobby readiness status
  isHost: boolean;                // Host authority indicator
  isMock: boolean;                // True if simulated bot
  customization: SkaterCustomization;
  x: number;                      // Normalized horizontal position in alley (0.0 to 1.0)
  y: number;                      // Normalized vertical position (groundY approx 0.82)
}

export interface RoomState {
  roomId: string;                 // Room code (e.g. 'RAT-7421')
  players: Record<string, PlayerState>;
  lobby: {
    graffiti: GraffitiStroke[];   // Synchronized wall strokes
  };
  race: {
    raceId?: string;              // Active race session ID
    status: RaceStatus;           // Current race status
    courseSeed?: number;          // Deterministic seed for obstacle generation
    trackLength?: number;         // Length in meters (e.g. 1500)
    startTime?: number;           // Epoch ms when race started
  };
}

export type RaceStatus = 'waiting' | 'countdown' | 'racing' | 'finished';
```

---

## 3. Graffiti & Cursor Schemas

```typescript
export interface GraffitiPoint {
  x: number;                      // Normalized X coordinate (0.02 <= x <= 0.98)
  y: number;                      // Normalized Y coordinate (0.08 <= y <= 0.72)
}

export interface GraffitiStroke {
  strokeId: string;               // Unique stroke UUID
  clientId: string;               // Author player ID
  tool: CursorType;               // 'spray-can' | 'marker' | 'brush' | 'sticker'
  color: string;                  // Hex color
  size: number;                   // Stroke width in pixels
  points: GraffitiPoint[];        // Array of coordinate points
  stickerId?: string | null;      // Sticker ID if tool === 'sticker'
}

export interface RemoteCursorData {
  clientId: string;               // Player ID
  x: number;                      // Normalized canvas X
  y: number;                      // Normalized canvas Y
  cursorType: CursorType;         // Tool graphic to render
  color: string;                  // Active color swatch
  name: string;                   // Skater name label rendered beside cursor
}
```

---

## 4. Racing Telemetry & Checkpoint Schemas

```typescript
export interface RaceProgressSnapshot {
  raceId: string;                 // Active race session ID
  playerId: string;               // Skater ID
  name: string;                   // Skater display name
  color: string;                  // Skater identifier color
  distance: number;               // Distance in meters along course
  speed: number;                  // Current speed in km/h
  score: number;                  // Accumulated trick and collectible score
  combo?: number;                 // Active combo multiplier (1 to 5)
  checkpoint: number;             // Last reached checkpoint index (0, 1, 2...)
  status: 'racing' | 'finished' | 'dnf';
  isMock?: boolean;               // True if simulated bot progress
  timestamp: number;              // Client timestamp
}

export interface RaceFinishPayload {
  raceId: string;
  playerId: string;
  completionTime: number;         // Time in seconds to 2 decimal places
  finalScore: number;
  totalTricks: number;
  collectiblesCollected: number;
}

export interface LeaderboardEntry {
  rank: number;                   // 1st, 2nd, 3rd...
  playerId: string;
  name: string;
  color: string;
  distance: number;
  score: number;
  speed?: number;
  status: 'racing' | 'finished';
  finishTime?: number;
  isMe: boolean;
}
```

---

## 5. Offline Recovery & Reconciliation Schemas

```typescript
export interface OfflineRecoverySnapshot {
  version: number;                // Storage schema version (1)
  raceId: string;                 // Race identifier
  playerId: string;               // Local skater ID
  sessionId: string;              // Client session UUID
  courseSeed: number;             // Track generation seed
  distance: number;               // Last verified distance in meters
  score: number;                  // Last verified score
  checkpoint: number;             // Last verified checkpoint index
  collectibles: string[];         // Set of collected item IDs
  lastEventSequence: number;      // Monotonically increasing event seq
  status: 'racing' | 'finished';
  savedAt: number;                // Epoch timestamp
}

export interface ReconciliationRequest {
  raceId: string;
  playerId: string;
  distance: number;
  score: number;
  checkpoint: number;
  lastEventSequence: number;
  timestamp: number;
}

export interface ReconciliationResponse {
  accepted: boolean;              // True if verified by anti-cheat heuristics
  raceId: string;
  playerId: string;
  acceptedDistance: number;
  acceptedScore: number;
  checkpoint: number;
  lastAcceptedEventSequence: number;
  serverTimestamp: number;
  reason?: string;                // Error explanation if rejected or clamped
}
```

---

## 6. Local Storage Schema Reference

The browser stores local player configurations under explicit storage keys (`js/storage.js`):

| Key Name | Storage Type | Schema Type | Description |
|---|---|---|---|
| `'alley_rats_customization_v1'` | `JSON` | `SkaterCustomization` | Persisted character outfit, deck, colors, and name. |
| `'alley_rats_settings_v1'` | `JSON` | `{ masterVolume: number, musicVolume: number, sfxVolume: number, highPerformance: boolean }` | User audio volume sliders and rendering settings. |
| `'alley_rats_last_room'` | `String` | `string` | The last room code entered by the user. |
| `'alley_rats_race_recovery_v1'` | `JSON` | `OfflineRecoverySnapshot` | Active race snapshot for offline crash/network recovery. |

---

## 7. JSON Schema: Network Envelope Validator

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AlleyRatsNetworkPacket",
  "type": "object",
  "required": ["type", "roomId", "payload"],
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "client_connect",
        "connected",
        "player_ready",
        "cursor",
        "graffiti_stroke",
        "graffiti_cleared",
        "start_race",
        "race_countdown",
        "race_progress",
        "surprise_event",
        "race_finish",
        "reconcile_progress",
        "reconcile_response",
        "ping",
        "pong"
      ]
    },
    "roomId": {
      "type": "string",
      "minLength": 3,
      "maxLength": 16,
      "pattern": "^[A-Za-z0-9_-]+$"
    },
    "playerId": {
      "type": "string"
    },
    "seq": {
      "type": "integer",
      "minimum": 0
    },
    "timestamp": {
      "type": "integer"
    },
    "payload": {
      "type": "object"
    }
  }
}
```
