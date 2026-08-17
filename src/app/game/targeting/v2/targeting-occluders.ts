import { mat4 } from 'gl-matrix';
import type { StructuredShape } from '../../services/physics/collision/collision-shape.types';
import { computeShapesBoundRadius, sdfShape } from '../../services/physics/collision/collider-sdf';

/** Vector mínimo que usa el trazado (sin acoplarse a los tipos del motor). */
export interface OccluderVec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * OCLUSOR de targeting (EXPERIMENTAL, docs/ESTACIONES.md §1.2.2): la silueta REAL de un cuerpo grande
 * frente al rayo del puntero. Doble papel en `AdaptiveTargetingSystem.detectHoverWithRay`:
 *  - donde el rayo golpea la geometría, el propio cuerpo es candidato a hover/selección
 *    ("mouse sobre su dibujo"), sin depender de su esfera de puntería;
 *  - nada MÁS ALLÁ del punto de impacto es seleccionable. Por los huecos (boquetes del Incidente,
 *    el hueco del toroide) el rayo pasa limpio: lo que se VE a través sigue siendo seleccionable.
 */
export interface TargetOccluder {
  /** id del ITargetable cuya silueta representa (p. ej. la estación). */
  readonly targetId: string;
  /** Distancia MUNDO al primer impacto del rayo contra la geometría, o null si no la toca. */
  rayHit(origin: OccluderVec3, dir: OccluderVec3): number | null;
}

/** Fuente VIVA del transform: el modelMatrix cambia cada frame (giro de la estación). */
export interface OccluderSource {
  readonly modelMatrix: Float32Array | number[];
}

const MAX_STEPS = 96;          // tope de pasos del sphere tracing
const HIT_EPS = 0.002;         // impacto, en espacio unidad (~1.6u de mundo con escala 800)
const MIN_STEP = 0.004;        // avance mínimo (no arrastrarse rozando una superficie)
const MAX_STEP_FRACTION = 0.5; // paso máximo relativo al bound (por los Infinity del toro en boquetes)

// Scratch de módulo (HOT: una llamada por frame y oclusor; un solo hilo, sin reentradas).
const SCRATCH_INV = mat4.create();

/**
 * Oclusor por SDF ESTRUCTURADO: sphere tracing contra las MISMAS formas locales del collider de
 * colisión (Fase 11, `collider-sdf.ts`), transformando el rayo al espacio local del objeto. Las SDF
 * son cotas inferiores de la distancia real (el max de las tapas-sección acota por debajo), así que
 * el trazado nunca se salta material: converge o sale del bound. Sin alocaciones por llamada.
 */
export class StructuredRayOccluder implements TargetOccluder {
  private readonly boundLocal: number;

  constructor(
    public readonly targetId: string,
    private readonly source: OccluderSource,
    private readonly shapes: readonly StructuredShape[],
  ) {
    this.boundLocal = computeShapesBoundRadius(shapes);
  }

  rayHit(origin: OccluderVec3, dir: OccluderVec3): number | null {
    if (!mat4.invert(SCRATCH_INV, this.source.modelMatrix as unknown as mat4)) {
      return null;
    }
    const inv = SCRATCH_INV;
    const ox = inv[0] * origin.x + inv[4] * origin.y + inv[8] * origin.z + inv[12];
    const oy = inv[1] * origin.x + inv[5] * origin.y + inv[9] * origin.z + inv[13];
    const oz = inv[2] * origin.x + inv[6] * origin.y + inv[10] * origin.z + inv[14];
    let dx = inv[0] * dir.x + inv[4] * dir.y + inv[8] * dir.z;
    let dy = inv[1] * dir.x + inv[5] * dir.y + inv[9] * dir.z;
    let dz = inv[2] * dir.x + inv[6] * dir.y + inv[10] * dir.z;
    const dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-12) {
      return null;
    }
    // Con escala uniforme s en el modelMatrix, |dir en local| = 1/s → distancia mundo = local × s.
    const worldPerLocal = 1 / dl;
    dx /= dl;
    dy /= dl;
    dz /= dl;

    // Recorte contra el bound (esfera de activación local, centrada en el origen del objeto).
    const b = ox * dx + oy * dy + oz * dz;
    const c = ox * ox + oy * oy + oz * oz - this.boundLocal * this.boundLocal;
    const disc = b * b - c;
    if (disc < 0) {
      return null;
    }
    const sq = Math.sqrt(disc);
    const tExit = -b + sq;
    if (tExit <= 0) {
      return null; // el bound queda entero detrás del origen del rayo
    }
    let t = Math.max(0, -b - sq);
    const maxStep = this.boundLocal * MAX_STEP_FRACTION;
    for (let i = 0; i < MAX_STEPS && t <= tExit; i++) {
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;
      let d = Infinity;
      for (const shape of this.shapes) {
        if (shape.enabled === false) {
          continue;
        }
        const sd = sdfShape(shape, px, py, pz);
        if (sd < d) {
          d = sd;
        }
      }
      if (d < HIT_EPS) {
        return t * worldPerLocal;
      }
      t += Number.isFinite(d) ? Math.min(Math.max(d, MIN_STEP), maxStep) : maxStep;
    }
    return null;
  }
}
