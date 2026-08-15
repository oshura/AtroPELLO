# AtroPELLO — Análisis arquitectónico y plan maestro de refactorización

> **Documento de referencia obligada.** Todo cambio de código debe ser coherente con este plan.
> Si una tarea contradice algo de aquí, se actualiza primero este documento (PR aparte) y luego se toca código.
> Autor: análisis automatizado profundo del 2026-06-12 (rama `main`, commit `9553862`).

---

## 1. Resumen ejecutivo

El juego funciona y tiene una base técnica seria (motor WebGL2 propio sin three.js, solo `gl-matrix`).
El problema no es de calidad puntual sino de **concentración y duplicación**:

| Síntoma | Causa raíz |
|---|---|
| "Se me desmonta todo al tocar snapshots" | Hay **2 pipelines de serialización paralelos** y los ~25 campos de un planeta se copian a mano en **6 sitios distintos**. Añadir un campo exige 6 ediciones; olvidar una pierde estado en silencio. |
| "Al bajar de la nave caes dentro del suelo" | El ruido del terreno está **duplicado** (malla visual vs. colisión) con **clamps distintos**, la malla 32×64 no puede representar la 3ª octava que la colisión sí evalúa, y **no hay semilla**: todos los planetas tienen el mismo terreno y nada se persiste. |
| "Inmantenible, lo mismo programado en varios sitios" | `GameEngine.ts` tiene **15.628 líneas y ~560 métodos** (god object). Dos árboles de servicios paralelos. Dos sistemas de targeting. Utilidades matemáticas repetidas en ≥6 ficheros. |

**Estrategia**: no reescribir; **extraer y unificar por fases**, cada fase entregable y con build verde,
empezando por las dos fuentes de dolor activas (terreno y serialización) y dejando la descomposición
del motor para cuando exista red de seguridad (tests + códecs).

---

## 2. Radiografía del código (2026-06-12)

- ~207 ficheros TS de producción, ~75.800 líneas.
- **Top god-files**: `GameEngine.ts` 15.628 · `GrimoirePanel.ts` 2.070 · `particle-effects.service.ts` 1.779 · `game-state.store.ts` 1.725 · `HUDManager.ts` 1.645 · `OutlineRenderer.ts` 1.580 · `ShaderManager.ts` 1.570 · `AtmosphereSceneManager.ts` 1.405 · `landing-action.service.ts` 1.400 · `Spaceship.ts` 1.296.
- Tests: 6 ficheros `.spec.ts` + un arnés de savegames muy valioso (`savegame-harness.ts`, 1.114 líneas). Karma/Jasmine configurado.
- Sin ESLint configurado; Prettier sí (en `package.json`).
- Angular 20 standalone + SSR (la parte SSR solo sirve landing/SEO; el juego es 100 % cliente).

### Mapa de capas real (hoy)

```
components/game/game.ts ──► GameInitializer ──► GameEngine (DIOS: loop, render,
        │                                        física, hechizos, aterrizaje,
        ▼                                        persistencia, HUD, audio, …)
services/game/* (app)  ◄──── acoplamiento bidireccional, a menudo vía (engine as any)
game/services/* (game) ◄────┘
GameStateStore (estado central, pero el engine guarda estado propio aparte)
```

---

## 3. Hallazgos detallados (con evidencia)

### F1 — `GameEngine.ts`: god object de 15.628 líneas
Mezcla, en una sola clase: game loop y scheduling de frames; input de teclado/ratón; render de nave
por módulos, planetas, debris, beams, HUD-plane; física atmosférica (gravedad, drag, jitter, clima);
orquestación de aterrizaje/despegue; casting y resolución de hechizos + render de sus beams;
respuesta a colisiones; gestión de lesser beings; captura/aplicación de snapshots; muerte/respawn;
envejecimiento hardcore; coordinación de paneles; resize de canvas; audio. Todo método nuevo cae aquí
por gravedad. **Es la causa estructural de la duplicación**: como nadie encuentra nada, se reescribe.

### F2 — Doble pipeline de serialización del universo (la causa del "se desmonta todo")

Hay **dos representaciones persistentes** del mismo mundo:

| | Pipeline A: `SolarSystemSnapshot` (declarativo) | Pipeline B: `SerializedUniversePayload` (por objeto) |
|---|---|---|
| Tipo | `game/types/solar-system.types.ts` | `game/types/universe-state.types.ts` |
| Captura | `SolarSystemRuntimeSerializerService.capturePlanets()` → `SolarSystemSerializer.fromState()` | `UniverseStateSnapshotService.captureLivePayload()` → `buildPlanetMetadata()` |
| Almacén | `PortalPersistenceService` (mapa en memoria por etiqueta) | savegame JSON (Cloud Saves) |
| Aplicación | `GameEngine.applySolarSystemSnapshot()` (reconstrucción manual campo a campo, líneas 5086-5379) | `UniverseStateSnapshotService.buildSnapshotFromPayload()` + `extractPlanetSnapshots()` → convierte B→A → aplica A |

Los ~25 campos de gameplay de un planeta (`inhabitants`, `lesserBeing`, `visited`, `hasArtifact`,
`voidMass*`, `pendingMission`, `resourceStock`, intel statuses, órbita…) se **listan a mano** en:
1. `solar-system-runtime-serializer.service.ts:169-204` (`capturePlanets`)
2. `solar-system-serializer.ts:78-131` (`fromState`)
3. `universe-state-snapshot.service.ts:317-345` (`buildPlanetMetadata`)
4. `universe-state-snapshot.service.ts:542-585` (`extractPlanetSnapshots`)
5. `GameEngine.ts:5149-5281` (`applySolarSystemSnapshot`)
6. `system-generator.service.ts` (creación procedural)
(+ `solar-system.service.ts:116-121` y `GameEngine.createPlanets():9649+` instancian planetas por su cuenta).

**Bugs latentes encontrados por la divergencia** (ejemplos verificados):
- `axialTiltRad` se captura en B (`buildPlanetMetadata`) pero `extractPlanetSnapshots` lo descarta
  (no existe en `PlanetSnapshot`) → la inclinación axial se pierde al cargar partida vía payload.
- Normalización de `kind` distinta: `SolarSystemSerializer` mapea `'Tierra'→'terrestrial'`,
  `'Planetoid'→'rocky'`; `extractPlanetSnapshots` pasa `custom['planetType']` **sin normalizar** →
  `applySolarSystemSnapshot` cae al `default:` y crea un `Planet` genérico color `marron`.
- La resolución de identidad de sistema tiene **4 implementaciones con precedencias distintas**:
  `UniverseStateSnapshotService.resolveSystemIdFromSnapshot`, `PortalPersistenceService.resolveSystemKey`,
  `GameEngine.resolveSystemId/resolvePersistentSystemKey`, `SolarSystemRuntimeSerializerService.buildMeta`.
  Las claves viven en `meta: Record<string, any>` sin tipos: `proceduralSystemId`, `persistentSystemId`,
  `systemId`, `sourceSystemId`, `snapshotLabel`, `handcrafted`, `lesserBeingMemory`…
- `GamePersistenceService.buildSnapshotOptions` prueba **8 candidatos** de etiqueta en cascada para
  encontrar el snapshot al cargar. Eso es un síntoma directo de identidad mal definida.

### F3 — Terreno: el bug de "caer dentro del suelo" (verificado, no especulación)

- `AtmosphereSceneManager.terrainNoise()` (línea 341) y `terrain-sampler.computeTerrainBaseNoise()`
  son **el mismo ruido copiado dos veces**, pero el primero clampa a `[-1, 1]` y el segundo a `[-0.5, 1]`.
  En valles profundos (ruido < −0.5) la malla renderizada baja hasta `r·(1−0.08)` mientras la colisión
  cree que el suelo está en `r·(1−0.04)`: con `groundRadius` típico de 4.000-4.500 unidades
  (`enterAtmosphereScene` escala ×5) son **160-180 unidades de desacuerdo**.
- La malla es de 32×64 segmentos: la 3ª octava (frecuencia 23,5) está en el límite de Nyquist
  (~2,7 muestras/ciclo) → **la malla no puede representar el detalle que la colisión analítica sí evalúa**.
  Incluso donde los clamps coinciden hay ±2 % de radio de desacuerdo sistemático.
- `strataNoise`/`microDetailNoise` también duplicados (mismas fórmulas en ambos ficheros), y las
  constantes `DETAIL_START_ALTITUDE/FULL/EXTRUSION` están definidas dos veces.
- **No hay semilla**: el ruido usa constantes → todos los planetas tienen el mismo terreno, y el
  terreno no aparece en ningún snapshot → no es persistente ni rediseñable.
- Workaround existente que delata el problema: `sampleLandingContextSurface` clampa el resultado a
  `max(sampled, baseSurfaceRadius)` (GameEngine.ts:1570-1572) — aplana los valles para que la nave no se hunda.

### F4 — Estado duplicado motor ↔ store
`GameStateStore` es nominalmente la fuente de verdad, pero el engine mantiene aparte `planetDebris`
(Map propio), `currentSnapshot`, flags de escena… y los servicios acceden por la puerta de atrás:
`(this.engine as any).currentSnapshot`, `(engine as any).asteroidClusterService`,
`(engine as any).planetDebris` (en `universe-state-snapshot.service.ts:434` y
`solar-system-runtime-serializer.service.ts:207,242`). Además `applySolarSystemSnapshot` **mete el Sun
dentro de `gameState.planets`** (`GameEngine.ts:5133`) con cast — colección mentirosa.

### F5 — Dos sistemas de targeting + 4 renderers de retícula/outline
`game/targeting/core/*` (v1: TargetDetector 717, ReticleManager 924) convive con
`game/targeting/v2/AdaptiveTargetingSystem` (1.044) + `AdaptiveTargetingIntegrator` (474).
Render de selección repartido en `OutlineRenderer` (1.580), `TargetHighlighter`, `ReticleRenderer`,
`hud/TargetOutline2DRenderer` (422) y `hud/TargetPreviewRenderer`.

### F6 — Árboles de servicios paralelos y copias
`src/app/services/**` vs `src/app/game/services/**` sin criterio estable (p.ej. `landing-action` en
app/, `spell-io-coordinator` en game/). Tres servicios de session-cookie
(`services/session-cookie.service.ts`, `services/session-cookie-landing.service.ts`,
`libs/cloud-saves/from-landing/session-cookie.service.ts`).

### F7 — Matemáticas repetidas
`GameEngine` reimplementa `normalize/dot/cross/length/lerp/clamp/smoothstep` y un set completo de
helpers de matrices (identity/translate/rotateX/Y/Z/scale) pese a tener `gl-matrix` como dependencia.
`AtmosphereSceneManager`, `terrain-sampler`, servicios de colisión y animaciones llevan sus propias
copias. `cloneVec` aparece en ≥6 ficheros.

### F8 — Casos especiales incrustados
`applySolarSystemSnapshot` trata `planet-earth` y `planet-saturn` por id literal (debris, tilt, spin).
Debería ser data-driven (flags en el snapshot).

### F9 — Red de seguridad insuficiente
Solo 6 specs. No hay ESLint ni presupuesto de tamaño de fichero ni CI. El arnés
`savegame-harness.ts` es un activo excelente que hay que promocionar a test de regresión central.

---

## 4. Arquitectura objetivo

### 4.1 Capas y regla de dependencias

```
┌────────────────────────────────────────────────────────────┐
│ ui/            Componentes Angular, paneles HUD, diálogos  │
├────────────────────────────────────────────────────────────┤
│ application/   Casos de uso: GamePersistence, Respawn,     │
│                PortalTravel, LandingFlow, SpellCasting     │
├────────────────────────────────────────────────────────────┤
│ domain/        Estado y reglas puras: GameStateStore,      │
│                códecs de serialización, terreno, órbitas,  │
│                generadores, tipos. SIN WebGL, SIN Angular  │
│                DI hacia arriba, SIN performance.now()      │
├────────────────────────────────────────────────────────────┤
│ engine/        Loop, render, shaders, buffers, input raw,  │
│                audio. Consume domain, NUNCA al revés.      │
└────────────────────────────────────────────────────────────┘
Regla: las dependencias solo apuntan hacia abajo. domain/ no importa de engine/ ni ui/.
```

No se moverán carpetas en bloque (rompería todos los imports de golpe); la estructura se alcanza
gradualmente: **todo fichero nuevo nace en su capa correcta**, y los existentes migran cuando una
fase los toque.

### 4.2 Principios no negociables

1. **SSOT (single source of truth)**: cada dato vive en un sitio. Colecciones del mundo →
   `GameStateStore`. Campos persistentes de una entidad → su códec. Función de altura del terreno →
   `terrain-sampler`. Identidad de un sistema → `SystemIdentity`.
2. **Serializar = códec**: nadie copia campos a mano fuera del códec de la entidad.
   "La prueba del campo nuevo" (§6.5) debe pasar siempre: añadir un campo persistente = **1 fichero**.
3. **La malla es la verdad física**: la colisión se muestrea contra la misma geometría que se pinta
   (mismas funciones, misma resolución, misma interpolación). Prohibido tener dos fórmulas.
4. **Nada de `(x as any)` para cruzar capas**: si un servicio necesita algo del engine, el engine lo
   expone con un método tipado o, mejor, el dato baja a `GameStateStore`.
5. **Presupuestos de tamaño**: fichero nuevo ≤ 400 líneas; método ≤ 60. `GameEngine.ts` tiene
   **prohibido crecer**: toda función nueva nace en un servicio/sistema externo.
6. **Determinismo**: todo lo procedural (terreno, sistemas, nombres) deriva de semillas persistidas.
   `Math.random()` solo en efectos visuales sin estado.

### 4.3 Pipeline de serialización unificado (estado final)

```
            ┌───────────── códecs por entidad (domain/persistence) ─────────────┐
            │ PlanetStateCodec · PortalStateCodec · ShipStateCodec · …          │
            └──────────────┬───────────────────────────────┬────────────────────┘
   captura runtime         │                               │        aplicación
   (objetos vivos) ──► SolarSystemSnapshot  ◄── conversión única ──►  (objetos vivos)
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  PortalPersistence   RespawnAnchor          SaveGamePayload
  (viajes/portales)   (sigillum/muerte)      (Cloud Saves)
```

- `SolarSystemSnapshot` pasa a ser **la única representación** de un sistema. El
  `SerializedUniversePayload` queda como contenedor del savegame que **embebe snapshots**, no una
  segunda descripción del mundo (migración progresiva, ver Fase 4).
- `SystemIdentity` (Fase 4): un único módulo con `resolveSystemId(snapshot)` y
  `resolveSystemKey(snapshot)`, y `meta` tipado (`SolarSystemMeta` con campos declarados).

### 4.4 Terreno persistente (estado final)

- `terrain-sampler.ts` = única fuente: ruido **con semilla**, datos por vértice para la malla, y
  muestreo de colisión **exacto contra los triángulos renderizados** (misma rejilla 32×64,
  intersección rayo-triángulo).
- Semilla = `hash(planetId)` por defecto (determinista y retro-compatible con partidas existentes,
  porque `planetId` ya se persiste). Cuando llegue el rediseño de planetas, `PlanetSnapshot.terrainSeed`
  explícito tendrá prioridad (campo ya previsto en el códec).
- Parámetros futuros del terreno (amplitud, rugosidad, nivel de mar) = `PlanetSurfaceDefinition`
  dentro de `PlanetSnapshot`, consumida por malla y colisión a la vez.

---

## 5. Plan por fases

> Convenciones: **[S]** = senior, **[J]** = junior (con revisión del senior). Cada fase termina con
> `npm run build` verde, specs verdes, y una pasada de humo manual (arrancar, volar, aterrizar,
> portal, guardar, cargar, morir/respawn). Una rama por fase: `refactor/fase-N-nombre`.
> **Ninguna fase cambia gameplay**; si un comportamiento cambia, es un bug de la fase.

