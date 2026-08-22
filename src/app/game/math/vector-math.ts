import { Vector3 } from '../../types/game.types';

/**
 * FUENTE ÚNICA de utilidades vectoriales/escalares del juego (docs/ARQUITECTURA.md Fase 5.8).
 * Funciones puras; antes estaban duplicadas en GameEngine, AtmosphereSceneManager y servicios
 * de colisión con implementaciones ligeramente distintas. Implementaciones idénticas a las
 * que tenía el motor (comportamiento preservado byte a byte).
 *
 * `randomPerpendicularVector` usa Math.random: es FX sin estado (permitido por la regla 6).
 */

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function lerpScalar(a: number, b: number, t: number): number {
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return a + (b - a) * t;
}

export function smoothStep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function vec3Length(vec?: Vector3 | null): number {
  if (!vec) {
    return 0;
  }
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

export function vec3Dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Normaliza tratando longitud 0 como 1 (evita NaN). */
export function vec3Normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * ¿La esfera que viaja de `from` a `to` con radio `movingRadius` toca la esfera
 * (`center`, `targetRadius`)? Barrido continuo: un proyectil rápido recorre decenas de unidades
 * por frame, así que comprobar sólo la posición final lo haría atravesar objetivos pequeños.
 *
 * Reduce a "punto contra esfera engordada": distancia mínima del segmento al centro.
 */
export function sweptSphereHit(
  from: Vector3,
  to: Vector3,
  center: Vector3,
  targetRadius: number,
  movingRadius: number = 0
): boolean {
  const radius = Math.max(0, targetRadius + movingRadius);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const fx = from.x - center.x;
  const fy = from.y - center.y;
  const fz = from.z - center.z;
  const segLenSq = dx * dx + dy * dy + dz * dz;
  if (segLenSq <= 1e-12) {
    return fx * fx + fy * fy + fz * fz <= radius * radius;
  }
  // t del punto del segmento más cercano al centro, recortado al tramo recorrido este frame.
  const t = clamp(-(fx * dx + fy * dy + fz * dz) / segLenSq, 0, 1);
  const cx = fx + dx * t;
  const cy = fy + dy * t;
  const cz = fz + dz * t;
  return cx * cx + cy * cy + cz * cz <= radius * radius;
}

/**
 * Distancia desde `origin` al primer corte del rayo (`direction`, unitaria) con la esfera
 * (`center`, `radius`), o null si no la corta por delante. Para haces continuos.
 */
export function raySphereHit(
  origin: Vector3,
  direction: Vector3,
  center: Vector3,
  radius: number
): number | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  if (c > 0 && b > 0) {
    return null; // origen fuera y esfera a la espalda
  }
  const discriminant = b * b - c;
  if (discriminant < 0) {
    return null;
  }
  const distance = -b - Math.sqrt(discriminant);
  return distance < 0 ? 0 : distance; // 0 ⇒ el origen ya está dentro
}

/** Vector unitario aleatorio en el plano perpendicular a `normal`. */
export function randomPerpendicularVector(normal: Vector3): Vector3 {
  const safeNormal = vec3Normalize(normal);
  let reference: Vector3 = Math.abs(safeNormal.x) < 0.5 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let perpendicular = vec3Cross(safeNormal, reference);
  if (vec3Length(perpendicular) < 1e-3) {
    reference = { x: 0, y: 0, z: 1 };
    perpendicular = vec3Cross(safeNormal, reference);
  }
  perpendicular = vec3Normalize(perpendicular);
  const tangent = vec3Normalize(vec3Cross(safeNormal, perpendicular));
  const angle = Math.random() * Math.PI * 2;
  return vec3Normalize({
    x: perpendicular.x * Math.cos(angle) + tangent.x * Math.sin(angle),
    y: perpendicular.y * Math.cos(angle) + tangent.y * Math.sin(angle),
    z: perpendicular.z * Math.cos(angle) + tangent.z * Math.sin(angle),
  });
}
