import { PlanetType } from '../game-objects/Planet';

/**
 * Helpers de formato/etiquetado puros extraídos de GameEngine (docs/ARQUITECTURA.md Fase 5).
 * Sin estado: cero riesgo de comportamiento (idénticos a los del motor).
 */

/** Etiqueta humana de un tipo de planeta para HUD/targeting. */
export function getPlanetTypeLabel(type?: PlanetType): string | undefined {
  if (typeof type === 'undefined') {
    return undefined;
  }
  switch (type) {
    case PlanetType.Gaseous:
      return 'Gigante gaseoso';
    case PlanetType.Giant:
      return 'Planeta gigante';
    case PlanetType.Ringed:
      return 'Planeta anillado';
    case PlanetType.Dwarf:
      return 'Planeta enano';
    case PlanetType.Protoplanet:
      return 'Protoplaneta';
    case PlanetType.Tierra:
      return 'Planeta terrestre';
    case PlanetType.Planetoid:
      return 'Planetoide';
    case PlanetType.Sun:
      return 'Estrella';
    default:
      return String(type);
  }
}

/** Convierte un valor de enum SNAKE_CASE en texto legible "Title Case". */
export function humanizeEnumValue(value: string): string {
  return value
    .split('_')
    .map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(' ');
}

/** Convierte un color RGB en [0,1] a string hex `#rrggbb`. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(toByte(r))}${h(toByte(g))}${h(toByte(b))}`;
}
