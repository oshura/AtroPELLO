# Fases 13–15 — Razas, conversación y misiones narrativas

> Estado: base jugable en build 82 (Fase 13, los Grises); **Fase 14 (vuelo por ratón) y Fase 15
> (Mi-Go, Arácnidos y exterminio) en build 89**. Lore en `docs/HISTORIA.md`; armamento en
> `docs/ARMAS.md`; planes por slices en `documentation/Plan_Armas_Razas.md` y
> `documentation/Plan_MiGo_Aracnidos.md`.

## 1. Por qué

Antes de esta fase, "hablar con una civilización" era una botonera con varios sinsentidos: la misión
se sembraba sola con solo abrir el panel, sin haber cruzado palabra con nadie; "Profundizar en
sabiduría" prometía glifos que nunca llegaban al grimorio; "Confrontar" era inalcanzable en cualquier
planeta deshabitado con criatura; y la raza que te encargaba algo nunca llegaba a considerarte aliada,
porque la promoción apuntaba al planeta equivocado.

Además había **trece guiones de conversación escritos y muertos** en
`src/app/assets/narrative/landing/landing_missions_<raza>.json`: nadie los importaba.

## 2. Marco narrativo

**Tres primigenios** (Cthulhu, Azathoth, Yog-Sothoth) se reparten el universo; el arco no crece por
ahí. Todas las razas están amenazadas por ellos. Ficha completa en `docs/HISTORIA.md` §8-§9.

Las **razas acólitas** (`RaceDefinition.isAcolyte`) sirven a un primigenio, no habitan planetas y
aparecen cuando la trama las convoca. El tipo ya existe; su spawn por eventos es trabajo futuro.

## 3. Modelo de datos

| Fichero | Papel |
|---|---|
| `game/types/race.types.ts` | `RaceDefinition`, `RaceShopOffer`, `RaceStanding` |
| `game/config/race-catalog.config.ts` | **Fuente única de verdad** de las razas con ficha propia |
| `game/types/dialogue.types.ts` | Espejo EXACTO del formato de los JSON de guion |
| `services/game/dialogue-script.service.ts` | Carga los 13 guiones (el puente que faltaba) |
| `services/game/dialogue.service.ts` | Máquina de conversación (sesión efímera) |
| `components/landing-menu/` | Vista de Contacto: conversación, encargo, servicios y taller |
| `game/config/landing-odds.config.ts` | Probabilidades que la UI muestra y el servicio tira |
| `services/game/race-outfitting-bridge.service.ts` | Traduce "la raza te arma" en llamadas al motor |
| `game/services/state/ship-outfitting.service.ts` | Mejoras permanentes de nave |

### Receta: añadir una raza

Las razas se escriben **de una en una y a mano**. No hay razas "de relleno": una civilización entra
en el universo cuando tiene algo que contar.

1. **Nombre** en `PlanetInhabitants` + su etiqueta en `PLANET_INHABITANT_LABELS`.
2. **Guion** en `src/app/assets/narrative/landing/landing_missions_<raza>.json` (formato en §5).
3. **Registro** del guion en `DialogueScriptService.SCRIPTS`.
4. **Ficha** en `RACE_CATALOG`: descripción, primigenio que la amenaza, actitud inicial, glifo que
   enseña y taller.

Con eso la raza **entra sola en el sorteo de habitantes** (`getPoolableRaces()`), porque el sorteo se
deriva del catálogo y no del enum. Un nombre reservado en el enum sin ficha no aparece jamás en el
universo: así el jugador nunca aterriza en un mundo cuya civilización no sabe hablar.

Dos matices de ficha (Fase 15):

- `excludeFromPool: true` — raza con ficha completa que **nunca** entra en el sorteo: sólo existe
  donde la trama la coloca (los Arácnidos en su sistema de guerra, Yig en su sistema natal).
- `shopAvailability: 'neutral'` — su taller vende sin exigir alianza (default: `'ally'`). Un
  **hostil** no compra nada, sea cual sea la disponibilidad.

> **Estado actual: Grises y Mi-Go en el sorteo.** Arácnidos y Yig existen sólo por sintonía del
> rito. Los guiones antiguos de las razas restantes siguen en `assets/narrative/landing/` como
> material de partida, pero **no se cargan**: se reescribirán al abordar cada raza.

### Presupuesto de memoria

Cada raza devuelve un trozo del pasado del piloto (`meta.memoryShare`, sumado al completar su
encargo). El arco de la memoria va del 20 % inicial —intro y estación humana— al 100 %, así que
conviene repartir el 80 % restante entre las razas que se vayan cerrando, no gastarlo en las
primeras. Los Grises aportan **5 %**; los Mi-Go, otro **5 %**. Los Arácnidos, **0 %**: no comercian
con memoria, sólo con peso.

