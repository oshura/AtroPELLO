# Fase 12 — Armamento del jugador

> Estado: **S0, S1 y S2 implementados** (build 75). Pendientes: haces continuos y modos de
> apuntado guiados (S3). Plan completo y por slices en `documentation/Plan_Armas_Razas.md`.

## 1. Por qué

Hasta la build 74 el jugador no podía disparar: `Spaceship.weapons` era un `any[]` que nadie
llenaba y el HUD pintaba un "NO WEAPONS" fijo. El único daño que el jugador podía causar era
embestir. Esta fase introduce armamento real, data-driven, sin que el motor sepa nada de armas
concretas.

## 2. Modelo de datos

Todo el armamento se DEFINE por datos:

- `src/app/game/types/weapon.types.ts` — tipos.
- `src/app/game/config/weapon-catalog.config.ts` — **fuente única de verdad** del catálogo.

```
WeaponDefinition
├── kind: PROJECTILE | BEAM          familia
├── aimMode: FIXED | MOUSE_GUIDED | TARGET_LOCKED
├── rangeU, cooldownMs, damage
├── projectile: { speed, radius, lifeSec, homing…, blastRadius }
├── beam: { dps, widthU, color, maxDurationMs }
├── ammo | voidEnergyCostPerShot     munición propia o energía del vacío
├── visual: { color, trail, glowScale }
└── hardpointStyle: gun | pod | emitter
```

**Receta: añadir un arma nueva** = una entrada en `WEAPON_CATALOG` + su clip en
`src/app/assets/audio/_manifest.json` + (si procede) su icono. **Cero cambios en el motor.**
Si te encuentras escribiendo `if (weaponId === …)` fuera del catálogo, es que falta un campo en
`WeaponDefinition`.

### Modos de apuntado

| Modo | Quién apunta | Estado |
|---|---|---|
| `FIXED` | El morro de la nave, que es lo que marca la retícula de vector de vuelo del HUD | ✅ |
| `TARGET_LOCKED` | El target seleccionado (T / clic izquierdo); el proyectil lo persigue | Despacho ✅, guiado pendiente (S3) |
| `MOUSE_GUIDED` | El cursor: minas-drone que el jugador pasea y que enganchan hostiles cercanos | Despacho ✅, guiado pendiente (S3) |

El armazón de guiado ya existe en el pool (`ProjectileGuidance`, steering limitado por
`turnRateRad`, enganche por `lockRadius`); lo que falta es que el host devuelva el punto de guía
en `getGuidancePoint` (hoy devuelve `null` a propósito).

## 3. Mapa de ficheros

| Fichero | Papel |
|---|---|
| `game/services/weapons/weapon-system.ts` | Outfit de la nave, selección, cadencia, coste y despacho de disparo por modo de apuntado |
| `game/services/weapons/projectile-system.ts` | **Pool ÚNICO** de proyectiles del juego, con facción `player`/`enemy` |
| `game/services/weapons/weapon-targets.ts` | Recolección de candidatos de impacto (funciones puras, buffers reutilizados) |
| `game/services/weapons/weapon-engine-bridge.ts` | Une armamento y mundo. **Aquí vive el cableado que engordaría el motor** |
| `game/hud/elements/WeaponsPanel.ts` | Panel del HUD (arriba a la izquierda) |
| `game/rendering/LesserBeingRenderer.ts` | Dibuja los proyectiles de ambas facciones (`renderWeaponProjectile`) |
| `game/rendering/ship/ship-geometry.ts` | `WEAPON_HARDPOINT_ANCHORS` + cañones + toberas por `engineTier` |
| `game/math/vector-math.ts` | `sweptSphereHit`, `raySphereHit` |

El motor conserva únicamente el contexto del puente y cuatro delegadores
(`cycleWeapon`, `setWeaponTriggerHeld`, `installShipWeapon`, `applyShipOutfit`).
**Balance de la fase: `GameEngine.ts` −11 líneas, `HUDManager.ts` −42.**

## 4. Decisiones que conviene no reabrir

- **Un solo pool de proyectiles.** Los seres menores tenían el suyo; ahora
  `LesserBeingCombatService` sólo decide qué dispara y lo entrega al pool con facción `enemy`.
  Duplicar el pool para el jugador habría duplicado también el barrido de colisión y la caída de
  daño.
