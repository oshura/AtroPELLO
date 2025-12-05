# Sistema de Paneles e Inventario

> Última actualización: diciembre 2025 · Responsable: Game Systems Team.
>
> Este documento consolida la información previamente distribuida en `PanelEventCoordinator.md`, `Inventario_Panel.md`, `Sistema_Cargo_Inventory.md` e `InventoryPanel.md`. Aquí se describen la arquitectura del manejo de eventos, el HUD de inventario, el flujo de carga y los contratos de datos implicados.

---

## 1. Visión General

El juego cuenta con tres paneles HUD (Mapa, Grimorio e Inventario) que comparten un flujo común:

1. **PanelEventCoordinator** se encarga de enlazar eventos DOM y enrutar entradas según el panel activo.
2. **GameEngine** implementa callbacks que actualizan estado, reproducen audio y construyen snapshots.
3. **HUD Panels** (`SolarSystemPanel`, `GrimoirePanel`, `InventoryPanel`) renderizan sus texturas en un canvas 1024×1024 que luego se compone en WebGL.
4. **Servicios de juego** (`GameStateStore`, `CargoHoldService`, `CharacterProfileService`) mantienen el estado que consumen los paneles.

El objetivo del sistema de inventario es mostrar datos del piloto, equipamiento de la nave, equipo personal y carga, además de permitir acciones como expulsar elementos.

---

## 2. PanelEventCoordinator

### 2.1 Objetivo y Métricas

| Métrica | Antes (dic-2024) | Después | Impacto |
| --- | --- | --- | --- |
| Líneas en `GameEngine.ts` | 6,449 | 6,161 | −288 líneas (−4.5%) |
| Responsabilidades | Binding DOM + lógica | Lógica solamente | Enrutamiento externo |
| Testabilidad | Baja (acoplado) | Media (callbacks inyectables) | ✅ |

El coordinador maneja todos los eventos DOM del canvas y decide a qué panel o sistema delegar. Desde noviembre 2025 soporta inventario sin cambios estructurales.

### 2.2 API Principal

```ts
@Injectable({ providedIn: 'root' })
export class PanelEventCoordinator {
  initialize(canvas: HTMLCanvasElement, callbacks: PanelEventCallbacks): void;
  setMapEnabled(enabled: boolean): void;
  setGrimoireEnabled(enabled: boolean): void;
  setInventoryEnabled(enabled: boolean): void;
  setInputsBlocked(blocked: boolean): void;
  destroy(): void;
}
```

`PanelEventCallbacks` contiene 15 callbacks, incluyendo:
- `onMapToggle`, `onMapClick`, `onMapMove`, `onMapWheel`
- `onGrimoireToggle`, `onGrimoireClick`, `onGrimoireMove`
- `onInventoryToggle`, `onInventoryClick`, `onInventoryMove`, `onInventoryWheel`
- `onEscape`, `onCameraMode`, `onShipControl`, `on3DClick`

Los eventos se enrutan evaluando flags (`mapEnabled`, `grimoireEnabled`, `inventoryEnabled`, `inputsBlocked`). La exclusividad entre paneles se mantiene en `GameEngine` hasta que se implemente `PanelStateManager`.

### 2.3 Integración en GameEngine

`setupPanelEventCoordinator()` inicializa el servicio y registra los callbacks. Métodos destacados:
1. `handleMapToggle/Click/Move/Wheel`
2. `handleGrimoireToggle/Click/Move`
3. `handleInventoryToggle/Click/Move/Wheel`
4. `handleEscape`, `handleCameraMode`, `handle3DClick`, `updateShipControls`

Los métodos legacy (`updateMapClickBinding`, etc.) permanecen como stubs para compatibilidad y serán eliminados en FASE 6b.

### 2.4 Testing manual
- Teclas `M/L/I` abren/cierra paneles con audio correcto.
- `Escape` cierra el panel activo (inventario tiene prioridad).
- Scroll del mouse no afecta la página cuando un panel está activo.
- Targeting 3D solo está habilitado cuando ningún panel está activo.

---

## 3. Datos y Servicios del Inventario

### 3.1 GameStateStore

