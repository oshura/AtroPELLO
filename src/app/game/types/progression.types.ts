import { CharacterProfileService } from '../../services/game/character-profile.service';

/** Cómo se origina una muerte por aterrizaje (cuerpo o mente). */
export type LandingDeathSource = 'landing-health' | 'landing-sanity';

/** Cualquier origen de muerte hardcore (envejecimiento o aterrizaje). */
export type HardcoreDeathSource = 'aging' | LandingDeathSource;

/** Origen de una progresión de edad. */
export type AgeProgressionSource = 'loop' | 'landing' | 'debug-overlay';

/** Resultado de avanzar la edad, incluyendo si disparó muerte y cuántas tiradas hubo. */
export type AgeProgressionOutcome = ReturnType<CharacterProfileService['addDaysToAge']> & {
  source: AgeProgressionSource;
  deathTriggered: boolean;
  rollsExecuted: number;
};

/** Contexto de una muerte hardcore para logging/mensajería. */
export interface HardcoreDeathContext {
  source: HardcoreDeathSource;
  roll?: number;
  survivability?: number;
  ageYears?: number;
  metadata?: Record<string, unknown>;
  message?: string;
}
