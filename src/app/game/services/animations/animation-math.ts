import { clamp, lerpScalar, smoothStep01, vec3Normalize } from '../../math/vector-math';

/**
 * Vocabulario matemático del subsistema de animaciones, respaldado por la fuente ÚNICA `game/math`
 * (docs/ARQUITECTURA.md Fase 5.8 + Fase 8). Cada animación reimplementaba clamp01/lerp/smoothstep/normalize
 * localmente; ahora todas comparten estas funciones. Comportamiento idéntico al previo (mismas fórmulas).
 */
export { clamp, vec3Normalize };

/** Interpolación lineal a→b (igual que la local de las animaciones para t en [0,1]). */
export const lerp = lerpScalar;

/** Suavizado cúbico 3t²−2t³ con t acotado a [0,1]. */
export const smoothstep = smoothStep01;

/** Acota un valor a [0,1]. */
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}
