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

### Fase 6 — Limpieza de duplicados restantes (≈ 2 semanas)
| # | Tarea | Quién |
|---|---|---|
| 6.1 | Decidir targeting: v2 (`AdaptiveTargetingSystem`) como único; migrar lo que falte de v1 y borrar `targeting/core` muerto | [S] |
| 6.2 | Unificar outline/retícula en un solo `SelectionRenderer` | [J] |
| 6.3 | Fusionar los 3 session-cookie services; deduplicar `libs/cloud-saves/from-landing/*` | [J] |
| 6.4 | Earth/Saturn data-driven: `PlanetSnapshot.debrisBelt?` y `axialTiltRad` ya persistido; borrar los `if (p.id === 'planet-earth')` | [J] |
| 6.5 | Unificar `GameEngine.createPlanets()` (sistema humano legacy) para que genere un `SolarSystemSnapshot` y lo aplique por el camino normal (probable absorción por `HumanSolarSystemService`) | [S] |
| 6.6 | Carpeta única de servicios: `game/` para dominio+engine, `app/` solo UI/plataforma; mover con `git mv` por lotes pequeños | [J] |

### Fase 7 — Habilitadores del rediseño del espacio (lo que quieres construir después)
Con las fases 1-6, "rediseñar elementos del espacio" = editar **datos**, no código:
- `GenerationOptions` ya existe → exponer un editor/console de sistemas (genera snapshot, lo aplica en caliente).
- `PlanetSurfaceDefinition` (semilla + amplitud + paleta) editable por planeta y persistida.
- Nuevos tipos de entidad = nuevo códec + nueva factory registrada (registry de constructores por `kind`), sin tocar el motor.

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
| 5 | En curso: ✅ 5.8 (math SSOT `game/math/`), ✅ 5.6 (`PlayerProgressionSystem`), ✅ 5.4-parcial (`SunProximitySystem`). Pendientes 5.1-5.3,5.5,5.7 (ver nota de riesgo abajo) |
| 6 | Parcial: ✅ eliminada la copia muerta `SolarSystemService.apply()/snapshot()` (~190 líneas, instanciación paralela de planetas/portales). Pendiente: targeting v1/v2, session-cookie x3, Earth/Saturn data-driven |
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
