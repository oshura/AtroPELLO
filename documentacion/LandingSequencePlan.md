# Planet Landing & Takeoff Plan

This document outlines the HUD indicators, eligibility checks, cinematic flow, and UI required to support manual landings initiated by the player.

## 1. HUD Indicators Next to the Marquee Panel

| Indicator | Visuals | Location | Activation |
| --- | --- | --- | --- |
| **Landing** | Circular pilot light (off = dark green rim, on = bright lime core + soft glow) with a small "Landing" label underneath. | Left of the marquee panel, vertically centered with it. | Lit when landing requirements (section 2) are satisfied for any nearby planet. Otherwise dimmed. |
| **Threat** | Identical geometry but red palette. Label text should read `Threat` (user typed "Thread" but clarified it represents amenaza). | Immediately to the right of the Landing pilot to create a compact pair on the marquee's left gutter. | Lit when hostile/heavy-risk conditions exist (see section 5). |

Implementation notes:
- `HUDManager` already renders the marquee at `(centerX - 225, 20)`. Reserve ~70px width to its left for a vertical stack containing both pilot lights and labels.
- Expose a new method such as `hudManager.setLandingIndicators({ landingReady: boolean, threatActive: boolean })` that caches the values. During `renderToTexture`, draw the pilots before invoking `marqueePanel.render(...)` so they sit beneath the scrolling text.
- The pilot drawing helper should accept `{ onColor, offColor, label }` and be reusable for future status lights.

## 2. Landing Eligibility Detection

Run this check each frame inside `GameEngine.update(...)` (after ship physics so positions/velocities are stable).

1. **Gather nearest planet**: iterate `this.gameState.planets`, compute `centerDist = |ship.position - planet.position|`, radius `R = max(planet.scale.x, planet.scale.y, planet.scale.z)`. Track the planet with the smallest surface distance.
2. **Surface distance**: `distanceToSurface = centerDist - R`. Requirement: `distanceToSurface <= 50` units.
3. **Relative velocity**: approximate using ship velocity only (planet orbital speeds are tiny compared to the thresholds). Requirement: `ship.currentSpeed <= 5`. If we later need a more accurate metric, subtract the planet's orbital velocity vector.
4. **Orientation**: compute surface normal vector `n = normalize(ship.position - planet.position)`. Use ship forward vector (`Spaceship.forwardDirection`). The ship must be almost tangent to the surface, meaning the angle between `forward` and `n` is near 90°. Acceptable range: `60° ≤ angle ≤ 120°` (±30° from perfect parallel). Implementation-friendly check: `abs(dot(normalize(forward), n)) <= cos(60°) = 0.5`.
5. **Store context**: when all requirements pass, cache `{ planetId, planetName, radius, landingVector: n, surfacePoint }` inside `this.gameState.landingContext`. Also store `timeEligibleMs` to debounce flicker.
6. **Expose to HUD**: call `hudManager.setLandingIndicators({ landingReady: !!landingContext, threatActive })` so the green pilot mirrors the latest evaluation.

## 3. Player Input & State Machine

- Add a `LandingController` structure inside `GameEngine` with states: `idle`, `armed`, `landing_anim`, `landed_panel`, `takeoff_anim`.
- Transition to `armed` when landing eligibility is true for longer than ~0.25s (prevents a single-frame flash). Transition back to `idle` when eligibility fails.
- While armed, intercept the `Enter` key: before the pause-manager consumes it, check `if (key === 'enter' && landingController.state === 'armed')` and start the landing animation. This hook should live in `GameEngine.handleKeyDown` so controller support works even if focus isn’t on the Angular component.
- Reject landing if another blocking animation (`animationManager.isBlockingInputs()`) or panel is active.

## 4. Landing Cinematic Flow

Sequence triggered when the player presses Enter while the landing light is on. All durations below are initial targets, tweak after playtests.

1. **Setup (0 ms)**
   - Capture snapshot: ship position/velocity, current camera mode, HUD opacity, control flags, hover audio mute state.
   - Disable player controls via `GameInputHandler.setInputEnabled(false)` and `animationManager.startBlockingDelay(...)` to share the global lock.
   - Force camera mode 8 (cockpit) if not already active.
   - Disable hover audio + reticle outliners (`adaptiveTargeting.setHoverAudioMuted(true)` + `reticleManager.setVisible(false)`).
   - Set ship damage immunity flag (`this.gameState.damageSuppressed = true`).

2. **Approach Glide (2 seconds)**
   - Use tweened autopilot to move the ship closer to the surface point (`surfacePoint = planet.position + n * (R - 2)` so the hull is slightly below the detection threshold).
   - Maintain lateral alignment by projecting the current velocity onto the tangent plane and easing the ship’s forward direction to match it (use quaternion slerp).

3. **Contact & Nose Pitch (1 second)**
   - Once the ship is at `R - 1u`, pitch the nose up by 12–15 degrees (rotate around the right axis) to simulate flaring.

