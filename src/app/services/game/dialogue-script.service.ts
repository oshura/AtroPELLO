import { Injectable } from '@angular/core';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { RaceMissionScript } from '../../game/types/dialogue.types';

import grises from '../../assets/narrative/landing/landing_missions_grises.json';

/**
 * Guiones de conversación por raza (Fase 13 — docs/RAZAS.md).
 *
 * Aquí SOLO entran razas terminadas. Los guiones antiguos de las otras doce siguen en
 * `assets/narrative/landing/` como material de partida, pero no se cargan: se escribirán de nuevo
 * raza a raza, con su misión y su trozo de historia, en lugar de dar por bueno un texto genérico.
 *
 * Añadir una raza = su JSON aquí + su ficha en `RACE_CATALOG`. Con eso entra también en el sorteo
 * de habitantes (`getPoolableRaces`).
 */
const SCRIPTS: Partial<Record<PlanetInhabitants, unknown>> = {
  [PlanetInhabitants.GRISES]: grises,
};

@Injectable({ providedIn: 'root' })
export class DialogueScriptService {
  /** Guion de una raza, o null si aún no tiene conversación escrita. */
  getMissionScript(race: PlanetInhabitants | null | undefined): RaceMissionScript | null {
    if (!race || race === PlanetInhabitants.NONE) {
      return null;
    }
    const script = SCRIPTS[race] as RaceMissionScript | undefined;
    return script && script.offer && script.turnIn ? script : null;
  }

  /** Identificador del guion, tal y como se guarda en la misión (`dialogueScriptId`). */
  getScriptId(race: PlanetInhabitants): string {
    return `landing_missions_${String(race).toLowerCase()}`;
  }

  /** ¿Esta raza tiene conversación propia? */
  hasScript(race: PlanetInhabitants | null | undefined): boolean {
    return this.getMissionScript(race) !== null;
  }
}