### Fase 0 — Red de seguridad (≈ 1 semana) ✅ parcialmente cubierta por este documento
| # | Tarea | Quién |
|---|---|---|
| 0.1 | Este documento + `CLAUDE.md` con reglas operativas | [S] ✅ hecho |
| 0.2 | Añadir ESLint (flat config) con: `max-lines` (warn 400/error 900 en ficheros nuevos), `no-explicit-any` (warn), import-cycles (error). Excluir legacy con lista explícita congelada | [J] |
| 0.3 | Promocionar `savegame-harness` a spec de regresión: guardar→cargar→comparar normalizado debe ser idéntico (round-trip). Añadir caso con planeta con TODOS los campos poblados | [S] |
| 0.4 | Script `npm run test:headless` (`ng test --watch=false --browsers=ChromeHeadless`) y úsese antes de cada merge | [J] |

**Criterio de aceptación**: lint ejecutable, round-trip spec en verde, documento mergeado.

### Fase 1 — Terreno unificado y con semilla (≈ 1 semana) ✅ implementada en esta pasada
| # | Tarea | Quién |
|---|---|---|
| 1.1 | Reescribir `terrain-sampler.ts` como SSOT: campo de terreno con semilla (fases de ruido derivadas de `mulberry32(seed)`), funciones por vértice compartidas, y `sampleAtmosphereSurfaceRadius` **exacto contra la malla** (localizar celda lat/lon → rayo-triángulo) | [S] ✅ |
| 1.2 | `AtmosphereSceneManager`: borrar `terrainNoise/strataNoise/microDetailNoise` y constantes duplicadas; construir la malla con las funciones compartidas; reconstruir la malla del suelo cuando cambie la semilla; exponer `getAppliedGroundDetailFactor()` | [S] ✅ |
| 1.3 | `GameEngine`: añadir `terrainSeed` al estado de escena (derivado de `planetId`), pasar la semilla en los 4 puntos de muestreo (líneas 1568, 3336, 3808, 4433) y preferir el detail factor aplicado por la malla | [S] ✅ |
| 1.4 | QA manual: aterrizar en 3 planetas distintos → terreno distinto por planeta; salir y volver al mismo planeta → terreno idéntico; rozar valles y crestas → sin hundimientos ni colisiones fantasma | [J] |
| 1.5 | (Seguimiento) Revisar si el clamp-workaround `max(sampled, baseSurfaceRadius)` de `sampleLandingContextSurface` puede retirarse ya — hacerlo en PR aparte con QA propio | [S] |

**Criterio de aceptación**: la altura de colisión y la malla visible provienen de las mismas
funciones (cero fórmulas duplicadas, verificable con grep de `freq1|4.2` → 1 única aparición);
terreno estable entre visitas al mismo planeta.

### Fase 2 — Códec de planeta: matar la sextuplicación (≈ 1-2 semanas) ✅ núcleo implementado
| # | Tarea | Quién |
|---|---|---|
| 2.1 | Crear `game/services/game/planet-state.codec.ts`: `capturePlanetSnapshot(planet)`, `applyPlanetSnapshotFields(planet, snap)`, `normalizePlanetKind()`, `defaultColorForKind()`, puente con el `custom` del payload leyendo claves nuevas **y legacy** (compatibilidad con saves schema 1) | [S] ✅ |
| 2.2 | `SolarSystemRuntimeSerializerService.capturePlanets` → usa el códec (borrar el mapeo manual) | [S] ✅ |
| 2.3 | `UniverseStateSnapshotService.buildPlanetMetadata` y `extractPlanetSnapshots` → usan el códec (se corrige de paso la pérdida de `axialTiltRad` y la falta de normalización de `kind`) | [S] ✅ |
| 2.4 | `GameEngine.applySolarSystemSnapshot`: el bloque de ~90 líneas de campos → `applyPlanetSnapshotFields`. La construcción de la subclase y los casos Earth/Saturn quedan (se data-drivean en Fase 6) | [S] ✅ |
| 2.5 | Réplica del patrón para portales: `portal-state.codec.ts` unificando los 3 mapeos de portal (`capturePortals` ×2 y `extractPortalSnapshots`) | [J] |
| 2.6 | Réplica para lesser beings (`captureLesserBeings`/`extractLesserBeings`/`snapshotActiveLesserBeings`) | [J] |
| 2.7 | Spec: "prueba del campo nuevo" — un test que construye un Planet con todos los campos, captura→aplica→captura y exige igualdad profunda | [J] |

**Criterio de aceptación**: grep de `voidMassCapacity` fuera del códec/tipos → solo lecturas de
gameplay, ninguna copia de serialización. Round-trip spec de Fase 0 sigue verde.

### Fase 3 — Identidad de sistemas y snapshots (≈ 1 semana)
| # | Tarea | Quién |
|---|---|---|
| 3.1 | `SolarSystemMeta` tipado (interface con `proceduralSystemId`, `persistentSystemId`, `snapshotLabel`, `handcrafted`, `elderGod`, `lesserBeingMemory`, `environment`) sustituyendo `Record<string, any>`; helper `getSystemMeta(snapshot)` | [S] |
| 3.2 | Módulo `system-identity.ts` con LA precedencia canónica; borrar las 4 copias (`UniverseStateSnapshotService`, `PortalPersistenceService`, `GameEngine`, `RuntimeSerializer.buildMeta`) | [S] |
| 3.3 | Sustituir las cascadas de candidatos de `GamePersistenceService.buildSnapshotOptions/resolveSystemName` por la identidad canónica (mantener fallback legacy SOLO en la lectura de saves antiguos, marcado `@deprecated`) | [S] |
| 3.4 | Documentar el ciclo de vida de snapshots en este doc (§7): quién guarda con qué label, cuándo se pinea, cuándo se evita | [J] |

**Criterio de aceptación**: una sola función decide el id; specs de carga de partidas antiguas verdes.

### Fase 4 — Savegame sobre snapshots ✅ HECHA (2026-06-16)
Sin retrocompatibilidad de saves (decisión del usuario): no hay migración v1→v2; los saves v1 se
rechazan con `SaveGameSchemaVersionMismatchError`.
| # | Tarea | Estado |
|---|---|---|
| 4.1 | `SaveGamePayload.universe: SolarSystemSnapshot`; `SCHEMA_VERSION = 2`, `MIN_SUPPORTED = 2` | ✅ |
| 4.2 | Borradas ~330 líneas de la 2ª representación en `UniverseStateSnapshotService` (`captureRuntimeState`, `captureLivePayload`, `serializeGameObject`, `buildSnapshotFromPayload`, `extract*`, `replaceRuntimeWithPayload`, `buildRuntimeStateFromPayload`). Quedan: `captureCurrentSnapshot`, `adoptSnapshot`, `ensureSystemState`, resolución de snapshots | ✅ |
| 4.3 | Carga = `adoptSnapshot` (persiste+pinea el snapshot embebido y lo aplica con `applySolarSystemSnapshot`) + `restartWithContext`. **Un solo camino**, idéntico a portal/respawn | ✅ |
| 4.4 | Harness (`savegame-harness.ts`) y 2 specs reescritos al contrato v2; normalizador adaptado a la forma snapshot | ✅ |

**Nota de implementación:** `RuntimeSolarSystemState.payload` (typed `SerializedUniversePayload`) queda
definido pero siempre `null` — es solo el descriptor que viaja en `GameStartContext`. Los helpers
`serialized*`/`*FromSerialized` de los códecs y los tipos `SerializedXState` quedan SIN consumidor de
producción (solo sus specs). Candidatos a borrar en una limpieza posterior (no urgente).

**Verificación manual pendiente (gameplay, requiere arrancar el juego):** guardar partida → recargar la
pestaña (PortalPersistence en memoria se vacía) → cargar; morir → respawn; cruzar portal → autoguardado.
El riesgo es bajo porque el camino de carga reusa los métodos del engine ya probados por portal/respawn.

### Fase 5 — Descomposición de `GameEngine` (≈ 3-4 semanas, incremental)
Extraer por dominios, en este orden (cada extracción = 1 PR, engine delega sin cambiar firmas públicas):
| # | Sistema nuevo | Qué se lleva de GameEngine | Quién |
|---|---|---|---|
| 5.1 | `AtmosphereFlightSystem` | gravedad/drag/auto-vector/jitter/clima/audio atmosférico (~2.500 líneas, métodos `*Atmosphere*` de física) | [S] |
| 5.2 | `LandingSystem` | touchdown, paneles, colapso, attachment, threat (~1.500) | [S] |
| 5.3 | `SpellSystem` | initiate/resolve/perform + beams (disruption/anchoring/void-kinesis) con su render en `rendering/` (~1.800) | [S] |
| 5.4 | `CombatDamageSystem` | applyShipDamage, destrucción, recompensas, corruption bonus (~800) | [J] |
| 5.5 | `WorldLifecycleSystem` | applySolarSystemSnapshot, persistActiveSystemState, restart/respawn glue (~1.200) | [S] |
| 5.6 | `PlayerProgressionSystem` | edad, survivability, muerte hardcore (~600) | [J] |
| 5.7 | `HudOrchestrator` | renderHUDPlane, paneles, cursores, marquee (~1.500) | [J] |
| 5.8 | `game/math/` único (sobre gl-matrix): borrar normalize/dot/cross/lerp/clamp/matrices duplicados en engine, atmósfera, colisiones | [J] |

Regla operativa de extracción (junior-proof): (1) crear clase nueva con constructor que recibe
`GameStateStore` + dependencias explícitas; (2) mover métodos **sin editarlos** salvo `this.x` →
parámetros/campos; (3) en el engine dejar delegaciones de una línea; (4) build + smoke; (5) PR.
Nunca mezclar "mover" con "mejorar" en el mismo PR.

**Criterio de aceptación final**: `GameEngine.ts` < 3.000 líneas y solo orquesta (loop, orden de
update/render, wiring).

#### Estado y patrón de extracción (2026-06-16)
**Hecho:**
- **5.8 `game/math/`** (`vector-math.ts` + `matrix-math.ts`): fuente única de helpers vec/matrix.
  El engine delega (1 línea cada uno). Con specs propios. Pendiente menor: colisiones usan
  `Math.hypot` inline con API distinta (no intercambiable sin riesgo) — se deja.
- **5.6 `PlayerProgressionSystem`** (`game/services/state/player-progression-system.ts`):
  envejecimiento + tiradas de supervivencia hardcore. **Con tests nuevos** (antes 0 cobertura).
- **5.4-parcial `SunProximitySystem`** (`game/services/state/sun-proximity-system.ts`):
  daño por radiación al acercarse a estrellas. Host `SunDamageHost` (engine expone
  `collectActiveSuns`/`isLandingDamageSuppressed` públicos + wrappers `emitHazardMarquee`/
  `addImpactVignette`). **Con tests nuevos**. El resto de 5.4 (applyShipDamage, destrucción de
  objetos, recompensas) sigue en el engine — es un `CombatDamageSystem` futuro.
- **Helpers de etiquetado** (`game/utils/label-utils.ts`): `getPlanetTypeLabel`, `humanizeEnumValue`,
  `rgbToHex` (funciones puras; engine delega; specs propios). Cero riesgo.
- **5.1-parcial física atmosférica PURA** (`game/atmosphere/atmosphere-physics.ts`): escala de gravedad
  por tipo de planeta, atenuación por velocidad, factor de auto-vector y factor por altitud + sus
  constantes exclusivas (`ATMOSPHERE_AUTO_VECTOR_*`, `ATMOSPHERE_GRAVITY_DEFAULT_SCALE`). Funciones
  puras; engine delega; specs propios. La orquestación stateful (aplicar fuerzas, leer
  `atmosphereSceneState`) sigue en el engine — el movimiento stateful grande necesita smoke de gameplay.
- **Dedup weather-lighting** (2026-06-20): `weatherLightingBase` en atmosphere-physics. Antes el cálculo
  de iluminación por clima estaba DUPLICADO y **divergente** entre `GameEngine.computeWeatherLightingTarget`
  (clamp sup. 1.10) y `AtmosphereSceneManager.computeLightingFactor` (clamp sup. 1.05) — misma base, distinto
  tope. Ahora la base es única y cada consumidor mantiene su clamp final ⇒ behavior-preserving. Con specs.
  (Pendiente menor: `AtmosphereSceneManager` aún tiene `clamp01`/`lerp`/`smoothstep` locales con firmas
  distintas a `game/math`; unificarlos requiere reconciliar firmas — follow-up.)
- **5.1-parcial `AtmosphereWeatherEffectsSystem`** (2026-06-20, `game/atmosphere/atmosphere-weather-effects-system.ts`,
  180 líneas): PRIMERA rebanada stateful de la atmósfera. Clase plana que POSEE el estado suavizado de
  efectos de clima (`AtmosphereWeatherEffectsState`: visibilidad/iluminación/turbulencia/deriva/impacto)
  + la capa de tinte (overlay alpha/color) + el flag de absorción de impactos. Se llevó verbatim
  `updateWeatherEffectsState`, `updateWeatherOverlayState`, `computeWeatherLightingTarget`,
  `updateAtmosphereImpactAbsorptionHud`, `createDefault…State` y la mitad-overlay de `resetWeatherVisualLayers`.
  **Host mínimo** `AtmosphereWeatherEffectsHost` (2 métodos: `isAtmosphereSceneActive()` +
  `emitImpactAbsorptionWarning()`), pasado vía adaptador cacheado (no `this`, así `emit…` sigue privado).
  El engine: lee `weatherEffectsSystem.effects` en la física (drag/drift/jitter/hud) y `.overlayAlpha/.overlayColor`
  en el render; delega `getWeatherImpactVolumeScale`. `WEATHER_DRIFT_OFFSET_MAX` (750) subió a
  `atmosphere-physics` (compartido con el HUD de telemetría). **Con specs nuevos (6).** GameEngine 13.845 → 13.716.
  Las capas de RELÁMPAGO (flash/shock/pendingAudio) siguen en el engine (entrelazadas con visuales/cámara/audio)
  → rebanada futura. **Behavior-preserving, pero toca render/frame-loop ⇒ requiere smoke de gameplay:** entrar en
  atmósfera con clima (tormenta de polvo/niebla densa/lluvia) y verificar tinte de pantalla, oscurecimiento por
  clima, deriva del viento y el aviso "Absorción atmosférica…". **VALIDADO en juego por el usuario (2026-06-20).**
- **5.1-parcial telemetría HUD** (2026-06-20, `game/atmosphere/atmosphere-telemetry.ts`, 171 líneas): constructores
  PUROS de la telemetría atmosférica — `classifyAtmosphereTurbulence`, `getAtmosphereWeatherDisplayLabel`,
  `buildAtmosphereTelemetryPayload` (visibilidad/turbulencia/estabilidad/deriva/lift), `buildAtmosphereTelemetryPanelState`
  (panel completo del HUD: planeta, avisos, clima). El motor solo reúne entradas (estado de clima, altitud, deriva)
  y asigna; el logging se queda en el motor. SIN host (funciones puras con argumentos explícitos). **Con specs
  nuevos (11).** GameEngine 13.716 → 13.604. Riesgo bajo (lógica pura testeada; el wiring del motor es fino), pero
  alimenta el HUD ⇒ verificar el panel de telemetría en atmósfera (estabilidad, avisos, etiqueta de clima, deriva).
  NB: descarté la rebanada de RELÁMPAGO como "siguiente" — `spawnAtmosphereLightningBolt` es casi toda geometría
  acoplada al motor (cámara/nave/radios de escena/partículas/4 helpers math); sólo sus últimas 5 líneas tocan estado.
