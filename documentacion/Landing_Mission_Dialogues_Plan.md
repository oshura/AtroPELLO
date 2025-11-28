# Landing Mission Dialogues & Clue Economy Plan

**Fecha:** 28 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

---
## 1. Objetivos narrativos
- Transformar el estado **Neutral → Ally** en una experiencia dialogada con pistas, sobornos y favores menores.
- Alinear todas las razas lovecraftianas con tonos coherentes: comunicación telepática, coros vegetales, cánticos submarinos, etc.
- Permitir que el jugador compre o gane **pistas** sobre el destino del artefacto/material raro del encargo principal.
- Introducir **submisiones de pista** (micro-tareas) que graban progreso sin completar la misión principal.
- Garantizar que cada misión entregue un fragmento distinto del misterio global (80 % de memoria pendiente).

---
## 2. Flujo general de Diplomacia Neutral
```
Neutral Landing Panel
├─ Reparar nave / Curación rápida (sin cambios)
├─ Misiones de raza
│  ├─ Ver misión → abre diálogo principal
│  ├─ Aportar pistas (si ya se poseen)
│  └─ Completar misión (requiere artefacto/material + pista final)
└─ Conversaciones opcionales
    ├─ "Escuchar rumores" (trueque de materiales por pista leve)
    ├─ "Ofrecer ayuda menor" (submisión corta → pista media)
    └─ "Intercambiar visiones" (consumir cordura → pista mayor)
```
- Cada interacción devuelve un **Clue Token** con nivel `minor | major | final` almacenado en el estado del planeta.
- La misión principal requiere al menos un `major` + el objetivo físico para pasar a Ally; `final` desbloquea coordenada exacta.

---
## 3. Clue Economy
| Tipo de pista | Cómo se obtiene | Coste | Efecto mecánico |
|---------------|-----------------|-------|------------------|
| **Susurro menor** | Soborno directo (1 metal + 1 orgánico). | Recursos comunes. | +1 entrada en el log con referencia vaga al sistema ("busca un sol binario"). |
| **Recado veloz** | Submisión corta (ej. reparar baliza, escoltar dron, purgar micro-portal). | Acción instantánea en landing panel (tirada 50/50, -5 PV en fallo). | Marca el cluster/planeta en el mapa del sistema actual (sin coordenadas internas). |
| **Visión compartida** | Ritual mental (pierde 3 cordura temporal). | Sin recursos; requiere `sanity >= 5`. | Desbloquea `finalClue`: nombre del planeta o ID del cloud, activa waypoint HUD. |

Submisiones disponibles únicamente mientras `planet.animosity === NEUTRAL`. Al volverse Ally desaparecen.

---
## 4. Estructura de diálogo
Cada conversación sigue este patrón:
1. **Escena** (narrador Lovecraftiano, coherente con la especie).
2. **Opciones iniciales**
   - `Preguntar por el origen del encargo`
   - `Negociar pistas`
   - `Indagar sobre los peligros`
   - `Rechazar cortesmente` (sale del diálogo)
3. **Opciones derivadas**
   - `Ofrecer materiales` → genera pista menor.
   - `Aceptar recado rápido` → lanza submisión.
   - `Entregar sacrificio mental` → visión.
4. **Resolución**
   - Actualiza `PlanetMissionState.log`, registra pista y altera `landingLog`.

---
## 5. Submisiones tipo
| Nombre | Descripción narrativa | Tirada | Recompensa |
|--------|----------------------|--------|-----------|
| **Calibrar resonador** | Ajustar antena espiritual de la raza para escuchar ecos del artefacto. | 50 % éxito. Fallo = -5 PV. | `majorClue` + 1 día edad. |
| **Cortar raíz infecta** | Eliminar brote de materia negra cerca del asentamiento. | 60 % éxito si nave tiene >50 % salud. | `majorClue` + sana 5 PV. |
| **Sellar micro-portal** | Use an anchoring pulse (simulado) para cerrar grieta. | 40 % éxito, fallo = -5 cordura temporal. | `finalClue` si éxito perfecto. |

Cada raza selecciona 1-2 submisiones específicas para mantener coherencia.

---
## 6. Reparto de memoria (80 %)
| Raza | % Memoria | Revelación temática |
|------|-----------|---------------------|
| MI_GO | 7 % | El motor fue copiado de nodos espectrales robados a los Mi-Go. |
| YIG | 7 % | La secta prometió abrir portales serpentinos para Yig a cambio de venenos. |
| LENG | 7 % | El protagonista ya negoció con Leng antes del accidente; memoria borrada intencionalmente. |
| ORGANISMO_VEGETAL | 6 % | El polen lúgubre sirvió como catalizador del motor. |
| ANGELES_DESCARNADOS | 6 % | Ellos protegieron la nave durante el cataclismo, pero exigieron un precio. |
| PROFUNDOS | 6 % | Custodian coordenadas del primer portal fallido. |
| ANTIGUOS | 6 % | Guardan recuerdos previos al golpe que borró la identidad. |
| DOHLE | 6 % | Hubo una rebelión interna del culto; el piloto fue parte. |
| CHTHONIAN | 6 % | Explican que el motor fracturó la Tierra generando la grieta central. |
| GULES | 5 % | Devora-tripulaciones: confiesan el destino de la nave nodriza. |
| GHASTS | 5 % | El culto juró eliminar primigenios rivales; queda uno por revelar. |
| VAMPIRO_ESTELAR | 5 % | La sangre estelar alimentó el motor antes del desastre. |
| BYHKEE | 8 % | Proclaman que el jugador está destinado a reemplazar a los primigenios.

