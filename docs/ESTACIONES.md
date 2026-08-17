# Estaciones espaciales — Diseño y plan (Fase 9)

> Referencia: `docs/ARQUITECTURA.md` Fase 9. Narrativa: `docs/HISTORIA.md` §5. Cumple las reglas duras de
> `CLAUDE.md` (GameEngine solo encoge; lógica nueva en clases/servicios externos; sin `any` nuevos;
> ficheros nuevos ≤400 líneas; logging vía `GameLogger`/`LoggingService`; semillas para lo procedural).

## 0. Decisiones tomadas (con el usuario)

1. **Modelo runtime** estilo TARDIS/Tortuga (un `SpaceStationSystem` que el motor invoca por frame),
   **PERO** con un **modelo master heredable**: vendrán estaciones de **otras razas** (distinto diseño,
   mismos puertos + mismo flujo de menú). → clase base abstracta `SpaceStation`.
2. **Categoría nueva de GameObject** `STATION` (como planetas/naves/seres/soles/asteroides):
   **filtrable en el mapa** y **seleccionable** como cualquier otro objeto.
3. **Menú de aterrizaje propio** de estación (no reusar el de planetas), reusando el *shell* del panel
   (`LandingPanelController`) y la animación de acople.
4. **Troceado**: **Slice 1** navegable + acople jugable end-to-end; **Slice 2** narrativa (cinemática de
   recuerdos, sucesos grotescos/estructurales, descubrimiento de hechizos).
5. **Landmark fijo, regenerado idéntico por semilla** (daño y disposición de puertos SIEMPRE iguales).
   **Sin persistencia** de daño/puertos/hechizos: nada de mini-códec. La estación se reconstruye igual.
6. **Descubrir hechizo = idempotente**: al buscar con éxito en la estación humana, si **Void Jump
   (`SpellType.LONGJUMP`) NO está en el grimorio, se añade**; si ya está, no pasa nada. REVISADO
   build 64 (2026-08-17): el "god mode" de pruebas se RETIRÓ — el grimorio inicial trae **solo el
   Gate Rite** (`GameStateStore.knownSpells`); el GrimoirePanel OCULTA los glifos no descubiertos
   (aparecen en su hueco al aprenderlos, via `setKnownSpellsProvider`). Los savegames restauran su
   propio libro. Otros hechizos se otorgarán en otros puntos de la historia más adelante.
7. **Animación de acople propia** tipo "hangar / aproximación a muelle" (no la cámara cinemática de
   aterrizaje planetario).
8. **Apariencia con texturas reales** (no colores planos). Texturas **CC0 de Poly Haven** ya descargadas a
   `src/app/assets/textures/`: `station_panel.jpg` (casco) y `station_panel_worn.jpg` (secciones dañadas
   del Incidente). CC0 = uso libre sin atribución; fuente documentada en `src/app/assets/textures/CREDITS.md`.

## 1. Modelo de objetos

### 1.1 Categoría y tipos (nueva categoría seleccionable/filtrable)
`game/types/game-object.types.ts`:
- `GameObjectType.SPACE_STATION` (+ a futuro otras razas comparten este tipo; el diseño lo da la subclase).
- `GameObjectType.DOCK_PORT` (la "tile" de acople).
- `GameObjectCategory.STATION`. Mapear ambos tipos a `STATION` en `TYPE_TO_CATEGORY`; tamaño:
  `SPACE_STATION → MASSIVE`, `DOCK_PORT → ETHEREAL`. Iconos en `getDisplayIcon`/`getCategoryIcon`/label.
- `targeting.types.ts`: `TargetType.SPACE_STATION` y `TargetType.DOCK_PORT`.
- El **filtro del mapa** y el catálogo de targets ya operan por categoría/tipo → la estación y sus
  puertos aparecen automáticamente al añadir la categoría (verificar `SolarSystemPanel`/target-catalog).

### 1.2 Clase base master `SpaceStation` (abstracta)
`game/game-objects/stations/space-station.ts` (≤400 líneas). `extends GameObject`. Comparte para TODAS
las razas:
- Identidad/targeting (ITargetable): `getDisplayName()` = nombre de la estación; `getTargetType()` =
  `SPACE_STATION`; `voidMassUnits`, `size`, `healthMax/Current` (features comunes del panel de target).
- `animosity` (humana = NEUTRAL al principio).
- **Puertos**: `ports: DockPort[]` con estado `intact|destroyed`, `free|occupied`.
- **Hook de geometría**: método abstracto `buildStationGeometry()` que cada raza implementa (toroide +
  radios + núcleo de motores para la humana). Geometría construida UNA vez (patrón `TURTLE_GEO`) para
  evitar el pitfall de `useDefineForClassFields` (asignar en cuerpo del constructor tras `super`).
- **Layout de puertos**: método abstracto `buildPortLayout()` → posiciones/orientaciones locales de las
  tiles en los radios.
- **Daño parcial**: marca de secciones destruidas (visual + qué puertos quedan inutilizados).

### 1.2.1 Colisión/selección de MEGA objetos NO esféricos (regla del usuario, 2026-06-29)
**La bounding sphere queda DESACTIVADA para STATIONS** (decisión del usuario). Una esfera de ~800u
bloquearía volar entre los radios y meterse en los puertos, que es la gracia. Por tanto:
- **Sin colisión por ahora** en el cuerpo de la estación: en el constructor de `SpaceStation` se hace
  `this.boundingSphere = null` y NO se definen `setCollisionShapes`. `GameObject.checkCollision` devuelve
  vacío sin esfera ni shapes → la nave atraviesa la estructura libremente (aceptable en Slice 1).
