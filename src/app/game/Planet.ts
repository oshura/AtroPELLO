import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';
import { ITargetable, TargetType } from './types/targeting.types';

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
  public orbitCenter: Vector3 = { x: 0, y: 0, z: 0 };
  public semiMajor: number = 60000; // a
  public semiMinor: number = 48000; // b
  public orbitAngle: number = 0;    // theta
  public orbitOrientation: number = 0; // rotation of ellipse in XZ
  public orbitAngularSpeed: number = 0.00002; // rad/sec

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3) {
    super(id, initialPos, { x: 0, y: 0, z: 0 }, { x: radius, y: radius, z: radius });
    this.baseColorName = colorName;
    const c = PLANET_COLORS[colorName];
    this.color = { r: c[0], g: c[1], b: c[2], a: 1 } as any;
    this.objectType = TargetType.PLANET;
    this.healthMax = 1;
    this.healthCurrent = 1;
  }

  public getDisplayName(): string { return this.customName ?? `Planet ${this.baseColorName}`; }
  public getTargetType(): TargetType { return TargetType.PLANET; }
  public isActive(): boolean { return this.active; }

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
  Planetoid = 'Planetoid',
}
