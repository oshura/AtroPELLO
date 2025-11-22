# Sistema de Carga, Equipamiento de Nave e Inventario del Personaje

> **Fecha**: 23 Nov 2025  
> **Estado**: Activo en rama `Referegitor`

## 1. Visión General

El HUD de inventario se alimenta de tres capas coordinadas:

1. **Estado centralizado (`GameStateStore`)**: Fuente única para perfil del piloto, equipamiento de la nave y manifiesto de carga. Todos los servicios escriben aquí antes de renderizar.
2. **Servicios especializados**:
   - `CargoHoldService`: Genera y mantiene entradas del manifiesto cuando un asteroide se convierte en carga.
   - `CharacterProfileService`: Expone getters/setters seguros para el perfil del piloto y su equipo personal.
3. **Presentación (`InventoryPanel`)**: Canvas 1024×1024 renderizado como quad. Consume snapshots inmutables con datos ya normalizados.

```
Anchoring Pulse ─┐
                 ├─► CargoHoldService.registerAsteroidConversion()
Void Kinesis  ───┘
                     │
              GameStateStore (cargoManifest, characterProfile, equipmentLoadout)
                     │
              GameEngine.buildInventorySnapshot()
                     │
              InventoryPanel.update(snapshot)
```

## 2. Datos del Piloto

| Campo | Detalle | Origen |
|-------|---------|--------|
| `characterProfile` | `{ name, sanity(0-100), health(0-100) }` | `GameStateStore` (default Harvey Walters 58/100) |
| `personalGear` | Lista de `PersonalGearItem` con `slot`, `label`, `rarity` | `CharacterProfileService.setPersonalGear()` |

- **Mutadores**: `setCharacterProfile`, `updateCharacterVitals`, `replacePersonalGear`.
- **Eventos**: Cada mutación emite `stateChanged$` con `type = 'inventory-updated'` y `metadata.scope` apropiado.

## 3. Equipamiento de la Nave

- **Slots**: Enumerados en `EquipmentSlot` (CORE, REACTOR, ENGINE, WINGS, HULL, SHIELD, DRONE_BAY, AUXILIARY).
- **Estado**: `equipmentLoadout: Record<EquipmentSlot, EquipmentSlotState | null>` inicializado vía `createDefaultEquipmentLoadout()` en el store.
- **Actualización**: `setEquipmentSlot(slot, state)` clona la carga útil, notifica al HUD y garantiza que `slot` quede persistido dentro del estado (evita objetos desincronizados).

## 4. Sistema de Carga

### 4.1 Campos Clave

| Propiedad | Descripción |
|-----------|-------------|
| `Spaceship.cargoCapacityMax` | Capacidad total en unidades (default 10u, configurable por módulos futuros). |
| `Spaceship.cargoCapacityCurrent` | Unidades ocupadas actualmente. Se resetea en `createGameObjects()` y en `GameStateStore.reset()`. |
| `GameStateStore.cargoManifest` | Lista ordenada de `CargoManifestEntry` mostrada en el panel. |
| `GameStateStore.inventoryReopenAllowedAtMs` | Cooldown de panel. No impacta el manifiesto pero garantiza UX consistente. |

### 4.2 Flujo de Conversión (Anchoring Pulse)

1. `convertAsteroidToCargo(target)` valida capacidad (`cargoCapacityRemaining`) y calcula `yieldUnits` (`massTons * 0.02`).
2. `Spaceship.addCargo(yieldUnits)` aumenta `cargoCapacityCurrent` hasta el máximo.
3. `CargoHoldService.registerAsteroidConversion(target, stored)` crea/actualiza una entrada mediante:
   - `buildCargoId(sourceId)` → `cargo-<asteroidId>-<timestamp>`.
   - `resolveCargoType` y `resolveRarity` usando composición/mass del asteroide.
   - `gameState.upsertCargoEntry(entry)` para notificar al HUD.
4. Si el panel de inventario está abierto, `refreshInventoryPanelSnapshot()` se ejecuta inmediatamente para evitar frames divergentes.

### 4.3 Limpieza y Reseteo

- `GameEngine.createGameObjects()` ahora:
  - Crea una nave nueva.
  - Reinicia `cargoCapacityCurrent` a 0.
  - Invoca `cargoHoldService.clearManifest()` para vaciar el manifiesto.
- `GameStateStore.reset()` llama `setCargoManifest([])` para cubrir reloads del sistema solar.

### 4.4 Extensiones Pendientes