- **Detección de colisión "de otra forma"**: ✅ IMPLEMENTADA (2026-08-15) según `docs/COLISIONES.md`
  (Fase 11 de ARQUITECTURA): esfera de activación autocalculada (~744 u) + narrow phase por SDF en
  espacio local (toro con gaps de secciones destruidas + cajas de radios/núcleo/tobera/clamps),
  registrada por `SpaceStationSystem` en el `ShipCollisionSystem` al spawnear. El
  `boundingSphere = null` SE MANTIENE (el gate estructurado no usa `GameObject.boundingSphere`).
  Suprimida mientras la nave está acoplada (`isStructuredSuppressed`: la pose de atraque queda
  dentro del clamp). Spec de conformidad malla↔collider en `station-collider-conformance.spec.ts`.
- **Selección/targeting**: los **puertos** (`DockPort`) son los targets (cada uno con su pequeña bounding
  sphere propia, esférica y correcta). El **acople** mide distancia **nave↔puerto** (centro del
  `DockPort`). ✅ El **cuerpo** también es seleccionable (build 62, 2026-08-16): radio de selección
  "aim al núcleo" (`SELECT_RADIUS_FACTOR` = núcleo+margen ⇒ 160u, NO los 800u exteriores, que caían en
  el dominant-gate del targeting a <~2ku), registrado en `mapIdToTarget` para el clic del mapa (M), y
  con detalle coherente en el HUD (`TargetDetailService`): clase/estado/tripulación + `portsSummary`
  ("2/8 operativos", lo rellena el system). Los puertos muestran estado vivo (Operativo/Cerrado/
  Destruido) y el nombre de la estación padre.

### 1.3 Subclase `HumanSpaceStation`
`game/game-objects/stations/human-space-station.ts` (≤400). Implementa el **toroide** con secciones
(hábitats/almacenes/mantenimiento), **4 radios** hacia un **núcleo central de motores**, y los **puertos**
en los radios. Aplica el **daño parcial** del Incidente (algunas secciones/puertos destruidos de forma
determinista por semilla del id, NO `Math.random` para lo persistente). Estética humana (metal frío,
ventanas con algo de luz cálida emissive como la TARDIS si procede — patrón `u_useVertexColor` +
`u_emissiveStrength`, que por defecto valen 0 y no afectan a nada más).

### 1.4 `DockPort` (la "tile" de acople, reutilizable)
`game/game-objects/stations/dock-port.ts` (≤400). `extends GameObject` ligero:
- Geometría: **polígono/quad azul con glow** (emissive vía el patrón gateado del shader lit).
- ITargetable: `getDisplayName()` → **"Puerto espacial"**; `getTargetType()` → `DOCK_PORT`.
- **Características heredadas del padre**: el panel de detalle de un `DOCK_PORT` muestra las
  características de la **estación padre** (void mass, tamaño, tipo…), pero el **nombre** es el del puerto
  ("Puerto espacial"). → `dockPort.parentStationId` + `target-detail.service` resuelve el padre.
- Estado: `intact/destroyed`, `free/occupied`; solo los `intact && free` encienden el piloto de acople.
- **Genérico**: cualquier objeto del espacio podrá llevar tiles de acople (mismo contrato: nombre del
  punto + características del objeto padre). Por eso `DockPort` no es exclusivo de estaciones.

## 2. Sistema runtime `SpaceStationSystem`
`game/services/state/space-station-system.ts` (≤400). Como `SpaceTurtleSystem`/`TardisCompanionSystem`:
- Habla con el motor por un **host tipado** (sin `(x as any)` ni acoplar a GameEngine).
- **Spawn**: al entrar al **sistema humano**, coloca la `HumanSpaceStation` a **1000u de la nave del PJ**,
  **dentro de la cola de asteroides de la Tierra** y **siguiendo su trayectoria** (orientada con la
  deriva/rotación del cinturón). Determinista por semilla del sistema.
- **Update/frame**: orienta/posiciona, refresca `boundingSphere` de estación y puertos, mantiene el
  registro de puertos libres/intactos.
- **Acople**: detecta nave a **<50u** de un puerto intacto y libre → enciende el **piloto de aterrizar**
  y habilita la **animación de acople** (panza de la nave → tile). Reutiliza el patrón del
  `landing-evaluator` pero para puertos (umbral 50u; el evaluador actual solo mira planetas → se añade
  un evaluador de acople paralelo o se generaliza el host).
- **Persistencia ad-hoc** (decisión 0.1): hechizos descubiertos en la estación y puertos usados/estado de
  daño. Vivirá en `GameStateStore` (SSOT) como sub-estado serializable del sistema humano, NO copiado a
  mano en serializadores (si crece, se evalúa códec). *Punto a refinar (§6).* 

### Host (interfaz, esbozo)
```
interface SpaceStationHost {
  getShipPosition(): Vector3 | null;
  getCurrentSystemId(): string;          // solo spawnea en 'human-system'
  getEarthTail(): { center: Vector3; driftDir: Vector3 } | null; // cola de la Tierra
  registerTargetable(obj: ITargetable): void;   // estación + puertos al catálogo
  openStationLanding(ctx: StationApproachContext): void; // abre el menú propio
  playDockAnimation(port: DockPort, onDone: () => void): void;
  log(msg: string, data?: unknown): void;
}
```

## 3. Acople (flujo) y animación
> REVISADO 2026-08-16 (build 60): la condición de acople pasa a ser el **corredor de marcos neón**, ver §8.
1. Nave DENTRO del corredor de marcos de un `DockPort` acoplable y a **≤5 u/s de velocidad RELATIVA
   al puerto** → **piloto de aterrizar ON** (reusa el indicador HUD del aterrizaje planetario).
