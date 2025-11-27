import { Vector3 } from '../../types/game.types';
import { OrientationBasis, calculateRelativeBearing, computeHeadingFromForward } from './compass-direction.util';

describe('Compass direction utilities', () => {
  const origin: Vector3 = { x: 0, y: 0, z: 0 };

  it('computes zero bearing for targets straight ahead', () => {
    const result = calculateRelativeBearing(origin, { x: 0, y: 0, z: 10 });
    expect(result.bearing).toBe(0);
    expect(result.elevation).toBe(0);
  });

  it('returns 90 degrees for targets on the right in default basis', () => {
    const result = calculateRelativeBearing(origin, { x: 10, y: 0, z: 0 });
    expect(result.bearing).toBeCloseTo(90, 6);
  });

  it('returns 270 degrees for targets on the left in default basis', () => {
    const result = calculateRelativeBearing(origin, { x: -10, y: 0, z: 0 });
    expect(result.bearing).toBeCloseTo(270, 6);
  });

  it('projects bearings relative to a rotated ship basis', () => {
    const basis: OrientationBasis = {
      forward: { x: 1, y: 0, z: 0 }, // ship faces +X
      right: { x: 0, y: 0, z: 1 },
      up: { x: 0, y: 1, z: 0 }
    };
    const worldNorth = calculateRelativeBearing(origin, { x: 0, y: 0, z: 5 }, basis);
    expect(worldNorth.bearing).toBeCloseTo(90, 6);

    const worldSouth = calculateRelativeBearing(origin, { x: 0, y: 0, z: -5 }, basis);
    expect(worldSouth.bearing).toBeCloseTo(270, 6);
  });

  it('adjusts bearings when the ship faces backward', () => {
    const basis: OrientationBasis = {
      forward: { x: 0, y: 0, z: -1 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 }
    };
    const result = calculateRelativeBearing(origin, { x: 0, y: 0, z: 5 }, basis);
    expect(result.bearing).toBeCloseTo(180, 6);
  });

  it('derives headings from arbitrary forward vectors', () => {
    expect(computeHeadingFromForward({ x: 0, y: 0, z: 1 })).toBeCloseTo(0, 6);
    expect(computeHeadingFromForward({ x: 1, y: 0, z: 0 })).toBeCloseTo(90, 6);
    expect(computeHeadingFromForward({ x: 0, y: 0, z: -1 })).toBeCloseTo(180, 6);
  });

  it('uses the supplied right axis when the ship is rolled 90 degrees', () => {
    const basis: OrientationBasis = {
      forward: { x: 0, y: 0, z: 1 },
      right: { x: 0, y: 1, z: 0 }, // rolled 90°
      up: { x: -1, y: 0, z: 0 }
    };
    const worldUp = calculateRelativeBearing(origin, { x: 0, y: 5, z: 0 }, basis);
    expect(worldUp.bearing).toBeCloseTo(90, 6);

    const worldDown = calculateRelativeBearing(origin, { x: 0, y: -5, z: 0 }, basis);
    expect(worldDown.bearing).toBeCloseTo(270, 6);
  });

  it('respects inverted roll for left/right bearings', () => {
    const basis: OrientationBasis = {
      forward: { x: 0, y: 0, z: 1 },
      right: { x: -1, y: 0, z: 0 }, // 180° roll
      up: { x: 0, y: -1, z: 0 }
    };
    const worldRight = calculateRelativeBearing(origin, { x: 10, y: 0, z: 0 }, basis);
    expect(worldRight.bearing).toBeCloseTo(270, 6); // now to pilot's left

    const worldLeft = calculateRelativeBearing(origin, { x: -10, y: 0, z: 0 }, basis);
    expect(worldLeft.bearing).toBeCloseTo(90, 6);
  });

  it('keeps provided right vector even when forward is vertical', () => {
    const basis: OrientationBasis = {
      forward: { x: 0, y: 1, z: 0 }, // nose pointing up
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: 0, z: -1 }
    };
    const east = calculateRelativeBearing(origin, { x: 10, y: 0, z: 0 }, basis);
    expect(east.bearing).toBeCloseTo(90, 6);

    const north = calculateRelativeBearing(origin, { x: 0, y: 0, z: 10 }, basis);
    expect(north.bearing).toBeCloseTo(0, 6);
  });
});