- Hooks para **descarga/venta** de carga deben invocar: `Spaceship.removeCargo(units)` + `cargoHoldService.removeCargoEntry(id)`.
- Integración con **módulos de nave** que expandan `cargoCapacityMax` deberá actualizar el snapshot antes de llamar al panel.

### 4.5 Expulsión manual (Jettison)

- La UI añade un botón global "Expulsar carga/equipo" que opera sobre la selección actual.
- `GameEngine.inventorySelection` determina el tipo de acción:
       - **Carga**: `Spaceship.removeCargo(entry.units)` (seguridad ante sobrecarga) + `CargoHoldService.removeCargoEntry(entry.id)`.
       - **Módulo**: `GameStateStore.setEquipmentSlot(slot, null)`.
       - **Equipo personal**: `GameStateStore.removePersonalGearAtIndex(index)` (índice coincide con el snapshot renderizado).
- Tras expulsar se limpia la selección, se reproduce `ui_inventory_close` (placeholder) y se llama `refreshInventoryPanelSnapshot()` para reflejar la bodega actualizada.

## 5. InventoryPanel Snapshot

`InventoryPanel.update(snapshot)` espera la siguiente forma (ver `InventorySnapshot`):

```ts
{
  character: CharacterProfile;
  equipment: Record<EquipmentSlot, EquipmentSlotState | null>;
  personalGear: PersonalGearItem[];
  cargo: CargoManifestEntry[];
  cargoCapacity: { current: number; max: number; pct: number };
}
```

- El snapshot se construye en `GameEngine.buildInventorySnapshot()` para evitar mutaciones en tiempo real.
- `cargoCapacity.pct` se normaliza a `[0, 200]` para soportar buffs temporales que excedan el 100% (ej. módulos experimentales).

## 6. Paneles y PanelEventCoordinator

- `PanelEventCoordinator` ahora incluye callbacks `onInventoryClick/Move/Wheel` y flag `setInventoryEnabled()`. Esto mantiene consistencia con Map (M) y Grimorio (L).
- `handleKeyDown('i')` respeta `arePanelsLockedBySpell()` y `inventoryReopenAllowedAtMs`, cerrando map/grimorio para asegurar exclusividad hasta que exista `PanelStateManager`.
- `handleEscape()` cierra inventario primero, reproduciendo `ui_inventory_close` y rearmando el cooldown.

## 7. Reglas de Clean Code para Inventory/Cargo

1. **Store primero**: Toda mutación debe pasar por `GameStateStore` antes de tocar el HUD.
2. **Snapshots inmutables**: No pasar referencias directas de arrays/objetos al panel; clonar mediante `map(entry => ({ ...entry }))`.
3. **Servicios delgados**: `CargoHoldService` y `CharacterProfileService` no deben renderizar ni tocar DOM; solo estado y logging.
4. **Hooks simétricos**: Cualquier lugar que agregue carga debe proporcionar la contraparte para eliminarla.
5. **Resets explícitos**: Crear nave o reiniciar juego ⇒ `cargoCapacityCurrent = 0` y `clearManifest()`.

## 8. Checklists Operativos

### Conversión de Asteroide a Carga
- [ ] Validar distancia y capacidad.
- [ ] `Spaceship.addCargo(units)`.
- [ ] `CargoHoldService.registerAsteroidConversion(asteroid, units)`.
- [ ] `destroyObject(asteroid)`.
- [ ] Refrescar panel si estaba abierto.

### Reinicio de Partida / Respawn
- [ ] `cargoHoldService.clearManifest()`.
- [ ] `Spaceship.cargoCapacityCurrent = 0`.
- [ ] `setCargoManifest([])` en caso de reset global.

### Expulsión Manual (Jettison)
- [ ] Seleccionar fila de carga o slot de equipo en el panel.
- [ ] Confirmar que el footer indica el elemento correcto.
- [ ] Click en `Expulsar carga/equipo`.
- [ ] Verificar que `Spaceship.cargoCapacityCurrent` y/o `GameStateStore` reflejan la eliminación.
- [ ] `refreshInventoryPanelSnapshot()` para actualizar la textura (automático al estar abierto el HUD).

---

**Anexo**: Referencias de código
- `src/app/services/game/cargo-hold.service.ts`
- `src/app/services/game/character-profile.service.ts`
- `src/app/services/game/game-state.store.ts`
- `src/app/game/GameEngine.ts` (`convertAsteroidToCargo`, `buildInventorySnapshot`, `handleInventoryToggle`)
- `src/app/game/hud/InventoryPanel.ts`

```diff
+ Anchoring Pulse ahora registra entradas reales en el manifiesto.
+ El manifiesto se limpia al crear la nave y al resetear el store.
```