- **Colisión por barrido continuo** (`sweptSphereHit`), no por posición final: un gauss recorre
  ~19 unidades por frame y atravesaría cualquier objetivo pequeño.
- **Candidatos acotados, pero no vacíos.** El jugador puede acertar a seres menores, la tortuga
  espacial, asteroides sueltos y los miembros de cúmulo que estén **dentro de 3500 u** (filtrados
  antes por la distancia del centro del cúmulo, como hace el sistema de colisiones de la nave).
  Excluir los cúmulos por completo, como estaba en la primera versión, dejaba al arma sin nada a
  lo que disparar en el escenario habitual.
- **Los proyectiles de arma NO usan el sesgo de profundidad** de los proyectiles de seres menores.
  Ese truco acerca el proyectil hasta 900 u hacia la cámara para que un escupitajo lento a 200 u se
  vea bien; aplicado a un arma de 3000 u de alcance, amontona los disparos cerca de la nave y hace
  que parezcan volar en una dirección que no es la suya.
- **Persistencia en campo propio** (`SaveGameShipState.outfit`), no en `equipmentLoadout`:
  `EquipmentSlotState` es cosmético (etiquetas y rarezas) y su enum de slots es cerrado, así que
  munición, slots comprables y arma seleccionada habrían acabado codificados en strings.
  El campo es **opcional**: los savegames anteriores cargan con la nave desarmada, sin migración.
- **El daño no destruye nada por su cuenta.** Se aplica con `applyDamageToObject` y la destrucción
  y su recompensa (XP, marquee, botín) ya son reactivas desde el setter de `healthCurrent`.

## 5. Controles

| Entrada | Acción |
|---|---|
| **Botón derecho (mantener)** | Disparar el arma seleccionada |
| **R** / **Shift+R** | Arma siguiente / anterior |
| Rueda | Sigue siendo zoom de cámara (sin cambios) |

El botón derecho estaba libre en vuelo. `PanelEventCoordinator` lo enruta sólo cuando no hay
ningún panel abierto, suprime el menú contextual del navegador y **suelta el gatillo si el puntero
abandona el canvas** (si no, el arma se quedaría disparando sola). Todo respeta
`areSpellGameplayInputsLocked()`.

## 6. HUD

`WeaponsPanel` mide **182×140 y eso no puede cambiar**: es ancla de layout del HUD (el medidor de
salud se coloca a su derecha y el de energía del vacío espeja su ancho). Muestra una fila por arma
con icono según familia, nombre, munición o coste, y barra de cadencia; la seleccionada va en cian
`#00c5ff`, el mismo lenguaje visual que el grimorio. Todo el texto compensa el aplastado vertical
del plano del HUD con `ctx.scale(1, 1.25)`.

Efecto colateral bonito: la retícula de vector de vuelo ya tenía un modo 'combat' rojo dormido que
se activa solo en cuanto hay un arma instalada.

## 7. El gauss de hielo (primera arma)

Regalo de los Grises en su misión (Fase 13). `FIXED`, 1200 u/s, alcance 3000 u, cadencia 450 ms,
**34 de daño → tres impactos abaten al vampiro de fuego** (100 PV). Consume 1 de energía del vacío
por disparo. Es la única forma de matar al vampiro, que es incorpóreo (no admite embestida) y radia
daño a 1000 u.

Para probarlo sin la misión: overlay de depuración (tecla `ñ`) → **"Instalar gauss de hielo"**.

## 8. Aspecto de los proyectiles

Un proyectil de arma se dibuja como **trazadora alargada**, no como bola de luz: el billboard usa
como eje largo la dirección de vuelo proyectada al plano de la cámara (`projectToViewPlane`) y como
eje corto su perpendicular. Con los ejes de la cámara —lo natural para un halo— saldría un círculo
mire a donde mire el proyectil.

El color sale de `visual.color` mezclado hacia el blanco a medias (`c*0.5 + 0.5`); sumar una
constante a los tres canales saturaba a blanco puro y el hielo perdía su tono azulado. La estela se
alarga con la velocidad, de modo que un gauss deja una raya y una mina lenta apenas un punto.

## 9. Antipatrones

- Hardcodear un arma en el motor o en el puente.
- Un segundo pool de proyectiles.
- Comprobar colisiones sólo en la posición final del frame.
- Replicar el `(this as any)._weaponsHUD` que este trabajo eliminó: los datos del HUD van tipados.
