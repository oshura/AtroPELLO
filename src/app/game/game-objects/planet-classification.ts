/**
 * Fuente única de verdad para los planetas con comportamiento ESPECIAL hardcodeado por id
 * (Tierra partida y Saturno anillado). Antes estos checks vivían repetidos por GameEngine
 * (creación/render/gating). Centralizarlos aquí es el primer paso hacia un modelo data-driven.
 * docs/ARQUITECTURA.md Fase 6.4.
 */
export const EARTH_PLANET_ID = 'planet-earth';
export const RINGED_PLANET_ID = 'planet-saturn';

/** Un planeta es "Tierra" por id canónico o por tipo 'Tierra' (Tierra partida). */
export function isEarthPlanet(id: string | null | undefined, planetType?: unknown): boolean {
  return id === EARTH_PLANET_ID || planetType === 'Tierra';
}

/** Un planeta es "anillado" (Saturno) por id canónico o por kind 'ringed'. */
export function isRingedPlanet(id: string | null | undefined, kind?: string | null): boolean {
  return id === RINGED_PLANET_ID || kind === 'ringed';
}
