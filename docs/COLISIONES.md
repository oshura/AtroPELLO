# Colisiones del ESPACIO — Fase 11: bounding-gate + colliders estructurados

**Estado: R1–R4 IMPLEMENTADAS (2026-08-15, builds 52–53, 345 tests verdes). Pendiente solo R5 (pulido opcional).**
Referencia cruzada: `docs/ARQUITECTURA.md` Fase 11 · `docs/ESTACIONES.md` §1.2.1 y §5.9 (deuda que esta fase salda).

**Decisiones del usuario (2026-08-15):**
1. Colisión de objetos grandes NO esféricos (estación) en **dos niveles**: una **bounding sphere de
   activación** barata que garantiza que el objeto cabe dentro; solo al entrar en ella se ejecuta el
   algoritmo fino que se ajusta a la estructura real.
2. El sistema debe ser **genérico**: servirá para objetos del espacio futuros aún no diseñados.
   La estación es solo el primer cliente.
3. **Unificar bajo un mismo servicio** las colisiones existentes (asteroides normales/super/mega,
   planetas, sol, portales, debris, lesser beings) si conviene — conviene (§3.2).
4. Al implementar, **adelgazar `GameEngine.ts`** todo lo posible; servicios y datos de colisión
   separados en ficheros propios.

---

## 1. Objetivo y principios

- **Un solo driver** de colisión nave↔mundo, fuera del motor (patrón sistema externo + host, como
  `SpaceStationSystem`/`AtmosphereFlightSystem`).
- **Dos niveles universales**: *broad gate* (distancia al cuadrado contra esfera/grupo, sin sqrt) y
  *narrow phase* (el test caro solo para lo que pasó el gate).
- **La malla es la verdad física** (regla de Fase 1 extendida al espacio): los colliders de un objeto
  estructurado se verifican por spec contra los vértices de su malla real (§7.2).
- **Reutilizar, no duplicar**: la respuesta física ya existe (`CollisionManagerService`,
  `CollisionResponseService`, `CollisionPhysicsService`, `collision-damage.ts`) y se conserva como
  está para el camino esfera-esfera. Lo nuevo es el driver unificado + el catálogo de formas finas.
- Cumplimiento estricto de regla dura #1: el motor solo pierde líneas (contabilidad en §6).

## 2. Estado actual (inventario 2026-08-15)

| Pieza | Dónde | Nota |
|---|---|---|
| Driver actual | `GameEngine.checkCollisions()` (~5612–5737) | **Sin broad phase**: aplana TODOS los miembros de TODOS los clusters + efímeros + planetas + sol + portales + debris + lesser beings en un array `sources[]` nuevo cada frame y hace esfera-esfera contra cada uno. Estaciones EXCLUIDAS. |
| Aplicación de respuesta | `GameEngine.handleCollisionResponse()` (~5740–5851) | Despacha a `CollisionManagerService`, aplica posición/velocidad, programa `collisionSlide`. |
| Slide post-colisión | `GameEngine.update()` (~4427–4441) + campos | Interpolación smoothstep 0.3 s para MASSIVE/LARGE. |
| Narrow esfera/hemisferio | `GameObject.checkCollision` (:457) + `CollisionShapeDefinition` (:6) | Multi-volumen; único usuario compuesto: `EarthSplitPlanet`. |
| Respuesta física | `services/physics/collision-{manager,response,physics}.service.ts` | Por `GameObjectSize`: impulso inelástico (SMALL), inmóvil+slide (LARGE/MASSIVE), ethereal. La normal de contacto es SIEMPRE centro→centro (correcta para esferas, inválida para un toroide). |
| Tabla de daño | `services/state/collision-damage.ts` | SSOT por tipo (asteroide 10, super 75, mega 150, planeta/sol 100000, portal 0). |
| Estación | `space-station.ts:61` `boundingSphere = null` | Decisión 2026-06-29 (una esfera de 800 u impediría volar entre los radios). La nave HOY atraviesa la estación. Spec `stations.spec.ts:18` blinda el null. |
| Cooldowns | par nave-objeto 500 ms (`collisionPairCooldown`) + por objeto (`gameState.collisionCooldowns`) | Se conservan tal cual. |

## 3. Arquitectura objetivo

### 3.1 Dos niveles para TODO

```
por frame:
  para cada fuente registrada (grupo o individuo):
    BROAD  → distSq(nave, centro) > (radioActivación + radioNave)²  → fuera, siguiente
    NARROW → según el tipo de fuente:
       a) esfera-esfera / hemisferio   → GameObject.checkCollision (camino actual, intacto)
       b) collider estructurado (SDF)  → §3.3 (nuevo)
    RESPUESTA → pipeline existente (a) o respuesta por normal de superficie (b)
```

