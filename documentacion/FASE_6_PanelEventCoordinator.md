# FASE 6: PanelEventCoordinator - Extracción de Event Handling

**Estado**: ✅ **COMPLETADA** (Diciembre 2024) • **Actualización inventario** (Noviembre 2025)

**Objetivo**: Reducir la complejidad de GameEngine extrayendo todo el manejo de eventos DOM a un servicio dedicado `PanelEventCoordinator`.

---

## 📊 Métricas de Impacto

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| **Líneas en GameEngine.ts** | 6,449 | 6,161 | **-288 líneas (-4.5%)** |
| **Responsabilidades en GameEngine** | Event binding + state + audio + cursor | State + audio + cursor only | Event routing externalized |
| **Testabilidad** | Difícil (acoplado a DOM) | Mejorada (callbacks inyectables) | ✅ |
| **Mantenibilidad** | Baja (eventos dispersos) | Alta (lógica centralizada) | ✅ |

---

> **Actualización 2025**: La llegada del panel de inventario demostró que la arquitectura escala sin cambios drásticos; se añadieron callbacks/flags nuevos manteniendo el mismo contrato.

## 🏗️ Arquitectura Implementada

### Componentes Nuevos

#### 1. **PanelEventCoordinator Service** (~230 líneas)
```typescript
@Injectable({ providedIn: 'root' })
export class PanelEventCoordinator {
  // Event routing based on panel state
  initialize(canvas: HTMLCanvasElement, callbacks: PanelEventCallbacks): void
  
  // State setters (called from GameEngine)
  setMapEnabled(enabled: boolean): void
  setGrimoireEnabled(enabled: boolean): void
  setInventoryEnabled(enabled: boolean): void
  setInputsBlocked(blocked: boolean): void
  
  // Cleanup
  destroy(): void
}
```

**Responsabilidades**:
- ✅ Bind/unbind DOM events (keydown, keyup, click, mousemove, wheel)
- ✅ Route events to appropriate callbacks based on state flags
- ✅ Garantizar exclusividad entre mapa, grimorio e inventario (flags dedicados)
- ✅ Prevent event leakage (e.g., 3D clicks cuando map/grimoire abierto)
- ✅ Cleanup de listeners en destroy()

**NO gestiona** (diferido a FASE 6b-6d):
- ❌ State management (cooldowns, mutual exclusivity)
- ❌ Audio playback (`audio.play()` calls)
- ❌ Cursor styling (`canvas.style.cursor`)

---

### Interface: PanelEventCallbacks

Define 15 callbacks que conectan el coordinador con la lógica de GameEngine:

```typescript
interface PanelEventCallbacks {
  // Map panel (M key)
  onMapToggle: () => void;
  onMapClick: (clientX: number, clientY: number) => void;
  onMapMove: (clientX: number, clientY: number) => void;
  onMapWheel: (deltaY: number, clientX: number, clientY: number) => void;
  
  // Grimoire panel (L key)
  onGrimoireToggle: () => void;
  onGrimoireClick: (clientX: number, clientY: number) => void;
  onGrimoireMove: (clientX: number, clientY: number) => void;
  
  // Inventory panel (I key)
  onInventoryToggle: () => void;
  onInventoryClick: (clientX: number, clientY: number) => void;
  onInventoryMove: (clientX: number, clientY: number) => void;
  onInventoryWheel: (deltaY: number, clientX: number, clientY: number) => void;
  
  // General controls
  onEscape: () => void;
  onCameraMode: (mode: string) => void;  // '0', '7', '8', '9'
  onShipControl: (key: string, pressed: boolean) => void;
  
  // 3D targeting (cuando ningún panel está activo)
  on3DClick: (event: MouseEvent) => void;
}
```

---

### Flujo de Eventos Implementado

```
┌─────────────────┐
│  DOM Events     │
│  (canvas)       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  PanelEventCoordinator              │
│  • handleKeyDown(key)               │
│  • handleClick(clientX, clientY)    │
│  • handleMouseMove(clientX, clientY)│
│  • handleWheel(deltaY, x, y)        │
└────────┬────────────────────────────┘
         │
         │ Route based on state:
         │ • mapEnabled?
         │ • grimoireEnabled?
         │ • inventoryEnabled?
         │ • inputsBlocked?
         │
         ▼
┌─────────────────────────────────────┐
│  GameEngine Callbacks               │
│  • handleMapToggle()                │
│  • handleMapClick(x, y)             │
│  • handleGrimoireToggle()           │
│  • handle3DClick(event)             │
│  • etc...                           │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Game Logic                         │
│  • systemPanel.setEnabled()         │
│  • adaptiveTargeting.selectTarget() │
│  • audio.play()                     │
│  • camera.setCameraMode()           │
└─────────────────────────────────────┘
```

