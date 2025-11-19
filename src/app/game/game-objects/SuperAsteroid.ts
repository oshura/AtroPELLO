import { Vector3 } from '../../types/game.types';
import { Asteroid } from './Asteroid';
import { TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';

/**
 * SuperAsteroid: igual que Asteroid pero con tamaño grande.
 * Importante: este constructor NO reescala el tamaño; usa el baseSize tal cual.
 * El multiplicador (p.ej. 3x–5x) se calcula en las factorías/creadores.
 */
export class SuperAsteroid extends Asteroid {
  constructor(
    id: string,
    position: Vector3,
    baseSize: number = 1.0,
    direction?: Vector3
  ) {
    // Usar el tamaño proporcionado directamente (la factoría decide el multiplicador)
    super(id, position, baseSize, direction);
    this.setType(GameObjectType.SUPER_ASTEROID); // Cambiar tipo de asteroide normal a super
    (this as any).objectType = TargetType.SUPER_ASTEROID;
    
    // Health: much tougher than regular asteroids (10-20 hits from ship)
    this.healthMax = 800;
    this.healthCurrent = this.healthMax;
  }

  // getTargetType heredado delega a objectType

  /**
   * Geometría del SuperAsteroide con subdivisión por midpoint split para mayor detalle.
   */
  protected override initGeometry(): void {
    // 1) Construir icosaedro base deformado (igual enfoque que Asteroid)
    const baseVertices: number[][] = [];
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    const scale = 0.5;
    const src = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ];
    // deformación similar al asteroide, pero con rango ligeramente distinto para más rugosidad
    for (const v of src) {
      const deformation = 0.35 + Math.random() * 0.45; // 0.35..0.8
      const n1 = (Math.random() - 0.5) * 0.35;
      const n2 = (Math.random() - 0.5) * 0.35;
      const n3 = (Math.random() - 0.5) * 0.35;
      baseVertices.push([
        (v[0] * deformation + n1) * scale,
        (v[1] * deformation + n2) * scale,
        (v[2] * deformation + n3) * scale
      ]);
    }

    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    // 2) Subdivisión por midpoint split (1 nivel)
    // Trabajamos con listas mutables de vértices e índices
    let verts = baseVertices.slice(); // array de [x,y,z]
    let idx: number[] = [];
    for (const f of faces) idx.push(f[0], f[1], f[2]);

    const edgeMidCache = new Map<string, number>();
    const getKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const midpoint = (a: number, b: number): number => {
      const key = getKey(a, b);
      const cached = edgeMidCache.get(key);
      if (cached !== undefined) return cached;
      const va = verts[a]; const vb = verts[b];
      const m: [number, number, number] = [
        (va[0] + vb[0]) * 0.5,
        (va[1] + vb[1]) * 0.5,
        (va[2] + vb[2]) * 0.5
      ];
      const idxNew = verts.push(m) - 1;
      edgeMidCache.set(key, idxNew);
      return idxNew;
    };

    const newIdx: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i], i1 = idx[i + 1], i2 = idx[i + 2];
      const m01 = midpoint(i0, i1);
      const m12 = midpoint(i1, i2);
      const m20 = midpoint(i2, i0);
      // 4 triángulos por cara original
      newIdx.push(i0, m01, m20);
      newIdx.push(i1, m12, m01);
      newIdx.push(i2, m20, m12);
      newIdx.push(m01, m12, m20);
    }
    idx = newIdx;

    // 3) Convertir a buffers y calcular normales/UVs simples (esféricos)
    const vCount = verts.length;
    const vertices = new Float32Array(vCount * 3);
    const normals = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    for (let i = 0; i < vCount; i++) {
      const x = verts[i][0], y = verts[i][1], z = verts[i][2];
      vertices[i * 3 + 0] = x;
      vertices[i * 3 + 1] = y;
      vertices[i * 3 + 2] = z;
      const len = Math.hypot(x, y, z) || 1;
      const nx = x / len, ny = y / len, nz = z / len;
      normals[i * 3 + 0] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
      const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
      const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
      uvs[i * 2 + 0] = u;
      uvs[i * 2 + 1] = v;
    }

    this.vertices = vertices;
    this.indices = new Uint16Array(idx);
    this.normals = normals;
    this.uvs = uvs;
  }

  /**
   * Crea un SuperAsteroide en una posición aleatoria en los bordes del mundo
   * replicando la lógica de posicionamiento de Asteroid pero con gran tamaño
   */
  static createRandomSuperAsteroid(
    id: string,
    worldBounds: { min: Vector3; max: Vector3 },
    centerPosition: Vector3
  ): SuperAsteroid {
    // Reutilizamos el método de Asteroid para base y aplicamos 4..6x
    const tmp = Asteroid.createRandomAsteroid(`${id}-tmp`, worldBounds, centerPosition);
    const mul = 4 + Math.random() * 2; // 4..6
    return new SuperAsteroid(id, { ...tmp.position }, tmp.size * mul, { ...tmp.direction });
  }
}
