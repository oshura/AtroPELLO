# Landing Menu Implementation Guide

**Fecha:** 29 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

## 1. Panorama general
- El panel de aterrizaje Angular expone un único flujo: descansas, exploras o negocias sin abandonar el planeta.  
- `LandingPanelComponent` renderiza la carcasa (nombre, métricas y botones globales) y aloja `LandingMenuComponent`, que decide qué columna mostrar según la pestaña activa.  
- `LandingActionService` procesa cada acción y devuelve `LandingEventResult` (narrativa + efectos); la UI traduce ese resultado en HUD, bitácora y actualizaciones de `GameStateStore`.  
- `MissionService` y `LandingNarrativeService` complementan el flujo con pistas diplomáticas y textos lovecraftianos cargados desde JSON.

## 2. Anatomía de la UI
```
LandingPanelComponent
├─ Header con datos del planeta y estado de misión activa
├─ LandingMenuComponent
│   ├─ Intel Deck (Descanso + Registro)
│   ├─ Exploration Grid (Artefacto, Void, Civilización, LesserBeing)
│   └─ Diplomacy Chamber (acciones según animosidad)
└─ EventLogSidebar (historial persistente por planeta)
```
- **Viewport central**: muestra la escena narrativa activa (intro, opciones y resolución).  
- **Sidebar**: lista los últimos eventos con íconos de recursos/effects; se persiste por planeta para retomar contexto aunque cierres el panel.  
- **Footer**: botones contextuales derivados del tipo de resultado (aceptar, repetir acción, cerrar diálogo).

## 3. Flujo de ejecución de acciones
1. El jugador selecciona un botón; `LandingMenuComponent` construye un `LandingActionRequest` con planeta, animosidad y RNG seed.  
2. `LandingActionService.execute(request)` consulta `LandingNarrativeService`, calcula probabilidades (50/50 por defecto) y aplica efectos (`PlayerVitalsService`, `CargoService`, `MissionService`).  
3. El resultado se agrega a la bitácora persistente (`GameStateStore.appendLandingLogEntry`) y la UI refresca `actionLog`, HUD y métricas visibles.  
4. Si el resultado modifica intel o misiones, `MissionService` y `GameStateStore.upsertPlanetIntelSnapshot` propagan el nuevo estado para futuros aterrizajes.

## 4. Intel Deck y acciones de exploración
| Acción | Implementación | Efectos | Notas narrativas |
| --- | --- | --- | --- |
| **Rest / Descansar** | `LandingActionService.rest` | `+1 sanity`, `+5 health`, `+1 día`. Si existe `lesserBeing`, revela `lesserBeingIntelStatus`, aplica `-1 sanity`, `-5 health`. | Textos en `landing_base.json` (éxito, interrupción). |
| **Registrar anomalía** | `LandingActionService.recordAnomaly` | Consume `1 sanity`, fija el último intel (`artifactIntelStatus`, `voidMassIntelStatus`) en snapshot para compartir con misiones. | Reusa sonidos de sensor y genera log corto.
| **Buscar artefacto** | `LandingActionService.searchArtifact` | Éxito con artefacto ⇒ entrega y XP; éxito sin artefacto ⇒ `artifactIntelStatus = confirmed_absent`. Fallo ⇒ `-5 health`. | Diálogos diferenciados (artefacto hallado vs. ruinas vacías). |
| **Encontrar void mass** | `LandingActionService.findVoidMass` | Éxito ⇒ `voidEnergy = max`, `voidMassIntelStatus = confirmed_present`. Fallo ⇒ `-5 health`, estado `suspected`. | Descripciones de cataratas gravitatorias. |
| **Contactar civilización** | `LandingActionService.contactCivilization` | Éxito ⇒ `civilizationIntelStatus = known`, habilita Diplomacia Neutral. Fallo ⇒ daño menor. | Usa nombres de raza desde `landing_diplomacy.json`. |
| **Encontrar lesserBeing** | `LandingActionService.findLesserBeing` | Éxito ⇒ revela `lesserBeingIntelStatus` y aplica penalización temporal de cordura si existe criatura. | Narrativa enfatiza cantos inversos y precio mental. |

Todas las tiradas usan el RNG proporcionado por `LandingActionService` para permitir tests deterministas. Los resultados incluyen resúmenes cortos ya listos para el sidebar.

## 5. Diplomacia y misiones
### 5.1 Estados de animosidad
- **Ally**: botones para reparación total (10 metales), catálogo de reliquias (placeholder con aviso) y compra de dos glifos por raza. `shareLifetime` restaura salud/cordura a la vez que incrementa `ageDays` (20–30).  
- **Neutral**: micro-reparaciones pagadas, acceso al módulo de pistas y recepción/entrega de la misión racial activa. Todos los costes se referencian en `landing-diplomacy.config.ts`.  
- **Enemy**: obliga a enfrentar al `lesserBeing`. Una victoria limpia el flag y regresa el planeta a Neutral.

