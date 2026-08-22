import { GameObject } from '../GameObject';
import { Vector3 } from '../../types/game.types';
import { ITargetable, TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';
import {
  PlanetInhabitants,
  LesserBeing,
  PLANET_INHABITANT_POOL
} from '../types/cosmic-life.types';
import { GameObjectAnimosity } from '../types/animosity.types';
import { hashSeed, mulberry32 } from '../utils/seeded-random';
import { getPoolableRaces } from '../config/race-catalog.config';
import {
  PlanetIntelStatus,
  PLANET_INTEL_STATUS,
  PlanetMissionState,
  PlanetResourceStock,
  createEmptyResourceStock
} from '../types/planet-intel.types';

export type PlanetColorName = 'verde' | 'azul_hielo' | 'marron' | 'gris' | 'azul_marino' | 'rojo_carmesi' | 'violeta_oscuro';

const PLANET_COLORS: Record<PlanetColorName, [number, number, number]> = {
  verde: [0.20, 0.65, 0.35],
  azul_hielo: [0.70, 0.85, 1.00],
  marron: [0.45, 0.30, 0.20],
  gris: [0.55, 0.55, 0.58],
  azul_marino: [0.05, 0.10, 0.30],
  rojo_carmesi: [0.70, 0.04, 0.18],
  violeta_oscuro: [0.25, 0.05, 0.35]
};

export class Planet extends GameObject implements ITargetable {
  public baseColorName: PlanetColorName;
  // Optional custom planetary name (for HUD/targeting display)
  public customName?: string;
  // High-level classification for the planet (enum)
  public planetType: PlanetType = PlanetType.Planetoid;
  // Probability of Life in percent [0..100]
  public probabilityOfLifePct: number = 0;
  /** Radius assigned at construction time (used for shrink calculations). */
  public readonly initialRadius: number;
  public inhabitants: PlanetInhabitants = PlanetInhabitants.NONE;
  public lesserBeing: LesserBeing | null = null;
  public visited: boolean = false;
  public lifeScanned: boolean = false;
  public creatureScanned: boolean = false;
  public hasArtifact: boolean = false;
  public artifactIntelStatus: PlanetIntelStatus = PLANET_INTEL_STATUS.UNKNOWN;
  public hasVoidMass: boolean = false;
  public voidMassIntelStatus: PlanetIntelStatus = PLANET_INTEL_STATUS.UNKNOWN;
  /** Total void mass this planet started with (units). */
  public voidMassCapacity: number = 0;
  /** Remaining void mass units after harvests. */
  public voidMassRemaining: number = 0;
  public civilizationIntelStatus: PlanetIntelStatus = PLANET_INTEL_STATUS.UNKNOWN;
  public lesserBeingIntelStatus: PlanetIntelStatus = PLANET_INTEL_STATUS.UNKNOWN;
  public pendingMission: PlanetMissionState | null = null;
  public resourceStock: PlanetResourceStock = createEmptyResourceStock();
  public orbitCenter: Vector3 = { x: 0, y: 0, z: 0 };
  public semiMajor: number = 60000; // a
  public semiMinor: number = 48000; // b
  public orbitAngle: number = 0;    // theta
  public orbitOrientation: number = 0; // rotation of ellipse in XZ
  public orbitAngularSpeed: number = 0.00002; // rad/sec
  // Generalized orbit plane: unit normal and in-plane major-axis direction (u)
  // Default keeps previous behavior: plane normal = +Y (XZ plane) and u along +X
  public orbitNormal: Vector3 = { x: 0, y: 1, z: 0 };
  public orbitU: Vector3 = { x: 1, y: 0, z: 0 };
  // Axial tilt (radians): applied as a fixed pre-rotation so the spin axis is inclined
  // Default ~23.44° like Earth, applied to all planets (can be set to 0 for specific types if desired)
  public axialTiltRad: number = (23.44 * Math.PI) / 180;

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, initialPos, { x: 0, y: 0, z: 0 }, { x: radius, y: radius, z: radius });
    this.initialRadius = radius;
    this.baseColorName = colorName;
    const c = PLANET_COLORS[colorName];
    this.color = { r: c[0], g: c[1], b: c[2], a: 1 } as any;
    this.setType(GameObjectType.PLANET); // Establecer tipo de GameObject
    this.objectType = TargetType.PLANET; // Mantener para compatibilidad
    
    // Health: planets are nearly indestructible (200-400 hits from ship)
    this.healthMax = 12000;
    this.healthCurrent = this.healthMax;
    
    // Importante: regenerar colores por vértice después de asignar this.color
    // (GameObject llama a generateVertexColors() antes de que Planet asigne su color base)
    this.generateVertexColors();
  }

  /**
   * Roll inhabitants once, based on probability, returning the selected race.
   * Por defecto la tirada se deriva del id del planeta: así un mismo mundo tiene siempre los
   * mismos habitantes entre recargas (ARQUITECTURA §4.2.6, determinismo por semilla).
   */
  public assignInhabitantsFromProbability(randomFn: () => number = mulberry32(hashSeed(this.id))): PlanetInhabitants {
    if (this.inhabitants !== PlanetInhabitants.NONE) {
      return this.inhabitants;
    }
    const pct = Math.max(0, Math.min(100, this.probabilityOfLifePct));
    if (pct <= 0) {
      this.inhabitants = PlanetInhabitants.NONE;
      return this.inhabitants;
    }
    const roll = Math.floor(randomFn() * 100) + 1;
    if (roll <= pct) {
      // Sólo razas terminadas: ver getPoolableRaces(). Hoy son los Grises.
      const pool = getPoolableRaces();
      const idx = pool.length > 0 ? Math.floor(randomFn() * pool.length) : -1;
      this.inhabitants = idx >= 0 ? pool[idx] : PlanetInhabitants.NONE;
    } else {
      this.inhabitants = PlanetInhabitants.NONE;
    }
    return this.inhabitants;
  }

  /** Attach or clear a lesser being and adjust animosity flags accordingly. */
  public setLesserBeing(being: LesserBeing | null): void {
    if (!being || being === LesserBeing.NONE) {
      this.lesserBeing = null;
      if (this.animosity === GameObjectAnimosity.ENEMY) {
        this.setAnimosity(GameObjectAnimosity.NEUTRAL);
      }
      return;
    }
    this.lesserBeing = being;
    this.creatureScanned = false;
    this.setAnimosity(GameObjectAnimosity.ENEMY);
  }

  public markVisited(): void {
    this.visited = true;
  }

  public markLifeScanned(): void {
    this.lifeScanned = true;
  }

  public markCreatureScanned(): void {
    this.creatureScanned = true;
  }

  public assignResourceStock(stock: PlanetResourceStock): void {
    this.resourceStock = { ...this.resourceStock, ...stock };
  }

  public setPendingMission(mission: PlanetMissionState | null): void {
    this.pendingMission = mission;
  }

  /** Assign both capacity and remaining void mass, clamping to valid ranges. */
  public setVoidMassLevels(capacity: number, remaining?: number): void {
    this.voidMassCapacity = Math.max(0, Number.isFinite(capacity) ? capacity : 0);
    if (typeof remaining === 'number' && Number.isFinite(remaining)) {
      this.voidMassRemaining = Math.max(0, Math.min(this.voidMassCapacity, remaining));
    } else {
      this.voidMassRemaining = this.voidMassCapacity;
    }
    this.refreshVoidMassFlags();
    this.updateScaleFromVoidMass();
  }

  /** Returns fraction of void mass remaining [0,1]. */
  public getVoidMassRatio(): number {
    if (this.voidMassCapacity <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, this.voidMassRemaining / this.voidMassCapacity));
  }

  /** Ensure hasVoidMass and HUD metadata stay in sync with remaining units. */
  public refreshVoidMassFlags(): void {
    this.voidMassRemaining = Math.max(0, Math.min(this.voidMassRemaining, this.voidMassCapacity));
    this.hasVoidMass = this.voidMassRemaining > 0;
    try { (this as any).voidMassUnits = this.voidMassRemaining; } catch {}
  }

  /** Adjust the visible radius of the planet based on remaining void mass. */
  public updateScaleFromVoidMass(minScaleRatio: number = 0.25): void {
    if (!Number.isFinite(this.initialRadius) || this.initialRadius <= 0 || this.voidMassCapacity <= 0) {
      return;
    }
    const ratio = this.getVoidMassRatio();
    const clampedRatio = this.hasVoidMass ? Math.max(minScaleRatio, ratio) : minScaleRatio;
    const targetRadius = this.initialRadius * clampedRatio;
    this.scale.x = targetRadius;
    this.scale.y = targetRadius;
    this.scale.z = targetRadius;
    if (this.boundingSphere) {
      this.boundingSphere.radius = targetRadius;
    }
  }

  public getDisplayName(): string { return this.customName ?? `Planet ${this.baseColorName}`; }
  public getTargetType(): TargetType { return TargetType.PLANET; }
  public override isActive(): boolean { return this.active; }

  /**
   * Override: include axial tilt before applying dynamic rotations (X→Y→Z).
   * This keeps the spin axis inclined by axialTiltRad relative to world Y.
   */
  public override updateModelMatrix(): void {
    // Reset
    this.identityMatrix(this.modelMatrix);
    // Translate to world position
    this.translate(this.modelMatrix, this.position.x, this.position.y, this.position.z);
    // Apply fixed axial tilt around Z so axis leans toward +X (Z choice is arbitrary but consistent)
    if (this.axialTiltRad) {
      this.rotateZ(this.modelMatrix, this.axialTiltRad);
    }
    // Apply intrinsic rotations in stable order
    this.rotateX(this.modelMatrix, this.rotation.x);
    this.rotateY(this.modelMatrix, this.rotation.y);
    this.rotateZ(this.modelMatrix, this.rotation.z);
    // Scale
    this.scaleMatrix(this.modelMatrix, this.scale.x, this.scale.y, this.scale.z);
  }

  protected initGeometry(): void {
    // Generate a unit sphere (radius 1) with lat/long, we will scale with this.scale
    const latBands = 40;
    const lonBands = 40;
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let lat = 0; lat <= latBands; lat++) {
      const theta = (lat * Math.PI) / latBands; // 0..pi
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let lon = 0; lon <= lonBands; lon++) {
        const phi = (lon * 2 * Math.PI) / lonBands; // 0..2pi
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
    this.vertices = new Float32Array(vertices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
    this.indices = new Uint16Array(indices);
  }
}

// Planet type enumeration for classification
export enum PlanetType {
  Giant = 'Giant',
  Dwarf = 'Dwarf',
  Protoplanet = 'Protoplanet',
  Gaseous = 'Gaseous',
  Tierra = 'Tierra',
  Ringed = 'Ringed',
  Planetoid = 'Planetoid',
  Sun = 'Sun',
}
