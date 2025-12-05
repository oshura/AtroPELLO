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
