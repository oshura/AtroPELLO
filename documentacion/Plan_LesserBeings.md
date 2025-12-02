# Plan de implementación: Lesser Beings enemigos

## 1. Contexto y objetivos
- Introducir un nuevo linaje de enemigos orgánicos espaciales (Semillas Estelares, Shoggoth, Vampiros de Fuego) basados en `GameObject` que actúan como "naves" enemigas.
- Respetar la narrativa ya documentada en `documentacion/Planetas_Inhabitantes_Plan.md` y los tipos definidos en `src/app/game/types/cosmic-life.types.ts`.
- Necesitamos IA básica, ataques diferenciados, geometría provisional y reglas de aparición ligadas a Void Jump y portales.

## 2. Lineamientos confirmados
- **Spawn rules**: 50% tras cada Void Jump; 12% cada minuto por portal sin `PORTAL_CONCORD`.
- **Influencias**: cada sistema solar está asociado a un único `ElderGod`; los spawns usan `ELDER_GOD_SUMMONS` para decidir la especie.
- **Planet occupancy**: solo se almacena el tipo (`planet.lesserBeing: LesserBeing | null`). No se requiere id ni timestamp.
- **Cap de inactivos**: máximo 3 Lesser Beings simultáneos sin planeta asignado (en órbita de espera).
- **Combate**: daño solo al jugador. Semillas disparan hacia delante (cono 15°). Orb burst y radiación afectan únicamente a la nave.
- **Rewards**: destruir uno antes de aterrizar otorga +20 COR temporal (respetando límites existentes) y +100 XP.
- **Geometry**: reutilizar el radio original de la nave (`Spaceship` antes del factor 0.8) para las tres esferas. Visuales simples (tentáculos, ojos, destellos) mediante shaders/partículas.

## 3. Arquitectura propuesta
| Área | Detalle | Referencias actuales |
| --- | --- | --- |
| Jerarquía de objetos | Crear `LesserBeingBase extends GameObject` (inspirada en `src/app/game/game-objects/Spaceship.ts`) con orientación por cuaterniones, control de aceleración y hooks de armas. | `Spaceship.handleInput`, `GameObject` base. |
| Subclases | `StellarSeed`, `ShoggothBeing`, `FireVampire` con stats y componentes de ataque configurables. | Nuevo directorio `src/app/game/game-objects/lesser-beings/`. |
| AI | `LesserBeingController` FSM (estados: `SeekingPlanet`, `EngagingShip`, `Orbiting`, `Landing`, `Despawning`). Se integra en `GameEngine.update()` similar a otros managers. | `src/app/game/GameEngine.ts` (loop principal). |
| Spawn manager | Servicio `LesserBeingSpawner` que escucha eventos de Void Jump y portal scheduler. Mantiene contador de libres. | `GameEngine.performVoidJump` (investigar hooks), `PortalRegistryService`. |
| Planet data | `planet.lesserBeing: LesserBeing | null`. Marcar `planet.creatureScanned = false` al aterrizar. | `src/app/services/game/game-state.store.ts`, `src/app/game/types/planet.types.ts` (ver esquema actual). |
| UI/HUD | Mapas y paneles leen la flag existente; respetan gating de escaneo. | `SolarSystemPanel.updateMap`, HUD paneles. |

## 4. Especificaciones por tipo
### 4.1 Semillas Estelares
- **Stats**: Health 500u, MaxSpeed 100u, Accel 20u, Decel 25u, `rotationSpeed = π/1.25`, `minRotationSpeed = π/2.5`.
- **Ataque**: escupitajo ácido cada 3 s; daño lineal de 100u (1u distancia) a 1u (200u distancia). Cono frontal 15°. Solo dispara si el objetivo está dentro del cono y a <=200u. Implementar proyectil balístico con caída de daño.
- **Comportamiento**: busca la cola de la nave (mantener 10u) cuando decide atacar; sino, prioriza planeta libre.

### 4.2 Shoggoth
- **Stats**: Health 1000u, MaxSpeed 40u, Acc/Dec 1u, `rotationSpeed = π/5`, `minRotationSpeed = π/10`.
- **Ataque**: ráfaga radial cada 10 s → 40 orbes a 10u/s, vida 100u, daño 50u. Orbes se generan uniformemente sobre esfera (usar muestreo Fibonacci o subdivisión de ico).
- **Comportamiento**: ignoran nave salvo que no existan planetas libres; se mueven a planetas para ocuparlos; en espera orbitan a 80u.

### 4.3 Vampiros de Fuego
- **Stats**: Health 100u, MaxSpeed 50u, Accel 4u, Decel 5u, `rotationSpeed = π/2.5`, `minRotationSpeed = π/5`.
- **Ataque**: pulso radial cada 10 s, radio 1000u, daño escalado 1u (1000u) → 10u (1u). Afecta solo al jugador. Aplicar `damage = 10 - 9 * clamp(dist / 1000, 0, 1)`.
- **Comportamiento**: mantener distancia óptima ~800u; si la nave se acerca (<400u) huyen en línea recta y reestablecen órbita.

