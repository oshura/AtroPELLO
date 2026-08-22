# Plan Fases 12–13 — Armas del jugador · Conversación · Razas · Los Grises

> **ESTADO: PLAN COMPLETADO (build 76, 467 tests verdes).** S0, S1, S2, S3, S3b, S4, S5 y S6
> implementados. La documentación viva está en `docs/ARMAS.md` (Fase 12) y `docs/RAZAS.md` (Fase 13);
> el lore, en `docs/HISTORIA.md`. Este plan se conserva como registro de lo que se decidió y por qué.
>
> **Cambios sobre el plan original**, todos por indicación del usuario o por hallazgos al implementar:
> - Se retiró el **cuarto primigenio** (Cthugha): quedan tres y el arco no crece por ahí.
> - Los Grises NO viven en un sistema artesanal propio: habitan el sistema al que lleva el **primer
>   Gate Rite**, garantizado por `GenerationOptions.guaranteedInhabitants`. Más simple y sin duplicar
>   un generador entero.
> - S3b (migrar los haces de hechizo al `BeamRenderer`) dejó de ser opcional: era lo que devolvía el
>   presupuesto de líneas de `GameEngine` a números negativos.
>
> Redactado 2026-08-22 (build 74). Documento ejecutable: está pensado para que cualquier sesión
> (incluido un modelo distinto al que lo redactó) pueda implementarlo slice a slice SIN re-explorar
> el repositorio. Los números de línea son referencias de la fecha de redacción: si no cuadran,
> busca por el SÍMBOLO indicado (nombre de método/constante), nunca a ciegas.

---

## 0. Cómo seguir este plan (léelo entero antes de tocar código)

1. **Un slice por vez, en el orden del §4.** Cada slice termina con: `npm run build` verde,
   `ng test --watch=false --browsers=ChromeHeadless` verde, el smoke manual del slice, **+1 al
   `build` en `version-settings.ts`** (regla del proyecto) y anotación de estado en
   `docs/ARQUITECTURA.md` §8.
2. **Reglas duras innegociables** (CLAUDE.md): `GameEngine.ts` NO crece (solo delegadores de
   1-2 líneas; este plan lo REDUCE en neto); ficheros nuevos ≤400 líneas; sin `any` nuevos; sin
   `console.*` (usar `GameLogger` con `LogCategory`); campos persistentes SOLO via
   serializadores/códecs; `Math.random()` solo para FX sin estado.
3. **Sin migraciones de savegame**: todos los campos persistentes nuevos son OPCIONALES
   (`campo?: T | null`) con default al cargar. NO subir `SAVEGAME_SCHEMA_VERSION`.
4. Si un paso contradice lo que ves en el código real, PARA, anota la discrepancia en este
   documento y decide el mínimo cambio coherente; no improvises rediseños.
5. Patrón de clase de sistema (obligatorio para todo lo nuevo de gameplay): **clase plana sin
   Angular DI** con interfaz `XxxHost` mínima; el engine la instancia, cachea el host como campo
   y delega. Ejemplos canon: `src/app/game/services/spells/anchoring-pulse-beam.ts`,
   `docs/ARQUITECTURA.md` §5.3.

## 1. Contexto y decisiones cerradas

Hoy no existe ningún arma del jugador (`Spaceship.weapons: any[]` vacío, HUD "NO WEAPONS" fijo),
la conversación en planetas es una botonera incoherente y las razas son un enum aleatorio.
Objetivo: armas (proyectil + rayo continuo; 3 modos de apuntado), panel HUD con rotación,
conversación por diálogo real, framework de razas, y el primer contenido completo: los Grises.

**Decisiones del usuario (2026-08-21, vinculantes):**
- El vampiro de fuego se **reasigna de Cthugha → Yog-Sothoth**.
- "Módulo de vacío ×10" = **`voidEnergyMax` 100→1000** (combustible), no la bodega.
- Input: **click derecho = disparar (mantener)**; **R / Shift+R** = rotar arma; la rueda sigue
  siendo zoom de cámara.
- Los Grises viven en un **sistema solar artesanal propio** (receta R2, patrón
  `human-solar-system.service.ts`).

**Encaje**: dos fases nuevas en `docs/ARQUITECTURA.md` — Fase 12 (armas, doc `docs/ARMAS.md`) y
Fase 13 (razas/diálogo/misiones narrativas, doc `docs/RAZAS.md`).

## 2. Mapa de código verificado (la base de todo; no re-explorar)

