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

function makeBasisFromPitchRoll(pitchDeg: number, rollDeg: number): OrientationBasis {
  const pitchRad = degreesToRadians(pitchDeg);
  const rollRad = degreesToRadians(rollDeg);

  const forward = normalize({
    x: 0,
    y: -Math.sin(pitchRad),
    z: Math.cos(pitchRad)
  });

  let up = normalize({
    x: 0,
    y: Math.cos(pitchRad),
    z: Math.sin(pitchRad)
  });

  let right = { x: 1, y: 0, z: 0 };
  right = rotateAroundAxis(right, forward, rollRad);
  up = rotateAroundAxis(up, forward, rollRad);

  return {
    forward,
    right,
    up,
  };
}

function rotateAroundAxis(vec: { x: number; y: number; z: number }, axis: { x: number; y: number; z: number }, angleRad: number) {
  const unitAxis = normalize(axis);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dotProd = dot(unitAxis, vec);
  const crossProd = cross(unitAxis, vec);

  return normalize({
    x: vec.x * cos + crossProd.x * sin + unitAxis.x * dotProd * (1 - cos),
    y: vec.y * cos + crossProd.y * sin + unitAxis.y * dotProd * (1 - cos),
    z: vec.z * cos + crossProd.z * sin + unitAxis.z * dotProd * (1 - cos)
  });
}

function normalize(vec: { x: number; y: number; z: number }) {
  const len = Math.hypot(vec.x, vec.y, vec.z);
  if (!isFinite(len) || len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
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

  it('maintains roll continuity while leveling after a steep bank', () => {
    const aggressiveBank = makeBasisFromPitchRoll(-30, 120);
    const leveledFlight = makeBasisFromPitchRoll(0, 120);

    const initial = calculateAtmosphereAttitude({ shipBasis: aggressiveBank, shipPosition, planetCenter });
    const leveled = calculateAtmosphereAttitude({ shipBasis: leveledFlight, shipPosition, planetCenter });

    expect(Math.abs(initial.pitch)).toBeGreaterThan(25);
    expect(initial.roll).toBeCloseTo(120, 1);
    expect(leveled.pitch).toBeCloseTo(0, 2);
    expect(leveled.roll).toBeCloseTo(120, 1);
  });
});
