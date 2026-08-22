import { mat4, quat, vec3 } from 'gl-matrix';
import { GameObject } from '../../GameObject';
import { Vector3, Color } from '../../../types/game.types';
import { ITargetable, TargetType } from '../../types/targeting.types';
import { LesserBeing, LESSER_BEING_LABELS } from '../../types/cosmic-life.types';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

export interface LesserBeingStats {
  health: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  rotationSpeed: number;
  minRotationSpeed: number;
}

export type LesserBeingAttackKind = 'projectile' | 'radial-burst' | 'aura';

export interface LesserBeingAttackProfile {
  /** Identifier used by AI/controller */
  id: string;
  kind: LesserBeingAttackKind;
  cooldownMs: number;
  maxRange?: number;
  metadata?: Record<string, number>;
}

export interface LesserBeingBehaviorProfile {
  /** Preferred engagement distance range [min, max] */
  preferredEngagementRange?: [number, number];
  /** Distance to maintain when tailing the target (only for pursuit creatures) */
  optimalTailDistance?: number;
  /** Orbiting distance when waiting or circling a planet */
  orbitDistance?: number;
  /** Distance at which the being will disengage and flee */
  fleeDistance?: number;
  /** Whether the creature ignores the ship when a planet objective exists */
  ignoresShipWhilePlanetHunting?: boolean;
  /** Human-readable hint for designers */
  notes?: string;
}

export type LesserBeingVisualStyle = 'stellar-seed' | 'shoggoth' | 'rift-vampire';

export interface LesserBeingTentacleConfig {
  count: number;
  length: number;
  width: number;
  color: Color;
  tipColor?: Color;
  noiseScale?: number;
  noiseSpeed?: number;
  spread?: number;
}

export interface LesserBeingGlowConfig {
  radiusMultiplier: number;
  color: Color;
  secondaryColor?: Color;
  alpha?: number;
  secondaryAlpha?: number;
  pulseSpeed?: number;
  additive?: boolean;
  depthWrite?: boolean;
  offset?: Vector3;
}

export interface LesserBeingEyeConfig {
  count: number;
  radius: number;
  color: Color;
  pupilColor?: Color;
  wobbleSpeed?: number;
  minLatitude?: number;
}

export interface LesserBeingPustuleConfig {
  count: number;
  color: Color;
  radiusRange: [number, number];
  pulseSpeed?: number;
}

export interface LesserBeingVisualDescriptor {
  style: LesserBeingVisualStyle;
  seed?: number;
  tentacles?: LesserBeingTentacleConfig;
  halo?: LesserBeingGlowConfig;
  eyes?: LesserBeingEyeConfig;
  pustules?: LesserBeingPustuleConfig;
  aura?: LesserBeingGlowConfig;
  core?: LesserBeingGlowConfig;
}

export interface LesserBeingConfig {
  type: LesserBeing;
  stats: LesserBeingStats;
  attackProfile: LesserBeingAttackProfile;
  behaviorProfile: LesserBeingBehaviorProfile;
  id?: string;
  position?: Vector3;
  color?: Color;
  opacity?: number;
  radius?: number;
  geometryDetail?: number;
  animosity?: GameObjectAnimosity;
  visualDescriptor?: LesserBeingVisualDescriptor;
}

export type LesserBeingSpawnOverrides = Partial<
  Pick<LesserBeingConfig, 'id' | 'position' | 'color' | 'opacity' | 'radius' | 'geometryDetail' | 'animosity'>
>;