| Qué | Dónde (símbolo) |
|---|---|
| Placeholder de armas a borrar | `Spaceship.weapons` (`Spaceship.ts:77-78`); consumidores: `getShipWeaponsCount` (`GameEngine.ts:801`) y `gameData.weapons` (`GameEngine.ts:10363`) |
| Panel HUD "NO WEAPONS" | bloque inline `HUDManager.renderToTexture()` líneas ~866-915; rect 182×140 en (28,52); `weaponsPanelRightEdge` ANCLA el HealthGauge (:764) y el ancho del medidor Void Energy (:796) |
| Contrato de elementos HUD | `HealthGauge`/`CargoGauge`: `update(data)` / `getDimensions()` / `render(ctx, pos)`; texto con `ctx.scale(1, 1.25)` para compensar el aplastado vertical del quad |
| Retícula con modo combate dormido | `flight-vector-reticle-builder.ts:44,53` — `mode: hasWeapons ? 'combat' : 'navigation'` |
| Pool de proyectiles ENEMIGO (molde) | `lesser-being-combat.service.ts` — `ProjectileInstance`, `update` (integra + `intersectsShip` esfera-esfera + `computeDamage` falloff near→far), `fireAcidSpit`/`spawnOrbBurst`/`triggerAuraPulse`, `getActiveProjectiles()` → `LesserBeingRenderer.renderProjectiles` (:116-141) |
| Patrón beam oficial | `anchoring-pulse-beam.ts` / `void-kinesis-beam.ts` / `disruption-beam.ts`: `{isActive, renderState, start(host,…), update(host,dt)}` + `XxxBeamHost`. Render GL en `GameEngine.renderDisruptionBeam` etc. (:8542-8837). DEFECTOS conocidos: perpendicular fija en XY `right={-dy,dx,0}` (:8572, degenera en haces verticales) y VBOs creados+borrados POR FRAME |
| Targeting v2 | `AdaptiveTargetingIntegrator`: `getCurrentTarget` (:227), `cycleTarget` (T/Shift+T, :368). `ITargetable` tiene `healthCurrent/healthMax`. `TargetDetector.screenToWorldRay(screenPos)` (:503, privado → exponer) |
| Daño y recompensa (reactivo, gratis) | `applyDamageToObject` (`GameEngine.ts:5580`) → setter `healthCurrent` → `destroyObject` (:5701) → `rewardLesserBeingKill` (:5861, +100 XP + marquee) |
| Loot físico de kill (molde) | `SpaceTurtleSystem.notifyDestroyed` (`space-turtle-system.ts:54-70`) → `CargoManifestEntry` ARTIFACT en bodega |
| Vampiro de fuego | `RiftVampireBeing` (`rift-vampire-being.ts`): 100 HP, aura radial 1000u cd 10 s dmg 10→1, INCORPÓREO (excluido de colisión física nave↔ser en `ship-collision-system.ts:133-135`) |
| Input teclado | `key-bindings.service.ts` (`GameAction` :3-15, `DEFAULT_BINDINGS` :21-50; `r` LIBRE) → `game-input.service.ts` (`GameInputHandler`; patrón de intercepción `target_next/prev` :92-99) → `GameEngine.handleKeyDown` |
| Input ratón | `panel-event-coordinator.service.ts`: `handlePointerDown/Up` (:156-204) **no tienen rama sin-panel** (fall-through); `handleContextMenu` (:206-212) NO previene en vuelo. Verificado 2026-08-22 |
| Bloqueo de gameplay | `GameEngine.areSpellGameplayInputsLocked()` (:8097 aprox) — respetarlo en disparo y rotación |
| 13 JSON de diálogo MUERTOS | `src/app/assets/narrative/landing/landing_missions_<race>.json` (mi_go, yig, leng, organismo_vegetal, angeles_descarnados, profundos, antiguos, dohle, chthonian, gules, ghasts, vampiro_estelar, byhkee) con formato `offer.scene+options[] / clues{minor,major,final} / turnIn{success,memoryFragment}`; cero imports. `PlanetMissionState.dialogueScriptId` declarado sin consumidores |
| Misiones | `mission.service.ts` (~741): `offerMission`/`acceptMission`/clues/`completeMission` con `requiredCargoEntryId` + `handleCargoRegistered`. HUECOS: `applyMissionReward` (:417-438) NUNCA consume `reward.uniqueGlyphId` (TODO en :433); `targetLocation.systemId` siempre `'current-system'` (:442, :489); `promotePlanetToAlly` (:700-712) promociona el planeta TARGET, no el de la raza |
| Landing actual | `landing-panel.ts` (viewMode overview/actions/diplomacy; `canOpenDiplomacyPanel` :97 exige civilización), `landing-menu.ts` (`ensureMissionSeeded` :715-749 = auto-siembra A BORRAR), `landing-action.service.ts` (`handleAllyWisdom` :404-454 promete glifos sin `learnSpell`), `landing-diplomacy.config.ts` (en `src/app/game/config/`) |
| Sistema por primigenio | `SolarSystemMeta.elderGod` persiste ya (`solar-system.types.ts:104`); `pickElderGod` en `system-generator.service.ts` (:36-43, escrito en :456); `GameEngine.getCurrentSystemElderGod` (:11798). Sin UI que lo muestre. `SolarSystemMeta` tiene index signature (campos nuevos baratos) |
| Hook del Gate Rite (VERIFICADO) | `gate-rite.animation.ts` :757-811: construye `genOptions`, tira `archiveRoll ≤ 0.10` para reutilizar sistema archivado (esa rama ya usa `solarSvc.createPairedPortal`), si no `generateWithLinkedPortal(originPortal, Date.now(), genOptions)`. El tuning se inserta ANTES del archiveRoll |
| Bug Speed Rite (mecanismo real) | (a) `ShipDynamicsScope.capture/restore` (`animation-tools.ts:124-157`) restaura `maxSpeed` capturado DUPLICADO si el rito expiró durante la cinemática; (b) `player-state.serializer.ts` `captureShipState()` (:74) persiste `maxSpeed` bufado; `speedRiteUntilMs` no se persiste. Expiración del rito en `GameEngine.update()` :4714-4737; `applySpeedRite` :9852-9876 |
| Persistencia (recetas) | Campo jugador: tipo en `save-game.types.ts` + 1 línea captura + 1 aplicación en `player-state.serializer.ts`. Colección gameplay: `SaveGameGameStateSection` + `game-state.snapshot-adapter.ts`. Arnés: `savegame-harness.ts` (fixture ~:560-601) + `savegame-normalizer.ts` + spec round-trip. `speed`/`voidEnergy` YA persisten (`SaveGameShipState` :71-91) |
| Toberas | `buildVastago()` (`ship-geometry.ts:139-189`): elipsoides `ellip(0.15,0.15,0.09)` material EXHAUST, `dyn:'exhaust'`, hinge `sc([∓0.42,-0.12,-1.2])` (:177-179). `ShipRenderer` (:96-159) anima CUALQUIER parte `'exhaust'` genéricamente (escala por velocidad + color por estado). La geometría se construye UNA vez |
| Velocidad actual | `Spaceship.ts:25-28`: `maxSpeed 20 / acceleration 2.0 / deceleration 2.5`. Smoothing alta velocidad ya existe (activo si speed > max(80, maxSpeed·0.8)) |
| Hechizos | `SpellType.SPEED` = "double speed" (Speed Rite). `GameStateStore.learnSpell/knownSpells` (:200, :1346). Grimorio inicial: solo GATE_RITE |
| Seres menores ↔ dioses | `cosmic-life.types.ts`: `LESSER_BEING_PATRONS` (:68-73, VAMPIRO_FUEGO→CTHUGHA a cambiar), `ELDER_GOD_SUMMONS` (:33-38). NO confundir raza `VAMPIRO_ESTELAR` con ser `VAMPIRO_FUEGO` |
| Otros bugs conocidos | `stationSearchDone` (`game-state.store.ts:202`) NO se persiste (+5% memoria repetible tras cargar). Raza de planeta asignada con `Math.random()` (`Planet.ts:100`, `human-solar-system.service.ts:190`) — viola determinismo §4.2.6 |

