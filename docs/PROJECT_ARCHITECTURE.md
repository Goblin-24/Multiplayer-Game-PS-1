# ALLEY RATS: SKATE & SPRAY — Project Architecture & Game Engine Blueprint

## 1. High-Level System Architecture

**Alley Rats: Skate & Spray** is an HTML5 2D Canvas web game built with vanilla JavaScript (ES6 Modules), semantic HTML5, and responsive CSS with a strictly maintained **16:9 aspect ratio**.

The frontend architecture is modular, decoupled, and event-driven:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        index.html & DOM Shell                          │
│  - Main Menu View       - Lobby HUD & Controls     - Racing HUD View   │
│  - Settings Modal       - Character Customizer     - Overlays/Toasts   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           App Engine (app.js)                          │
│  - Life Cycle Orchestrator      - Scene Transitions (SCENES)           │
│  - URL Room Auto-Join           - Network Adapter Wire-up              │
└─────────┬─────────────────────────┬──────────────────────────┬─────────┘
          │                         │                          │
          ▼                         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│  Scene Manager   │      │ Lobby Controller │       │ Racing Controller│
│   (scenes.js)    │      │    (lobby.js)    │       │   (racing.js)    │
└─────────┬────────┘      └──────────────────┘       └─────────┬────────┘
          │                                                    │
     ┌────┴─────────────────────────────┐             ┌────────┴────────┐
     │                                  │             │                 │
┌────▼─────────────┐          ┌─────────▼────────┐ ┌──▼───────────────┐ │
│ 2D Canvas Engine │          │ Graffiti Engine  │ │ Obstacles System │ │
│  (renderer.js)   │          │  (graffiti.js)   │ │  (obstacles.js)  │ │
└────┬─────────────┘          └──────────────────┘ └──┬───────────────┘ │
     │                                                │                 │
┌────▼─────────────┐          ┌──────────────────┐ ┌──▼───────────────┐ │
│  Skater Physics  │          │  Cursor Manager  │ │ Collectibles     │ │
│   (skater.js)    │          │  (cursors.js)    │ │ (collectibles.js)│ │
└──────────────────┘          └──────────────────┘ └──┬───────────────┘ │
                                                      │                 │
                              ┌──────────────────┐ ┌──▼───────────────┐ │
                              │ Audio System     │ │ Surprise Events  │ │
                              │   (audio.js)     │ │ (surprise.js)    │ │
                              └──────────────────┘ └──┬───────────────┘ │
                                                      │                 │
                              ┌──────────────────┐ ┌──▼───────────────┐ │
                              │ Storage Manager  │ │ Live Leaderboard │ │
                              │  (storage.js)    │ │ (leaderboard.js) │ │
                              └──────────────────┘ └──┬───────────────┘ │
                                                      │                 │
                                                   ┌──▼───────────────▼─┐
                                                   │ Recovery Manager   │
                                                   │ (recovery-mgr.js)  │
                                                   └────────────────────┘
```

---

## 2. Virtual Coordinate System & 16:9 Viewport

To deliver pixel-perfect visual fidelity across 4K displays, laptops, and mobile screens without letterbox distortion, the game engine renders to an internal virtual coordinate grid:

- **Virtual Canvas Dimensions**: `1600 × 900` pixels (`virtualWidth`, `virtualHeight` in `config.js`).
- **Normalized Units**: Network packets (cursors, graffiti points, racer positions) use normalized floating point coordinates between `0.0` and `1.0`:
  $$X_{\text{screen}} = X_{\text{normalized}} \times 1600$$
  $$Y_{\text{screen}} = Y_{\text{normalized}} \times 900$$
- **DOM Container**: `#game-container` uses CSS:
  ```css
  #game-container {
    width: 100vw;
    height: 100vh;
    max-width: calc(100vh * (16 / 9));
    max-height: calc(100vw * (9 / 16));
    aspect-ratio: 16 / 9;
  }
  ```
- **Dynamic Resize Observer**: `renderer.js` automatically resizes the canvas buffer and scales the context matrix (`ctx.scale(ratio, ratio)`), ensuring crisp rendering at any resolution.

---

## 3. Scenes & Application State Machine

The game is governed by the `SCENES` enum (`scenes.js`):

```javascript
export const SCENES = {
  MENU: 'MENU',                     // Urban alley menu & character preview
  CUSTOMIZATION: 'CUSTOMIZATION',   // Streetwear & skateboard editor
  LOBBY: 'LOBBY',                   // Interactive graffiti alley hangout
  RACE_COUNTDOWN: 'RACE_COUNTDOWN', // 3-2-1 synchronizer
  RACING: 'RACING',                 // High-speed street race
  POST_RACE: 'POST_RACE'            // Final race results & podium
};
```