2. El jugador confirma (ENTER) → **animación de acople**: la nave vuela desde su posición y **acopla su
   panza a la tile** (nueva animación tipo `landing-sequence.animation.ts`, reutilizando cámara/holds del
   aterrizaje: `landing-camera-hold`, `ship-landing-positioner`).
3. Al terminar → **menú de aterrizaje de la estación** (§4).

## 4. Menú de aterrizaje de estación (componente nuevo)
`components/landing-menu-station/` + tipos `game/types/station-landing.types.ts` +
`services/game/station-landing-action.service.ts` (espejo simplificado de `landing-action.service`).
Reutiliza el *shell* (`LandingPanelController`, panel global). Acciones (REVISADO build 63, 2026-08-17):
- **Buscar por la estación** (sin % visible) → primero la **PRESENTACIÓN DE CÓMIC** (ver abajo) y al
  terminar el desenlace mecánico: éxito/fallo con tablas de sucesos + **+5% de memoria SIEMPRE**
  (buscar es recordar; antes la memoria se ganaba descansando):
  - *grotescos* (cadáveres) → **−cordura** (Slice 2: textos ricos inventados desde §5).
  - *estructurales* → **−vida** (Slice 2).
  - *recompensa* → **descubrir hechizo**: por ahora **Void Jump** (`SpellType.LONGJUMP`) (Slice 2).
- **Descansar (100%)** → +vida, +cordura y avanza tiempo (YA NO da memoria ni flashbacks de texto).
- **PRESENTACIONES de cómic** (`PresentationService` + `PresentationPlayerComponent` +
  `presentation-assets.ts`): viñetas por CONVENCIÓN de carpetas — imagen
  `assets/presentationAnimation/<base>-NN.png`, voz `assets/audio/presentations/<base>-NN.wav`,
  subtítulo opcional `<base>-NN.txt` junto a la imagen (guion/narrador; se pinta bajo la viñeta).
  Descubre desde 00 hasta el primer hueco (sondeo de imagen; el fallback SPA no cuela). Secuencia:
  fade in 0,5s → voz completa → 1,5s → fade out → siguiente; sin voz, 4s. ESC salta. Las voces NO
  van al `_manifest.json` (arranque ligero): se cargan bajo demanda y suenan por el bus `voice`.
  La búsqueda de la estación usa `base = 'Base'`. **Velo de carga (build 66)**: el overlay se abre en
  el propio click con spinner ("Preparando la presentación…", mismo lenguaje visual que el velo de
  arranque del motor) mientras se sondean viñetas (por lotes de 8 en paralelo, mismo criterio de
  primer hueco) y se decodifican las voces; ESC también cancela durante la carga.
- **Recuperar vacío (100%)** → rellena `voidEnergyCurrent` de la nave.
- **Despegar** → cierra menú, libera puerto, animación inversa.

Slice 1 implementa las 4 acciones con efectos base (buscar = 50% con stub de sucesos/recompensa);
Slice 2 enchufa cinemática + tablas de sucesos + descubrimiento real de hechizos.

## 5. Plan por slices (cada uno deja `npm run build` y tests verdes + bump de `build`)

### Slice 1 — Navegable + acople (jugable)
1. Tipos/categoría: `SPACE_STATION`/`DOCK_PORT`/`STATION` en game-object.types + targeting.types + mapas.
2. `SpaceStation` (base) + `HumanSpaceStation` (toroide+radios+núcleo+puertos, daño determinista).
3. `DockPort` (tile azul glow, targetable "Puerto espacial", detalle = padre).
4. `SpaceStationSystem` + host en GameEngine (spawn a 500u en la cola, update, registro de targets,
   render). Delegadores de 1 línea en el motor; render en método propio (como `renderSpaceTurtle`).
5. Targeting/mapa: verificar selección + filtro por categoría STATION (estación y puertos).
6. Acople: evaluador de puerto (<50u, intacto, libre) → piloto + animación de acople → menú estación.
7. Menú estación básico (4 acciones con efectos base; buscar = 50% stub).
8. Specs: `space-station-system.spec` (spawn 500u/cola/no fuera del humano; refresco boundingSphere;
   acople <50u; puerto ocupado/destruido no acopla), `dock-port.spec`, `human-space-station.spec`.
9. `HISTORIA.md` (hecho) + este doc + Fase 9 en ARQUITECTURA.md.

### Slice 2 — Narrativa
1. **Cinemática de recuerdos** (sistema de "presentación" reutilizable; arranca en el despertar y crece
   con la memoria). Descansar la dispara y suma +5% memoria.
2. **Tablas de sucesos** de "buscar" (grotescos −cordura; estructurales −vida) con textos lovecraftianos.
3. **Descubrimiento de hechizos**: otorgar **Void Jump** (`LONGJUMP`) al grimorio (idempotente).
4. Specs de las tablas/efectos y del otorgamiento de hechizo.

#### Estado Slice 2 (build 33, 2026-06-29)
- ✅ **Tablas de sucesos** grotescos (−cordura) / estructurales (−vida) con variedad lovecraftiana, en
  `station-landing.service.ts`.
- ✅ **Recuerdos al descansar**: flashbacks de TEXTO que escalan con `memoryPercent` (revelan el Incidente
  por fases, ver HISTORIA §2/§6). +5% memoria por descanso.
- ✅ **Descubrimiento de Void Jump** (`LONGJUMP`) idempotente al buscar con éxito. Specs (5) en
  `station-landing.service.spec.ts`.
- ⚠️ **DIFERIDO — Cinemática de recuerdos a pantalla completa** (estilo intro, con imágenes/zoom): es un
  subsistema de "presentación" que el juego AÚN NO TIENE (no existe cinemática de intro reutilizable).
  Debe diseñarse junto con la intro del juego. Por ahora los recuerdos se entregan como texto en el menú.
