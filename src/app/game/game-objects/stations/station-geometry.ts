/**
 * Primitivos de malla para estaciones espaciales (cajas + toroides), en ESPACIO UNIDAD (la estación se
 * escala luego por su radio exterior). Reutilizable por cualquier raza de estación. Sin estado: acumula
 * en un {@link MeshData}. docs/ESTACIONES.md Fase 9. FPS: se construye UNA vez por subclase (módulo).
 */

export interface MeshData {
  vertices: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export function createMesh(): MeshData {
  return { vertices: [], normals: [], uvs: [], colors: [], indices: [] };
}

type Vec3 = [number, number, number];

// 6 caras CCW de un cubo unidad con su normal de cara (flat shading), con UV por cara.
const BOX_FACES: Array<{ n: Vec3; v: Vec3[] }> = [
  { n: [0, 0, 1],  v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0],  v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0],  v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];
const FACE_UV: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Añade una caja flat-shaded (centro `c`, semiejes `h`) con color y escala de UV (tiling de textura). */
export function pushBox(mesh: MeshData, c: Vec3, h: Vec3, col: Vec3, uvScale = 1): void {
  for (const face of BOX_FACES) {
    const base = mesh.vertices.length / 3;
    for (let i = 0; i < 4; i++) {
      const v = face.v[i];
      mesh.vertices.push(c[0] + v[0] * h[0], c[1] + v[1] * h[1], c[2] + v[2] * h[2]);
      mesh.normals.push(face.n[0], face.n[1], face.n[2]);
      mesh.uvs.push(FACE_UV[i][0] * uvScale, FACE_UV[i][1] * uvScale);
      mesh.colors.push(col[0], col[1], col[2]);
    }
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Añade un toroide en el plano XZ (eje del agujero = Y), centrado en el origen, con normales suaves.
 * `ringRadius` = radio del anillo central; `tubeRadius` = grosor del tubo. `present(i)` permite OMITIR
 * segmentos del anillo (huecos de daño): si devuelve false, ese segmento no se dibuja.
 */
export function pushTorus(
  mesh: MeshData,
  ringRadius: number,
  tubeRadius: number,
  ringSeg: number,
  tubeSeg: number,
  col: Vec3,
  uvScale = 1,
  present: (segIndex: number) => boolean = () => true,
): void {
  for (let i = 0; i < ringSeg; i++) {
    if (!present(i)) {
      continue;
    }
    // Cada segmento dibuja su quad-band entre u0 y u1 con sus propios vértices (permite huecos limpios).
    const u0 = (i / ringSeg) * Math.PI * 2;
    const u1 = ((i + 1) / ringSeg) * Math.PI * 2;
    for (let j = 0; j <= tubeSeg; j++) {
      const v = (j / tubeSeg) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      for (const [k, u] of [[0, u0], [1, u1]] as Array<[number, number]>) {
        const cu = Math.cos(u), su = Math.sin(u);
        const rx = ringRadius + tubeRadius * cv;
        mesh.vertices.push(rx * cu, tubeRadius * sv, rx * su);
        mesh.normals.push(cv * cu, sv, cv * su);
        mesh.uvs.push((i + k) / ringSeg * uvScale * ringSeg / 6, (j / tubeSeg) * uvScale);
      }
      mesh.colors.push(col[0], col[1], col[2], col[0], col[1], col[2]);
    }
    // Índices de la banda (2 columnas: k=0 y k=1; tubeSeg+1 filas)
    const base = mesh.vertices.length / 3 - (tubeSeg + 1) * 2;
    for (let j = 0; j < tubeSeg; j++) {
      const a = base + j * 2;
      const b = a + 1;
      const cIdx = a + 2;
      const d = a + 3;
      mesh.indices.push(a, cIdx, b, b, cIdx, d);
    }
  }
}

/** Añade una esfera (centro `c`, radio `r`) con normales radiales — para la "bola" del motor. */
export function pushSphere(
  mesh: MeshData, c: Vec3, r: number, col: Vec3, latBands = 12, lonBands = 16,
): void {
  const base = mesh.vertices.length / 3;
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat / latBands) * Math.PI;
    const st = Math.sin(theta), ct = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon / lonBands) * Math.PI * 2;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const nx = cp * st, ny = ct, nz = sp * st;
      mesh.vertices.push(c[0] + r * nx, c[1] + r * ny, c[2] + r * nz);
      mesh.normals.push(nx, ny, nz);
      mesh.uvs.push(lon / lonBands, lat / latBands);
      mesh.colors.push(col[0], col[1], col[2]);
    }
  }
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = base + lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;
      mesh.indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }
}