- **5.1 NÚCLEO DE FUERZAS extraído** (2026-06-20): `AtmosphereFlightSystem` (`atmosphere-flight-system.ts`, 299 líneas)
  + `AtmosphereShakeSystem` (`atmosphere-shake-system.ts`, 279 líneas), separados para respetar el ≤400. Movidos
  VERBATIM del motor: auto-vector (sustentación asistida), fuerzas de clima (deriva+turbulencia), drag/aceleración,
  deriva progresiva (flight) y jitter/shake de cámara y nave (shake). Cada sistema posee su estado transitorio
  (autoVectorCurrent/driftForceApplied/telemetría/fases/bias) y sus constantes; el motor implementa un host único
  `AtmosphereFlightHost` (adaptador cacheado, ~13 métodos: nave/cámara/clima/altitud/estabilidad/up-vector/etc.) y deja
  delegadores de 1 línea, así el frame-loop (`update()`) no cambia. Cross-reads re-apuntados (HUD lee
  `atmosphereFlight.driftForceApplied/autoVectorCurrent/autoVectorTelemetry`; la supresión por contacto la extiende el
  motor vía `atmosphereFlight.autoVectorSuppressedUntilMs` público). Constantes compartidas (BAND_MIN,
  TURBULENCE_SHAKE_THRESHOLD) subidas a atmosphere-physics. **Tests nuevos: 20** (flight 10 + shake 10) con host/nave/
  cámara stub. GameEngine 13.482 → 13.010 (−472; −835 acumulado de sesión). Build prod + 144/144 verdes. **GAMEPLAY-GATED**
  (frame-loop/física, invisibles a los tests): probar vuelo atmosférico — sustentación cerca del suelo, frenado por drag,
  empuje del viento/turbulencia, sacudidas de cámara y nave.
- **5.1 COMPLETA** (2026-06-20): `applyAtmosphereGravity` (+ su `AtmosphereGravitySample`/telemetría) movido a
  `AtmosphereFlightSystem.applyGravity`. El motor expone la geometría del domo (`getAtmosphereGravityContext` → center/
  groundRadius/skyRadius/planetType, null si no hay escena/contexto) y `isAtmosphereGravityLandingHold` por el host; el resto
  es verbatim (curva de caída 10→30 u/s, supresión fuera del domo, dirección hacia el centro). Borrados del motor los
  helpers muertos `getAtmosphereGravityScaleForPlanet`/`computeAtmosphereGravitySpeedFactor` y sus imports. **+4 tests**
  (148 total). GameEngine 13.010 → 12.920 (−90; **−925 acumulado de sesión**, 13.845→12.920). flight-system 399 líneas (≤400).
  **YA NO QUEDA FÍSICA ATMOSFÉRICA EN EL MOTOR**: el AtmosphereFlightSystem (fuerzas+gravedad) + AtmosphereShakeSystem (FX)
  cubren todo lo de `update()`. Gameplay-gated: probar la caída/gravedad al entrar en atmósfera y cerca del suelo.

#### Fase 5.2 — LandingSystem (en progreso)
- **5.2-parcial `LandingEvaluator`** (2026-06-20, `services/state/landing-evaluator.ts`, 263 líneas): PRIMERA rebanada de 5.2.
  Mueve la EVALUACIÓN de aterrizaje (computeLandingStatus + computeAtmosphereLandingStatus + computeLandingThreat +
  resolveThreatLabel, ~235 líneas) a una clase plana que POSEE el estado de candidato (candidateStartMs/candidatePlanetId) y
  los umbrales (distancia/velocidad/alineación/hold 3s/radio de amenaza). El motor conserva `landingStatus`/`landingThreat`
  (estado load-bearing leído por todo el engine) y los helpers de contexto (derive/resolve, usados en 12+ sitios) que se
  exponen por `LandingEvaluatorHost` (10 métodos). `updateLandingTelemetry` (orquestación: gameState/HUD/supresión) se queda
  y delega; los 2 reset de candidato → `landingEvaluator.resetCandidate()`. Los `(target as any)` se tiparon con
  `ThreatTargetLike` (sin any nuevo). **Tests nuevos: 6** (umbral + hold de 3s con `performance.now` espiado + amenaza).
  GameEngine 12.920 → 12.714 (−206; **−1.131 acumulado de sesión**). Build prod + 154/154 verdes. Gameplay-gated: el HUD
  "LISTO PARA ATERRIZAR" debe aparecer tras ~3s estable cerca de un planeta, y la alerta de amenaza con enemigos a <500u.
  PENDIENTE 5.2: la orquestación grande (touchdown/paneles/colapso/attachment/cinemáticas) sigue en el motor — muy
  intrincada con animationManager/cámara/timers; rebanadas futuras con gameplay.
- **5.2-parcial `ShipLandingPositioner`** (2026-06-20, `services/state/ship-landing-positioner.ts`, 200 líneas): SEGUNDA rebanada de 5.2.
  Posicionamiento de la nave en aterrizaje: `placeShipAtPosition` (teletransporte limpio), `captureKinetics`/`restoreKinetics`
  (cinética velocidad/empuje al entrar en atmósfera, mueve también `ShipKineticsSnapshot` aquí), y el anclado de la nave aterrizada
  a su planeta (`bindToPlanet`/`maintainAttachment`/`clearAttachment`, dueño del estado `attachment` antes en el engine). Lógica
  byte-idéntica (`clamp`/`vec3Normalize` de `math/vector-math`). Host de 5 métodos; el motor delega en 1 línea (incl. el `=null`
  directo del reset → `clearAttachment()`). **Spec real de 5 tests** (place/capture/restore/follow-planet/guard). GameEngine 12.714 →
  12.605 (−109). Build prod + 183/183 verdes. Gameplay-gated: aterrizar y ver que la nave queda pegada al planeta mientras éste
  orbita/rota; y que al entrar en atmósfera conserva el avance (no se para en seco). PENDIENTE 5.2: touchdown/paneles/colapso/cinemáticas.
- **5.2-parcial `landing-geometry`** (2026-06-20, `services/state/landing-geometry.ts`): TERCERA rebanada. Funciones PURAS
  `getSolarSystemPlanetCenter(planets, id)` + `resolvePlanetCenterFromContext(planets, ctx)` (resolución del centro del planeta:
  planetCenter del contexto → centro por id → surfacePoint−normal·radio). Sin estado ni host; el motor pasa `gameState.planets`.
  `resolvePlanetCenterFromContext` tiene 9 llamadores → delegador fino; el `getSolarSystemPlanetCenter` del engine queda absorbido
  por la función pura. Spec real de 6 tests. De paso: inline de `repositionShipAfterCollapse` (alias trivial de placeShipAtPosition).
  **HALLAZGO + RESOLUCIÓN**: `parkShipAtPlanetCore` NO tenía llamadores y era el ÚNICO que cableaba `bindShipToPlanet` → el anclado de la
  nave aterrizada a su planeta. Investigado en git: el commit **"Planetoide"** sustituyó `parkShipAtPlanetCore(ctx)` por
  `enterAtmosphereScene(ctx)` en `handleLandingTouchdown` → era el **modelo de aterrizaje ANTIGUO** (nave aparcada en superficie + pegada al
  planeta mientras el menú de aterrizaje estaba abierto), **superado por la escena atmosférica actual**. NO tiene relación con ningún modo
  First-Person/explorar-a-pie (no existe tal modo: no hay CameraMode FP, ni controles a pie, ni disembark — el "Explorar" del menú es narrativo).
  Decisión del usuario ("si no tiene que ver, elimínalo; no quiero código muerto") → **ELIMINADO** todo el subsistema de anclado:
  parkShipAtPlanetCore, bindShipToPlanet, maintainLandedShipAttachment (+ su llamada por-frame), clearLandedShipAttachment (+ 5 call sites),
  y del positioner el estado `attachment`+bind/maintain/clear y los métodos de host findPlanetById/hasLandingTouchdownContext/isLandingOrTakeoffActive.
  GameEngine 12.605 → 12.546 (−59 en el turno). Build prod + 187/187 verdes. PENDIENTE 5.2: touchdown/paneles/colapso/cinemáticas.
- **5.2-parcial `landing-geometry` (completado)** (2026-06-20): CUARTA rebanada. Añadidas a `landing-geometry.ts` las otras dos resolutoras
  PURAS de geometría de contexto: `deriveLandingNormalFromContext(planets, ctx)` (normal del contexto o derivada de surfacePoint−centro) y
  `resolveLandingContactPoint(planets, ctx)` (surfacePoint o centro+normal·radio). Ahora las 3 resolutoras context→geometría viven juntas;
  el motor queda con delegadores finos (deriveNormal tiene 7 llamadores, contactPoint 2; ambas ya expuestas por LandingEvaluatorHost). +5 tests.
  GameEngine 12.546 → 12.521. Build prod + 192/192 verdes. NOTA: el **flujo del panel de aterrizaje** (tryOpenLandingPanel/openWithDelay/
  clearPendingTimer/notifyClosed/closeUI/applyAudioFocus) se DESCARTÓ como rebanada: está muy acoplado (subsistema de audio this.audio/this.music/
  handles + stopAtmosphereAudio, GameComponentInstance global, releaseLandingCinematicCameraHold, y el flag load-bearing landingPanelAwaitingUser
  leído por atmósfera/cinematics) → sería un host pass-through ancho con riesgo gameplay (audio/UI), no una rebanada limpia. enrichLandingContext/
  sampleLandingContextSurface también acoplados (intel/cache/atmosphereSceneState). PENDIENTE 5.2: esos clusters de orquestación, con gameplay.

#### Análisis pre-implementación 5.2 — LandingSystem (orquestación restante) [2026-06-20]
> Metodología (regla del usuario): análisis profundo ESCRITO antes de implementar; patrón por caso; FPS-aware
> (juego en navegador). Esto se relee en la "segunda ojeada" al re-entrar a implementar. NO implementado aún.

**A. Inventario** (~25 campos + ~25 métodos; ~1.000-1.300 líneas), agrupado por sub-área cohesiva:
- **Fase/contexto** (estado núcleo): `landingStatus`, `landingThreat`, `landingSequenceActive`, `landingSequenceContext`,
  `landingTouchdownContext`, `takeoffSequenceActive`, `atmosphereLandingCinematicActive/Context`.
- **Panel UI** (cold/eventos): `pendingLandingPanelTimer`, `landingPanelAwaitingUser`, `landingPanelAudioFocusArmed/Active`,
  `landingPanelAirHandle`; métodos `tryOpenLandingPanel`/`openLandingPanelWithDelay`/`clearPendingLandingPanelTimer`/
  `notifyLandingPanelClosed`/`closeLandingPanelUI`/`applyLandingPanelAudioFocus`/`stopLandingPanelAudioFocus`.
- **Cámara de auto-aterrizaje** (update = HOT): `atmosphereAutoLandingCamera*` (6 campos) + `start/stop/updateAtmosphereAutoLandingCamera`.
- **Holds de cámara cinemática** (cold): `landingCinematicCameraHold`, `landingCameraHoldDeferredForTakeoff` + `hold/releaseLandingCinematicCameraHold`, `releaseLandingCameraHold`.
- **Auto-takeoff / lock / salida** (check = HOT): `atmosphereAutoTakeoffArmed`, `atmosphereAutoLandingLock*` + `enable/clearAtmosphereAutoLandingLock`,
  `maybeTriggerAtmosphereAutoTakeoff`, `startAtmosphereExitSequence`, `applyAtmosphereLandingImpulse`, `forceExitLandingAfterCollapse`.
- **Helpers de contexto** (mix): `enrichLandingContext` (intel/cache), `sampleLandingContextSurface` (¡toca terrain-sampler!),
  `refreshAtmosphereSceneContextSurfaceSample` (HOT, re-muestrea cada frame), `registerPlanetLandingVisit`.
- **Entrada de flujo + puentes de animación** (cold): `tryStartLandingSequence`, `handleLandingTouchdown`, y los `notify*`
  (LandingSequenceStarted/Finished, AtmosphereLandingCinematicStarted/Finished, TakeoffSequenceStarted/Finished, `startTakeoffSequence`).

**B. El flujo = máquina de estados implícita** (hoy son ~10 booleanos sueltos):
`ESPACIO → tryStartLandingSequence → CINEMÁTICA_DESCENSO (anim) → notifyLandingSequenceFinished('landed') → handleLandingTouchdown →
ATMÓSFERA (enterAtmosphereScene; auto-land cinematic o vuelo manual) → PANEL (rest/explore) → startAtmosphere​ExitSequence/startTakeoffSequence →
CINEMÁTICA_DESPEGUE → SALIDA → ESPACIO`. Interrupciones: colapso de planeta (`forceExitLandingAfterCollapse`), auto-takeoff por altitud (`maybeTriggerAtmosphereAutoTakeoff`).

**C. Acoplamiento**: cámara (modo/hold), audio (air-rush/panel/cues), `animationManager` (lanzar cinemáticas), `gameState`
(planeta activo/status), HUD + `GameComponentInstance` GLOBAL (panel Angular), `atmosphereSceneState`, partículas (polvo/impulso),
`spaceship`, timers (`setTimeout`), terrain-sampler (muestreo de superficie). → host ANCHO (~15-20 métodos) si se hace de golpe.

**D. Hot path vs frío** (clave para FPS, juego en navegador):
- **HOT (cada frame, en el loop)**: `maybeTriggerAtmosphereAutoTakeoff`, `updateAtmosphereAutoLandingCamera`,
  `refreshAtmosphereSceneContextSurfaceSample`. En la mayoría de frames la nave NO está aterrizando → **early-return barato primero**.
- **FRÍO (transiciones/eventos)**: el resto (touchdown, panel, despegue, notify*, colapso). Sin presión de FPS.

**E. Patrón propuesto** (NO un solo patrón — por sub-área):
- **Sub-rebanada 1 · `LandingPanelController`** (state machine pequeña de UI): el flujo del panel (timer+audio-focus+open/close +
  flags awaiting/armed). Cohesivo y **frío**. Host: acceso a `GameComponentInstance`, audio (play/stop air + stopAtmosphereAudio),
  `releaseLandingCinematicCameraHold`, `landingCameraHoldDeferredForTakeoff`, logger. ⚠ `landingPanelAwaitingUser` lo LEEN atmósfera/cinematics
  → exponerlo con getter. ~150 líneas. **Primera por ser la más acotada.**
- **Sub-rebanada 2 · `AtmosphereAutoLandingCamera`** (system + host cacheado): 6 campos + start/stop/update. `update` es **HOT** →
  host cacheado, CERO `new`/closures por frame, early-return si inactiva. ~150 líneas.
- **Sub-rebanada 3 · `LandingCameraHold`**: holds cinemáticos (2 campos + hold/release). Pequeño, cohesivo, frío. ~80 líneas.
- **Sub-rebanada 4 · context helpers**: `enrichLandingContext` (mover lo de intel a un builder), `sampleLandingContextSurface`
  (OJO terrain SSOT — debe seguir usando terrain-sampler, no duplicar fórmula). Algunas casi puras → testables.
- **Sub-rebanada 5 (la gorda, al final) · `LandingFlowController`** = la espina de la máquina de estados: convertir los ~10 booleanos
  en un `enum LandingPhase` + transiciones (`tryStartLandingSequence`/`handleLandingTouchdown`/notify*/auto-takeoff/exit). Patrón **State
  Machine** explícita (fases + guardas), que de paso elimina estados imposibles (p.ej. el bug latente de auto-takeoff durante el cinematic).
- **Por qué State Machine**: hoy el "modo aterrizaje" se codifica en booleanos correlacionados (fuente de bugs como el de salida instantánea).
  Un `phase` único + sub-flags hace los estados explícitos y testeables, y centraliza las guardas (auto-takeoff solo en fase válida).

**F. Notas de rendimiento (FPS)**: (1) host adapter **cacheado** (1 objeto, no por frame); (2) en métodos HOT, nada de `new`/spread/closures
en el cuerpo caliente — early-return primero; (3) evitar `as any` en hot path (rompe el JIT) → host tipado; (4) `refreshAtmosphereSceneContextSurfaceSample`
re-muestrea terreno cada frame: confirmar que no asigna de más (reusar buffers/objetos). (5) Las transiciones (frío) pueden permitirse claridad sobre micro-opt.

**G. Riesgos gameplay**: TODO gameplay-gated. Cada sub-rebanada → smoke: aterrizar desde espacio, panel (rest/explore), despegar,
colapso de planeta a mitad, auto-takeoff por altitud, holds de cámara durante cinemáticas, audio del panel. Build +1 en cada checkpoint.