- ✅ **Animación de acople cinemática** (`services/animations/docking-sequence.animation.ts`, patrón
  `BaseAnimation`+`AnimationManager`): al pulsar ENTER la nave describe un ARCO (Bezier) hasta encarar el
  puerto, despliega el tren (alas), frena con retro y la cámara ORBITA encuadrando nave+puerto+estación;
  al despegar, empuje hacia afuera con giro de 180°. Sustituyó el glide lineal inline del motor
  (`beginStationDockAnim`… borrados; el motor solo delega vía `startStationDocking`/`onStationDockingComplete`).
  docs/ARQUITECTURA.md §10.c (nave) comparte el patrón de cinemáticas.
- ✅ **Colisión real de la estación** (2026-08-15, Fase 11 R4, `docs/COLISIONES.md`): bounding-gate +
  SDF estructurado (se puede volar por el boquete del Incidente; deslizas por el casco con la normal
  de superficie real; daño escalado por velocidad de impacto). El mismo refactor unificó
  asteroides/planetas/sol bajo `ShipCollisionSystem` y adelgazó el motor −281 líneas.

## 5.1 Estado de ejecución (registro autónomo)

- **2026-06-29 · build 31** — Slice 1 pasos 1–3 HECHOS, build + 305 tests verdes:
  - ✅ Paso 1 — categoría/tipos `STATION`/`SPACE_STATION`/`DOCK_PORT` + mapas/labels/iconos + `TargetType`.
  - ✅ Paso 2 — `station-geometry.ts`, `space-station.ts` (base, bounding OFF), `human-space-station.ts`
    (toroide+radios+núcleo, daño determinista), `dock-port.ts` (tile azul). Spec `stations.spec.ts` (6).
  - ✅ Paso 3 — `space-station-system.ts` (+spec 6) + cableado en GameEngine (field/host/update/clear),
    spawn a 500u en la cola hacia la Tierra (solo `human-system`), puertos en mundo, **targets** (puertos
    seleccionables "Puerto espacial"), **render** texturizado (camino `u_useTexture` gateado en shader lit)
    + puertos azules emissive; textura CC0 `station_panel.jpg` con fallback a color por vértice.
  - ✅ Paso 4 (build 32) — acople: a <50u de un puerto acoplable + nave despacio (≤8) se abre el **menú de
    estación** propio (`station-landing-panel` + `station-landing.service`): Buscar (50%) / Descansar (100%,
    +vida/+cordura/+5% memoria/+tiempo) / Recuperar vacío (100%) / Despegar (libera puerto, no reabre hasta
    alejarse). Buscar ya incluye descubrimiento idempotente de **Void Jump** (`LONGJUMP`) + sucesos base.
    ⚠️ **Animación "hangar/muelle" NO incluida** (el menú se abre directo al aproximarse despacio) → Slice 2.
- Pendiente de PRUEBA EN JUEGO por el usuario (subir a servidor): ver la estación, navegarla, seleccionar
  puertos, acoplar (acercarse despacio a <50u de un puerto azul), probar el menú. Texturas del casco.
  Detección de colisión real de la estación: pendiente (bounding OFF).

## 5.2 Iteración por feedback del usuario (build 35, 2026-06-29)

- **Inicio respetado**: la nave NO se toca (flota sola, orientada al sol, al final de la cola). La estación
  ahora a **2500u** (antes 500/1000, salía demasiado cerca y un puerto caía dentro del rango de acople).
- **Mapa**: nueva categoría `STATION` con **botón de filtro** propio (icono "Es") y **marcador cian** de la
  estación (🛰️). Filtrable como el resto. (`SolarSystemPanel` + datos `stations` en `updateMap`.)
- **Toroide**: solo **1 corte grande + 1 pequeño** (deterministas), ya no decenas de huecos.
- **Puertos al 20%** (size 8) sobre **brazos de acople** que salen del lado del radio, **ESTE/OESTE
  contrapuestos** (1 por lado), con la tile como tapa exterior (normal horizontal).
- **Fuego** en 2 puntos del toroide + **motor "apagado"** (rojo/naranja) en el núcleo, vía partículas
  (`emitParticle` en el host; el sistema emite a intervalos).
- **Acople con ENTER**: el piloto se enciende al tener un puerto a tiro (<50u); **ENTER** dispara la
  **animación de atraque** (cámara cinemática a ~80u encuadrando nave+puerto; la nave va lenta hasta
  quedar **acoplada**) y abre el **menú**. Durante/tras el atraque: **controles del jugador y gasto de void
  energy DESACTIVADOS** (`voidEnergyPaused` + controles a cero). **Despegar** lanza la **animación de
  separación** (la nave se aleja ~180u, leve rotación, **acelera al 25%** por la normal) y devuelve control.
  Animaciones dirigidas por el motor reusando cámara MANUAL + campos de `Spaceship` (como landing-sequence).

## 5.3 Iteración por feedback (build 36, 2026-06-30)

- **Casco metálico** (no marrón): textura CC0 `metal_plate` (gris) + render con color por vértice (gris
  azulado metálico) que la modula. Worn rusty reservada para bordes rotos (futuro). `blue_metal_plate`
  descargada para variantes.
- **Animaciones más lentas** (atraque 6.0s / separación 5.0s) y **cámara más cerca de la nave** (~75u,
  mirando a la nave con el puerto en cuadro) — antes iba muy rápida y no se veía la nave.
- **Cámara se mantiene** sobre el puerto con la **nave acoplada** mientras el menú está abierto (se
  restaura la cámara HUD al despegar).