Además del porcentaje, cada raza aporta un **fragmento narrado** (`turnIn.memoryFragment`): es el
pago real, lo que el jugador recuerda. La cifra sólo mide el progreso.

## 4. El menú de aterrizaje

Reorganizado en la build 82 para que cada cosa esté donde el jugador la busca:

| Vista | Qué ofrece |
|---|---|
| **Overview** | Datos del planeta. Pie: *Permanecer* · *Despegar*. |
| **Acciones** | *Descansar* (con su probabilidad si hay criatura), *Capturar void mass* y *Rastrear lesser being* (50 % cada una), y *Contactar civilización*. Pie: *Embarcar*. |
| **Contacto** | Todo lo que se hace con la raza: conversación, encargo, servicios según la relación y taller. Pie: *Volver* · *Embarcar*. |

**"Contactar civilización" es un botón contextual**: mientras no sepas quién vive en el mundo es la
tirada de primer contacto (y enseña su 50 %); en cuanto los conoces, abre la vista de Contacto. Así
no delata que un planeta está habitado antes de escanearlo, y no hace falta un botón distinto para
cada fase de la relación.

**Las probabilidades se muestran junto a la acción** y salen de `landing-odds.config.ts`, la misma
fuente que tira el dado: la interfaz no puede prometer una cifra distinta de la que se juega.
Descansar con un ser menor rondando pasó de interrupción segura a apuesta (35 %).

Se retiraron del menú *Bajar de la nave* (era un placeholder sin experiencia detrás) y los botones
sueltos *Conversar* y *Relacionarse*, que ahora viven fusionados dentro de Contacto.

## 5. Cómo se conversa

Una conversación es lo que pedía el diseño: **escena narrada + preguntas + salir cuando quieras**.

Esqueleto del guion de una raza (`RaceMissionScript`):

```jsonc
{
  "meta": {
    "race": "GRISES",
    "memoryShare": 5,                 // % de memoria que devuelve el encargo
    "missionType": "hunt",            // artifact | material | hunt | exterminate | none
    "targetHint": "…",                // pista de dónde ocurre
    "uniqueGlyphId": "SPEED",         // glifo que enseñan al completarlo (opcional)
    "grantGlyphOnAccept": "…",        // glifo que enseñan al ACEPTAR (la herramienta del encargo)
    "huntTarget": { "lesserBeing": "VAMPIRO_FUEGO", "elderGod": "YOG_SOTHOTH" },
    "trophyLabel": "Rescoldo de Vampiro de Fuego",
    "exterminateTarget": { "race": "…", "planets": 3, "stations": 2 },  // sólo exterminate
    "acceptOutfitText": "…",          // narración de la mejora de nave al aceptar
    "acceptTune": { "label": "…", "guaranteedInhabitants": "…", "guaranteedInhabitedCount": 3, "stationTheme": "aracnida" },
    "postMissionTune": { "race": "YIG", "label": "…", "text": "…" }     // oferta tras completar
  },
  "offer": {
    "scene": "…",                     // cómo te reciben; aquí va su trozo de historia
    "options": [                      // preguntas; repetibles, no agotan la charla
      { "id": "origin", "label": "¿…?", "text": "…" }
    ]
  },
  "clues": { "minor": {…}, "major": {…}, "final": {…} },   // opcional
  "turnIn": {
    "success": "…",                   // qué pasa al entregar
    "memoryFragment": "…"             // lo que el piloto recuerda: el pago de verdad
  }
}
```

- Preguntar no consume nada y **no cierra la charla**; se puede repetir.
- **Aceptar el encargo es una opción más de la conversación.** Ya no existe misión que nazca sola.
- **"Terminar conversación" está siempre disponible**, en cualquier fase.
- Si el encargo está listo, la opción de entrega sustituye a la de aceptar.

La sesión es efímera: lo que persiste es la misión que salga de ella.

## 6. Misiones de caza (`type: 'hunt'`)

Novedad de esta fase, para encargos que no ocurren en un planeta sino contra una criatura:

1. La misión guarda `huntTarget: { lesserBeing, elderGod }` y `originPlanetId` (dónde se entrega).
2. Al morir un ser menor, el motor avisa a `MissionService.registerHuntKill(criatura, dominio)`.
3. Si coinciden criatura y dominio **y la misión está aceptada**, se materializa la prueba en la bodega
   (mismo patrón que el caparazón de la tortuga espacial) y la misión pasa a `ready-to-turn-in`.
