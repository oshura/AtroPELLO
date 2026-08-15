import { MeshData, seededRng } from './station-geometry';

/**
 * TAPAS-SECCIÓN de un toroide de estación (docs/ESTACIONES.md §7, rebanada I0b): en cada frontera entre
 * un segmento vivo y uno destruido, un disco cierra el corte del tubo mostrando la arquitectura interior
 * "partida por ahí": forjados de las 3 cubiertas, compuertas entre secciones, tabiques rotos y tuberías.
 * Geometría en ESPACIO UNIDAD, horneada UNA vez en la malla de la propia estación (cero draw calls extra);
 * los acentos emissive (luz de emergencia, borde de puerta) van a las capas de ventanas fija/parpadeante.
 * Determinista por semilla. Genérico: reutilizable por cualquier raza de estación toroidal.
 */

type Vec3 = [number, number, number];

export interface StationCapSpec {
  ringRadius: number;
  tubeRadius: number;
  ringSeg: number;
  /** Segmentos destruidos del anillo (mismos índices que la malla y el collider). */
  destroyed: readonly number[];
  seed: string;
}

/** Acentos emissive de las tapas, a fusionar con las capas de ventanas (fija + parpadeante). */
export interface StationCapAccents {
  steady: MeshData;
  flicker: MeshData;
}

// --- Constantes de diseño (espacio unidad; con tubo R=0.13 y escala 800 → Ø 208 u de mundo) ---
const DECKS = 3;
const DISC_SEGMENTS = 24;
const LIFT_DISC = 0.0006;    // despegues anti z-fighting, en capas: fondo < plano < detalle < luz
const LIFT_FLAT = 0.0016;
const LIFT_DETAIL = 0.0024;
const LIFT_LIGHT = 0.0032;
const FLOOR_HALF_T = 0.0035;                       // media altura de los forjados (losas)
const DOOR_FRAME_HALF: [number, number] = [0.016, 0.030];
const DOOR_LEAF_HALF: [number, number] = [0.012, 0.026];
const WALL_HALF: [number, number] = [0.0025, 0.032]; // tabiques rotos (verticales, finos)
const PIPE_HALF_T = 0.0018;
const EDGE_MARGIN = 0.004;                         // holgura contra el borde del disco
const DOOR_LIGHT_CHANCE = 0.7;                     // no todas las tapas conservan energía en la puerta
const COL_BG: Vec3 = [0.10, 0.10, 0.13];           // interior en sombra (más oscuro que el casco)
const COL_FLOOR: Vec3 = [0.36, 0.37, 0.42];
const COL_FRAME: Vec3 = [0.24, 0.25, 0.30];
const COL_DOOR: Vec3 = [0.46, 0.36, 0.20];         // compuerta ámbar (metal pintado, sucio)
const COL_WALL: Vec3 = [0.28, 0.29, 0.34];
const COL_PIPE_A: Vec3 = [0.34, 0.20, 0.12];       // cobre
const COL_PIPE_B: Vec3 = [0.20, 0.22, 0.27];
const COL_EMERGENCY: Vec3 = [1.0, 0.30, 0.18];     // luz de emergencia (parpadeante)
const COL_DOOR_LIGHT: Vec3 = [1.0, 0.72, 0.35];    // borde de puerta aún alimentado (fijo, cálido)

/** Semianchura de la cuerda del disco a la altura `y` (0 si queda fuera). */
function chord(r: number, y: number): number {
  return Math.sqrt(Math.max(0, r * r - y * y));
}

/**
 * Añade a `target` un quad contenido en el plano de la tapa: coordenadas (u,v) en el plano
 * (u = radial `U`, v = vertical +Y), despegado `lift` por la normal `N` (hacia el boquete).
 */
function pushCapQuad(
  target: MeshData,
  c: Vec3,
  u: Vec3,
  n: Vec3,
  cu: number,
  cv: number,
  hu: number,
  hv: number,
  lift: number,
  col: Vec3,
  tubeRadius: number,
): void {
  const base = target.vertices.length / 3;
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pu = cu + su * hu;
    const pv = cv + sv * hv;
    target.vertices.push(
      c[0] + u[0] * pu + n[0] * lift,
      c[1] + pv + n[1] * lift,
      c[2] + u[2] * pu + n[2] * lift,
    );
    target.normals.push(n[0], n[1], n[2]);
    target.uvs.push((pu / tubeRadius + 1) / 2, (pv / tubeRadius + 1) / 2);
    target.colors.push(col[0], col[1], col[2]);
  }
  target.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
}

/** Disco base de la tapa (abanico), ligeramente despegado del plano de corte. */
function pushCapDisc(mesh: MeshData, c: Vec3, u: Vec3, n: Vec3, r: number): void {
  const base = mesh.vertices.length / 3;
  mesh.vertices.push(c[0] + n[0] * LIFT_DISC, c[1] + n[1] * LIFT_DISC, c[2] + n[2] * LIFT_DISC);
  mesh.normals.push(n[0], n[1], n[2]);
  mesh.uvs.push(0.5, 0.5);
  mesh.colors.push(COL_BG[0], COL_BG[1], COL_BG[2]);
  for (let i = 0; i <= DISC_SEGMENTS; i++) {
    const phi = (i / DISC_SEGMENTS) * Math.PI * 2;
    const pu = r * Math.cos(phi);
    const pv = r * Math.sin(phi);
    mesh.vertices.push(
      c[0] + u[0] * pu + n[0] * LIFT_DISC,
      c[1] + pv + n[1] * LIFT_DISC,
      c[2] + u[2] * pu + n[2] * LIFT_DISC,
    );
    mesh.normals.push(n[0], n[1], n[2]);
    mesh.uvs.push((Math.cos(phi) + 1) / 2, (Math.sin(phi) + 1) / 2);
    mesh.colors.push(COL_BG[0], COL_BG[1], COL_BG[2]);
  }
  for (let i = 0; i < DISC_SEGMENTS; i++) {
    mesh.indices.push(base, base + 1 + i, base + 2 + i);
  }
}