- **Menú sin fondo azul**: overlay transparente y panel a un lado (se ve la nave acoplada detrás).
- **Fuego visible**: los focos se emitían en el eje del tubo (dentro de la geometría → ocultos). Ahora van
  SOBRE el tubo + tobera del motor bajo el núcleo, con partículas más grandes/densas (naranja+amarillo).
- **Piloto "Land" del HUD**: se enciende al tener un puerto a tiro **y velocidad ≤ 5 u/s** (mismo umbral
  para poder pulsar ENTER y acoplar).

## 5.4 Iteración por feedback (build 37, 2026-06-30)

- **Diagnóstico del marrón**: NO es herencia de asteroides (la estación tiene colores por vértice gris-azul
  explícitos y extiende `GameObject`, no `Asteroid`). El tinte venía del shader: `baseColor *= textura.rgb`,
  y el difuso de las texturas de metal de PolyHaven es cálido/oliva → su tono dominaba. **Fix**: en el shader
  lit, la textura (gateada, solo la estación) se usa como **mapa de detalle por LUMINANCIA**, no por color;
  el TONO lo da el color por vértice metálico → adiós marrón. Textura restaurada a `metal_plate_02` (patrón).
- **Motor visible** (estilo Ulises 31 / tobera de la nave): geometría emissive nueva `StationMotorGlow`
  (esfera rojo/naranja, `pushSphere`) en los extremos de las toberas del núcleo, render emissive 0.75
  ("apagado"). Reemplaza la dependencia de partículas para el motor (que no se veían).

## 5.5 Iteración por feedback (build 38, 2026-06-30)

- **Inclinación inicial** ~25° en dos ejes (rotation.x y rotation.z) + **giro lento sobre su eje** Y
  (`SPIN_SPEED=0.05` rad/s, ~125 s/vuelta), como un planeta.
- Como puertos/motores/focos se derivan del modelMatrix, ahora se **re-derivan cada frame**
  (`rebuildWorldTransforms`) para que acompañen al giro (posición + normal + bounding sphere de cada puerto).
- El giro se **congela** mientras está acoplada o en animación de atraque (`host.isDockingBusy()`), para que
  la nave acoplada no se "despegue" del puerto.

## 5.6 Iteración por feedback (build 39, 2026-07-01)

- **Giro como rueda (fix del bamboleo).** El spin era `rotation.y` (Euler X→Y→Z: T·Rx·Ry·Rz·S), así que el
  eje de giro NO coincidía con el eje del toroide y "bamboleaba". Nuevo campo `SpaceStation.spin` + override de
  `updateModelMatrix` que compone `T·Rx·Rz·Ry(spin)·S`: el spin es la rotación **más interna** (tras la
  inclinación fija), por lo que el eje de giro en mundo = eje del toroide (Rx·Rz·Y). Gira como una rueda con el
  núcleo de eje, mantenga la inclinación que mantenga.
- **Fuego visible.** Las partículas (`createDestructionDebris`) son de 0.15–0.4 u **fijas** → sub-píxel a la
  escala/distancia de la estación (640 u de radio, ~2500 u de distancia): invisibles. Sustituidas por
  **esferas emissive** (naranja R=130 + núcleo amarillo R=72 como punta) en los 2 focos del toroide. Se emiten
  fuera del tubo y se re-derivan cada frame con el giro. Eliminada toda la emisión de partículas de la estación.
- **Manchas de daño rusty.** Nuevo `applyDamageStains` (station-geometry): ~18 regiones deterministas por semilla
  con anillo rusty (óxido) y **punto central quemado** (casi negro), repartidas por toroide/pasadizos/núcleo
  (centros muestreados entre los vértices → siempre sobre la superficie). El casco general sigue metálico.
- **Motor** un 20% más pequeño (72→58) y **más hundido** en la boca de la tobera; **un solo motor** (se quitó la
  tobera y la bola superiores).
- **Réplicas atracadas (pecios).** Nuevo `ship-wreck-geometry` (fusiona los módulos reales de la nave → malla de
  **alambre** centrada/normalizada, aristas únicas) + `DockedShipWreck` (color rusty→negro por vértice, dibujado
  con el programa básico en `gl.LINES`). El sistema coloca un pecio en cada puerto **salvo 2 libres** (`FREE_PORTS`),
  marcando los demás `occupied` (no acoplables). El engine expone `getShipWreckMesh()` (host) que delega en
  `buildShipWreckMesh(this.spaceship)`.
- **Generalización.** `StationMotorGlow` → `StationEmissiveBall` (color por instancia), reutilizada por motor y fuego.

## 5.7 Iteración por feedback (build 40, 2026-07-02)

- **Fuego eliminado.** No gustaba (de cerca se veía como un pegote naranja). Quitadas las esferas de fuego,
  `getFires`, `fireLocals`, la emisión y el pase de render. `StationEmissiveBall` sigue para el motor.
- **Pecios SÓLIDOS rusty.** El alambre no era lo pedido: ahora `buildShipWreckMesh` devuelve malla **sólida**
  con normales suaves y `DockedShipWreck` se renderiza **iluminado** con color rusty/quemado por vértice (sin
  textura, sin emissive). Los puertos con pecio siguen **no acoplables** (`occupied`).
- **Puerto/pecio pegados a la estación al girar (fix del "desplazamiento").** La orientación por ángulos de
  Euler (`faceNormal`) bamboleaba con la estación inclinada y girando, y tile/nave parecían despegarse. Nueva
  `composeBasisMatrix` + `DockPort.setWorldBasis`/`DockedShipWreck.setWorldBasis`: el sistema extrae una **base
  ortonormal exacta** del modelMatrix (normal + right/up en el plano de la cara, con el eje Y de la estación de
  referencia) y compone la matriz de modelo directamente — sin gimbal. Tile perfectamente plano sobre el brazo
  y pecio pegado, giren como giren.

