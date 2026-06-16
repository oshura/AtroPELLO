import {
  cloneLesserBeingSnapshot,
  lesserBeingSnapshotFromSerialized,
  serializedFromLesserBeingSnapshot,
} from './lesser-being-state.codec';
import { LesserBeing, LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';

/**
 * "La prueba del campo nuevo" para lesser beings (docs/ARQUITECTURA.md §6.5).
 * El round-trip snapshot → serialized → snapshot debe conservar todos los campos.
 */
describe('lesser-being-state.codec', () => {
  function buildSnapshot(): LesserBeingInstanceSnapshot {
    const being = Object.values(LesserBeing).find(v => v !== LesserBeing.NONE) ?? LesserBeing.NONE;
    return {
      id: 'lb-spec-1',
      type: being,
      position: { x: 100, y: 200, z: -300 },
      velocity: { x: 1, y: -2, z: 3 },
      forward: { x: 0, y: 0, z: 1 },
      hasLanded: true,
      landedPlanetId: 'planet-spec-7',
      health: { current: 42, max: 80 },
      metadata: { rage: 3, phase: 2 },
    };
  }

  it('round-trip snapshot → serialized → snapshot es idéntico', () => {
    const snap1 = buildSnapshot();
    const serialized = serializedFromLesserBeingSnapshot(snap1);
    const snap2 = lesserBeingSnapshotFromSerialized(serialized);
    expect(snap2).toEqual(snap1);
  });

  it('clona en profundidad (sin referencias compartidas)', () => {
    const snap = buildSnapshot();
    const clone = cloneLesserBeingSnapshot(snap);
    expect(clone).toEqual(snap);
    expect(clone.position).not.toBe(snap.position);
    expect(clone.velocity).not.toBe(snap.velocity);
    expect(clone.forward).not.toBe(snap.forward);
    expect(clone.health).not.toBe(snap.health);
    expect(clone.metadata).not.toBe(snap.metadata);
  });

  it('un being errante (no aterrizado, sin metadata) hace round-trip', () => {
    const snap: LesserBeingInstanceSnapshot = {
      id: 'lb-roam',
      type: LesserBeing.NONE,
      position: { x: 0, y: 0, z: 0 },
      hasLanded: false,
      landedPlanetId: null,
    };
    const back = lesserBeingSnapshotFromSerialized(serializedFromLesserBeingSnapshot(snap));
    expect(back.id).toBe('lb-roam');
    expect(back.hasLanded).toBeFalse();
    expect(back.landedPlanetId).toBeNull();
    expect(back.metadata).toBeUndefined();
  });
});