**Orden de ataque**: 1 (panel) → 2 (auto-landing cam) → 3 (camera hold) → 4 (context) → 5 (flow controller). Cada una con su propia
"segunda ojeada" antes de implementar.

**✅ Sub-rebanada 1 IMPLEMENTADA** (2026-06-20, `services/state/landing-panel-controller.ts`): `LandingPanelController` posee el estado del
panel (timer + `awaiting` + `audioFocusArmed/Active` + `airHandle`) y su lógica (tryOpen/openWithDelay/clearPendingTimer/notifyClosed/closeUI/
applyAudioFocus/stopAudioFocus/cancelAudioFocus). El motor delega y satisface `LandingPanelHost` (6 métodos: openPanelUI/forceClosePanelUI/
playLandingPanelAir/releaseLandingCinematicCameraHold/isLandingCameraHoldDeferredForTakeoff/logWarn) con adaptador cacheado. `awaitingUser` se
expone por getter (lo leen atmósfera/cinematics); takeoff/exit usan `cancelAudioFocus()`. Spec real de 6 tests. GameEngine 12.302 → 12.251 (−51).
219/219 + build prod verdes. Gameplay-gated: aterrizar → panel aparece (con su loop de aire), cerrar/quedarse, despegar, colapso de planeta (panel
se cierra), y que el "hold" de cámara se libere bien.

**✅ Sub-rebanada 2 IMPLEMENTADA** (2026-06-20, `services/state/atmosphere-auto-landing-camera.ts`): `AtmosphereAutoLandingCamera` posee el estado
(active/prevMode/normal/contactPoint/startedAt/dustTriggered/pendingContext) + las 5 constantes + la lógica (start/stop/update + applyPose/shouldRelease/
computeLateralSpeed/projectOntoPlane/triggerDust). **Math directa de `vector-math`** (vec3Normalize/Dot/Length) → SIN indirección de host en el hot path.
`update` es HOT pero con early-return barato (`!active`). Host de 10 (getCamera/getSpaceship/getLandingContext/hasCinematicCameraHold/deriveLandingNormal/
resolveContactPoint/buildPerpendicularGroundDirection[compartido, se queda en el motor]/spawnAutoLandingDust/startAutoLandingCue/stopAutoLandingCue),
cacheado. El `pendingContext` (bridge con el hold cinemático) se gestiona con `takePending()`/`clearPending()` desde releaseLandingCinematicCameraHold/
notifyTakeoffSequenceStarted. Spec real de 5 tests (start/defer/early-return/release-tras-min-hold/no-release-antes). GameEngine 12.251 → 12.135 (−116).
224/224 + build prod verdes. Gameplay-gated: auto-aterrizaje en atmósfera → la cámara encuadra la nave desde atrás/arriba, polvo al tocar, y se
libera al frenar (restaurando el modo de cámara previo).

**✅ Sub-rebanada 3 IMPLEMENTADA** (2026-06-20, `services/state/landing-camera-hold.ts`): `LandingCameraHold` posee `hold`({prevMode}) +
`deferredForTakeoff` y la lógica `acquire`/`release` (congela el modo de cámara mientras el panel espera; al liberar restaura el modo previo y
re-dispara la cámara de auto-aterrizaje diferida). Host de 5 (getCamera/isPanelAwaitingUser/clearAutoLandingPending/takeAutoLandingPending/
startAutoLandingCamera). Getters `isActive`/`isDeferredForTakeoff` + `setDeferredForTakeoff` para los lectores externos (atmosphereFlightHost,
landingPanelHost, atmosphereAutoLandingCameraHost, notifyTakeoffSequenceStarted). Delegadores hold/release. Spec real de 5 tests. GameEngine 12.135 →
12.115 (−20). 229/229 + build prod verdes. Gameplay-gated: durante una cinemática de aterrizaje la cámara se mantiene y al terminar vuelve al modo
previo; el auto-aterrizaje diferido arranca tras el hold.

**✅ Sub-rebanada 4 (parcial) IMPLEMENTADA** (2026-06-20): en la segunda ojeada las "context helpers" resultaron HETEROGÉNEAS (no un grupo
cohesivo): `registerPlanetLandingVisit` (side-effects gameState/profile) y `enrichLandingContext` (intel/cache) son ORQUESTACIÓN → se quedan en el
motor. La parte limpia, `sampleLandingContextSurface` (geometría de muestreo de superficie, la HOT que llama `refresh…` cada frame), se extrajo como
**función PURA** `sampleLandingSurfaceContext(context, params)` en `landing-geometry.ts` — usa el terrain-sampler (SSOT, NO duplica fórmula). FPS:
llamada directa, sin host. El motor resuelve `normal`/`planetCenter`/`detailFactor` y los pasa; lógica byte-idéntica. +2 tests. GameEngine 12.115 →
12.085 (−30). 231/231 + build prod verdes.
- **BUGFIX imágenes Primigenios** (2026-06-20): `OverlayImage` (void-jump/quimio) cacheaba la textura Y su tamaño en la CARGA (cuando aún es un
  placeholder blanco) → se veía blanco con tamaño equivocado. Arreglado: resuelve textura+tamaño en **tiempo de dibujo** (re-consulta cada frame, como
  el void-jump original) + fallback `drawTexture`.

**Sub-rebanada 5 — DECISIÓN (2026-06-20)**: la 2ª ojeada reveló que la espina del flujo es cualitativamente más arriesgada que 1-4: **76 accesos**
a flags (landingSequenceActive/takeoffSequenceActive/landingTouchdownContext/atmosphereLandingCinematicActive/atmosphereAutoTakeoffArmed/…) repartidos
por código gameplay-crítico, y los flags NO son ortogonales-limpios (un `enum` único arriesga cambios de comportamiento). El usuario eligió **enfoque
INCREMENTAL por piezas seguras** (no un LandingFlowController de golpe): lock → auto-takeoff/exit → notify bridges → touchdown, cada una con prueba de juego.
- **✅ 5-pieza 1 IMPLEMENTADA**: `services/state/atmosphere-auto-landing-lock.ts`. `AtmosphereAutoLandingLock` posee `active`/`reason` + la constante de
  altitud (120) + `enable`/`clear`/`isLocked` (que auto-libera si escena inactiva / despegue / altitud≥umbral). Host de 5 (isAtmosphereSceneActive/
  hasSpaceship/isTakeoffSequenceActive/computeAltitudeAboveGround/logDebug). Autocontenido: los call sites externos llaman a los 3 métodos del engine
  (que ahora delegan) → CERO re-points externos. Spec real de 6 tests. GameEngine 12.085 → 12.064. 237/237 + build prod verdes. Gameplay-gated: el
  auto-aterrizaje en atmósfera se mantiene "enganchado" hasta soltar (despegar / subir altitud).
- **✅ 5-pieza 2 IMPLEMENTADA**: `services/state/atmosphere-auto-takeoff.ts`. `AtmosphereAutoTakeoff` posee `armed` + la constante de altitud (1000) +
  `arm`/`disarm`/`maybeTrigger` (HOT, en el loop, early-return barato si no armado: si supera el umbral en escena atmosférica dispara la salida).
  Host de 9 (isAtmosphereSceneActive/isAtmosphereExitTransitionActive/isLandingSequenceActive/isTakeoffSequenceActive/hasLandingTouchdownContext/
  computeAltitudeAboveGround/startAtmosphereExitSequence/logInfo/logWarn). Los 4 sets externos del flag → `arm()`/`disarm()` (replace_all). El método
  `startAtmosphereExitSequence` (orquestación ancha) SE QUEDA en el motor, lo llama el host. Spec real de 5 tests. GameEngine 12.064 → 12.044. 242/242 +
  build prod verdes. Gameplay-gated: en atmósfera, subir por encima del umbral debe disparar el despegue automático.
- **✅ 5-pieza 3 IMPLEMENTADA (DESVÍO justificado)**: en la 2ª ojeada los **notify bridges** (notify*Started/Finished ×6) resultaron ORQUESTACIÓN
  ANCHA (setean los flags del flujo + llaman ~20 métodos del motor: setLandingDamageSuppressed/handleLandingTouchdown/extend*Suppression/start-stop
  AutoLandingCamera/releaseCinematicCameraHold/hud/gameState…) → extraerlos sería un host pass-through enorme de valor dudoso → SE DEJAN en el motor.
  En su lugar extraje una pieza MÁS LIMPIA y autocontenida: `services/state/suppression-window.ts`. `SuppressionWindow` = value-object PURO (recibe
  `nowMs`, sin host) para ventanas de supresión por timestamp (extend hasta now+window quedándose con el máx; isActive = now<until; reset). Dedup del
  patrón que estaba DUPLICADO en GameEngine: la supresión de amenaza de aterrizaje y la gracia de colisión atmosférica → 2 instancias. El motor conserva
  delegadores (con el override de "escudo cinemático" + getNowMs). Spec real de 5 tests. GameEngine 12.044 → 12.031. 247/247 + build prod verdes.
  HALLAZGO: del flujo de aterrizaje, las piezas LIMPIAS y seguras están agotadas (lock/auto-takeoff/suppression-window hechas); lo que QUEDA (notify
  bridges, handleLandingTouchdown, startAtmosphereExitSequence) es orquestación ancha gameplay-crítica → o se deja, o se extrae con host pass-through
  ancho (bajo valor/alto riesgo). El <3000 vía extracciones limpias del LANDING está esencialmente agotado; para seguir bajando conviene PIVOTAR a otra
  zona (5.5 WorldLifecycle / 5.7 HUD) con piezas limpias frescas.

#### Fase 5.5 — Análisis pre-implementación: WorldLifecycle / RespawnAnchor (2026-06-21)
Investigación a fondo de WorldLifecycle: **casi no hay "helpers limpios" pequeños**. `cloneSolarSystemSnapshot` es trivial (1 línea JSON);
el tracking de snapshot/label está acoplado a `runtimeSerializer` + `currentSnapshot` (**23 accesos** → mucho churn). El cluster cohesivo disponible
es el de **anclas de respawn**, pero la 2ª ojeada lo revela como **pass-through ANCHO** (no el "host moderado" estimado):
- **Métodos (6, dispersos 10346–12530)**: `buildRespawnAnchorMetadata`, `resolveSnapshotMetaFromLabel`, `persistRespawnSnapshot`,
  `bootstrapDefaultRespawnAnchor`, `refreshRespawnAnchorSnapshot`, `shouldMirrorRespawnAnchor` (+ `cloneSolarSystemSnapshot`).
- **Sin estado propio**: las anclas viven en `gameState` (getDefault/getRespawn/setDefault/setRespawn/syncAnchorSnapshotMeta) → el controller sería
  STATELESS (pura reubicación de comportamiento).
- **Host ~18 métodos**: gameState (5), `portalPersistenceService` (get/save), `runtimeSerializer` (saveWithLabel/captureCurrentSnapshot — **ambos pasan
  `this`**, el host los envuelve), `currentSnapshot`, ensure/setCurrentSnapshotLabel, resolveSystemId/resolvePersistentSystemKey (system-identity, importables),
  spaceship, findPlanet, estimatePlanetRadius, normalize, getShipForwardVector, persistActiveSystemSnapshot, resolveSnapshotId (importable), PORTAL_SNAPSHOT_LABELS (importable), logger.
- **Veredicto**: extracción de **menor cohesión real** (relocaliza glue de persistencia) y **gameplay-crítica (respawn)**. Reduce ~200 líneas hacia <3000
  pero NO mejora el diseño (pass-through). DECISIÓN: implementar EN FRÍO y con cuidado (turno enfocado), con prueba de juego de respawn (morir → reaparecer
  en el ancla correcta; ancla por defecto humana; espejado de snapshot del ancla). Patrón: `RespawnAnchorService` (clase plana, host cacheado de arrow fns,
  6 delegadores en el motor). Los helpers importables (resolveSnapshotId, PORTAL_SNAPSHOT_LABELS, system-identity) van DIRECTOS, no por host.

#### Fase 5.7 — HudOrchestrator (en progreso, piezas limpias)
- **✅ 5.7-pieza 1 `FlightVectorReticleBuilder`** (2026-06-21, `hud/elements/flight-vector-reticle-builder.ts`): el HUD SÍ tiene piezas limpias (mejor
  valor/riesgo que el respawn pass-through de 5.5). Extraído el cálculo de la retícula de "vector de vuelo" (punto de fuga de la nave proyectado al HUD):
  `build`/`projectionDistance`/`project` + los DOS scratch buffers (mat4+vec4) que ahora POSEE la clase → proyecta sin allocar por frame (HOT, una vez/frame).
  Host de 9 (isReady/getShipPosition/Forward/Speed/WeaponsCount/getCameraView+ProjectionMatrix/isCinematicAnimationRunning/isPrecisionRotationActive). El
  DIBUJO sigue en `FlightVectorReticle` (canvas). `vec4` ya no se importa en el motor. Spec real de 6 tests (projectionDistance/project/build). GameEngine
  12.031 → 11.962 (¡<12k!). 253/253 + build prod verdes. Gameplay-gated: la retícula de vector de vuelo (pentágono cian/rojo en el HUD) debe aparecer en el
  punto de fuga, modo combate con armas, y desaparecer en cinemáticas.
- **✅ 5.7-pieza 2 `buildInventorySnapshot`** (2026-06-21, `hud/elements/inventory-snapshot-builder.ts`): función PURA que ensambla el DTO del panel de
  inventario (character/equipment/personalGear/cargo/cargoCapacity/shipStats/sanityLimits), clonando para no compartir referencias. Slices estructurales
  `InventorySnapshotSource` (estado) + `InventorySnapshotShip` (nave) → NO acopla a GameStateStore/Spaceship. El motor importa la función (alias
  `composeInventorySnapshot`) y `refreshInventoryPanelSnapshot` la llama directo; el método del motor se BORRÓ (1 solo caller). `EquipmentSlot`+`InventorySnapshot`
  fuera del import del motor. Spec real de 6 tests (null/clonado/slots/capacidad+stats/sin-nave/cordura). GameEngine 11.962 → 11.919. 259/259 + build prod verdes.
  Gameplay-gated: abrir el panel de Inventario (datos de personaje/equipo/carga/stats nave/cordura correctos).
- **✅ 5.7-pieza 3 `buildCompassCountdownPayload`** (2026-06-21, `hud/elements/compass-countdown-builder.ts`): función PURA que elige el countdown de
  mayor prioridad para la brújula del HUD (Void Cocoon prio 1 > Speed Rite prio 3) entre los efectos temporales activos. Recibe `now` + los timestamps +
  speedRiteActive; el motor conserva un delegador de 1 línea. Spec real de 6 tests. GameEngine 11.919 → 11.899. 265/265 + build prod verdes. Gameplay-gated:
  el contador de la brújula durante Void Cocoon / Speed Rite. NOTA: el `gameData` principal del HUD (payload de hudManager.update) está ligado al render
  (untyped, ~20 entradas computadas in situ) → NO es pieza limpia, se queda. SIGUIENTE 5.7: evaluar si quedan builders limpios o pivotar.

#### Fase 6.4 — Feature de prueba: TARDIS companion (2026-06-21)
Prueba de extensibilidad de la arquitectura data-driven. La cabina de policía del Doctor orbita la Tierra **como un megaasteroide más**
y, si la nave se acerca a <50u, **huye con un destello**; si logras destruirla/lotearla antes, premio único **"Materia oscura de Gallifrey"**.
- **`game-objects/TardisObject.ts`**: `extends MegaAsteroid` → HEREDA toda la mecánica (tipo MEGA_ASTEROID, salud, colisión, targeting, órbita en
  `planetDebris`). Override `initGeometry()` → caja vertical (24 vértices) y `generateVertexColors()` → azul. `isTardis` + `isWithinVanishRange` (puro,
  dist²) + `createTardisCompanion(planet)` (factory). Spec 7 tests.
