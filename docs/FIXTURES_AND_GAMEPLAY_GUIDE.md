# 🛹 8 Gameplay Fixtures & Technical Implementation Guide

This guide documents the implementation details for each of the 8 game fixtures added to **Alley Rats: Skate & Spray**.

---

## 1. Realtime Lobby Skater Movement

### Requirement
> *Add realtime lobby movement of each player like the spray.*

### Implementation
- **Files Modified**: [`Js/skater.js`](../Js/skater.js), [`Js/scenes.js`](../Js/scenes.js), [`Js/multiplayer.js`](../Js/multiplayer.js), [`Js/multiplayer-adapter.js`](../Js/multiplayer-adapter.js), [`server.js`](../server.js)
- **Mechanism**:
  - In `LobbyScene` (`Js/scenes.js`), when the local player moves (Arrow keys / `A`/`D`), pushes, or triggers tricks (`Space` for ollie, `K` for kickflip), their normalized coordinates (`normX`, `normY`), facing direction, and trick states are broadcast over WebSockets at up to 30Hz:
    ```json
    {
      "type": "skater_move",
      "roomId": "RAT-1234",
      "payload": {
        "normX": 0.42,
        "normY": 0.0,
        "facing": 1,
        "isPushing": false,
        "trick": "kickflip"
      }
    }
    ```
  - The server relays `skater_move` to all peers in the room.
  - Remote skaters in `skater.js` interpolate towards `targetNormX` smoothly using `applyRemoteMovement(data)` so remote players see fluid real-time movement across the skatepark.

---

## 2. Realtime Opponent Racers on Track

### Requirement
> *Show realtime player movement when we start the race so our opponents can also see us if we are ahead of them or running at same position or going behind them gradually.*

### Implementation
- **Files Modified**: [`Js/racing.js`](../Js/racing.js), [`Js/racing-network.js`](../Js/racing-network.js)
- **Mechanism**:
  - During the race, all racers stream their distance and score via 20Hz telemetry packets (`race_progress`).
  - In `RacingController.render()`, `_renderOpponentRacers(ctx, groundY, width)` calculates the exact distance delta relative to the local player:
    $$\Delta d = d_{\text{opponent}} - d_{\text{local}} \quad (\text{meters})$$
    $$\Delta x = \frac{\Delta d}{\text{distancePerPixel}} \quad (\text{screen pixels})$$
  - **On-Screen Opponents**: When within the viewport, the opponent's customized skater avatar is rendered on the asphalt track with a comic overhead status pill:
    - `▲ Name [+28m]` in neon green if ahead.
    - `▼ Name [-14m]` in vibrant orange if behind.
    - `⚡ Tied with Name!` if running alongside within 2 meters.
  - **Off-Screen Opponents**: When opponents are far ahead or behind, dynamic edge pills appear on the left or right canvas boundaries indicating their distance and direction (`Name +65m ⏩` / `⏪ Name 42m`).

---

## 3. Fresh Graffiti Wall on Room Creation

### Requirement
> *Clear the painted wall whenever a new room is created.*

### Implementation
- **Files Modified**: [`server.js`](../server.js), [`Js/app.js`](../Js/app.js)
- **Mechanism**:
  - Whenever a new room is instantiated on the server (`server.js`), `room.state.lobby.graffiti` is initialized to an empty array `[]`.
  - In `Js/app.js`, `handleCreateRoom(roomId)` automatically invokes `this.sceneManager.clearGraffiti()`, ensuring the creator and all incoming members see a fresh, unblemished brick wall.

---

## 4. In-Room Graffiti Wall Clearing for All Players

### Requirement
> *Also provide an option to clear the painted wall in the room so that every player can see it.*

### Implementation
- **Files Modified**: [`index.html`](../index.html), [`Js/lobby.js`](../Js/lobby.js), [`Js/app.js`](../Js/app.js), [`Js/multiplayer-adapter.js`](../Js/multiplayer-adapter.js), [`server.js`](../server.js)
- **Mechanism**:
  - A **CLEAR WALL** button (`#btn-clear-graffiti`) is positioned in the spray tool palette.
  - When clicked by any player:
    1. The local canvas clears immediately.
    2. A `graffiti_cleared` packet is dispatched via the multiplayer adapter.
    3. The server resets `room.state.lobby.graffiti = []` and broadcasts `graffiti_cleared` to all clients in the room.
    4. All connected peers wipe their canvases simultaneously.

---

## 5. Interactive Obstacles with Glowing Neon Hazard Rays

