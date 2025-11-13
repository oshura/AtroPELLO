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

## Previstos / planificados
- **Waypoint** (`TargetType.WAYPOINT`): Puntos de navegación auxiliares (no implementados aún).
- **Nubes de escombros** (configuración generativa): Grupos de clusters estáticos o escalados por `cloudGroupScale`.
- **Más variaciones planetarias**: Ajustes finos en colores/base y parámetros orbitales.

## Observaciones
- El mapa del sistema soporta filtros por categoría (`center`, `planet`, `cluster`, `debris`, `portal`, `ship`) y filtros finos por tipo de planeta (Tierra, Anillado, Gaseoso, Gigante, Enano, Protoplaneta, Planetoide).
- El Sol se muestra una única vez como centro (círculo amarillo); no aparece como punto azul independiente.
- La Tierra partida (`EarthSplitPlanet`) expone caps emisivos y anillo de mega-asteroides con seguimiento de spin y tilt.

## Referencias de código
- `src/app/game/types/targeting.types.ts`: Enum `TargetType`.
- `src/app/game/Planet.ts`: Enum `PlanetType` y clase base `Planet`.
- Variantes: `GiantPlanet.ts`, `GaseousPlanet.ts`, `RingedPlanet.ts`, `Protoplanet.ts`, `Sun.ts`.
- Asteroides y cúmulos: `Asteroid.ts`, `SuperAsteroid.ts`, `MegaAsteroid.ts`, `Cluster.ts`.
- Portales: `Portal.ts` y `services/game/portal-persistence.service.ts`.
