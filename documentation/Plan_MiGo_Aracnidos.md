# Plan Fases 14–15 — Los Mi-Go, los Arácnidos y el vuelo por ratón

> Plan ejecutable y autocontenido (convención del proyecto: símbolos exactos, pasos y criterios de
> aceptación por slice). Continúa el marco de razas de Fases 12–13 (`docs/RAZAS.md`, `docs/ARMAS.md`,
> `documentation/Plan_Armas_Razas.md`). Toda regla dura de `CLAUDE.md` aplica: GameEngine no crece,
> ficheros nuevos ≤400 líneas, persistencia via códecs/serializadores con campos opcionales (sin
> migraciones), logging via GameLogger, sin `any` nuevos, `Math.random()` solo FX.

## 0. Visión (decisiones de diseño del usuario, 2026-08-22)

**Los Mi-Go** (segunda raza con ficha completa; entran en el sorteo de planetas con vida junto a los
Grises):

- Cuentan más historia del último humano (+5 % memoria): **Yog-Sothoth creó la secta humana**. La
  Tierra era uno de los sistemas más adorados de su oponente **Cthulhu**, que a veces habita sus
  profundidades marinas; los humanos fueron una mera herramienta en la guerra entre primigenios.
- Informan del **comportamiento observado de Yog-Sothoth**: se oculta tras **burbujas que dañan todo
  objeto** en el espacio; su ser vive en el centro de las burbujas (siembra del futuro boss).
- Su misión (`exterminate`): una raza de **arácnidos** amenaza sus designios y su expansión. Piden
  **destruir los 3 planetas habitados** del sistema arácnido y **terminar su presencia**: también sus
  **estaciones espaciales** (concepto tela de araña) y los **cazas** que patrullan.
  Métodos de destrucción de planeta: **Gate Rite sobre cada planeta** o **Void Kinesis sobre el
  planeta** (absorbe la void mass hasta hacerlo desaparecer; nuevo alcance del rito).
- Al aceptar: **sintonizan el Gate Rite** hacia el sistema arácnido y entregan lo necesario para la
  guerra: **dispositivo de vuelo por ratón**, **más capacidad de giro** (pitch/yaw/roll) y el glifo
  **VOID_KINESIS** (la herramienta para drenar mundos).
- Al entregar: +5 % memoria, glifo **VOID_COCOON**, aliados (tienda) y la oferta de **sintonizar el
  rito hacia el sistema natal de la gran raza de Yig** (gancho de la próxima raza: el warp hacia las
  dimensiones de los primigenios).

**Los Arácnidos** (raza antagonista; NUNCA en el sorteo — solo en su sistema de guerra):

- Sistema generado por sintonía: **3 planetas habitados** por arácnidos + **2 estaciones telaraña**
  + cazas.
- **Neutrales hasta el primer evento de combate** (dañar estación/caza o destruir/drenar un planeta
  suyo) → hostiles permanentes; los cazas salen de las estaciones a por el humano invasor.
- En neutral se puede aterrizar: son **elusivos y pasan de ti**, pero ofrecen su **tienda con minas**
  (DRONE_MINE) y una **contramisión: destruir un planeta Mi-Go**. Cumplirla vuelve hostiles a los
  Mi-Go y hace perder su misión (traición con consecuencias).
- Sin estaciones vivas los cazas se repliegan; "terminar su presencia" = 3 planetas + 2 estaciones.

**Vuelo por ratón** (dispositivo, no básico): a más distancia del cursor a la retícula (centro de
pantalla), más velocidad demandada de pitch/yaw. **Roll sigue en Q/E**. Toggle con tecla `c`.

## 1. Hallazgos verificados en código (apalancan el plan)

- `Spaceship.handleInput` (`Spaceship.ts:329`): rotaciones por ejes locales reales con booleanos
  `controls.*`; `rotationSpeed = Math.PI/2.5`, penalización al 42 % a máxima velocidad,
  `precisionRotationScalar`. Añadir canales **analógicos** es un bloque paralelo a los booleanos.
