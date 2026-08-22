import { GameObjectCategory, GameObjectType, getCategory } from '../types/game-object.types';

/**
 * Color del debris de destrucción por tipo de objeto (extraído de GameEngine, regla #1).
 * Puro: mismo tipo, mismo polvo.
 */
export function getDebrisColorForObjectType(objectType: GameObjectType): { r: number; g: number; b: number } {
  const category = getCategory(objectType);

  // Asteroides / campos de debris: gris-marrón rocoso
  if (category === GameObjectCategory.ASTEROID || objectType === GameObjectType.CLUSTER) {
    return { r: 0.7, g: 0.5, b: 0.3 };
  }
  // Planetas: tonos azulados/verdosos
  if (category === GameObjectCategory.PLANET) {
    return { r: 0.3, g: 0.6, b: 0.8 };
  }
  // Portales: púrpura místico
  if (category === GameObjectCategory.PORTAL) {
    return { r: 0.8, g: 0.3, b: 0.9 };
  }
  return { r: 0.6, g: 0.6, b: 0.6 };
}

/**
 * Nombre de planeta de RESERVA (no único): sólo cuando el servicio de sistema no está disponible.
 * FX sin estado: Math.random() permitido aquí.
 */
export function generateFallbackPlanetName(): string {
  const catalogPrefixes = ['Kepler', 'TRAPPIST', 'Gliese', 'Proxima', 'HD', 'K2', 'Tau', 'LHS', 'WASP', 'HIP'];
  const separators = ['-', ' ', ' '];
  const suffixAlpha = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const num = () => Math.floor(10 + Math.random() * 8900);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  if (Math.random() < 0.5) {
    return `${pick(catalogPrefixes)}${pick(separators)}${num()}${Math.random() < 0.5 ? '' : ' '}${pick(suffixAlpha)}`.trim();
  }
  const myth = ['Aether', 'Chronos', 'Erebus', 'Gaia', 'Nyx', 'Hera', 'Hyperion', 'Icarus', 'Janus', 'Tethys', 'Rhea', 'Atlas'];
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  return `${pick(myth)} ${pick(romans)}`;
}
