import { Vector3 } from '../../types/game.types';
import { GameObject } from '../GameObject';
import { TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';
import { GameObjectAnimosity } from '../types/animosity.types';

/** Grupo de partes que se mueve junto (rotación lenta alrededor de un pivote para el "nado"). */
interface TurtlePartGroup {
  pivot: [number, number, number];
  axis: 'x' | 'y' | 'z';
  amp: number;        // amplitud en radianes (0 = estático)
  freqMul: number;    // multiplicador de frecuencia sobre la fase global
  phaseOffset: number;
}

interface TurtleBox {
  c: [number, number, number]; // centro
  h: [number, number, number]; // semi-ejes
  col: [number, number, number];
  group: number;
}

interface TurtleGeometry {
  vertices: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  uvs: Float32Array;
  vertexGroup: Uint8Array;
  groups: TurtlePartGroup[];
}

// 6 caras CCW vistas desde fuera (unidad) con su normal de cara (flat shading).
const FACES: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
  { n: [0, 0, 1],  v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0],  v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0],  v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

/** Construye la geometría de la tortuga (idéntica para todas las instancias) — se calcula una vez. */
function buildTurtleGeometry(): TurtleGeometry {
  const groups: TurtlePartGroup[] = [
    { pivot: [0, 0, 0], axis: 'y', amp: 0, freqMul: 0, phaseOffset: 0 },             // 0 estático
    { pivot: [0, 0, 1.0], axis: 'y', amp: 0.22, freqMul: 0.6, phaseOffset: 0 },      // 1 cabeza (mira)
    { pivot: [0.55, 0, 0.7], axis: 'z', amp: 0.50, freqMul: 1.0, phaseOffset: 0 },   // 2 aleta del. izq
    { pivot: [-0.55, 0, 0.7], axis: 'z', amp: -0.50, freqMul: 1.0, phaseOffset: 0 }, // 3 aleta del. der
    { pivot: [0.5, 0, -0.7], axis: 'z', amp: 0.42, freqMul: 1.0, phaseOffset: 1.9 }, // 4 aleta tras. izq
    { pivot: [-0.5, 0, -0.7], axis: 'z', amp: -0.42, freqMul: 1.0, phaseOffset: 1.9 },// 5 aleta tras. der
    { pivot: [0, 0.05, -1.05], axis: 'y', amp: 0.38, freqMul: 0.7, phaseOffset: Math.PI }, // 6 cola
  ];
  const boxes: TurtleBox[] = [
    // Caparazón (cúpula achatada) + plastrón
    { c: [0, 0.18, 0], h: [1.05, 0.30, 1.25], col: [0.16, 0.30, 0.12], group: 0 },
    { c: [0, 0.46, 0], h: [0.72, 0.22, 0.88], col: [0.20, 0.36, 0.14], group: 0 },
    { c: [0, 0.62, 0], h: [0.40, 0.12, 0.50], col: [0.24, 0.40, 0.16], group: 0 },
    { c: [0, -0.16, 0], h: [0.92, 0.12, 1.05], col: [0.42, 0.44, 0.22], group: 0 },
    // Cabeza (grupo 1): cuello, cabeza, pico chato y dos ojos brillantes (emissive)
    { c: [0, 0.0, 1.15], h: [0.22, 0.20, 0.25], col: [0.26, 0.40, 0.18], group: 1 },
    { c: [0, 0.02, 1.5], h: [0.30, 0.26, 0.30], col: [0.28, 0.44, 0.20], group: 1 },
    { c: [0, -0.06, 1.82], h: [0.20, 0.11, 0.13], col: [0.50, 0.42, 0.22], group: 1 }, // pico chato
    { c: [0.20, 0.13, 1.62], h: [0.085, 0.085, 0.085], col: [1.0, 0.90, 0.45], group: 1 }, // ojo (glow)
    { c: [-0.20, 0.13, 1.62], h: [0.085, 0.085, 0.085], col: [1.0, 0.90, 0.45], group: 1 },// ojo (glow)
    // Aletas delanteras (grupos 2/3) y traseras (grupos 4/5) — paletas planas
    { c: [1.05, -0.02, 0.7], h: [0.60, 0.09, 0.32], col: [0.26, 0.40, 0.17], group: 2 },
    { c: [-1.05, -0.02, 0.7], h: [0.60, 0.09, 0.32], col: [0.26, 0.40, 0.17], group: 3 },
    { c: [0.92, -0.04, -0.7], h: [0.50, 0.09, 0.28], col: [0.24, 0.38, 0.16], group: 4 },
    { c: [-0.92, -0.04, -0.7], h: [0.50, 0.09, 0.28], col: [0.24, 0.38, 0.16], group: 5 },
    // Cola (grupo 6)
    { c: [0, 0.06, -1.35], h: [0.13, 0.12, 0.32], col: [0.20, 0.32, 0.13], group: 6 },
  ];

  const verts: number[] = [];
  const norms: number[] = [];
  const cols: number[] = [];
  const groupOf: number[] = [];
  const indices: number[] = [];
  for (const box of boxes) {
    for (const face of FACES) {
      const base = verts.length / 3;
      for (let i = 0; i < 4; i++) {
        const v = face.v[i];
        verts.push(box.c[0] + v[0] * box.h[0], box.c[1] + v[1] * box.h[1], box.c[2] + v[2] * box.h[2]);
        norms.push(face.n[0], face.n[1], face.n[2]);
        cols.push(box.col[0], box.col[1], box.col[2]);
        groupOf.push(box.group);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return {
    vertices: new Float32Array(verts),
    normals: new Float32Array(norms),
    colors: new Float32Array(cols),
    indices: new Uint16Array(indices),
    uvs: new Float32Array((verts.length / 3) * 2),
    vertexGroup: new Uint8Array(groupOf),
    groups,
  };
}

/** Geometría base compartida (determinista) — se construye UNA vez al cargar el módulo. */
const TURTLE_GEO = buildTurtleGeometry();

/**
 * Tortuga gigante espacial (quelonio): caparazón, aletas delanteras/traseras, cola, cabeza con pico chato
 * y dos ojos brillantes (emissive). Geometría procedural por "partes": cada grupo (aletas, cabeza, cola) rota
 * lentamente alrededor de un pivote para simular un nado calmado. Mira a +Z. La trayectoria y el polvo estelar
 * los lleva SpaceTurtleSystem. docs/ARQUITECTURA.md Fase 6.4.
 *
 * Nota: los campos de animación se asignan en el CUERPO del constructor (tras `super()`) porque
 * `useDefineForClassFields` redefine los campos de la subclase a `undefined` justo después del super,
 * pisando lo que se asignara durante `initGeometry` (que el super llama).
 */
export class SpaceTurtleObject extends GameObject {
  public readonly isSpaceTurtle = true;
  public size!: number; // tamaño representativo (feature común de targeting/detalles)

  private restVertices!: Float32Array;
  private restNormals!: Float32Array;
  private vertexGroup!: Uint8Array;
  private groups!: TurtlePartGroup[];

  constructor(id: string, position: Vector3, size = 240) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: size, y: size, z: size });
    // Tras super (y tras el [[Define]] de los campos de esta subclase): datos de pose, ya seguros.
    this.restVertices = TURTLE_GEO.vertices;   // reposo inmutable (sólo lectura en applyPose)
    this.restNormals = TURTLE_GEO.normals;
    this.vertexGroup = TURTLE_GEO.vertexGroup;
    this.groups = TURTLE_GEO.groups;
    // Seleccionable/atacable como un megaasteroide (la identifica isSpaceTurtle para su botín propio),
    // NEUTRAL (no ataca) y MUY resistente (tanque).
    this.setType(GameObjectType.MEGA_ASTEROID);
    this.objectType = TargetType.MEGA_ASTEROID;
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.healthMax = 12000;
    this.healthCurrent = this.healthMax;
    this.voidMassUnits = 3000; // masa del vacío (feature común que muestra el panel de target)
    this.size = size;          // tamaño representativo (≈ escala) para los detalles
  }

  /** ITargetable: tipo de target (reusa MEGA_ASTEROID para integrarse con targeting/armas existentes). */
  public getTargetType(): TargetType {
    return this.objectType;
  }

  protected override initGeometry(): void {
    // Copias por instancia de lo que muta applyPose; el resto se comparte (sólo lectura).
    this.vertices = TURTLE_GEO.vertices.slice();
    this.normals = TURTLE_GEO.normals.slice();
    this.indices = TURTLE_GEO.indices;
    this.uvs = TURTLE_GEO.uvs;
  }

  protected override generateVertexColors(): void {
    this.colors = TURTLE_GEO.colors.slice();
  }

  public getDisplayName(): string {
    return 'Tortuga Estelar';
  }

  /**
   * Recalcula vértices/normales para la fase de nado dada (rotación lenta de aletas, cabeza y cola). El motor
   * re-sube los buffers vía {@link uploadDynamicGeometry}. Coste: ~336 vértices, despreciable (una tortuga).
   */
  applyPose(phase: number): void {
    const count = this.restVertices.length / 3;
    const cs = this.groups.map(grp => {
      const a = grp.amp === 0 ? 0 : grp.amp * Math.sin(phase * grp.freqMul + grp.phaseOffset);
      return { c: Math.cos(a), s: Math.sin(a), pivot: grp.pivot, axis: grp.axis, active: grp.amp !== 0 };
    });
    for (let i = 0; i < count; i++) {
      const gi = this.vertexGroup[i];
      const k = i * 3;
      const rx = this.restVertices[k], ry = this.restVertices[k + 1], rz = this.restVertices[k + 2];
      const nx = this.restNormals[k], ny = this.restNormals[k + 1], nz = this.restNormals[k + 2];
      const grp = cs[gi];
      if (!grp.active) {
        this.vertices[k] = rx; this.vertices[k + 1] = ry; this.vertices[k + 2] = rz;
        this.normals[k] = nx; this.normals[k + 1] = ny; this.normals[k + 2] = nz;
        continue;
      }
      const px = grp.pivot[0], py = grp.pivot[1], pz = grp.pivot[2];
      const dx = rx - px, dy = ry - py, dz = rz - pz;
      const c = grp.c, s = grp.s;
      let ox = dx, oy = dy, oz = dz, mnx = nx, mny = ny, mnz = nz;
      if (grp.axis === 'z') {
        ox = dx * c - dy * s; oy = dx * s + dy * c;
        mnx = nx * c - ny * s; mny = nx * s + ny * c;
      } else if (grp.axis === 'y') {
        ox = dx * c + dz * s; oz = -dx * s + dz * c;
        mnx = nx * c + nz * s; mnz = -nx * s + nz * c;
      } else { // 'x'
        oy = dy * c - dz * s; oz = dy * s + dz * c;
        mny = ny * c - nz * s; mnz = ny * s + nz * c;
      }
      this.vertices[k] = px + ox; this.vertices[k + 1] = py + oy; this.vertices[k + 2] = pz + oz;
      this.normals[k] = mnx; this.normals[k + 1] = mny; this.normals[k + 2] = mnz;
    }
  }

  /** Re-sube los buffers dinámicos (vértices + normales) tras `applyPose`. Requiere buffers ya creados. */
  uploadDynamicGeometry(gl: WebGLRenderingContext): void {
    if (this.vertexBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.DYNAMIC_DRAW);
    }
    if (this.normalBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.DYNAMIC_DRAW);
    }
  }

  /** Orienta la tortuga (yaw/pitch) para mirar en la dirección de avance `dir` (mira a +Z). */
  faceDirection(dir: Vector3): void {
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const x = dir.x / len, y = dir.y / len, z = dir.z / len;
    this.rotation.y = Math.atan2(x, z);
    this.rotation.x = -Math.asin(Math.max(-1, Math.min(1, y)));
    this.rotation.z = 0;
  }
}