Broad gates concretos:
- **Clusters de asteroides**: 1 test por CLUSTER contra `center` + `getClusterExtentRadius()` +
  `CLUSTER_GATE_MARGIN` (constante con nombre). Solo si pasa se testean sus miembros. Hoy se testean
  siempre todos los miembros: esto es la mejora de rendimiento principal del refactor.
- **Individuales** (planetas, sol, mega sueltos, efímeros, lesser beings): el propio
  `boundingSphere` ya ES el gate (esfera-esfera es broad y narrow a la vez) — sin cambio de coste.
- **Estructurados** (estación, futuros): esfera de activación **autocalculada** de sus formas
  (§3.4), con histéresis de estado `inside` (entrada a R, salida a R×1.15) para logging/estado
  estables. La estación: R ≈ 744 u (§4).

### 3.2 El driver unificado: `ShipCollisionSystem`

Nuevo directorio `src/app/game/services/physics/collision/` (cada fichero ≤400 líneas):

| Fichero | Contenido |
|---|---|
| `collision-shape.types.ts` | Catálogo de formas (§3.3), `StructuredColliderDef`, `StructuredContact`, `ShipCollisionHost`. |
| `collider-sdf.ts` | Matemática PURA (sin estado, spec-able): distancia con signo + normal por forma. |
| `ship-collision-system.ts` | Clase plana (sin DI, patrón `*System`): registro de colliders estructurados, broad gates, narrow dispatch, cooldowns, slide, aplicación de respuesta vía los services existentes. `update(host, dt)`. |
| `collision-damage.ts` | SE MUEVE aquí desde `services/state/` (dato del dominio colisión; solo cambia la ruta de import). |
| `*.spec.ts` | §7. |

`ShipCollisionHost` (adaptador cacheado en el motor, métodos tipados, cero `as any`):
`getShip()`, `getSources()` (colecciones: clusters vía servicio, efímeros, `gameState.*`, debris,
lesserBeings), `isSuppressed()` (collisionsDisabled ‖ landing suppression ‖ atmosphere grace),
`applyShipDamage(...)`, `addImpactVignette(level)`, `playCollisionSfx(dmg)`,
`makeAsteroidIndependent(obj)`, `log(...)`.

**El motor tras el refactor**: `checkCollisions` + `handleCollisionResponse` + bloque slide +
campos asociados desaparecen (~250 líneas); quedan el host adapter (~25 líneas) y 1 llamada
`this.shipCollisionSystem.update(this.shipCollisionHost, deltaTime)` al final de `update()`.
**Neto motor ≈ −225 líneas.**

### 3.3 Catálogo de formas finas (narrow estructurado, por SDF)

La nave es una esfera → el test fino es **punto-con-radio contra formas en espacio LOCAL del
objeto**: se transforma UNA vez la posición de la nave por la inversa de `modelMatrix` (el objeto
puede girar/orbitar libremente: el spin de la estación queda cubierto gratis) y se evalúa la
distancia con signo a cada forma en espacio unidad. `hit si sdf(p) < radioNave/escala`.

```ts
type StructuredShape =
  | { kind: 'sphere';  center: V3; radius: number; enabled?: boolean }
  | { kind: 'box';     center: V3; half: V3;       enabled?: boolean }          // AABB local
  | { kind: 'torus';   center: V3; ringRadius: number; tubeRadius: number;      // plano XZ, eje Y
      segments?: number; gapSegments?: number[];   enabled?: boolean };
```

- SDFs analíticos clásicos (toro: `length([length(p.xz)-R, p.y]) - r`; caja: `|q⁺| + min(max q,0)`).
  Normal analítica por forma (gradiente cerrado), no numérica.
- **`gapSegments`**: el toro conoce sus secciones destruidas (la humana: `{6,7,8,9}` y `{30,31}`
  de 48) → volar POR el boquete del Incidente es posible y no colisiona. El mapeo índice→ángulo se
  toma de `pushTorus` (misma convención que la malla, verificado por spec §7.2).
- **`enabled`** por forma → futuras estaciones destructibles apagan colliders de secciones voladas.
- El resultado gana al pipeline esférico en lo esencial: la **normal es la de la SUPERFICIE real**
  (volar bajo el anillo te empuja hacia abajo, no hacia el centro de la estación).

