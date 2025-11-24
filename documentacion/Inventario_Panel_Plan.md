# Plan de Panel de Inventario / Carga

## 1. Alcance
- Añadir un panel HUD full-screen para mostrar datos del piloto, equipamiento y carga.
- Integrarlo al flujo existente de paneles (Mapa y Grimorio) reutilizando `PanelEventCoordinator`.
- Proveer binding a la tecla `I`, con los mismos bloqueos/cooldowns que los otros paneles.

## 2. Datos del Piloto
- Referencia única (por ahora) a **Harvey Walters**.
- Atributos expuestos:
  - `nombre`: string ("Harvey Walters").
  - `cordura`: número entre 0 y 100 (default **58**).
  - `salud`: número entre 0 y 100 (default **100**).
  - `memoria`: número entre 0 y 100 (default **0**, representa progreso narrativo desbloqueado por fragmentos de historia).
  - `nivel`: entero que inicia en **0** y aumenta al completar cada barra de experiencia.
  - `experiencia`: valor dinámico `0..experienceMax` (caps Fibonacci-like: 100→200→300→500→...), más `experienceMax` para la barra actual.
- Equipo personal:
  - Lista corta de piezas (por ahora free-form) mostrada junto al perfil.
  - Slots dedicados: `Traje` y `Botas` renderizados como tarjetas destacadas dentro de la columna izquierda.

## 3. Layout del Panel
- Canvas 1024×1024 (ajustable) proyectado como quad, igual que `SolarSystemPanel`/`GrimoirePanel`.
- División horizontal:
  1. **Columna izquierda (35%)**
     - Cabecera con retrato/placeholder + nombre.
     - Indicadores circulares/barras para `Salud` y `Cordura`.
     - Lista vertical de equipo personal.
     - Slots especiales para `Traje` y `Botas` (cards con ícono + estado).
  2. **Columna central (40%)**
     - Grid de slots de nave (ej. Reactor, Alas, Motor, Drones, Armamentos).
     - Cada slot muestra módulo equipado, rareza (color) y estado.
  3. **Columna derecha (25%)**
     - Lista scrollable con el manifiesto de carga.
     - Encabezado incluye barra de capacidad (`current / max`, hoy 10u).
     - Items agrupados (materias primas, artefactos, etc.) con chips de categoría.

## 4. Componentes Técnicos
- **Tipos** (`src/app/game/types/inventory.types.ts`):
  - `CargoItemType`, `EquipmentSlot`, `PersonalGearSlot`, `RarityTier`.
  - Interfaces/Tipos `CargoManifestEntry`, `EquipmentSlotState`, `CharacterProfile`, `InventorySnapshot`.
  - Interacción: `InventoryPanelRegion`, `InventorySelection`, `InventoryActionType`.
- **Estado** (`GameStateStore`):
  - Campos nuevos: `characterProfile`, `equipmentLoadout: Record<EquipmentSlot, EquipmentSlotState>`, `cargoManifest: CargoManifestEntry[]`, `inventoryReopenAllowedAtMs`.
  - Métodos `setCharacterProfile`, `setEquipmentLoadout`, `setCargoManifest`, `upsertCargoEntry`, `removeCargoEntry` (todos loggean y emiten `stateChanged`).
- **Servicios**:
  - `CargoHoldService`: convierte asteroides a `CargoManifestEntry`, sincroniza con `Spaceship` y el store.
  - `CharacterProfileService`: inicializa y actualiza datos básicos del piloto.

## 5. Panel HUD (`InventoryPanel.ts`)
- Canvas interno + textura WebGL; `setEnabled`, `isInteractive`, `render`.
- Entrada:
  ```ts
  update({
    character: CharacterProfile;
    equipment: Record<EquipmentSlot, EquipmentSlotState>;
    personalGear: EquipmentSlotState[]; // incluye Traje/Botas
    cargo: CargoManifestEntry[];
    cargoCapacity: { current: number; max: number; pct: number };
  }): void
  ```
- Scroll vertical en la columna derecha (wheel + drag en barra custom).
- Animación ligera de apertura/cierre (similar al grimorio, pero temática industrial).
- `InventoryPanel` rastrea regiones clicables (slots, filas de carga, botón inferior) y expone `pickRegionAtCursor()` + `setSelection()` para que `GameEngine` administre la selección.
- Footer con botón `Expulsar carga/equipo` que se habilita al tener una selección válida.

