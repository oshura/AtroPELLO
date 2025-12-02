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

const RIFT_VAMPIRE_STATS: LesserBeingStats = {
  health: 100,
  maxSpeed: 50,
  acceleration: 4,
  deceleration: 5,
  rotationSpeed: Math.PI / 2.5,
  minRotationSpeed: Math.PI / 5
};

const RIFT_VAMPIRE_ATTACK_PROFILE: LesserBeingAttackProfile = {
  id: 'radiant_aura',
  kind: 'aura',
  cooldownMs: 10_000,
  maxRange: 1000,
  metadata: {
    damageNear: 10,
    damageFar: 1,
    auraRadius: 1000
  }
};

const RIFT_VAMPIRE_BEHAVIOR_PROFILE: LesserBeingBehaviorProfile = {
  preferredEngagementRange: [700, 900],
  fleeDistance: 400,
  orbitDistance: 850,
  notes: 'Mantiene distancia y libera pulsos radiales; huye en línea recta si la nave se acerca demasiado.'
};

const RIFT_VAMPIRE_COLOR: Color = { r: 0.9, g: 0.25, b: 0.15, a: 0.85 };
const RIFT_VAMPIRE_AURA_COLOR: Color = { r: 0.95, g: 0.35, b: 0.22, a: 0.4 };
const RIFT_VAMPIRE_AURA_SECONDARY: Color = { r: 0.65, g: 0.05, b: 0.25, a: 0.15 };
const RIFT_VAMPIRE_CORE_COLOR: Color = { r: 1.0, g: 0.9, b: 0.7, a: 0.85 };

export type RiftVampireSpawnOverrides = LesserBeingSpawnOverrides;

/**
 * Vampiro de Fuego del vacío: esfera translúcida con núcleo brillante pulsante.
 */
export class RiftVampireBeing extends LesserBeingBase {
  private pulseTimer = 0;

  constructor(overrides: RiftVampireSpawnOverrides = {}) {
    super({
      type: LesserBeing.VAMPIRO_FUEGO,
      stats: RIFT_VAMPIRE_STATS,
      attackProfile: RIFT_VAMPIRE_ATTACK_PROFILE,
      behaviorProfile: RIFT_VAMPIRE_BEHAVIOR_PROFILE,
      color: RIFT_VAMPIRE_COLOR,
      geometryDetail: 36,
      opacity: overrides.opacity ?? 0.85,
      ...overrides
    });

    const visualDescriptor: LesserBeingVisualDescriptor = {
      style: 'rift-vampire',
      seed: Math.random() * 10_000,
      aura: {
        radiusMultiplier: 2.0,
        color: RIFT_VAMPIRE_AURA_COLOR,
        secondaryColor: RIFT_VAMPIRE_AURA_SECONDARY,
        alpha: RIFT_VAMPIRE_AURA_COLOR.a ?? 0.4,
        secondaryAlpha: RIFT_VAMPIRE_AURA_SECONDARY.a ?? 0.12,
        pulseSpeed: 1.4,
        additive: true,
        depthWrite: false
      },
      core: {
        radiusMultiplier: 0.65,
        color: RIFT_VAMPIRE_CORE_COLOR,
        alpha: RIFT_VAMPIRE_CORE_COLOR.a ?? 0.85,
        pulseSpeed: 2.1,
        additive: true,
        depthWrite: false
      }
    };
    this.setVisualDescriptor(visualDescriptor);
  }

  public override update(deltaTime: number): void {
    this.pulseTimer += deltaTime;
    const oscillation = 0.55 + 0.35 * Math.sin(this.pulseTimer * 1.85);
    this.renderOpacity = Math.max(0.2, Math.min(1, oscillation));
    super.update(deltaTime);
  }

  protected override buildBodyGeometry(detail: number = 36): LesserBeingGeometry {
    const base = super.buildBodyGeometry(detail);
    const vertices = new Float32Array(base.vertices.length);
    const normals = new Float32Array(base.normals.length);

    for (let i = 0; i < base.vertices.length; i += 3) {
      const x = base.vertices[i];
      const y = base.vertices[i + 1];
      const z = base.vertices[i + 2];

      const radial = Math.hypot(x, z) || 1;
      const halo = 1 + 0.12 * Math.sin(8 * radial) + 0.06 * Math.cos(6 * y);
      const elongatedY = y * (1 + 0.2 * (1 - Math.abs(y)));

      const mutatedX = x * halo;
      const mutatedY = elongatedY * halo;
      const mutatedZ = z * halo;

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
