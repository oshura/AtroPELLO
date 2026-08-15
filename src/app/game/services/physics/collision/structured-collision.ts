import { mat4 } from 'gl-matrix';
import type { Spaceship } from '../../../game-objects';
import { SdfContact, StructuredColliderDef } from './collision-shape.types';
import { computeShapesBoundRadius, evaluateShapes } from './collider-sdf';

/**
 * DETECCIÓN de colliders estructurados (Fase 11 R4, docs/COLISIONES.md §3.3-3.4): registro + broad gate
 * (esfera de activación autocalculada, con histéresis) + narrow phase por SDF en espacio LOCAL del objeto.
 * NO muta la nave: reporta contactos vía callback y el ShipCollisionSystem aplica la respuesta.
 */

/** Contacto en MUNDO listo para la respuesta (normal de SUPERFICIE, no centro→centro). */
export interface StructuredHit {
  def: StructuredColliderDef;
  /** Contacto en espacio local (índice de forma + normal local), por si onContact lo necesita. */
  contact: SdfContact;
  /** Normal de superficie en mundo (unitaria, saliente). */
  nx: number;
  ny: number;
  nz: number;
  /** Penetración en unidades de mundo. */
  depthWorld: number;
  /** Velocidad de aproximación contra la superficie (u/s, ≥0) ANTES de corregir. */
  approachSpeed: number;
}

interface RegisteredCollider {
  def: StructuredColliderDef;
  /** Radio de activación en espacio local (autocalculado de las formas). */
  boundLocal: number;
  /** Estado del gate (histéresis: entra en R, sale en R×HYSTERESIS) para logging/estado estables. */
  inside: boolean;
}

const GATE_EXIT_HYSTERESIS = 1.15;

// Scratch reutilizables (HOT: sin alocaciones por frame).
const SCRATCH_INV = mat4.create();
const SCRATCH_CONTACT: SdfContact = { distance: 0, nx: 0, ny: 0, nz: 0, shapeIndex: -1 };

export class StructuredColliderSet {
  private readonly items = new Map<string, RegisteredCollider>();

  register(def: StructuredColliderDef): void {
    this.items.set(def.id, { def, boundLocal: computeShapesBoundRadius(def.shapesLocal), inside: false });
  }

  unregister(id: string): void {
    this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }

  get size(): number {
    return this.items.size;
  }

  /**
   * Evalúa la nave contra todos los colliders registrados. `onHit` se invoca por cada contacto (la
   * respuesta la aplica el llamador); `onGateChange` en los flancos de entrada/salida del broad gate.
   */
  check(
    ship: Spaceship,
    onHit: (hit: StructuredHit) => void,
    onGateChange?: (id: string, inside: boolean) => void,
  ): void {
    if (this.items.size === 0) return;
    const shipR = ship.boundingSphere?.radius ?? 0;
    for (const reg of this.items.values()) {
      const src = reg.def.source;
      const scale = (Math.abs(src.scale.x) + Math.abs(src.scale.y) + Math.abs(src.scale.z)) / 3 || 1;

      // BROAD: distancia al cuadrado contra la esfera de activación (sin sqrt).
      const activation = reg.boundLocal * scale + shipR;
      const dx = ship.position.x - src.position.x;
      const dy = ship.position.y - src.position.y;
      const dz = ship.position.z - src.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const exit = activation * GATE_EXIT_HYSTERESIS;
      const nowInside = reg.inside ? distSq <= exit * exit : distSq <= activation * activation;
      if (nowInside !== reg.inside) {
        reg.inside = nowInside;
        onGateChange?.(reg.def.id, nowInside);
      }
      if (!nowInside) continue;

      // NARROW: posición de la nave al espacio LOCAL del objeto (una inversa de matriz por objeto activo).
      if (!mat4.invert(SCRATCH_INV, src.modelMatrix)) continue;
      const m = SCRATCH_INV;
      const px = ship.position.x, py = ship.position.y, pz = ship.position.z;
      const lx = m[0] * px + m[4] * py + m[8] * pz + m[12];
      const ly = m[1] * px + m[5] * py + m[9] * pz + m[13];
      const lz = m[2] * px + m[6] * py + m[10] * pz + m[14];
      const shipRLocal = shipR / scale;
      if (!evaluateShapes(reg.def.shapesLocal, lx, ly, lz, SCRATCH_CONTACT)) continue;
      if (SCRATCH_CONTACT.distance >= shipRLocal) continue;

      // Normal local → mundo (rotación del modelMatrix; normalizar corrige la escala uniforme).
      const w = src.modelMatrix;
      let wx = w[0] * SCRATCH_CONTACT.nx + w[4] * SCRATCH_CONTACT.ny + w[8] * SCRATCH_CONTACT.nz;
      let wy = w[1] * SCRATCH_CONTACT.nx + w[5] * SCRATCH_CONTACT.ny + w[9] * SCRATCH_CONTACT.nz;
      let wz = w[2] * SCRATCH_CONTACT.nx + w[6] * SCRATCH_CONTACT.ny + w[10] * SCRATCH_CONTACT.nz;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl; wy /= wl; wz /= wl;

      const v = ship.velocity;
      const vDotN = v.x * wx + v.y * wy + v.z * wz;
      onHit({
        def: reg.def,
        contact: SCRATCH_CONTACT,
        nx: wx,
        ny: wy,
        nz: wz,
        depthWorld: (shipRLocal - SCRATCH_CONTACT.distance) * scale,
        approachSpeed: Math.max(0, -vDotN),
      });
    }
  }
}