/** Construye UNA tapa en la frontera de ángulo `a`, con la cara hacia `side` (donde está el boquete). */
function buildCap(
  mesh: MeshData,
  accents: StationCapAccents,
  spec: StationCapSpec,
  rng: () => number,
  a: number,
  side: 1 | -1,
): void {
  const r = spec.tubeRadius;
  const c: Vec3 = [Math.cos(a) * spec.ringRadius, 0, Math.sin(a) * spec.ringRadius];
  const u: Vec3 = [Math.cos(a), 0, Math.sin(a)];                    // radial (horizontal del plano)
  const n: Vec3 = [-side * Math.sin(a), 0, side * Math.cos(a)];     // saliente hacia el boquete

  pushCapDisc(mesh, c, u, n, r);

  // Forjados de las 3 cubiertas: 2 losas horizontales que parten el tubo en tercios.
  for (const fy of [-r / 3, r / 3]) {
    const hw = chord(r, Math.abs(fy) + FLOOR_HALF_T) * 0.97;
    pushCapQuad(mesh, c, u, n, 0, fy, hw, FLOOR_HALF_T, LIFT_FLAT, COL_FLOOR, r);
  }

  // Por cubierta: compuerta (marco + hoja) y 1-2 tabiques rotos, a offsets sembrados.
  const deckStep = (2 * r) / DECKS;
  let midDoorU = 0;
  for (let d = 0; d < DECKS; d++) {
    const cy = (d - 1) * deckStep;
    const doorMax = chord(r, Math.abs(cy) + DOOR_FRAME_HALF[1]) - DOOR_FRAME_HALF[0] - EDGE_MARGIN;
    const du = (rng() * 2 - 1) * Math.max(0, doorMax);
    if (d === 1) midDoorU = du;
    pushCapQuad(mesh, c, u, n, du, cy, DOOR_FRAME_HALF[0], DOOR_FRAME_HALF[1], LIFT_FLAT + 0.0004, COL_FRAME, r);
    pushCapQuad(mesh, c, u, n, du, cy, DOOR_LEAF_HALF[0], DOOR_LEAF_HALF[1], LIFT_DETAIL, COL_DOOR, r);
    const walls = 1 + (rng() < 0.5 ? 1 : 0);
    for (let w = 0; w < walls; w++) {
      const wallMax = chord(r, Math.abs(cy) + WALL_HALF[1]) - WALL_HALF[0] - EDGE_MARGIN;
      const wu = (rng() * 2 - 1) * Math.max(0, wallMax);
      pushCapQuad(mesh, c, u, n, wu, cy, WALL_HALF[0], WALL_HALF[1], LIFT_FLAT, COL_WALL, r);
    }
  }

  // Tuberías bajo el "techo" (zona alta del corte).
  for (const [py, col] of [[r * 0.78, COL_PIPE_A], [r * 0.70, COL_PIPE_B]] as Array<[number, Vec3]>) {
    const hw = chord(r, py + PIPE_HALF_T) * 0.62;
    pushCapQuad(mesh, c, u, n, 0, py, hw, PIPE_HALF_T, LIFT_DETAIL, col, r);
  }

  // Acentos emissive: luz de emergencia sobre la compuerta central (capa PARPADEANTE, energía inestable)…
  pushCapQuad(accents.flicker, c, u, n, midDoorU, DOOR_FRAME_HALF[1] + 0.010, 0.005, 0.0035, LIFT_LIGHT, COL_EMERGENCY, r);
  // …y, en algunas tapas, el borde de una puerta aún alimentado (capa FIJA, cálido).
  if (rng() < DOOR_LIGHT_CHANCE) {
    const lu = midDoorU + (DOOR_FRAME_HALF[0] + EDGE_MARGIN) * (rng() < 0.5 ? 1 : -1);
    pushCapQuad(accents.steady, c, u, n, lu, 0, 0.0022, DOOR_LEAF_HALF[1], LIFT_LIGHT, COL_DOOR_LIGHT, r);
  }
}

/** Añade las tapas de TODOS los cortes vivo↔destruido del anillo (recorrido determinista). */
export function pushStationCaps(mesh: MeshData, accents: StationCapAccents, spec: StationCapSpec): void {
  const rng = seededRng(`${spec.seed}-caps`);
  const gaps = new Set(spec.destroyed);
  const segArc = (Math.PI * 2) / spec.ringSeg;
  for (let s = 0; s < spec.ringSeg; s++) {
    if (!gaps.has(s)) continue;
    if (!gaps.has((s + spec.ringSeg - 1) % spec.ringSeg)) buildCap(mesh, accents, spec, rng, s * segArc, 1);
    if (!gaps.has((s + 1) % spec.ringSeg)) buildCap(mesh, accents, spec, rng, (s + 1) * segArc, -1);
  }
}
