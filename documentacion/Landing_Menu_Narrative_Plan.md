# Landing Menu Narrative Reference

**Fecha:** 27 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

Este documento describe cómo se consumen y mantienen los textos lovecraftianos que acompañan al menú de aterrizaje. Sustituye el plan antiguo y refleja el estado real del sistema.

## 1. Tubería narrativa
- **Fuentes**: `src/app/assets/narrative/landing/` contiene `landing_base.json`, `landing_exploration.json`, `landing_diplomacy.json` y un archivo por raza (`landing_missions_<race>.json`).  
- **Loader**: `LandingNarrativeService` carga todos los JSON al iniciar el panel y ofrece consultas tipadas (`getRestScript`, `getExplorationScript(action)`, `getMissionScript(raceId, stage)`).  
- **Consumidores**: `LandingActionService` arma `LandingEventResult` con la narrativa apropiada y la UI la renderiza en `LandingMenuComponent`.  
- **Contratos**: cada entrada incluye `intro`, `playerOptions` y `resolution`. Los efectos mecánicos se duplican en texto para mantener coherencia con el HUD.

## 2. Scripts por dominio
### 2.1 Intel & descanso
- `rest.success` y `rest.interrupted` describen las variaciones cuando hay `lesserBeing`.  
- `recordAnomaly` explica la pérdida de cordura y la utilidad de fijar intel antes de despegar.  
- Todos los textos mencionan explícitamente `+1 cordura`, `+5 salud`, etc., para que el jugador entienda la consecuencia sin mirar la hoja de personaje.

### 2.2 Exploración
| Acción | Claves JSON | Variantes | Notas |
| --- | --- | --- | --- |
| Buscar artefacto | `exploration.artifact.intro/success_has/success_absent/failure` | 3 desenlaces + 1 fracaso | Incluir nombre del artefacto cuando esté presente; la UI injecta `{artifactName}`. |
| Encontrar void mass | `exploration.void.*` | Éxito y fracaso | Menciona el zumbido del motor y el riesgo de quemaduras gravitacionales. |
| Contactar civilización | `exploration.civilization.*` | Éxito y fracaso | Usa `{raceName}` para personalizar. |
| Encontrar lesserBeing | `exploration.lesserBeing.*` | Éxito y fracaso | Describe el coste mental (`-5 cordura`) y cuándo se desbloquea la pelea enemiga. |

### 2.3 Diplomacia
- `landing_diplomacy.json` agrupa secciones `ally`, `neutral` y `enemy`. Cada acción incluye `intro`, `options` (lista) y `resolution`.  
- Las pistas (`hearRumors`, `offerMinorHelp`, `shareVisions`) escalan el tono desde rumores hasta compartir visiones con coste de cordura.  
- El combate contra `lesserBeing` reutiliza la narrativa `enemy.duel` y apunta al mismo `LandingEventResult` que actualiza animosidad.

### 2.4 Misiones por raza
Cada archivo `landing_missions_<race>.json` contiene:
- `offer`: escena de presentación y diálogo de petición.  
- `clues`: textos para `minor`, `major` y `final`.  
- `turnIn`: revelación cuando el jugador entrega el artefacto/material.  
- `memory`: fragmento de recuerdo asociado (debe mencionar el porcentaje otorgado, ~6% salvo excepciones).  
`MissionService` coordina qué bloque se muestra según `PlanetMissionState.status`.

## 3. Campos de `LandingEventResult`
- `narrative`: array ordenado de pasos (`intro`, `option`, `resolution`).  
- `summary`: una línea breve usada en la bitácora persistente.  
- `effects`: refleja los cambios aplicados (salud, cordura, memoria, intel). Asegúrate de que la narrativa mencione lo mismo para evitar ambigüedades.  
- `tags`: usado para filtrar en la UI (ej. `['rest', 'ally']`). Añade tags coherentes para permitir búsquedas futuras.

## 4. Guía de estilo
- Evita tecnicismos directos; describe sensaciones físicas o auditivas antes de enumerar efectos.  
- Usa segunda persona y vocabulario lovecraftiano (constelaciones imposibles, cantos reversos, etc.).  
- Siempre termina con la consecuencia práctica (“Ganas +1 cordura y +5 salud”).  
- Mantén frases breves para que quepan en el panel sin scroll excesivo.

## 5. Extender la narrativa
1. Añade nuevas claves al JSON correspondiente con `id` estable (snake_case).  
2. Actualiza `LandingNarrativeService` para exponer la clave si es un nuevo tipo de acción.  
3. Amplía `LandingActionService` para consumirla y generar un `LandingEventResult`.  
4. Si la acción modifica memoria u otros estados, documenta el cambio en `Landing Menu Implementation Guide` y en el copy.

## 6. Localización
- El formato actual es fácilmente duplicable; duplica cada JSON dentro de `assets/narrative/landing/<locale>/` cuando agreguemos otros idiomas.  
- Todos los placeholders (`{planetName}`, `{resourceCost}`, `{memoryShare}`) deben mantenerse al traducir.  
- `LandingNarrativeService` seleccionará el idioma según la configuración global del juego (pendiente de exponer). Mientras tanto, los textos están en español neutral.

## 7. Checklist de mantenimiento
- [x] JSON base (rest, anomalías, exploración).  
- [x] Scripts diplomáticos Ally/Neutral/Enemy con costes alineados al gameplay.  
- [x] Misiones por raza con porcentajes de memoria (total 80%).  
- [ ] Revisar economía de recursos para sobornos y curaciones (señalar en roadmap si cambia).  
- [ ] Preparar variantes de diálogos para perks o estados especiales (cordura <20%, memoria ≥80%).

Con esta referencia puedes rastrear dónde vive cada línea narrativa, cómo se enlaza con los servicios de aterrizaje y qué pasos seguir al añadir o modificar textos.


