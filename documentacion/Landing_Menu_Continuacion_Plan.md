# Landing Menu Continuación & Narrativa Expandida

**Fecha:** 29 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

## 1. Contexto y Objetivos
- Reforzar el menú de aterrizaje con tres dominios claros: **Intel (Descanso / Logs)**, **Exploración** y **Diplomacia/Misiones**.  
- Conectar cada botón con consecuencias mecánicas, diálogos lovecraftianos y pistas que avancen la historia principal (memoria restante 80%).  
- Alinear los servicios (`LandingActionService`, `MissionService`, `HUDManager`) con los nuevos estados (`intel`, `clues`, `memoryFragments`).

## 2. Arquitectura del Menú
```
LandingPanel
├─ Intel Deck (Descanso, Registro de Anomalías)
├─ Mapa de Exploración (4 subacciones)
└─ Cámara Diplomática (según animosidad)
```
- **Panel lateral**: log cronológico (últimos 6 eventos) que resume texto, cambios de stats y pistas obtenidas.  
- **Viewport central**: diálogo activo (narrador + opciones).  
- **Footer**: botones contextuales (`Aceptar`, `Repetir`, `Regresar al menú`).

## 3. Intel Deck (Descanso + Detecciones)
| Acción | Efectos | Trigger narrativo | Diálogo ejemplo |
| --- | --- | --- | --- |
| **Descansar** | `+1 cordura`, `+5 salud`, `+1 día`. Si `lesserBeing` presente ⇒ revelar `lesserBeingIntelStatus`, aplicar `-1 cordura`, `-5 salud`. | "La arena púrpura amortigua el motor" | Intro: *"Apagas los sensores y escuchas el golpe seco del corazón del vacío."*  Éxito: *"Sueñas con constelaciones imposibles; despiertas más ligero."*  Interrumpido: *"Una nota subarmónica atraviesa el casco y arranca tus recuerdos frescos."* |
| **Registrar anomalía** (nuevo botón) | Consume 1 cordura para fijar intel previo (`artifactIntelStatus`, `voidMassIntelStatus`). | HUD detecta fluctuación. | *"Grabas la vibración en un cilindro de obsidiana; algo responde desde el subsuelo."* |

## 4. Mapa de Exploración
Cada subacción usa tiradas 50/50 (modificables por perks). Éxitos/fallos deben disparar textos distintos.

| Subacción | Efectos mecánicos | Texto de éxito | Texto de fracaso |
| --- | --- | --- | --- |
| **Buscar artefacto** | Si `hasArtifact` y acierto ⇒ obtiene artefacto + XP. Si no hay pero éxito ⇒ `artifactIntelStatus = confirmed_absent` (+1 XP). Fallo ⇒ `-5 salud`. `age += 2`. | *"Un prisma translúcido palpita al ritmo del motor; lo guardas en un nódulo blindado."* | *"Columnas basálticas expulsan agujas de luz negra. Retrocedes con heridas profundas."* |
| **Encontrar void mass** | Éxito ⇒ `voidEnergy = max`, `voidMassIntelStatus = confirmed_present`. Fallo ⇒ `-5 salud`, `voidMassIntelStatus = suspected`. | *"Una cascada gravitatoria llena tus depósitos; el motor ronronea agradecido."* | *"El sifón se descontrola, quemando conductos antes de cerrarse."* |
| **Contactar civilización** | Éxito ⇒ `civilizationIntelStatus = known`, abre Diplomacia. Fallo ⇒ `-5 salud`, sin cambio. | *"Los emisarios cantan tu nombre en reversa y aceptan negociar."* | *"Te reciben con venas fosforescentes tensas; expulsado por vibraciones hostiles."* |
| **Encontrar lesserBeing** | Éxito ⇒ `lesserBeingIntelStatus = known`. Si existía ⇒ `sanity -= 5 (temp)` + narrativa. Fallo ⇒ `-5 salud`. | *"Lo ves plegado sobre sí, recitando memorias de la Tierra partida. El conocimiento te quema."* | *"Rastros de baba ígnea terminan en nada; tus pulmones sangran por el esfuerzo."* |

## 5. Cámara Diplomática
### 5.1 Estado Ally
- **Reparar nave (10 raw metal)**: *"Los artesanos envuelven el casco en hilos de luz líquida."*
- **Comerciar reliquias**: placeholder visual con nota "catálogo en preparación".
- **Comprar glifos (2 por raza)**: describe pergaminos vivos o circuitos orgánicos.
- **Compartir tiempo de vida**: `sanity = max`, `health = max`, `age += rand(20–30)` con texto *"Compartes fogatas astrales durante semanas comprimidas."*