### 3.4 Contrato genérico de registro (objetos futuros)

```ts
interface StructuredColliderDef {
  id: string;
  source: GameObject;              // aporta modelMatrix/posición (transform vivo)
  shapesLocal: StructuredShape[];  // espacio unidad/objeto
  objectType: GameObjectType;      // clave en la tabla de daño
  onContact?(c: StructuredContact): void;  // hook opcional (partes destructibles, misiones…)
}
// radioActivación: AUTOCALCULADO = max(|shape.center| + boundShape) × escalaUniforme. Sin constante a mano.
```

`ShipCollisionSystem.registerStructured(def)` / `unregisterStructured(id)`. Dar colisión a un
objeto nuevo del espacio = definir sus formas junto a su geometría y registrarlo. **Cero cambios en
motor ni en el sistema.** Quien crea/destruye el objeto registra/desregistra (la estación:
`SpaceStationSystem` en spawn/clear).

### 3.5 Respuesta del camino estructurado

Semántica de inmóvil (espejo de `calculateImmovableObjectResponse`, pero con la normal SDF):
1. **Push-out**: reposicionar la nave fuera por `normal × (penetración + PADDING)`.
2. **Deslizamiento**: anular la componente de velocidad contra la superficie (`v·n < 0`), conservar
   la tangencial → la nave "resbala" por el casco. Restitución pequeña opcional (0.05).
3. **Daño escalado por impacto** (constantes con nombre, no números inline): velocidad normal de
   impacto 1→12 u/s mapea daño `STATION_IMPACT_DMG_MIN=10 → MAX=150` (rozar el anillo pica,
   estamparse a fondo casi mata; nunca one-shot). El camino esférico CONSERVA sus daños planos
   actuales (comportamiento intacto en R2; no se cambia gameplay en silencio).
4. Cooldown de par 500 ms, viñeta y sfx: mismos mecanismos actuales, vía host.
5. Exclusiones de la estación: tiles de puerto (`DockPort` = trigger de acople, ETHEREAL), bola de
   glow del motor (FX emisivo, no sólido), pecios acoplados (decorativos; colliders opcionales R5).
6. Interacción con docking: `DockingSequenceAnimation` ya pone `collisionsDisabled = true` durante
   la cinemática; la pose acoplada (30 u tras la tile, a ~37 u del muro del radio) queda fuera de
   todas las formas → sin conflicto.

## 4. La estación humana como primer cliente (espacio unidad, escala ×800)

Formas junto a su geometría, en `human-space-station.ts` (mismas constantes que `buildHumanStation`
→ imposible desincronizarse):

| Forma | Parámetros (unidad) | Mundo (×800) |
|---|---|---|
| `torus` | R=0.80, r=0.13, 48 seg, gaps {6–9},{30,31} | anillo 640, tubo 104; radial 536–744 |
| 4×`box` radios | centro (±0.42,0,0)/(0,0,±0.42), half (0.25,0.05,0.05) según eje | pasadizos 400 de largo, sección 80×80 |
| `box` núcleo | centro 0, half 0.16³ | cubo 256 de lado |
| `box` tobera | centro (0,−0.21,0), half (0.07,0.06,0.07) | bajo el núcleo |
| 8×`box` clamps | half ≈ (0.022,0.05,0.04) | opcionales (R5; minúsculos) |

Esfera de activación autocalculada: `0.93 × 800 = 744 u` (+ radio nave). La estación spawnea a
2500 u → el narrow NUNCA corre en crucero normal; solo al acercarse de verdad.

## 5. Rendimiento (reglas HOT de `ARQUITECTURA.md` §F)

- Broad: 1 resta + 1 producto escalar por fuente/grupo por frame; sin sqrt, sin allocs.
- Narrow estructurado: solo con `inside=true`; coste = 1 `mat4.invert` + ~7–15 SDFs (puñado de
  flops c/u). Scratch buffers a nivel de módulo (`vec3`/`mat4` reutilizados); prohibido
  `new`/spread/closures en el cuerpo caliente; early-return de supresión PRIMERO.
- Logging vía `LogCategory.COLLISION_PHYSICS` con throttle 1/s (patrón `_lastCollisionLogSec`).
- CCD: velocidad máx de nave ~56 u/s → <1 u/frame; rasgo más fino de la estación = 80 u → sin
  tunneling. **Regla**: si un collider futuro tiene rasgos < 4 u de grosor, su narrow debe usar el
  segmento `lastShipPos→pos` (ya capturado en el motor para portales), no el punto final.