export interface LesserBeingGeometry {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

const DEFAULT_LESSER_BEING_RADIUS = Math.hypot(0.5, 0.3, 1.2); // Radio del bounding sphere de la nave antes de aplicar el factor 0.8
const DEFAULT_COLOR: Color = { r: 0.45, g: 0.45, b: 0.45, a: 1 };
const EPS = 1e-5;

export abstract class LesserBeingBase extends GameObject implements ITargetable {
  public readonly stats: LesserBeingStats;
  public readonly attackProfile: LesserBeingAttackProfile;
  public readonly behaviorProfile: LesserBeingBehaviorProfile;
  public readonly beingType: LesserBeing;
  /**
   * true = lo pilota un sistema propio (cazas arácnidos, Fase 15): el motor NO lo registra en el
   * LesserBeingController genérico (cuya IA busca planetas y aterriza, cosa que un caza no hace).
   * El resto del pipeline (render, targeting, daño, recompensa de kill) es idéntico.
   */
  public readonly externallyPiloted: boolean = false;
  public currentSpeed: number = 0;
  public targetSpeed: number = 0;
  public forwardDirection: Vector3 = { x: 0, y: 0, z: 1 };
  public hasLanded: boolean = false;
  public landedPlanetId: string | null = null;

  protected readonly baseRadius: number;
  protected readonly geometryDetail: number;
  protected orientationQuaternion: quat;
  protected orientationMatrix: mat4;
  protected visualDescriptor: LesserBeingVisualDescriptor | null = null;
  private readonly internalVisualSeed: number;
  
  private ensureOrientationState(): void {
    if (!this.orientationQuaternion) {
      this.orientationQuaternion = quat.create();
      quat.identity(this.orientationQuaternion);
    }
    if (!this.orientationMatrix) {
      this.orientationMatrix = mat4.create();
      mat4.identity(this.orientationMatrix);
    }
  }

  constructor(config: LesserBeingConfig) {
    const position = config.position ?? { x: 0, y: 0, z: 0 };
    const radius = config.radius ?? DEFAULT_LESSER_BEING_RADIUS;
    super(
      config.id ?? `lesser-${config.type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`,
      position,
      { x: 0, y: 0, z: 0 },
      { x: radius, y: radius, z: radius }
    );

    this.beingType = config.type;
    this.stats = { ...config.stats };
    this.attackProfile = { ...config.attackProfile };
    this.behaviorProfile = { ...config.behaviorProfile };
    this.baseRadius = radius;
    this.geometryDetail = Math.max(12, Math.floor(config.geometryDetail ?? 24));

    this.healthMax = this.stats.health;
    this.healthCurrent = this.stats.health;

    this.orientationQuaternion = quat.create();
    quat.identity(this.orientationQuaternion);
    this.orientationMatrix = mat4.create();
    mat4.identity(this.orientationMatrix);

    this.setType(GameObjectType.LESSER_BEING);
    this.objectType = TargetType.SPACESHIP;
    this.setAnimosity(config.animosity ?? GameObjectAnimosity.ENEMY);

    this.color = { ...(config.color ?? DEFAULT_COLOR) };
    if (typeof config.opacity === 'number') {
      this.renderOpacity = config.opacity;
      this.color.a = config.opacity;
    }
    this.internalVisualSeed = Math.random() * 10_000;
    if (config.visualDescriptor) {
      this.visualDescriptor = { ...config.visualDescriptor };
    }
    this.generateVertexColors();
    this.assignRandomVoidMass();

    this.updateForwardDirection();
  }

  public getDisplayName(): string {
    return LESSER_BEING_LABELS[this.beingType] ?? 'Entidad desconocida';
  }

  public getTargetType(): TargetType {
    return TargetType.SPACESHIP;
  }

  public override updateModelMatrix(): void {
    this.ensureOrientationState();
    const tempMatrix = mat4.create();
    mat4.translate(tempMatrix, tempMatrix, [this.position.x, this.position.y, this.position.z]);
    mat4.multiply(tempMatrix, tempMatrix, this.orientationMatrix);
    mat4.scale(tempMatrix, tempMatrix, [this.scale.x, this.scale.y, this.scale.z]);
    for (let i = 0; i < 16; i++) {
      this.modelMatrix[i] = tempMatrix[i];
    }
    this.updateForwardDirection();
  }

