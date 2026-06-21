import { CompassCountdownPayload } from '../../types/hud.types';

export interface CompassCountdownInputs {
  voidCocoonActiveUntilMs: number | null;
  speedRiteUntilMs: number | null;
  speedRiteActive: boolean;
}

/**
 * Elige el countdown de mayor prioridad para la brújula del HUD entre los efectos temporales activos
 * (Void Cocoon, Speed Rite). PURO: recibe `now` + los timestamps; devuelve el payload o null. Antes en
 * GameEngine. docs/ARQUITECTURA.md Fase 5.7.
 */
export function buildCompassCountdownPayload(
  now: number,
  inputs: CompassCountdownInputs,
): CompassCountdownPayload | null {
  type PrioritizedCountdown = { priority: number; payload: CompassCountdownPayload };
  const candidates: PrioritizedCountdown[] = [];

  if (inputs.voidCocoonActiveUntilMs && now < inputs.voidCocoonActiveUntilMs) {
    const seconds = (inputs.voidCocoonActiveUntilMs - now) / 1000;
    if (seconds > 0) {
      candidates.push({ priority: 1, payload: { seconds, label: 'COCOON', accentColor: '#6ef6ff' } });
    }
  }

  if (inputs.speedRiteUntilMs && inputs.speedRiteActive) {
    const seconds = (inputs.speedRiteUntilMs - now) / 1000;
    if (seconds > 0) {
      candidates.push({ priority: 3, payload: { seconds, label: 'SPEED RITE', accentColor: '#ff3055' } });
    }
  }

  if (!candidates.length) {
    return null;
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0].payload;
}
