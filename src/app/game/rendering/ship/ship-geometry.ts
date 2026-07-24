/**
 * Geometría procedural de la nave del jugador "Vástago" (caza sci-fi pulido). docs/ARQUITECTURA.md §10.c.
 * Malla triangular NO indexada (drawArrays), partida por material + comportamiento (estática / morro con
 * anclaje / alas plegables / escapes). Coordenadas: +Z = adelante. El `ShipRenderer` aplica las transformadas
 * dinámicas (pitch del morro, plegado de alas, escala del escape) y el material por parte.
 *
 * NO sustituye a `Spaceship.createXxxGeometry` (esas siguen para el pecio de estaciones); esta es la malla
 * de RENDER de la nave del jugador.
 */
export type ShipPartDyn = 'static' | 'nose' | 'wingL' | 'wingR' | 'exhaust';

export interface ShipMaterial {
  color: [number, number, number];
  metal: number;       // 0..1 → agudeza/fuerza del especular
  emissive: number;    // 0..1 → acentos que "lucen"
  panels: 0 | 1;       // 1 = líneas de panel + desgaste en el casco
  rim: [number, number, number]; // color del rim fresnel
}

export interface ShipPart {
  positions: Float32Array;
  normals: Float32Array;
  material: ShipMaterial;
  dyn: ShipPartDyn;
  hinge?: [number, number, number];  // bisagra (alas) / centro (escape)
  hideInCockpit?: boolean;
}

const S = 0.7; // escala global (envergadura de alas ≈ ±1.2 como la nave antigua)

const STEEL: ShipMaterial = { color: [0.42, 0.48, 0.58], metal: 0.85, emissive: 0, panels: 1, rim: [0.35, 0.55, 0.95] };
const DARK: ShipMaterial  = { color: [0.16, 0.19, 0.26], metal: 0.7,  emissive: 0, panels: 1, rim: [0.30, 0.45, 0.80] };
const GLASS: ShipMaterial = { color: [0.35, 0.80, 1.00], metal: 0.4,  emissive: 0.5, panels: 0, rim: [0.55, 0.85, 1.00] };
const EXHAUST: ShipMaterial = { color: [0.40, 0.85, 1.00], metal: 0, emissive: 1, panels: 0, rim: [0, 0, 0] };
const LIGHT: ShipMaterial = { color: [0.66, 0.50, 1.00], metal: 0, emissive: 1, panels: 0, rim: [0, 0, 0] };

type Raw = { p: number[]; n: number[] };
function raw(): Raw { return { p: [], n: [] }; }