### Scene Flow Details
1. **`SCENES.MENU`**: Displays the animated brick alley backdrop, graffiti logo, and menu buttons.
2. **`SCENES.LOBBY`**: Activates:
   - The graffiti canvas layer with interactive spray cans, markers, brushes, and sticker stamps.
   - The remote cursor tracking system.
   - The skater avatar physics simulation with `A`/`D` steering, `Space` ollies, `K` kickflips, and grind detection on the street rail.
   - The crew roster panel showing connected skaters and ready states.
3. **`SCENES.RACE_COUNTDOWN`**: Freezes lobby movement, plays audio countdown beeps, preloads track assets, and displays the fullscreen overlay.
4. **`SCENES.RACING`**: Switches viewport to the scrolling race track, initializes obstacles, collectibles, speedometer, score combos, live leaderboard, and telemetry broadcaster.

---

## 4. Module Directory & Component Responsibilities

| File | Purpose & Responsibilities |
|---|---|
| `js/app.js` | Main entry point; initializes all controllers, handles URL room joining (`?room=RAT-xxxx`), and routes network adapter events. |
| `js/config.js` | Global parameters (virtual resolution 1600x900, colors, stickers, physics constants, network intervals). |
| `js/scenes.js` | Scene manager; controls active canvas rendering mode and view transitions. |
| `js/renderer.js` | Core 2D canvas drawing pipeline; handles canvas buffer resizing, pixel density, background parallax, and comic street art shaders. |
| `js/skater.js` | 2D procedural skater animation and physics (customizable hoodie, deck, beanie, wheels, ollies, kickflips, rails). |
| `js/physics.js` | Kinematics, gravity, jump curves, rail collision bounding boxes, and velocity integration. |
| `js/graffiti.js` | Spray can physics, paint splatter generation, marker strokes, sticker stamping, undo/clear, and stroke serialization. |
| `js/cursors.js` | Multi-user cursor tracking; renders remote spray cans, markers, and player name tags with interpolation. |
| `js/menu.js` | Main menu UI interactions (Create Room, Join Room, Customize, Settings, How to Play). |
| `js/lobby.js` | Multiplayer lobby HUD, spray toolbar swatches, brush sizing, crew roster, ready button, and host start race button. |
| `js/customization.js`| Real-time character customization preview (skin tone, headwear, hoodie graphics, pants, deck graphic, wheel colors). |
| `js/settings.js` | Audio volumes (Master, Music, SFX), graphic performance toggles, keybinding cheatsheets. |
| `js/audio.js` | Web Audio API procedural sound engine (skateboard rolls, ollie pops, kickflip clacks, spray rattle/hiss, countdown beeps, crowd cheer). |
| `js/storage.js` | LocalStorage manager for saving skater customization, player settings, and last visited room ID. |
| `js/multiplayer-adapter.js` | Network layer abstraction; provides `MockNetworkAdapter` for local bot testing and `RealMultiplayerAdapter` for the live server. |
| `js/racing.js` | Main racing gameplay loop, camera scrolling, track sectors, speed calculation, checkpoint management, and race finish handling. |
| `js/racing-network.js` | Throttled race telemetry synchronizer (300ms interval), remote racer progress tracking, and bot simulation. |
| `js/obstacles.js` | Procedural street obstacles: traffic cones, fire hydrants, garbage bins, street rails, construction barriers. |
| `js/collectibles.js` | Floating collectible pickups: spray cans (+score/nitro), energy drinks (+speed), golden rats (+mega points). |
| `js/surprise-events.js` | Sudden cartoon race events (Giant Rubber Duck, Pigeon Swarm, Oil Slicks). |
| `js/scoring.js` | Score multiplier, trick combos, grind points, clean landing bonuses, and trick announcement banners. |
| `js/leaderboard.js` | Live expandable multiplayer race leaderboard with rankings, distances, scores, and connection status. |
| `js/recovery-manager.js`| Resilient offline race progress recovery and server reconciliation against network drops. |

---

## 5. Audio Synthesizer Engine (`audio.js`)

The game features an internal **zero-asset Web Audio API procedural synthesizer**:
- **Spray Can Rattle & Hiss**: Generated via white noise buffer filtered through bandpass and envelope gain curves.
- **Skateboard Ollie & Landing**: Generated using low-frequency impulse oscillator sweeps and snappy noise bursts.
- **Grind Friction**: Continuous modulated noise filter reflecting metallic contact on steel rails.
- **Countdown & UI Beeps**: Pure-tone sine waves at 440Hz / 880Hz.
- Does not rely on external MP3/WAV downloads, eliminating audio loading delays and network failures.
