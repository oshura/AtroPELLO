# Gate Rite — Diseño y Plan de Implementación

Última actualización: 2025-11-12 (post pulido cinematográfico: eliminación plasma, ojo central, wrapper suave, travelling + streak gating, llegada a 1u/s)

Este documento define el diseño funcional y técnico del nuevo rito “Gate Rite” y su integración completa con el motor, UI/Grimorio, animaciones y el ciclo de sistemas solares.

## Objetivo

- Nuevo hechizo “Gate Rite” en el Grimorio.
- Requiere estar a ≤ 50u del planeta seleccionado.
- Secuencia cinematográfica que destruye el planeta y materializa un portal (TargetType.PORTAL) persistente.
- Teleporta la nave a un nuevo sistema solar generado proceduralmente.

## Cambios confirmados / Decisiones (estado actual)

- Portal persistente targeteable (TargetType.PORTAL).
- Ojo central DESACTIVADO/REMOVIDO (la fase ocular y tracking se posponen; el núcleo colapsado no genera ojo visible).
- Eliminación real del planeta tras colapso (excluido del snapshot final de origen).
- Símbolo arcano reducido a pentagrama + círculo carmesí (sin geometría ocular, sin párpados).
- Eliminada completamente la fase “bola de plasma” (flujo simplificado).
- Secuencia: travelling de cámara (3.5s) SIN streaks; solo tras completar travelling se activa aceleración y las líneas de velocidad.
- Aceleración durante tránsito doblada (de +10u/s^2 a +20u/s^2) hasta el cruce del portal.
- Cruce dispara fade inmediato (0.5s) y swap de sistema.
- Llegada: nave reaparece a ~1000u y desacelera cinematográficamente hasta estabilizarse en ~1u/s (no se busca 0 absoluto) y solo entonces recarga Void Energy al 100%.
- Void energy pausada durante todo el rito y hasta completar desaceleración de llegada.
- Generación destino con restricciones: sin trail (disableTrail), nubes agrupadas (cloudGroupScale=0.1, grupos con 10–20 clusters + 1–3 mega asteroides), tamaños máximos para gigantes/gaseosos, nombres únicos no canónicos, paleta cromática heredada como `colorPaletteOverride`.
- Anti-flash portal manifest: portal inicia con escala mínima y renderOpacity=0 progresando a visible.
- Planet wrapper suavizado: parámetros graduales (alpha, reveal, thickness, microScale, distortion) evitando popping.
- Arrival decel extendida (≈7.5s) calculando deceleración hacia 1u/s y recarga precisa cuando velocidad y magnitud de movimiento convergen.

## Flujo de alto nivel (versión vigente)

1) Trigger (Grimorio): Seleccionar Gate Rite y castear (validación ≤50u a superficie).
2) Pre-Focus (2s): cámara 0 y bloqueo de inputs.
3) Camera Zoom-Out (zoom extendido ~7.5s total por factor ×3 sobre base 2.5s) encuadra el planeta.
4) Planet Wrapper (2s): efectos de envolvente suaves.
5) Planet Collapse (~15s por factor ×5 sobre base 3s): contracción a casi 0, fade y storm shell.
6) Portal Manifest (10s): portal crece; ojo desactivado; nave reorientada al portal; sin órbita de cámara.
7) Camera Reframe (~1.6s): posiciona cámara para travelling.
8) Transit travelling (3.5s): cámara avanza a pose “cámara 0”; SIN streaks y SIN aceleración.
9) Post-travelling acceleration: se activa aceleración doblada (+20u/s^2) y aparecen streaks; cuando distancia ≤ radio umbral se desencadena FadeSwitch.
10) FadeSwitch (0.5s): cortinilla negra y generación/aplicación nuevo sistema (restricciones destino activas).
11) ArrivalDecel (7.5s): rear view, desaceleración hacia 1u/s, recarga precisa de void energy al estabilizarse.
12) Completed: inputs liberados; viaje runtime ulterior usa portales enlazados y cooldown.

## Integraciones y módulos

- GrimoirePanel: nuevo glifo/entrada “Gate Rite”.
- KeyBindings: lanzar con tecla ‘h’ cuando Grimorio activo o usando selección persistente.
- AnimationManagerService: nuevo `startGateRite(engine, planet)` y precarga de módulo `gate-rite.animation`.
- GateRiteAnimation (nuevo archivo): state machine con fases y tiempos; controla cámara, nave, efectos y persistencia del Portal.
### Portal (GameObject) — Estado actual reducido

