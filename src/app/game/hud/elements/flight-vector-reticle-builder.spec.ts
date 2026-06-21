import { mat4 } from 'gl-matrix';
import { FlightVectorReticleBuilder, FlightVectorReticleHost } from './flight-vector-reticle-builder';
import { Vector3 } from '../../../types/game.types';

interface HostOpts {
  ready?: boolean; position?: Vector3; forward?: Vector3; speed?: number; weapons?: number;
  view?: mat4; proj?: mat4; cinematic?: boolean; precision?: boolean;
}

function makeHost(opts: HostOpts = {}): FlightVectorReticleHost {
  const identity = mat4.create();
  return {
    isReady: () => opts.ready ?? true,
    getShipPosition: () => opts.position ?? { x: 0, y: 0, z: 0 },
    getShipForward: () => opts.forward ?? { x: 0, y: 0, z: 0 },
    getShipSpeed: () => opts.speed ?? 0,
    getShipWeaponsCount: () => opts.weapons ?? 0,
    getCameraViewMatrix: () => opts.view ?? identity,
    getCameraProjectionMatrix: () => opts.proj ?? identity,
    isCinematicAnimationRunning: () => opts.cinematic ?? false,
    isPrecisionRotationActive: () => opts.precision ?? false,
  };
}

describe('FlightVectorReticleBuilder', () => {
  it('projectionDistance escala con velocidad y clampa 250..1800', () => {
    const b = new FlightVectorReticleBuilder();
    expect(b.projectionDistance(0)).toBe(450);
    expect(b.projectionDistance(-5)).toBe(450);    // max(0, speed)
    expect(b.projectionDistance(1000)).toBe(1800); // clamp alto
  });

  it('project: punto delante con matrices identidad es visible y centrado', () => {
    const b = new FlightVectorReticleBuilder();
    const p = b.project({ x: 0, y: 0, z: 0 }, mat4.create(), mat4.create());
    expect(p).not.toBeNull();
    expect(p!.inFront).toBe(true);
    expect(p!.visible).toBe(true);
    expect(p!.normalizedX).toBeCloseTo(0.5, 5);
    expect(p!.normalizedY).toBeCloseTo(0.5, 5);
  });

  it('project: punto fuera del rango Z no es visible', () => {
    const b = new FlightVectorReticleBuilder();
    const p = b.project({ x: 0, y: 0, z: 5 }, mat4.create(), mat4.create());
    expect(p!.visible).toBe(false); // ndcZ=5 fuera de [-1.1, 1.1]
  });

  it('build: null si no está listo o hay cinemática en curso', () => {
    const b = new FlightVectorReticleBuilder();
    expect(b.build(makeHost({ ready: false }), 100)).toBeNull();
    expect(b.build(makeHost({ cinematic: true }), 100)).toBeNull();
  });

  it('build: modo navegación sin armas, combate con armas; speedRatio = gauge/200', () => {
    const b = new FlightVectorReticleBuilder();
    const nav = b.build(makeHost({ weapons: 0 }), 100);
    expect(nav).not.toBeNull();
    expect(nav!.mode).toBe('navigation');
    expect(nav!.speedRatio).toBeCloseTo(0.5, 5);
    expect(b.build(makeHost({ weapons: 2 }), 100)!.mode).toBe('combat');
  });

  it('build: precisionActive se propaga desde el host', () => {
    const b = new FlightVectorReticleBuilder();
    expect(b.build(makeHost({ precision: true }), 50)!.precisionActive).toBe(true);
  });
});
