# Sistema de Aterrizaje, Diplomacia y Narrativa

> Última actualización: diciembre 2025 · Responsable: Game Systems Team.
>
> Documento consolidado de `Landing_Menu_Narrative_Plan.md`, `Landing_Mission_Dialogues_Plan.md`, `Landing_Menu_Continuacion_Plan.md`, `LandingSequencePlan.md` y `Landing_Narrative_JSON_Schema.md`.

---

## 1. Panorama general
- El flujo de aterrizaje combina una **experiencia física** (HUD + secuencias de animación) con un **panel Angular** donde el jugador descansa, explora o negocia sin abandonar el planeta.
- `LandingPanelComponent` muestra cabecera, pestañas (Descanso/Exploración/Diplomacia) y bitácora persistente; `LandingMenuComponent` ejecuta acciones y pinta narrativa.
- `LandingActionService` procesa entradas y devuelve `LandingEventResult` (narrativa + efectos). `MissionService` y `LandingNarrativeService` suministran misiones, pistas y textos Lovecraftianos.
- Las secuencias de aterrizaje/despegue (`AnimationManager`) controlan cámaras, bloquean input y suprimen daños para que el panel opere en un estado seguro.

---

## 2. HUD e indicadores
### 2.1 Pilotos "Landing" / "Threat"
| Indicador | Ubicación | Activación |
| --- | --- | --- |
| Landing (verde) | Margen izquierdo del marquee, junto al HUD principal. | `GameEngine.computeLandingStatus()` detecta proximidad ≤50u, velocidad ≤5u/s, alineación |dot(forward, normal)| ≤0.5 mantenida ≥3 s. |
| Threat (rojo) | A la derecha del piloto verde. | `GameEngine.computeLandingThreat()` detecta hostiles ≤500u. | 
`hudManager.setLandingIndicators({ landingReady, threatActive })` actualiza ambos pilotos.

### 2.2 Checklist para aterrizar
1. Reducir velocidad ≤5u/s.
2. Alinear nave con la normal del planeta (±60°).
3. Mantener distancia ≤50u durante 3 s.
4. Confirmar piloto verde encendido y rojo apagado.
5. Pulsar **Enter** cuando `landingStatus.ready` es true y no hay amenazas.

---

## 3. Secuencias de aterrizaje y despegue
### 3.1 LandingSequence
1. `handleKeyDown(Enter)` en espacio (o `maybeTriggerAtmosphereAutoLandingFromInput()` ya en atmósfera) valida `landingStatus.ready`, ausencia de `LandingThreat` y ejecuta `GameEngine.tryStartLandingSequence()` ⇒ `AnimationManager.startLandingSequence()`.
2. Setup: modo cockpit + cámara bloqueada, thrusters en idle, captura snapshot cinético para restaurar velocidad real, colisiones y daños desactivados.
3. Fases: approach (2.4 s), glide rasante (3 s) y fade-out (≈1 s) que entrega la nave a la escena atmosférica.
4. Al terminar llama `notifyLandingSequenceFinished('landed', context)`: invoca `handleLandingTouchdown(context, { skipLandingPanel: true })`, entra en modo atmósfera, silencia música (`silenceMusicForAtmosphere()`), arma `landingPanelAudioFocus` y deja el touchdown pendiente hasta que la nave toque suelo físico o se dispare un auto-landing.

### 3.2 TakeoffSequence
1. Botón **Despegar** en el panel ejecuta `GameEngine.startTakeoffSequence()`.
2. Fases: preparación (1 s), ascenso (4 s), salida (2 s).
3. Restaura dinámica original, vuelve a habilitar daños y desbloquea input.

### 3.3 Touchdown atmosférico y panel
1. `handleLandingTouchdown()` enriquece el `LandingApproachContext`, llama `enterAtmosphereScene()` (si aún no se estaba allí) y aplica impulso inicial para que la nave recupere control.
2. Si `autoLand=true`, `startAtmosphereAutoLandingCamera()` bloquea la cámara a ras de suelo y reproduce polvo + `sfx_autoland_touchdown`. `AtmosphereLandingAnimation` ahora dura 7 s (5 s de descenso + 2 s de giro coreografiado de 90° alineado con la normal y despliegue completo de alas) antes de los 2 s de reposo previos al panel; durante ese tramo final `ParticleEffectsService.startLandingAnchorRig()` dibuja una escalera lumínica y los brazos de anclaje que golpean el suelo mientras progresa `setLandingAnchorRigProgress()`, reproduce el golpe `sfx_anchor` al soltar la estructura y mantiene el polvo volumétrico 100 % visible (el renderer deshabilita el depth test mientras se pintan los billboards). En aterrizajes manuales se libera la cámara de inmediato.
3. Registra la visita del planeta, arma `atmosphereAutoTakeoff` (se disparará cuando superes 1000 u de altura) y desactiva la supresión de daño para que el vuelo atmosférico vuelva a ser físico.
4. El panel solo se abre cuando `skipLandingPanel` es falso. `openLandingPanelWithDelay()` espera 0–2 s según el tipo de touchdown; al abrirse se ejecuta `applyLandingPanelAudioFocus()` para dejar solo el loop de viento y pausar clima/música.