- Representación: Pentagrama + círculo escalando durante manifest; sin ojo, sin párpados, sin gaze tracking.
- Anti-flash: inicialización con escala pequeña y `renderOpacity=0` para evitar frame de tamaño final.
- Futuro (para reintroducir): Ojo, párpados, iris/pupila animados, glifos aditivos adicionales.

## Contratos mínimos

- `AnimationManagerService.startGateRite(engine: GameEngine, target: Planet): boolean`
- `GateRiteAnimation` implementa `GameAnimation` (start/update/render/isBlockingInputs)
- `Portal` implementa ITargetable con `getDisplayName()`, `getTargetType()`, `isActive()` y radio.
Se sustituirá el borrador de métodos por un servicio unificado:

```ts
class SolarSystemService {
  constructor(private generator: SystemGeneratorService) {}
  snapshot(engine: GameEngine): SolarSystemSnapshot; // Usa SolarSystemSerializer internamente
  apply(engine: GameEngine, snapshot: SolarSystemSnapshot): void; // Limpia objetos previos y crea nuevos
  generate(seed?: number, options?: GenerationOptions): SolarSystemSnapshot; // Extiende capacidades actuales
}

interface GenerationOptions {
  sunCount?: 1 | 2;
  planetCountRange?: [number, number];
  clusterConfig?: { trailChance?: number; maxTrailClusters?: number };
  lifeChancePct?: number; // probabilidad de planetas con >30% habitabilidad
  maxOrbitSemiMajor?: number;
  minOrbitSpacingPct?: number; // separación mínima relativa entre órbitas
}
```

## Timeline y detalles técnicos (parametrización vigente)

- Fase 0 (0–2s): bloqueo de inputs; cámara 0; preparar referencias; leve “pulse” del planeta.
- Fase 1 (2–6s): cámara se aleja para encuadre completo (calcular distancia: ajustar para que R proyectado ocupe ≤45% de alto). Easing: easeOutCubic.
  - Implementación actual: 2.5s de zoom con framing heurístico (distancia = max(distActual, 4×radio + 40u)). Bloquea inputs durante la fase.
- Fase 2 (6–8s): activar wrapper (alpha 0→0.6), jitter de cámara sutil.
- Fase 3 (extendida ~15s): escala planeta 1→≈0.00001 con easing; fade de renderOpacity; storm shell paramétrico; eliminación del planeta al final (excluido de snapshot origin).
- Fase 4 (13–23s): instanciar Portal; escalar 0→R_planeta; ojo desactivado; pentagrama+círculo con rampa de opacity.
- Cámara Fase 4: órbita limitada a ~45° y pitch +15°; la nave no se desplaza (solo reorientada al portal).
 - Fase 5 (23–26.5s): Travelling de cámara hacia pose tipo cámara 0; sin streaks ni aceleración.
- Fase 6 (post-travelling): Aceleración doblada (+20u/s^2) + streaks; cruce → fade (0.5s) → System Swap.
- Fase 7: Reaparición a ~1000u + rear view y frenada hasta ~1u/s estable; recarga void energy al alcanzar estabilidad (speed y |velocity| ≈1u/s); luego control libre.

## Datos y serialización (revisión)

Estructura actual (`solar-system.types.ts`):
```ts
interface SolarSystemSnapshot {
  id?: string;
  seed?: number;
  timestamp?: number;
  sun: SunSnapshot; // Se ampliará a suns: SunSnapshot[]
  planets: PlanetSnapshot[];
  clusters?: ClusterSnapshot[];
  meta?: Record<string, any>;
}
```
Próximos cambios planificados:
- `suns: SunSnapshot[]` para multi-soles.
- `portals?: { id: string; position: Vector3; radius: number; state?: string }[]`.
- Campos ambientales en `PlanetSnapshot` (albedo, lifeStage, voidMass).
- Metadatos de generación (`generationOptions`) para reproducibilidad.

### Portales enlazados y estado del Ojo

Se añade persistencia de portales y enlace bidireccional:
```ts
interface PortalSnapshot {
  id: string;
  position: Vector3;
  radius: number;
  linkedPortalId?: string; // para viajes de ida y vuelta
  eyeState?: {
    gazeTarget?: 'ship' | Vector3;
    eyelidOpen?: number; // 0..1
    intensity?: number;  // 0..1
  };
}

interface SolarSystemSnapshot {
  // ...campos existentes
  portals?: PortalSnapshot[];
}
```