---## 3. Slices

### S0 · SpeedRiteSystem + fix del bug de velocidad duplicada (esfuerzo 0.5; PRIMERO)

Motivo: la recompensa de los Grises es el glifo SPEED; el bug pasa de latente a garantizado.

Pasos:
1. Crear `src/app/game/services/state/speed-rite-system.ts` (~150 líneas) + `.spec.ts`. Clase
   plana con estado `untilMs: number | null` y los valores base capturados. API:
   `apply(ship, durationMs)`, `isActive(now)`, `updateExpiry(ship, now): boolean` (restaura base y
   devuelve true si acaba de expirar), `remainingSec(now)`, `sanitize(ship)` (clampa
   max/accel/decel a los valores base si el rito NO está activo pero la nave lleva el doble).
   Host mínimo: `{ getBaselineMax(): number; onExpired(): void }` donde `onExpired` llama
   `refreshShipDynamicsBaseline(true)` del engine.
2. Mover VERBATIM al sistema (y dejar delegadores de 1 línea en el engine): `applySpeedRite`
   (:9852-9876), el bloque de expiración del `update()` (:4714-4737), `isSpeedRiteActive`
   (:9817), `triggerSpeedRiteInstantly` (:9879). Ojo al ORDEN en `update()`: la expiración debe
   correr ANTES de `refreshShipDynamicsBaseline` (hoy en el frame de expiración la baseline
   absorbe el doble).
3. Fix cinemáticas: tras CADA `ShipDynamicsScope.restore(ship)` de las animaciones de aterrizaje
   /despegue/void-jump, el engine llama `speedRiteSystem.sanitize(ship)`. (Alternativa
   equivalente: parámetro opcional `restore(ship, sanitizer?)`.)
4. Fix savegame: en `captureShipState()` persistir la velocidad BASE pre-rito (el engine ya
   conoce la baseline), no `spaceship.maxSpeed` a pelo. `speedRiteUntilMs` NO se persiste
   (decisión: el buff se pierde al guardar).

Aceptación: specs (aplicar→expirar restaura; expirar durante scope+restore no duplica; save con
rito activo guarda base); smoke: activar Speed Rite, aterrizar, dejar expirar, despegar →
maxSpeed 20. Engine ≈ −60 líneas.

### S1 · Núcleo de armas (3)

1. **Tipos** — crear `src/app/game/types/weapon.types.ts` (~160):
```ts
export enum WeaponKind { PROJECTILE = 'PROJECTILE', BEAM = 'BEAM' }
export enum WeaponAimMode { FIXED = 'FIXED', MOUSE_GUIDED = 'MOUSE_GUIDED', TARGET_LOCKED = 'TARGET_LOCKED' }
export type WeaponId = 'GAUSS_ICE' | 'VULCAN' | 'LASER' | 'PHASER' | 'PLASMA' | 'MISSILE'
                     | 'DRONE_MINE' | 'VOID_RAY' | 'TRACTOR_RAY';
export interface WeaponProjectileSpec { speed: number; radius: number; lifeSec: number;
  homingTurnRateRad?: number; guidanceSec?: number; lockRadius?: number; blastRadius?: number; }
export interface WeaponBeamSpec { dps: number; maxDurationMs?: number; widthU: number;
  color: [number, number, number]; }
export interface WeaponDefinition {
  id: WeaponId; label: string; kind: WeaponKind; aimMode: WeaponAimMode;
  rangeU: number; cooldownMs: number; damage: number;          // por impacto (PROJECTILE)
  projectile?: WeaponProjectileSpec; beam?: WeaponBeamSpec;
  ammo?: { max: number; perShot: number } | null;              // null ⇒ consume voidEnergy
  voidEnergyCostPerShot?: number;
  visual: { color: [number, number, number]; trail: boolean; glowScale: number };
  hardpointStyle: 'gun' | 'pod' | 'emitter';
}
export interface InstalledWeaponState { weaponId: WeaponId; slotIndex: number; ammoCurrent?: number; }
export interface ShipOutfitState { engineTier: number; weaponSlots: number;
  weapons: InstalledWeaponState[]; selectedWeaponIndex: number; }
```
2. **Catálogo** — crear `src/app/game/config/weapon-catalog.config.ts`:
   `WEAPON_CATALOG: Partial<Record<WeaponId, WeaponDefinition>>` + `getWeaponDefinition(id)`.
   En S1 solo GAUSS_ICE: `{ kind: PROJECTILE, aimMode: FIXED, rangeU: 3000, cooldownMs: 450,
   damage: 34, projectile: { speed: 1200, radius: 1.2, lifeSec: 2.5 }, ammo: null,
   voidEnergyCostPerShot: 1, visual: { color: [0.7,0.9,1], trail: true, glowScale: 1 },
   hardpointStyle: 'gun' }` (3 impactos matan al vampiro de 100 HP). Regla: arma nueva = 1
   entrada aquí + sfx + icono; CERO motor.
3. **WeaponSystem** — crear `src/app/game/services/weapons/weapon-system.ts` (~350) + spec.
   Clase plana; estado: `outfit: ShipOutfitState`, `cooldownUntil: number[]`, `triggerHeld`.
   Host: `{ getShip(): Spaceship | null; getShipForward(): {x,y,z};
   getSelectedTarget(): ITargetable | null; getMouseWorldRay(): {origin;direction} | null;
   getMuzzleTransform(slot): {position; direction}; consumeVoidEnergy(u): boolean;
   spawnProjectile(spec): void; startBeam(def): void; stopBeam(): void;
   emitHudWarning(msg): void; playSfx(name): void; logInfo(...); }`.
   API: `installWeapon(id, slot?)`, `uninstall(slot)`, `cycle(prev: boolean)`,
   `getSelectedDefinition()`, `setTriggerHeld(b)`, `update(host, nowMs, dt)`,
   `buildHudSnapshot()`, `getState()/applyState(s)`, `get installedCount`.
   En `update`: si trigger + cooldown vencido + energía/ammo → despacho por aimMode (S1: solo
   FIXED = dispara desde la boca del hardpoint en la dirección forward de la nave, que es lo que
   marca la retícula de vector de vuelo). TARGET_LOCKED sin target → `emitHudWarning('SIN
   TARGET')`. HOT PATH: cero allocs por frame (reutilizar objetos spec).