- `GameEngine.flightPointer` (:863) ya guarda la posición del cursor en vuelo (minas guiadas);
  el vuelo por ratón la reutiliza (offset al centro del canvas), sin tocar listeners.
- `gameState.gateTuning` es `string | null` (solo primigenio) y **no persiste**. Se estructura como
  `GateTuningState` y se persiste (arregla de paso el hueco de los Grises: guardar tras aceptar
  perdía la sintonía).
- `SystemGeneratorService.generate`: `guaranteedInhabitants` fuerza UN planeta; se amplía con
  `guaranteedInhabitedCount` (mismo criterio de preferencia, sin consumir rng extra).
- Gate Rite ya **destruye el planeta objetivo** (PlanetCollapse → `planets.splice` en
  `gate-rite.animation.ts:423-435`) y persiste el sistema origen filtrando el colapsado. Falta un
  **hook de notificación** para consecuencias (misiones/hostilidad).
- `VoidKinesisBeam` (asteroides) es el molde del **drenaje de planetas**: encoger + convertir.
  Se crea clase paralela para planetas (tipos limpios), mismo render de haz (`drawBeamQuad`).
- `LesserBeingBase` da a los cazas TODO lo mecánico (steering, salud, targeting, recompensa de kill
  via `handleLesserBeingDestroyed` → +100 XP). `registerLesserBeing` registra también en el
  `LesserBeingController` (IA de seres que aterriza en planetas — NO vale para cazas): nuevo campo
  base `externallyPiloted` para saltarse el controller y pilotarlos desde su propio sistema.
- `LesserBeingCombatService.fireAcidSpit` ya dispara proyectiles enemigos genéricos
  (`ProjectileSystem`, facción `enemy`): los cazas disparan por ahí (se relaja el tipo del parámetro
  a `LesserBeingBase`).
- `SpaceStation` (abstracta) + `SpaceStationSystem` (patrón flat+host): molde de la estación
  telaraña. La humana es indestructible (100 000 HP); la arácnida define su propia salud.
- `weaponBridge.getLooseTargets` (`GameEngine.ts:874`): punto único donde estaciones (y lo que haga
  falta) entran como blancos de las armas del jugador.
- Misiones: `PlanetMissionType` = artifact|material|hunt; `registerHuntKill` es el patrón del
  registro de eventos → se replica como `registerExterminationEvent`. Guard de auto-transición como
  el de hunt (una exterminación no está lista al aceptarla).
- Tienda por raza exige `standing === 'ally'` (`race-outfitting-bridge:62`): los arácnidos venden en
  neutral → `RaceDefinition.shopAvailability`.
- `getPoolableRaces()` = fichas definidas menos acólitas: al añadir la ficha Mi-Go entran solos en el
  sorteo. Arácnidos y Yig llevan `excludeFromPool`.

## 2. Slices

### S0 · Vuelo por ratón + capacidad de giro

1. `Spaceship`: campos públicos `analogPitch = 0`, `analogYaw = 0` (clamp [-1,1] al aplicar).
   En `handleInput`, tras el bloque de teclas: si `analogPitch !== 0` rotar sobre `rightAxis` por
   `deltaRotation * analogPitch` (positivo = morro arriba en pantalla, signo de `s`); si
   `analogYaw !== 0` rotar sobre `upAxis` por `-deltaRotation * analogYaw` (positivo = derecha,
   signo de `d`). Marca `hasRotation`.
2. **Nuevo** `src/app/game/services/input/mouse-flight-system.ts` (~120) + spec. Flat + host:
   `MouseFlightHost { isDeviceInstalled(); isUserEnabled(); areFlightInputsLocked(); getPointer();
   getCanvasSize(); applyAnalog(pitch, yaw) }`. Por frame: sin dispositivo/toggle off/inputs
   bloqueados → `applyAnalog(0,0)`. Offset normalizado al centro con **zona muerta 6 %** del
   semilado menor y saturación al 42 %; curva cuadrática (precisión cerca del centro).
