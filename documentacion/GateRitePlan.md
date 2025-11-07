# Gate Rite — Diseño y Plan de Implementación

Última actualización: 2025-11-07 (noche)

Este documento define el diseño funcional y técnico del nuevo rito “Gate Rite” y su integración completa con el motor, UI/Grimorio, animaciones y el ciclo de sistemas solares.

## Objetivo

- Nuevo hechizo “Gate Rite” en el Grimorio.
- Requiere estar a ≤ 50u del planeta seleccionado.
- Secuencia cinematográfica que destruye el planeta y materializa un portal (TargetType.PORTAL) persistente.
- Teleporta la nave a un nuevo sistema solar generado proceduralmente.

## Cambios confirmados (feedback del autor)

- El sigil no hace fade-out; se materializa como un objeto del espacio persistente (Portal) y es targeteable.
- El planeta objetivo se elimina realmente del juego (no solo escala visual). Se borra de datos/registro y de render.
- Tras cruzar el portal: la nave se convierte en una bola de plasma 2s manteniendo dirección/velocidad; la cámara se queda fija en posición y rota para seguirla.
- Antes de reemplazar el sistema, guardar snapshot de todos los objetos del sistema actual en un objeto `solar-system`.
- Generar un sistema nuevo: 1–2 soles (cerca del centro), planetas aleatorios (tipos/cantidades), clusters “nube”, y habitabilidad por defecto 0% salvo casos raros (5%) con >30%.
- Dejar un Portal en el nuevo sistema cerca de la nave, para permitir viajes posteriores.

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
- Portal (nuevo GameObject):
  - Extiende GameObject + ITargetable; TargetType.PORTAL.
  - Render con shader de runas/sello arcano; billboard opcional del ojo central.
  - Puede ser targeteado y aparecer en HUD/outliner.
- PlanetWrapperEffect: reutiliza/extrae algoritmo del núcleo de la Tierra.
- Solar System Snapshot/Generator:
  - `ISolarSystemSnapshot`: planetas, soles, asteroides, naves, clusters y estados.
  - `SolarSystemGenerator`: crea sistemas procedurales con reglas (1–2 soles, planetas aleatorios, clusters nube, habitabilidad 0% salvo 5% >30%).

## Contratos mínimos

- `AnimationManagerService.startGateRite(engine: GameEngine, target: Planet): boolean`
- `GateRiteAnimation` implementa `GameAnimation` (start/update/render/isBlockingInputs)
- `Portal` implementa ITargetable con `getDisplayName()`, `getTargetType()`, `isActive()` y radio.
- `SolarSystemService` (nuevo o existente) con:
  - `snapshot(): ISolarSystemSnapshot`
  - `apply(snapshot: ISolarSystemSnapshot): void`
  - `generateRandom(seed?: number): ISolarSystemSnapshot`

## Timeline y detalles técnicos

- Fase 0 (0–2s): bloqueo de inputs; cámara 0; preparar referencias; leve “pulse” del planeta.
- Fase 1 (2–6s): cámara se aleja para encuadre completo (calcular distancia: ajustar para que R proyectado ocupe ≤45% de alto). Easing: easeOutCubic.
  - Implementación actual: 2.5s de zoom con framing heurístico (distancia = max(distActual, 4×radio + 40u)). Bloquea inputs durante la fase.
- Fase 2 (6–8s): activar wrapper (alpha 0→0.6), jitter de cámara sutil.
- Fase 3 (8–13s): escala planeta 1→0, partículas outward; al final: eliminar objeto planeta de la escena y de catálogos/servicios.
- Fase 4 (13–23s): instanciar `Portal` en el centro del planeta; escalar 0→R_planeta; ojo central con flame UV-scroll; cada 1–2s reorienta mirada hacia un astro distinto.
- Fase 4 cámara: órbita a 45° lateral y +15° pitch, completando ~270° en 10s.
- Fase 5 (23–26s): nave a 1000u en 3s (override temporal de maxSpeed), cruza plano del Portal; NO fade-out del sigil (queda persistente).
- Fase 6 (26–28s): bola de plasma 2s; cámara fija en posición, rota para seguir la nave.
- Fase 7: snapshot del sistema; `apply(generateRandom())`; reposicionar nave, dejar un Portal cerca; cooldown 5s para restaurar maxSpeed.

## Datos y serialización (draft)

```ts
interface ISolarSystemSnapshot {
  id: string; // UUID
  timestamp: number;
  stars: Array<{ id: string; type: 'single'|'binary'; position: {x:number,y:number,z:number}; primaryColor: string; secondaryColor?: string; }>;
  planets: Array<{ id: string; planetType: string; position: {x:number,y:number,z:number}; scale: {x:number,y:number,z:number}; habitabilityPct: number; name: string }>;
  clusters: Array<{ id: string; center: {x:number,y:number,z:number}; radius: number; count: number }>;
  ships: Array<{ id: string; position: {x:number,y:number,z:number}; velocity: {x:number,y:number,z:number}; heading: {x:number,y:number,z:number} }>;
  portals: Array<{ id: string; position: {x:number,y:number,z:number}; scale: number }>;
}
```

Generador: nombres de planetas reales/estrellas; 1–2 soles (si 2, órbitas internas cercanas); habitabilidad 0% salvo 5% con >30%.

## Milestones (iteración incremental)

1. Stubs y wiring:
   - `gate-rite.animation.ts` con state machine vacía.
   - `AnimationManagerService.startGateRite` + precarga.
   - `Portal` GameObject básico targeteable.
   - Glifo en Grimoire (placeholder) + trigger.

2. Cámara Zoom-Out y Wrapper básico.
3. Colapso + borrado real del planeta.
4. Portal persistente + ojo (mirada aleatoria) + cámara órbita + orientación nave.
5. Aceleración/Tránsito y fase bola de plasma + cámara estática con rotación tracking.
6. Snapshot/apply generador de sistema nuevo y reubicación de nave + portal.
7. Pulido (partículas, shaders, easing) y QA.

## Seguimiento de progreso

- [x] 1. Wiring inicial (anim + manager + portal + grimoire)
- [x] 2. Zoom-Out (fase 1) — Implementado: zoom logarítmico 3×; Wrapper implementado con jitter sutil
- [ ] 3. Colapso + borrado real — Parcial: colapso ease-in-out 5× + storm-shell; eliminación real OK; pendiente partículas outward
- [x] 4. Portal + ojo + cámara órbita + orientación nave — Implementado: símbolo arcano multi-anillos con glifos, blending aditivo; ojo centrado con iris y retarget aleatorio; cámara órbita ~270° y nave orientada
- [ ] 5. Tránsito + plasma + cámara seguimiento
- [ ] 6. Snapshot + generador + swap
- [ ] 7. Pulido y QA

---

Notas: Este documento se irá actualizando conforme implementemos cada milestone. Cualquier ajuste de diseño quedará registrado con fecha.
