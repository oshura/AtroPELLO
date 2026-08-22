import { GameObjectAnimosity } from './animosity.types';
import { CargoCompositionKind } from './inventory.types';
import { ElderGod, PlanetInhabitants } from './cosmic-life.types';
import { SpellType } from './spell.types';
import { WeaponId } from './weapon.types';

/**
 * Razas del universo (Fase 13 — docs/RAZAS.md).
 *
 * Una raza es DATOS: quién es, a qué primigenio teme, con qué te recibe, qué guion de diálogo usa
 * y qué te puede vender o enseñar. Ninguna regla de negocio vive aquí.
 */

/** Qué cambia una compra en la nave del jugador. */
export type RaceShopEffect = 'weapon' | 'weapon_slot' | 'engine_tier';

export interface RaceShopOffer {
  id: string;
  label: string;
  description: string;
  effect: RaceShopEffect;
  /** Arma entregada cuando `effect` es 'weapon'. */
  weaponId?: WeaponId;
  /**
   * Coste en materia prima de la BODEGA. Las claves son composiciones de carga
   * (`metallic`, `silicate`…), no los recursos del suelo de un planeta: es lo que el jugador
   * lleva encima al aterrizar.
   */
  cost: Partial<Record<CargoCompositionKind, number>>;
}

export interface RaceDefinition {
  id: PlanetInhabitants;
  label: string;
  /** Una línea: lo que el piloto sabe de ellos antes de hablar. */
  description: string;
  /** Primigenio que amenaza a esta raza (todas lo están, de uno u otro). */
  threatenedBy?: ElderGod;
  /** Con qué actitud reciben al jugador la primera vez. */
  defaultAttitude: GameObjectAnimosity;
  /** Guion de conversación: `landing_missions_<race>.json`. */
  dialogueScriptId: string;
  /** Glifo que enseñan al estrechar lazos ("Profundizar en sabiduría"). */
  teachableGlyph?: SpellType;
  /** Ofertas permanentes una vez ganada su confianza. */
  shop?: RaceShopOffer[];
  /**
   * Cuándo abre la tienda: 'ally' (default) exige su confianza; 'neutral' vende también a
   * desconocidos (los arácnidos comercian con cualquiera que no les haya disparado).
   */
  shopAvailability?: 'ally' | 'neutral';
  /**
   * Raza con ficha que NUNCA entra en el sorteo de habitantes: sólo existe donde la trama la
   * coloca (arácnidos en su sistema de guerra, Yig en su sistema natal).
   */
  excludeFromPool?: boolean;
  /**
   * Raza acólita: sirve a un primigenio y es hostil por definición. No habita planetas; aparece
   * por eventos y misiones. Hueco tipado para la fase de acólitos.
   */
  isAcolyte?: boolean;
  acolyteOf?: ElderGod;
}

/** Reputación acumulada con una raza. */
export interface RaceStanding {
  standing: 'hostile' | 'neutral' | 'ally';
  missionsCompleted: number;
}

export function createDefaultStanding(): RaceStanding {
  return { standing: 'neutral', missionsCompleted: 0 };
}