## 5. Flujo general de IA
1. **Selección de objetivo** (al spawn y cada vez que objetivo pierde validez):
   - Buscar planeta libre más cercano (`planet.lesserBeing === LesserBeing.NONE`).
   - Si no hay y el tipo ≠ Shoggoth, evaluar distancia a la nave; si < preferencia, cambiar a modo ataque.
   - Si no hay planeta ni nave (p.ej. nave destruida), orbitar planeta aleatorio hasta que cambie el estado global.
2. **Movimiento**: reutilizar rutinas de `Spaceship` para aceleración orientada. Ajustar multiplicador de rotación según velocidad (igual que en `handleInput`).
3. **Aterrizaje**: detectar colisión con bounding sphere del planeta en `CollisionManager` o mediante chequeo en controlador; disparar evento `planetOccupied`.
4. **Desaparición**: remueve entidad (y proyectiles) del `GameEngine`, libera cupo y dispara notificaciones UI.

## 6. Spawning y scheduling
- **Void Jump hook**: ubicar la secuencia final (ver métodos `performVoidJump`/`performLongJump` en `GameEngine.ts`). Tras confirmarse el salto, lanzar `maybeSpawnLesserBeing('void-jump')` con prob. 50%.
- **Portal hook**: crear scheduler en `GameEngine.update()` o en `PortalRegistryService` para evaluar cada 60 s cada portal sin `PORTAL_CONCORD`. Prob 12%; si acierta, instanciar.
- **Elder God mapping**: mantener `currentSystemElderGod` en `GameStateStore` (si no existe, derivarlo del snapshot). `LesserBeingSpawner` consulta `ELDER_GOD_SUMMONS` y elige aleatoriamente entre opciones disponibles.
- **Spawn location**: borde del sistema (radio = max órbita + margen 500u). Orientar hacia objetivo inicial.
- **Cap de orbitantes**: `waitingCount < 3`; si se excede, abortar spawn.

## 7. Combat y recompensas
- Gestionar daño en `CombatSystem`/`GameEngine.applyDamageToObject` con nuevas fuentes (`acid_spit`, `orb_burst`, `radiant_aura`).
- Tras destruir enemigo antes de aterrizar:
  - `CharacterProfileService.addCorruption(20, { temporary: true })` (ver límites actuales en servicio).
  - `CharacterProfileService.addXP(100)`.
  - Emitir telemetría/log para ajuste de balance.

## 8. Geometría y VFX
- Basar malla en esfera (mismo radio que la nave previa al 0.8). Crear materiales específicos:
  - Semillas: esfera verde + tentáculos (líneas con noise animado) y halo trasero.
  - Shoggoth: esfera gris con instancias de "ojos" (billboards) y protuberancias amarillas (mesh simple).
  - Vampiro: esfera roja semitransparente con shader pulsante (sin profundidad write + additive core).
- Reutilizar pipeline actual de `Spaceship` para VAO/VBO, pero aislar en `LesserBeingRenderer` para facilitar sustitución futura.

## 9. Plan de trabajo (checklist)
- [x] **Tipos y datos**: actualizar `cosmic-life.types.ts`, planet schema, snapshot serialization.
- [x] **Base class**: implementar `LesserBeingBase`, incluyendo inputs, locomoción, barras de vida.
- [x] **Subclases**: configurar stats + ataques específicos para Semillas, Shoggoth y Vampiros (geometría placeholder incluida).
- [x] **Controlador IA**: FSM + ataques + aterrizaje.
- [x] **Spawner**: integrado (50% Void Jump, 12% chequeo/portal, límite 3 en espera, logging y concord seals).
- [x] **Combate/proyectiles**: nuevas clases de proyectiles y efectos.
- [x] **Recompensas/UI**: aplicar XP/COR y actualizar HUD/map.
- [x] **Visuales**: geometría placeholder extendida + tentáculos/ojos/auras con renderizador dedicado.
- [ ] **QA**: pruebas unitarias y de juego (spawn probabilities, daño falloff, aterrizaje, recompensas).

## 10. Consideraciones técnicas adicionales
- Revisar `CollisionManager` para asegurar que nuevas entidades se registren y se pueda detectar impacto planeta/ship.
- `GameStateStore` debe emitir eventos al cambiar `planet.lesserBeing` para que la UI invalide cache.
- Documentar spawn events en `logs/logs.txt` para telemetría.
- Recordar limpiar proyectiles en `cleanup()` o al despawn para evitar referencias colgantes.

## 11. Abordaje sugerido (fases)
1. **Infraestructura**: tipos, planet flag, base class + renderer dummy.
2. **IA y movimiento**: FSM, objetivos, aterrizaje.
3. **Ataques**: implementar cada arma + efectos.
4. **Spawning**: Void Jump y portales con límites y recompensas.
5. **Polish**: geometría, HUD, balance, documentación final.

> Última actualización: 5 Feb 2026 (spawner y visuales placeholder consolidados).