4. **ProjectileSystem** — crear `src/app/game/services/weapons/projectile-system.ts` (~300) +
   spec. Generaliza el pool enemigo: `FactionProjectile { id, faction: 'player'|'enemy',
   kind: string, position, velocity, remainingLife, maxLife, damageNear, damageFar, falloffRange,
   radius, sourceId, homing?: { mode: 'target'|'mouse'; targetId?: string;
   turnRateRad: number; lockRadius?: number } }`.
   - Colisión con **swept-sphere** (segmento p0→p1 del frame vs esfera del candidato): a
     1200 u/s × 16 ms el paso son ~19 u > radios típicos; el test por punto haría tunneling.
     Helper puro `sweptSphereHit(p0, p1, center, radius): boolean` en
     `src/app/game/math/vector-math.ts` (crear si no existe ahí; con spec).
   - Candidatos facción player: lesser beings activos (el vampiro incorpóreo SÍ — su exclusión
     de `ship-collision-system.ts:133` es solo nave↔ser), tortuga espacial, asteroides
     targeteables. NO planetas/sol (los proyectiles expiran por `lifeSec`). Facción enemy:
     la nave (lógica actual del combat service).
   - Impacto player: `host.applyWeaponDamage(target, damage)` → delegador público nuevo del
     engine (2 líneas) hacia `applyDamageToObject`. La destrucción/recompensa ya es reactiva.
   - **Migración**: `LesserBeingCombatService` CONSERVA su API pública pero pasa a insertar en
     este pool (facción enemy); `getActiveProjectiles()` delega en
     `projectileSystem.getViews('enemy')` para que `LesserBeingRenderer.renderProjectiles` no
     cambie ni una línea.
5. **Render** — crear `src/app/game/rendering/weapons/weapon-projectile-renderer.ts` (~250):
   copiar el patrón billboard+glow aditivo de `LesserBeingRenderer.renderProjectiles`; shard
   alargado orientado por velocidad + estela; consume `getViews('player')`. El engine añade UNA
   llamada junto al render de proyectiles enemigos.
6. **Hardpoints visuales** — editar `ship-geometry.ts`: `buildVastago(config?: {
   engineTier: number; hardpoints: Array<{ style: 'gun'|'pod'|'emitter' }> })`; exportar
   `WEAPON_HARDPOINT_ANCHORS: [number,number,number][]` = 2 anclas bajo las alas (escala S=0.7,
   +Z adelante; propuesta: `[∓0.85, -0.10, 0.15]`); por hardpoint ocupado añadir cañón
   `cyl(0.06, 0.7)` oscuro + acento emisivo. Si el fichero roza 400 líneas, extraer
   `ship-hardpoint-geometry.ts`. Editar `ShipRenderer`: método `rebuild(config)` que regenera
   VAOs (frío: solo al instalar arma / upgrade). Editar `Spaceship.ts`: añadir
   `transformLocalPoint/transformLocalDirection` copiados de `LesserBeingBase` (:410-433);
   el host del engine calcula `getMuzzleTransform(slot)` con `WEAPON_HARDPOINT_ANCHORS[slot]`.
7. **Input teclado** — `key-bindings.service.ts`: `GameAction += 'weapon_next' | 'weapon_prev'`;
   `DEFAULT_BINDINGS: weapon_next: 'r', weapon_prev: 'shift+r'` (`r` está libre; el comentario
   "R = roll" en Spaceship.ts es stale, el roll real es Q/E). `game-input.service.ts`:
   interceptar igual que `target_next/prev` (:92-99) → `gameEngine.cycleWeapon(prev: boolean)`
   (delegador tipado 1 línea). Añadir los bindings al diálogo de controles
   (`controls-dialog`) y a `documentation/Input_Bindings.md`.
8. **Input ratón** — `panel-event-coordinator.service.ts`: nuevos callbacks opcionales
   `onFlightPointerDown?(button: number)`, `onFlightPointerUp?(button: number)`,
   `onFlightContextMenu?(): boolean`. En `handlePointerDown/Up`, tras las ramas map/grimoire
   (fall-through actual), si no hay panel activo → invocar el callback; si `button === 2`,
   `preventDefault+stopPropagation`. En `handleContextMenu`, prevenir TAMBIÉN cuando no hay panel
   y `onFlightContextMenu?.()` devuelve true. El engine registra: botón 2 down →
   `weaponSystem.setTriggerHeld(true)` (si `!areSpellGameplayInputsLocked()`), up → `false`.
   La rueda NO se toca (sigue zoom).
9. **Persistencia (opción B, dedicada — decidida)** — `save-game.types.ts`:
   `SaveGameShipState.outfit?: ShipOutfitState | null`. `game-state.store.ts`: SSOT runtime
   `shipOutfit` + `getShipOutfit()/setShipOutfit()` (el WeaponSystem sincroniza aquí; regla dura
   4). `player-state.serializer.ts`: 1 línea de captura + 1 de aplicación.
   `savegame-harness.ts` (fixture ~:560-601) + `savegame-normalizer.ts` + spec round-trip.
   Por qué NO `equipmentLoadout`: `EquipmentSlotState` es cosmético (label/rarity/strings), el
   enum de slots es cerrado, y ammo/selectedIndex/slots comprables no caben sin stringly-typing.
10. **Limpieza y prueba** — BORRAR `Spaceship.weapons`; `getShipWeaponsCount` →
    `weaponSystem.installedCount` (esto despierta la retícula roja de combate);
    `gameData.weapons` → snapshot del S2 (mientras llega S2, pasar `null` tipado). Tool god-mode
    "instalar GAUSS_ICE" en `debug-stats-overlay.service.ts`. Añadir `sfx_gauss_fire` a
    `src/app/assets/audio/_manifest.json` (puede reutilizar un wav existente como placeholder).

