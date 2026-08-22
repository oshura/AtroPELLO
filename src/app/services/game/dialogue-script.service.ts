import { Injectable } from '@angular/core';
import { PlanetInhabitants } from '../../game/types/cosmic-life.types';
import { RaceMissionScript } from '../../game/types/dialogue.types';

import grises from '../../assets/narrative/landing/landing_missions_grises.json';
import miGo from '../../assets/narrative/landing/landing_missions_mi_go.json';
import yig from '../../assets/narrative/landing/landing_missions_yig.json';
import leng from '../../assets/narrative/landing/landing_missions_leng.json';
import organismoVegetal from '../../assets/narrative/landing/landing_missions_organismo_vegetal.json';
import angelesDescarnados from '../../assets/narrative/landing/landing_missions_angeles_descarnados.json';
import profundos from '../../assets/narrative/landing/landing_missions_profundos.json';
import antiguos from '../../assets/narrative/landing/landing_missions_antiguos.json';
import dohle from '../../assets/narrative/landing/landing_missions_dohle.json';
import chthonian from '../../assets/narrative/landing/landing_missions_chthonian.json';
import gules from '../../assets/narrative/landing/landing_missions_gules.json';
import ghasts from '../../assets/narrative/landing/landing_missions_ghasts.json';
import vampiroEstelar from '../../assets/narrative/landing/landing_missions_vampiro_estelar.json';
import byhkee from '../../assets/narrative/landing/landing_missions_byhkee.json';

/**
 * Guiones de conversación por raza (Fase 13 — docs/RAZAS.md).
 *
 * Los ficheros existían desde hace tiempo y NADIE los importaba: la conversación estaba escrita
 * pero el juego nunca la enseñaba. Este servicio es el puente que faltaba.
 */
const SCRIPTS: Partial<Record<PlanetInhabitants, unknown>> = {
  [PlanetInhabitants.GRISES]: grises,
  [PlanetInhabitants.MI_GO]: miGo,
  [PlanetInhabitants.YIG]: yig,
  [PlanetInhabitants.LENG]: leng,
  [PlanetInhabitants.ORGANISMO_VEGETAL]: organismoVegetal,
  [PlanetInhabitants.ANGELES_DESCARNADOS]: angelesDescarnados,
  [PlanetInhabitants.PROFUNDOS]: profundos,
  [PlanetInhabitants.ANTIGUOS]: antiguos,
  [PlanetInhabitants.DOHLE]: dohle,
  [PlanetInhabitants.CHTHONIAN]: chthonian,
  [PlanetInhabitants.GULES]: gules,
  [PlanetInhabitants.GHASTS]: ghasts,
  [PlanetInhabitants.VAMPIRO_ESTELAR]: vampiroEstelar,
  [PlanetInhabitants.BYHKEE]: byhkee,
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