- **`services/state/tardis-companion-system.ts`**: la LÓGICA fuera del engine (regla #1). Posee la referencia + el flag de huida; `update(host)` (proximidad
  → huida sin premio), `onObjectDestroyed(obj, host)` (premio si NO huía). Host de 7. Spec 6 tests (incl. gateo del premio en la huida).
- **Creación data-driven**: el motor spawnea la TARDIS cuando crea el planeta con `kind === 'earth_split'` (sin id mágico). TRANSITORIA: excluida de
  `capturePlanetDebris` → reaparece cada sesión, sin tocar códecs. **Premio** = `CargoManifestEntry` ARTIFACT/UNIQUE vía `gameState.upsertCargoEntry`.
- **Veredicto arquitectura**: extendió MUY limpio — reusar `MegaAsteroid` + `planetDebris` + `kind` dio la órbita/render/colisión GRATIS. El motor solo
  ganó ~31 líneas de wiring (host + spawn de world-gen + 3 hooks de 1 línea); la órbita, el render y la mecánica no costaron NADA. 278/278 + build prod. Build 0.0.18.
- **BUGFIX TARDIS no aparecía** (2026-06-21): el spawn comprobaba `p.kind === 'earth_split'` (kind CRUDO del snapshot), pero el factory crea la Tierra con
  `switch(kind)` donde `kind = normalizePlanetKind(p.kind)` NORMALIZADO. En saves, `p.kind` puede ser 'tierra'/vacío → normaliza a 'earth_split' (planeta partido
  sí) pero el check crudo fallaba → sin TARDIS. Fix: usar el `kind` normalizado, igual que el factory. Build 0.0.19.
- **BUGFIX void-jump en blanco (raíz real)** (2026-06-21): `TextureManager.loadTextureFromUrl` deja un placeholder BLANCO 1x1 y, en 404, lo cachea bajo la
  clave devolviendo `null` SIN tamaño. `OverlayImage` miraba `getTexture()` (→ placeholder blanco) en vez del VALOR DE RETORNO, y PARABA en la 1ª URL fallida
  sin probar `/app/assets/…`. Fix en `animation-overlay.ts`: la carga usa el retorno (textura real vs null) y prueba TODAS las candidatas; el dibujo exige
  tamaño real (sin tamaño = placeholder → no dibuja, evita el flash blanco). Specs nuevos del camino de fallo. (El fix anterior de "tiempo de dibujo" no atacaba la raíz.)
- **BUGFIX void-jump CAUSA PRIMARIA** (2026-06-21, build 0.0.20): `applyFlashConfig` (animation-manager.service) llamaba `fn({images})` con la función
  `setFlashConfig` DESACOPLADA → `this` undefined (módulo ES, strict) → `setFlashConfig` lanzaba, el `catch` lo tragaba, y `flashImageUrls` quedaba VACÍO →
  `onStart` iba al `else` (overlay BLANCO, sin cargar la imagen). Regresión de la refactor 8.3 (`applyConfigure` SÍ usaba `.apply(anim)`; `applyFlashConfig`
  olvidó enlazar). Fix: `fn.call(anim, { images })`. Verificado en el server: los assets de Primigenios responden HTTP 200 en /assets/ y angular.json mapea
  src/app/assets→/assets. Los fixes previos de OverlayImage eran reales pero SECUNDARIOS.
- **TARDIS modelo + ventanas** (2026-06-21, build 0.0.20): de cubo a CABINA DE POLICÍA procedural (`TardisObject.initGeometry`): 9 cajas apiladas (cuerpo +
  4 ventanas que sobresalen + alero + 2 gradas de tejado + farol). `generateVertexColors` por posición: cuerpo azul, tejado azul oscuro, farol encendido y
  VENTANAS de vidrio cálido (ámbar brillante = "luz desde dentro"; emissive real puro requeriría un término en el shader iluminado). El motor usa geometría
  procedural, no cargador de modelos (un .glb descargado exigiría un loader glTF/OBJ aparte + licencia).
- **TARDIS ventanas encendidas** (2026-06-21, build 0.0.21): las ventanas no se veían porque el shader ILUMINADO (litProgram) usa un único `u_baseColor` por
  objeto e IGNORA los colores de vértice (`v_color` ni se usa). Fix: en `renderPlanetDebris`, la TARDIS (isTardis) se dibuja con el programa BÁSICO (colores de
  vértice planos, sin luz) → ventanas cálidas/farol/tejado se ven, y al no oscurecerse en sombra lucen "encendidas". El resto de debris sigue iluminado.
- **TARDIS cuerpo sombreado + ventanas EMISSIVE de verdad** (2026-06-21, build 0.0.22): el usuario pidió cuerpo con sombreado Y ventanas emissive (no plano).
  Se añadió al litProgram (ShaderManager) DOS uniforms GATEADOS (`u_useVertexColor`, `u_emissiveStrength`; default 0 = comportamiento clásico idéntico para
  todos los demás objetos): el fragment usa `v_color` si `u_useVertexColor>0.5`, y suma emissive a los vértices con `lum>0.82` (smoothstep) → SÓLO ventanas y
  farol "lucen encendidos"; el techo (azul oscuro, lum 0.40) queda SOMBREADO normal (corrige feedback: antes en el modo plano el techo salía iluminado). En
  `renderPlanetDebris` la TARDIS usa el litProgram con `setLitVertexColorMode(true)`+`setLitEmissive(1)` y RESETEA a 0 tras dibujarla. Setters nuevos en ShaderManager.

#### Fase 6.4 — Feature: Tortuga estelar (criatura neutral errante) (2026-06-21)
Segunda criatura procedural (tras el TARDIS): la arquitectura escala a entidades ANIMADAS con trayectoria propia.
- `game-objects/space-turtle.ts`: SpaceTurtleObject extends GameObject. Geometria por PARTES (14 cajas: caparazon/plastron, cabeza+pico+2 ojos glow,
  4 aletas, cola) construida UNA vez a nivel de modulo (TURTLE_GEO). Nado lento via applyPose(phase): cada grupo (aletas/cabeza/cola) rota despacio sobre un
  pivote; recalcula vertices+normales y el motor re-sube buffers (uploadDynamicGeometry). Ojos = emissive (reusa el shader gateado). OJO PATRON: los campos de
  animacion se asignan en el CUERPO del constructor (tras super()), porque useDefineForClassFields redefine los campos de la subclase a undefined justo tras el
  super, pisando lo asignado en initGeometry (que el super invoca). Spec 3 tests.
- services/state/space-turtle-system.ts: NEUTRAL (no colisiona). Maquina de estados: entra por un borde (linde = planeta mas lejano x1.25), viaja LENTO al sol,
  lo ATRAVIESA sin mas, y sale a MUCHA mas velocidad hasta desaparecer en la linde. Suelta polvo estelar. Host de 7. Primer avistamiento ~18s, luego cada 80-170s,
  una a la vez. Spec 5 tests.
- Motor: spaceTurtleSystem + host; update por frame; renderSpaceTurtle (litProgram + vertexColor + emissive, re-sube geometria animada, libera buffers al
  cambiar/desaparecer); computeSystemRadius; clear al cambiar de sistema. 290/290 + build prod. Build 0.0.23.

#### Fase 5.3 — SpellSystem (en progreso)
- **5.3-parcial `AnchoringPulseBeam`** (2026-06-20, `services/spells/anchoring-pulse-beam.ts`): PRIMERA rebanada de 5.3. El haz que ancla
  un asteroide y lo arrastra hacia la nave hasta capturarlo (→ carga). La clase POSEE el estado del haz + su lógica (`start`/`update`/`finish`);
  el motor conserva el **render GL** (gl/shaderManager/camera) leyendo `renderState` (+ `isActive` para el loop). Host de 6 métodos
  (getSpaceship/getTargetPosition/makeAsteroidIndependent/isAsteroidTarget/convertAsteroidToCargo/logInfo). `finishAnchoringPulseBeam` se
  absorbió (solo lo llamaba el update). Lógica byte-idéntica. **Spec real de 4 tests** (start/arrastre/captura→convierte/cancela). GameEngine
  12.521 → 12.454 (−67). Build prod + 196/196 verdes. Gameplay-gated: lanzar Anchoring Pulse sobre un asteroide cercano (<50u) → el haz lo
  arrastra y al acercarse lo convierte en carga (o avisa de bodega llena). NOTA: el cast spine (initiate/resolve/performSpellEffect, dispatcher
  a ~15 hechizos) es orquestación; los otros 2 beams (disruption/void-kinesis) son rebanadas futuras con el mismo patrón.
- **5.3-parcial `DisruptionBeam`** (2026-06-20, `services/spells/disruption-beam.ts`): SEGUNDA rebanada. El haz del Rito de Disrupción Material
  (línea nave→objetivo 1,5s; al expirar destruye el asteroide con daño letal). Mismo patrón: estado+lógica (`start`/`update`) en la clase, render
  GL en el motor leyendo `renderState` (startPos/endPos/startTime/duration)+`isActive`. Host de 4 (getSpaceship/isAsteroidTarget/applyDamageToObject/
  logInfo). El `target: any` del campo pasó a `ITargetable` tipado. Spec real de 4 tests (con `spyOn(performance,'now')`). GameEngine 12.454 → 12.409
  (−45). Build prod + 200/200 verdes. Gameplay-gated: Disrupción sobre asteroide → línea morada 1,5s y estalla. PENDIENTE 5.3: void-kinesis (el grande).
- **5.3-parcial `VoidKinesisBeam`** (2026-06-20, `services/spells/void-kinesis-beam.ts`): TERCERA rebanada — **los 3 beams ya extraídos**. El haz
  encoge el asteroide hasta "hacerse pixel" (o expira a los 6s) y entonces lo convierte en energía del vacío. La clase posee estado+lógica (start/
  update: el encogido scale/size/boundingSphere); la **conversión** (energía del vacío/HUD/placeholder) la conserva el motor en
  `resolveVoidKinesisConversion`, que el sistema invoca vía `host.resolveConversion` (se le quitaron los `=null` del beam: ahora el sistema posee el
  ciclo de vida). Render GL en el motor leyendo `renderState`. Host de 4 (getSpaceship/isAsteroidTarget/resolveConversion/logInfo). Spec real de 4
  tests. GameEngine 12.409 → 12.343 (−66). Build prod + 204/204 verdes. Gameplay-gated: Void Kinesis sobre asteroide con masa del vacío → se encoge y
  al desaparecer suma energía del vacío (o avisa de reserva llena). **CIERRE 5.3 beams**: los 3 siguen el mismo patrón (estado+lógica fuera testable,
  render GL en el motor). Lo que queda de 5.3 es el **cast spine** (initiate/resolve/performSpellEffect dispatcher a ~15 hechizos + applySpellSanityCost)
  = orquestación acoplada (cámara/audio/animationManager) → se deja en el motor.
- **Rayo atmosférico ELIMINADO** (2026-06-20, a petición del usuario: "no era prioritario, se rehará distinto otro día").
  En vez de extraer la geometría acoplada, se borró la feature entera: en GameEngine `updateLightningVisuals`/
  `spawnAtmosphereLightningBolt` + estado (flash/shock/cooldowns/pendingAudio) + flash en render + término de shock en
  camera-jitter + truenos en `updateWeatherAudioLoop` (−122). En ParticleEffects las primitivas muertas: interfaces
  `LightningStrike(Options)`, `spawnLightningStrike`/`updateLightningStrikes`/`renderLightningStrike`/`drawLightningSegment`/
  `buildLightningColorBuffer`/`buildLightningPath`/`randomPerpendicularVector` + estado/reset (~250 líneas, 1772→1389).
  SE CONSERVA: `lightningChance` como dato de pronóstico del clima (AtmosphereWeatherService), la ambiencia de tormenta
  (`audioCue: sfx_weather_thunder` en bucle) y el readout "Rayos"/"Descargas frecuentes" del HUD (intel meteorológica, no
  el rayo). El core-lightning de EarthSplitPlanet es otra cosa (flag propio, ya desactivado). VALIDADO en juego.
  Follow-up opcional menor: si se quiere borrar también el readout "Rayos" del HUD (telemetría) cuando no hay rayo.

**Patrón seguro validado (úsalo para las extracciones restantes):**
1. **Clase plana** (NO `@Injectable`) que el engine instancia con **lazy-init** (`ensureX()`),
   pasándole los servicios que ya tiene como campos (`gameState`, `logger`, …). **NO se toca el
   constructor del engine ni `GameInitializer`** → cero riesgo de romper la construcción/DI.
2. Para efectos colaterales que viven en el engine (muerte, cierre de paneles, FX), se define una
   **interfaz host** mínima que el engine implementa y se pasa como `this`. Sin `(x as any)`.
3. Métodos movidos **verbatim**; el engine deja delegadores de 1 línea.
4. **Añadir tests unitarios** a la clase extraída. Esto es CLAVE: los specs stubean `GameEngine`,
   así que la lógica que vivía dentro era invisible al test suite; al extraerla a una clase plana
   se vuelve testeable y la extracción MEJORA la verificación en vez de arriesgarla.

**Nota de riesgo (por qué 5.1-5.5/5.7 no se hicieron a ciegas):** el test suite **stubea
`GameEngine`**, por lo que regresiones en su construcción, su DI o sus métodos de frame-loop son
**invisibles a los tests**. Las extracciones grandes de física/aterrizaje/hechizos solo se validan
de verdad jugando. Se harán siguiendo el patrón de arriba (clase plana + host + tests propios), una
por PR, con smoke de gameplay. Empezar por las más acotadas y con lógica "calcular + callback" (p.ej.
daño por proximidad solar, conversión de cargo) antes que la física atmosférica (2.500 líneas).

### Fase 8 — Subsistema de animaciones (convergencia hacia un patrón)
**Motivación (usuario, 2026-06-20):** las animaciones han divergido. Conceptos que cada una resuelve a su
manera: cambio de cámara o no al inicio; bloqueo o no del teclado de navegación; pausas de X tiempo; escenas
con una imagen en zoom progresivo; traslados de posición (void-jump, portal/gate) que generan snapshots de
respawn y de sistemas nuevos/antiguos. Objetivo: una animación = **objeto orquestador** con un **core común**
y **herramientas** reutilizables; varias subclases extensibles, no un único patrón rígido.

**Estado actual (analizado).** Ya hay `game/services/animations/` con `animation-manager.service.ts` + 13
ficheros `*.animation.ts` (37 a 1084 líneas; gate-rite=1084, atmosphere-landing=463, ground-takeoff=394,
void-jump=393, takeoff-sequence=339, landing-sequence=335). El contrato `GameAnimation` es mínimo
(name/start/update→done/render/isBlockingInputs/cleanup?). **Divergencias reales encontradas:**
- **Manager**: ~480 líneas de copia-pega (12× `startX`+`preloadX`+`cachedXCtor` casi idénticos) + configuración
  ad-hoc vía `(anim as any).configure?.()` / `setFlashConfig?.()` (sin tipar).
- **Math duplicada**: `clamp01`/`lerp`/`smoothstep`/`normalize` reimplementadas en CADA animación.
- **Bloqueo de teclado**: `installKeyBlockers()` (listeners globales `keydown/keyup/keypress` en captura)
  **byte-idéntico** entre void-jump y landing-sequence (y otras).
- **Cámara**: cada una guarda `prevCameraMode`, fija un modo y restaura, con banderas divergentes
  (`restoreCameraMode`/`cockpitModeLatched`). Acceso por `engine['camera']` (mismo olor que `(x as any)`).
- **Dinámica de nave**: save/restore de accel/decel/maxSpeed/voidEnergy copiado a mano.
- **Teardown divergente**: landing-sequence YA tiene el patrón bueno (`cleanup()` → `finish(aborted)` único);
  void-jump DUPLICA el restore en `cleanup()` y en la rama de fin de `update()` (riesgo de divergencia — es
  exactamente el bug que describe el usuario). Hay `console.error` en void-jump (viola regla 5).