Campos relevantes:
- `characterProfile`: `{ name, sanity, health, memory, level, experience, experienceMax }`.
- `personalGear`: lista de `PersonalGearItem` (slots `SUIT`, `BOOTS`, accesorios).
- `equipmentLoadout`: `Record<EquipmentSlot, EquipmentSlotState | null>`.
- `cargoManifest`: `CargoManifestEntry[]`.
- `inventoryReopenAllowedAtMs`: cooldown de panel.

Reglas:
1. Todas las mutaciones pasan por el store (`setCharacterProfile`, `setEquipmentSlot`, `upsertCargoEntry`, etc.).
2. Cada mutación emite `stateChanged$` con `type = 'inventory-updated'`.
3. `reset()` limpia manifiesto y restablece `cargoCapacityCurrent`.

### 3.2 CharacterProfileService

- Expone `updateCharacterVitals`, `adjustExperience`, `registerExperienceEvent`.
- Experiencia usa caps Fibonacci (100, 200, 300, 500, ...). Eventos principales:

| Evento | Delta XP |
| --- | --- |
| Nave enemiga destruida | +25 |
| Primigenio derrotado | +50 |
| Aterrizaje planetario | +3 |
| Nueva especie | +100 |
| Hechizo | +1 |
| Portal | +5 |
| Muerte del jugador | −50 |

- Cordura reduce su tope según los hechizos aprendidos (`SANITY_BASE_MAX - Σ spell.max`).

### 3.3 CargoHoldService

Flujo de conversión (Anchoring Pulse / Void Kinesis):
1. Validar capacidad (`cargoCapacityRemaining`).
2. `Spaceship.addCargo(units)`.
3. `CargoHoldService.registerAsteroidConversion()` crea/actualiza `CargoManifestEntry` con id único (`cargo-<asteroidId>-<ts>`), tipo y rareza.
4. `gameState.upsertCargoEntry(entry)` sincroniza HUD.

Resets:
- Al crear la nave o reiniciar partida se llama `cargoHoldService.clearManifest()` y se vacía `cargoManifest`.
- Jettison manual elimina carga, módulos o equipo personal según la selección.

### 3.4 Reglas Clean Code
1. **Store primero**: Nada toca el panel directamente.
2. **Snapshots inmutables**: `buildInventorySnapshot()` clona estructuras antes de dárselas al panel.
3. **Servicios delgados**: sin acceso a DOM/HUD.
4. **Hooks simétricos**: toda alta de carga/mods debe tener su baja.
5. **Resets explícitos** en respawn.

---

## 4. InventoryPanel

### 4.1 Contrato de datos (`InventorySnapshot`)

```ts
interface InventorySnapshot {
  character: CharacterProfile;
  equipment: Record<EquipmentSlot, EquipmentSlotState | null>;
  personalGear: PersonalGearItem[];
  cargo: CargoManifestEntry[];
  cargoCapacity: { current: number; max: number; pct: number };
}
```

Opcionalmente se incluyen `shipStats` y otras derivadas ya resueltas por `GameEngine`.

### 4.2 Layout del Canvas (1024×1024)

1. **Columna izquierda (35%)**
   - Perfil del piloto (nombre, nivel, barras de salud/memoria/experiencia/cuerda).
   - Cuadrícula de cordura que respeta slots reservados por hechizos.
   - Lista de equipo personal (Traje, Botas, Accesorios) con placeholders si faltan.

2. **Columna central (40%)**
   - Tarjetas de slots de nave (`CORE`, `REACTOR`, `ENGINE`, `WINGS`, `HULL`, `SHIELD`, `DRONE_BAY`, `AUXILIARY`).
   - Cada tarjeta muestra módulo, rareza, capacidades dinámicas y placeholders "Slot vacío".

3. **Columna derecha (25%)**
   - Gauge de capacidad (`current / max`, admite valores >100% para buffs).
   - Lista scrollable del manifiesto con resaltado de selección.

4. **Footer**
   - Resumen de la selección (`Slot · etiqueta`, `Carga · nombre`).
   - Botón "Expulsar carga/equipo" habilitado para carga o equipo personal.

### 4.3 Interacción

