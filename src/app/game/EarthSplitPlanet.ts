import { Vector3, Color } from '../types/game.types';
import { Planet, PlanetColorName, PlanetType } from './Planet';
import { MegaAsteroid } from './MegaAsteroid';

/**
 * EarthSplitPlanet: two hemispheres separated along X with layered cap (crust/mantle/core)
 * and optional mega-asteroid debris ring in the split.
 */
export class EarthSplitPlanet extends Planet {
  private baseRadius: number;
  public separation: number; // world units between hemispheres (edge-to-edge)
  private layeredColors: Float32Array | null = null;

  constructor(id: string, colorName: PlanetColorName, radius: number, initialPos: Vector3, separation: number = 500) {
    super(id, colorName, radius, initialPos);
    this.planetType = PlanetType.Tierra;
  this.baseRadius = radius;
  this.separation = Math.max(0, separation);
    // Reapply layered per-vertex colors overriding the uniform colors set by base constructor
    if (this.layeredColors) {
      this.colors = this.layeredColors;
    }
  }

  /** Build two hemispheres (+caps) with layered colors on the cut plane */
  protected override initGeometry(): void {
    const latBands = 40;
    const lonBands = 40;
    // Base unit sphere vertices
    const baseVerts: Array<[number, number, number]> = [];
    const baseUVs: Array<[number, number]> = [];
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
        baseVerts.push([x, y, z]);
        baseUVs.push([lon / lonBands, 1 - lat / latBands]);
      }
    }
    // Base indices
    const baseIdx: number[] = [];
    for (let lat = 0; lat < latBands; lat++) {
      for (let lon = 0; lon < lonBands; lon++) {
        const first = lat * (lonBands + 1) + lon;
        const second = first + lonBands + 1;
        baseIdx.push(first, second, first + 1);
        baseIdx.push(second, second + 1, first + 1);
      }
    }

  const sepHalf = this.separation / 2; // world units
  const R = this.baseRadius; // equals this.scale.x from base Planet

    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    const pushTri = (v0: [number, number, number], v1: [number, number, number], v2: [number, number, number],
                     uv0: [number, number], uv1: [number, number], uv2: [number, number],
                     offsetXWorld: number, tint?: { r: number; g: number; b: number }) => {
      const baseIndex = vertices.length / 3;
      const offsetObj = (R > 0 ? offsetXWorld / R : 0); // convert desired world offset to object-space
      const add = (v: [number, number, number], uv: [number, number]) => {
        const x = v[0] + offsetObj;
        const y = v[1];
        const z = v[2];
        vertices.push(x, y, z);
        // normal from unit sphere vector
        const len = Math.hypot(v[0], v[1], v[2]) || 1;
        normals.push(v[0] / len, v[1] / len, v[2] / len);
        uvs.push(uv[0], uv[1]);
        // Color: base planet color tinted; if tint provided, use it
        const c = tint ?? { r: this.color.r, g: this.color.g, b: this.color.b };
        colors.push(c.r, c.g, c.b);
      };
      add(v0, uv0); add(v1, uv1); add(v2, uv2);
      indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
    };

    // Helper to add a cap (disk) at x = 0 with normal dir +/-X for a hemisphere
    const addCap = (normalX: number, offsetXWorld: number) => {
      const seg = 64;
      const baseIndex = vertices.length / 3;
      const offsetObj = (R > 0 ? offsetXWorld / R : 0);
      // center
      vertices.push(offsetObj, 0, 0);
      normals.push(normalX, 0, 0);
      uvs.push(0.5, 0.5);
      // center color based on core
      const coreCol = { r: 0.95, g: 0.75, b: 0.2 };
      colors.push(coreCol.r, coreCol.g, coreCol.b);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * 2 * Math.PI;
        const y = Math.cos(t);
        const z = Math.sin(t);
        const rad = Math.hypot(y, z);
        // Layered color based on radius on the disk
        let col: { r: number; g: number; b: number };
        if (rad < 0.35) col = { r: 0.95, g: 0.75, b: 0.2 }; // core
        else if (rad < 0.7) col = { r: 0.85, g: 0.35, b: 0.15 }; // mantle
        else col = { r: 0.55, g: 0.45, b: 0.4 }; // crust
        vertices.push(offsetObj, y, z);
        normals.push(normalX, 0, 0);
        uvs.push(0.5 + (y * 0.5), 0.5 + (z * 0.5));
        colors.push(col.r, col.g, col.b);
      }
      // Triangles fan
      for (let i = 1; i <= seg; i++) {
        const i0 = baseIndex; // center
        const i1 = baseIndex + i;
        const i2 = baseIndex + ((i % (seg)) + 1);
        indices.push(i0, i1, i2);
      }
    };

    // Split triangles into L/R by plane x=0
    for (let i = 0; i < baseIdx.length; i += 3) {
      const ia = baseIdx[i], ib = baseIdx[i + 1], ic = baseIdx[i + 2];
      const va = baseVerts[ia], vb = baseVerts[ib], vc = baseVerts[ic];
      const ua = baseUVs[ia], ub = baseUVs[ib], uc = baseUVs[ic];
      const avgX = (va[0] + vb[0] + vc[0]) / 3;
      if (avgX >= 0) {
        pushTri(va, vb, vc, ua, ub, uc, +sepHalf);
      } else {
        pushTri(va, vb, vc, ua, ub, uc, -sepHalf);
      }
    }

    // Caps
    addCap(+1, +sepHalf); // right hemisphere, normal +X
    addCap(-1, -sepHalf); // left hemisphere, normal -X

    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
    this.layeredColors = new Float32Array(colors);
  }

  /**
   * Factory to create split planet plus debris ring of MegaAsteroids along the cut.
   */
  static createWithDebris(
    id: string,
    colorName: PlanetColorName,
    radius: number,
    initialPos: Vector3,
    separation: number = 500,
    debrisCount: number = 12
  ): { planet: EarthSplitPlanet; debris: MegaAsteroid[] } {
    const planet = new EarthSplitPlanet(id, colorName, radius, initialPos, separation);
    planet.planetType = PlanetType.Tierra;
    const debris: MegaAsteroid[] = [];
    const R = radius;
    for (let i = 0; i < debrisCount; i++) {
      const t = (i / debrisCount) * 2 * Math.PI;
      const y = Math.cos(t) * R * (0.95 + Math.random() * 0.1);
      const z = Math.sin(t) * R * (0.95 + Math.random() * 0.1);
      const pos: Vector3 = { x: initialPos.x, y: initialPos.y + y, z: initialPos.z + z };
      const size = 1.0 * (0.8 + Math.random() * 0.4); // base size; MegaAsteroid multiplies by 5
      debris.push(new MegaAsteroid(`${id}-mega-${i}`, pos, size));
    }
    return { planet, debris };
  }
}
