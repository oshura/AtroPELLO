/**
 * Aleatoriedad reproducible (ARQUITECTURA §4.2.6: "lo procedural usa semillas persistidas").
 *
 * Extraído del generador de sistemas para que cualquiera pueda decidir algo "al azar" de forma
 * estable: la misma semilla da siempre el mismo resultado, en esta partida y en la siguiente.
 */

export type RandomSeed = number | string;

/** Hash estable de una semilla (números o cadenas) a entero de 32 bits. */
export function hashSeed(seed: RandomSeed): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.floor(seed) >>> 0;
  }
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Generador mulberry32: rápido, determinista y suficiente para contenido procedural. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elemento estable de un array a partir de una semilla. Devuelve null si el array está vacío. */
export function pickSeeded<T>(pool: ReadonlyArray<T>, seed: RandomSeed): T {
  const rnd = mulberry32(hashSeed(seed));
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}
