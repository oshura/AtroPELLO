# Gate Rite — Diseño y Plan de Implementación

Última actualización: 2025-11-10 (post integración de viaje bidireccional y generación procedural extendida)

Este documento define el diseño funcional y técnico del nuevo rito “Gate Rite” y su integración completa con el motor, UI/Grimorio, animaciones y el ciclo de sistemas solares.

## Objetivo

- Nuevo hechizo “Gate Rite” en el Grimorio.
- Requiere estar a ≤ 50u del planeta seleccionado.
- Secuencia cinematográfica que destruye el planeta y materializa un portal (TargetType.PORTAL) persistente.
- Teleporta la nave a un nuevo sistema solar generado proceduralmente.

## Cambios confirmados / Decisiones

- El sigil/portal permanece: objeto persistente targeteable (TargetType.PORTAL), sin fade-out.
- El planeta objetivo colapsado se reutiliza: su núcleo reducido se convierte en el Ojo central del símbolo arcano.
- Eliminación real del planeta (catálogos, render, targeting) tras transferir su núcleo al Ojo.
- El símbolo arcano consiste en: Pentagrama carmesí inscrito en círculo carmesí + Ojo central (esfera del núcleo) con iris/pupila flameante y venas.
- Apertura de párpado: banda horizontal transparente que se expande (arcos superior/inferior) revelando iris y pupila.
- Gaze tracking: el Ojo adquiere y sigue la nave (mirada estabilizada, retarget si distancia/angular > umbral).
- Dos portales enlazados tras el primer salto: origen y destino (bidireccional), ambos con Ojo activo siguiendo la nave si está en su sistema.
- Fase “bola de plasma”: la nave se convierte en esfera energética unos segundos tras tránsito y se realiza fundido a negro antes de reaparición.
- Al reaparecer en nuevo sistema: nave con void energy recargada, localizada a ~1000u del portal destino, en reposo (velocidad 0). 
- Snapshot previo (`SolarSystemSerializer`) antes del swap para preservar estado si se desea histórico.
- Generación de nuevo sistema: expandir a 1–2 soles, rango de planetas, clusters adaptables, habitabilidad base 0% con probabilidad ajustable de excepcional (>30%).
- Persistencia de enlaces de portales: metadata con IDs pares y estado.
- Servicio unificado `SolarSystemService` para snapshot/apply/generate y registro de enlaces de portal.

## Flujo de alto nivel

1) Trigger (Grimorio): Seleccionar Gate Rite y castear.
2) Validación: objetivo planeta a ≤ 50u de superficie. Si no, mock (2s) y abort.
3) Pre-Focus (2s): bloquea inputs, cambia a cámara 0.
4) Zoom-Out Planet Reveal (4s): encuadra planeta completo.
5) Planet Wrapper (2s): efecto energía en superficie.
6) Planet Collapse (5s): reducción a 0; eliminación real del planeta.
7) Arcane Portal Emergence (10s total de fase):
   - Portal (objeto persistente) aparece y crece hasta tamaño planetario, con ojo central que va mirando astros.
  - Cámara orbita hasta 45° lateral; nave se orienta al portal.
  - Símbolo arcano multi-anillos visible con glifos animados y blending aditivo.
8) Gate Transit (3s): nave acelera a 1000u y cruza el portal.
9) Post-Transit (2s): nave se muestra como bola de plasma; cámara fija rota para seguirla.
10) Snapshot y System Swap: serializa estado (solo elementos persistentes) y genera sistema nuevo con portal destino emparejado.
11) Cleanup y Restore: restablece límites de velocidad tras 5s de cooldown; inputs habilitados.
12) Viaje runtime: posteriormente, atravesar cualquier portal activo vuelve a aplicar el snapshot del sistema enlazado (bidireccional) con un cooldown breve para evitar rebotes.

## Integraciones y módulos

- GrimoirePanel: nuevo glifo/entrada “Gate Rite”.
- KeyBindings: lanzar con tecla ‘h’ cuando Grimorio activo o usando selección persistente.
- AnimationManagerService: nuevo `startGateRite(engine, planet)` y precarga de módulo `gate-rite.animation`.
- GateRiteAnimation (nuevo archivo): state machine con fases y tiempos; controla cámara, nave, efectos y persistencia del Portal.
### Portal (GameObject) — Especificación Revisada

Estado actual: implementación mínima (disco plano). Falta geometría compuesta, símbolo arcano y shaders dedicados.

Objetivos de implementación (símbolo arcano con Ojo):
- Simbología: Pentagrama carmesí inscrito en círculo carmesí (referencia: cursor del Grimorio) + Ojo central.
- Núcleo/Ojo: la esfera final del planeta colapsado (núcleo) se reutiliza como ojo central.
- Párpados: apertura horizontal por transparencia progresiva (banda ecuatorial que se expande), formando arcos superior/inferior.
- Iris/Pupila: círculos concéntricos en la textura del ojo; pupila con fuego animado (shader o flipbook), iris con rampas radiales.
- Venas: esfera interna ligeramente menor (≈ x% más pequeña) con textura fija generada proceduralmente (colores carmesí sobre base blanco-amarillento), capturada del algoritmo del core.
- Geometría compuesta: círculo exterior (anillo), estrella de cinco puntas (malla), plano portal central, glifos sutiles sobre el anillo.
- Shaders/pases:
  - Pase Pentagrama + círculo: material carmesí emissive con suavizado en bordes y leve distorsión.
  - Pase Ojo: material con capas (esclera/venas, iris, pupila llama, párpado alfa animado) y normales sutiles.
  - Pase glifos: additive con alpha threshold y pulso.
  - Uniformes: `u_time`, `u_openProgress`, `u_intensity`, `u_eyeDir` (vector 3D de mirada), `u_seed`, `u_eyelidAlpha`, `u_pupilFlamePhase`.