  /**
   * Ajusta la velocidad actual hacia la deseada teniendo en cuenta aceleración y frenado.
   */
  public adjustSpeed(desiredSpeed: number, deltaTime: number): void {
    const clampedDesired = Math.max(0, Math.min(this.stats.maxSpeed, desiredSpeed));
    this.targetSpeed = clampedDesired;

    if (clampedDesired > this.currentSpeed) {
      this.currentSpeed = Math.min(
        clampedDesired,
        this.currentSpeed + this.stats.acceleration * deltaTime
      );
    } else {
      this.currentSpeed = Math.max(
        clampedDesired,
        this.currentSpeed - this.stats.deceleration * deltaTime
      );
    }

    this.velocity.x = this.forwardDirection.x * this.currentSpeed;
    this.velocity.y = this.forwardDirection.y * this.currentSpeed;
    this.velocity.z = this.forwardDirection.z * this.currentSpeed;
  }

  /**
   * Rota suavemente la criatura para alinear el vector forward con la dirección deseada.
   */
  public steerTowards(direction: Vector3, deltaTime: number): void {
    this.ensureOrientationState();
    const desired = vec3.fromValues(direction.x, direction.y, direction.z);
    if (vec3.length(desired) < EPS) {
      return;
    }
    vec3.normalize(desired, desired);

    const currentForward = vec3.fromValues(
      this.orientationMatrix[8],
      this.orientationMatrix[9],
      this.orientationMatrix[10]
    );
    vec3.normalize(currentForward, currentForward);

    const dot = Math.max(-1, Math.min(1, vec3.dot(currentForward, desired)));
    const angle = Math.acos(dot);
    if (angle < EPS) {
      return;
    }

    const rotationAxis = vec3.create();
    vec3.cross(rotationAxis, currentForward, desired);
    if (vec3.length(rotationAxis) < EPS) {
      // Dirección opuesta: usar eje X local como fallback
      rotationAxis[0] = this.orientationMatrix[0];
      rotationAxis[1] = this.orientationMatrix[1];
      rotationAxis[2] = this.orientationMatrix[2];
    }
    vec3.normalize(rotationAxis, rotationAxis);

    const maxTurn = this.getCurrentRotationSpeed() * deltaTime;
    const appliedAngle = Math.min(angle, maxTurn);
    if (appliedAngle <= EPS) {
      return;
    }

    const deltaQuat = quat.create();
    quat.setAxisAngle(deltaQuat, rotationAxis, appliedAngle);
    quat.normalize(deltaQuat, deltaQuat);
    quat.multiply(this.orientationQuaternion, deltaQuat, this.orientationQuaternion);
    mat4.fromQuat(this.orientationMatrix, this.orientationQuaternion);
    this.syncEulerFromOrientation();
    this.updateForwardDirection();
  }

  /**
   * Devuelve la velocidad de giro actual dependiendo de la proporción de velocidad.
   */
  protected getCurrentRotationSpeed(): number {
    if (this.stats.maxSpeed <= 0) {
      return this.stats.rotationSpeed;
    }
    const speedFactor = Math.max(0, Math.min(1, this.currentSpeed / this.stats.maxSpeed));
    const range = Math.max(0, this.stats.rotationSpeed - this.stats.minRotationSpeed);
    return this.stats.rotationSpeed - range * speedFactor;
  }

  protected updateForwardDirection(): void {
    this.ensureOrientationState();
    this.forwardDirection = {
      x: this.orientationMatrix[8],
      y: this.orientationMatrix[9],
      z: this.orientationMatrix[10]
    };
    const len = Math.hypot(this.forwardDirection.x, this.forwardDirection.y, this.forwardDirection.z) || 1;
    this.forwardDirection.x /= len;
    this.forwardDirection.y /= len;
    this.forwardDirection.z /= len;
  }