- Conocido: `render()` re-invoca `update()` (BYPASS TEMPORAL, GameEngine ~6985) → el sistema puede
  ejecutar 2×/frame. El push-out es idempotente y el cooldown de par evita daño doble. No bloquea.

## 6. Plan por rebanadas (build + tests verdes en cada una; `build+1` en version-settings por checkpoint)

- **R1 ✅ — matemática pura.** `collision-shape.types.ts` + `collider-sdf.ts` + specs (distancias y
  normales conocidas de toro/caja/esfera; gaps angulares). No toca motor.
- **R2 ✅ — extracción del driver (comportamiento IDÉNTICO).** `ship-collision-system.ts` absorbe
  `checkCollisions` + `handleCollisionResponse` + slide + cooldowns; host adapter; movido
  `collision-damage.ts`. Motor −281 líneas netas (commit `fad338f`). Spec del sistema con host fake.
- **R3 ✅ — broad gates de grupo.** Gate por cluster (centro + `getClusterExtentRadius` ahora público
  + `CLUSTER_GATE_MARGIN`). Spec: cluster lejano ⇒ 0 tests de miembros (spy).
- **R4 ✅ — camino estructurado + estación.** `structured-collision.ts` (registro + gate con
  histéresis + narrow SDF, sin mutar la nave) + respuesta en el sistema; formas co-ubicadas en
  `human-space-station.ts` (incluidos los 8 clamps: los exige la conformidad malla↔collider);
  registro/baja en `SpaceStationSystem.spawn/clear(host)`. El daño escalado vive en constantes del
  sistema (`STRUCTURED_IMPACT_*`), NO en la tabla (que sigue siendo solo del camino esférico). El
  null de `boundingSphere` sigue: el gate estructurado no usa `GameObject.boundingSphere`.
  **Ajuste descubierto al implementar:** la pose ACOPLADA (30 u tras la tile) cae DENTRO del volumen
  del clamp → el camino estructurado se suprime con `host.isStructuredSuppressed()` (= panel de
  estación abierto o cinemática de atraque, igual que ya se congela el spin).
- **R5 — pulido (opcional, PENDIENTE).** Colliders de pecios, velocidad tangencial del spin en la
  respuesta (el anillo "arrastra"), panel debug de contacto.
- **Interior del toroide (fase propia, DISEÑADA 2026-08-15):** el usuario quiere volar POR DENTRO del
  tubo entrando por los cortes. Diseño completo en `docs/ESTACIONES.md` §7 (toro HUECO vía `wall` en
  `TorusShape` + visual interior + clamp de cámara + contenido). Hasta implementar su visual, el casco
  sigue macizo a propósito.

## 7. Specs clave

1. **SDF puro**: valores exactos de distancia/normal en puntos canónicos; continuidad en costuras;
   gap angular ⇒ sin colisión dentro del boquete, sí en secciones vivas.
2. **Conformidad malla↔collider** (la joya): recorrer TODOS los vértices de la malla `HUMAN` real y
   asertar `min sdf(v) ≤ ε` (todo vértice vivo está sobre/dentro de alguna forma) y que los
   vértices de segmentos destruidos NO fuerzan collider. Si alguien retoca la geometría sin tocar
   las formas, el spec revienta. "La malla es la verdad física", demostrado por test.
3. **Broad gate**: fuera de radio ⇒ narrow jamás evaluado (spy); histéresis de `inside` estable.
4. **Driver**: supresiones (`collisionsDisabled`/grace), cooldowns, despacho por tamaño intactos
   (paridad con comportamiento pre-refactor).
5. **Respuesta estructurada**: penetración resuelta en 1 tick, `v·n ≥ 0` tras contacto, tangencial
   conservada, daño en rango.

## 8. Riesgos y notas

- **Normal centro→centro vs superficie**: NO enrutar el camino estructurado por
  `CollisionManagerService.handleCollision` (asume objetivos esféricos); la respuesta estructurada
  es propia del sistema (§3.5) reutilizando solo la semántica.
- `GaseousPlanet.checkCollision → false` se respeta (los gaseosos siguen sin colisionar).
- `EarthSplitPlanet` (hemisferios) se queda en su camino actual; migrarlo al catálogo estructurado
  es unificación futura, fuera de alcance.
- El orden del loop cambia mínimamente (slide aplicado dentro del tick del sistema, siempre antes
  del render): verificar en smoke R2 que no hay jitter visual.
- La estación pausa su spin durante docking (`isDockingBusy`) — el narrow usa `modelMatrix` vivo,
  así que es transparente.
