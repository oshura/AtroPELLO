# Plan Integrado de Habitantes, Seres Menores y Spawns para Planetas

> **Estado**: Propuesta inicial – 25 Nov 2025
> **Alcance**: Define tipos, flags y flujos para poblar planetas con razas y seres menores, junto a los eventos de aterrizaje, escaneo y spawns desde portales.

## 1. Tipologías y enumeraciones

### 1.1 Habitantes planetarios (`PlanetInhabitants`)
"NONE" + razas humanoides/no humanoides del bestiario lovecraftiano menor (sin dioses primigenios). Primera iteración:
- `NONE`
- `MI_GO`
- `YIG`
- `LENG`
- `ORGANISMO_VEGETAL`
- `ANGELES_DESCARNADOS`
- `PROFUNDOS`
- `ANTIGUOS`
- `DOHLE`
- `CHTHONIAN`
- `GULES`
- `GHASTS`
- `VAMPIRO_ESTELAR`
- `BYHKEE`
- (espacio para futuras entradas)

### 1.2 Dioses primigenios (`ElderGod`)
- `CTHULHU`
- `AZATHOTH`
- `YOG_SOTHOTH`
- `CTHUGHA`
- (añadiremos Nyarlathotep o similares cuando definamos bosses específicos)

### 1.3 Seres menores (`LesserBeing`)
Incluye los enviados conocidos:
- `SEMINILLAS_ESTELARES`
- `SHOGGOTH`
- `VAMPIRO_FUEGO`
- `NINGUNO` (para representar ausencia)
- Lugar para añadir otros (Byakhee corrompidos, insectos de Saturno, etc.)

### 1.4 Mapeo dios → invocaciones
`ELDER_GOD_SUMMONS: Record<ElderGod, LesserBeing[]>`.
- `CTHULHU` → `[SEMINILLAS_ESTELARES, SHOGGOTH]`
- `AZATHOTH` → `[SHOGGOTH, VAMPIRO_FUEGO]`
- `YOG_SOTHOTH` → `[SHOGGOTH, VAMPIRO_FUEGO]`
- `CTHUGHA` → `[VAMPIRO_FUEGO, SEMINILLAS_ESTELARES]`
  
Cada especie conserva además un “patrón” visual fijo utilizado por la animación de Void Jump:
- `SEMINILLAS_ESTELARES` → iconografía de `CTHULHU`.
- `SHOGGOTH` → iconografía de `AZATHOTH`.
- `VAMPIRO_FUEGO` → iconografía de `CTHUGHA`.

## 2. Nuevas propiedades en `Planet`
| Propiedad | Tipo | Descripción |
| --- | --- | --- |
| `inhabitants` | `PlanetInhabitants` | Raza principal. Determinada al generarse usando `probabilityOfLife`. |
| `lesserBeing` | `LesserBeing | null` | Ser menor actualmente activo en el planeta. Único por planeta. |
| `visited` | `boolean` | Si la nave aterrizó físicamente alguna vez. Controla XP inicial y gating de misiones. |
| `lifeScanned` | `boolean` | Se conoce la raza por sensores/contacto. |
| `creatureScanned` | `boolean` | Se identificó el ser menor presente (si lo hay). |
| `animosity` | `friendly | neutral | enemy` (pendiente: usar enum global) | Estado social del planeta; se sincroniza con presencia de seres menores o acciones del jugador. |

## 3. Generación de planetas
1. Durante `createGameObjects()` o cualquier generador de sistema solar:
   - `roll = randomInt(1,100)`.
   - Si `roll <= probabilityOfLife` → `inhabitants = randomPlanetInhabitantExceptNone()`.
   - Caso contrario `inhabitants = PlanetInhabitants.NONE`.
2. Inicializar flags:
   - `lesserBeing = null`
   - `visited = false`
   - `lifeScanned = false`
   - `creatureScanned = false`
   - `animosity = neutral` (o `friendly` si se predefine la colonia)

## 4. Aterrizaje y experiencia
- Hook en el flujo de aterrizaje:
  1. Si `!planet.visited`, invocar `CharacterProfileService.registerExperienceEvent(PLANET_LANDING)` (+3 XP).
  2. Marcar `planet.visited = true`.
