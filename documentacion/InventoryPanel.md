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

#### Columna izquierda — Perfil del piloto
- Cabecera con nombre y nivel, seguida de barras condensadas de Salud, Memoria y Experiencia (esta última se dibuja como `valor / experienceMax`).
- Bajo las barras se renderiza la cuadrícula de Cordura, que respeta el tope dinámico (`GameStateStore.getSanityCap()`) y resalta los casilleros reservados por hechizos aprendidos.
- La sección inferior muestra el equipo personal (`buildPersonalRows()`), siempre asegurando que los slots de Accesorio visibles coincidan con la capacidad del traje actual.

#### Columna central — Módulos de nave
- Sigue un orden fijo de `EquipmentSlot` para que la memoria muscular funcione (“Core”, “Reactor”, “Alas”, etc.).
- Cada tarjeta imprime el nombre estilizado del slot, el módulo equipado (si existe), descripciones/capacidades dinámicas (`getDynamicCapabilityLines`) y placeholders "Slot vacío" o "N/A" cuando corresponde.
- Las tarjetas fuera del viewport mantienen regiones de selección para scroll infinito; el scrollbar calcula altura con la razón `visible / total`.

#### Columna derecha — Carga y capacidad
- Encabezado con barra de capacidad (`current / max`) y gauge translúcido para visualizar cuánto resta antes de saturar la bodega.
- La lista `cargo` se pinta con `drawCargoRow()`: título = `entry.notes ?? entry.label`, descriptor según `CargoItemType`, unidades alineadas a la derecha y selección resaltada en naranja.
- El scroll independiente garantiza que las operaciones de Anchoring Pulse y expulsión manual actualicen la posición sin saltos.

#### Footer — Resumen y acciones
- `describeSelection()` compone un texto breve (`Slot · etiqueta` o `Carga · nombre`).
- El botón “Expulsar carga/equipo” solo se habilita para selecciones de carga o equipo personal; crea una región `InventoryActionType.JETTISON` que `GameEngine` mapea a la lógica correspondiente.

## Ficha del personaje y estadísticas

El bloque superior izquierdo del panel funciona como ficha del piloto y refleja directamente `GameStateStore.characterProfile`. Cada estadístico tiene reglas de entrada/salida específicas:

### Salud (`health`)
- Rango 0‑100. Representa la integridad física del piloto y se muestra con una barra verde.
- Se reduce cuando `CharacterProfileService.adjustVitals({ health: -x })` es invocado por colisiones, daños ambientales o scripts narrativos (los sistemas que dañan la nave replican el impacto sobre el perfil via servicio).
- Se recupera aplicando deltas positivos (eventos de descanso, aterrizajes asistidos, cheats de depuración) o al reiniciar la partida (`GameStateStore.reset`).

### Memoria (`memory`)
- También 0‑100. Sube cuando se desbloquean fragmentos narrativos o descubrimientos clave que llamen `adjustVitals({ memory: +x })`.
- No disminuye de forma automática; únicamente scripts explícitos pueden restarla (actualmente ninguno la baja).
- La barra azul sirve como recordatorio del progreso de historia sin depender del HUD principal.

### Experiencia y nivel (`experience`, `level`)
- `GameStateStore.adjustExperience` gestiona los incrementos y aplica caps tipo Fibonacci (100 → 200 → 300 → 500 …). Al llegar al tope, se sube de nivel y la barra se reinicia con el nuevo `experienceMax`.
- La experiencia nunca baja del nivel desbloqueado, pero algunos eventos aplican deltas negativos al contador actual.
- Fuentes principales (`CharacterProfileService.registerExperienceEvent`):

| Evento | Delta |
| --- | --- |
| `ENEMY_SHIP_DESTROYED` | +25 |
| `PRIMIGENIO_DEFEATED_PLANET` | +50 |
| `PLANET_LANDING` | +3 |
| `NEW_SPECIES_DISCOVERED` | +100 |
| `SPELL_CAST` | +1 |
| `PORTAL_SPELL` | +5 |
| `PLAYER_DEATH` | −50 |

### Cordura (`sanity`)
- Base 100. El tope efectivo es `SANITY_BASE_MAX - Σ spell.max`, por lo que aprender glifos reduce permanentemente los casilleros disponibles en la cuadrícula.
- Cada lanzamiento aplica el coste temporal (`spell.temp`) mediante `GameEngine.applySpellSanityCost`, consumiendo casilleros activos desde la izquierda. Descender por debajo de 0 desencadena clamps, nunca queda negativo.
- Se recupera con `adjustVitals({ sanity: +x })` (descanso, eventos de historia, cheats) y al olvidar hechizos (`GameStateStore.forgetSpell`) se liberan los casilleros reservados.
- La cuadrícula muestra tres estados: casillas activas (azul), reservadas (trama dorada) y vacías/bloqueadas (gris oscuro), de modo que el jugador entiende qué tanto margen tiene antes de sufrir penalizaciones por castear.

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
