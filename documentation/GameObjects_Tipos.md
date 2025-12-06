# Tipos de GameObjects

Este documento recoge los tipos de objetos del juego disponibles actualmente y los previstos, con su relación al sistema de targeting (`TargetType`).

## Disponibles (implementados)
- **Spaceship** (`TargetType.SPACESHIP`): Nave del jugador.
- **Planet** (`TargetType.PLANET`): Planetas con subtipos clasificados por `PlanetType`:
  - `Tierra`: Tierra/terrestre (textureado especial en EarthSplit).
  - `Ringed`: Anillado (ej. Saturn).
  - `Gaseous`: Gaseoso (ej. Urano).
  - `Giant`: Gigante (ej. Júpiter).
  - `Dwarf`: Enano.
  - `Protoplanet`: Protoplaneta.
  - `Planetoid`: Planetoide/rocoso genérico.
- **Sun** (`TargetType.SUN`): Estrella principal del sistema (clase `Sun`).
- **Asteroid** (`TargetType.ASTEROID`): Asteroides normales dentro de cúmulos.
- **SuperAsteroid** (`TargetType.SUPER_ASTEROID`): Asteroides de gran tamaño dentro de cúmulos.
- **MegaAsteroid** (`TargetType.MEGA_ASTEROID`): Escombros/cinturones vinculados a planetas (anillos de la Tierra/Saturno).
- **Cluster** (`TargetType.CLUSTER`): Cúmulos de asteroides; pueden renderizarse como proxy o miembros según LOD.
- **Portal** (`TargetType.PORTAL`): Portales persistentes con destino enlazado y estado del ojo.

### Asteroides efímeros (debajo de la categoría de “debris” en el mapa)
- Instancias de `Asteroid` marcadas como temporales (flag `isEphemeral`).
- `TargetType`: `ASTEROID` (se comportan como asteroides normales a efectos de selección/targeting).
- Aparición dinámica: cada 10s, con 5% de probabilidad, aparecen entre 1 y 3 a ~500u de la nave, con dirección que cruza cerca de su posición y velocidad base ≈ 5u.
- Desaparición automática: se eliminan al alejarse > 1000u de la nave (ya no figuran ni en escena 3D ni en el mapa).
- Propiedades físicas/visuales (alineadas con asteroides de clúster):
  - `composition`: iron | silicate | carbonaceous | nickel | mixed
  - `albedo`: 0.40–0.60 (valor típico: ~0.5)
  - `massTons`: 50–150
  - `voidMassUnits`: 2–5u
  - Tamaño: ~0.6–1.5 (escala visual del modelo base)

## Previstos / planificados
- **Waypoint** (`TargetType.WAYPOINT`): Puntos de navegación auxiliares (no implementados aún).
- **Nubes de escombros** (configuración generativa): Grupos de clusters estáticos o escalados por `cloudGroupScale`.
- **Más variaciones planetarias**: Ajustes finos en colores/base y parámetros orbitales.

## Observaciones
- El mapa del sistema soporta filtros por categoría (`center`, `planet`, `cluster`, `debris`, `portal`, `ship`) y filtros finos por tipo de planeta (Tierra, Anillado, Gaseoso, Gigante, Enano, Protoplaneta, Planetoide).
- La categoría `debris` en el mapa incluye:
  - Mega-asteroides vinculados a planetas (anillos/cinturones locales, `TargetType.MEGA_ASTEROID`).
  - Asteroides efímeros cercanos a la nave (instancias `Asteroid` temporales, `TargetType.ASTEROID`).
- El Sol se muestra una única vez como centro (círculo amarillo); no aparece como punto azul independiente.
- La Tierra partida (`EarthSplitPlanet`) expone caps emisivos y anillo de mega-asteroides con seguimiento de spin y tilt.

## Rangos de propiedades (resumen)
- Asteroid (normal/cluster y efímero): `voidMassUnits` 2–5u; `massTons` 50–150; `albedo` 0.40–0.60.
- SuperAsteroid: `voidMassUnits` 10–20u (doble del rango previo 5–10u); `massTons` 500–1000; `albedo` 0.40–0.60.
- MegaAsteroid: `voidMassUnits` proporcional al tamaño base (≈ 2500 × baseSize); `albedo` 0.35–0.60.

## Referencias de código
- `src/app/game/types/targeting.types.ts`: Enum `TargetType`.
- `src/app/game/Planet.ts`: Enum `PlanetType` y clase base `Planet`.
- Variantes: `GiantPlanet.ts`, `GaseousPlanet.ts`, `RingedPlanet.ts`, `Protoplanet.ts`, `Sun.ts`.
- Asteroides y cúmulos: `Asteroid.ts`, `SuperAsteroid.ts`, `MegaAsteroid.ts`, `Cluster.ts`.
- Portales: `Portal.ts` y `services/game/portal-persistence.service.ts`.

---

## Guía para crear GameObjects persistentes

El pipeline de respawn, nuevas partidas y el futuro guardado/carga reutiliza siempre los snapshots de `SolarSystemSnapshot` y el store centralizado (`GameStateStore`). Para que un nuevo tipo de GameObject sobreviva a portales, respawns y saves, sigue estos pasos:

### 1. Clasifica el objeto por responsabilidad
| Tipo de objeto | Ejemplos | Dónde vivirán sus instancias | Snapshot recomendado |
| --- | --- | --- | --- |
| **Estructural** (soles, planetas, portales, cinturones) | Planeta nuevo, estación orbital, portal especial | Arrays dentro de `GameStateStore` (`planets`, `portals`, `planetDebris`, etc.) | `SolarSystemSnapshot` (planets/portals/debris/custom meta) |
| **Agrupado/paramétrico** | Clusters, campos de nubes, enjambres | Servicio dedicado (`AsteroidClusterService`) con arrays paramétricos | `clusters[]` + parámetros o un bloque custom en `snapshot.meta` |
| **Entidad dinámica** (NPCs, lesser beings, cazas) | Nuevos NPCs hostiles, drones | Colección dedicada en `GameStateStore` + spawner | `snapshot.meta.<tuBloque>` + `GameStateStore` para caché entre capturas |
| **Efímero** | Partículas, efectos, asteroides eventuales | Servicios efímeros (no se serializan) | No se serializan; generar determinísticamente al restaurar |

### 2. Extiende el modelo de datos
1. **Tipos**: añade las propiedades mínimas al DTO correspondiente (p. ej. `SolarSystemSnapshot`, `PortalSnapshot`, `ClusterSnapshot`, o un nuevo bloque `snapshot.meta.mySystem`).
2. **GameStateStore**: crea una colección y helpers (`add`, `remove`, `find`). Asegúrate de resetearla en `GameEngine.applySolarSystemSnapshot()` justo antes de poblarla desde el snapshot.

### 3. Captura runtime
1. Reutiliza `SolarSystemRuntimeSerializerService`. Añade un método `captureMyObjects()` que recorra `GameStateStore` o el servicio correspondiente.
2. Pasa el resultado a `SolarSystemSerializer.fromState()` (añadiendo un input nuevo si es necesario) o incrústalo en `snapshot.meta` antes de persistir.
3. Cuando el objeto dependa del sistema actual, pide la clave estable via `GameEngine.getPersistentSystemKey()` y guarda cualquier memoria asociada bajo esa clave (igual que `lesserBeingMemory`).

### 4. Rehidratación
1. Extiende `GameEngine.applySolarSystemSnapshot()` para leer tu bloque y reconstruir instancias. Inicia buffers WebGL si procede y registra callbacks (`registerDestructionCallback`).
2. Si el objeto requiere lógica de aparición (p. ej. spawner), añade un método `restoreFromSnapshot()` en su servicio y llámalo desde `applySolarSystemSnapshot()` o `UniverseStateSnapshotService`.
3. Si existen caches adicionales en `GameStateStore` (memoria de NPCs, timers), vacíalos cuando el snapshot se aplica y repuebla con los datos restaurados.

### 5. Integración con respawn/portales/save
- **Respawn:** `GameEngine.persistActiveSystemState()` se invoca antes de cada respawn/gate rite; tu objeto debe estar incluido en la captura runtime para que el label asociado quede actualizado.
- **Portales:** `PortalPersistenceService` almacena snapshots por etiqueta. Si tu GameObject necesita metainformación adicional (por ejemplo, historial de un portal), actualiza la entrada con `portalPersistence.updatePortalSnapshot()` o guardando datos dentro de `snapshot.meta`.
- **Future Save/Load:** `GamePersistenceService` reutilizará los mismos snapshots. Evita referencias circulares a objetos vivos; serializa solo POJOs.

### 6. Checklist rápida
- [ ] Colección y helpers en `GameStateStore` (con limpieza en `resetState()` y logging básico).
- [ ] Captura en `SolarSystemRuntimeSerializerService` (o servicio equivalente) + extensión del DTO.
- [ ] Reconstrucción completa en `GameEngine.applySolarSystemSnapshot()` (incluyendo buffers y registro de callbacks).
- [ ] Si aplica, spawner/restorer capaz de revivir desde snapshots y limpiar memoria.
- [ ] Documentación en esta guía y, si es relevante para el jugador, en la wiki (`/wiki/pages/...`).
- [ ] `npm run build` tras cualquier cambio en snapshots para validar SSR/zoneless.

### 7. Consejos
- Prefiere **parametrizar** (contar objetos + seed) antes que serializar cientos de instancias explícitas, salvo que la posición exacta sea crítica.
- Cuando guardes arrays grandes, clona siempre (`map(obj => ({ ...obj }))`) para evitar compartir referencias con objetos vivos.
- Si tu GameObject tiene efectos temporales (ej. energía acumulada), guarda solo los parámetros necesarios para reconstruir su estado (tiempo restante, intensidad) y recalcula el resto al aplicar el snapshot.
- Usa `LogCategory.SOLAR_SYSTEM_GENERATION` para la captura/restauración y `LogCategory.GAME_LOOP` para destrucciones automáticas; facilita depurar al probar respawns.