Al realizar el swap:
- Se crea `PortalSnapshot` en el sistema destino con `linkedPortalId` apuntando al portal origen.
- La nave reaparece a ~1000u del portal destino, con `voidEnergy` al máximo y velocidad 0.
- El portal origen conserva su estado y sigue siendo targeteable en su sistema.
- Se persisten DOS snapshots relevantes:
  1. `gate-origin-linked-*`: snapshot del sistema origen tras el colapso, SIN el planeta colapsado y SOLO con el portal origen (incluye su `linkedPortalId`).
  2. `gate-generated-*`: snapshot del sistema destino generado, con portal destino enlazado de vuelta.
- El runtime traversal usa `PortalPersistenceService.findByPortalId()` para localizar el snapshot opuesto cuando una nave cruza el radio del portal.
- Cooldown de viaje: 3s tras un cruce para evitar re‑entrada inmediata.

## Milestones (iteración incremental revisados)

1. Stubs y wiring:
   - `gate-rite.animation.ts` con state machine vacía.
   - `AnimationManagerService.startGateRite` + precarga.
   - `Portal` GameObject básico targeteable.
   - Glifo en Grimoire (placeholder) + trigger.

2. Cámara Zoom-Out y Wrapper básico.
3. Colapso + borrado real del planeta.
4. Símbolo Arcano + Ojo (pentagrama + círculo + reutilización núcleo planeta + apertura párpado + iris/pupila).
5. Gaze tracking (Acquire/Track/Blink) + orientación nave + cámara órbita refinada.
6. Tránsito (boost + cruce plano símbolo) + Bola de plasma + fade to black.
7. Portal pairing (creación portal destino enlazado) + Snapshot + System Swap (multi-soles opcional).
8. Servicio SolarSystemService (snapshot/apply/generate) + generación ampliada (rangos configurables).
9. Persistencia avanzada (PortalSnapshot con eyeState + linkedPortalId) + HUD estado portal.
10. Pulido FX (partículas colapso, distorsión, audio, flame pupil) + QA.

## Seguimiento de progreso (actualizado)

- [x] 1. Wiring inicial (anim + manager + portal + grimoire)
- [x] 1. Wiring inicial (anim + manager + portal + grimoire)
- [x] 2. Zoom-Out + Wrapper básico
- [x] 3. Colapso + borrado real del planeta (pendiente partículas outward)
- [x] 4. Símbolo Arcano + Ojo básico (pentagrama + círculo + reutilización núcleo planeta + párpado + blink)
- [x] 5. Gaze tracking + cámara órbita limitada 45°
- [x] 6. Tránsito + fade directo (sin fase de plasma)
- [x] 7. Portal pairing + System Swap + bidireccionalidad básica
- [x] 8. SolarSystemService + generador ampliado (variedad: soles opcionales, planetas 5–13, nubes de asteroides y trail)
- [x] 9. Persistencia avanzada (PortalSnapshot con `linkedPortalId`, snapshots origen/destino) + travel runtime
- [ ] 10. Pulido FX (plasma avanzado, shader llama, HUD portal enriquecido)

## Nuevo plan visual del portal (desde cero)

El símbolo arcano final estará compuesto por:
- Pentagrama carmesí inscrito en un círculo carmesí (idéntico al puntero del Grimorio, a escala planetaria).
- Ojo central: la esfera remanente del planeta colapsado (núcleo) pasa a ser el ojo.
- Párpados: apertura horizontal (banda ecuatorial transparente que crece con `eyelidOpen`).
- Iris/Pupila: círculos concéntricos visibles a través de la apertura; la pupila alberga una llama.
- Venas: una esfera interior un poco más pequeña con textura fija tipo venas carmesí sobre base blanco‑amarillenta.

### Fases de implementación
1) Fase 1 — Fundaciones (esta iteración)
  - Eliminar halo existente; dibujar Pentagrama+círculo (LINE_STRIP/LINE_LOOP) con brillo carmesí.
  - Ojo: dos esferas low‑poly (interna de venas y esfera “cáscara” con párpados por alpha mask).
  - Shader del ojo (interna): sclera amarillenta + iris/pupila por anillos concéntricos, sin llama todavía.
  - Shader de párpado: alpha en banda ecuatorial controlada por `u_eyelidOpen`.
  - Animación: durante PortalManifest, `eyelidOpen` 0→1, escala del portal 0→R_planeta, mirada simple hacia la nave.