4. **Coast at 20u (5 seconds)**
   - Override `spaceship.currentSpeed` and `targetSpeed` with a scripted curve that accelerates to 20u in ~1s, clamped regardless of `maxSpeed`.
   - Hold speed and altitude for 5 seconds, continuing parallel to the surface. Use a simple PID or linear interpolation to keep the ship within ±2u of the surface track.

5. **Fade to Black (0.8 seconds)**
   - Drive a screen-fade overlay (reuse `showPlaceholderText` infrastructure or add a `FadeOverlay` class that renders full-screen quads). Once the fade is 100%, freeze ship physics and hand off to the landed panel.

## 5. Threat Indicator Logic

The red `Threat` pilot informs the player whether it’s safe to initiate the scripted landing:

- Compute `threatActive = true` if **any** of the following conditions hold:
  1. Any target with relation `'enemy'` (via `relationService.getRelation`) is within 500 units.
  2. Ship hull health is below 25% (landing would be unsafe).
  3. Void energy is below 10u (insufficient reserves for emergency boosts).
  4. The landing planet itself currently hosts debris or storms (future hook; for now, reuse `planet.probabilityOfLifePct > 70 && randomStormActive`).
- When the indicator is lit, `Enter` should either be blocked (preferred) or require a confirmation prompt. For v1, block landing attempts if `threatActive` is true and show a marquee message (“Amenaza detectada – estabiliza antes de aterrizar”).

## 6. Landed Panel

After the fade completes, show a modal panel (can be a new Angular component `landing-panel` overlayed on the canvas) with the following content:

- Title: `Aterrizado en {PlanetName}`.
- Planet data: type, radius, probability of life, atmosphere descriptor (if available), any lore strings already shown in the HUD target panel.
- CTA buttons:
  - **Despegar**: starts the takeoff animation (section 7).
  - **Cancelar** (optional): keep the ship grounded but close the panel (controls remain locked until takeoff to avoid state drift).
- While the panel is open: keep the HUD dimmed, audio hushed, and maintain the landing state internally (`landingController.state = 'landed_panel'`). No ship physics runs.

Implementation tips:
- Reuse the existing UI overlay infrastructure used by dialogs (Angular component projected over the canvas) so styling and focus management are consistent.
- The panel should expose events back to `GameEngine` via `GameUiManager` (similar to pause menus) so the core loop knows when to start takeoff.

## 7. Takeoff Sequence

Triggered by the `Despegar` button.

1. **Fade Out Panel**: dim the panel, fade HUD to black again.
2. **Interior Launch Setup**:
   - Place the ship slightly inside the planet (e.g., `planet.position + n * (R - 5)`) so it emerges from the surface.
   - Align the nose 15° toward the planet surface normal but still mostly tangent.
   - Reset ship speed to 0, zero out player controls, keep damage suppressed.
3. **Acceleration Phase (5 seconds)**:
   - Drive `currentSpeed` from 0 → 20u using the same scripted curve as landing but in reverse order (accelerate outward).
   - Simultaneously raise altitude: translate along `+n` until the ship crosses the surface boundary.
4. **Exit & Reorientation (2 seconds)**:
   - Once in space, rotate the ship so the forward vector points away from the planet center.
   - Release the speed clamp and lerp `currentSpeed` up/down to the ship’s nominal `maxSpeed`.
5. **Restore Control**:
   - Re-enable player input, hover audio, and outliners.
   - Remove damage suppression, clear landing context, set camera back to the previous mode (unless the player switched manually while landed; store a flag to respect their preference).
   - Clear fade overlay.

## 8. Task Breakdown

1. **Data & Detection**
   - [ ] Add `landingContext` + `landingController` structures to `GameState` / `GameEngine`.
   - [ ] Implement the eligibility evaluation and HUD update tick.
2. **HUD Work**
   - [ ] Add pilot light drawing helpers in `HUDManager` near the marquee.
   - [ ] Thread new setters from `GameEngine` → `HUDManager`.
3. **Input & State Management**
   - [ ] Intercept `Enter` in `GameEngine.handleKeyDown` when landing is armed.
   - [ ] Ensure other systems (pause, resume, spells) respect the new blocking state.
4. **Cinematics**
   - [ ] Extend `AnimationManagerService` with two new animations (`LandingCinematic`, `TakeoffCinematic`) or script them directly inside `GameEngine` if lighter.
   - [ ] Provide hooks to mute hover audio/outliners and suppress damage.
   - [ ] Build a fade overlay helper (WebGL quad or DOM canvas) so both animations share transitions.
5. **Landed Panel UI**
   - [ ] Create `landing-panel` Angular component with bindings for planet data + callbacks.
   - [ ] Wire it through the existing `GameComponent` overlay stack.
6. **Testing**
   - [ ] Unit-test eligibility math (distance/angle) with synthetic vectors.
   - [ ] Verify Enter is ignored when threat light is on or conditions are not met.
   - [ ] Smoke-test landing on multiple planet sizes to ensure the 50u threshold feels correct.

With this plan, we can prototype the HUD indicator quickly, then incrementally add the cinematic and panel without destabilizing current gameplay flows.