### 3.4 Auto-landing, colisiones y takeoff automático
- `detectAtmosphereGroundCollision()` controla la distancia nave-centro y, al detectar contacto suave (velocidad vertical ≤1 u/s y `landingStatus.ready`), llama nuevamente a `handleLandingTouchdown()` con `autoLand=true` y `deferLandingPanelMs = 2000` para mostrar la cinemática corta antes de abrir el panel.
- Impactos bruscos reutilizan `handleAtmosphereGroundImpact()`: recoloca la nave sobre el suelo, aplica rebote con restitución 0.28, atenúa la componente lateral al 65 % y calcula daño + partículas/SFX.
- La cámara manual auto-landing se libera cuando la velocidad lateral cae por debajo de 0.4 u/s o al iniciar un despegue.
- `maybeTriggerAtmosphereAutoTakeoff()` monitoriza la altitud tras un touchdown y ejecuta `startTakeoffSequence()` automáticamente al superar 1000 u, compartiendo logs y audio con el flujo manual.

Ambas secuencias se precargan en `AnimationManagerService`; los logs usan `LogCategory.GAME_LOOP` y `HUD` para depurar.

---

## 4. Arquitectura del panel
```
LandingPanelComponent
├─ Header: datos del planeta, estado de misión y pistas.
├─ LandingMenuComponent (tabs)
│   ├─ Intel Deck (Descanso + Registro)
│   ├─ Exploration Grid (artefacto, void mass, civilización, lesser being)
│   └─ Diplomacy Chamber (acciones según animosidad)
└─ EventLogSidebar (landingLog persistente)
```
- Los resultados (`LandingEventResult`) alimentan el sidebar, HUD y `GameStateStore.landingLog` (máx. 10 entradas por planeta).
- El footer muestra botones contextuales (repetir acción, cerrar, continuar diálogo).

---

## 5. Servicios y flujo de acciones
1. `LandingMenuComponent` crea `LandingActionRequest` y lo envía a `LandingActionService`.
2. El servicio consulta `LandingNarrativeService`, aplica RNG determinista y ejecuta efectos (`CharacterProfileService`, `CargoHoldService`, `MissionService`).
3. Devuelve `LandingEventResult` con narrativa (`intro`, `options`, `resolution`), `summary`, `effects`, `tags`.
4. La bitácora se actualiza vía `GameStateStore.appendLandingLogEntry`; el HUD reproduce sonidos y animaciones asociadas.

### 5.1 Acciones base
| Acción | Efectos clave | Notas narrativas |
| --- | --- | --- |
| Rest | +1 cordura, +5 salud, +1 día; si hay lesser being ⇒ reveal + penalización | Claves `rest.success` / `rest.interrupted`. |
| Record anomaly | −1 cordura, fija intel de artefacto/void mass | `recordAnomaly` en JSON base. |
| Buscar artefacto | Entrega si presente; confirma ausencia; falla ⇒ −5 salud | `exploration.artifact.*`. |
| Buscar void mass | Rellena void energy, ajusta intel | `exploration.void.*`. |
| Contactar civilización | Revela raza y habilita diplomacia neutral | `exploration.civilization.*`. |
| Encontrar lesser being | Revela intel y puede aplicar −5 cordura | `exploration.lesserBeing.*`. |

---

## 6. Diplomacia y economía de pistas
### 6.1 Estados de animosidad
- **Ally**: reparaciones completas, venta de reliquias (placeholder) y compra de glifos.
- **Neutral**: micro-reparaciones, módulo de pistas, acceso a misión racial.
- **Enemy**: combate obligatorio contra lesser being para volver a Neutral.

### 6.2 Clue Tokens
| Tier | Cómo se obtiene | Coste | Beneficio |
| --- | --- | --- | --- |
| `minor` | Soborno "Escuchar rumores" | 1 metal + 1 orgánico | pista vaga (ej. "doble amanecer") |
| `major` | Submisión rápida ("Calibrar resonador", "Cortar raíz", "Sellar micro-portal") | Acción instantánea, riesgo −5 salud/sanity | marca cluster/planeta en mapa |
| `final` | Ritual "Intercambiar visiones" | −3 cordura (requiere ≥5) | revela ubicación exacta y habilita entrega |