- Cuando el piloto entra en contacto con habitantes o el ser menor, el planeta ajusta animosidad:
  - Si hay `lesserBeing` activo → `animosity = enemy`.
  - Si se elimina el ser menor → `animosity = neutral`.
  - Si se completa misión diplomática → `animosity = friendly`.

## 5. Escaneo de vida y criaturas
- `lifeScanned` y `creatureScanned` se activan mediante hardware/hechizos (pendiente de definir). Efectos inmediatos:
  - HUD/mapa pueden mostrar `inhabitants` sólo si `lifeScanned === true`.
  - `lesserBeing` y presencia de primigenios sólo se muestran si `creatureScanned === true`.
- Métodos utilitarios:
  - `markLifeScanned(planet)`
  - `markCreatureScanned(planet)`

## 6. Spawns de seres menores mediante portales
### 6.1 Reglas base
- Cada portal activo ejecuta un chequeo cada **5 minutos**.
- Probabilidad 25% de generar un ser menor por chequeo.
- Visualización provisional: billboard/esfera luminosa monocroma (color depende del ser o del dios que lo envía). Más adelante se reemplazará por geometrías y shaders propios.
- Siempre `animosity = enemy` respecto al jugador y poblaciones locales.

### 6.2 Elección de destino
1. Determinar objetivos válidos:
   - Planetas sin `lesserBeing` actual.
   - La nave del jugador (si el ser decide un ataque directo).
2. Priorizar:
   - En primer lugar el planeta habitable más cercano **sin** ser menor activo.
   - Si ninguno cumple, evaluar distancia a la nave.
3. Si el destino es planeta:
   - Aterriza → `planet.lesserBeing = newBeing`.
   - `planet.creatureScanned = false` (hay presencia nueva por descubrir).
   - `planet.animosity = enemy` (afecta misiones y paneles cuando se visite/escanee).
4. Si el destino es la nave:
   - Triggea combate/encuentro (mecánicas futuras). Resultado puede incluir daño, XP extra o eventos narrativos.

### 6.3 Llegada de nuevos seres
- Un planeta sólo alberga **un** `lesserBeing` a la vez.
- Si llega uno nuevo a planeta ya ocupado: Nunca va a tomar la decisión de ir hacia un planeta ya ocupado. Si iba a uno y lo ocupan antes de llegar, reevaluará condiciones de la misma forma que cuando ha sido spawneado.

## 7. Impacto en HUD/Mapas
- **System Map** & **Target HUD** deben consultar flags antes de renderizar nombres/descripciones.
- Plantear `PlanetDisplayData` con getters que devuelvan "???" si no se ha escaneado.
- Esto evita spoilers y refuerza la mecánica de exploración/escaneo.

## 8. Próximos pasos / implementación por fases
1. **Fase 1 (en curso)**
   - Crear enumeraciones + constantes.
   - Extender `Planet` y generadores con nuevas propiedades + roll de habitantes.
   - Hook de aterrizaje → XP + `visited`.
   - Flags de escaneo ya disponibles para UI gating.

2. **Fase 2**
   - Implementar UI gating (mapa/HUD muestran "Sin datos" hasta escanear).
   - Añadir comandos/artefactos para `markLifeScanned` / `markCreatureScanned`.
   - Registrar `animosity` en la diplomacia/NPC AI.

3. **Fase 3**
   - Sistema de spawns por portal con scheduler global y objetos "bola luminosa".
   - Comportamiento de desplazamiento y aterrizaje.
   - Combate/encuentro básico cuando apuntan a la nave.

4. **Fase 4**
   - Extender bestiario (más seres menores) y misiones asociadas.
   - Integrar bosses (dioses primigenios) como eventos especiales.
   - Personalizar shaders/modelos de las entidades menores.

---

Con este plan documentado podemos empezar a aplicar los cambios en código (enumeraciones, propiedades y hooks de aterrizaje) y, en paralelo, ir detallando las capacidades de escaneo y el scheduler de portales.