### 5.2 Estado Neutral
- **Reparar 10% nave (1 metal común)**, **Curar 10 vida (1 orgánico)**.
- **Misiones de raza** ⇒ abre diálogo con opciones (ver sección 6).  
- **Pistas**:
  1. *Escuchar rumores* (1 metal + 1 orgánico) ⇒ `minor clue`. Texto: *"Un paje susurra ‘busca el sol doble’."*
  2. *Ofrecer ayuda menor* (submisión 50/50) ⇒ `major clue`. Ej.: calibrar resonador.
  3. *Intercambiar visiones* (−3 cordura) ⇒ `final clue`. Texto: *"Compartes tu mente; ves el planeta objetivo con luz verdosa."*

### 5.3 Estado Enemy
- Único botón **Luchar con lesserBeing**. Resultado positivo ⇒ `+25 XP`, `sanity = max`, `health = current/2`, `age += 2`, `lesserBeing = null`. Narrativa: *"Desciendes a la sima donde el nombre de tu culto gotea en ácido."*

## 6. Sistema de Misiones y Pistas
1. **Oferta**: tras contacto exitoso, `MissionService.offerMission(raceId)` crea `PlanetMissionState` con `clueTokens = []`.  
2. **Pistas**: cada acción añade `ClueToken { tier: 'minor'|'major'|'final', source }`. UI muestra iconos llenos/vacíos.  
3. **Submisiones estándar**:
   - `calibrar-resonador` (50% éxito, -5 PV fracaso) ⇒ major.  
   - `cortar-raiz-infecta` (60% éxito si nave >50% salud) ⇒ major + +5 salud.  
   - `sellar-micro-portal` (40% éxito, -5 cordura fracaso) ⇒ final.  
4. **Entrega**: requiere objetivo físico + `final clue`. Al completar ⇒ `planet.animosity = ally`, `memoryPercent += raceShare`, `landingLog` registra revelación.

## 7. Razas, Misiones y Revelaciones
| Raza | Tipo misión | Ganchos narrativos | Submisión destacada | Revelación (memoria) |
| --- | --- | --- | --- | --- |
| **MI_GO** | Artefacto `Nodo Espectral` en glaciar con portales fallidos. | Cerebros metálicos vibran con tu pulso; piden hierro lunar. | Calibrar resonador mi-go. | Copiaste su tecnología para el motor. (7%) |
| **YIG** | Material `Veneno de Muda` en cinturón serpentino. | Coros siseantes exigen pieles mudadas. | Cortar raíz infecta (serpientes negras). | La secta prometió portales para Yig. (7%) |
| **LENG** | Artefacto `Campana de Leng`. | Monjes con máscaras de escarcha recuerdan tu visita anterior. | Sellar micro-portal. | Te borraron memoria para proteger la negociación. (7%) |
| **ORGANISMO_VEGETAL** | Material `Polen Lúgubre`. | Coro fotosintético habla en olores. | Cortar raíz infecta. | El polen alimentó el motor experimental. (6%) |
| **ANGELES_DESCARNADOS** | Artefacto `Pluma de Vacío`. | Arpas óseas tensan el aire, ofrecen protección. | Calibrar resonador. | Ellos cubrieron la nave durante el cataclismo. (6%) |
| **PROFUNDOS** | Material `Perla Tétrica`. | Anfiteatro submarino burbujea tu nombre. | Sellar micro-portal. | Dan coordenadas del portal fallido. (6%) |
| **ANTIGUOS** | Artefacto `Cubo Hipergeométrico`. | Estatuas despiertan con tu llegada. | Calibrar resonador. | Muestran recuerdos pre-golpe. (6%) |
| **DOHLE** | Material `Resina Coralina`. | Artesanos coralinos piden salvas psíquicas. | Cortar raíz infecta. | Revelan rebelión interna del culto. (6%) |
| **CHTHONIAN** | Artefacto `Órgano Sísmico`. | Núcleos fracturados cantan. | Sellar micro-portal. | Confirman que el motor fracturó la Tierra. (6%) |
| **GULES** | Material `Hueso Cantor`. | Necrópolis viva huele a hierro dulce. | Cortar raíz infecta. | Confiesan el destino de la nave nodriza. (5%) |
| **GHASTS** | Artefacto `Espejo de Penumbra`. | Cuevas sin luz, ojos brillan. | Calibrar resonador. | El culto juró destruir primigenios rivales. (5%) |
| **VAMPIRO_ESTELAR** | Material `Hemoplasma Estelar`. | Nebulosa roja palpita; requieren sangre. | Sellar micro-portal. | Usaste sangre estelar para el motor. (5%) |
| **BYHKEE** | Artefacto `Lira de Viento Negro`. | Cimas huracanadas, coros de viento. | Calibrar resonador. | Te proclaman futuro primigenio. (8%) |