## 5.8 Iteración por feedback (build 41, 2026-07-02)

- **Motor "M&M".** Bola de motor devuelta a la posición saliente de antes (`-(CORE_HALF+0.12)`), tamaño 58, y
  **aplastada por el eje Y de la estación** (`flattenY=0.45`) → forma de M&M. `StationEmissiveBall` acepta
  `flattenY` (escala Y no uniforme) y `setWorldBasis`; el system la orienta con la base de la estación (misma
  `composeBasisMatrix`, ahora con escala por eje), así el aplastado sigue el eje del toroide aunque gire.

## 5.9 Iteración por feedback (build 42, 2026-07-02)

- **Puertos ocupados "apagados".** Los puertos con pecio (no acoplables) se renderizan **sin emissive**; solo
  los 2 libres lucen azul. Emissive por puerto según `isDockable()`.
- **Integridad de la estación al 16%.** `healthCurrent = 16% · healthMax` (dañada por el Incidente).
- **Cuerpo de la estación seleccionable.** Nuevo `SpaceStation.radius` (radio de SELECCIÓN de targeting, lo lee
  `TargetDetector`) — NO es colisión (la bounding sphere sigue null). El engine añade el cuerpo a los targets
  junto a los puertos. Como la tolerancia del picker está capada en píxeles y es al centro (núcleo), los puertos
  (en los brazos) siguen seleccionándose sin que el cuerpo se los "trague".

## 6. Resuelto / puntos cerrados

- **Persistencia**: ❌ ninguna. Landmark fijo regenerado idéntico por semilla (§0.5). Sin códec.
- **Hechizos**: ✅ idempotente, añadir `LONGJUMP` si falta (§0.6). Sin estado "descubierto".
- **Escala** (propuesta a validar jugando): toroide radio exterior ~800u, puertos ~40u. "Grandota".
- **Animación de acople**: ✅ propia tipo hangar/muelle (§0.7).
- **Texturas**: ✅ CC0 Poly Haven en `assets/textures/` (§0.8).
- **Cola de la Tierra**: `getEarthTail()` devuelve centro (posición de la Tierra) + dirección de deriva
  del cinturón; la estación se ancla a 1000u de la nave dentro de esa banda, orientada con la deriva.
  La nave del PJ NO se toca (sigue flotando sola orientada al sol al final de la cola). El acople solo se
  dispara al ENTRAR en rango desde fuera (flanco de subida) — nunca al spawnear ni nada más despegar.
- **Primera persona (futuro)**: las secciones/corredores se diseñan ahora a nivel de geometría/narrativa
  para recorrerlos a pie más adelante (como la superficie de planetas). No se implementa el modo a pie aquí.

## 7. Interior del toroide — DISEÑO (2026-08-15; REVISADO 2026-08-16, ver nota de revisión)

**Motivación (usuario, validando Fase 11 R4):** intentó meterse con la nave por la boca de corte del
boquete y chocó. Correcto con el modelo actual (casco MACIZO), pero el usuario quiere el interior
completo: volar POR DENTRO del tubo del toroide como un túnel, entrando por las caras de corte del
Incidente. Decisión: diseñar el interior entero (visual + colisión + cámara + contenido) como fase
propia; NO parchear solo la colisión.

Datos base (espacio unidad ×800): tubo de radio 0.13 (Ø 208 u); dos arcos vivos entre los cortes
(segmentos 10–29 y 32–47+0–5, es decir ~150° y ~135° de túnel curvo); 4 bocas de entrada (2 por corte).
La nave (~15 u) cabe de sobra; el reto es visual y de cámara, no de espacio.

**Iteración de diseño (usuario, 2026-08-15):** el tubo NO es un conducto hueco — era zona habitada con
**3 CUBIERTAS (pisos)** apiladas dentro (Ø 208 u → ~55–65 u por piso con estructura). Consecuencias:
1. **Tapas de corte con anatomía**: cada boca del Incidente se CIERRA con una tapa-sección donde se ve
   el corte de los 3 pisos: **puertas** (los huecos por los que se entra con la nave), **tuberías** y
   **trozos de pasillo rotos** a las 3 alturas. Se entra por las puertas/boquetes de la tapa, no por
   un agujero limpio.
2. **Ventanas exteriores a las 3 alturas de cubierta**: filas de ventanas en la superficie exterior
   del toroide, en las 3 latitudes de piso. La estación está muy dañada y la energía es inestable →
   la MAYORÍA apagadas (cristal muerto oscuro), solo ALGUNAS encendidas (cálido tenue) y 1–2
   **parpadeando** de forma irregular. Cuentan los pisos desde fuera sin entrar. Determinista por
   semilla (qué ventana está viva); el parpadeo es FX de tiempo (función tiempo+semilla, sin estado).

**REVISIÓN (usuario, 2026-08-16, validando I0 en producción):** las bocas de corte deben CERRARSE con
una **tapa-sección visible** que enseñe la arquitectura interior (compuertas entre secciones, forjados
de los 3 pisos, trozos de salas/habitáculos) — "puede ser solo una tapa con algunos detalles y texturas".
Y decisión de alcance clave: **si se hace un FPS para bajar de la nave, NO será sobre este mallado** —
será otro render/mundo aparte (se retira todo el espacio del sistema en esa transición; enlaza con
`documentation/Plan_Desembarco_2D.md`). Consecuencias:
- El toroide queda **SELLADO**: no se vuela por dentro. Las rebanadas I1 (casco hueco), I2 (interior
  navegable) e I3 (clamp de cámara) quedan **RETIRADAS** del plan; §7.1–§7.3 se conservan solo como
  histórico de diseño. El §7.4 (contenido) se replantea para la experiencia FPS futura.