---

## 🔧 Cambios en GameEngine

### Métodos Nuevos (15 callbacks)

1. **handleMapToggle()**: Toggle map, play sound, close grimoire/inventory if open
2. **handleMapClick(x, y)**: Hit test viewport, select target from map
3. **handleMapMove(x, y)**: Update cursor, hover detection
4. **handleMapWheel(delta, x, y)**: Zoom map viewport
5. **handleGrimoireToggle()**: Toggle grimoire, play sound, close map/inventory if open
6. **handleGrimoireClick(x, y)**: Select spell from grimoire
7. **handleGrimoireMove(x, y)**: Update grimoire cursor
8. **handleInventoryToggle()**: Toggle inventory, aplicar cooldown (`inventoryReopenAllowedAtMs`), cerrar otros paneles
9. **handleInventoryClick(x, y)**: Interactuar con slots/scrollbars del HUD de inventario
10. **handleInventoryMove(x, y)**: Hover states y tooltips dentro del panel
11. **handleInventoryWheel(delta, x, y)**: Scroll columna de carga sin propagar al documento
12. **handleEscape()**: Close panels (inventory > grimoire > map) o clear target selection
13. **handleCameraMode(mode)**: Switch camera (orbit/follow/free/chase)
14. **handle3DClick(event)**: 3D targeting when no panel active
15. **updateShipControls(key, pressed)**: Ship thrust/rotation controls (pre-existente)

### Métodos Deprecados (convertidos a stubs)

- `updateMapClickBinding()` → ahora llama a `panelEventCoordinator.setMapEnabled()`
- `updateGrimoirePointerBinding()` → ahora llama a `panelEventCoordinator.setGrimoireEnabled()`
- `updateInventoryPointerBinding()` → ahora llama a `panelEventCoordinator.setInventoryEnabled()`
- `updateCanvasCursor()` → sin cambios (cursor styling todavía en GameEngine, FASE 6d)

**Razón para mantener stubs**: Múltiples call sites en código legacy (debug, handleKeyDown). Eliminarlos completamente requeriría refactor más profundo (FASE 6b).

---

## 🧪 Testing & Validación

### Manual Testing Checklist

- ✅ **M key**: Abre/cierra mapa con sonidos `ui_map_open/close`
- ✅ **L key**: Abre/cierra grimorio con sonidos `ui_grimoire_open/close`
- ✅ **I key**: Abre/cierra inventario, respeta cooldown `inventoryReopenAllowedAtMs`
- ✅ **Mutual exclusivity**: Abrir uno cierra el otro automáticamente
- ✅ **Escape**: Cierra panel activo con sonido apropiado
- ✅ **Map click**: Selecciona objetos del mapa (excepto nave)
- ✅ **Map hover**: Muestra outline en objetos del mapa
- ✅ **Map wheel**: Zoom en mapa sin afectar cámara 3D
- ✅ **Grimoire click**: Selecciona hechizo con sonido `ui_select_glyph`
- ✅ **Grimoire hover**: Muestra outline en glyphs con sonido `ui_outline_hover`
- ✅ **Inventory scroll**: Wheel bloquea scroll global y recorre la columna derecha
- ✅ **Inventory interactions**: Click/hover en slots actualiza highlights sin afectar 3D
- ✅ **3D click**: Targeting funciona cuando ningún panel está activo
- ✅ **0/7/8/9 keys**: Cambio de modo de cámara (debug/orbit/follow/free/chase)
- ✅ **Ship controls**: Thrusters/rotation funcionan correctamente
- ✅ **Animation blocking**: Inputs bloqueados durante animaciones (cooldowns preservados)

### Compilation Status

```bash
No errors found.
```

---

## 📝 Decisiones de Diseño

### 1. **Scope Limitado a Event Routing**

**Decisión (2024)**: Extraer SOLO la lógica de binding/routing de eventos, NO state management/audio/cursor.

**Actualización (2025)**: Añadir inventario mantuvo esta regla; el coordinador solo creció en callbacks/flags sin absorber lógica de cooldowns (que sigue en `GameStateStore`).

**Razón**: 
- Simplificar PR (Single Responsibility)
- Evitar over-engineering
- Permitir iteración incremental (FASE 6b-6d)

**Trade-off**: GameEngine todavía tiene ~4% de código relacionado con eventos (stubs + callbacks), pero ganamos testabilidad sin romper funcionalidad existente.

---

### 2. **Callbacks Pattern vs Direct Service Calls**

**Decisión**: Usar callbacks en lugar de que el coordinador llame directamente a servicios.