Aceptación S1: specs de weapon-system (cooldown/cycle/energía/FIXED con host stub),
projectile-system (integración, swept-sphere, falloff, facciones), vector-math, round-trip
outfit. Smoke: instalar gauss por debug → click derecho dispara sin abrir menú contextual →
proyectiles visibles → matan un ser menor (marquee +100 XP) → retícula roja → save/load
conserva el arma → rueda sigue haciendo zoom.

### S2 · WeaponsPanel del HUD (1)

1. Crear `src/app/game/hud/elements/WeaponsPanel.ts` (~180) + spec, con el contrato de
   elementos (`update/getDimensions/render`). `getDimensions()` devuelve **exactamente
   {width: 182, height: 140}** (es ancla de layout del HealthGauge y del medidor Void Energy).
2. Snapshot tipado (lo construye `WeaponSystem.buildHudSnapshot()`, puro y con spec):
```ts
export interface WeaponsHudSnapshot {
  entries: Array<{ label: string; kind: WeaponKind; selected: boolean;
                   cooldownPct: number; ammoLabel: string | null }>;
  slotsMax: number;
}
```
3. Render: sin armas → "NO WEAPONS" (como hoy); con armas → hasta 5 filas: icono simple por
   `kind` (triángulo = proyectil, onda = beam), nombre en verde fósforo con `ctx.scale(1,1.25)`,
   fila seleccionada con marco **cian `#00c5ff`** (patrón grimorio), barra fina de cooldown,
   ammo ("12/40" | "∞"), hint "R" al pie. Fondo `rgba(0,64,32,0.35)` + borde
   `rgba(0,255,0,0.9)` (los actuales).
4. `HUDManager.ts`: sustituir el bloque :866-915 por
   `this.weaponsPanel.update(...); this.weaponsPanel.render(ctx, {x: weaponsPanelX, y: weaponsPanelY})`;
   `weaponsPanelRightEdge` deriva de `getDimensions()`. ELIMINAR `(this as any)._weaponsHUD`
   (:245) y tipar `gameData.weapons: WeaponsHudSnapshot | null` en `renderHUDPlane`.

Aceptación: spec del builder (selección/cooldownPct/ammoLabel/orden); HUDManager −50 líneas;
smoke: en cabina el panel lista el gauss, R mueve el cian, el cooldown pulsa al disparar,
HealthGauge y Void Energy NO se han movido.

### S3 · Beams + misil + minas-drone (2.5; tras S1; NO bloquea S6)

1. Crear `src/app/game/services/weapons/weapon-beam.ts` (~200) + spec (patrón §5.3): cada frame,
   origen = boca del hardpoint, dirección = forward (FIXED); raycast esfera contra candidatos
   dentro de `rangeU` con helper puro `raySphereHit(origin, dir, center, radius): number | null`
   en `vector-math.ts` (el `raySphere` del engine es privado: NO tocarlo); el primer impacto
   recibe `dps * dt` via `host.applyWeaponDamage`; coste de voidEnergy por segundo;
   `maxDurationMs` opcional.
2. Crear `src/app/game/rendering/weapons/beam-renderer.ts` (~220): quad TRIANGLE_STRIP aditivo
   como los beams de hechizo pero con DOS fixes: perpendicular =
   `normalize(cross(beamDir, camForward))` con fallback `cross(beamDir, camUp)` si casi
   paralelos; VBOs creados UNA vez y `bufferSubData` por frame. Parametrizado por
   color/anchura/pulso de `WeaponBeamSpec`.
3. MISSILE (TARGET_LOCKED): entrada de catálogo con `projectile.homingTurnRateRad` y
   `blastRadius`; al disparar exige `host.getSelectedTarget()` dentro de `rangeU`; el
   ProjectileSystem re-resuelve el target por id cada frame (host `resolveTargetById`), steering
   proporcional limitado por turnRate; target muerto → sigue recto hasta expirar; impacto con
   falloff por `blastRadius`.
4. DRONE_MINE (MOUSE_GUIDED): exponer `getMouseWorldRay()` público en
   `AdaptiveTargetingIntegrator` (wrapper de `TargetDetector.screenToWorldRay` con la
   mousePosition que ya actualiza). Comportamiento (rama `homing.mode:'mouse'`): dron lento
   (~60 u/s, vida `guidanceSec ≈ 8 s`); punto-guía = `ray.origin + ray.direction * d` con
   `d = distancia actual dron↔nave` (clamp a rangeU); giro con turnRate alto hacia el punto-guía
   (el jugador "pasea" la mina con el cursor); si un hostil queda a < `lockRadius` (~50u) →
   lock permanente y persecución; detonación por proximidad (~6u) con blastRadius; expirar sin
   lock → detonación inofensiva (solo FX). HUD: snapshot marca "GUIADO xN" si hay drones vivos.
5. **S3b opcional (1)**: migrar los 3 renders de beams de hechizo del engine al `BeamRenderer`
   (engine −300 líneas; el fix de billboard aplica también a hechizos).

Aceptación: specs (dps por tick al candidato más cercano; homing gira ≤ turnRate; drone persigue
punto-guía y lockea por cercanía). Smoke: beam visible con haz vertical (bugfix), tractor/void
ray de hechizo intactos, misil con target de T, mina guiada hasta un ser con el ratón.

### S4 · Rediseño de conversación (3; independiente de S1-S3)

1. Crear `src/app/game/types/dialogue.types.ts` — espejo EXACTO del JSON existente (validar
   contra `landing_missions_mi_go.json` antes de escribir):
```ts
export interface RaceMissionScript {
  meta: { race: string; memoryShare: number; missionType: 'artifact'|'material'|'hunt';
          artifactName?: string; targetHint?: string; uniqueGlyphId?: string };
  offer: { scene: string; options: Array<{ id: string; label: string; text: string }> };
  clues: { minor: { cost: string; text: string };
           major: { subTask: string; success: string; failure: string };
           final: { cost: string; text: string } };
  turnIn: { success: string; memoryFragment: string };
}
```
2. Crear `src/app/services/game/dialogue-script.service.ts` (~120): imports estáticos de los 13
   JSON (patrón `landing-narrative.service.ts`) + `getMissionScript(race): RaceMissionScript |
   null`. `dialogueScriptId = 'landing_missions_<race>'` por fin se escribe Y se lee.
