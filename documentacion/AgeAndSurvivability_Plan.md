# Plan: Age & Survivability Mechanics + Rejuvenation Glyph

## Current Findings
- **Profile data** (`GameStateStore.characterProfile` and `CharacterProfile` interface) already expose `age { years, days, totalDays }`. UI reads it through `InventorySnapshot.character`.
- **Inventory HUD** (`InventoryPanel.drawCharacterColumn`) currently prints `Edad X años · Y días` with a fixed color.
- No utilities exist for incrementing age or simulating survivability decay/rolls. There is no background timer tying playtime minutes to age.
- Spell definitions live in `src/app/game/types/spell.types.ts` and the new glyph must integrate with this enum, sanity costs, labeling, and grimorio UI (components still to inspect when implementing).
- Game over / hardcore death flows likely handled inside `GameEngine` (needs hook for “death by age”).
- Documentation + wiki have sections for gameplay rules and glyph listings that must reflect the new system.

## Objectives
1. Track **survivability %** on the character profile (store + service) with rules:
   - Starts at 100%.
   - Each time age increments past 50+ years (on year rollover) reduce by 1% (floor at 0) and perform a death roll.
   - Rejuvenation spells/events can restore survivability but never above 100%.
2. Implement an **age timer**: every real-time minute of gameplay adds 1 day via a centralized helper (`addDaysToAge`).
3. Build `addDaysToAge` (or similar) utility that: adjusts totals, handles year rollover, triggers survivability decay + hardcore death, emits logging, and notifies HUD.
4. Update UI to display **years only** and recolor the age text based on survivability thresholds (100 = current color, <100 yellow, <90 orange, <80 red, <=70 violet).
5. Introduce a new glyph/spell (name TBD during implementation) that, when cast, adds +5% survivability (capped at 100) and otherwise behaves like non-blocking utility spells (no effect cancellation, resets to camera 0 if needed). Sanity cost: temp 5 / max 8.
6. Ensure hardcore death (when survivability roll fails) cleanly ends the run (reuse existing death handling but flag as age-related, maybe via `GameEngine` or `CharacterProfileService`).
7. Documentation & wiki updates:
   - **Mechanics doc** describing age growth, survivability decay, death rolls, timer, rejuvenation sources.
   - **Grimoire/Glyph doc** describing the new spell, rune, costs, and effect.
   - **Wiki game rules** page + glyph listing updated accordingly.

## Implementation Steps
1. **Data Model & Services**
   - Extend `CharacterProfile` with `survivability` (number 0-100) and update `GameStateStore` default values, normalization, `setCharacterProfile`, serialization helpers.
   - Add methods in `CharacterProfileService` for age adjustments (`addDaysToAge`, `adjustSurvivability`). Ensure they emit store change events and logging.
2. **Age Progression Logic**
   - Add timer inside `GameEngine` (or dedicated service) that tracks elapsed real ms, converts to minutes, and calls `characterProfileService.addDaysToAge(1)` per minute while gameplay is active.
   - `addDaysToAge` should:
     - Update `totalDays`, recompute years/days.
     - Detect each year rollover. For each rollover beyond 50 years, decrement survivability by 1% and trigger `maybeHandleAgeDeath()`.
     - On survivability change, clamp range and notify UI.
3. **Hardcore Death Handling**
   - Implement `maybeHandleAgeDeath(reason)` inside `GameEngine` or service: random roll comparing survivability percentile, kill ship if roll fails, show HUD/game-over message, disable respawn.
4. **UI Updates**
   - Modify `InventoryPanel` to only display years in the age line and tint text per survivability thresholds (provide helper to map percentage to color).
   - Ensure snapshot carries survivability (maybe inside `character.age` block or parallel field).
5. **New Glyph / Spell Implementation**
   - Update `SpellType` enum, label/description helpers, sanity costs.
   - Add glyph asset placeholders (icon/rune) if required.
   - Integrate into grimorio UI (routes, components, equip logic) similarly to existing spells.
   - Implement casting logic in `GameEngine` (or relevant handler) to add +5% survivability (cap 100) and ensure it doesn’t conflict with other spell states (no placeholders, only camera reset if needed).
6. **Timer Event Hook**
   - Ensure existing gameplay loops (pauses, cutscenes) don’t double-count minutes. Possibly tie to `update(deltaTime)` accumulation.
7. **Documentation & Wiki**
   - After implementation, update: `documentacion/Grimorio_y_Hechizos.md`, `documentacion/Resumen_Proyecto_y_Progreso.md`, `documentacion/Layout.md` (if needed), wiki `pages/game-rules` (age mechanics) and `pages/glyphs` (new glyph entry).

## Future Considerations
- Rejuvenation spells/events beyond the new glyph (placeholders for future design).
- Save/load support for survivability & age stats.
- Visual/audio cues when survivability drops or death roll occurs.
- Accessibility: colorblind-friendly indicators for survivability thresholds.