function rot3(v: [number, number, number], rx: number, ry: number, rz: number): [number, number, number] {
  let [x, y, z] = v, c: number, s: number;
  if (rx) { c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (ry) { c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (rz) { c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [x, y, z];
}

/** Añade `src` (local) a `dst` aplicando rotación r y traslación t, y escala global S a la posición. */
function place(dst: Raw, src: Raw, t: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0]): void {
  for (let i = 0; i < src.p.length; i += 3) {
    const pv = rot3([src.p[i], src.p[i + 1], src.p[i + 2]], r[0], r[1], r[2]);
    dst.p.push((pv[0] + t[0]) * S, (pv[1] + t[1]) * S, (pv[2] + t[2]) * S);
    const nv = rot3([src.n[i], src.n[i + 1], src.n[i + 2]], r[0], r[1], r[2]);
    const nl = Math.hypot(nv[0], nv[1], nv[2]) || 1;
    dst.n.push(nv[0] / nl, nv[1] / nl, nv[2] / nl);
  }
}

function tri(m: Raw, a: number[], b: number[], c: number[]): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  m.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  m.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

function box(w: number, h: number, d: number): Raw {
  const m = raw(); const x = w / 2, y = h / 2, z = d / 2;
  const v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const q = (a: number, b: number, c: number, d2: number) => { tri(m, v[a], v[b], v[c]); tri(m, v[a], v[c], v[d2]); };
  q(4, 5, 6, 7); q(1, 0, 3, 2); q(5, 1, 2, 6); q(0, 4, 7, 3); q(3, 7, 6, 2); q(0, 1, 5, 4);
  return m;
}
function ellip(rx: number, ry: number, rz: number, LA = 14, LO = 20): Raw {
  const m = raw();
  const g = (a: number, o: number) => {
    const th = a / LA * Math.PI, ph = o / LO * Math.PI * 2;
    const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    return { p: [x * rx, y * ry, z * rz], n: [x / rx, y / ry, z / rz] };
  };
  for (let a = 0; a < LA; a++) for (let o = 0; o < LO; o++) {
    const p00 = g(a, o), p01 = g(a, o + 1), p10 = g(a + 1, o), p11 = g(a + 1, o + 1);
    const push = (A: { p: number[]; n: number[] }, B: typeof A, C: typeof A) => {
      const nA = Math.hypot(...(A.n as [number, number, number])) || 1;
      const nB = Math.hypot(...(B.n as [number, number, number])) || 1;
      const nC = Math.hypot(...(C.n as [number, number, number])) || 1;
      m.p.push(...A.p, ...B.p, ...C.p);
      m.n.push(A.n[0] / nA, A.n[1] / nA, A.n[2] / nA, B.n[0] / nB, B.n[1] / nB, B.n[2] / nB, C.n[0] / nC, C.n[1] / nC, C.n[2] / nC);
    };
    push(p00, p10, p11); push(p00, p11, p01);
  }
  return m;
}
function cone(r: number, h: number, seg = 18): Raw {
  const m = raw(); const ap = [0, h / 2, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const b0 = [Math.cos(a0) * r, -h / 2, Math.sin(a0) * r], b1 = [Math.cos(a1) * r, -h / 2, Math.sin(a1) * r];
    tri(m, b0, b1, ap); tri(m, b1, b0, [0, -h / 2, 0]);
  }
  return m;
}
function cyl(r: number, h: number, seg = 16): Raw {
  const m = raw();
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0 = [c0 * r, -h / 2, s0 * r], b1 = [c1 * r, -h / 2, s1 * r], t0 = [c0 * r, h / 2, s0 * r], t1 = [c1 * r, h / 2, s1 * r];
    tri(m, b0, b1, t1); tri(m, b0, t1, t0);
    tri(m, [0, h / 2, 0], t0, t1); tri(m, [0, -h / 2, 0], b1, b0);
  }
  return m;
}

function toPart(m: Raw, material: ShipMaterial, dyn: ShipPartDyn, extra: Partial<ShipPart> = {}): ShipPart {
  return { positions: new Float32Array(m.p), normals: new Float32Array(m.n), material, dyn, ...extra };
}
const sc = (v: [number, number, number]): [number, number, number] => [v[0] * S, v[1] * S, v[2] * S];

/** Construye las partes del Vástago. */
export function buildVastago(): ShipPart[] {
  const parts: ShipPart[] = [];

  // Casco de acero (fuselaje + aletas de cola)
  const hull = raw();
  place(hull, ellip(0.55, 0.5, 1.35), [0, 0, 0.15]);
  place(hull, box(0.05, 0.5, 0.5), [-0.34, 0.28, -1.0], [0.3, 0, -0.35]);
  place(hull, box(0.05, 0.5, 0.5), [0.34, 0.28, -1.0], [0.3, 0, 0.35]);
  parts.push(toPart(hull, STEEL, 'static'));

  // Piezas oscuras (tobera + góndolas + canards)
  const dark = raw();
  place(dark, cone(0.5, 1.1, 16), [0, 0, -1.15], [-Math.PI / 2, 0, 0]);
  place(dark, cyl(0.17, 1.0, 14), [-0.42, -0.12, -0.7], [Math.PI / 2, 0, 0]);
  place(dark, cyl(0.17, 1.0, 14), [0.42, -0.12, -0.7], [Math.PI / 2, 0, 0]);
  place(dark, box(0.9, 0.05, 0.34), [-0.72, 0.02, 0.95], [0, 0.5, 0]);
  place(dark, box(0.9, 0.05, 0.34), [0.72, 0.02, 0.95], [0, -0.5, 0]);
  parts.push(toPart(dark, DARK, 'static'));

  // Morro (cono) — anclaje/pitch dinámico, oculto en modo cabina
  const nose = raw();
  place(nose, cone(0.42, 1.5, 20), [0, 0, 1.5], [Math.PI / 2, 0, 0]);
  parts.push(toPart(nose, STEEL, 'nose', { hideInCockpit: true }));

  // Canopy (cristal emisivo) — oculto en modo cabina
  const canopy = raw();
  place(canopy, ellip(0.3, 0.26, 0.62), [0, 0.33, 0.5]);
  parts.push(toPart(canopy, GLASS, 'static', { hideInCockpit: true }));

  // Alas en delta (plegables). Geometría en espacio-nave; bisagra en la raíz.
  const wingL = raw();
  place(wingL, box(1.7, 0.07, 0.72), [-1.0, -0.05, -0.15], [0, 0.42, -0.06]);
  parts.push(toPart(wingL, STEEL, 'wingL', { hinge: sc([-0.32, -0.05, -0.15]) }));
  const wingR = raw();
  place(wingR, box(1.7, 0.07, 0.72), [1.0, -0.05, -0.15], [0, -0.42, 0.06]);
  parts.push(toPart(wingR, STEEL, 'wingR', { hinge: sc([0.32, -0.05, -0.15]) }));

  // Escapes (emisivos) — centrados en origen; el renderer los coloca (hinge) y escala por empuje.
  const exhaust = () => { const m = raw(); place(m, ellip(0.15, 0.15, 0.09)); return m; };
  parts.push(toPart(exhaust(), { ...EXHAUST }, 'exhaust', { hinge: sc([-0.42, -0.12, -1.2]) }));
  parts.push(toPart(exhaust(), { ...EXHAUST }, 'exhaust', { hinge: sc([0.42, -0.12, -1.2]) }));

  // Luces (emisivo violeta): línea dorsal + dos balizas laterales
  const lights = raw();
  place(lights, box(0.09, 0.05, 0.5), [0, 0.5, -0.05]);
  place(lights, box(0.07, 0.05, 0.07), [-0.62, 0.02, 0.62]);
  place(lights, box(0.07, 0.05, 0.07), [0.62, 0.02, 0.62]);
  parts.push(toPart(lights, LIGHT, 'static'));

  return parts;
}
