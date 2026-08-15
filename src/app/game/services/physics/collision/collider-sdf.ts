import { BoxShape, SdfContact, SphereShape, StructuredShape, TorusShape } from './collision-shape.types';

/**
 * Matemática PURA de la narrow phase estructurada (Fase 11, docs/COLISIONES.md §3.3):
 * distancias con signo (SDF) y normales analíticas por forma, en espacio LOCAL del objeto.
 * Sin estado, sin alocaciones en caliente (el llamador aporta el `SdfContact` reutilizable).
 * Convención: distancia negativa = punto dentro del material; normal SIEMPRE saliente.
 */

const TWO_PI = Math.PI * 2;
const EPS = 1e-9;

export function sdfSphere(s: SphereShape, px: number, py: number, pz: number): number {
  const dx = px - s.center[0];
  const dy = py - s.center[1];
  const dz = pz - s.center[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.radius;
}

export function sdfBox(b: BoxShape, px: number, py: number, pz: number): number {
  const qx = Math.abs(px - b.center[0]) - b.half[0];
  const qy = Math.abs(py - b.center[1]) - b.half[1];
  const qz = Math.abs(pz - b.center[2]) - b.half[2];
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

/** Índice de segmento angular del toro para un punto local (convención pushTorus: atan2(z,x) desde +X). */
export function torusSegmentIndex(t: TorusShape, px: number, pz: number): number {
  const segments = t.segments ?? 0;
  if (segments <= 0) return -1;
  const lx = px - t.center[0];
  const lz = pz - t.center[2];
  let angle = Math.atan2(lz, lx);
  if (angle < 0) angle += TWO_PI;
  const idx = Math.floor((angle / TWO_PI) * segments);
  return Math.min(idx, segments - 1); // guarda para angle == 2π por redondeo
}

/** Devuelve +Infinity si el punto cae en un segmento destruido (sin material en ese arco). */
export function sdfTorus(t: TorusShape, px: number, py: number, pz: number): number {
  if (t.gapSegments && t.gapSegments.length > 0) {
    const seg = torusSegmentIndex(t, px, pz);
    if (seg >= 0 && t.gapSegments.includes(seg)) return Infinity;
  }
  const lx = px - t.center[0];
  const ly = py - t.center[1];
  const lz = pz - t.center[2];
  const ringLen = Math.sqrt(lx * lx + lz * lz);
  const qx = ringLen - t.ringRadius;
  return Math.sqrt(qx * qx + ly * ly) - t.tubeRadius;
}

export function sdfShape(shape: StructuredShape, px: number, py: number, pz: number): number {
  switch (shape.kind) {
    case 'sphere': return sdfSphere(shape, px, py, pz);
    case 'box': return sdfBox(shape, px, py, pz);
    case 'torus': return sdfTorus(shape, px, py, pz);
  }
}

/** Escribe en `out` la normal unitaria saliente de `shape` en el punto local dado. */
export function shapeNormal(shape: StructuredShape, px: number, py: number, pz: number, out: SdfContact): void {
  switch (shape.kind) {
    case 'sphere': {
      const dx = px - shape.center[0];
      const dy = py - shape.center[1];
      const dz = pz - shape.center[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < EPS) { out.nx = 0; out.ny = 1; out.nz = 0; return; }
      out.nx = dx / len; out.ny = dy / len; out.nz = dz / len;
      return;
    }
    case 'box': {
      const dx = px - shape.center[0];
      const dy = py - shape.center[1];
      const dz = pz - shape.center[2];
      const qx = Math.abs(dx) - shape.half[0];
      const qy = Math.abs(dy) - shape.half[1];
      const qz = Math.abs(dz) - shape.half[2];
      if (qx > 0 || qy > 0 || qz > 0) {
        // Fuera: dirección desde el punto más cercano de la caja.
        const ox = Math.max(qx, 0) * Math.sign(dx);
        const oy = Math.max(qy, 0) * Math.sign(dy);
        const oz = Math.max(qz, 0) * Math.sign(dz);
        const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (len < EPS) { out.nx = 0; out.ny = 1; out.nz = 0; return; }
        out.nx = ox / len; out.ny = oy / len; out.nz = oz / len;
        return;
      }
      // Dentro: cara más próxima (q menos negativa), normal alineada a ese eje.
      if (qx >= qy && qx >= qz) { out.nx = Math.sign(dx) || 1; out.ny = 0; out.nz = 0; }
      else if (qy >= qz) { out.nx = 0; out.ny = Math.sign(dy) || 1; out.nz = 0; }
      else { out.nx = 0; out.ny = 0; out.nz = Math.sign(dz) || 1; }
      return;
    }
    case 'torus': {
      const lx = px - shape.center[0];
      const ly = py - shape.center[1];
      const lz = pz - shape.center[2];
      const ringLen = Math.sqrt(lx * lx + lz * lz);
      if (ringLen < EPS) { out.nx = 0; out.ny = Math.sign(ly) || 1; out.nz = 0; return; }
      // Punto más cercano del eje del tubo (círculo de radio ringRadius) → normal radial del tubo.
      const k = shape.ringRadius / ringLen;
      const tx = lx - lx * k;
      const ty = ly;
      const tz = lz - lz * k;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
      if (len < EPS) { out.nx = 0; out.ny = 1; out.nz = 0; return; }
      out.nx = tx / len; out.ny = ty / len; out.nz = tz / len;
      return;
    }
  }
}

/**
 * Evalúa el punto local contra todas las formas habilitadas y rellena `out` con la más
 * cercana (mínima distancia con signo). Devuelve false si no hay ninguna forma evaluable.
 */
export function evaluateShapes(
  shapes: readonly StructuredShape[],
  px: number,
  py: number,
  pz: number,
  out: SdfContact,
): boolean {
  let best = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (shape.enabled === false) continue;
    const d = sdfShape(shape, px, py, pz);
    if (d < best) { best = d; bestIndex = i; }
  }
  if (bestIndex < 0 || !Number.isFinite(best)) return false;
  out.distance = best;
  out.shapeIndex = bestIndex;
  shapeNormal(shapes[bestIndex], px, py, pz, out);
  return true;
}

/**
 * Radio de la esfera de activación (broad phase) que garantiza contener TODAS las formas,
 * en espacio local. El radio mundo = este valor × escala uniforme del objeto. Autocalculado:
 * sin constantes a mano que se desincronicen de la geometría (docs/COLISIONES.md §3.4).
 */
export function computeShapesBoundRadius(shapes: readonly StructuredShape[]): number {
  let bound = 0;
  for (const shape of shapes) {
    const c = shape.center;
    const centerLen = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
    let extent = 0;
    switch (shape.kind) {
      case 'sphere': extent = shape.radius; break;
      case 'box': extent = Math.sqrt(shape.half[0] ** 2 + shape.half[1] ** 2 + shape.half[2] ** 2); break;
      case 'torus': extent = shape.ringRadius + shape.tubeRadius; break;
    }
    bound = Math.max(bound, centerLen + extent);
  }
  return bound;
}
