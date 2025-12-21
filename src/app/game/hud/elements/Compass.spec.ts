import { Compass } from './Compass';

describe('Compass', () => {
  it('exposes artificial horizon data through debug info', () => {
    const compass = new Compass();
    compass.setAtmosphereMode(true, 12.5, -33.25, 842.2);
    const debug = compass.getDebugInfo();

    expect(debug.atmosphereMode).toBeTrue();
    expect(debug.atmospherePitch).toBeCloseTo(12.5, 5);
    expect(debug.atmosphereRoll).toBeCloseTo(-33.25, 5);
    expect(debug.altitudeAboveGround).toBeCloseTo(842.2, 5);
  });

  it('disables artificial horizon state when atmosphere mode is off', () => {
    const compass = new Compass();
    compass.setAtmosphereMode(true, 5, 10, 200);
    compass.setAtmosphereMode(false);
    const debug = compass.getDebugInfo();

    expect(debug.atmosphereMode).toBeFalse();
  });

  it('smooths successive atmosphere updates to avoid jitter', () => {
    const compass = new Compass();
    compass.setAtmosphereMode(true, 0, 0, 0);
    compass.setAtmosphereMode(true, 40, 120, 800);
    const debug = compass.getDebugInfo();

    expect(debug.atmospherePitch).toBeGreaterThan(0);
    expect(debug.atmospherePitch).toBeLessThan(40);
    expect(debug.atmosphereRoll).toBeGreaterThan(0);
    expect(debug.atmosphereRoll).toBeLessThan(120);
    expect(debug.altitudeAboveGround).toBeGreaterThan(0);
    expect(debug.altitudeAboveGround).toBeLessThan(800);
  });
});
