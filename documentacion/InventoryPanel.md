# Inventory Panel Overview

This note captures how `src/app/game/hud/InventoryPanel.ts` works so future iterations can extend it without re-reading the canvas renderer every time.

## Purpose & Responsibilities
- Render the inventory overlay off-screen (2D canvas) and upload it as a HUD texture that `HUDManager` composites in WebGL.
- Provide lightweight interaction hitboxes (``InventoryPanelRegion``) so `GameEngine` can translate clicks into selections or actions.
- Maintain independent scroll states for personal gear, equipment modules, and cargo columns to accommodate long manifests.
- Present contextual actions (currently "Expulsar carga/equipo") based on the `InventorySelection` tracked inside the panel.

## Data Contract (`InventorySnapshot`)
The panel expects a fully materialized snapshot each frame via `update(snapshot)`:

| Field | Notes |
| --- | --- |
| `character` | Pilot name + level plus health/memory/experience/sanity values feeding the left stats column. |
| `equipment` | Record keyed by `EquipmentSlot` (`CORE`, `HULL`, etc.) storing `EquipmentSlotState` (label, description, capabilities, rarity). Null entries render as empty slots. |
| `personalGear` | Ordered array of worn gear; `PersonalGearSlot` drives palette & placeholder rows. Missing accessory rows are auto-padded to keep three placeholders visible. |
| `cargo` | Manifest of `CargoManifestEntry`; IDs are mirrored in selection regions so the panel can keep a stable highlight even when the list shifts. |
| `cargoCapacity` | `{ current, max, pct }` powers the cargo gauge and gating logic (e.g., anchoring pulse feedback). |
| `shipStats` | Optional metrics (acceleration/top speed/health) appended to equipment cards for quick comparisons. |

Everything else (`voidEnergy`, relations, etc.) never enters this panel; keep snapshot focused on pilot + inventory concerns.

## Rendering Pipeline
1. **State Update**: `update(snapshot)` stores the latest data, reconciles the active `InventorySelection`, and eases scroll offsets towards their targets (simple lerp factor 0.2).
2. **Paint**: `paint()` draws onto the internal 1024×1024 canvas. Layout highlights:
   - Left column (35% width) = character stats + personal gear cards.
   - Center column (40%) = ship equipment cards with unavailable-slot messaging.
   - Right column (remaining width) = cargo gauge and manifest rows.
   - Footer = selection summary plus the expel button.
3. **Upload**: `uploadTexture()` copies the canvas into the bound WebGL texture so the HUD quad updates next frame.

### Column Details
- **Character Stats**: stacked bars for health and memory (0-100%), the new experience ratio bar (value / experienceMax), and finally the sanity grid; `snapshot.character.level` renders next to the pilot name.
- **Personal Gear**: uses `buildPersonalRows()` to append placeholder accessories. `getPersonalSlotPalette()` supplies color blocks per slot type, and selected cards render an orange outline.
- **Equipment**: fixed order defined inline; cards show slot name, module label, description/capabilities, or "Slot vacío" / "N/A" as appropriate. Scrollbar heights are computed from content vs viewport heights.
- **Cargo**: rows call `drawCargoRow()`, which now titles each row with the composition/notes text (defaults to the label) and shows a descriptor derived from `CargoItemType` (`describeCargoType()`). Unit counts are right-aligned, matching the latest UX request.

## Interaction Model
- **Cursor Tracking**: `setCursorFromViewport()` converts viewport coordinates into canvas space, stores `cursorPx/Py`, and forces a repaint so the custom glow cursor draws in-place.
- **Wheel Input**: `handleWheelFromViewport()` looks at the cursor column (left/center/right buckets) and nudges the associated scroll target. Scroll values clamp between `0` and `*_MaxScroll` based on content height.
- **Hit Regions**: After drawing each card/row/button, the panel registers a bounding box in `this.regions`. `pickRegionAtCursor()` (or `pickRegionAt(x,y)`) performs a reverse iteration so visually top-most regions win, letting `GameEngine` convert clicks into `InventorySelection` updates or action triggers.
- **Selection Storage**: `setSelection()` simply stores the latest selection and repaints; `update()` also auto-clears invalid selections (e.g., cargo entry removed, gear array shrank) so the footer never references stale data.

## Footer & Actions
`drawFooter()`:
- Mirrors the current selection using `describeSelection()`, covering cargo, equipment, and personal gear cases.
- Renders the "Expulsar carga/equipo" button, enabling it only when the selection is cargo or personal.
- Registers an `InventoryPanelRegion` of kind `action` with `InventoryActionType.JETTISON`, allowing `GameEngine` to detect clicks and run the appropriate service logic (currently routed through `handleInventoryAction`).

## Integration Touchpoints
- **GameEngine**: owns the panel instance, calls `update()` each frame with a synthesized snapshot (merged from `GameStateStore`), forwards cursor/scroll events, and handles inventory toggle/show/hide logic (including audio cues `ui_inventory_open/close`).
- **GameState & Services**: `CargoHoldService` and similar services mutate the data structures consumed by the snapshot. They do *not* talk to the panel directly; all rendering happens from the serialized snapshot.
- **Audio/UI Harmony**: Hover sounds remain muted via `adaptiveTargeting` when the panel is open, and Escape/Map/Grimoire handlers close the panel consistently to avoid conflicting input layers.

## Extending Safely
- Reuse `registerRegion()` whenever adding new interactive areas so selection logic remains centralized.
- Keep gradient/alpha logic inside each draw method to avoid unexpected bleed when the canvas is composited.
- When adding new columns or metrics, remember to adjust `resetScroll()` and the column clipping regions, otherwise stale offsets can leak into future renders.
- If you need asynchronous data (e.g., blueprint details), resolve it in the engine/service layer first and pass the final strings inside `InventorySnapshot`; the panel purposely avoids Promises or service calls to keep painting deterministic.

With this overview, future contributors can trace how data flows from services → snapshot → panel texture without reverse-engineering the 2D drawing code.