3. Crear `src/app/services/game/dialogue.service.ts` (~250) + spec. Sesión efímera (NO se
   persiste; lo persistente es la misión): `startOffer(planet, script)` →
   `DialogueSessionState { log: linea[], options: opcion[], phase: 'offer'|'turnIn' }`.
   Opciones = las preguntas del JSON (añaden su `text` al log SIN agotarse) + acción "Aceptar el
   encargo" (→ `missionService.offerMission(planet, {...reward: {memorySharePct:
   meta.memoryShare, uniqueGlyphId: meta.uniqueGlyphId}, originPlanetId})` + `acceptMission`) +
   **"Terminar conversación" SIEMPRE visible** (requisito del usuario, Promptos.txt:57).
   `startTurnIn(mission, script)`: si `ready-to-turn-in` → "Entregar" → `completeMission` →
   muestra `turnIn.success` + `turnIn.memoryFragment`.
4. Crear `src/app/components/dialogue-overlay/` (ts/html/css) — overlay 2D transparente sobre el
   viewport (Planet-9.txt L3), patrón de componente del landing-panel: emblema de la raza, log
   narrado acumulado con auto-scroll, botonera de opciones, botón fijo "Terminar". Zoneless:
   recuerda `cdr.detectChanges()` tras setState async (regla del proyecto).
5. Fixes de sinsentidos (todos):
   a. BORRAR `ensureMissionSeeded` (`landing-menu.ts:715-749`) y su llamada en `ngOnChanges`;
      el bloque de misión muestra estado + botón "Conversar" que abre el overlay (offer si no
      hay misión; turn-in si está lista).
   b. "Confrontar" alcanzable sin civilización: en `landing-panel.ts`, condición propia
      `canConfront = !!planet.lesserBeing && planet.creatureScanned`, visible en la vista
      *actions* aunque `inhabitants === NONE`. `handleEnemyConfrontation` no cambia.
   c. `handleAllyWisdom` (`landing-action.service.ts:404-454`): si
      `getRaceDefinition(race)?.teachableGlyph` existe y no se conoce →
      `gameState.learnSpell(glyph)` + texto de glifo real; si no → camino actual de memoria.
      Eliminar el premio fantasma "Glifo coralino" o convertirlo en `type:'spell'` real.
   d. `itemsAwarded` deja de ser decorativo: `type:'cargo'` → `gameState.upsertCargoEntry`;
      `type:'spell'` → `learnSpell`; `type:'memory'` documenta que ya aplica delta.
   e. `MissionService.applyMissionReward`: consumir `reward.uniqueGlyphId` → si es `SpellType`
      válido → `learnSpell` + marquee "Glifo aprendido: <label>" (borra el TODO de :433).
   f. `PlanetMissionState.originPlanetId?: string` (viaja gratis: `missions` se serializa
      entero); `promotePlanetToAlly` promociona el planeta ORIGEN (la raza que dio la misión),
      no el target.
   g. `HudMarqueeEventType.MISSION` en `hud.types.ts` + emisión en offer/ready/complete.
6. SE CONSERVA (no reescribir): `landing-panel` (3 vistas), `landing-action.service`
   (bribe/subtask/vision siguen como botones de diplomacia; unificarlos en el diálogo = mejora
   futura), `landing-diplomacy.config.ts` (fallback para razas sin JSON),
   `landing-narrative.service`.

Aceptación: specs (offer→accept crea misión con reward y originPlanetId; terminar no crea nada;
turn-in completa; applyMissionReward aprende glifo). Smoke: Marte → diplomacia SIN misión
auto-sembrada → conversar, preguntar 2-3 opciones, aceptar → marquee MISSION; en un planeta con
ser menor y sin civilización, "Confrontar" es accesible; rest/explore siguen funcionando.

### S5 · Framework de razas (2; tras S4)

1. Crear `src/app/game/types/race.types.ts`:
```ts
export interface RaceShopOffer { id: string; label: string; description: string;
  cost: Partial<PlanetResourceStock>;
  effect: 'weapon_slot' | 'engine_tier' | 'weapon'; weaponId?: WeaponId; }