`MissionService` guarda `clueTokens` y `subTasks` dentro de `PlanetMissionState`.

### 6.3 Flujo Neutral → Ally (ej. Profundos)
1. Soborno ⇒ `addClueToken(tier:'minor')`.
2. Submisión `RUN_SUBTASK` ⇒ `major` (si éxito) o penalización.
3. Visión ⇒ `final` a cambio de cordura.
4. `completeMission` exige objetivo físico + `major` + `final`; otorga memoria, setea `planet.animosity = ally`.

### 6.4 Distribución de memoria (≈80 %)
| Raza | % Memoria | Revelación clave |
| --- | --- | --- |
| Mi-Go | 7% | Motor robado de nodos espectrales. |
| Yig | 7% | Promesa de portales serpentarios. |
| Leng | 7% | Recuerdos sellados deliberadamente. |
| Organismo Vegetal | 6% | Polen lúgubre como catalizador. |
| Ángeles Descarnados | 6% | Blindaron la nave a cambio de un precio. |
| Profundos | 6% | Coordenadas del primer portal fallido. |
| Antiguos | 6% | Revelan identidad previa. |
| Dohle | 6% | Rebelión interna del culto. |
| Chthonian | 6% | Motor fracturó la Tierra. |
| Gules | 5% | Destino de la nave nodriza. |
| Ghasts | 5% | Promesa de eliminar primigenios rivales. |
| Vampiro Estelar | 5% | Sangre estelar alimentó el motor. |
| Byhkee | 8% | Te proclaman nuevo heraldo. |

Cada misión entrega su porcentaje a `GameStateStore.memoryPercent` al completarse (`MissionService.completeMission`).

---

## 7. Activos narrativos y formato JSON
### 7.1 Estructura de archivos
Ubicación: `src/app/assets/narrative/landing/`
1. `landing_base.json` – Descanso, anomalías, mensajes comunes.
2. `landing_exploration.json` – Resultados de búsqueda de artefactos, void mass, civilización y lesser being.
3. `landing_diplomacy.json` – Acciones Ally/Neutral/Enemy + plantillas de pistas.
4. `landing_missions_<race>.json` – Diálogos completos por raza (oferta, pistas, turn in, memoria).

### 7.2 Campos estándar
```json
{
  "rest": {
    "intro": { "speaker": "narrator", "text": "..." },
    "options": [ { "id": "rest", "label": "Descansar" } ],
    "outcomes": {
      "success": { "text": "...", "effects": ["+1 cordura", "+5 salud", "+1 día"] },
      "interrupted": { "text": "...", "effects": ["reveal_lesser", "-1 cordura"] }
    }
  }
}
```
- `speaker`: `narrator | race | ai | pilot`.
- `text`: permite multilinea y placeholders (`{planetName}`, `{raceName}`, `{resourceCost}`).
- `options`: botones mostrados por la UI.
- `effects`: listado textual alineado con los cambios reales.
- `requires`: condiciones opcionales (intel, recursos, cordura mínima).

### 7.3 Consumo
`LandingNarrativeService` carga todos los JSON al iniciar el panel y expone métodos:
- `getRestScript()`, `getExplorationScript(actionId)`
- `getDiplomacyScript(animosity, actionId)`
- `getMissionScript(raceId, stage)`

`LandingActionService` pasa los placeholders y sincroniza efectos para que narrativa y gameplay coincidan.

### 7.4 Localización
- Duplicar archivos dentro de `assets/narrative/landing/<locale>/` cuando se agreguen idiomas.
- Mantener keys estables y placeholders exactos.
- `LandingNarrativeService` elegirá idioma según configuración global (pendiente de exponer).

---

## 8. Persistencia y telemetría
- `PlanetIntelSnapshot` guarda recursos, pistas y `landingLog` por planeta.
- `MissionService` serializa `clueTokens`, `subTasks`, `pendingMission` y recompensas.
- HUD refleja eventos importantes para evitar desincronización con el panel.
- Tests pueden inyectar RNG determinista para validar resultados y bitácora.

---

## 9. Mantenimiento recomendado
1. Mantener coherencia entre costes narrados y `landing-diplomacy.config.ts`.
2. Actualizar este documento y la wiki al agregar nuevas razas, acciones o secuencias.
3. Revisar la suma de porcentajes de memoria cada vez que se cambien recompensas.
4. Ejecutar `npm run test` tras tocar `LandingActionService`, `MissionService` o `GameStateStore`.
5. Plan futuro: `PanelStateManager` para gestionar exclusividad/panel locks también aplicará al menú de aterrizaje.

---

Con este consolidado puedes extender el sistema de aterrizaje (narrativa, misiones, secuencias físicas) desde un solo documento sin depender de múltiples planes históricos.