2) Fase 2 — Pupil Flame + Gaze Tracking
  - Llama en la pupila (billboard/shader procedural), blink ocasional, smoothing de mirada y límites.
3) Fase 3 — Tránsito y Plasma Ball
  - Aceleración, cruce, bola de plasma (2–3s), fade/desaturación y swap de sistema.
4) Fase 4 — Persistencia y HUD
  - PortalSnapshot extendido (eyeState completo), pairing robusto y elementos HUD.

### Estado de progreso
- [x] Halo eliminado; pentagrama + círculo dibujados con color carmesí.
- [x] Shader del ojo interno con iris/pupila básicos.
- [x] Esfera interna de venas implementada con `stormShellProgram` (ruidos + estrías carmesí, alpha baja aditiva).
- [x] Párpado implementado como máscara horizontal (alpha) en la cáscara externa.
- [x] Apertura animada en PortalManifest y color del ojo heredado del planeta colapsado.
- [x] Llama en la pupila (billboard procedural) con blending aditivo y oclusión por párpado.
- [x] Blink + smoothing de mirada.
- [x] Aplicación de snapshot nuevo al finalizar tránsito con portal destino emparejado.
- [x] Nave reubicada a ~1000u del portal destino y cámara encuadrando.
- [x] Fade-to-black tras cruce (sin fase de plasma).

### Viaje bidireccional (Runtime Portal Traversal)

Implementado un manejador en `GameEngine` que cada frame:
1. Calcula la distancia nave→portal.
2. Detecta cruce (transición de fuera→dentro del radio del portal).
3. Si el portal tiene `linkedPortalId` y existe un snapshot que contiene ese portal destino, aplica ese snapshot.
4. Reposiciona la nave en el CENTRO del portal destino y conserva velocidad/orientación previas (sin offset). El offset ~1000u solo aplica en la animación del rito.
5. Aplica un cooldown de 3s (`portalTraversalCooldownSec`) para evitar rebote inmediato.

Limitaciones actuales / TODO:
- Eje +Z fijo para spawn: ajustar según normal local futura del portal.
- No se serializa `voidEnergy` (se fuerza refill en la secuencia del rito) ni estado transitorio de la nave, sólo colocación y desaceleración.
- Ojo y gaze tracking pendientes de reinstauración.

### Política de exclusión del planeta colapsado

El snapshot `gate-origin-linked-*` NO debe incluir el planeta original colapsado. Si se detecta su reaparición tras viaje de retorno:
- Verificar que el serializer excluye el planeta en la fase posterior a `PlanetCollapse`.
- Asegurar que la persistencia reutiliza el snapshot modificado (sin planeta) y no uno previo.
- Confirmar que al volver se aplica el snapshot correcto (log de `applySolarSystemSnapshot` + conteo de planetas esperado).

### Variedad procedural (versión actual destino Gate Rite)
- Sistemas ahora pueden tener 1–2 soles (25% binario por defecto si no se fuerza).
- Planetas: 5–13, tipos variados (Rocky, Terrestrial, Giant, Ringed, Gaseous, Dwarf, Protoplanet) con radios por rango.
- Órbitas multi-plano con normales perturbadas y ejes principales aleatorios.
- Clusters: trail deshabilitado (disableTrail); clouds agrupadas (cada grupo 10–20 clusters + 1–3 mega) en elipse 300×500u escalada globalmente por `cloudGroupScale=0.1`; todos estáticos (staticClouds).
- Nombres híbridos: mezcla de catálogo (Kepler/TRAPPIST/Gliese…) y generador silábico (Ka/Lo/Xe + rin/dus/mos…).
- Vida: probabilidad base 8% para planetas “excepcionales” (≥30% life), resto escalado por tipo.

### Cooldowns relevantes
- Gate Rite: bloqueo inputs durante todas las fases hasta `Completed`.
- Portal traversal runtime: 3s tras cruce exitoso.
- (Blink ocular suspendido mientras ojo desactivado.)

---
Notas añadidas tras integración bidireccional y clouds.

## Próximos pasos inmediatos (refinamientos menores)
1. Reintroducir ojo + tracking con gating opcional y sin flash.
2. FX adicionales de colapso (partículas outward, distorsión de campo).
3. Shader dedicado para streak con aberración cromática leve.
4. Ajustar spawn orientation según normal real del portal destino (no eje +Z fijo).
5. Balancear generación destino (variedad de paleta vs. override heredado).

---

Notas: Este documento se irá actualizando conforme implementemos cada milestone. Cualquier ajuste de diseño quedará registrado con fecha.
