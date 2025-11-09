# Gate Rite — Diseño y Plan de Implementación

Última actualización: 2025-11-09

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
10) Snapshot y System Swap: serializa `solar-system`, genera sistema nuevo, reposiciona nave y un Portal.
11) Cleanup y Restore: restablece límites de velocidad tras 5s de cooldown; inputs habilitados.

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
-- Fase 4 (13–23s): instanciar Portal; escalar 0→R_planeta; reemplazar disco por anillos + glifos (pendiente). Ojo central opcional (no implementado actualmente).
-- Cámara Fase 4: órbita ~270° con pitch +15° (parcialmente implementado; retimings por ajustar).
- Fase 5 (23–26s): Gaze lock + Transit. El Ojo fija la mirada en la nave; boost hasta ~1000u en 3s (override temporal de maxSpeed), detección de cruce del plano del símbolo (pentagrama + círculo + ojo).
- Fase 6 (26–28s): Bola de plasma (~2s). Override de material de la nave a esfera energética; cámara fija rota para seguirla; fade to black al final.
- Fase 7: System Swap. Snapshot con `SolarSystemSerializer`; `SolarSystemService.generate/apply` para nuevo sistema; crear Portal destino enlazado; posicionar nave a ~1000u, velocidad 0, void energy recargada; cooldown 5s para restaurar maxSpeed.

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
- [ ] 4. Símbolo Arcano + Ojo (placeholder actual: disco, núcleo planeta reutilizable disponible)
- [ ] 5. Gaze tracking + cámara órbita refinada
- [ ] 6. Tránsito + bola de plasma + fade
- [ ] 7. Portal pairing + System Swap
- [ ] 8. SolarSystemService + generador ampliado
- [ ] 9. Persistencia avanzada + HUD portal
- [ ] 10. Pulido y QA

## Próximos pasos inmediatos
1. Definir malla del Pentagrama + Círculo y refactor `Portal` para reutilizar el núcleo del planeta como Ojo.
2. Implementar shader del Ojo (esclera/venas, iris, pupila llama, párpados) + uniforms y timeline de apertura.
3. Añadir gaze tracking (Acquire/Track/Blink) con smoothing y límites.
4. Extender `SystemGeneratorService` (sunCount, planetCountRange, clusterConfig) e implementar `SolarSystemService` (snapshot/apply/generate).
5. Implementar Tránsito (boost + cruce plano símbolo) y Bola de plasma con fade.
6. Persistir `PortalSnapshot` con `linkedPortalId` y `eyeState`; crear portal destino en nuevo sistema a ~1000u.
7. Integrar HUD para mostrar estado del portal, destino y enlace.

---

Notas: Este documento se irá actualizando conforme implementemos cada milestone. Cualquier ajuste de diseño quedará registrado con fecha.