3. Outfit: `ShipOutfitState.mouseFlight?: boolean`, `turnTier?: number` (opcionales → savegames
   viejos cargan con default). `createDefaultShipOutfit` no los define.
4. `ShipOutfittingService.applyMiGoUpgrade(host)`: idempotente; `mouseFlight: true`, `turnTier: 1`,
   `ship.rotationSpeed = max(actual, PI/1.6)` (~112°/s; persiste ya en `SaveGameShipState`).
5. Tecla: `GameAction += 'mouse_flight_toggle'` (default `c`); `GameInputHandler` → 
   `engine.toggleMouseFlight()` (marquee ON/OFF; sólo si el dispositivo está instalado).
6. Debug (ñ): botón "instalar maniobrador Mi-Go".
7. Aceptación: sin dispositivo el ratón no vira; con él, cursor lejos = giro máximo, centro = nada;
   roll Q/E intacto; toggle `c`; save/load conserva dispositivo y giro.

### S1 · GateTuning estructurado + generador N habitados

1. **Nuevo** `src/app/game/types/gate-tuning.types.ts`: `GateTuningState { forcedElderGod?;
   excludedElderGod?; guaranteedInhabitants?; guaranteedInhabitedCount?; stationTheme?: 'aracnida' }`.
2. `GameStateStore`: `gateTuning: GateTuningState | null`; `setGateTuning(state)`,
   `consumeGateTuning()`, `peekGateTuning()`. `GameEngine.tuneNextGateRite(elderGod)` construye
   `{forcedElderGod}` (compatibilidad Grises). Nuevo `tuneNextGateRiteWith(state, noticeLabel)`.
3. `gate-rite.animation.ts`: el tuning consumido vuelca TODOS sus campos en `genOptions` y, si trae
   `stationTheme`, lo copia a `snapshot.meta.stationTheme` tras generar.
4. `SystemGeneratorService`: `guaranteedInhabitedCount` (default 1 si hay `guaranteedInhabitants`):
   ordena candidatos por preferencia (terrestre > no gaseoso > resto) y puebla los N primeros con
   vida 100 % + civilización confirmada. Sin rng adicional (no descuadra semillas).
5. Persistencia: `SaveGameGameStateSection.gateTuning?: GateTuningState | null` + captura/aplicación
   en el adaptador de snapshot + arnés. Campo opcional: sin bump de schema.
6. Aceptación: specs — count 3 genera exactamente 3 habitados confirmados; misma semilla con/sin
   count no cambia ids; tuning sobrevive save/load; sintonía de Grises sigue funcionando.

### S2 · Fichas, guiones y misión `exterminate`

1. `PlanetInhabitants.ARACNIDOS` + label "Tejedores arácnidos" (enum + LABELS).
2. `RaceDefinition += excludeFromPool?: boolean; shopAvailability?: 'ally' | 'neutral'`.
   `getPoolableRaces()` filtra también `excludeFromPool`. `getShopOffers`: hostil → nada;
   `shopAvailability 'neutral'` → disponible en neutral y ally.
3. Fichas en `race-catalog.config.ts`:
   - **MI_GO**: threatenedBy CTHULHU (rivales de Yog-Sothoth, cuya obra estudian), teachableGlyph
     QUIMIO_SIGILLUM, script `landing_missions_migo`, shop (ally): MISSILE + weapon_slot.
   - **ARACNIDOS**: excludeFromPool, shopAvailability 'neutral', script
     `landing_missions_aracnidos`, shop: DRONE_MINE + weapon_slot.
   - **YIG**: excludeFromPool, script `landing_missions_yig` (teaser sin misión).
4. Guiones (`src/app/assets/narrative/landing/`): `landing_missions_migo.json` (rico: historia de la
   secta/Yog-Sothoth/Cthulhu/burbujas + encargo), `landing_missions_aracnidos.json` (elusivo +
   contramisión), `landing_missions_yig.json` (teaser). Registro en `dialogue-script.service.ts`.