4. La entrega ocurre conversando en el planeta de origen.

Matar la criatura *antes* de aceptar el encargo no cuenta, y el propio diálogo lo advierte.

## 6b. Misiones de exterminio (`type: 'exterminate'`, Fase 15)

Para encargos de guerra: terminar la presencia de una raza en su sistema.

1. La misión guarda `exterminationTarget: { race, planetsRequired, stationsRequired,
   planetsDestroyed, stationsDestroyed }`.
2. Cada planeta habitado destruido (Gate Rite o drenaje de Void Kinesis) y cada estación derribada
   avisan a `MissionService.registerExterminationEvent(raza, 'planet'|'station')`.
3. La cuota sólo avanza con la misión **aceptada**; el excedente no cuenta; al completarse pasa a
   `ready-to-turn-in` (mismo guard que hunt: jamás por transición automática) y `completeMission`
   la rechaza si la cuota no está cumplida.
4. La entrega ocurre conversando con la raza patrocinadora (cualquier planeta suyo).

Los **métodos de destrucción de planeta** son dos, y ambos cuentan:

- **Gate Rite sobre el planeta**: lo colapsa en un portal (y te lleva a un sistema nuevo; se vuelve
  por el portal emparejado).
- **Void Kinesis sobre el planeta** (`planet-drain-beam.ts`): canal de ~20 s que encoge el mundo
  mientras su void mass pasa a tu depósito; al consumarse desaparece sin portal. Bloqueado en el
  sistema natal humano y sobre el planeta donde estás aterrizado; alcance 2500 u.

## 6c. Hostilidad (Fase 15)

- **Destruir el planeta de CUALQUIER raza la vuelve hostil** (`declareRaceHostility`): standing
  `hostile`, sus planetas del sistema pasan a enemigo, **sus encargos activos caducan** y no
  vuelve a conversar ni a vender ("Nadie sale a recibirte…").
- Los **Arácnidos** además son un caso especial: neutrales hasta el **primer disparo** del jugador a
  un telar o a un caza (`AracnidWarSystem.notifyPlayerAggression`); desde entonces sus cazas salen
  de las estaciones a por ti.
- El **camino de traición** existe: los Arácnidos ofrecen en neutral su contramisión (destruir un
  planeta Mi-Go). Cumplirla vuelve hostiles a los Mi-Go, hace caducar su misión y pierde la senda
  de Yig; a cambio, los tejedores saldan la cuenta.

## 7. Progreso persistido

Todo opcional, sin migración de savegames:

- `SaveGameCharacterState.storyFlags` — hitos de una sola vez (`greys-system-seeded`,
  `aracnid-web-down:<systemTag>:<n>`).
- `SaveGameCharacterState.raceStandings` — reputación y misiones completadas por raza.
- `SaveGameCharacterState.gateTuning` — sintonía pendiente del próximo rito (Fase 15): guardar
  entre aceptar un encargo y lanzar el rito ya no pierde el destino prometido.
- `SolarSystemMeta.elderGodRevealed` — si el jugador ya sabe quién domina ese sistema.
- `SolarSystemMeta.stationTheme` — tema de estaciones del sistema (`'aracnida'` = telarañas).

## 8. Ritos dirigidos

El Gate Rite dejaba el destino al azar, lo que hacía imposible encargar "ve al dominio de X":

- **El primer Rito de la partida** siembra siempre el sistema de los Grises, con un planeta habitado
  al 100% y su civilización ya confirmada (no hace falta escanearla). No se rifa sistema archivado.
  Ese sistema **nunca cae bajo Yog-Sothoth** (`excludedElderGod`).
- Una raza puede **sintonizar el siguiente Rito** con un `GateTuningState` completo
  (`game/types/gate-tuning.types.ts`, consumido una sola vez): primigenio forzado o excluido, raza
  garantizada, número de mundos habitados (`guaranteedInhabitedCount`) y tema de estaciones. Los
  Grises fuerzan el dominio de Yog-Sothoth; los Mi-Go generan el **sistema de guerra arácnido**
  (3 mundos ARACNIDOS + 2 telarañas) y, tras su misión, el **sistema natal de Yig**. El sistema
  resultante nace con `elderGodRevealed`, así que el mapa te dice a dónde has llegado.

## 9. Identidad de los objetos generados