La entrega de memoria se realiza tras `completeMission` + `finalClue`.

---
## 7. Race-specific dialogue seeds
> Resumen abreviado; cada raza contará con un bloque narrativo completo en un JSON (ver sección 10 del plan previo).

### MI_GO (telepatía clínica)
- **Escena inicial:** "Las placas metálicas de sus cráneos vibran al ritmo de tus latidos."
- **Soborno:** Exigen **lingotes de hierro lunar** para revelar la órbita del artefacto `Nodo Espectral`.
- **Submisión:** Calibrar un resonador mi-go (mayor pista).
- **Visión:** Compartir memoria = muestran cómo la secta robó sus planos.

### YIG (liturgia serpentaria)

*(En la versión final cada raza tendrá: intro, pistas, submisión, visión, memoria reveal. Ver archivo completo para los 13 bloques.)*

### Flujo Neutral → Aliado (Profundos)
1. **Entrada**: el jugador selecciona *Diplomacia → Soborno ritual*. `LandingActionService.handleDiplomacyBribe` descuenta `{ metal:1, organic:1 }` del `Planet.resourceStock` y llama `MissionService.addClueToken(..., tier:'minor')`. El HUD muestra la pista "doble amanecer" y la bitácora registra el soborno.
2. **Recado**: el botón *Sellar micro-portal* invoca `LandingDiplomacyAction.RUN_SUBTASK`. El servicio registra/actualiza la submisión `seal-micro-portal`, lanza tirada 55 % y usa `MissionService.setSubTaskStatus`. Éxito concede pista `major`, fracaso aplica `-5 salud` y marca el recado como `failed`.
3. **Visión**: tras conseguir al menos un `major`, el piloto puede pagar 3 puntos de cordura (`CharacterProfileService.adjustVitals`) para `handleDiplomacyVision`, que agrega el `final` clue mediante `MissionService.addClueToken(..., method:'vision')`.
4. **Entrega**: con los tres niveles (`minor/major/final`) disponibles, el botón *Entregar misión* dispara `LandingDiplomacyAction.COMPLETE_MISSION`. Si las pistas faltan, el servicio responde con bloqueo y enumera `getMissingClueTiers`; si están presentes, `MissionService.completeMission` distribuye memoria/recompensas y la UI habilita la transición a estado Ally.
5. **Memoria distribuida**: al completarse la misión, el `PlanetMissionReward.memorySharePct` (7 % para Profundos) incrementa `GameStateStore.memoryPercent` y habilita la escena narrativa indicada en la tabla del apartado 6.

Este flujo ya está conectado al menú de aterrizaje: los botones Rest/Explorar permanecen iguales mientras Diplomacia administra la mini-economía de pistas y submisiones descrita en esta sección.

---
## 8. Ejemplo completo de diálogo (Profundos)
```
Escena: El anfiteatro submarino se llena de agua negra hasta los tobillos. Una voz burbujea en tu mente.
Opciones iniciales:
1. "Recordadme qué buscáis exactamente."
2. "Traigo materiales para vuestras arcas."
3. "Tal vez pueda ayudar como emisario."
4. "Me retiraré por ahora."

1 → Explican que el artefacto es la "Perla Tétrica" oculta en un sol frío.
2 → Requiere 1 metal + 1 orgánico. Resultado: Clue menor ("Busca doble amanecer en el sistema de mareas rotas").
3 → Activa submisión "Sellar micro-portal". Éxito = Clue mayor (marcan planeta acuático). Fallo = -5 cordura, log narrado.
Visión (desbloqueada tras submisión): pierdes 3 cordura para ver cómo la secta abrió el primer portal cerca del océano.
```

---
## 9. Integración técnica
- Extender `PlanetMissionState` (ya preparado) con campos `clueTokens` y `subTasks` (follow-up PR).
- `LandingActionService` recibirá eventos `requestClue(type)` y `performSubMission(type)` que delegan en `MissionService`.
- `HUDManager` mostrará última pista obtenida.
- Clues se serializan en snapshots dentro de `planet.pendingMission`.

---
## 10. Próximos pasos
1. Serializar diálogos por raza (JSON) y mapearlos en `MissionService`.
2. Implementar submisiones como micro-acciones reutilizando el sistema de probabilidades del menú de exploración.
3. Añadir UI en el landing panel para mostrar pistas acumuladas y costes de soborno.
4. Conectar recompensas de memoria (MissionService ya tiene hook `reward`).

---
Este documento marca la ruta creativa y mecánica para dotar de coherencia lovecraftiana a los diálogos de misiones y su economía de pistas.