- **Acoplamiento al engine**: las animaciones reciben el `GameEngine` entero y lo hurgan con `engine['x']`/
  `(engine as any).y`. Sin contrato tipado.

**Arquitectura objetivo:**
1. **`animation-math.ts`** — vocabulario (clamp01/lerp/smoothstep/clamp/vec3Normalize) sobre la fuente única
   `game/math`. ✅ HECHO (con spec; comportamiento idéntico).
2. **Herramientas reutilizables `animation-tools.ts`** (clases pequeñas, liberadas SIEMPRE por el mismo camino):
   `InputLockGuard` (bloqueo de teclado idempotente) ✅; `CameraTakeover` (toma/relatcheo/restauración de modo,
   con modo final opcional) ✅; `ShipDynamicsScope` (save/restore de la dinámica + energía del vacío) ✅. Con specs.
   Siguientes: `OverlayScene` (fade + imagen con zoom — void-jump/gate-rite), `PhaseTimeline` (fases declarativas
   `[{name,duration,onUpdate(k)}]` con hooks tipo "teleport en el momento X", sustituye la aritmética manual de
   `fadeStart = orientTime + speedRampTime + …`).
3. **`BaseAnimation` (core abstracto)**: implementa `GameAnimation`; posee `elapsed`, el flag de bloqueo, un
   registro de cleanups (`onTeardown(fn)`) y un **único** `finish(aborted)` que corre los cleanups una sola vez
   (cleanup() ⇒ finish(true)). Las subclases declaran sus fases y usan las herramientas. Config tipada por
   `ConfigurableAnimation<TConfig>` (fin de `(anim as any).configure`).
4. **`AnimationHost` tipado**: interfaz mínima que el engine implementa para lo que las animaciones tocan
   (cámara, nave, flags como `voidJumpActive`/`collisionsDisabled`, notificaciones de aterrizaje/teleport,
   textureManager/overlayRenderer). Sustituye `engine['x']`/`(engine as any)`. Las animaciones reciben el host,
   no el `GameEngine`.
5. **Registro data-driven en el manager**: `Map<name, { load: () => Promise<Ctor>, interruptible: boolean }>` +
   un `start(name, configure?)` genérico. Colapsa las ~480 líneas de boilerplate y unifica preload/caché/stub.
   Casos especiales (void-jump `setFlashConfig`, takeoff `phase`, atmosphere-landing `forceReplace`) pasan por
   `configure` tipado.

**Orden de convergencia (junior-proof, build verde en cada paso):**
- **8.1 ✅** `animation-math.ts` + `animation-tools.ts` (InputLockGuard/CameraTakeover/ShipDynamicsScope) con specs.
  Adoptado el math + InputLockGuard en void-jump y landing-sequence (dedup byte-idéntico). +12 tests. 166/166 verdes.
- **8.2 ✅ (parcial)** `BaseAnimation` (`base-animation.ts`, 76 líneas): core con `onStart`/`onUpdate`/`onFinish`, registro
  `onTeardown(fn)` y **un único `finish(aborted)`** (cleanup() ⇒ finish(true)) que corre los teardowns UNA vez → mata la
  divergencia cleanup-vs-fin. Con spec (el invariante "teardown una sola vez"). Migradas **landing-sequence** (335→297) y
  **void-jump** (393→356) a `BaseAnimation` + `CameraTakeover` + `ShipDynamicsScope`: cierre unificado, sin `engine['x']`
  (ahora `engine.camera/.spaceship`). En void-jump el `render()` (las *speed streaks* tipo velocidad-luz + overlay + imagen
  con zoom) queda **byte-idéntico**; solo cambió el ciclo de vida. ⚠️ OJO: `noImplicitOverride` ON → todo override (incl. en
  specs con subclases de BaseAnimation) necesita `override`. +3 tests (169 total). **Gameplay-gated**: probar salto void (`Y`)
  — orientación/aceleración/estrellas/imagen/teleport y restauración de cámara/controles — y la cinemática de aterrizaje.
  Migradas además (2026-06-20) **7 animaciones simples** a `BaseAnimation`: eternal-rite, speed-rite, respawn-sigillum,
  disruption-rite, anchoring-pulse, void-kinesis y quimio-sigillum (esta con `CameraTakeover` + teardown unificado para
  el restore de cámara). De paso, tipados los `(target as any)`/`engine['camera']` → casts estructurales/`engine.camera`.
  Migrados además los **despegues**: `ground-takeoff` (394→359) y `takeoff-sequence` (339→302) a `BaseAnimation` +
  `InputLockGuard` + `ShipDynamicsScope` (+ `CameraTakeover` en takeoff-sequence, cuya cámara es save-COCKPIT/restore-prev);
  cada `finish(aborted)` → `onFinish(aborted)` con guarda `started`. La cámara bespoke de ground-takeoff (manual-follow +
  releaseLandingCameraHold) se mantuvo verbatim. **8.2 COMPLETA**: migradas también `atmosphere-landing` (como las otras
  cinemáticas; conserva su camera-hold bespoke `holdLandingCinematicCamera`) y `gate-rite` (1084) de forma CONSERVADORA
  (extends BaseAnimation; su flag propio `finished`→`complete` porque la base usa su propio `finished`; `override` en
  onStart/onUpdate/render/isBlockingInputs(`!complete`)/cleanup; toda la lógica de fases/snapshot/portal/streaks queda
  VERBATIM — su `update` es un dispatcher + handlers void). De paso `console.error`→GameLogger y `engine['spaceship']`→
  `engine.spaceship`. **LAS 13 ANIMACIONES YA EXTIENDEN BaseAnimation.** 174/174 + build prod verde.
  Gameplay-gated: probar el rito del portal entero (colapso/manifestación/tránsito con streaks/cambio de sistema/llegada) y
  abortarlo (morir a mitad).
- **8.x ✅ `OverlayImage`** (`animation-overlay.ts`): pieza reutilizable de "imagen a pantalla completa con zoom" — unifica la
  carga con URLs candidatas (resiliente) + el dibujo en modo cover. **Tipada estructuralmente** (`TextureManagerLike`/
  `OverlayRendererLike`) → sin `any`. Adoptada en **quimio-sigillum** (fuera su `ensureTexture` bespoke). Con spec (4 tests). 178/178.
  Pendiente (opcional): adoptarla en void-jump/gate-rite (cuidado: el render de void-jump tiene un fallback `drawTexture` y las
  *speed streaks* — no tocar a la ligera).
- **PENDIENTE Fase 8 (refinamiento, esfuerzo mayor):** `PhaseTimeline` (aritmética de fases de las cinemáticas); **8.4
  `AnimationHost` tipado** = el grueso de los `as any` restantes son subsistemas sueltos del engine (textureManager/shaderManager/
  overlayRenderer) y los internos de planeta/portal en gate-rite → requiere tipar esos subsistemas en GameEngine/game-objects (grande);
  **8.5** unificar snapshots de traslado (void-jump usa `handleVoidJumpCompleted`; gate-rite captura inline).
- **8.3 ✅** Registro en el manager: `loaders: Record<name, () => Promise<Ctor>>` + caché `Map` + `launch()` genérico
  (busy-check + lazy import + stub unificados) + envoltorios públicos finos que definen su `prepare` (configure/flash + start).
  Manager 622 → 260 líneas (−362). `(anim as any).configure?` → helpers tipados `applyConfigure`/`applyFlashConfig` (cast
  estructural, sin `any`). Preservados: void-jump setFlashConfig, takeoff `phase` (ground/atmo → clase distinta),
  atmosphere-landing `forceReplace`/preempt, `nonInterruptibleAnimationNames`, blocking-delay, preload. Los `import().then(m=>m.X)`
  ahora están TIPADOS (TS verifica que cada clase satisface `{new():GameAnimation}`). +5 tests. 174/174. Play-test: que TODAS las
  animaciones sigan disparándose (saltos, ritos, aterrizaje/despegue).
- **8.4** `AnimationHost` tipado: cortar `engine['x']`/`(engine as any)` de las animaciones.
- **8.5** Snapshots de traslado (void-jump/gate): documentar y unificar el punto donde se generan los snapshots de
  respawn/sistema (hoy en `engine.handleVoidJumpCompleted`), para que cada animación de traslado los dispare igual.
**Regla:** migrar el CUERPO de una animación es gameplay-gated (muy visual, los tests stubean el engine) → una por
una con smoke. Las herramientas y el registro SÍ son testeables/build-verificables.

### Fase 6 — Limpieza de duplicados restantes (≈ 2 semanas)
| # | Tarea | Quién |
|---|---|---|
| 6.1 | Targeting: ver **hallazgo abajo**. NO es un borrado simple — v1 sigue siendo load-bearing | [S] |
| 6.2 | Unificar outline/retícula en un solo `SelectionRenderer` (depende de 6.1; render path → smoke) | [J] |
| 6.3 | Fusionar los 3 session-cookie services; deduplicar `libs/cloud-saves/from-landing/*` | [J] |
| 6.4 | Earth/Saturn data-driven: ver **hallazgo abajo** (el literal `planet-saturn` está en 6+ sitios) | [J] |
| 6.5 | ✅ HECHO: `createPlanets()` (~247 líneas, sistema humano hardcodeado no determinista paralelo a `HumanSolarSystemService.createSnapshot()`) eliminado; init usa solo el camino de snapshot. Eran una 2ª implementación divergente (otra fuente del "comportamiento distinto en sitios distintos"). | [S] |
| 6.6 | Carpeta única de servicios: `game/` para dominio+engine, `app/` solo UI/plataforma; mover con `git mv` por lotes pequeños | [J] |

#### Hallazgo 6.1 — targeting v1 vs v2 (investigado 2026-06-16)
**No son modos alternativos: corren los DOS cada frame, en tándem** (`GameEngine.update`, ~línea 6465):
- **v2 `AdaptiveTargetingIntegrator`** (envuelve `AdaptiveTargetingSystem`, autocontenido, NO importa
  nada de `core/`) = el **cerebro**: detección de hover, selección, ciclado (Tab), clic, info de display.
- **v1 `ReticleManager`** quedó reducido a **soporte**: (a) su `InputHandler` provee la **posición del
  ratón** que se inyecta a v2 cada frame; (b) **renderiza la retícula** (`render`) y los **contornos**
  (`renderOutlines` → `OutlineRenderer`); (c) es **fallback** de `getCurrentTarget()`. Sus teclas de
  ciclo/Escape están **desactivadas** (ReticleManager.ts:153) para no chocar con v2.
- Lo **realmente muerto** es el cerebro de detección de v1: `TargetDetector` (su resultado casi no se
  usa, solo el fallback) y la lógica de selección de `ReticleManager`. Pero `InputHandler`,
  `ReticleRenderer` y `OutlineRenderer` siguen siendo **load-bearing**.
- **Plan correcto 6.1**: separar quirúrgicamente — mover input de ratón + render de retícula/contornos
  a un módulo neutro que v2 consuma, retirar `TargetDetector` y la selección de v1. Toca el render path
  → **requiere smoke de gameplay**. NO borrar `targeting/core` en bloque.

**Actualización 2026-06-19 (investigación profunda):** `ReticleManager.update()` **YA tiene la detección
desactivada** (líneas ~226-252): cada frame BORRA `currentTarget`/`hoveredTarget` y NO llama a
`updateTargetDetection()`. Verificado que `updateTargetDetection`, `detectWithWorkerFallback`,
`stabilizeTargetSelection` y `renderOutlines` (cuyo render 3D ya estaba comentado) son **código muerto
no llamado**. La retícula (`render()`) usa SOLO `mousePosition` + `config` (velocidad del ratón), NO la
detección. Conclusión: **v2 ya es el ÚNICO sistema activo**; v1 = ratón (InputHandler) + retícula.
- ✅ HECHO: eliminado del engine `renderOutlineSystem()` (trabajo por-frame muerto que solo alimentaba
  esa detección muerta; el outline visible es el overlay 2D de v2, intacto).
- ✅ HECHO (2026-06-20): vaciado el cluster de detección muerto de `ReticleManager`
  (`updateTargetDetection`/`detectWithWorkerFallback`/`stabilizeTargetSelection`/`renderOutlines`, ~200
  líneas). Behavior-preserving (no se ejecutaba). PENDIENTE menor: los campos/inyecciones ahora sin uso
  (`workerService`/`TargetingWorkerService` que aún levanta un Web Worker ocioso, `outlineRenderer`,
  `targetHighlighter`) — limpiar su DI en un PR aparte (toca el constructor de ReticleManager).

#### Hallazgo 6.4 — Earth/Saturn hardcode disperso (investigado 2026-06-16)
El literal `planet-saturn`/`planet-earth` aparece en **6+ sitios** de GameEngine (debris belt
~5151, spin ~5131, tilt ~5141 — estos dos ya cubiertos por `kind==='ringed'` + `axialTiltRad`
persistido; gating de lesser beings ~6415; `createPlanets` legacy ~9593; rotación de debris
~10184/10202). Hacerlo data-driven de verdad exige tocarlos todos a la vez (un cambio parcial deja el
hardcode en el resto). Earth además usa la **clase** `EarthSplitPlanet.createWithDebris` (no solo
datos). Propuesta: `PlanetSnapshot.debrisBelt?: { count; spreadScale?; yScale? }` + que el snapshot
humano lo rellene para Saturno, y `kind: 'earth_split'` ya dirige la clase de Earth. Toca world-build
→ smoke de gameplay (Saturno con su anillo de debris, Tierra partida).
- **6.4-paso 1 ✅ `planet-classification.ts`** (2026-06-20, `game-objects/planet-classification.ts`): PRIMER paso (fundación). Fuente única de
  verdad para los ids/predicados especiales: constantes `EARTH_PLANET_ID`/`RINGED_PLANET_ID` + `isEarthPlanet(id, planetType)` /
  `isRingedPlanet(id, kind)`. Sustituidos en GameEngine los ~12 literales `'planet-earth'`/`'planet-saturn'` dispersos (creación/render/gating/
  findPlanetById) por las constantes, y los **2 predicados duplicados** (`id===earth || planetType==='Tierra'` ×2; `id===saturn || kind==='ringed'`
  ×2) por las funciones. **Behavior-preserving** (booleans byte-idénticos). **0 literales mágicos** ya en GameEngine. Spec real de 5 tests. 209/209 +
  build prod verdes. (No reduce líneas — mata DUPLICACIÓN.) PENDIENTE 6.4 (el grande, gameplay-gated): el modelo data-driven de verdad
  (PlanetSnapshot.debrisBelt + kind 'earth_split' dirigiendo la clase), que toca world-build.
- **6.4-paso 2 ✅ Saturno debris data-driven** (2026-06-20): `PlanetSnapshot.debrisBelt?: { count; spreadScale?; yScale? }` (+ tipo
  `PlanetDebrisBeltConfig`) en `solar-system.types.ts`. **PISTA DE GENERACIÓN, no estado persistente** (los objetos de debris ya se serializan
  aparte en `snapshot.planetDebris`, así que NO pasa por el códec). El generador humano (`human-solar-system.service`) declara el cinturón de
  Saturno como DATO (`i===saturnIdx ? {count:280, spreadScale:0.45, yScale:0.7}`). En GameEngine la creación lee `p.debrisBelt` con **fallback al
  id canónico de Saturno** (mismos params) para saves antiguos sin el campo. **Behavior-preserving** (Saturno con su cinturón idéntico; otros
  planetas sin cambio). 209/209 + build prod verdes. Gameplay-gated: Saturno debe seguir con su cinturón de debris orbitando. PENDIENTE 6.4: Earth
  via `kind 'earth_split'` (más enredado: clase EarthSplitPlanet + color/tilt/spin + predicados de render + compat). El id queda de fallback hasta
  que una migración de saves mapee id→dato/kind (paso futuro).