export interface RaceDefinition {
  id: PlanetInhabitants; label: string; description: string;
  threatenedBy?: ElderGod; defaultAttitude: GameObjectAnimosity;
  dialogueScriptId: string; teachableGlyph?: SpellType;
  weaponsForSale?: WeaponId[]; shop?: RaceShopOffer[];
  homeSystemId?: string;
  isAcolyte?: boolean; acolyteOf?: ElderGod;  // hueco tipado; spawn por eventos = fase futura
}
```
2. Crear `src/app/game/config/race-catalog.config.ts` — `RACE_CATALOG` +
   `getRaceDefinition(race)`. Se puebla raza a raza bajo dirección del usuario (S6 mete GRISES).
3. Persistencia narrativa — `SaveGameGameStateSection.narrative?: { raceReputation:
   Partial<Record<PlanetInhabitants, { standing: 'hostile'|'neutral'|'ally';
   missionsCompleted: number }>>; storyFlags: string[]; gateRiteCount: number;
   gateTuning: GateTuningState | null }`. SSOT en `GameStateStore`
   (`getRaceReputation/setRaceStanding/addStoryFlag/hasStoryFlag/getGateTuning/...`); captura y
   aplicación en `game-state.snapshot-adapter.ts` (patrón `missions`, 2 líneas); arnés +
   normalizer + spec round-trip. `completeMission` sube reputación de la raza de
   `originPlanetId`. **Migrar `stationSearchDone` a `storyFlags`** (arregla el +5% repetible).
4. Dominación visible — `meta.elderGodRevealed?: boolean` (index signature de `SolarSystemMeta`,
   persiste gratis). `SolarSystemPanel`: cabecera "DOMINIO: <PRIMIGENIO>" si revelado; marquee
   SYSTEM al entrar en un sistema revelado.
5. `GenerationOptions.forcedElderGod?: ElderGod` (`solar-system.types.ts:172-189`) y en
   `system-generator.service.ts` (~:99): `const elderGod = options?.forcedElderGod ??
   pickElderGod(rnd);`.
6. Crear `src/app/game/services/game/gate-tuning.service.ts` (~120):
   `GateTuningState = { kind: 'handcrafted'; systemId: string } | { kind: 'procedural';
   forcedElderGod: ElderGod }`; `peek()/consume()` de un solo uso; persistido en
   `narrative.gateTuning`. + `HandcraftedSystemsRegistry` (mapa id→factory de snapshot;
   registra 'human-system' y 'greys-system').
   **Hook en `gate-rite.animation.ts`** (punto verificado: dentro del bloque que construye
   `genOptions` y tira `archiveRoll`, ~:768-810): ANTES del archiveRoll, si hay tuning →
   (a) `kind:'handcrafted'` → obtener snapshot del registry + `solarSvc.createPairedPortal(
   originPortal, …)` + concatenar el portal (MISMO camino que la rama archivada :785-795);
   (b) `kind:'procedural'` → `genOptions.forcedElderGod = tuning.forcedElderGod` y, en el
   snapshot resultante, `meta.elderGodRevealed = true`. `consume()` al usarlo;
   `gateRiteCount++` al completar cualquier rito. Cambio total ≈ 10-15 líneas en un único punto.
7. Determinismo — crear `src/app/game/utils/seeded-random.ts` (+spec) extrayendo
   `hashSeed/mulberry32` de `system-generator.service.ts` (:17, :98; el generador pasa a
   importarlos de aquí) + `pickSeeded<T>(pool: T[], seedString: string): T`. Sustituir
   `Math.random()` de asignación de raza en `Planet.ts` (`assignInhabitantsFromProbability`,
   semilla = `planet.id`) y `human-solar-system.service.ts` (`pickRandomCivilization`, semilla
   fija del id de Marte).
8. Reasignación de patrón — `cosmic-life.types.ts`: `LESSER_BEING_PATRONS[VAMPIRO_FUEGO] =
   ElderGod.YOG_SOTHOTH`; quitar el vampiro de `ELDER_GOD_SUMMONS[CTHUGHA]` (Yog ya lo tiene).

Aceptación: specs (seeded-random estable; generator respeta forcedElderGod; gate-tuning
consume-once; reputación round-trip). Smoke: recargar → Marte tiene SIEMPRE la misma raza; tras
revelar un sistema, el mapa M muestra el dominio.

### S6 · Los Grises end-to-end (3; requiere S1+S4+S5; S3 NO es prerrequisito)

> Los TEXTOS del diálogo los dirige el usuario en el momento de implementar (pedir su dirección
> creativa antes de redactarlos; el formato y los ganchos van aquí).

1. `PlanetInhabitants.GRISES` + label "Los Grises" en `cosmic-life.types.ts`; crear lista
   `NON_POOLABLE = [NONE, GRISES]` y usarla en `PLANET_INHABITANT_POOL` para que NO salgan en
   planetas aleatorios.
2. Crear `src/app/game/services/game/greys-solar-system.service.ts` (~250; patrón
   `human-solar-system.service.ts`, receta R2): snapshot id `'greys-system'`, sol tenue, 3-4
   planetas DETERMINISTAS (sin Math.random), planeta home `planet-greys-haven` (Rocky,
   `inhabitants: GRISES`, `probabilityOfLifePct: 100`,
   `civilizationIntelStatus: CONFIRMED_PRESENT` — imprescindible para que el gate de diplomacia
   `canOpenDiplomacyPanel` abra sin escaneo), `meta = { handcrafted: true, elderGod:
   ElderGod.CTHULHU, sanctuary: true }`. El flag `sanctuary` lo consulta el engine (1 línea) en
   la evaluación de spawns de void-jump/portal para suprimir seres menores en el refugio.
   Registrarlo en el `HandcraftedSystemsRegistry` de S5.
3. Acceso: trigger al completar un Gate Rite con `gateRiteCount >= 2` y
   `!hasStoryFlag('greys_signal')` → `addStoryFlag('greys_signal')` + marquee "Una señal gris
   sintoniza tu próximo Rito" + `gateTuning = { kind:'handcrafted', systemId:'greys-system' }`.
   El siguiente rito lleva al sistema gris; los portales emparejados (`linkedPortalId` +
   PortalRegistry) permiten volver.
4. Crear `src/app/assets/narrative/landing/landing_missions_grises.json` (formato exacto §S4.1):
   `meta { race:'GRISES', memoryShare: 5, missionType: 'hunt', uniqueGlyphId: 'SPEED',
   targetHint: 'Un sistema bajo el dominio de Yog-Sothoth' }`; `offer.scene` = el +5% de
   historia (los Grises intentaron detener el Gate Rite del culto; batalla contra la raza
   acólita de Yog-Sothoth; la Tierra partida como daño colateral — completa escenas del cómic);
   2-4 `options` de pregunta; `turnIn.success` + `memoryFragment`. Registrar GRISES en
   `RACE_CATALOG` con `dialogueScriptId`, `teachableGlyph: SpellType.SPEED` NO (el glifo va por
   uniqueGlyphId de la misión), `homeSystemId: 'greys-system'`, `shop` (paso 7).
5. Misión 'hunt':
   a. `PlanetMissionType += 'hunt'` (`planet-intel.types.ts:27`); `PlanetMissionTarget.elderGod?:
      ElderGod` (arregla el `'current-system'` fijo de `mission.service.ts:442,489` con un
      destino tipado real).
   b. Al ACEPTAR: `ShipOutfittingService.applyGreysUpgrade()` (paso 6) +
      `gateTuning = { kind:'procedural', forcedElderGod: YOG_SOTHOTH }` — "los Grises sintonizan
      tu próximo Rito"; el sistema destino nace con `meta.elderGodRevealed = true` → el mapa
      muestra "DOMINIO: YOG-SOTHOTH": ese es el mecanismo de búsqueda.
   c. Prueba de kill (molde tortuga): nuevo `MissionService.registerHuntKill(beingType,
      systemElderGod)` invocado desde `handleLesserBeingDestroyed` (`GameEngine.ts:5848`,
      delegador): si hay misión hunt activa && `beingType === VAMPIRO_FUEGO` &&
      `systemElderGod === YOG_SOTHOTH` → crear `CargoManifestEntry { id:
      'greys-vampire-ember', type: ARTIFACT, label: 'Rescoldo de Vampiro de Fuego',
      massTons: 2, rarity: UNIQUE }` + `mission.requiredCargoEntryId = 'greys-vampire-ember'`
      (el flujo `handleCargoRegistered`/`consumeMissionCargo` ya existe) + marquee MISSION
      "Prueba obtenida". El kill SOLO cuenta con la misión activa (avisarlo en el diálogo).
   d. Turn-in: volver por portales al planeta gris → conversación de entrega →
      `completeMission` → +5% memoria + `learnSpell(SPEED)` via uniqueGlyphId (fix S4.e) +
      reputación GRISES = ally + XP.
   e. Coherencia de combate: el vampiro es incorpóreo y radia daño a 1000u → solo se abate a
      distancia; el gauss (rango 3000u, 3 impactos) es el arma prevista.
6. Crear `src/app/game/services/state/ship-outfitting.service.ts` (~200) + spec:
   `applyGreysUpgrade(ship, store, hosts)`: `engineTier = 1`; `maxSpeed 20→100`,
   `acceleration 2→10`, `deceleration 2.5→12.5` + `refreshShipDynamicsBaseline(true)` via host
   (interacción con S0: la baseline nueva es la ampliada); `voidEnergyMax 100→1000` + rellenar
   `voidEnergyCurrent`; `weaponSlots = 1` + `weaponSystem.installWeapon('GAUSS_ICE')`;
   `shipRenderer.rebuild(config)` con **+5 toberas** (mismos elipsoides `dyn:'exhaust'` de
   `buildVastago`, dispuestos en anillo alrededor del cono de cola `[0,0,-1.15]`; el renderer ya
   anima cualquier 'exhaust' genéricamente). Idempotente (re-aplicar no re-suma). Persistencia:
   gratis (speed/voidEnergy ya persisten; outfit es de S1; engineTier dirige la geometría al
   cargar → en `applyState` del outfit, llamar `rebuild`).
7. Oferta posterior (`RaceDefinition.shop` de GRISES): "Ampliar motor" (`engine_tier` → tier 2;
   valores exactos los definirá el usuario cuando toque) y "Slot de arma adicional"
   (`weapon_slot`, coste en recursos) → botones en la conversación/diplomacia →
   `ShipOutfittingService`.
8. +5% historia: mínimo viable = `memorySharePct: 5` + `memoryFragment` + storyFlag
   `'greys_story_told'`. **S6b opcional (1)**: `revealedMemories` según la receta EXACTA de
   `docs/MEMORIAS.md` §2.2 (campo en `SaveGameCharacterState` + 2 líneas en
   `player-state.serializer.ts` + store) + memoria `MEM_GRISES`; NO arrastrar el
   ComicSequencePlayer entero a este slice.

Aceptación S6 (smoke end-to-end): partida nueva → 2 Gate Rites → señal gris → rito → sistema
gris (sin seres menores) → aterrizar en el home → conversar (historia +5%) → aceptar → la nave
vuela a 100u con 7 toberas animadas, gauss instalado, void 1000 → rito → sistema
"DOMINIO: YOG-SOTHOTH" en el mapa → localizar y abatir al vampiro a distancia → "Rescoldo" en
carga + marquee → volver por portales → entregar → memoria +5%, glifo SPEED aparece en el
grimorio (G), Speed Rite castable y SIN bug al expirar aterrizado (S0) → la oferta de
motor/slot extra visible. Save/load en mitad del flujo conserva todo.

## 4. Orden, dependencias y esfuerzo relativo

```
S0 (0.5)  independiente — PRIMERO
S1 (3) → S2 (1) → S3 (2.5) [ + S3b opcional (1): engine −300 ]
S4 (3)   independiente de S1-S3
S5 (2)   tras S4 (el shop usa RaceDefinition; el resto es independiente)
S6 (3)   requiere S1 + S4 + S5   [ + S6b opcional (1) ]
Camino crítico jugable de los Grises: S0 → S1 → S2 → S4 → S5 → S6  (S3 en paralelo o después)
```

## 5. Riesgos y guardarraíles

- **FPS**: todos los `update` de armas son HOT → hosts cacheados como campos, cero allocs por
  frame (objetos scratch reutilizados), early-return si `installedCount === 0`.
- **Savegames**: campos nuevos SIEMPRE opcionales; sin bump de schema; sin migraciones (regla
  del proyecto). Probar round-trip en el arnés en cada slice que persista algo.
- **`gate-rite.animation.ts`** es monolítico y frágil: el cambio del S5.6 es un único punto de
  inserción; no refactorizar nada más ahí.
- **Menú contextual del navegador**: preventDefault en `mousedown` Y en `contextmenu`; probar en
  Chrome (target del proyecto).
- **Balance**: vampiro (aura 10 dmg/10s a 1000u) vs gauss (3000u, 3 impactos) es holgado a
  propósito para la primera arma; tunear en el smoke de S6, no antes.
- **No hacer**: armas hardcodeadas en el engine; un segundo pool de proyectiles; fórmulas de
  terreno fuera del sampler; `(x as any)`; tocar `ReticleManager` legacy (el targeting activo
  es v2).

## 6. Documentación a producir

- **`docs/ARMAS.md`** (nuevo, patrón ESTACIONES.md): familias y aim modes con flujo, modelo de
  datos, mapa de ficheros (`services/weapons/*`, `rendering/weapons/*`), contratos de host,
  persistencia (`outfit`, por qué opción B), input, WeaponsPanel, receta "arma nueva = 1 entrada
  de catálogo + sfx + icono, cero motor" + antipatrones.
- **`docs/RAZAS.md`** (nuevo): marco narrativo (3 primigenios como bosses en dimensión
  desconocida; razas amenazadas; acólitas hostiles = hueco tipado), RaceDefinition + catálogo,
  reputación, dominación de sistemas, sistema de conversación (JSON + DialogueService +
  overlay), GateTuning, receta "raza nueva = enum + label + JSON + RaceDefinition (+ sistema R2
  opcional)", ficha de los GRISES como ejemplo canónico.
- **`docs/ARQUITECTURA.md`** (editar): añadir Fase 12 y Fase 13 con motivación y punteros;
  receta R8 "destinos dirigidos del Gate Rite"; registrar cada slice en §8 al completarlo.
