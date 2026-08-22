import { GameObjectAnimosity } from '../types/animosity.types';
import { ElderGod, PlanetInhabitants } from '../types/cosmic-life.types';
import { RaceDefinition } from '../types/race.types';
import { SpellType } from '../types/spell.types';

/**
 * Catálogo de razas (Fase 13 — docs/RAZAS.md).
 *
 * FUENTE ÚNICA DE VERDAD de quién habita el universo. Se puebla raza a raza según avanza la
 * historia; una raza sin entrada aquí sigue funcionando con el guion genérico de aterrizaje.
 *
 * Receta para añadir una: entrada en `PlanetInhabitants` + etiqueta + este registro +
 * `landing_missions_<race>.json` con su conversación.
 */
export const RACE_CATALOG: Partial<Record<PlanetInhabitants, RaceDefinition>> = {
  /**
   * Los Grises — primera raza de la trama. Intentaron detener el Gate Rite del culto y pagaron el
   * precio: la batalla contra los acólitos de Yog-Sothoth partió la Tierra. Son quienes arman al
   * piloto por primera vez.
   */
  [PlanetInhabitants.GRISES]: {
    id: PlanetInhabitants.GRISES,
    label: 'Los Grises',
    description:
      'Humanoides de cabeza ancha y ojos negros. Vigilaban la Tierra desde antes del Incidente y ' +
      'llevan generaciones conteniendo a los siervos de Yog-Sothoth.',
    threatenedBy: ElderGod.YOG_SOTHOTH,
    defaultAttitude: GameObjectAnimosity.NEUTRAL,
    dialogueScriptId: 'landing_missions_grises',
    teachableGlyph: SpellType.SPEED,
    shop: [
      {
        id: 'greys-engine-tier-2',
        label: 'Ampliar el motor',
        description: 'Otro anillo de toberas y más empuje sostenido.',
        effect: 'engine_tier',
        cost: { metallic: 12, silicate: 3 },
      },
      {
        id: 'greys-extra-hardpoint',
        label: 'Anclaje de arma adicional',
        description: 'Refuerzan el ala para colgar una segunda arma.',
        effect: 'weapon_slot',
        cost: { metallic: 8, carbonaceous: 6 },
      },
      {
        id: 'greys-vulcan',
        label: 'Ametralladora Vulcan',
        description: 'Cadencia alta y poco alcance: para lo que se acerque demasiado.',
        effect: 'weapon',
        weaponId: 'VULCAN',
        cost: { metallic: 6, carbonaceous: 4 },
      },
    ],
  },
};

export function getRaceDefinition(race: PlanetInhabitants | null | undefined): RaceDefinition | null {
  return race ? RACE_CATALOG[race] ?? null : null;
}

/** Razas con ficha completa (las que tienen conversación y ofertas propias). */
export function getDefinedRaces(): RaceDefinition[] {
  return Object.values(RACE_CATALOG).filter((entry): entry is RaceDefinition => !!entry);
}

/**
 * Razas que pueden habitar un planeta al azar.
 *
 * FUENTE DEL SORTEO. Se deriva del catálogo, no del enum: una raza sólo aparece en el universo
 * cuando está terminada —guion, misión y ficha—, así el jugador nunca aterriza en un mundo cuya
 * civilización no tiene nada que contarle. Al cerrar una raza nueva entra aquí sola.
 *
 * Las acólitas quedan fuera: sirven a un primigenio y aparecen por eventos, no viven en planetas.
 */
export function getPoolableRaces(): PlanetInhabitants[] {
  return getDefinedRaces()
    .filter(race => !race.isAcolyte)
    .map(race => race.id);
}
