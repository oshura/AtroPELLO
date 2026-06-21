/**
 * Barrel export para todos los GameObjects del juego.
 * Centraliza las importaciones para facilitar el uso en otros módulos.
 */

// Tipos base
export * from '../types/game-object.types';

// Asteroides
export * from './Asteroid';
export * from './SuperAsteroid';
export * from './MegaAsteroid';
export * from './TardisObject';
export * from './space-turtle';

// Planetas
export * from './Planet';
export * from './DwarfPlanet';
export * from './Protoplanet';
export * from './GiantPlanet';
export * from './GaseousPlanet';
export * from './RingedPlanet';
export * from './EarthSplitPlanet';

// Estrellas
export * from './Sun';

// Portales
export * from './Portal';

// Naves
export * from './Spaceship';

// Clusters
export * from './Cluster';

// Seres menores
export * from './lesser-beings/stellar-seed-being';
export * from './lesser-beings/transluminal-shoggoth-being';
export * from './lesser-beings/rift-vampire-being';


