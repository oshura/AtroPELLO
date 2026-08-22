/**
 * Probabilidades de las acciones de aterrizaje.
 *
 * FUENTE ÚNICA: la UI enseña estos números al jugador y el servicio los tira. Estaban repetidos
 * como `0.5` literales por todo `landing-action.service.ts`, así que la interfaz no podía
 * mostrarlos sin arriesgarse a mentir.
 */

/** Exploración (void mass, rastreo de criatura, contacto): riesgo 50/50 clásico. */
export const EXPLORE_SUCCESS_CHANCE = 0.5;

/**
 * Descansar con un ser menor rondando. Antes la interrupción era segura; ahora es una apuesta:
 * puedes robarle una noche a la criatura, pero pocas veces.
 */
export const REST_UNDISTURBED_CHANCE = 0.35;

/** Descansar en un mundo tranquilo nunca falla. */
export const REST_SAFE_CHANCE = 1;

/** Probabilidad de que un descanso salga bien, según haya o no criatura en el planeta. */
export function restSuccessChance(hasLesserBeing: boolean): number {
  return hasLesserBeing ? REST_UNDISTURBED_CHANCE : REST_SAFE_CHANCE;
}

/** "50 %" para pintar junto a una acción. Devuelve null si el resultado es seguro. */
export function formatChance(chance: number): string | null {
  if (!Number.isFinite(chance) || chance >= 1) {
    return null;
  }
  return `${Math.round(Math.max(0, chance) * 100)}%`;
}