### 5.2 Misiones planetarias
1. `MissionService.offerMission(raceId)` se invoca tras un `contactCivilization` exitoso; asocia el planeta a un `PlanetMissionState`.  
2. Las pistas se materializan como `ClueToken` con tiers `minor`, `major` y `final`, visibles en el panel lateral.  
3. Completar la misión ajusta `planet.animosity = ally`, otorga memoria (`memoryPercent += race.memoryShare`, ~6% promedio) y agrega un evento narrativo en el log persistente.  
4. Los objetivos pueden apuntar a clusters o planetas existentes; `MissionService` marca la ubicación y la UI muestra un resumen en el header del panel.

### 5.3 Distribución de memoria por raza
| Raza | Tipo misión | % Memoria | Revelación clave |
| --- | --- | --- | --- |
| MI_GO | Artefacto `Nodo Espectral` | 7% | El motor usa tecnología robada a los MI-GO. |
| YIG | Material `Veneno de Muda` | 7% | La secta prometió portales para Yig. |
| LENG | Artefacto `Campana de Leng` | 7% | Sellaron tus recuerdos para proteger la alianza. |
| ORGANISMO_VEGETAL | Material `Polen Lúgubre` | 6% | El polen alimentó prototipos del motor. |
| ANGELES_DESCARNADOS | Artefacto `Pluma de Vacío` | 6% | Blindaron la nave durante el cataclismo. |
| PROFUNDOS | Material `Perla Tétrica` | 6% | Revelan las coordenadas del primer portal fallido. |
| ANTIGUOS | Artefacto `Cubo Hipergeométrico` | 6% | Recuperas recuerdos previos al golpe. |
| DOHLE | Material `Resina Coralina` | 6% | Confirman la rebelión interna del culto. |
| CHTHONIAN | Artefacto `Órgano Sísmico` | 6% | El motor fracturó la Tierra. |
| GULES | Material `Hueso Cantor` | 5% | Explican el destino de la nave nodriza. |
| GHASTS | Artefacto `Espejo de Penumbra` | 5% | El culto juró destruir primigenios rivales. |
| VAMPIRO_ESTELAR | Material `Hemoplasma Estelar` | 5% | Usaste sangre estelar para alimentar el motor. |
| BYHKEE | Artefacto `Lira de Viento Negro` | 8% | Te proclaman heraldo destinado a sustituir primigenios. |

## 6. Activos narrativos y servicios
- `LandingNarrativeService` carga JSON desde `src/app/assets/narrative/landing/` (base, exploración, diplomacia y un archivo por raza).  
- Cada acción referencia claves específicas (`rest.success`, `exploration.artifact.failure`, etc.) para mantener consistencia.  
- Las plantillas usan placeholders (`{planetName}`, `{resourceCost}`) sustituidos por el servicio antes de renderizar.  
- El copy incluye los efectos mecánicos dentro del texto para que el jugador no dependa solo del HUD.

## 7. Persistencia y telemetría
- `GameStateStore` mantiene `PlanetIntelSnapshot` con recursos, pistas y ahora la bitácora (`landingLog`).  
- `LandingMenuComponent` lee la bitácora persistida al abrirse y la vuelve a escribir tras cada acción; se conserva un máximo de 10 eventos por planeta.  
- `hudManager` refleja el último evento importante (sanity/health cambios) para mantener coherencia entre HUD y panel.  
- Los tests unitarios pueden inyectar un RNG determinista y verificar que la bitácora capture los resultados esperados.

## 8. Mantenimiento recomendado
- Mantén sincronizados los costes de recursos en `landing-diplomacy.config.ts` y en el copy narrativo.  
- Al agregar nuevas razas o acciones, extiende el JSON correspondiente y actualiza `LandingActionService` para devolver `LandingEventResult` completos.  
- Revisa regularmente los porcentajes de memoria para asegurar que el total útil se mantiene alrededor de 80%.  
- Ejecuta `npm run test` tras tocar `LandingActionService`, `MissionService` o `GameStateStore` para asegurar que los contratos compartidos no se rompan.  
- Cuando se añadan traducciones, duplica los JSON actuales y referencia la lengua mediante loaders de `LandingNarrativeService`.

Este documento describe la implementación vigente del menú de aterrizaje, los servicios que lo soportan y los contratos necesarios para extenderlo sin regresar a planes abstractos.
