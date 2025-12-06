import { Vector3 } from '../../types/game.types';
export enum PlanetInhabitants {
  NONE = 'NONE',
  MI_GO = 'MI_GO',
  YIG = 'YIG',
  LENG = 'LENG',
  ORGANISMO_VEGETAL = 'ORGANISMO_VEGETAL',
  ANGELES_DESCARNADOS = 'ANGELES_DESCARNADOS',
  PROFUNDOS = 'PROFUNDOS',
  ANTIGUOS = 'ANTIGUOS',
  DOHLE = 'DOHLE',
  CHTHONIAN = 'CHTHONIAN',
  GULES = 'GULES',
  GHASTS = 'GHASTS',
  VAMPIRO_ESTELAR = 'VAMPIRO_ESTELAR',
  BYHKEE = 'BYHKEE'
}

export enum ElderGod {
  CTHULHU = 'CTHULHU',
  AZATHOTH = 'AZATHOTH',
  YOG_SOTHOTH = 'YOG_SOTHOTH',
  CTHUGHA = 'CTHUGHA'
}

export enum LesserBeing {
  NONE = 'NONE',
  SEMILLAS_ESTELARES = 'SEMILLAS_ESTELARES',
  SHOGGOTH = 'SHOGGOTH',
  VAMPIRO_FUEGO = 'VAMPIRO_FUEGO'
}

export const ELDER_GOD_SUMMONS: Record<ElderGod, ReadonlyArray<LesserBeing>> = {
  [ElderGod.CTHULHU]: [LesserBeing.SEMILLAS_ESTELARES, LesserBeing.SHOGGOTH],
  [ElderGod.AZATHOTH]: [LesserBeing.SHOGGOTH, LesserBeing.VAMPIRO_FUEGO],
  [ElderGod.YOG_SOTHOTH]: [LesserBeing.SHOGGOTH, LesserBeing.VAMPIRO_FUEGO],
  [ElderGod.CTHUGHA]: [LesserBeing.VAMPIRO_FUEGO, LesserBeing.SEMILLAS_ESTELARES]
};

export const PLANET_INHABITANT_POOL: ReadonlyArray<PlanetInhabitants> = Object.values(PlanetInhabitants).filter(
  value => value !== PlanetInhabitants.NONE
);

export const PLANET_INHABITANT_LABELS: Record<PlanetInhabitants, string> = {
  [PlanetInhabitants.NONE]: 'Sin civilización detectable',
  [PlanetInhabitants.MI_GO]: 'Mi-Go',
  [PlanetInhabitants.YIG]: 'Serpientes de Yig',
  [PlanetInhabitants.LENG]: 'Nómadas de Leng',
  [PlanetInhabitants.ORGANISMO_VEGETAL]: 'Organismo vegetal consciente',
  [PlanetInhabitants.ANGELES_DESCARNADOS]: 'Ángeles descarnados',
  [PlanetInhabitants.PROFUNDOS]: 'Profundos',
  [PlanetInhabitants.ANTIGUOS]: 'Antiguos',
  [PlanetInhabitants.DOHLE]: 'Dohle',
  [PlanetInhabitants.CHTHONIAN]: 'Chthonian',
  [PlanetInhabitants.GULES]: 'Gules',
  [PlanetInhabitants.GHASTS]: 'Ghasts',
  [PlanetInhabitants.VAMPIRO_ESTELAR]: 'Vampiro estelar',
  [PlanetInhabitants.BYHKEE]: 'Byh-Kee'
};

export const LESSER_BEING_LABELS: Record<LesserBeing, string> = {
  [LesserBeing.NONE]: 'Sin criatura',
  [LesserBeing.SEMILLAS_ESTELARES]: 'Semillas estelares',
  [LesserBeing.SHOGGOTH]: 'Shoggoth',
  [LesserBeing.VAMPIRO_FUEGO]: 'Vampiro de fuego'
};

export const LESSER_BEING_PATRONS: Record<LesserBeing, ElderGod> = {
  [LesserBeing.NONE]: ElderGod.CTHULHU,
  [LesserBeing.SEMILLAS_ESTELARES]: ElderGod.CTHULHU,
  [LesserBeing.SHOGGOTH]: ElderGod.AZATHOTH,
  [LesserBeing.VAMPIRO_FUEGO]: ElderGod.CTHUGHA
};

export interface LesserBeingEncounterPlan {
  elderGod: ElderGod;
  species: LesserBeing;
}

export interface LesserBeingInstanceSnapshot {
  id: string;
  type: LesserBeing;
  position: Vector3;
  velocity?: Vector3;
  forward?: Vector3;
  hasLanded: boolean;
  landedPlanetId?: string | null;
  health?: { current: number; max: number };
  metadata?: Record<string, any>;
}
