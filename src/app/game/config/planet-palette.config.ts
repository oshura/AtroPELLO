import { PlanetType } from '../game-objects/Planet';

/**
 * Paletas de terreno atmosférico por tipo de planeta (suelo, cielo y bandas de altura).
 * Tabla PURA extraída de GameEngine (regla #1: el motor no acumula datos); la consume la escena
 * de atmósfera al construir el contexto de aterrizaje.
 */
export interface PlanetPaletteDescriptor {
  key: string;
  ground: number[];
  sky: number[];
  palette: {
    lowlands: number[];
    highlands: number[];
    dunes: number[];
    polar: number[];
    strata: number[];
    valleys: number[];
    plains: number[];
    midlands: number[];
    peaks: number[];
  };
}

export function getPlanetPaletteDescriptor(type?: PlanetType): PlanetPaletteDescriptor {
  switch (type) {
    case PlanetType.Tierra:
      return {
        key: 'tierra',
        ground: [0.26, 0.40, 0.22],
        sky: [0.18, 0.40, 0.68],
        palette: {
          lowlands: [0.08, 0.16, 0.08],
          highlands: [0.52, 0.68, 0.34],
          dunes: [0.74, 0.54, 0.28],
          polar: [0.92, 0.96, 0.98],
          strata: [0.36, 0.44, 0.30],
          valleys: [0.05, 0.12, 0.06],
          plains: [0.22, 0.38, 0.18],
          midlands: [0.44, 0.58, 0.30],
          peaks: [0.88, 0.92, 0.80],
        },
      };
    case PlanetType.Gaseous:
      return {
        key: 'gaseous',
        ground: [0.18, 0.26, 0.58],
        sky: [0.10, 0.16, 0.40],
        palette: {
          lowlands: [0.08, 0.14, 0.36],
          highlands: [0.46, 0.66, 0.92],
          dunes: [0.42, 0.48, 0.88],
          polar: [0.78, 0.86, 0.98],
          strata: [0.20, 0.32, 0.62],
          valleys: [0.04, 0.08, 0.28],
          plains: [0.16, 0.30, 0.52],
          midlands: [0.28, 0.46, 0.74],
          peaks: [0.84, 0.92, 0.98],
        },
      };
    case PlanetType.Giant:
      return {
        key: 'giant',
        ground: [0.62, 0.34, 0.22],
        sky: [0.40, 0.18, 0.48],
        palette: {
          lowlands: [0.20, 0.08, 0.04],
          highlands: [0.88, 0.54, 0.30],
          dunes: [0.94, 0.66, 0.32],
          polar: [0.96, 0.86, 0.70],
          strata: [0.54, 0.26, 0.18],
          valleys: [0.12, 0.05, 0.03],
          plains: [0.42, 0.18, 0.10],
          midlands: [0.68, 0.34, 0.18],
          peaks: [0.98, 0.82, 0.60],
        },
      };
    case PlanetType.Ringed:
      return {
        key: 'ringed',
        ground: [0.36, 0.30, 0.24],
        sky: [0.20, 0.16, 0.34],
        palette: {
          lowlands: [0.12, 0.10, 0.10],
          highlands: [0.70, 0.60, 0.48],
          dunes: [0.78, 0.60, 0.32],
          polar: [0.90, 0.86, 0.78],
          strata: [0.42, 0.34, 0.28],
          valleys: [0.10, 0.08, 0.08],
          plains: [0.28, 0.22, 0.18],
          midlands: [0.48, 0.40, 0.32],
          peaks: [0.96, 0.90, 0.78],
        },
      };
    case PlanetType.Dwarf:
      return {
        key: 'dwarf',
        ground: [0.48, 0.26, 0.18],
        sky: [0.26, 0.16, 0.32],
        palette: {
          lowlands: [0.06, 0.04, 0.04],
          highlands: [0.78, 0.46, 0.30],
          dunes: [0.86, 0.48, 0.26],
          polar: [0.94, 0.70, 0.56],
          strata: [0.66, 0.34, 0.22],
          valleys: [0.04, 0.02, 0.02],
          plains: [0.28, 0.12, 0.10],
          midlands: [0.54, 0.28, 0.18],
          peaks: [0.96, 0.78, 0.54],
        },
      };
    case PlanetType.Protoplanet:
      return {
        key: 'protoplanet',
        ground: [0.44, 0.34, 0.26],
        sky: [0.24, 0.26, 0.34],
        palette: {
          lowlands: [0.14, 0.10, 0.10],
          highlands: [0.78, 0.58, 0.42],
          dunes: [0.86, 0.60, 0.32],
          polar: [0.92, 0.86, 0.74],
          strata: [0.48, 0.34, 0.26],
          valleys: [0.12, 0.08, 0.08],
          plains: [0.32, 0.22, 0.18],
          midlands: [0.56, 0.40, 0.30],
          peaks: [0.94, 0.78, 0.56],
        },
      };
    default:
      return {
        key: 'default',
        ground: [0.40, 0.30, 0.28],
        sky: [0.10, 0.14, 0.26],
        palette: {
          lowlands: [0.14, 0.12, 0.12],
          highlands: [0.80, 0.60, 0.48],
          dunes: [0.82, 0.58, 0.30],
          polar: [0.94, 0.92, 0.88],
          strata: [0.44, 0.34, 0.28],
          valleys: [0.10, 0.08, 0.08],
          plains: [0.32, 0.24, 0.20],
          midlands: [0.56, 0.40, 0.32],
          peaks: [0.96, 0.84, 0.72],
        },
      };
  }
}
