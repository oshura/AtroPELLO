import {
  EARTH_PLANET_ID,
  RINGED_PLANET_ID,
  isEarthPlanet,
  isRingedPlanet,
} from './planet-classification';

describe('planet-classification', () => {
  it('expone los ids canónicos', () => {
    expect(EARTH_PLANET_ID).toBe('planet-earth');
    expect(RINGED_PLANET_ID).toBe('planet-saturn');
  });

  describe('isEarthPlanet', () => {
    it('true por id canónico o por tipo Tierra', () => {
      expect(isEarthPlanet('planet-earth')).toBe(true);
      expect(isEarthPlanet('otro', 'Tierra')).toBe(true);
    });
    it('false en otros casos', () => {
      expect(isEarthPlanet('planet-mars', 'Marte')).toBe(false);
      expect(isEarthPlanet(null)).toBe(false);
      expect(isEarthPlanet(undefined)).toBe(false);
    });
  });

  describe('isRingedPlanet', () => {
    it('true por id canónico o por kind ringed', () => {
      expect(isRingedPlanet('planet-saturn')).toBe(true);
      expect(isRingedPlanet('otro', 'ringed')).toBe(true);
    });
    it('false en otros casos', () => {
      expect(isRingedPlanet('planet-jupiter', 'gaseous')).toBe(false);
      expect(isRingedPlanet(null)).toBe(false);
    });
  });
});
