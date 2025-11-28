# Landing Menu & Narrative Overhaul Plan

**Fecha:** 27 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

## 1. Objetivos
- Unificar la experiencia de aterrizaje en un menú ramificado con botones.
- Introducir resultados mecánicos claros para descanso, exploración y diplomacia.
- Integrar señales narrativas lovecraftianas que desbloqueen memoria, hechizos y estados de planeta.
- Preparar un marco para misiones planetarias (neutral → aliado) y su impacto en la historia principal.

## 2. Situación actual
- `LandingStatus`, `LandingApproachContext` y `LandingThreatState` existen en `src/app/game/types/landing.types.ts` pero el menú in situ es mínimo.
- El modelo `Planet` ya expone `inhabitants`, `lesserBeing`, `visited`, `lifeScanned`, `creatureScanned` y `animosity` (ver `src/app/game/game-objects/Planet.ts`); lo que falta es engancharlos con el nuevo menú y persistir el intel ampliado.
- No hay sistema de misiones planetarias ni rastreo de artefactos / void mass / intel.

## 3. Sistemas a extender
1. **Modelo Planetario**
   - Nuevos campos persistentes:
     - `hasArtifact`, `artifactIntelStatus` (`unknown | confirmed_present | confirmed_absent`)
     - `hasVoidMass`, `voidMassIntelStatus`
     - `civilizationIntelStatus`, `lesserBeingIntelStatus`
     - `pendingMission?: PlanetMissionState`
     - `resourceStock` (raw materials por tipo para transacciones).
2. **Personaje / Nave**
   - `sanity`, `health`, `voidEnergy` actualizados por acciones.
   - `ageDays` y `memoryPercent` (nuevo) para progresión narrativa.
3. **Landing UI**
   - Panel Angular con secciones: `Descanso`, `Explorar`, `Diplomacia`.
   - Botones secundarios contextuales según animosidad.
   - Log de eventos instantáneo (para describir resultados y mostrar diálogos).
4. **Mission Service**
   - Genera pedidos de artefacto/material, enlaza con clusters/planetas existentes y resetea intel.
   - Expone `completeMission` para actualizar animosidad y memoria.

## 4. Flujo del menú de aterrizaje
```
Landing Menu
├─ Rest (always visible)
├─ Explore (opens sub-grid)
│  ├─ Buscar artefacto
│  ├─ Encontrar void mass
│  ├─ Contactar civilización
│  └─ Encontrar lesserBeing
└─ Diplomacia (options depend on planet.animosity)
```
- Cada botón lanza un "evento" con narrativa + consecuencias mecánicas.
- Resultados se muestran en un panel de conversación: narrador → opciones → respuesta.
- Diálogos se estructuran como `[Escena] -> [Opciones del jugador] -> [Resolución + cambios]`.

## 5. Acción "Rest / Descansar"
- **Chequeos previos:** requiere recursos de la nave ≥ estado mínimo (combustible no afectado).
- **Lógica:**
  - Recupera `+1 cordura`, `+5 salud`, `ageDays += 1`.
  - Si `planet.lesserBeing !== null` ⇒ descanso interrumpido:
    - Revela `lesserBeingIntelStatus = known_present`.
    - Aplica `-1 cordura`, `-5 salud` (neto: resultado negativo).
    - Descripción narrativa de ataque nocturno.
- **Diálogo sugerido:**
  - **Inicio:** "Acampas junto a la estela magnética del motor, dejando que la arena púrpura silencie la radio." 
  - **Opción única:** "Descansar".
  - **Resultados:**
    - *Éxito:* "Sueñas con constelaciones imposibles. Al despertar, la cabeza pesa menos y las heridas cierran." 
    - *Interrumpido:* "Un chillido subarmónico rompe el refugio; la criatura del planeta muerde tu consciencia antes de que puedas levantarte."

## 6. Acción "Explorar" y subopciones
| Subopción | Requisitos | Probabilidades | Efectos mecánicos | Intel afectado | Diálogo base |
|-----------|------------|----------------|-------------------|----------------|--------------|
| **Buscar artefacto** | Planeta debe tener `hasArtifact` flag (aunque jugador puede ignorarlo) | 50% éxito: si hay artefacto ⇒ lo obtiene; si no, intel pasa a `confirmed_absent` (+1 XP). 50% fallo ⇒ `-5 salud`, sin cambio de intel ("fractura"), `needsRetry = true`. | +2 días edad siempre. | `artifactIntelStatus` | Escena en ruinas con ecos de culto. Opciones para arriesgarse o retirarse (retirada cancela acción). |
| **Encontrar void mass** | Nave con vacío parcial (`voidEnergy < max`) | 50% éxito ⇒ `voidEnergy = max`, log de energía. 50% fallo ⇒ `-5 salud`, sin energía. | +2 días edad. | `voidMassIntelStatus` | Catarata gravitacional subterránea. |
| **Contactar civilización** | `inhabitants !== NONE` | 50% éxito ⇒ revela presencia/ausencia, set `civilizationIntelStatus`. +1 XP si descubres que no hay. 50% fallo ⇒ `-5 salud`, estado diplomático sin cambios. | +2 días edad. | `lifeScanned` gating se marca si éxito. | Plaza, emisarios telepáticos, etc. |
| **Encontrar lesserBeing** | N/A | 50% éxito ⇒ revela `lesserBeingIntelStatus`. Si había y se descubre ⇒ `sanity -= 5 (temp)`. 50% fallo ⇒ `-5 salud`. | +2 días edad. | Intel lesser. | Ritual en catacumbas. |