Los sistemas procedurales reutilizaban los mismos ids (`planet-0`, `planet-1`…, `cloud-0000`…), así
que el planeta de un sistema y el del mismo índice de otro eran **indistinguibles por id**. Eso
cruzaba misiones entre sistemas y afectaba a cualquier mapa por id (memoria de terreno incluida).

Desde la build 79, `SystemGeneratorService` antepone un `systemTag` derivado de la semilla
(`hashSeed(seed).toString(36)`) a planetas y cúmulos: `planet-1x3kf9-2`. Sigue siendo determinista
—la misma semilla da los mismos ids— y el sistema humano conserva sus ids nombrados
(`planet-earth`, `planet-mars`…), que nunca colisionaron.

## 10. Determinismo

La raza de un planeta se sorteaba con `Math.random()`, así que un mismo mundo cambiaba de habitantes
entre recargas. Ahora la tirada se deriva del id del planeta (`game/utils/seeded-random.ts`), y la
civilización de Marte tiene semilla fija. El sorteo elige entre las razas terminadas
(`getPoolableRaces()`), que hoy es sólo una.

## 11. Ficha canónica: los Grises

Ver `docs/HISTORIA.md` §9 para el lore y `landing_missions_grises.json` para el guion. Resumen técnico:

- Guion con cinco preguntas, incluida la que explica el reparto de los tres primigenios.
- Misión `hunt` contra `VAMPIRO_FUEGO` bajo `YOG_SOTHOTH`, recompensa `memoryShare: 5` y
  `uniqueGlyphId: 'SPEED'`.
- Al aceptar: `applyGreysUpgrade` (velocidad 100, aceleración 10, vacío ×10, gauss instalado, anillo de
  toberas) + sintonía del rito.
- Tienda posterior (sólo siendo aliado): ampliar motor, anclaje extra y Vulcan.

## 11b. Ficha canónica: los Mi-Go (Fase 15)

Ver `docs/HISTORIA.md` §11 y `landing_missions_migo.json`. Resumen técnico:

- Guion con siete preguntas: quién creó la secta (Yog-Sothoth), por qué la Tierra (sistema adorado
  de Cthulhu), las **burbujas** de Yog-Sothoth, los arácnidos, los métodos y el pago.
- Misión `exterminate` contra ARACNIDOS (3 mundos + 2 telares), `memoryShare: 5`,
  `uniqueGlyphId: 'VOID_COCOON'`.
- Al aceptar: `applyMiGoUpgrade` (maniobrador de cursor + giro PI/2.5→PI/1.6), glifo
  **VOID_KINESIS** (`grantGlyphOnAccept`) y sintonía al sistema arácnido (`acceptTune`).
- Tras completar: opción permanente **"Pedir la senda de Yig"** (`postMissionTune`) — sintoniza el
  próximo rito hacia un sistema con planeta YIG (guion teaser, sin misión: la gran raza llegará con
  su propia fase, junto al warp a las dimensiones de los primigenios).
- Tienda (ally): MISSILE + anclaje extra. Sabiduría de aliado: QUIMIO_SIGILLUM.
- **Entran en el sorteo de habitantes** junto a los Grises.

## 11c. Ficha canónica: los Tejedores arácnidos (Fase 15)

Raza **antagonista** (`excludeFromPool`): sólo habitan su sistema de guerra (sintonía Mi-Go).

- **Elusivos**: guion mínimo de tres vibraciones de hilo; no cuentan historia (memoryShare 0).
- **Tienda en neutral** (`shopAvailability: 'neutral'`): DRONE_MINE ("huevos que muerden") y un
  anclaje. Hostiles no venden.
- **Contramisión**: `exterminate` contra MI_GO (1 planeta). El precio real es perder a los Mi-Go.
- Su sistema: 3 mundos habitados confirmados + 2 **estaciones telaraña**
  (`AracnidWebStation`, 1000 HP, destruibles, sin puertos) + **cazas arácnidos**
  (`AracnidFighterBeing`, 60 HP, aguijonazos con predicción de tiro) que salen en oleadas de los
  telares vivos mientras seas hostil. Sin telares, los cazas se repliegan.
- Toda la guerra vive en `game/services/state/aracnid-war-system.ts` (flat + host); estaciones
  derribadas persisten por storyFlag y no vuelven a tejerse.

## 12. Antipatrones

- Sembrar misiones fuera de una conversación.
- Prometer una recompensa en el texto y no entregarla en código (el pecado original de esta fase).
- Poblar el universo con razas sin guion propio (el sorteo sale del catálogo por eso).
- Reutilizar un texto genérico para una raza en lugar de escribirle el suyo.
- Revelar el dominio de un sistema que el jugador no ha averiguado.
