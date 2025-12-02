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

const STELLAR_SEED_STATS: LesserBeingStats = {
  health: 500,
  maxSpeed: 100,
  acceleration: 20,
  deceleration: 25,
  rotationSpeed: Math.PI / 1.25,
  minRotationSpeed: Math.PI / 2.5
};

const STELLAR_SEED_ATTACK_PROFILE: LesserBeingAttackProfile = {
  id: 'acid_spit',
  kind: 'projectile',
  cooldownMs: 3000,
  maxRange: 200,
  metadata: {
    coneDegrees: 15,
    damageNear: 100,
    damageFar: 1,
    falloffRange: 200,
    projectileSpeed: 150
  }
};

const STELLAR_SEED_BEHAVIOR_PROFILE: LesserBeingBehaviorProfile = {
  preferredEngagementRange: [60, 140],
  optimalTailDistance: 10,
  orbitDistance: 35,
  fleeDistance: 250,
  ignoresShipWhilePlanetHunting: false,
  notes: 'Prioriza colonizar planetas libres pero acosa la nave si entra en el cono frontal.'
};

const STELLAR_SEED_COLOR: Color = { r: 0.12, g: 0.45, b: 0.23, a: 1 };
const STELLAR_SEED_TENTACLE_COLOR: Color = { r: 0.3, g: 0.9, b: 0.5, a: 1 };
const STELLAR_SEED_TENTACLE_TIP_COLOR: Color = { r: 0.8, g: 1.0, b: 0.65, a: 0.95 };
const STELLAR_SEED_HALO_COLOR: Color = { r: 0.25, g: 0.85, b: 0.55, a: 0.35 };
const STELLAR_SEED_HALO_OUTER: Color = { r: 0.05, g: 0.35, b: 0.22, a: 0.08 };

export type StellarSeedSpawnOverrides = LesserBeingSpawnOverrides;

/**
 * Implementación de Semillas Estelares (Semillas devoradoras de espacio) con malla esférica deforme y cola estilizada.
 */
export class StellarSeedBeing extends LesserBeingBase {
  constructor(overrides: StellarSeedSpawnOverrides = {}) {
    super({
      type: LesserBeing.SEMILLAS_ESTELARES,
      stats: STELLAR_SEED_STATS,
      attackProfile: STELLAR_SEED_ATTACK_PROFILE,
      behaviorProfile: STELLAR_SEED_BEHAVIOR_PROFILE,
      color: STELLAR_SEED_COLOR,
      geometryDetail: 42,
      ...overrides
    });

    const visualDescriptor: LesserBeingVisualDescriptor = {
      style: 'stellar-seed',
      seed: Math.random() * 10_000,
      tentacles: {
        count: 6,
        length: 2.2,
        width: 0.16,
        color: STELLAR_SEED_TENTACLE_COLOR,
        tipColor: STELLAR_SEED_TENTACLE_TIP_COLOR,
        noiseScale: 0.65,
        noiseSpeed: 1.35,
        spread: 0.45
      },
      halo: {
        radiusMultiplier: 1.85,
        color: STELLAR_SEED_HALO_COLOR,
        secondaryColor: STELLAR_SEED_HALO_OUTER,
        alpha: STELLAR_SEED_HALO_COLOR.a ?? 0.35,
        secondaryAlpha: STELLAR_SEED_HALO_OUTER.a ?? 0.08,
        pulseSpeed: 0.85,
        additive: true,
        offset: { x: 0, y: 0, z: -0.1 }
      }
    };
    this.setVisualDescriptor(visualDescriptor);
  }

  protected override buildBodyGeometry(detail: number = 42): LesserBeingGeometry {
    const base = super.buildBodyGeometry(detail);
    const vertices = new Float32Array(base.vertices.length);
    const normals = new Float32Array(base.normals.length);

    for (let i = 0; i < base.vertices.length; i += 3) {
      const x = base.vertices[i];
      const y = base.vertices[i + 1];
      const z = base.vertices[i + 2];

      const tailFactor = Math.max(0, -y);
      const stalkFactor = Math.max(0, y - 0.4);

      // Estira la mitad trasera para simular cola bioluminiscente
      const stretch = tailFactor * 0.35;
      const radialShrink = 1 - tailFactor * 0.2;

      const mutatedX = x * radialShrink * (1 + stalkFactor * 0.05);
      const mutatedY = y - stretch;
      const mutatedZ = z * radialShrink * (1 + stalkFactor * 0.05);

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
