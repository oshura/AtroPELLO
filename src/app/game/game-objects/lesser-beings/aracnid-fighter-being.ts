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

/**
 * Caza arácnido (Fase 15 — docs/RAZAS.md): la milicia de los tejedores. Sale de las estaciones
 * telaraña cuando el jugador se vuelve hostil y persigue a la nave en enjambre.
 *
 * NO es un siervo de primigenio: es tecnología de una raza. Por eso `externallyPiloted = true` — lo
 * pilota el AracnidWarSystem, no el LesserBeingController (cuya IA coloniza planetas). Todo lo
 * demás (render, targeting, daño, recompensa al morir) viaja por el pipeline de seres existente.
 *
 * Rápido, frágil y ágil: 60 HP y un giro que castiga a quien no tenga el maniobrador Mi-Go.
 */

const FIGHTER_STATS: LesserBeingStats = {
  health: 60,
  maxSpeed: 70,
  acceleration: 40,
  deceleration: 30,
  rotationSpeed: Math.PI / 1.2,
  minRotationSpeed: Math.PI / 2.4
};

const FIGHTER_ATTACK_PROFILE: LesserBeingAttackProfile = {
  id: 'needle_spit',
  kind: 'projectile',
  cooldownMs: 1400,
  maxRange: 600,
  metadata: {
    projectileSpeed: 260,
    damageNear: 8,
    damageFar: 3,
    falloffRange: 700
  }
};

const FIGHTER_BEHAVIOR_PROFILE: LesserBeingBehaviorProfile = {
  preferredEngagementRange: [120, 400],
  notes: 'Pilotado por AracnidWarSystem: persigue la nave, mantiene distancia de aguijoneo y dispara en rango.'
};

const FIGHTER_BODY_COLOR: Color = { r: 0.16, g: 0.13, b: 0.2, a: 1 };
const FIGHTER_LEG_COLOR: Color = { r: 0.1, g: 0.08, b: 0.14, a: 1 };
const FIGHTER_LEG_TIP_COLOR: Color = { r: 0.75, g: 0.2, b: 0.25, a: 0.95 };
const FIGHTER_HALO_COLOR: Color = { r: 0.45, g: 0.15, b: 0.6, a: 0.28 };
const FIGHTER_HALO_OUTER: Color = { r: 0.18, g: 0.05, b: 0.28, a: 0.07 };

export class AracnidFighterBeing extends LesserBeingBase {
  public override readonly externallyPiloted: boolean = true;
  /** Estación de la que salió (para liberar su slot de oleada al morir). */
  public readonly homeStationId: string;

  constructor(homeStationId: string, overrides: LesserBeingSpawnOverrides = {}) {
    super({
      // Sin entrada propia en el enum de siervos: los cazas son milicia de RAZA. NONE evita que
      // `registerHuntKill` los confunda con una pieza de caza de primigenio.
      type: LesserBeing.NONE,
      stats: FIGHTER_STATS,
      attackProfile: FIGHTER_ATTACK_PROFILE,
      behaviorProfile: FIGHTER_BEHAVIOR_PROFILE,
      color: FIGHTER_BODY_COLOR,
      geometryDetail: 24,
      radius: 1.6,
      ...overrides
    });
    this.homeStationId = homeStationId;

    // Araña del vacío: 8 patas rígidas cortas y oscuras con puntas rojizas + halo violeta tenue.
    const visualDescriptor: LesserBeingVisualDescriptor = {
      style: 'stellar-seed',
      seed: Math.random() * 10_000,
      tentacles: {
        count: 8,
        length: 1.5,
        width: 0.1,
        color: FIGHTER_LEG_COLOR,
        tipColor: FIGHTER_LEG_TIP_COLOR,
        noiseScale: 0.25,
        noiseSpeed: 2.2,
        spread: 0.85
      },
      halo: {
        radiusMultiplier: 1.4,
        color: FIGHTER_HALO_COLOR,
        secondaryColor: FIGHTER_HALO_OUTER,
        alpha: FIGHTER_HALO_COLOR.a ?? 0.28,
        secondaryAlpha: FIGHTER_HALO_OUTER.a ?? 0.07,
        pulseSpeed: 1.6,
        additive: true
      }
    };
    this.setVisualDescriptor(visualDescriptor);
  }

  public override getDisplayName(): string {
    return 'Caza arácnido';
  }

  /** Abdomen aplastado y alargado hacia atrás: silueta de araña, no de globo. */
  protected override buildBodyGeometry(detail: number = 24): LesserBeingGeometry {
    const base = super.buildBodyGeometry(detail);
    const vertices = new Float32Array(base.vertices.length);
    const normals = new Float32Array(base.normals.length);

    for (let i = 0; i < base.vertices.length; i += 3) {
      const x = base.vertices[i];
      const y = base.vertices[i + 1];
      const z = base.vertices[i + 2];

      // Aplastar en Y (cuerpo bajo) y estirar el abdomen hacia -Z (cola del caza).
      const abdomen = Math.max(0, -z);
      const mutatedX = x * (1 + abdomen * 0.25);
      const mutatedY = y * 0.62;
      const mutatedZ = z - abdomen * 0.45;

      vertices[i] = mutatedX;
      vertices[i + 1] = mutatedY;
      vertices[i + 2] = mutatedZ;

      const len = Math.hypot(mutatedX, mutatedY, mutatedZ) || 1;
      normals[i] = mutatedX / len;
      normals[i + 1] = mutatedY / len;
      normals[i + 2] = mutatedZ / len;
    }

    return { vertices, normals, uvs: base.uvs, indices: base.indices };
  }
}