- **I0b — tapas-sección** (IMPLEMENTADO): `station-caps.ts` hornea en la malla de la estación un disco
  por frontera vivo↔destruido (4 tapas) con forjados a las alturas de las cubiertas, compuerta por piso,
  tabiques rotos y tuberías; acentos emissive (luz de emergencia parpadeante + borde de puerta cálido)
  fusionados con las capas de ventanas de I0. Determinista por semilla; cero draw calls y cero líneas
  de motor nuevas. Colisión: `collider-sdf.ts` sustituye el `Infinity` del boquete por el SDF del
  **arco con tapas planas** (`max(tubo, plano de corte)`) → chocar de frente contra la tapa da normal
  de plano y profundidad real (antes, entrar por el centro del corte teletransportaba a la pared
  radial). Sin extensiones de catálogo (no hicieron falta caja orientada ni formas sustractivas).

### 7.1 Colisión (extiende Fase 11, coste bajo) — HISTÓRICO (retirado por la revisión 2026-08-16)
- `TorusShape` gana `wall?: number` (grosor de pared, ~0.012 unidad ≈ 10 u): material = cáscara
  `{ p : |d_superficie(p)| ≤ wall }` → `sdf_hueco = |sdf_actual| − wall`. Normal = gradiente
  (`sign(d)·normal_actual`): dentro de la cavidad empuja hacia el EJE del tubo — deslizas por la pared
  interior igual que por el casco. Los `gapSegments` siguen funcionando (las bocas quedan abiertas).
- **Cubiertas**: cajas finas por segmento vivo siguiendo la curva (3 pisos × ~34 segmentos), con
  TRAMOS AUSENTES por semilla (suelo roto = agujeros entre pisos, volables).
- **Tapas de corte**: exigen dos extensiones del catálogo de Fase 11: caja ORIENTADA (basis/yaw
  local — las caras de corte no están alineadas a los ejes) y formas SUSTRACTIVAS
  (`subtract: true`: material = tapa MENOS huecos de puerta, `max(d_tapa, −d_puerta)`).
- Mamparos OPCIONALES por gameplay: cajas finas transversales cada N segmentos (compartimentos con
  boquetes propios), usando el mismo catálogo de formas. A decidir con el contenido (§7.4).
- Spec: puntos dentro de la cavidad sin contacto; contra pared interior/exterior/cubiertas con normal
  correcta; atravesar una puerta de la tapa sin contacto y chocar contra la tapa fuera de las puertas;
  conformidad malla↔collider actualizada (las superficies interiores nuevas también caen en material).

### 7.2 Visual interior (el trabajo de verdad) — HISTÓRICO (retirado por la revisión 2026-08-16)
La malla actual es SOLO la superficie exterior con backface culling → desde dentro se vería
transparente. Plan:
- **Forro interior**: segunda superficie de tubo (mismo `pushTorus`, radio `TUBE_RADIUS − wall`,
  normales INVERTIDAS, paleta oscura `HULL_DARK`×0.5). Mismas constantes, mismo fichero.
- **3 cubiertas**: bandas curvas de suelo a las 3 alturas (quads por segmento vivo), con tramos rotos
  por semilla (bordes irregulares); barandillas/costillas opcionales. Es lo que da escala y lectura
  de "esto era una estación habitada".
- **Tapas de corte** (sustituyen al collar de metal desgarrado): disco-sección en cada boca con el
  corte de los 3 pisos visible — marcos de **puerta** (los huecos navegables, borde emissive tenue),
  **tuberías** cortadas (cilindros/quads oscuros) y **trozos de pasillo** asomando. Todo geometría
  low-poly por semilla, mismas constantes que las cubiertas.
- **Ventanas exteriores**: quads emissive pequeños sobre la superficie del toroide en las 3 latitudes
  de cubierta, solo en segmentos vivos. Estados por semilla: ~80% muertas (oscuras, no emissive),
  ~15% encendidas (cálido tenue), ~5% parpadeo irregular (modulación por función tiempo+semilla en el
  pase emissive, patrón bolas de motor/puertos ya existente). Sin luz real: solo emissive.
- **Costillas/cuadernas**: anillos de refuerzo cada ~4 segmentos para dar profundidad al túnel.
- **Luz interior**: puntos emissive tenues cada pocos segmentos — ámbar de emergencia, mismo lenguaje
  de "energía inestable" que las ventanas (algunos tramos a oscuras).

### 7.3 Cámara — HISTÓRICO (retirado por la revisión 2026-08-16)
La cámara de seguimiento orbita DETRÁS de la nave → dentro del túnel atravesaría la pared. Necesita
clamp: raycast/SDF de la posición de cámara contra el MISMO collider hueco (reutilizar
`collider-sdf`), acercándola a la nave cuando no quepa. Diseñar como servicio pequeño reutilizable
(servirá igual para cañones/cuevas futuras).

### 7.4 Contenido y gameplay (a decidir con el usuario antes de implementar)
Candidatos: restos flotantes (pecios pequeños con física de asteroide), un pickup de memoria por arco
(enlaza con las memorias de HISTORIA §5), un lesser being acechando en un arco, targeting exterior
atenuado dentro. El diseño narrativo se cierra en `docs/HISTORIA.md` §5 antes de implementar.

### 7.5 Rebanadas (cada una build+tests verdes + bump)
- **I0** — **ventanas exteriores** ✅ (build 54): 3 filas a las alturas de cubierta, solo segmentos
  vivos; ~80% muertas / ~15% encendidas / ~5% parpadeo; `StationRenderer` extraído del motor.
  Ampliado en build 56 (petición del usuario): mismas 3 filas también en la **cara interior** del
  tubo (la que mira al núcleo), con semilla propia (`-windows-inner`) para no reordenar el patrón
  exterior ya validado.