5. Tipos de guion (`dialogue.types.ts`): `missionType += 'exterminate' | 'none'`;
   `meta.exterminateTarget?: { race; planets; stations }`; `meta.grantGlyphOnAccept?: string`;
   `meta.postMissionTune?: { race; label; text }`.
6. Misiones: `PlanetMissionType += 'exterminate'`; `PlanetMissionState.exterminationTarget?:
   { race: string; planetsRequired; stationsRequired; planetsDestroyed; stationsDestroyed }`.
   `MissionService`: offer con target; objetivo/summary propio; guard en
   `applyAutoStatusTransitions` (exterminate solo se completa via evento);
   `registerExterminationEvent(race, kind: 'planet'|'station')` incrementa y al llegar a los
   requeridos marca `ready-to-turn-in` (patrón `registerHuntKill`).
7. `DialogueService`: acepta 'exterminate' (pasa target); tipo 'none' no ofrece encargo;
   `grantGlyphOnAccept` aprende el glifo al aceptar (VOID_KINESIS de los Mi-Go); tras misión
   completada, `postMissionTune` añade la opción de sintonizar hacia la raza indicada
   (`{guaranteedInhabitants: YIG}`); si el standing con la raza es `hostile`, la conversación se
   abre cerrada con una línea de rechazo.
8. Al aceptar la misión Mi-Go: `applyRaceUpgrade(MI_GO)` (S0.4) + sintonía
   `{guaranteedInhabitants: ARACNIDOS, guaranteedInhabitedCount: 3, stationTheme: 'aracnida'}`.
9. Aceptación: conversación Mi-Go completa; aceptar instala dispositivo+VOID_KINESIS y sintoniza;
   arácnidos elusivos con tienda en neutral; contramisión ofertada; Yig teaser inerte.

### S3 · Estaciones telaraña + sistema arácnido

1. **Nuevo** `game-objects/stations/aracnid-web-station.ts` (≤400): extiende `SpaceStation`;
   geometría tela de araña (radios + anillos concéntricos + saco central), radio ~220,
   `healthMax = healthCurrent = 1000` (destruible), sin puertos, glow violeta del saco
   (`getMotorGlowsLocal`), collider estructurado mínimo (esfera central).
2. **Nuevo** `game/services/state/aracnid-station-system.ts` (~250) + spec: flat + host. Activo si
   `snapshot.meta.stationTheme === 'aracnida'`. Spawnea las 2 estaciones en posiciones
   deterministas (semilla = systemTag, `seeded-random`), omitiendo las ya destruidas
   (storyFlag `aracnid-station-down:<systemTag>:<n>`). Spin lento. Expone renderables/targets.
3. Motor (via bridge, sin engordar): update por frame; blancos de armas (`getLooseTargets` +=
   estaciones vivas); targeting STATION; render por el camino de la estación humana.
4. Destrucción: `destroyObject` detecta estación arácnida → sistema marca storyFlag, debris,
   +150 XP, `registerExterminationEvent('ARACNIDOS','station')`, hostilidad (S4) y marquee.
5. Aceptación: sistema arácnido muestra 2 telarañas; se destruyen a tiros; persisten destruidas
   tras save/load y al volver por el portal; contador de misión avanza.

### S4 · Cazas arácnidos + hostilidad

1. `LesserBeingBase += public readonly externallyPiloted: boolean = false`;
   `registerLesserBeing` salta el controller cuando es true. `fireAcidSpit` acepta
   `LesserBeingBase`.
2. **Nuevo** `game-objects/lesser-beings/aracnid-fighter-being.ts`: 60 HP, maxSpeed 70, giro alto,
   aguijonazos (proyectil 260 u/s, daño 8→3, alcance 600), visual estilo araña del vacío
   (descriptor sobre el estilo existente: 8 tentáculos cortos oscuros + 4 ojos rojos + halo
   violeta), `externallyPiloted = true`.