  protected syncEulerFromOrientation(): void {
    this.ensureOrientationState();
    const sy = Math.sqrt(
      this.orientationMatrix[0] * this.orientationMatrix[0] +
      this.orientationMatrix[4] * this.orientationMatrix[4]
    );
    const singular = sy < 1e-6;

    this.rotation.y = Math.atan2(this.orientationMatrix[8], this.orientationMatrix[10]);

    if (!singular) {
      this.rotation.x = Math.atan2(-this.orientationMatrix[9], sy);
      this.rotation.z = Math.atan2(this.orientationMatrix[4], this.orientationMatrix[0]);
    } else {
      this.rotation.x = Math.atan2(-this.orientationMatrix[6], this.orientationMatrix[5]);
      this.rotation.z = 0;
    }
  }

  protected initGeometry(): void {
    const geometry = this.buildBodyGeometry();
    this.vertices = geometry.vertices;
    this.normals = geometry.normals;
    this.uvs = geometry.uvs;
    this.indices = geometry.indices;
  }

  /**
   * Permite que subclases definan geometrías personalizadas.
   */
  protected buildBodyGeometry(detail: number = this.geometryDetail): LesserBeingGeometry {
    return this.createSphereGeometry(detail, detail);
  }

  protected createSphereGeometry(latBands: number, lonBands: number): LesserBeingGeometry {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= latBands; lat++) {
      const theta = (lat * Math.PI) / latBands;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      for (let lon = 0; lon <= lonBands; lon++) {
        const phi = (lon * 2 * Math.PI) / lonBands;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);

        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;

        vertices.push(x, y, z);
        normals.push(x, y, z);
        uvs.push(lon / lonBands, 1 - lat / latBands);
      }
    }

    for (let lat = 0; lat < latBands; lat++) {
      for (let lon = 0; lon < lonBands; lon++) {
        const first = lat * (lonBands + 1) + lon;
        const second = first + lonBands + 1;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      indices: new Uint16Array(indices)
    };
  }

  public getVisualDescriptor(): LesserBeingVisualDescriptor | null {
    return this.visualDescriptor;
  }

  protected setVisualDescriptor(descriptor: LesserBeingVisualDescriptor): void {
    this.visualDescriptor = descriptor;
  }

  public getVisualSeed(): number {
    return this.visualDescriptor?.seed ?? this.internalVisualSeed;
  }

  public getBaseRadius(): number {
    return this.baseRadius;
  }

  public transformLocalPoint(local: Vector3, includeScale: boolean = true): Vector3 {
    const scaled: Vector3 = includeScale
      ? { x: local.x * this.scale.x, y: local.y * this.scale.y, z: local.z * this.scale.z }
      : { ...local };
    this.ensureOrientationState();
    const m = this.orientationMatrix;
    const worldX = scaled.x * m[0] + scaled.y * m[4] + scaled.z * m[8];
    const worldY = scaled.x * m[1] + scaled.y * m[5] + scaled.z * m[9];
    const worldZ = scaled.x * m[2] + scaled.y * m[6] + scaled.z * m[10];
    return {
      x: this.position.x + worldX,
      y: this.position.y + worldY,
      z: this.position.z + worldZ
    };
  }

  public transformLocalDirection(local: Vector3): Vector3 {
    const m = this.orientationMatrix;
    const worldX = local.x * m[0] + local.y * m[4] + local.z * m[8];
    const worldY = local.x * m[1] + local.y * m[5] + local.z * m[9];
    const worldZ = local.x * m[2] + local.y * m[6] + local.z * m[10];
    const len = Math.hypot(worldX, worldY, worldZ) || 1;
    return { x: worldX / len, y: worldY / len, z: worldZ / len };
  }

  private assignRandomVoidMass(): void {
    const min = 1000;
    const max = 2500;
    const value = min + Math.random() * (max - min);
    this.voidMassUnits = Math.round(value);
  }
}

export { DEFAULT_LESSER_BEING_RADIUS };
