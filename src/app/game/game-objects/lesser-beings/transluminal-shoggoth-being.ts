import { Color } from '../../../types/game.types';
import { LesserBeing } from '../../types/cosmic-life.types';
import {
  LesserBeingAttackProfile,
  LesserBeingBase,
  LesserBeingBehaviorProfile,
  LesserBeingGeometry,
  LesserBeingSpawnOverrides,
  LesserBeingStats,
  LesserBeingVisualDescriptor
} from './lesser-being-base';

const SHOGGOTH_STATS: LesserBeingStats = {
  health: 1000,
  maxSpeed: 40,
  acceleration: 1,
  deceleration: 1,
  rotationSpeed: Math.PI / 5,
  minRotationSpeed: Math.PI / 10
};

const SHOGGOTH_ATTACK_PROFILE: LesserBeingAttackProfile = {
  id: 'orb_burst',
  kind: 'radial-burst',
  cooldownMs: 6_000,
  maxRange: 120,
  metadata: {
    orbCount: 40,
    orbSpeed: 10,
    orbLifetime: 100,
    orbDamage: 50
  }
};

const SHOGGOTH_BEHAVIOR_PROFILE: LesserBeingBehaviorProfile = {
  preferredEngagementRange: [60, 120],
  orbitDistance: 80,
  ignoresShipWhilePlanetHunting: true,
  notes: 'Busca planetas libres, solo hostiga a la nave si no queda ningún objetivo.'
};

const SHOGGOTH_COLOR: Color = { r: 0.55, g: 0.55, b: 0.6, a: 1 };
const SHOGGOTH_EYE_COLOR: Color = { r: 0.96, g: 0.98, b: 1.0, a: 0.9 };
const SHOGGOTH_PUPIL_COLOR: Color = { r: 0.2, g: 0.45, b: 0.8, a: 0.85 };
const SHOGGOTH_PUSTULE_COLOR: Color = { r: 0.98, g: 0.78, b: 0.2, a: 0.75 };

export type ShoggothSpawnOverrides = LesserBeingSpawnOverrides;

/**
 * Representa a un Shoggoth transluminal: una masa gelatinosa con ojos que emite ráfagas radiales.
 */
export class TransluminalShoggothBeing extends LesserBeingBase {
  constructor(overrides: ShoggothSpawnOverrides = {}) {
    super({
      type: LesserBeing.SHOGGOTH,
      stats: SHOGGOTH_STATS,
      attackProfile: SHOGGOTH_ATTACK_PROFILE,
      behaviorProfile: SHOGGOTH_BEHAVIOR_PROFILE,
      color: SHOGGOTH_COLOR,
      geometryDetail: 48,
      ...overrides
    });

    const visualDescriptor: LesserBeingVisualDescriptor = {
      style: 'shoggoth',
      seed: Math.random() * 10_000,
      eyes: {
        count: 7,
        radius: 0.48,
        color: SHOGGOTH_EYE_COLOR,
        pupilColor: SHOGGOTH_PUPIL_COLOR,
        wobbleSpeed: 0.45,
        minLatitude: 0.25
      },
      pustules: {
        count: 12,
        color: SHOGGOTH_PUSTULE_COLOR,
        radiusRange: [0.24, 0.48],
        pulseSpeed: 1.2
      }
    };
    this.setVisualDescriptor(visualDescriptor);
  }

  protected override buildBodyGeometry(detail: number = 48): LesserBeingGeometry {
    const base = super.buildBodyGeometry(detail);
    const vertices = new Float32Array(base.vertices.length);
    const normals = new Float32Array(base.normals.length);

    for (let i = 0; i < base.vertices.length; i += 3) {
      const x = base.vertices[i];
      const y = base.vertices[i + 1];
      const z = base.vertices[i + 2];

      const theta = Math.acos(Math.max(-1, Math.min(1, y)));
      const phi = Math.atan2(z, x);

      const bulge = 0.18 * Math.sin(3 * theta) * Math.sin(2 * phi);
      const eyeRing = 0.08 * Math.max(0, Math.cos(6 * phi) * Math.sin(theta));
      const deformation = 1 + bulge + eyeRing;

      const mutatedX = x * deformation;
      const mutatedY = y * (1 + bulge * 0.4);
      const mutatedZ = z * deformation;

      vertices[i] = mutatedX;
      vertices[i + 1] = mutatedY;
      vertices[i + 2] = mutatedZ;

      const normalLength = Math.hypot(mutatedX, mutatedY, mutatedZ) || 1;
      normals[i] = mutatedX / normalLength;
      normals[i + 1] = mutatedY / normalLength;
      normals[i + 2] = mutatedZ / normalLength;
    }

    return {
      vertices,
      normals,
      uvs: base.uvs,
      indices: base.indices
    };
  }
}