**Razón**:
- ✅ Desacoplamiento: PanelEventCoordinator no depende de 20+ servicios de GameEngine
- ✅ Testabilidad: Callbacks se pueden mockear fácilmente
- ✅ Flexibilidad: GameEngine decide cómo implementar cada acción

**Alternativa descartada**: Inyectar todos los servicios en PanelEventCoordinator → aumentaría complejidad del coordinador.

---

### 3. **Mantener Métodos Legacy como Stubs**

**Decisión**: Convertir `updateMapClickBinding/updateGrimoirePointerBinding` en stubs que delegan al coordinador.

**Razón**:
- ✅ Compatibilidad con código existente (debug bindings, handleKeyDown)
- ✅ Migración incremental (eliminarlos completamente en FASE 6b)
- ✅ Menos riesgo de romper funcionalidad

**Alternativa descartada**: Eliminar completamente y refactorizar todos los call sites → requeriría reescribir handleKeyDown (388 líneas), fuera de scope de FASE 6.

---

### 4. **Estado Minimal en Coordinator**

**Decisión original**: Solo 3 flags de estado en PanelEventCoordinator:
- `mapEnabled`
- `grimoireEnabled`
- `inputsBlocked`

**Actualización**: Se añadió `inventoryEnabled` siguiendo el mismo patrón (setter explícito, sin derivar lógica interna).

**Razón**:
- ✅ Suficiente para routing de eventos
- ✅ No duplica estado de panels (single source of truth en `systemPanel.isEnabled()`)
- ✅ Sincronización explícita desde GameEngine

**Alternativa descartada**: Coordinator query `systemPanel.isEnabled()` directamente → crearía acoplamiento circular, violaría SRP.

---

## 🚀 Próximas Fases

### FASE 6b: PanelStateManager (⏳ Pendiente)

**Objetivo**: Extraer state management de panels (cooldowns, mutual exclusivity, lifecycle).

**Scope**:
- Cooldowns de reapertura (`mapReopenAllowedAtMs`, `grimoireReopenAllowedAtMs`)
- Mutual exclusivity (cerrar uno al abrir otro)
- Panel lifecycle hooks (onOpen, onClose, onInteractionStart, onInteractionEnd)
- Animación state tracking (`isInteractive()` check)

**Impacto estimado**: -150 líneas de GameEngine

---

### FASE 6c: UI Audio Integration (⏳ Pendiente)

**Objetivo**: Centralizar todos los `audio.play()` calls relacionados con UI.

**Scope**:
- Mover audio triggers de GameEngine → UIAudioService
- Event-driven audio (emit events, service plays sounds)
- Separar audio UI de audio gameplay

**Impacto estimado**: -80 líneas de GameEngine

---

### FASE 6d: CursorManager (opcional)

**Objetivo**: Extraer cursor styling logic.

**Scope**:
- `updateCanvasCursor()` logic
- Grimoire cursor hiding
- Custom cursor rendering

**Impacto estimado**: -20 líneas de GameEngine

---

## 📚 Referencias

- **Código**: `src/app/services/ui/panel-event-coordinator.service.ts`
- **Integration**: `src/app/game/GameEngine.ts` (ver secciones `setupPanelEventCoordinator`, `handleInventoryToggle`)
- **Tests**: Manual testing (automated tests PENDIENTES)
- **Related docs**: 
  - `Audio_Sistema_Arquitectura.md` (audio integration)
  - `AdaptiveTargetingV2.md` (3D targeting logic)
  - `Layout.md` (panel architecture)

---

## ✅ Checklist de Completitud

- [x] PanelEventCoordinator service creado (~230 líneas)
- [x] 15 callbacks implementados en GameEngine (map, grimorio, inventario, generales)
- [x] setupPanelEventCoordinator() inicializa coordinador
- [x] Métodos legacy convertidos a stubs
- [x] Compilación exitosa (0 errores)
- [x] Manual testing completo (14 casos, incluye inventario)
- [x] GameEngine reducido en 288 líneas (-4.5%)
- [x] Documentación de FASE 6 completa
- [x] Código legacy marcado como `@deprecated`
- [x] Roadmap de FASE 6b-6d definido

---

**Conclusión**: FASE 6 cumplió su objetivo de externalizar event routing sin romper funcionalidad existente. La reducción de complejidad es moderada (-4.5%) pero la ganancia en testabilidad y separación de responsabilidades es significativa. La ampliación de Nov 2025 validó el diseño: agregar inventario solo requirió extender callbacks/flags, sin reabrir la arquitectura base. Las siguientes fases (6b-6d) continuarán reduciendo GameEngine.ts hasta alcanzar un tamaño manejable (~5,500 líneas target).