- **6.4-paso 3 ✅ Tierra data-driven por `kind 'earth_split'` SIN fallback por id** (2026-06-20, a petición del usuario "los fallbacks ensucian"):
  La Tierra partida ya NO se construye por `id==='planet-earth'` sino por **kind**. Cambios: (a) `CanonicalPlanetKind` +`'earth_split'`; (b)
  `normalizePlanetKind('Tierra')→'earth_split'` (el planetType de EarthSplitPlanet ⇒ las CAPTURAS runtime/portal y los saves schema-1 que conservan
  'Tierra' ya dan el kind correcto, sin id); (c) `defaultColorForKind('earth_split')='azul_marino'`; (d) el generador humano pone `kind:'earth_split'`
  a la Tierra; (e) la creación en GameEngine pasa el bloque Earth al `switch(kind)` como `case 'earth_split'` (usa `p.id`, no la constante);
  (f) el render del point-light usa el predicado `isEarthPlanet` (planetType) en vez del id literal. **El id sobrevive en UN solo sitio**: una
  **migración de datos** en el códec (`planetSnapshotFromCustomMeta`: `id==='planet-earth' ⇒ kind 'earth_split'`) para saves intermedios que se
  guardaron normalizados como 'terrestrial' — no es un fallback en los sitios de uso. +2 tests de migración. GameEngine 12.344→12.350. 210/210 + build
  prod verdes. Gameplay-gated: la Tierra debe verse partida con su cinturón de debris, tilt 23,5° y giro; y un save antiguo debe recuperarla partida.
- **6.1 limpieza DI ReticleManager + worker muerto ✅** (2026-06-20): tras vaciar el cerebro de detección (sesiones previas), ReticleManager
  inyectaba servicios y campos ya muertos. Eliminados: inyecciones `debugCollector` (SpaceshipDebugCollector, nunca referenciada — el snapshot de
  debug se construye y se devuelve, no se le pasa) y `workerService` (TargetingWorkerService, solo `.init()`, resultados nunca consumidos); los
  campos de worker-gating (lastViewProjection/lastViewport/lastTargetsCompact/snapshotVersion/lastSentRequestTime/lastAccepted/lastTargetsSignature/
  lastViewportSize) y de estabilización muerta (lastStableTarget/targetStabilityFrames/TARGET_STABILITY_THRESHOLD). **Borrado el subsistema worker
  huérfano entero**: `targeting/worker/TargetingWorker.service.ts` + `targeting.worker.ts` (ReticleManager era su único consumidor; game-ui solo usa
  SpaceshipDebugCollector). targetDetector/outlineRenderer/relationService/inputHandler/reticleRenderer/targetHighlighter/webglService SIGUEN vivos
  (detección al ratón + outlines de selección + FPS throttle). 210/210 + build prod verdes. Gameplay-gated: la retícula y el contorno de selección
  deben seguir igual (hover/clic en targets, contorno glow/pulse según relación).

### Fase 7 — Guía de arquitectura y crecimiento del ESPACIO (data-driven)

> **Propósito.** El usuario NO quiere un editor de UI: quiere que el agente edite el espacio "según sus
> designios". Esta sección es la guía para hacer crecer el subsistema **desde el código actual**, sin
> romper persistencia ni el motor. Todo "rediseño del espacio" = editar **datos** + (a veces) registrar
> una pieza nueva por `kind`. Si una receta te pide tocar el motor más allá de un `case`/registro, párate:
> probablemente estás saltándote el modelo.

#### 7.1 El modelo de datos (capas)
Un sistema es un **`SolarSystemSnapshot`** (`game/types/solar-system.types.ts`):
```
SolarSystemSnapshot
 ├─ sun: SunSnapshot                {id, name?, position, radius}
 ├─ planets: PlanetSnapshot[]       ← el grueso del diseño (ver abajo)
 ├─ clusters?: ClusterSnapshot[]    nubes/estelas de asteroides (center, direction, speed, count, …)
 ├─ portals?: PortalSnapshot[]      puertas (pairing bidireccional, ojo, sello de concordia)
 ├─ planetDebris?: PlanetDebrisSnapshot[]  debris ya serializado (cinturones Tierra/Saturno) ligado por planetId
 ├─ meta?: SolarSystemMeta          identidad/etiqueta/elderGod/systemRadius/memoria de lesser beings
 └─ ephemeralDebris?                 spawns efímeros (intervalo/probabilidad/min/max)
```
**`PlanetSnapshot`** = la "ficha" de un planeta. Campos clave para el diseño:
- **Construcción**: `id`, `kind` (dirige la subclase), `position`, `radius`, `initialRadius` (radio original;
  `radius` es el VISIBLE, encogido por void mass), `baseColorName`, `orbit` (a/b/orientación/normal/ángulo/velocidad),
  `axialTiltRad`, `debrisBelt?` (pista de generación de cinturón: `{count, spreadScale?, yScale?}`).
- **Estado/gameplay** (persistente vía códec): `probabilityOfLifePct`, `inhabitants`, `lesserBeing`, `visited`,
  `lifeScanned`/`creatureScanned`, `hasArtifact`, `hasVoidMass`/`voidMassCapacity`/`voidMassRemaining`, los `*IntelStatus`,
  `pendingMission`, `resourceStock`, `animosity`.

#### 7.2 Ciclo de vida (de dónde sale un planeta y a dónde va)
```
GENERACIÓN                         CONSTRUCCIÓN                 PERSISTENCIA (round-trip)
human-solar-system.service  ─┐                                  ┌─ capturePlanetSnapshot (vivo→snapshot)
  (sistema canónico humano)  ├─► SolarSystemSnapshot ─► GameEngine.applySolarSystemSnapshot ─► Planet vivo ─┤
system-generator.service   ─┘     (datos)                switch(kind){…} + applyPlanetSnapshotFields        └─ planetCustom*  (savegame ↔ snapshot)
  (procedural, semilla RNG)                              + debrisBelt                                         (planet-state.codec.ts = SSOT)
```
- **Generadores** producen datos. El humano es artesanal (índices fijos por planeta); el procedural usa
  semilla + `GenerationOptions`.
- **`GameEngine.applySolarSystemSnapshot`** es la ÚNICA factory: `switch(kind)` construye la subclase y
  `applyPlanetSnapshotFields` aplica el estado. Casos especiales por DATO (`kind 'earth_split'`, `debrisBelt`), NO por id.
- **`planet-state.codec.ts`** es la **fuente única de campos persistentes** (4 funciones: capture / apply /
  customMetaFrom / snapshotFromCustom) + `normalizePlanetKind` + `defaultColorForKind` + `CanonicalPlanetKind`.

#### 7.3 Reglas de oro (las que mantienen esto sano)
1. **Campos persistentes SOLO por el códec.** Añadir uno = tipo en `PlanetSnapshot` + las 4 funciones del códec.
   Nunca copiar campos a mano en otro serializador (eso es regresión — "prueba del campo nuevo", receta R5).
2. **Comportamiento especial por DATO, no por id.** Nada de `if (p.id === 'planet-x')` en creación/render.
   Se dirige por `kind` (subclase) o por un campo de datos (p. ej. `debrisBelt`). El id solo puede sobrevivir
   como **migración puntual** en el códec (compat de saves), nunca como fallback en los sitios de uso.
3. **Terreno: una sola fuente** (`atmosphere/terrain-sampler.ts`, ruido con semilla). Prohibido escribir
   fórmulas de altura en otro sitio. La superficie de un planeta se define por su semilla (derivada del id).
4. **El motor solo crece por `case`/registro.** Funcionalidad nueva → servicio/clase externa; en el motor, a lo
   sumo un `case` en el `switch(kind)` o una línea de delegación.

#### 7.4 RECETAS para crecer (paso a paso)

**R1 · Editar/añadir un planeta al sistema humano** — `services/game/human-solar-system.service.ts`.
Editar el bloque `if (i === Idx) {kind, radius, name, baseColorName}` y el objeto `planets.push({...})`
(orbit, stock, prob. de vida, voidMass, `debrisBelt`, etc.). Para uno nuevo: añadir su índice + su rama.

**R2 · Crear un sistema artesanal nuevo** — duplicar el patrón de `human-solar-system.service`: construir un
`SolarSystemSnapshot` (sun + planets[] + meta `{handcrafted:true, elderGod, systemRadius}`) y registrarlo donde
se elige el sistema inicial/destino. Es 100% datos; no toca el motor.

**R3 · Añadir un KIND de planeta nuevo** (p. ej. `'crystalline'`):
 1) Clase `game-objects/CrystallinePlanet.ts extends Planet`, que en su ctor haga `this.planetType = …` y su render.
 2) `planet-state.codec.ts`: añadir `'crystalline'` a `CanonicalPlanetKind`, al passthrough de `normalizePlanetKind`,
    y un color por defecto en `defaultColorForKind`.
 3) `GameEngine.applySolarSystemSnapshot`: un `case 'crystalline': planetObj = new CrystallinePlanet(p.id, color, snapshotRadius, pos); break;`
 4) El generador (humano/procedural) pone `kind:'crystalline'` a quien toque. (Si `planetType` es un valor único como
    'Tierra', mapéalo en `normalizePlanetKind` para que las capturas runtime lo reconozcan sin id — ver `earth_split`.)

**R4 · Hacer data-driven un comportamiento especial** (patrón `debrisBelt`, el molde a copiar):
 - ¿Es una PISTA DE GENERACIÓN (se reconstruye al crear, no es estado que muta)? → campo en `PlanetSnapshot`
   (como `debrisBelt`), el generador lo declara, la creación lo lee. **No toca el códec** si lo generado ya se
   serializa aparte (p. ej. los objetos de debris van en `planetDebris`).
 - ¿Es ESTADO que muta y debe sobrevivir save/load? → es un campo persistente → receta R5.

**R5 · Añadir un campo PERSISTENTE de planeta** (la "prueba del campo nuevo"):
 1) Tipo en `PlanetSnapshot`. 2) `capturePlanetSnapshot` (vivo→snapshot). 3) `applyPlanetSnapshotFields`
 (snapshot→vivo). 4) `planetCustomMetaFromSnapshot` (snapshot→meta savegame). 5) `planetSnapshotFromCustomMeta`
 (meta→snapshot). + spec de round-trip. Si te ves copiándolo en un sexto sitio, la arquitectura ha regresado.

**R6 · Tunear la generación procedural** — `GenerationOptions` (en `solar-system.types.ts`) + `system-generator.service.ts`.
Opciones ya existentes: nº de soles, rango de planetas, vida%, espaciado de órbitas, nubes/estelas, paleta de
colores, cap de radio de gigantes, nombres canónicos sí/no. Crecer = nueva opción + su uso en el generador.

**R7 · Cambiar la superficie/terreno de un planeta** — la superficie deriva de la **semilla** (id del planeta) vía
`terrain-sampler.ts`. Para variar montañas/valles/paleta de forma persistente, el camino es una
`PlanetSurfaceDefinition` (semilla + amplitud + paleta) como campo persistente (R5) que el sampler consuma — NO
fórmulas sueltas (regla 3).

#### 7.5 Antipatrones (NO hacer)
- `if (p.id === 'planet-foo')` en creación o render → usar `kind`/dato (regla 2).
- Serializar un campo nuevo fuera del códec → usar las 4 funciones (regla 1).
- Fórmulas de altura de terreno fuera de `terrain-sampler` (regla 3).
- Hacer crecer `GameEngine.ts` con lógica nueva → clase/servicio externo + `case`/delegación (regla 4).

#### 7.6 Mapa de ficheros del subsistema
- Tipos/datos: `game/types/solar-system.types.ts` (snapshots + `GenerationOptions`).
- Generadores: `services/game/human-solar-system.service.ts` (artesanal), `services/game/system-generator.service.ts` (procedural).
- SSOT persistencia: `services/game/planet-state.codec.ts` (+ `game-objects/planet-classification.ts` para predicados/ids canónicos).
- Construcción: `GameEngine.applySolarSystemSnapshot` (switch por `kind`).
- Clases de planeta: `game-objects/{Planet,RingedPlanet,GaseousPlanet,GiantPlanet,DwarfPlanet,Protoplanet,EarthSplitPlanet}.ts`.
- Terreno: `game/atmosphere/terrain-sampler.ts`. Identidad de sistema: `services/game/system-identity.ts`.
- Captura/aplicación de snapshots de sistema: `services/game/solar-system-runtime-serializer.service.ts`,
  `solar-system-serializer.ts`, almacén por label en `services/game/portal-persistence.service.ts`.

### Fase 9 — Estaciones espaciales (objetos acoplables, categoría nueva)
**Motivación (usuario, 2026-06-29):** introducir estaciones espaciales grandotas, navegables, con
**puertos de atraque** a los que la nave se **acopla** (no aterriza en planeta). Modelo **master
heredable** (vendrán estaciones de otras razas: mismo contrato de puertos + menú, distinto diseño) y una
**categoría nueva** de GameObject (`STATION`) filtrable en el mapa y seleccionable como cualquier otro.

**Diseño + plan completos:** `docs/ESTACIONES.md`. Narrativa asociada: `docs/HISTORIA.md` §5.
**Decisiones:** sistema runtime estilo TARDIS/Tortuga (`SpaceStationSystem`) sobre una base abstracta
`SpaceStation`; tiles de acople `DockPort` reutilizables (nombre "Puerto espacial", detalle = objeto
padre); **menú de aterrizaje propio** de estación reusando el shell de `LandingPanelController`.
**Troceado:** Slice 1 = navegable + acople jugable; Slice 2 = narrativa (cinemática de recuerdos,
sucesos grotescos/estructurales, descubrimiento de **Void Jump** = `SpellType.LONGJUMP`).
Cumple regla #1 (motor solo delega/encoge): toda la lógica en clases/servicios externos.

---

### Fase 10 — Identidad visual del espacio (superficies planetarias procedurales + nave)

**Motivación (usuario, 2026-07-24):** los planetas se ven "una mierda" — de cerca son esferas de
**color liso** (sin textura de superficie) y de lejos un **sprite billboard que se regenera cada 5s**
(`BillboardRenderer.REGENERATE_INTERVAL_MS`) re-horneando la iluminación → **flicker**. El usuario quiere
planetas realistas: textura de **atmósfera** (terrestres/gaseosos) o de **suelo rocoso** (sin atmósfera),
iguales de cerca y de lejos, sin parpadeo. Son **pocas esferas** (planetas + sol) → no es carga.
Intentos anteriores (IAs antiguas) fallaron intentando cargar imágenes equirectangulares; el motor **ya
demuestra la técnica correcta** (fbm procedural sobre esfera: `stormShellProgram`, `weatherLayerProgram`).

**Alcance de la rama `feature/nave-planetas-visuales`** (decidido con el usuario): **planetas primero**,
luego **rediseño de la nave** (para la nave se le mocarán 2-3 variantes de silueta antes de comprometerse).

#### 10.1 Diagnóstico (estado ANTES) — `GameEngine.renderPlanets()` (~7843)
Cuatro tiers por distancia, ninguno con superficie por planeta:
- `distShip<5000`: `texturedProgram` con **una única textura de ruido 64×64 compartida por TODOS** los
  planetas, sólo re-tintada por `u_baseColor` (`TextureManager.createMetallicTexture`).
- `5000–20000`: `litProgram` color liso (sin textura). `>20000`: `basicProgram` (vertex color plano).
- `distCam>50000`: `BillboardRenderer` sprite canvas (regenerado cada 5s → flicker).
- Sin fresnel/atmósfera en ningún planeta del espacio. Anillos de Saturno **sólo** en el sprite lejano
  (de cerca `RingedPlanet` es una bola lisa). Sol = esfera `basicProgram` + glow aditivo.

#### 10.2 Decisiones de diseño (planetas)
1. **Superficie 100% procedural en shader**, patrón ya probado (`stormShell`): un programa nuevo que
   calcula albedo por fragmento desde **fbm 3D sobre la posición objeto** (sin costura ni pinchazo polar),
   con **semilla por planeta** (`hash(planetId)`, ya persistido) + paleta derivada de `kind`+`baseColorName`.
2. **Adiós al sprite y al LOD de billboard.** Se dibuja **la esfera procedural real a todas las distancias**
   (pocas esferas → coste trivial). Idéntica cerca/lejos, sin pop ni flicker. `BillboardRenderer` queda
   huérfano → **se elimina** (import+campo+construcción del motor y el fichero).