3. **Nuevo** `game/services/state/aracnid-fighter-system.ts` (~250) + spec: activo si sistema
   arácnido && hostilidad && estaciones vivas. Hasta 4 cazas; oleadas desde estaciones (~20 s);
   IA: perseguir nave, mantener 120–400 u, disparar en rango. Última estación caída → repliegue
   (despawn + marquee). Muerte de caza: recompensa estándar (+100 XP via flujo existente).
4. Hostilidad (`setRaceStanding('hostile')` + marquee):
   - ARACNIDOS: primer daño del jugador a estación/caza, o planeta arácnido destruido/drenado.
   - MI_GO: planeta Mi-Go destruido/drenado (además: misiones activas encargadas por MI_GO →
     `failMission`; y viceversa exacto para ARACNIDOS).
   - Regla general: destruir el planeta de CUALQUIER raza la vuelve hostil (Grises incluidos).
5. Aceptación: atacar una telaraña → hostiles + cazas salen y dañan; matarlos da XP; sin estaciones
   no salen más; standing hostil persiste; conversación rechazada en hostil.

### S5 · Destrucción de planetas: hook + Void Kinesis planetario

1. `GameEngine.notifyPlanetRemoved(planet, cause)`: consecuencias de raza (hostilidad S4.4,
   `registerExterminationEvent(race,'planet')`, marquees). Llamado desde el colapso del Gate Rite
   (punto único `gate-rite.animation.ts:423`) y desde el drenaje.
2. **Nuevo** `game/services/spells/planet-drain-beam.ts` (~180) + spec: canal ~20 s sobre el planeta
   seleccionado (<2500 u); encoge el planeta y transfiere void energy proporcional
   (`voidMassUnits` del planeta → depósito, clamp a `voidEnergyMax`); al consumar:
   `engine.consumePlanetByDrain(planet)` = splice + retarget + partículas + persistencia
   (`persistActiveSystemState`) + `notifyPlanetRemoved(planet,'void-drain')`.
3. Dispatch `SpellType.VOID_KINESIS`: target asteroide → haz actual; target planeta → drenaje.
   Render con `drawBeamQuad` (violeta, más grueso).
4. Aceptación: drenar un planeta lo hace desaparecer sin portal y llena energía; gate rite sobre
   planeta arácnido cuenta para la misión; 3 planetas + 2 estaciones → misión lista; entregar en
   cualquier planeta Mi-Go da +5 % memoria + VOID_COCOON + tienda ally + opción Yig.

### S6 · Documentación y wiki

- `docs/RAZAS.md`: fichas Mi-Go, Arácnidos (antagonista), gancho Yig; regla de hostilidad.
- `docs/HISTORIA.md`: §Yog-Sothoth (burbujas), §la secta como herramienta (Cthulhu/Tierra),
  §Mi-Go vs arácnidos, §Yig y el warp.
- `docs/ARQUITECTURA.md`: Fases 14 (vuelo por ratón) y 15 (Mi-Go/Arácnidos) + estado.
- Wiki: `spaceship` (vuelo por ratón, dispositivo), `game-rules` (hostilidad/exterminio),
  `solar-systems` (sistemas de guerra), `planets` (drenaje/destrucción).
- Este plan queda como registro; divergencias → actualizarlo.

## 3. Orden de ejecución

S1 → S2 → S0 → S3 → S4 → S5 → S6. Compilar + `test:headless` + bump de build por checkpoint;
deploy a producción al final (S3, S4 y S5 pueden desplegarse juntos).

## 4. Riesgos

- FPS: cazas y estaciones son HOT → early-return sin tema arácnido; cero allocs/frame.
- El estilo visual de los cazas reusa el pipeline de seres existente; si el descriptor no da el
  pego, iterar el descriptor, no el renderer.
- Drenaje de planeta toca colecciones vivas (targeting, misiones con target en ese planeta,
  aterrizaje activo): bloquear el drenaje del planeta donde estás aterrizado y del sistema humano
  (la Tierra partida no se drena, es el hogar).
- Conflicto de facciones: probar el camino traición (contramisión arácnida) — Mi-Go hostiles y su
  misión `failed`, sin estados zombis.