## 8. Plantillas de Diálogo
```
Escena: <Descripción Lovecraftiana>
Opciones:
1. Preguntar origen de la petición.
2. Negociar pistas.
3. Indagar peligros.
4. Finalizar (sin cambios).
Derivadas:
- Ofrecer materiales → pista menor.
- Aceptar recado → submisión.
- Compartir visiones → pista final.
Resoluciones: resumen + cambios mecánicos + pistas obtenidas.
```
- **Botones UI**: `Continuar`, `Retirarse`, `Repetir diálogo`, `Ver pistas acumuladas`.
- **Narrador**: debe citar efectos (`+XP`, `-5 PV`, `-3 Cordura`) explícitamente para claridad.

## 9. Roadmap Técnico
1. **Sprint A** – Persistencia
   - Extender `Planet` y `GameStateStore` con `intel`, `clueTokens`, `memoryPercent` hooks.  
   - Serializar `PlanetMissionState` con submisiones y pistas.
2. **Sprint B** – Servicios
   - Implementar `LandingActionService` (descanso + exploración + diplomacia) con RNG inyectable.  
   - Añadir `MissionService` APIs (`offerMission`, `addClueToken`, `completeMission`).
3. **Sprint C** – UI/UX
   - Nuevo layout (tres columnas) + diálogo modal reutilizable.  
   - Historial de eventos y visor de pistas.  
   - Animaciones ligeras (glow botones según animosidad).
4. **Sprint D** – Narrativa
   - Serializar textos JSON (`assets/narrative/landing/*.json`).  
   - Hook `memoryPercent` para escenas globales (25/50/75/100%).
5. **Sprint E** – QA
   - Unit tests con RNG determinista.  
   - Playwright flow: Rest → Explore → Diplomacia Neutral/Ally.

## 10. Próximos Pasos Inmediatos
- [ ] Generar JSON de diálogos por acción/raza (baseline EN/ES).  
- [ ] Implementar HUD `landingLog` y exponerlo al panel.  
- [ ] Crear hooks de pistas en `MissionService` y UI para mostrar tiers.  
- [ ] Escribir copy completo para Rest + subacciones (éxito/fracaso).  
- [ ] Revisar economía de recursos para sobornos y curaciones.

## 11. Estado actual de los assets narrativos
Se añadieron los siguientes archivos en `src/app/assets/narrative/landing/` listos para consumir desde `LandingActionService`:
- `landing_base.json`: textos de descanso, registrar anomalías y mensajes genéricos.
- `landing_exploration.json`: narrativa de las cuatro acciones de exploración.
- `landing_diplomacy.json`: diálogos y costes para estados Ally/Neutral/Enemy, incluyendo la economía de pistas.
- `landing_missions_<race>.json`: un archivo por raza (`mi_go`, `yig`, `leng`, `organismo_vegetal`, `angeles_descarnados`, `profundos`, `antiguos`, `dohle`, `chthonian`, `gules`, `ghasts`, `vampiro_estelar`, `byhkee`) que define oferta, pistas y fragmentos de memoria.

Integración de código inicial:
- `LandingNarrativeService` carga los JSON y expone helpers para Rest + subacciones de exploración.
- `LandingActionService` ya usa dichos textos para `Rest`, `Buscar artefacto`, `Encontrar void mass`, `Contactar civilización` y `Encontrar lesserBeing`.
- `landing-diplomacy.config.ts` ahora define scripts completos por raza (sobornos, visiones, submisiones) e integra los porcentajes de memoria compartida al aceptar misiones diplomáticas.

Checklist actualizada:
- [x] Generar JSON de diálogos por acción/raza (baseline ES).
- [x] Mapear scripts diplomáticos por raza y recompensas de memoria en configuración.
- [ ] Implementar HUD `landingLog` y exponerlo al panel.
- [ ] Crear hooks de pistas en `MissionService` y UI para mostrar tiers.
- [ ] Escribir copy completo para Rest + subacciones (éxito/fracaso). *(cubierto en JSON inicial, aún abierto para versiones multilenguaje).* 
- [ ] Revisar economía de recursos para sobornos y curaciones.

Este plan retoma el trabajo perdido y detalla cómo continuar con la narrativa, los diálogos y el sistema de misiones dentro del menú de aterrizaje Lovecraftiano.