3. **Tipo de superficie dirigido por DATO** (`planetType` + `baseColorName`, nunca por id — regla §7.3):
   `rocky` (0, sin atmósfera: cráteres/rugosidad), `terrestrial` (1: océano+tierra+casquetes+nubes+specular
   de agua + rim atmosférico), `gaseous` (2: bandas+tormentas+rim), `ice` (3: alta reflectancia+grietas+rim).
   Mapa: Gaseous/Giant/Ringed→gaseous; Planetoid/Dwarf/Protoplanet con `azul_hielo`→ice,
   `verde`/`azul_marino`→terrestrial, resto→rocky.
4. **Terminador día/noche** desde la dirección del Sol (ya disponible) + **rim de atmósfera fresnel** en la
   propia esfera (sin segundo pase de geometría) para los que tienen atmósfera.
5. **Casos especiales intactos:** el **Sol** mantiene su render (core + glow) y la **Tierra partida**
   (`earth_split`: geometría partida, tapas emisivas, núcleo, storm shell) se deja EXACTAMENTE como está —
   es la "buena" de referencia. Ambos se enrutan por su rama previa, el resto por el shader nuevo.

#### 10.3 Encaje arquitectónico (regla #1: el motor NO crece)
- Shader + dibujo en un **servicio nuevo** `game/rendering/PlanetSurfaceRenderer.ts` (≤400 líneas): posee su
  `WebGLProgram`, sus uniforms, el **resolutor de estilo** (`resolveStyle(planet)`, puro/testable) y el
  `renderPlanet(...)` (usa `planet.render(gl, program,…)`, que ya bindea `a_position`/`a_normal`).
- `GameEngine` **encoge**: se borra el bloque de sprite (~140 líneas) y se colapsan los 4 tiers a una llamada
  al servicio (sol y tierra partida conservan su rama). Net del motor: fuertemente negativo.
- FPS: fbm 5 octavas sobre un puñado de esferas es despreciable (juego en navegador, pocas esferas).

#### 10.4 Sub-fases
- **10.a ✅** shader procedural (rocky/terrestrial/gaseous/ice) + rim atmósfera + quitar sprite/billboard
  (`PlanetSurfaceRenderer`). Sol y Tierra intactos. `BillboardRenderer` borrado.
- **10.b ✅** anillos reales de cerca para `Ringed` (`PlanetRingRenderer`, annulus + bandas + huecos Cassini,
  a todas las distancias, conviven con el cinturón de megaasteroides) + **Sol procedural**
  (`PlanetSurfaceRenderer.renderSun`: granulación + manchas + oscurecimiento del limbo). SIN cáscara de
  atmósfera exterior (decisión del usuario: NO).
- **10.c ✅** rediseño de la nave: variante **A "Vástago"** (caza sci-fi pulido) elegida por el usuario.
  `game/rendering/ship/` = `ship-geometry.ts` (malla procedural por partes) + `ShipRenderer.ts` (shader propio:
  casco metálico con **líneas de panel + desgaste + rim fresnel + acentos emisivos**; transformadas dinámicas:
  pitch del morro, plegado de alas, escala+color del escape). El motor **encoge** (−790 líneas acumuladas):
  borrados `renderModularSpaceship` + 6 `renderSpaceship*` + `ensureShipModuleVAO`/`drawShipModule`/`computeNormals`/
  `renderTexturedSpaceship`/`renderOrientationIndicator`/`debugNormalAttribEnabled` y los campos `shipVAO`/`shipBuffers`.
  Los `Spaceship.createXxxGeometry` SE QUEDAN (los consume el pecio de estaciones `ship-wreck-geometry.ts`).
  Pendiente menor: la nave del jugador y su pecio ya no comparten diseño (el pecio sigue con la malla antigua).

---

### Fase 11 — Colisiones unificadas del espacio (bounding-gate + colliders estructurados)

**Motivación (usuario, 2026-08-15):** dar colisión REAL a la estación espacial (hoy la nave la
atraviesa: `boundingSphere = null` por decisión 2026-06-29, ver `docs/ESTACIONES.md` §1.2.1) con un
patrón en dos niveles: **esfera de activación** barata (garantiza que el objeto cabe dentro; fuera
de ella no corre nada) y **narrow phase por SDF** que se ajusta a la estructura real (toro con
boquetes + radios + núcleo). El sistema es **genérico** (contrato de registro para objetos futuros)
y de paso **unifica bajo un solo servicio** las colisiones nave↔mundo existentes (asteroides
normales/super/mega, planetas, sol, portales, debris, lesser beings), añadiendo el broad-gate por
cluster que hoy no existe (`checkCollisions` aplana TODOS los miembros cada frame).

**Diseño + plan completos:** `docs/COLISIONES.md`. Cumple regla #1 con creces: el driver
(`checkCollisions` + `handleCollisionResponse` + slide, ~250 líneas) sale del motor a
`services/physics/collision/ship-collision-system.ts` (neto motor ≈ −225). La respuesta física
existente (`collision-{manager,response,physics}.service.ts`) se reutiliza intacta para el camino
esférico; el camino estructurado usa la **normal de superficie** del SDF (no centro→centro).

**Estado:** ✅ R1–R4 implementadas (2026-08-15, builds 52–53, 345 tests verdes): motor −281 líneas
netas (R2), broad gate por cluster (R3), estación colisionable por SDF con spec de conformidad
malla↔collider y supresión mientras está acoplada (R4). Pendiente solo R5 (pulido opcional).

---

## 6. Proceso de desarrollo y ciclo de vida del código

### 6.1 Flujo de trabajo
1. Toda tarea parte de una fase/punto de este documento (ej.: "F2.5 portal codec").
2. Rama `refactor/faseN-descripcion` o `feat/...` desde `main`. PRs pequeños (< ~400 líneas de diff neto).
3. Antes de abrir PR: `npm run build` + `npm run test:headless` + smoke manual del área tocada.
4. Revisión: el senior revisa TODO lo que toque `domain/persistence`, snapshots, o el engine.
5. Merge a `main` solo con build verde. Sin commits directos a `main`.

### 6.2 Definition of Done
- [ ] Build y tests verdes; smoke test del flujo afectado.
- [ ] Cero `as any` nuevos cruzando capas; cero campos serializados fuera de códecs.
- [ ] Sin duplicar utilidades (buscar antes de escribir: `game/math`, códecs, terrain-sampler).
- [ ] Si cambió un contrato de persistencia → migración + spec.
- [ ] Si la tarea reveló algo nuevo → actualizar este documento en el mismo PR.

### 6.3 Convenciones de código
- TypeScript estricto; nada de `any` nuevo (usar `unknown` + narrowing).
- Nombres: servicios `*.service.ts`, códecs `*-state.codec.ts`, sistemas extraídos del engine
  `*System.ts` (clase plana, sin Angular DI, instanciada por el engine), tipos en `game/types/`.
- Comentarios: solo para invariantes no evidentes (¿por qué?, unidades, rangos). Español o inglés,
  pero consistente dentro del fichero.
- Logging: SIEMPRE vía `LoggingService`/`GameLogger` con `LogCategory` correcto. Prohibido `console.*`.

### 6.4 Reglas duras (las que evitan que esto se vuelva a desmadrar)
1. **`GameEngine.ts` no crece.** Si tu diff aumenta sus líneas, ya está mal planteado (excepción: borrar más de lo que añades).
2. **Un campo persistente nuevo se añade en exactamente 1 sitio** (el códec) + su tipo. Si necesitas tocar un segundo fichero de mapeo, para y avisa: hay un códec sin usar en esa ruta.
3. **La física del terreno solo consulta `terrain-sampler`.** Cualquier `Math.sin` de terreno fuera de ese módulo es un bug de revisión.
4. **Identidad de sistema solo por `system-identity.ts`** (desde Fase 3).
5. Nada de números mágicos de gameplay inline: constantes con nombre y unidad en el módulo del sistema.

### 6.5 "La prueba del campo nuevo" (test de salud arquitectónica)
Para añadir, p. ej., `planet.ancientRuinsLevel`:
1. Añadirlo a `Planet` y a `PlanetSnapshot` (tipos).
2. Añadir UNA línea de captura y UNA de aplicación en `planet-state.codec.ts`.
3. Correr la spec de round-trip. **Fin.**
Si hay que tocar algo más, la arquitectura ha regresado: abrir issue de deuda inmediatamente.

---

## 7. Glosario del dominio (para nuevas incorporaciones, humanas o IA)

| Término | Significado |
|---|---|
| **Snapshot (SolarSystemSnapshot)** | Descripción serializable completa de un sistema solar (sol, planetas, clusters, portales, debris, meta). |
| **Payload (SerializedUniversePayload)** | Forma legacy por-objeto usada por savegames v1; en extinción (Fase 4). |
| **Label** | Clave humana bajo la que `PortalPersistenceService` guarda un snapshot (`'human'`, `'generated-3'`…). Pineable para que no lo desaloje la evicción por sistema. |
| **Anchor (RespawnAnchorMetadata)** | Punto de reaparición (Respawn Sigillum o ancla por defecto), referencia un snapshot por label/id. |
| **Void jump / Gate Rite / Long Jump** | Hechizos de viaje que generan/usan portales; al saltar se persiste el sistema de origen y se aplica el de destino. |
| **Lesser beings** | Criaturas primordiales; las activas se serializan por sistema en `lesserBeingMemory`. |
| **Atmosphere scene** | Escena local al aterrizar: esfera de suelo (32×64) + cúpula de cielo, con clima y física propia. ×5 de escala respecto al planeta orbital. |
| **Void mass** | Recurso extraíble de planetas; reduce su radio visible (`updateScaleFromVoidMass`). |
| **Elder God** | Deidad asignada por sistema (meta del snapshot), condiciona encuentros. |
| **Sanity/cordura** | Recurso del piloto; lanzar hechizos la consume; su máximo se reserva por hechizos conocidos. |

---

## 8. Estado de ejecución

| Fase | Estado |
|---|---|
| 0 | Documento ✅ · CLAUDE.md ✅ · `npm run test:headless` ✅ · ESLint/CI y round-trip de savegame-harness pendientes (0.2, 0.3) |
| 1 | ✅ Implementada (terrain SSOT + semilla por planeta + colisión exacta contra malla + specs) |
| 2 | ✅ Completa: planet/portal/lesser-being codecs en TODAS las rutas + specs round-trip. Sin retrocompatibilidad de saves (decisión del usuario 2026-06-13) |
| 3 | ✅ Completa: `system-identity.ts` (resolveSystemId/resolveSnapshotId/resolveSystemKey) + `SolarSystemMeta` tipado; las 4 precedencias divergentes (engine, PortalPersistence, UniverseStateSnapshot, RuntimeSerializer) ahora delegan en una sola. Spec dedicado. 75 tests verdes |
| 4 | ✅ Completa: `SaveGamePayload.universe` es ahora un `SolarSystemSnapshot` (schema v2, sin migración v1). Save = `captureCurrentSnapshot`; load = `adoptSnapshot` (mismo camino que portal/respawn). Borradas ~330 líneas de la SEGUNDA representación (payload por-objeto) en UniverseStateSnapshotService. Harness + 2 specs reescritos. 82 tests verdes |
| 5 | En curso: ✅ 5.8 (math SSOT), ✅ 5.6 (`PlayerProgressionSystem`), ✅ 5.4-parcial (`SunProximitySystem`), ✅ 5.1-parcial (atmosphere-physics PURO), ✅ label-utils. Pendientes: movimientos stateful (atmósfera/landing/spell/hud) — smoke de gameplay |
| 6 | Parcial: ✅ `SolarSystemService.apply()/snapshot()` muertos (~190 líneas); ✅ 6.1 investigado (hallazgo abajo); ✅ 6.5-parcial `createPlanets()` legacy eliminado (~247 líneas, sistema humano hardcodeado paralelo); ✅ código muerto: `oldRespawnGame`/`resetAfterCrash`/`randomizeStartNearSun` (~140 líneas). Pendiente: separación targeting, session-cookie x3, Earth/Saturn |
| 7 | Pendiente |

### Fase 4 — plan de ejecución (para la próxima sesión, idealmente con `npm start` para verificar)
Sin retrocompatibilidad (decisión del usuario), el colapso de los dos pipelines es:
1. `SaveGamePayload.universe`: `SerializedUniversePayload` → `SolarSystemSnapshot`. `SCHEMA_VERSION = 2`,
   `MIN_SUPPORTED = 2` (la migración rechaza saves v1 en vez de convertirlos).
2. SAVE: capturar el sistema activo como `SolarSystemSnapshot` (vía `runtimeSerializer.captureCurrentSnapshot`)
   en lugar de construir el payload por-objeto. El `RuntimeSolarSystemState` sigue siendo el portador del
   `GameStartContext`, pero su `payload` pasa a ser el snapshot.
3. LOAD: un único camino = guardar el snapshot embebido en `PortalPersistence` (con pin) y aplicarlo por
   `ensureSystemState` + `restartWithContext`. **Igual que cruzar un portal o respawnear.**
4. Borrar de `UniverseStateSnapshotService`: `captureLivePayload`, `captureGameObjects`,
   `serializeGameObject`, `buildCustomMetadata`, `buildPlanetMetadata`, `buildSnapshotFromPayload`,
   `extractSunSnapshot/extractPlanetSnapshots/extractClusterSnapshots/extractPortalSnapshots/extractLesserBeings`,
   `replaceRuntimeWithPayload`, `buildRuntimeStateFromPayload` (~250 líneas: la SEGUNDA representación).
5. Reescribir `savegame-harness.ts` (los stubs reflejan el contrato viejo: `replaceRuntimeWithPayload`,
   `restoreFromPayload`, `RuntimeSolarSystemState.payload` por-objeto) y los 2 specs
   (`game-persistence.service.spec.ts`, `universe-state-snapshot.service.spec.ts`).
6. Verificar en navegador: guardar → recargar pestaña → cargar; morir → respawn; portal → autoguardado.

**Por qué no se hizo ya:** es la única fase que puede romper la persistencia de forma silenciosa y solo
se valida de verdad arrancando el juego. Hacerla a ciegas con stubs contradice el objetivo ("que no se
desmonte todo"). Se recomienda como primer trabajo de la próxima sesión, con el juego corriendo.

### Decisión clave (2026-06-13): identidad de sistema unificada
`resolveSystemKey` pone `snapshot.id` **antes** que `snapshotLabel`/`fallbackLabel`: la etiqueta es por
slot de almacenamiento (un sistema puede guardarse bajo varias), así que usarla como clave rompería el
dedup y la memoria de lesser beings. Esa divergencia (PortalPersistence usaba id-first, el engine
label-first) era un bug latente; ahora hay una sola precedencia.

### Bugs reales corregidos de paso (2026-06-12, todos consecuencia directa de F2/F3)
1. **Suelo ≠ colisión** (clamps distintos + Nyquist + sin semilla) → colisión ahora muestrea los
   mismos triángulos que se dibujan; terreno determinista por `planetId`.
2. **Doble encogimiento por void mass**: reconstruir un planeta cosechado usaba su radio ya
   encogido como `initialRadius` → encogía otra vez en cada salto de portal / carga.
   Corregido persistiendo `PlanetSnapshot.initialRadius` (con spec de regresión).
3. **Sol duplicado como planeta fantasma**: el sol vive dentro de `gameState.planets` y se
   serializaba también como planeta `kind:'sun'`; al re-aplicar se instanciaba un `Planet`
   genérico bajo el sol. Ahora se filtra en captura y se omite en aplicación.
4. **`axialTiltRad` se perdía** en la ruta payload→snapshot (no existía en `PlanetSnapshot`);
   ahora es campo persistente del códec.
5. **`kind` sin normalizar** en esa misma ruta degradaba planetas a `Planet` genérico marrón;
   la normalización canónica vive ahora solo en `normalizePlanetKind()`.