### Requirement
> *The games had some obstacles but they are not interactive as the player cannot jump or bow down the obstacles so make it interactive. The obstacles should provide a glowing rays like neon so that One can understood it is an obstacle.*

### Implementation
- **Files Modified**: [`Js/obstacles.js`](../Js/obstacles.js), [`Js/racing.js`](../Js/racing.js)
- **Mechanism**:
  - **Screen-Space Hitbox Synchronization**: Hitboxes in `getHitbox(groundY, screenX)` now use screen-space coordinates, enabling precise collision checks against the player's skater hitbox (`playerScreenX = 220px`).
  - **Jumping**: Pressing `Space` / `Up` / `W` launches the skater into the air, clearing ground obstacles (rubbish bins, traffic cones, parked cars).
  - **Ducking / Bowing Down**: Pressing `Down` / `S` scales the player's hitbox downward to duck under low overhead highway signs (`requiresDuck: true`).
  - **Neon Glowing Rays (`_renderNeonRays`)**:
    - Multi-layer pulsating radial hazard aura:
      $$\alpha(t) = 0.5 + 0.5 \sin(0.008 \cdot t)$$
    - Upward vertical neon hazard beacon rays.
    - Floating action comic pills with neon outlines:
      - `JUMP!` (Neon Cyan / Yellow)
      - `DUCK!` (Neon Hot Pink / Magenta)
      - `RAMP!` (Neon Orange)
      - `RAIL!` (Neon Lime Green)

---

## 6. Vibrant Neon Game Title

### Requirement
> *The name of the game which is showing on the interface is black in color and thus not visible make it colorful.*

### Implementation
- **Files Modified**: [`Css/menu.css`](../Css/menu.css), [`Css/lobby.css`](../Css/lobby.css)
- **Mechanism**:
  - Replaced the dark, illegible `-webkit-text-stroke` styling with vibrant multi-stop linear gradients:
    ```css
    background: linear-gradient(135deg, #39ff14 0%, #00f0ff 38%, #ff007f 74%, #ffe600 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(4px 4px 0px #10121a) 
            drop-shadow(0 0 16px rgba(57, 255, 20, 0.65))
            drop-shadow(0 0 32px rgba(0, 240, 255, 0.45));
    ```
  - The title stands out sharply against dark backgrounds in both the main menu and the lobby.

---

## 7. Two Lifelines per Player

### Requirement
> *Provide 2 lifelines to each player and diminish each lifeline whenever the player hits an obstacle.*

### Implementation
- **Files Modified**: [`index.html`](../index.html), [`Js/racing.js`](../Js/racing.js), [`Css/racing.css`](../Css/racing.css)
- **Mechanism**:
  - Added a dedicated `LIVES` metric row in the race HUD displaying two skateboard deck icons: `🛹 🛹`.
  - `RacingController` tracks `this.lifelines = 2`.
  - On obstacle collision (excluding beneficial ramps and rails):
    1. If `lifelines > 1`: Lifeline decrements to 1 (`🛹 ❌`), an audio crunch plays, speed drops temporarily, and 1.8 seconds of invincibility blinking is triggered.
    2. If `lifelines === 1`: Lifeline decrements to 0 (`❌ ❌`), triggering a full wipeout, ragdoll crash sound, and race termination with the reason `'wipeout'`.

---

## 8. 60-Second Race Limit & 35-Second Rush Escalation

### Requirement
> *Make The time limit for each race is 1minute. Increase the difficulty like the speed of getting obstacles increasing gradually after 35 second is passed.*

### Implementation
- **Files Modified**: [`index.html`](../index.html), [`Js/racing.js`](../Js/racing.js), [`Js/obstacles.js`](../Js/obstacles.js)
- **Mechanism**:
  - **1-Minute Timer**: `this.raceTimeLimit = 60.0`. The HUD displays a real-time countdown formatted as `M:SS` (`1:00`, `0:45`, `0:12`). If the timer reaches `0:00`, the race concludes automatically with the reason `'time_limit'`.
  - **35-Second Difficulty Escalation**:
    - At $t > 35\text{s}$, difficulty scales dynamically from $1.0\times$ up to $1.9\times$:
      $$\text{difficulty} = 1.0 + \left(\frac{t - 35}{25}\right) \times 0.9$$
    - Base skater speed increases by up to $+35\%$ ($520 \to 702\text{ px/s}$).
    - Minimum obstacle gap spacing compresses from $450\text{px}$ down to $220\text{px}$.
    - A flashing on-screen warning banner appears:
      ```text
      ⚡ 35s FINAL RUSH! DIFFICULTY ESCALATING! ⚡
      ```