## 6. Integración con GameEngine
- Nueva propiedad `inventoryPanel` inicializada junto a los otros paneles.
- `setupPanelEventCoordinator()` registra `onInventoryClick/Move/Wheel`.
- `handleKeyDown('i')`:
  - Respeta `arePanelsLockedBySpell()`.
  - Usa `inventoryReopenAllowedAtMs`.
  - Cierra mapa y grimorio al abrir inventario (hasta que exista `PanelStateManager`).
  - Reproduce `ui_inventory_open/close` (usar `audio.play` temporalmente, luego migrar a UIAudioService).
  - Ejecuta `refreshInventoryPanelSnapshot()` cuando el panel ya estaba abierto para evitar frame-stale.
- `handleEscape()` cierra el inventario si está activo.
- `tick()` inyecta snapshot actual en el panel mediante `buildInventorySnapshot()` (clona arrays/objetos para preservar inmutabilidad) usando datos del store + `ShipsCargo` ya usado por `CargoGauge`.

## 7. PanelEventCoordinator
- Extender `PanelEventCallbacks` con `onInventoryClick`, `onInventoryMove`, `onInventoryWheel`.
- Flags adicionales: `inventoryEnabled` + `setInventoryEnabled()`.
- Wheel bloquea scroll de la página cuando inventario activo.

## 8. Flujo de Cargo
- `Spaceship` mantiene conteo total (`cargoCapacityCurrent/Max`).
- `CargoHoldService.convertAsteroid()` produce `CargoManifestEntry` con:
  - `id`, `label`, `mass`, `rarity`, `type` (raw material, reliquia, etc.).
- Store sincronizado para que el panel muestre datos persistentes (reset al respawn mediante `clearManifest()` + `setCargoManifest([])`).

> Detalle exhaustivo del manifiesto y snapshots: ver `documentacion/Sistema_Cargo_Inventory.md`.

## 9. Pruebas
- Manual: `M/L/I` se excluyen mutuamente, Escape cierra el panel activo, wheel no hace scroll global, lista de carga respeta la capacidad, Traje/Botas siempre visibles.
- Manual (nueva UX): selección de fila/slot resalta el elemento, el footer muestra el resumen y `Expulsar` sólo funciona si hay selección.
- Unit tests en `CargoHoldService` y nuevos mutadores del store.

## 10. Próximos pasos
1. Crear tipos y servicios (`inventory.types.ts`, `CargoHoldService`, `CharacterProfileService`).
2. Extender `GameStateStore`.
3. Implementar `InventoryPanel` con layout descrito.
4. Cablear `PanelEventCoordinator` y `GameEngine` (tecla `I`, Escape, rendering).

## 11. Estado de implementación (Nov 2025)
- Tipos, store y servicios completados (`inventory.types.ts`, `GameStateStore`, `CargoHoldService`, `CharacterProfileService`).
- `InventoryPanel` activo y renderizando snapshots con capacidad dinámica.
- `PanelEventCoordinator` cableado con callbacks específicos para inventario y cooldown en `GameStateStore`.
- Hooks de conversión ya registran la carga real y limpian manifiesto en resets.
- Botón de jettison en footer operativo para carga, módulos y equipo personal (selecciona → click `Expulsar`).
- Pendiente: flujos de venta/descarga y audio definitivo vía `UIAudioService`.

## 12. Interacción y Jettison
- `PanelEventCoordinator` entrega `onInventoryClick/Move/Wheel`; `GameEngine` convierte el click en selección vía `InventoryPanelRegion`.
- Selección actual se guarda en `GameEngine.inventorySelection` y se refleja visualmente llamando `InventoryPanel.setSelection()`.
- Acción `InventoryActionType.JETTISON`:
  - **Carga**: `Spaceship.removeCargo(units)` + `CargoHoldService.removeCargoEntry()`.
  - **Módulos**: `GameStateStore.setEquipmentSlot(slot, null)`.
  - **Equipo personal**: `GameStateStore.removePersonalGearAtIndex(index)`.
- Tras expulsar se limpia la selección, se refresca el snapshot y se reproduce `ui_inventory_close` (temporal hasta tener SFX dedicados).
