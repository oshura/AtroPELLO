import { calculateAtmosphereAttitude } from './atmosphere-attitude.util';
import { OrientationBasis } from '../targeting/compass-direction.util';

const planetCenter = { x: 0, y: 0, z: 0 };
const shipPosition = { x: 0, y: 5000, z: 0 };

function makeBasis(forward: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): OrientationBasis {
  return {
    forward,
    right,
    up,
  };
}

describe('calculateAtmosphereAttitude', () => {
  it('returns level attitude for orthogonal basis aligned with horizon', () => {
    const basis = makeBasis({ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(result.pitch).toBeCloseTo(0, 2);
    expect(result.roll).toBeCloseTo(0, 2);
  });

  it('detects nose-up pitch (+90°) when forward points to zenith', () => {
    const basis = makeBasis({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(result.pitch).toBeCloseTo(90, 2);
  });

  it('detects nose-down pitch (-90°) when forward points to planet center', () => {
    const basis = makeBasis({ x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(result.pitch).toBeCloseTo(-90, 2);
  });

  it('detects positive roll (right wing down) when basis is banked +90°', () => {
    const basis = makeBasis({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(result.roll).toBeCloseTo(90, 2);
  });

  it('detects negative roll (left wing down) when basis is banked -90°', () => {
    const basis = makeBasis({ x: 0, y: 0, z: 1 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(result.roll).toBeCloseTo(-90, 2);
  });

  it('detects inverted flight (~180° roll)', () => {
    const basis = makeBasis({ x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const result = calculateAtmosphereAttitude({ shipBasis: basis, shipPosition, planetCenter });
    expect(Math.abs(Math.abs(result.roll) - 180)).toBeLessThan(0.01);
    expect(result.pitch).toBeCloseTo(0, 2);
  });
});
