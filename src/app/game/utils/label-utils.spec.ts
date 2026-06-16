import { getPlanetTypeLabel, humanizeEnumValue, rgbToHex } from './label-utils';
import { PlanetType } from '../game-objects/Planet';

describe('label-utils', () => {
  it('getPlanetTypeLabel mapea tipos conocidos y undefined', () => {
    expect(getPlanetTypeLabel(undefined)).toBeUndefined();
    expect(getPlanetTypeLabel(PlanetType.Ringed)).toBe('Planeta anillado');
    expect(getPlanetTypeLabel(PlanetType.Sun)).toBe('Estrella');
    expect(getPlanetTypeLabel(PlanetType.Tierra)).toBe('Planeta terrestre');
  });

  it('humanizeEnumValue convierte SNAKE_CASE a Title Case', () => {
    expect(humanizeEnumValue('VAMPIRO_FUEGO')).toBe('Vampiro Fuego');
    expect(humanizeEnumValue('shoggoth')).toBe('Shoggoth');
  });

  it('rgbToHex convierte [0,1] a #rrggbb con clamp', () => {
    expect(rgbToHex(1, 1, 1)).toBe('#ffffff');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(2, -1, 0.5)).toBe('#ff0080'); // clamp arriba/abajo + redondeo
  });
});
