import { mat4, vec4 } from 'gl-matrix';
import { Vector3 } from '../../types/game.types';

/**
 * Rayo del cursor hacia el mundo. Lo usan las armas dirigidas con el ratón (minas-dron).
 *
 * Función pura con buffers de módulo: se llama en el bucle caliente mientras haya proyectiles
 * guiados vivos, así que no debe generar basura.
 */

const invViewProjection = mat4.create();
const viewProjection = mat4.create();
const nearPoint = vec4.create();
const farPoint = vec4.create();

export interface ScreenRay {
  origin: Vector3;
  direction: Vector3;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Convierte un punto de pantalla (coordenadas de cliente) en un rayo de mundo.
 * Devuelve null si el viewport es degenerado o la matriz no es invertible.
 */
export function screenPointToWorldRay(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
  view: Float32Array | mat4,
  projection: Float32Array | mat4,
  out?: ScreenRay
): ScreenRay | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;

  mat4.multiply(viewProjection, projection as mat4, view as mat4);
  if (!mat4.invert(invViewProjection, viewProjection)) {
    return null;
  }

  vec4.set(nearPoint, ndcX, ndcY, -1, 1);
  vec4.transformMat4(nearPoint, nearPoint, invViewProjection);
  vec4.set(farPoint, ndcX, ndcY, 1, 1);
  vec4.transformMat4(farPoint, farPoint, invViewProjection);
  if (nearPoint[3] === 0 || farPoint[3] === 0) {
    return null;
  }

  const ox = nearPoint[0] / nearPoint[3];
  const oy = nearPoint[1] / nearPoint[3];
  const oz = nearPoint[2] / nearPoint[3];
  const dx = farPoint[0] / farPoint[3] - ox;
  const dy = farPoint[1] / farPoint[3] - oy;
  const dz = farPoint[2] / farPoint[3] - oz;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-6) {
    return null;
  }

  const ray = out ?? { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 0 } };
  ray.origin.x = ox;
  ray.origin.y = oy;
  ray.origin.z = oz;
  ray.direction.x = dx / length;
  ray.direction.y = dy / length;
  ray.direction.z = dz / length;
  return ray;
}