### Narrativa/Diálogo Template (cada subopción)
1. **Narrador** describe el escenario (2-3 frases Lovecraftianas).
2. **Opciones del jugador:** "Continuar", "Retirarse" (segura, sin progreso) o "Escuchar susurros" (da ventaja futura si implementamos perks).
3. **Resolución:** dos variantes (éxito/fracaso) con descripciones únicas.

#### Ejemplo (Buscar artefacto)
- *Intro:* "Sigues las runas talladas en pilares basálticos hasta una cámara donde el aire huele a ozono quemado."
- *Éxito (artefacto presente):* "Entre la grava hallas un prisma translúcido: la firma energética coincide con los planos del culto."
- *Éxito (confirmado ausente):* "Solo encuentras nichos vacíos. Las inscripciones indican que el guardián evacuó el tesoro hace siglos; queda constancia en tus registros."
- *Fracaso:* "Un mecanismo despierta, inundando la estancia con agujas de luz negra. Te retiras malherido, aún sin respuestas."

## 7. Diplomacia según animosidad
### Ally
- **Reparar nave (10 raw material)**: restaura salud nave completa, describe jukebox de forja.
- **Comerciar**: placeholder (pendiente de diseño, mostrar catálogo vacío con nota).
- **Profundizar en sabiduría**: compra de glifos (lista de 2 por raza). Texto: "El consejo despliega pergaminos vivos; negocian runas a cambio de materiales esotéricos."
- **Misiones especiales**: botones ocultos hasta que existan misiones de zona.
- **Compartir tiempo de vida**: `sanity = max`, `health = max`, `ageDays += Random(20-30)`. Narrativa de convivencia prolongada.

### Neutral (por defecto)
- **Reparar 10% nave (1 metal)**, **Curarse 10 vida (1 no metálico)**.
- **Misiones de raza**:
  - UI muestra objetivo activo (artefacto o material). Botones: "Ver misión" (abre diálogo), "Entregar" (si cargo contiene item).
  - Al completar ⇒ cambia animosidad a Ally, limpia item del cargo, otorga `memoryPercent += raza.memoryShare`.

### Enemy (lesserBeing activo)
- Único botón: **Luchar con lesserBeing**.
  - Resolución: combate instanciado (placeholder). Recompensas: `+25 XP`, `sanity = max`, `health = current / 2`, `ageDays += 2`.
  - Si victoria ⇒ `lesserBeing = null`, animosidad vuelve a `Neutral` (o `Ally` si misión cumplida).
  - Narrativa: "Descendiste a la sima donde la criatura cantaba tu nombre en reversa."

## 8. Marco de misiones Neutral → Ally
1. **Generación**
   - Trigger: primer contacto exitoso (`Contactar civilización`).
   - Selecciona plantilla según raza:
     - *Artefacto perdido:* asocia un planeta ya visitado (o nuevo) y alterna `artifactIntelStatus` a `unknown` para forzar búsqueda.
     - *Material raro:* añade un "cloud" al sistema indicado con ítem especial.
2. **Datos de misión (PlanetMissionState)**
   - `type: 'artifact' | 'material'`
   - `targetLocation`: { systemId, planetId? clusterId? }
   - `itemId`, `description`, `dialogueScriptId`
   - `status: 'offered' | 'in-progress' | 'ready-to-turn-in' | 'completed'`
3. **Diálogos**
   - Escena inicial con tres preguntas:
     1. Historia de la petición.
     2. Detalles del destino (pistas geográficas).
     3. Consecuencias de ayudar.
   - Tras completar, escena de revelación + entrega de fragmento de memoria (texto místico).

## 9. Misiones por raza y memoria
Memoria pendiente: 80%. Se reparte proporcionalmente (≈6.15% c/u). Se puede ajustar: 8 razas clave a 7% y 5 razas menores a 5%. Propuesta:

| Raza | Tipo misión | Ubicación sugerida | Recompensa narrativa | % Memoria |
|------|-------------|-------------------|----------------------|-----------|
| MI_GO | Artefacto "Nodo Espectral" enterrado en planeta helado. | Sistema con portales fallidos (ej. Gliese C). | Revelan que el culto financió el motor con tecnología robada a MI-GO. | 7% |
| YIG | Material "Veneno de Muda" en asteroides de cobre verde. | Cinturón en sistema serpentino. | Insinúan que la secta prometió abrir portales para Yig. | 7% |
| LENG | Artefacto "Campana de Leng" en planeta brumoso. | Luna en sistema binario. | Narran que el protagonista ya negoció con ellos antes del amnesia. | 7% |
| ORGANISMO_VEGETAL | Material "Polen Lúgubre" en jungla radiactiva. | Planeta selvático. | Revelan que el culto probó el motor alimentándolo con este polen. | 6% |
| ANGELES_DESCARNADOS | Artefacto "Pluma de Vacío". | Escombros orbitando estrella moribunda. | Confiesan que protegieron la nave durante el cataclismo. | 6% |
| PROFUNDOS | Material "Perla Tétrica" en océano profundo. | Planeta acuático. | Revelan coordenadas del primer portal fallido. | 6% |
| ANTIGUOS | Artefacto "Cubo Hipergeométrico". | Ruinas en planeta ártico. | Muestran recuerdos previos al golpe en la cabeza. | 6% |
| DOHLE | Material "Resina Coralina". | Asteroide volcánico. | Dicen que el jugador fue parte de una rebelión interna del culto. | 6% |
| CHTHONIAN | Artefacto "Órgano Sísmico". | Núcleo de planeta fracturado. | Explican que el motor causó la rotura de la Tierra. | 6% |
| GULES | Material "Hueso Cantor". | Catacumbas de planeta desierto. | Describen cómo devoraron a tripulantes de la nave nodriza. | 5% |
| GHASTS | Artefacto "Espejo de Penumbra". | Mundo subterráneo. | Revelan que el culto juró destruir primigenios rivales. | 5% |
| VAMPIRO_ESTELAR | Material "Hemoplasma Estelar". | Nebulosa infestada. | Recuerdos del protagonista usando sangre estelar para alimentar el motor. | 5% |
| BYHKEE | Artefacto "Lira de Viento Negro". | Cima de planeta ventoso. | Confirman que el jugador es el "heraldo" destinado a sustituir a los primigenios. | 8% |

_Total revelado tras 13 alianzas: 80%._

## 10. Plantillas de diálogo
### Formato general
```
Escena: <Descripción>
Opciones del jugador:
1. Preguntar por el origen.
2. Preguntar por el destino.
3. Preguntar por la recompensa.
Resoluciones:
- Respuesta 1...
- Respuesta 2...
- Respuesta 3...
```

### Ejemplos resumidos
- **Rest (éxito):** "El motor suspira. Ganas 1 cordura, 5 salud." → botón "Aceptar".
- **Rest (interrumpido):** "La sombra del lesserBeing cruza el campamento. Pierdes 1 cordura/5 salud, intel actualizado." → botón "Levantar el campamento".
- **Buscar artefacto (éxito):** muestra nombre de artefacto obtenido, XP, intel.
- **Buscar artefacto (fracaso):** describe trampa, aplica daño.
- **Void mass éxito:** "La cascada gravitatoria llena los depósitos."
- **Contactar civilización (éxito):** describe primer contacto + revela habitantes.
- **Encontrar lesserBeing (éxito):** "Lo ves, pero el precio es la cordura." Aplicar -5.
- **Enemy fight victoria:** narrativa de duelo, muestra nuevas opciones desbloqueadas.
- **Neutral misión ofrecida:** ver tabla de razas para ganchos.

## 11. Plan de implementación (alto nivel)
1. **Datos & servicios**
   - Extender `Planet` y `GameState` con flags descritos.
   - Crear `LandingActionService` que calcule probabilidades, aplica daños y retorna "LandingEventResult" (texto + efectos + intel changes).
2. **UI**
   - Nuevo componente `landing-menu` con layout responsive (botones + panel de diálogo + log history).
   - Integrar binding con `LandingActionService` y `MissionService`.
3. **Narrativa**
   - Serializar diálogos en JSON (por raza y acción) para facilitar localización.
   - Hooks para actualizar `memoryPercent` y disparar escenas globales cuando se alcanzan hitos (ej. 50%).
4. **Mecánicas**
   - Implementar costes de materiales y verificación de inventario.
   - Añadir scheduler para spawns de misiones (clusters con materiales únicos).
5. **QA**
   - Pruebas unitarias de transición de animosidad.
   - Simulaciones de 100 aterrizajes para validar distribuciones 50/50.

## 12. Pendientes futuros
- Catálogo de comercio Ally (trajes, botas, módulos) a definir por diseño.
- Sistema de combate planetario para resolver "Luchar con lesserBeing".
- Localización multi-idioma de diálogos.

---
Este plan cubre la estructura narrativa, requisitos de datos y flujos de UI necesarios para construir el nuevo menú de aterrizaje y las misiones asociadas a cada raza lovecraftiana.

## 13. Seguimiento de progreso
Usa esta checklist para marcar los hitos conforme avancemos. Actualízala al finalizar cada bloque:

- [x] Persistencia y ampliación del modelo planetario (`Planet`, `GameState`, intel de artefacto/void mass).
- [x] Servicios de acciones de aterrizaje (`LandingActionService`, cálculos de probabilidades, efectos HUD).
- [x] UI del menú de aterrizaje (componentes Angular, submenús de descanso/exploración/diplomacia).
- [ ] Motor de misiones planetarias y transición Neutral → Ally.
- [ ] Integración de narrativa/diálogos por raza y fragmentos de memoria.
- [ ] QA y pruebas automatizadas (transiciones de animosidad, distribución 50/50, regresiones HUD/mapa).
