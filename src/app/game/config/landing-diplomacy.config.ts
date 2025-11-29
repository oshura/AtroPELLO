import { PlanetInhabitants } from '../types/cosmic-life.types';
import {
  MissionClueTier,
  MissionClueToken,
  PlanetMissionType,
  PlanetResourceStock
} from '../types/planet-intel.types';
import { CargoCompositionKind } from '../types/inventory.types';

export interface DiplomacyClueOptionConfig {
  id: string;
  label: string;
  description: string;
  clueTier: MissionClueTier;
  clueSummary: string;
  method: MissionClueToken['method'];
  cost?: Partial<PlanetResourceStock>;
  sanityCost?: number;
  narrativeSuccess: string;
  narrativeFailure?: string;
}

export interface DiplomacySubTaskConfig {
  id: string;
  label: string;
  description: string;
  rewardTier: MissionClueTier;
  clueSummary: string;
  successProbability: number;
  cooldownMs?: number;
  cost?: Partial<PlanetResourceStock>;
  healthCostOnFail?: number;
  sanityCostOnFail?: number;
  logSuccess: string;
  logFailure: string;
}

export interface LandingDiplomacyScript {
  race: PlanetInhabitants | 'default';
  missionTemplate: {
    name: string;
    description: string;
    requiredClueTiers: MissionClueTier[];
    type?: PlanetMissionType;
    preferredResourceKind?: CargoCompositionKind;
  };
  bribeOption: DiplomacyClueOptionConfig;
  visionOption: DiplomacyClueOptionConfig;
  subTasks: DiplomacySubTaskConfig[];
}

const PROFUNDOS_SCRIPT: LandingDiplomacyScript = {
  race: PlanetInhabitants.PROFUNDOS,
  missionTemplate: {
    name: 'Perla Tétrica',
    description: 'Hallarla en las mareas rotas y sellar la grieta que filtra cantos abisales.',
    requiredClueTiers: ['minor', 'major', 'final'],
    type: 'artifact'
  },
  bribeOption: {
    id: 'profundos-bribe',
    label: 'Arrojar ofrendas a la fosa',
    description: 'Entregar metal y orgánicos para comprar rumor submarino.',
    clueTier: 'minor',
    clueSummary: 'Los ancianos murmuran: busca el doble amanecer sobre mareas rotas.',
    method: 'bribe',
    cost: { metal: 1, organic: 1 },
    narrativeSuccess: 'Los profundos aceptan el tributo y señalan un sol binario sumergido en niebla.',
    narrativeFailure: 'Sin tributo suficiente, los coros ignoran tu presencia.'
  },
  visionOption: {
    id: 'profundos-vision',
    label: 'Compartir visión salina',
    description: 'Ceder cordura para ver dónde naufragó el artefacto.',
    clueTier: 'final',
    clueSummary: 'Vislumbras la Perla Tétrica dormida en un océano con auroras verdes.',
    method: 'vision',
    sanityCost: 3,
    narrativeSuccess: 'La marea mental te arrastra pero sales con coordenadas cristalinas.',
    narrativeFailure: 'Sin cordura suficiente, las aguas rechazan tu sacrificio.'
  },
  subTasks: [
    {
      id: 'seal-micro-portal',
      label: 'Sellar micro-portal',
      description: 'Canaliza un pulso estabilizador para cerrar la grieta junto al anfiteatro.',
      rewardTier: 'major',
      clueSummary: 'El portal revela un planeta acuático con pilares girados hacia el sur.',
      successProbability: 0.55,
      healthCostOnFail: 5,
      logSuccess: 'El vacío se contrae y los profundos te otorgan un mapa hacia el planeta acuático.',
      logFailure: 'El portal late y te hiere; los profundos lamentan tu fracaso.'
    }
  ]
};

const DEFAULT_SCRIPT: LandingDiplomacyScript = {
  race: 'default',
  missionTemplate: {
    name: 'Encargo ancestral',
    description: 'Rastrear un artefacto prestado y devolverlo a la cofradía.',
    requiredClueTiers: ['minor', 'major'],
    type: 'material',
    preferredResourceKind: 'metallic'
  },
  bribeOption: {
    id: 'default-bribe',
    label: 'Ofrecer tributo',
    description: 'Entregar materiales básicos a cambio de un susurro.',
    clueTier: 'minor',
    clueSummary: 'Te piden mirar hacia estrellas gemelas deformadas por ozono negro.',
    method: 'bribe',
    cost: { metal: 1, organic: 1 },
    narrativeSuccess: 'Aceptan el tributo y ofrecen una pista velada.',
    narrativeFailure: 'Necesitas más recursos para convencerlos.'
  },
  visionOption: {
    id: 'default-vision',
    label: 'Ritual mental',
    description: 'Consumir cordura para forzar una visión.',
    clueTier: 'final',
    clueSummary: 'La visión susurra un código orbital tallado en cristales verdes.',
    method: 'vision',
    sanityCost: 3,
    narrativeSuccess: 'El ritual comparte memorias ajenas: sabes dónde buscar.',
    narrativeFailure: 'Tu mente no soporta otra visión sin más cordura.'
  },
  subTasks: [
    {
      id: 'calibrate-resonator',
      label: 'Calibrar resonador',
      description: 'Ajustar antenas espirituales para captar el eco del artefacto.',
      rewardTier: 'major',
      clueSummary: 'El resonador marca un clúster donde la luz titila cada 13 segundos.',
      successProbability: 0.5,
      healthCostOnFail: 5,
      logSuccess: 'El aparato responde y la cofradía entrega un mapa parcial.',
      logFailure: 'El resonador se descarga y te hiere con chispas azules.'
    }
  ]
};

const SCRIPT_MAP: Record<string, LandingDiplomacyScript> = {
  default: DEFAULT_SCRIPT,
  [PlanetInhabitants.PROFUNDOS]: PROFUNDOS_SCRIPT
};

export function getLandingDiplomacyScript(race?: PlanetInhabitants | null): LandingDiplomacyScript {
  if (!race) {
    return SCRIPT_MAP['default'];
  }
  return SCRIPT_MAP[race] ?? SCRIPT_MAP['default'];
}