/**
 * Pinta "manchas" de daño sobre los colores por vértice de una malla ya construida: regiones corroídas
 * (rusty naranja-marrón) con un punto central quemado (casi negro), como si algo hubiera explosionado y
 * requemado los bordes. Determinista por `seed`. Los centros se muestrean entre los propios vértices (así
 * caen SIEMPRE sobre la superficie: toroide, pasadizos, núcleo). docs/ESTACIONES.md Fase 9.
 */
export function applyDamageStains(
  mesh: MeshData,
  seed: string,
  count: number,
  outerRadius: number,
  innerRadius: number,
  rust: Vec3 = [0.40, 0.19, 0.10],
  burnt: Vec3 = [0.05, 0.045, 0.05],
): void {
  const vcount = mesh.vertices.length / 3;
  if (vcount === 0) {
    return;
  }
  const rng = seededRng(seed);
  const centers: Vec3[] = [];
  for (let k = 0; k < count; k++) {
    const vi = Math.floor(rng() * vcount);
    centers.push([mesh.vertices[vi * 3], mesh.vertices[vi * 3 + 1], mesh.vertices[vi * 3 + 2]]);
  }
  const span = Math.max(1e-6, outerRadius - innerRadius);
  for (let i = 0; i < vcount; i++) {
    const vx = mesh.vertices[i * 3], vy = mesh.vertices[i * 3 + 1], vz = mesh.vertices[i * 3 + 2];
    let best = Infinity;
    for (const c of centers) {
      const dx = vx - c[0], dy = vy - c[1], dz = vz - c[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) {
        best = d;
      }
    }
    if (best >= outerRadius) {
      continue; // fuera de toda mancha: color original intacto
    }
    const ci = i * 3;
    const orig: Vec3 = [mesh.colors[ci], mesh.colors[ci + 1], mesh.colors[ci + 2]];
    let col: Vec3;
    if (best <= innerRadius) {
      // Centro quemado → rusty (más negro cuanto más al centro).
      const t = best / innerRadius; // 0 centro, 1 borde del núcleo
      col = mix(burnt, rust, t);
    } else {
      // Anillo rusty → color original (se difumina hacia el borde exterior).
      const t = (best - innerRadius) / span; // 0 rusty, 1 original
      col = mix(rust, orig, t);
    }
    mesh.colors[ci] = col[0];
    mesh.colors[ci + 1] = col[1];
    mesh.colors[ci + 2] = col[2];
  }
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Convierte un MeshData a los typed arrays que consumen los buffers WebGL. */
export function toTypedMesh(mesh: MeshData): {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
} {
  return {
    vertices: new Float32Array(mesh.vertices),
    normals: new Float32Array(mesh.normals),
    uvs: new Float32Array(mesh.uvs),
    colors: new Float32Array(mesh.colors),
    indices: new Uint16Array(mesh.indices),
  };
}

/**
 * Escribe en `out` (col-major, WebGL) una matriz de modelo desde una base ortonormal en MUNDO (right/up/fwd)
 * + posición + escala POR EJE. Orienta objetos rígidamente pegados a la estación (puertos, pecios, bola de
 * motor) SIN pasar por ángulos de Euler, evitando el bamboleo/gimbal cuando la estación inclinada gira. `fwd`
 * es el eje +Z local; `scale` puede ser no uniforme (p.ej. aplastar la bola del motor por su eje Y → M&M).
 */
export function composeBasisMatrix(
  out: Float32Array,
  pos: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
  fwd: { x: number; y: number; z: number },
  scale: { x: number; y: number; z: number },
): void {
  out[0] = right.x * scale.x; out[1] = right.y * scale.x; out[2] = right.z * scale.x; out[3] = 0;
  out[4] = up.x * scale.y;    out[5] = up.y * scale.y;    out[6] = up.z * scale.y;    out[7] = 0;
  out[8] = fwd.x * scale.z;   out[9] = fwd.y * scale.z;   out[10] = fwd.z * scale.z;  out[11] = 0;
  out[12] = pos.x; out[13] = pos.y; out[14] = pos.z; out[15] = 1;
}

/** RNG determinista (mulberry32) sembrado por hash de string — para daño reproducible por id. */
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