- Estados: Manifest (apertura + escalado), GazeAcquire (apunta a nave), Track (sigue a la nave con suavizado), TransitPulse (pulso al cruce), Cooldown (emisión decreciente), Idle.
- Targeting: boundingSphere = radio portal final; categoría PORTAL; visible en HUD/outliner.
- Futuro: enlaces a otro portal (bidireccional), múltiples destinos, toggles de activación.
- PlanetWrapperEffect: reutiliza/extrae algoritmo del núcleo de la Tierra.
- Solar System Snapshot/Generator:
  - `ISolarSystemSnapshot`: planetas, soles, asteroides, naves, clusters y estados.
  - `SolarSystemGenerator`: crea sistemas procedurales con reglas (1–2 soles, planetas aleatorios, clusters nube, habitabilidad 0% salvo 5% >30%).

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

## Timeline y detalles técnicos

- Fase 0 (0–2s): bloqueo de inputs; cámara 0; preparar referencias; leve “pulse” del planeta.
- Fase 1 (2–6s): cámara se aleja para encuadre completo (calcular distancia: ajustar para que R proyectado ocupe ≤45% de alto). Easing: easeOutCubic.
  - Implementación actual: 2.5s de zoom con framing heurístico (distancia = max(distActual, 4×radio + 40u)). Bloquea inputs durante la fase.
- Fase 2 (6–8s): activar wrapper (alpha 0→0.6), jitter de cámara sutil.
- Fase 3 (8–13s): escala planeta 1→0, partículas outward; al final: eliminar objeto planeta de la escena y de catálogos/servicios.
- Fase 4 (13–23s): instanciar Portal; escalar 0→R_planeta (el símbolo crece, el ojo mantiene escala); pentagrama+círculo opacos; ojo clon del planeta.
- Cámara Fase 4: órbita limitada a ~45° y pitch +15°; la nave no se desplaza (solo reorientada al portal).
 - Fase 5 (23–26s): Tránsito. El Ojo fija la mirada en la nave; la nave atraviesa el portal.
 - Fase 6 (26–28s): Bola de plasma (~2–3s). Al salir por la otra cara del portal (en el sistema destino) la nave se muestra como esfera energética; fade to black en la segunda mitad.
 - Fase 7: System Swap y reaparición. Se aplica el snapshot generado con portal destino emparejado; la nave aparece a ~1000u del portal destino, orientada a mirarlo. Se retiran fades y se reanuda el control.

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
- [x] 6. Tránsito + bola de plasma + fade
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
- [x] Fade-to-black durante fase de plasma.
- [ ] Pulir “plasma ball” (shader/efecto dedicado) y añadir desaturación.

### Viaje bidireccional (Runtime Portal Traversal)

Implementado un manejador en `GameEngine` que cada frame:
1. Calcula la distancia nave→portal.
2. Detecta cruce (transición de fuera→dentro del radio del portal).
3. Si el portal tiene `linkedPortalId` y existe un snapshot que contiene ese portal destino, aplica ese snapshot.
4. Reposiciona la nave en el CENTRO del portal destino y conserva velocidad/orientación previas (sin offset). El offset ~1000u solo aplica en la animación del rito.
5. Aplica un cooldown de 3s (`portalTraversalCooldownSec`) para evitar rebote inmediato.

Limitaciones actuales / TODO:
- Falta interpolar fade (se hace fade instantáneo a negro y regreso). Mejorar con rampa 200–300ms.
- Eje +Z fijo para spawn: ajustar según normal local futura del portal.
- HUD: no se muestra aún un indicador de “Portal Linked / Cooldown”.
- No se serializa `voidEnergy` ni estado transitorio de la nave (solo su nueva colocación tras swap).

### Política de exclusión del planeta colapsado

El snapshot `gate-origin-linked-*` NO debe incluir el planeta original colapsado. Si se detecta su reaparición tras viaje de retorno:
- Verificar que el serializer excluye el planeta en la fase posterior a `PlanetCollapse`.
- Asegurar que la persistencia reutiliza el snapshot modificado (sin planeta) y no uno previo.
- Confirmar que al volver se aplica el snapshot correcto (log de `applySolarSystemSnapshot` + conteo de planetas esperado).

### Variedad procedural añadida
- Sistemas ahora pueden tener 1–2 soles (25% binario por defecto si no se fuerza).
- Planetas: 5–13, tipos variados (Rocky, Terrestrial, Giant, Ringed, Gaseous, Dwarf, Protoplanet) con radios por rango.
- Órbitas multi-plano con normales perturbadas y ejes principales aleatorios.
- Clusters: trail anclado a una órbita + nubes (“clouds”) dispersas de asteroides con derivas suaves.
- Nombres híbridos: mezcla de catálogo (Kepler/TRAPPIST/Gliese…) y generador silábico (Ka/Lo/Xe + rin/dus/mos…).
- Vida: probabilidad base 8% para planetas “excepcionales” (≥30% life), resto escalado por tipo.

### Cooldowns relevantes
- Gate Rite (animación): bloqueo completo de inputs hasta fase final (PlasmaBall completa).
- Portal traversal runtime: 3s tras cruce exitoso.
- Blink ocular: 2.5–6.5s aleatorio.

---
Notas añadidas tras integración bidireccional y clouds.

## Próximos pasos inmediatos
1. Pulir “plasma ball” con shader dedicado y opcional motion blur/FOV.
2. Persistir `eyeState` completo y reforzar HUD de estado de portal (ready/linked/countdown).
3. Documentar timings definitivos y añadir capturas.

---

Notas: Este documento se irá actualizando conforme implementemos cada milestone. Cualquier ajuste de diseño quedará registrado con fecha.