- **I0b** — **tapas-sección** ✅ (build 55): disco + forjados + compuertas + tabiques + tuberías por
  boca de corte, acentos emissive fusionados con las ventanas; SDF de arco con tapas planas en
  `collider-sdf.ts` (regresión "teletransporte" cubierta por spec).
- ~~I1 colisión hueca~~ / ~~I2 visual interior~~ / ~~I3 cámara~~ — RETIRADAS (revisión 2026-08-16:
  el toroide queda sellado; el interior se vivirá como FPS en otro render/mundo).
- **I4** — contenido: se replantea para la experiencia FPS aparte (cerrar §7.4 + HISTORIA §5 antes).

## 8. Corredor de acople con MARCOS NEON (build 60, 2026-08-16)
Peticion del usuario (con esbozo): senalizar visualmente DONDE y COMO se puede atracar.

- **Marcos neon**: 3 marcos rectangulares cian, finos, flotando frente a cada puerto ACOPLABLE a lo
  largo de la normal de aproximacion (16/33/50u), formando un EMBUDO (el lejano es el mayor). Se
  encienden en secuencia de fuera hacia dentro (lejano, medio, cercano) y se apagan en el mismo orden,
  en ciclo (6 pasos x 0.3s) — "aterriza aqui, en esta direccion". Brillo residual 0.18 al estar
  "apagado" para que el corredor siempre se lea.
- **Condicion de acople**: nave DENTRO del embudo Y a <=5 u/s de velocidad RELATIVA al puerto
  (el puerto se mueve con el giro de la estacion: v_puerto = omega x r, ~9 u/s en el radio de los
  brazos). Cumplida -> piloto "Land" del HUD encendido; ENTER lanza la cinematica de siempre.
- ~~**Asistencia de atraque**: con la nave dentro del corredor, el giro de la estacion se FRENA suave
  hasta pararse; al salir del corredor el giro se reanuda.~~ **RETIRADA en build 66 (§8.2)**: la
  estacion NUNCA frena por la nave; atracar exige igualar la velocidad del puerto en movimiento.
- **Puertos NO acoplables**: los pecios rusty atracados se RETIRAN (borrados `docked-ship-wreck.ts`,
  `ship-wreck-geometry.ts` y los 6 `createXxxGeometry` huerfanos de `Spaceship`, -364 lineas); el
  tile queda en AZUL OSCURO sin emissive y sin marcos (no se puede atracar).
- **Codigo**: `station-dock-frames.ts` (geometria de marcos en espacio local del tile + secuencia +
  test de embudo, con spec); candidato/relativa/freno en `SpaceStationSystem` (host: -getShipWreckMesh,
  +getShipVelocity); render de marcos en `StationRenderer` (mallas compartidas, 3 draws por puerto
  acoplable con el modelMatrix del `DockPort`); motor solo delega (`isDockReady`).

### 8.1 Afinado tras feedback del usuario (build 61, 2026-08-16)
Reporte: entre el 3er y 2o marco, casi parado relativo, el piloto no encendia. Causas: el freno de
giro estaba acoplado a "dentro del corredor" (blanco movil: entrar frena los marcos bajo tus pies y
el candidato parpadea en el borde) y la zona terminaba EXACTO en el plano del marco lejano.
- ~~Freno por PROXIMIDAD con histeresis (SPIN_BRAKE_RANGE 140u / RELEASE 180u, ease 2.5/s): los
  marcos ya estan QUIETOS antes de enhebrar el corredor.~~ RETIRADO en build 66 (§8.2).
- Gracia de +14u tras el marco lejano (DOCK_CORRIDOR_GRACE): flotar "en" el 3er marco cuenta dentro.
- Piloto con histeresis: enciende a <=5 u/s relativa, no se apaga hasta >6 (sin parpadeo).
- Feedback vivo: aviso HUD periodico en el corredor con la relativa actual ("frena: X.X u/s (max 5)")
  o "Acople listo"; lo emite el SISTEMA via host.showDockHint (updateStationDocking del motor
  eliminado). Y los 3 marcos del puerto listo se quedan FIJOS a plena luz (confirmacion en mundo).

### 8.2 Correccion de diseño: relativa REAL, sin freno de giro (build 66, 2026-08-18)
Peticion del usuario: el freno de giro por proximidad NO era lo pedido — "no me cambies el sistema
de referencia": la nave conserva su velocidad en el espacio 3D SIEMPRE; lo que se compara contra el
umbral de 5 u/s es `|v_nave − v_puerto|` con el puerto MOVIENDOSE de verdad (v_puerto = omega x r,
~9 u/s). Aunque la nave vaya a 10 u/s en mundo, si acompaña al puerto la relativa puede ser 2-3 u/s
y el acople es valido dentro del embudo de marcos.
- Freno/asistencia RETIRADOS del todo (`SPIN_BRAKE_RANGE/RELEASE`, `SPIN_EASE_RATE`, `spinFactor`,
  `brakeEngaged` borrados): la estacion gira SIEMPRE; solo se congela acoplada/en animacion
  (`isDockingBusy`, como antes). Atracar es una maniobra de acompañamiento, no de frenado.
- Aviso HUD reescrito: "Corredor de acople — relativa al puerto: X.X u/s (max 5)" (antes "frena:",
  que sugeria reducir la velocidad absoluta).
- **Spawn con desvio lateral**: la estacion aparece a 2500u hacia la Tierra + **500u PERPENDICULARES**
  a la linea nave→Tierra (`LATERAL_OFFSET`, perpendicular determinista con el up del mundo, fallback
  eje X si la linea es casi vertical): al girar la vista desde el inicio se ven estacion y Tierra como
  objetos separados, no alineados.