- `setCursorFromViewport()` convierte coordenadas y obliga repaint para el cursor custom.
- `handleWheelFromViewport()` detecta columna y ajusta scroll con clamps.
- Después de dibujar cada elemento se registra una `InventoryPanelRegion`. `pickRegionAtCursor()` evalúa en orden inverso para priorizar la capa superior.
- `setSelection()` guarda la selección y repinta; `update()` limpia selecciones inválidas automáticamente.
- `InventoryActionType.JETTISON` genera regions de acción que `GameEngine` traduce a llamadas de servicio.

### 4.4 Flujo de Render
1. `update(snapshot)` almacena datos, ajusta scroll y selección.
2. `paint()` dibuja el canvas completo.
3. `uploadTexture()` copia a la textura HUD para el siguiente frame.

### 4.5 Extensiones recomendadas
- Añadir métricas de nave adicionales (`maxSpeed`, `acceleration`) en tarjetas.
- Incorporar blueprint previews resolviendo datos asíncronos antes del snapshot.
- Migrar audio de hover/click a `UIAudioService`.

---

## 5. Flujo completo (eventos → estado → HUD)

```
           DOM Events
               │
               ▼
   PanelEventCoordinator
        (routing flags)
               │
               ▼
        GameEngine callbacks
  (toggle panel, update selection,
     buildInventorySnapshot)
               │
               ▼
        GameStateStore snapshots
  + CargoHoldService / CharacterProfileService
               │
               ▼
           InventoryPanel
  (render canvas + hit regions)
               │
               ▼
           HUDManager
```

---

## 6. Checklists Operativos

### Conversión de asteroide
- [ ] Validar distancia/capacidad.
- [ ] `Spaceship.addCargo(units)`.
- [ ] `CargoHoldService.registerAsteroidConversion()`.
- [ ] Destruir asteroide y refrescar panel si estaba abierto.

### Respawn / Reinicio
- [ ] `cargoHoldService.clearManifest()`.
- [ ] `Spaceship.cargoCapacityCurrent = 0`.
- [ ] `setCargoManifest([])`.
- [ ] `inventoryPanel.setEnabled(false)` para evitar texturas obsoletas.

### Expulsión manual
- [ ] Seleccionar fila o slot en el panel.
- [ ] Click en "Expulsar carga/equipo".
- [ ] Ejecutar la acción correspondiente (carga/módulo/equipo personal).
- [ ] Refrescar snapshot (`refreshInventoryPanelSnapshot()`).

### Pruebas de entrada
- [ ] `M/L/I` se excluyen mutuamente con audio correcto.
- [ ] Scroll del inventario bloquea scroll global.
- [ ] Footer refleja siempre la selección actual.
- [ ] Botón de expulsión se deshabilita al limpiar la selección.

---

## 7. Roadmap (Fase 6b–6d)

1. **PanelStateManager (6b)**: extraer cooldowns y mutual exclusivity del `GameEngine`. Impacto estimado −150 líneas.
2. **UI Audio Integration (6c)**: centralizar SFX de paneles en `UIAudioService`. Impacto estimado −80 líneas.
3. **CursorManager (6d)**: mover `updateCanvasCursor()` y estilos a un servicio dedicado (−20 líneas).

---

## 8. Referencias de Código
- `src/app/services/ui/panel-event-coordinator.service.ts`
- `src/app/game/GameEngine.ts` (secciones paneles/inventario)
- `src/app/services/game/game-state.store.ts`
- `src/app/services/game/cargo-hold.service.ts`
- `src/app/services/game/character-profile.service.ts`
- `src/app/game/hud/InventoryPanel.ts`
- `src/app/game/types/inventory.types.ts`

---

## 9. Estado de Implementación (dic 2025)
- PanelEventCoordinator extraído y activo con inventario integrado.
- InventoryPanel renderizando snapshot completo, scroll independiente y acción de expulsión funcional.
- Store/servicios sincronizados con Anchoring Pulse, jettison y respawn.
- Pendiente: audio UI dedicado, PanelStateManager y flujos de venta/descarga.

---

Con este documento es posible mantener o extender el sistema de paneles sin revisar múltiples archivos históricos. Cualquier nueva funcionalidad deberá actualizar esta guía y la wiki correspondiente.
