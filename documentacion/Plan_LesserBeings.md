# Documentación de Lesser Beings

Guía de referencia sobre la IA, el combate y el estado actual de las Semillas Estelares, Shoggoths transluminales y Vampiros del Fuego. Sustituye al plan original y refleja el comportamiento implementado en `src/app/game` a diciembre de 2025.

## 1. Panorama general
- Cada Lesser Being hereda de `LesserBeingBase`, comparte locomoción con la nave y expone `attackProfile`, `behaviorProfile` y descriptores visuales para el `LesserBeingRenderer`.
- El `LesserBeingController` gobierna estados `IDLE → SEEKING_PLANET → LANDING | ORBITING_PLANET → ENGAGING_SHIP → DESPAWNING`, con reservas de planeta para evitar choques de IA.
- `LesserBeingSpawner` decide spawns (50 % tras Void Jump, 12 % por portal sin `PORTAL_CONCORD` cada minuto) y respeta el cap de tres orbitando sin planeta.
- `LesserBeingCombatService` simula proyectiles/auras y ahora ofrece snapshots (`getActiveProjectiles`) para renderizar disparos neon (Semillas) y futuras extensiones.

## 2. Estado y prioridades
- `planet.lesserBeing` almacena el tipo actual. Al aterrizar se marca `creatureScanned = false` y la criatura se desactiva del motor.
- Las IA liberan la reserva del planeta al morir o cambiar de objetivo, gracias a `planetReservations` en el controlador.
- El ship es objetivo prioritario cuando entra en la distancia de aggro (`preferredMax * 1.5`, mínimo 150u) salvo que el perfil indique lo contrario (`ignoresShipWhilePlanetHunting`).

## 3. Conducta por especie
### Semillas Estelares
- **Stats**: 500 HP, 100u/s, aceleración 20, deceleración 25.
- **Ataque**: `acid_spit` con cooldown de 3 s, rango 200u, cono 15°. El proyectil se dispara hacia la posición actual de la nave; si ésta esquiva antes del impacto no recibe daño.
- **IA**: en ENGAGING busca el vector frontal de la nave y mantiene 60‑140u antes de disparar. Si la nave no está a tiro, vuelve a reservar un planeta.
- **Visuales**: proyectil verde fosforescente con núcleo abombado y tres estelas aditivas (ver `LesserBeingRenderer.renderProjectiles`).

### Shoggoths transluminales
- **Stats**: 1000 HP, 40u/s.
- **Ataque**: `orb_burst` (36 orbes básicos de 50 de daño) distribuidos con muestreo Fibonacci.
- **IA**: ignoran la nave salvo que no queden planetas libres; priorizan colonizar y permanecen orbitando a ~80u mientras esperan turno. Mientras van camino al planeta (o durante el aterrizaje) liberan ráfagas defensivas si la nave entra en el radio de 120u, y únicamente cambian a ENGAGING como una Semilla cuando ya no hay planetas disponibles.
- **Visuales**: cada orbe ahora se dibuja como una esfera amarillo-pus pulsante (dos capas aditivas sin estela) para que el jugador pueda anticipar la nube radial.

### Vampiros del Fuego (Rift Vampires)
- **Stats**: 100 HP, 50u/s.
- **Ataque**: `radiant_aura` con radio 1000u, 10 s de cooldown y daño que cae linealmente según distancia.
- **IA acoplada**: el modo ENGAGING implementa una órbita dinámica alrededor de la nave entre 700‑900u. Usamos `updateRiftVampireOrbit` para mezclar direcciones tangenciales y radiales:
  - Si están por debajo de 700u, priorizan abrir distancia antes de retomar la órbita.
  - Si superan 900u, aceleran hacia fuera y luego se alinean tangencialmente.
  - Durante el ciclo se siguen lanzando pulsos de aura.
- **Reorientación a planetas**: `maybeRedirectRiftVampireToPlanet` compara distancia actual al ship con el planeta libre más cercano; si pierden prioridad de aggro o detectan un planeta significativamente más próximo (y están fuera del sweet spot) abandonan la órbita y pasan a `SEEKING_PLANET`.

## 4. Estados de IA
| Estado | Descripción |
| --- | --- |
| `IDLE` | Contexto recién registrado; toma objetivo inicial (nave prioritaria o planeta libre). |
| `SEEKING_PLANET` | Navega hacia el planeta reservado. Si detecta nave con prioridad, cambia a `ENGAGING_SHIP`. |
| `ORBITING_PLANET` | Patrulla un centro neutro mientras espera: velocidad reducida, preparado para retomar objetivos. |
| `ENGAGING_SHIP` | Lógica especítica por perfil (Semilla: persecución frontal; Vampiro: órbita 800u; Shoggoth casi nunca llega aquí). |
| `LANDING` | Frenado y touchdown; marca el planeta y despawnea. |
| `DESPAWNING` | Limpieza de contexto, proyectiles y reservas. |

## 5. Combate y visuales
- **Simulación**: `LesserBeingCombatService.update` integra proyectiles con física simple y calcula daño por distancia. Sólo afectan al jugador.
- **Fuentes de daño**: `acid_spit`, `orb`, `aura`. Los registros de impacto se envían a `LoggingService` para telemetría.
- **Render**: `LesserBeingRenderer` dibuja tentáculos, halos, ojos y ahora los proyectiles de Semillas con blending aditivo para que sean visibles en el HUD/mapa.
- **Esquiva**: El ship puede esquivar los disparos moviéndose fuera de la trayectoria lineal antes de que `remainingLife` llegue a cero.

## 6. Spawning, recompensas y depuración
- Hook principal tras Void Jump + scheduler de portales; ambos usan `LesserBeingSpawner` desde `GameEngine`.
- Límite de tres criaturas "en espera" sin planeta evita saturar IA lejos del jugador.
- Recompensas al destruirlas antes de aterrizar: +20 COR temporal y +100 XP (ver `CharacterProfileService`).
- Depuración:
  - `DebugStatsOverlayService` expone botones para spawnear Semilla/Shoggoth/Vampiro 100u frente a la nave, útil para probar rutas o el trazo verde.
  - El mapa muestra Lesser Beings como puntos rojos; la reserva de planetas evita que varios aparezcan superpuestos.
- Logs: se trazan eventos de spawn/impacto en `logs/logs.txt` con categoría `LESSER_BEINGS`.

## 7. Próximos pasos sugeridos
1. Documentar métricas QA pendientes (probabilidades reales de spawn en runs largos, balance de daño).  
2. Añadir visualización para el aura vampírica similar al ácido.  
3. Ampliar tests unitarios para cubrir reserva/liberación de planetas y la transición de órbita vampírica.

> Última actualización: 2 Dic 2025 (orbita vampírica y proyectiles visuales integrados).
