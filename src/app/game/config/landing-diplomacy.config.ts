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
    memorySharePct?: number;
    objectiveSummary?: string;
    targetHint?: string;
  };
  bribeOption: DiplomacyClueOptionConfig;
  visionOption: DiplomacyClueOptionConfig;
  subTasks: DiplomacySubTaskConfig[];
}

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

const BASE_BRIBE_COST: Partial<PlanetResourceStock> = { metal: 1, organic: 1 };

const SCRIPTS: LandingDiplomacyScript[] = [
  DEFAULT_SCRIPT,
  {
    race: PlanetInhabitants.MI_GO,
    missionTemplate: {
      name: 'Nodo Espectral',
      description: 'Los Mi-Go exigen recuperar el nodo espectral que el culto hurtó de su glaciar de portales.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 7,
      objectiveSummary: 'Recupera el Nodo Espectral enterrado en Gliese C y entrégalo a los Mi-Go.',
      targetHint: 'Glaciar con portales fallidos en Gliese C'
    },
    bribeOption: {
      id: 'mi-go-bribe',
      label: 'Ofrecer hierro lunar',
      description: 'Tributo metálico para que revelen la órbita del nodo.',
      clueTier: 'minor',
      clueSummary: 'Las placas vibran y señalan un glaciar nocturno lleno de portales rotos.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los Mi-Go analizan tu ofrenda y proyectan coordenadas heladas en tu casco.',
      narrativeFailure: 'Sin tributo adecuado, los cráneos cromados ignoran tus preguntas.'
    },
    visionOption: {
      id: 'mi-go-vision',
      label: 'Sincronizar mentes',
      description: 'Compartir memoria para ver la ubicación exacta.',
      clueTier: 'final',
      clueSummary: 'Ves el nodo enterrado en una grieta azul con runas del culto.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Fusionan tu consciencia con la suya y el nodo brilla en tu retina.',
      narrativeFailure: 'Tu mente se resiste; los Mi-Go suspenden el enlace.'
    },
    subTasks: [
      {
        id: 'calibrate-resonator',
        label: 'Calibrar resonador Mi-Go',
        description: 'Ajusta el resonador para localizar la grieta correcta.',
        rewardTier: 'major',
        clueSummary: 'El resonador marca un cuadrante específico del glaciar espectral.',
        successProbability: 0.5,
        healthCostOnFail: 5,
        logSuccess: 'La antena vibra en sincronía y los Mi-Go graban el mapa en tu visor.',
        logFailure: 'El aparato estalla en luz verde y te deja un zumbido doloroso.'
      }
    ]
  },
  {
    race: PlanetInhabitants.YIG,
    missionTemplate: {
      name: 'Veneno de Muda',
      description: 'Los sacerdotes de Yig reclaman el veneno almacenado en un cinturón serpentino.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'material',
      preferredResourceKind: 'organic',
      memorySharePct: 7,
      objectiveSummary: 'Recolecta Veneno de Muda de los asteroides esmeralda y entrégalo a Yig.',
      targetHint: 'Cinturón serpentino con vetas verdes'
    },
    bribeOption: {
      id: 'yig-bribe',
      label: 'Soborno serpentario',
      description: 'Entregar materiales para comprar rumores.',
      clueTier: 'minor',
      clueSummary: 'Siseos indican un asteroide que proyecta dos sombras superpuestas.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'El acólito acepta la ofrenda y susurra la órbita del asteroide verde.',
      narrativeFailure: 'Las lenguas bífidas niegan información hasta recibir tributo.'
    },
    visionOption: {
      id: 'yig-vision',
      label: 'Visión hipnótica',
      description: 'Permitir que Yig muerda tu mente para revelar la presa.',
      clueTier: 'final',
      clueSummary: 'Observas el crisol cubierto de escamas donde reposa el veneno.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Las serpientes recorren tu cráneo y dejan la imagen exacta del crisol.',
      narrativeFailure: 'Tu cordura es insuficiente para soportar la muda mental.'
    },
    subTasks: [
      {
        id: 'cortar-raiz',
        label: 'Cortar raíz ennegrecida',
        description: 'Purga una raíz corrupta cerca del templo para ganarte su favor.',
        rewardTier: 'major',
        clueSummary: 'Las raíces revelan el sector del cinturón donde se esconde el veneno.',
        successProbability: 0.6,
        healthCostOnFail: 5,
        logSuccess: 'La savia cae como humo verde y marcan el cluster correcto.',
        logFailure: 'La savia tóxica quema tu traje y tienes que retirarte.'
      }
    ]
  },
  {
    race: PlanetInhabitants.LENG,
    missionTemplate: {
      name: 'Campana de Leng',
      description: 'Los monjes de Leng quieren recuperar la campana que tú mismo ocultaste.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 7,
      objectiveSummary: 'Encuentra la Campana de Leng en la luna brumosa y devuélvela.',
      targetHint: 'Luna brumosa con torres gemelas'
    },
    bribeOption: {
      id: 'leng-bribe',
      label: 'Medallón helado',
      description: 'Ofrece recursos para conseguir un amuleto guía.',
      clueTier: 'minor',
      clueSummary: 'El medallón vibra cuando te acercas al sistema binario correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los monjes tallan un medallón de escarcha que apunta a la luna buscada.',
      narrativeFailure: 'Las máscaras de hielo permanecen inmóviles hasta que pagues el tributo.'
    },
    visionOption: {
      id: 'leng-vision',
      label: 'Pulso de Leng',
      description: 'Ceder cordura para recordar dónde escondiste la campana.',
      clueTier: 'final',
      clueSummary: 'Revives el momento en que ocultaste la campana en la niebla gemela.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Las máscaras tocan tu frente y devuelven memorias del escondite.',
      narrativeFailure: 'El ritual exige una mente más lúcida.'
    },
    subTasks: [
      {
        id: 'sellar-micro-portal',
        label: 'Sellar grieta de Leng',
        description: 'Cierra un portal menor para ganar acceso a sus archivos.',
        rewardTier: 'major',
        clueSummary: 'Al sellar la grieta ves el corredor exacto de la luna.',
        successProbability: 0.45,
        sanityCostOnFail: 5,
        logSuccess: 'El vacío se sella y los monjes graban coordenadas en tu mente.',
        logFailure: 'El portal te rechaza y roba recuerdos recientes.'
      }
    ]
  },
  {
    race: PlanetInhabitants.ORGANISMO_VEGETAL,
    missionTemplate: {
      name: 'Polen Lúgubre',
      description: 'El coro vegetal necesita el polen lúgubre para sostener su conciencia.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'material',
      preferredResourceKind: 'organic',
      memorySharePct: 6,
      objectiveSummary: 'Cosecha polen lúgubre en la jungla radiactiva y llévalo al coro.',
      targetHint: 'Jungla radiactiva bioluminiscente'
    },
    bribeOption: {
      id: 'organismo-bribe',
      label: 'Espora guía',
      description: 'Intercambia recursos por una espora orientadora.',
      clueTier: 'minor',
      clueSummary: 'La espora parpadea cuando detecta la radiación correcta.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'La raíz te obsequia una espora que palpita rumbo a la jungla.',
      narrativeFailure: 'Sin nutrientes suficientes, el coro te ignora.'
    },
    visionOption: {
      id: 'organismo-vision',
      label: 'Enredar sinapsis',
      description: 'Permite que sus ramas perforen tu casco para compartir recuerdos.',
      clueTier: 'final',
      clueSummary: 'Ves cápsulas bioluminiscentes donde el polen espera.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Las raíces neuronales muestran el escondite exacto del polen.',
      narrativeFailure: 'Tu mente se resiste al injerto vegetal.'
    },
    subTasks: [
      {
        id: 'cortar-raiz',
        label: 'Cicatrizar raíz infecta',
        description: 'Quemar ramas corrompidas para estabilizar el bosque.',
        rewardTier: 'major',
        clueSummary: 'La red vegetal revela el sector preciso de la jungla.',
        successProbability: 0.6,
        healthCostOnFail: 5,
        logSuccess: 'El coro canta tu nombre y te entrega el mapa de la jungla.',
        logFailure: 'Las esporas se vengan y queman tu traje.'
      }
    ]
  },
  {
    race: PlanetInhabitants.ANGELES_DESCARNADOS,
    missionTemplate: {
      name: 'Pluma de Vacío',
      description: 'Los ángeles descarnados piden la pluma que protegía sus alas en la estrella moribunda.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 6,
      objectiveSummary: 'Rastrea la Pluma de Vacío en los escombros estelares y regresa con ella.',
      targetHint: 'Escombros orbitando una estrella moribunda'
    },
    bribeOption: {
      id: 'angeles-bribe',
      label: 'Escala resonante',
      description: 'Ofrece recursos para obtener una escala sonora guía.',
      clueTier: 'minor',
      clueSummary: 'La escala sólo suena cerca del objetivo.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Las arpas óseas aceptan tu tributo y emiten la nota que debes seguir.',
      narrativeFailure: 'Sin ofrenda, las arpas quedan mudas.'
    },
    visionOption: {
      id: 'angeles-vision',
      label: 'Coro de luz',
      description: 'Entregar cordura para ver cómo te protegieron.',
      clueTier: 'final',
      clueSummary: 'Ves la pluma envolviendo tu nave durante el cataclismo.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Te envuelven en alas invisibles y muestran el refugio de la pluma.',
      narrativeFailure: 'El coro teme romper tu mente debilitada.'
    },
    subTasks: [
      {
        id: 'calibrate-resonator',
        label: 'Afinar resonador óseo',
        description: 'Sincroniza tu resonador con sus cantos.',
        rewardTier: 'major',
        clueSummary: 'El vector orbital queda trazado con precisión.',
        successProbability: 0.55,
        healthCostOnFail: 5,
        logSuccess: 'El resonador canta al unísono y el mapa se revela.',
        logFailure: 'La nota se quiebra y sangras por los oídos.'
      }
    ]
  },
  {
    race: PlanetInhabitants.PROFUNDOS,
    missionTemplate: {
      name: 'Perla Tétrica',
      description: 'Las mareas rotas esconden la perla que registró el primer portal fallido.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 6,
      objectiveSummary: 'Sumérgete en el océano mareal y recupera la Perla Tétrica.',
      targetHint: 'Océano profundo bajo un sol frío'
    },
    bribeOption: {
      id: 'profundos-bribe',
      label: 'Arrojar ofrendas a la fosa',
      description: 'Tributo metálico y orgánico para comprar rumores.',
      clueTier: 'minor',
      clueSummary: 'Los ancianos murmuran sobre el doble amanecer en mareas rotas.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'La ofrenda cae a la fosa y revelan el sol binario sumergido.',
      narrativeFailure: 'Los coros ignoran a quienes no tributan.'
    },
    visionOption: {
      id: 'profundos-vision',
      label: 'Compartir visión salina',
      description: 'Ceder cordura para ver dónde naufragó el artefacto.',
      clueTier: 'final',
      clueSummary: 'Auroras verdes iluminan la estatua que guarda la perla.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'La marea mental te arrastra pero vuelves con coordenadas cristalinas.',
      narrativeFailure: 'Las aguas rechazan mentes inestables.'
    },
    subTasks: [
      {
        id: 'seal-micro-portal',
        label: 'Sellar micro-portal',
        description: 'Canaliza un pulso estabilizador bajo el anfiteatro.',
        rewardTier: 'major',
        clueSummary: 'El portal revela un planeta acuático con pilares invertidos.',
        successProbability: 0.55,
        healthCostOnFail: 5,
        logSuccess: 'El vacío se contrae y entregan el mapa oceánico.',
        logFailure: 'La grieta te lastima y canta tu fracaso.'
      }
    ]
  },
  {
    race: PlanetInhabitants.ANTIGUOS,
    missionTemplate: {
      name: 'Cubo Hipergeométrico',
      description: 'Desean el cubo que contiene memoria sólida de civilizaciones.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 6,
      objectiveSummary: 'Penetra las ruinas árticas y recupera el cubo.',
      targetHint: 'Glaciar espiral en planeta ártico'
    },
    bribeOption: {
      id: 'antiguos-bribe',
      label: 'Piedra axial',
      description: 'Intercambia recursos por una piedra que vibra al alinearte.',
      clueTier: 'minor',
      clueSummary: 'La piedra resuena cuando el eje planetario coincide.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Las estatuas despiertan y entregan la piedra axial.',
      narrativeFailure: 'Los Antiguos se mantienen inmóviles ante tu falta de tributo.'
    },
    visionOption: {
      id: 'antiguos-vision',
      label: 'Memoria sólida',
      description: 'Permite que los Antiguos revelen recuerdos previos.',
      clueTier: 'final',
      clueSummary: 'Recuerdas tu rostro antes del golpe y ves dónde dejaste el cubo.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Las estatuas proyectan escenas intactas de tu pasado.',
      narrativeFailure: 'Tu mente fluctúa y rechaza la transferencia.'
    },
    subTasks: [
      {
        id: 'calibrate-resonator',
        label: 'Sincronizar monolitos',
        description: 'Ajusta el resonador al canto geométrico.',
        rewardTier: 'major',
        clueSummary: 'Obtienes la grilla exacta de acceso al cubo.',
        successProbability: 0.5,
        healthCostOnFail: 5,
        logSuccess: 'Los monolitos responden y revelan el mapa polar.',
        logFailure: 'La onda fría recorre tu cuerpo y te hiere.'
      }
    ]
  },
  {
    race: PlanetInhabitants.DOHLE,
    missionTemplate: {
      name: 'Resina Coralina',
      description: 'Los artesanos Dohle necesitan la resina de un asteroide volcánico.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'material',
      preferredResourceKind: 'silicate',
      memorySharePct: 6,
      objectiveSummary: 'Extrae resina coralina del asteroide y preséntala en su taller.',
      targetHint: 'Asteroide volcánico con fumarolas turquesa'
    },
    bribeOption: {
      id: 'dohle-bribe',
      label: 'Fragmento coralino',
      description: 'Entrega recursos para recibir un coral guía.',
      clueTier: 'minor',
      clueSummary: 'El fragmento se calienta cuando te acercas al asteroide correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los artesanos moldean un coral brújula para ti.',
      narrativeFailure: 'Sin materias primas no tallarán pista alguna.'
    },
    visionOption: {
      id: 'dohle-vision',
      label: 'Mirada coralina',
      description: 'Revive la rebelión interna del culto junto a ellos.',
      clueTier: 'final',
      clueSummary: 'Ves la resina guardada en fumarolas azules.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Las esculturas vivas muestran el crisol exacto de la resina.',
      narrativeFailure: 'Tu mente no soporta la sinestesia coralina.'
    },
    subTasks: [
      {
        id: 'cortar-raiz',
        label: 'Purgar brote volcánico',
        description: 'Apaga un brote corrupto en su taller.',
        rewardTier: 'major',
        clueSummary: 'Ganan confianza y entregan el mapa orbital.',
        successProbability: 0.6,
        healthCostOnFail: 5,
        logSuccess: 'El taller aplaude y marca la órbita correcta.',
        logFailure: 'El brote escupe ácido y agujerea tu armadura.'
      }
    ]
  },
  {
    race: PlanetInhabitants.CHTHONIAN,
    missionTemplate: {
      name: 'Órgano Sísmico',
      description: 'Los Chtonian necesitan el órgano que regula la música tectónica.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 6,
      objectiveSummary: 'Desciende al núcleo fracturado y restaura el órgano sísmico.',
      targetHint: 'Núcleo de planeta fracturado'
    },
    bribeOption: {
      id: 'chthonian-bribe',
      label: 'Cuerda de basalto',
      description: 'Ofrenda recursos para obtener una cuerda vibratoria.',
      clueTier: 'minor',
      clueSummary: 'La cuerda vibra cuando apuntas al ángulo de entrada correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los Chtonian afinan una cuerda que tiembla hacia el núcleo.',
      narrativeFailure: 'Las grietas permanecen mudas sin tu tributo.'
    },
    visionOption: {
      id: 'chthonian-vision',
      label: 'Eco tectónico',
      description: 'Escucha cómo el motor humano quebró la Tierra.',
      clueTier: 'final',
      clueSummary: 'Sientes la tesitura exacta donde descansa el órgano.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'El temblor se vuelve un mapa tridimensional en tu mente.',
      narrativeFailure: 'La resonancia colapsa tu cordura insuficiente.'
    },
    subTasks: [
      {
        id: 'sellar-micro-portal',
        label: 'Sellar fractura secundaria',
        description: 'Cierra una grieta para demostrar control.',
        rewardTier: 'major',
        clueSummary: 'La fractura se calma y revela el vector al núcleo.',
        successProbability: 0.5,
        sanityCostOnFail: 5,
        logSuccess: 'El planeta deja de gemir y te muestra la ruta interior.',
        logFailure: 'La grieta se ríe y devuelve ondas que casi rompen tu mente.'
      }
    ]
  },
  {
    race: PlanetInhabitants.GULES,
    missionTemplate: {
      name: 'Hueso Cantor',
      description: 'Los gules desean tallar flautas con los restos de tu antigua tripulación.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'material',
      preferredResourceKind: 'organic',
      memorySharePct: 5,
      objectiveSummary: 'Recupera huesos cantores en la necrópolis desértica y entrégalos.',
      targetHint: 'Catacumbas en planeta desierto'
    },
    bribeOption: {
      id: 'gules-bribe',
      label: 'Canto funerario',
      description: 'Ofrenda recursos para aprender un canto guía.',
      clueTier: 'minor',
      clueSummary: 'El canto resuena solo cerca del osario correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los gules emiten un canto secreto y marcan la tumba exacta.',
      narrativeFailure: 'Se ríen de tus bolsillos vacíos.'
    },
    visionOption: {
      id: 'gules-vision',
      label: 'Banquete compartido',
      description: 'Revive el festín donde devoraron la nave nodriza.',
      clueTier: 'final',
      clueSummary: 'Descubres qué túnel lleva al hueso cantor.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Compartes el banquete mental y ves la cámara del hueso.',
      narrativeFailure: 'Tus nervios fallan y rechazan el ritual.'
    },
    subTasks: [
      {
        id: 'cortar-raiz',
        label: 'Extirpar tumor de carne',
        description: 'Ayuda a purgar un brote necrosado.',
        rewardTier: 'major',
        clueSummary: 'Ganan confianza y muestran el mapa subterráneo.',
        successProbability: 0.6,
        healthCostOnFail: 5,
        logSuccess: 'El tumor se derrite y dejan marcas en tu mapa.',
        logFailure: 'El tumor te muerde y deja marcas negras.'
      }
    ]
  },
  {
    race: PlanetInhabitants.GHASTS,
    missionTemplate: {
      name: 'Espejo de Penumbra',
      description: 'Necesitan el espejo que revela la forma de los primigenios rivales.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 5,
      objectiveSummary: 'Desciende al mundo subterráneo y rescata el Espejo de Penumbra.',
      targetHint: 'Mundo subterráneo sin luz'
    },
    bribeOption: {
      id: 'ghasts-bribe',
      label: 'Hongos lumínicos',
      description: 'Comprar hongos que brillan cerca del espejo.',
      clueTier: 'minor',
      clueSummary: 'Los hongos sólo emiten luz en el pasaje correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los ghasts arrojan hongos en tu regazo y gruñen la ruta.',
      narrativeFailure: 'Sin tributo, solo chasquean y desaparecen.'
    },
    visionOption: {
      id: 'ghasts-vision',
      label: 'Juramento subterráneo',
      description: 'Recordar el pacto de destruir primigenios rivales.',
      clueTier: 'final',
      clueSummary: 'Ves el espejo flotando sobre un río negro invertido.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Los ghasts proyectan una visión del río negro y el espejo.',
      narrativeFailure: 'Los chasquidos te expulsan por falta de cordura.'
    },
    subTasks: [
      {
        id: 'calibrate-resonator',
        label: 'Sintonizar chasquidos',
        description: 'Ajusta el resonador a su red de clics.',
        rewardTier: 'major',
        clueSummary: 'Obtienes el pasadizo correcto hacia el espejo.',
        successProbability: 0.5,
        healthCostOnFail: 5,
        logSuccess: 'Los clics se alinean y revelan el túnel oculto.',
        logFailure: 'Te pierdes horas entre ecos venenosos.'
      }
    ]
  },
  {
    race: PlanetInhabitants.VAMPIRO_ESTELAR,
    missionTemplate: {
      name: 'Hemoplasma Estelar',
      description: 'Las colonias vampiro desean hemoplasma fresco de la nebulosa roja.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'material',
      preferredResourceKind: 'organic',
      memorySharePct: 5,
      objectiveSummary: 'Recolecta hemoplasma en la nebulosa e infórmales.',
      targetHint: 'Nebulosa roja infestada de sanguijuelas'
    },
    bribeOption: {
      id: 'vampiro-bribe',
      label: 'Vial sensible',
      description: 'Compra un vial que reacciona a la densidad plasmática correcta.',
      clueTier: 'minor',
      clueSummary: 'El vial vibra cuando el hemoplasma es puro.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Las alas membranosas aceptan tu tributo y entregan el vial vivo.',
      narrativeFailure: 'Sin ofrenda, solo huelen tu sangre y guardan silencio.'
    },
    visionOption: {
      id: 'vampiro-vision',
      label: 'Hemocomunión',
      description: 'Compartir venas para recordar cómo alimentaste al motor.',
      clueTier: 'final',
      clueSummary: 'Sientes la nube exacta donde flota el hemoplasma.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Fusionan tu sangre y ves el clúster rojo con claridad.',
      narrativeFailure: 'Tu mente se defiende y rompe el enlace.'
    },
    subTasks: [
      {
        id: 'sellar-micro-portal',
        label: 'Cerrar grieta sanguínea',
        description: 'Estabiliza un portal que desangra la nebulosa.',
        rewardTier: 'major',
        clueSummary: 'Las venas de luz señalan el clúster principal.',
        successProbability: 0.5,
        sanityCostOnFail: 5,
        logSuccess: 'Sellas la grieta y la colonia canta la ruta.',
        logFailure: 'El portal bebe tu sangre y desaparece.'
      }
    ]
  },
  {
    race: PlanetInhabitants.BYHKEE,
    missionTemplate: {
      name: 'Lira de Viento Negro',
      description: 'Los Byhkee guardan la lira que abre corrientes interdimensionales.',
      requiredClueTiers: ['minor', 'major', 'final'],
      type: 'artifact',
      memorySharePct: 8,
      objectiveSummary: 'Escala la cima ventosa y recupera la lira destinada a ti.',
      targetHint: 'Cima con tormentas constantes'
    },
    bribeOption: {
      id: 'byhkee-bribe',
      label: 'Nota del viento',
      description: 'Ofrenda recursos para recibir la nota guía.',
      clueTier: 'minor',
      clueSummary: 'Te enseñan una nota que sólo existe cerca del pico correcto.',
      method: 'bribe',
      cost: BASE_BRIBE_COST,
      narrativeSuccess: 'Los Byhkee entonan la nota y el viento la memoriza en ti.',
      narrativeFailure: 'Sin ofrenda, el viento ruge sin palabras.'
    },
    visionOption: {
      id: 'byhkee-vision',
      label: 'Consagración huracanada',
      description: 'Acepta que te proclamen futuro primigenio.',
      clueTier: 'final',
      clueSummary: 'Comprendes qué pico resuena con la lira.',
      method: 'vision',
      sanityCost: 3,
      narrativeSuccess: 'Los coros te levantan y muestran la cima exacta.',
      narrativeFailure: 'El vendaval te rechaza por mente débil.'
    },
    subTasks: [
      {
        id: 'calibrate-resonator',
        label: 'Afinar resonador eólico',
        description: 'Sincroniza tu resonador con el viento negro.',
        rewardTier: 'major',
        clueSummary: 'La tormenta revela el mapa hacia la cima.',
        successProbability: 0.55,
        healthCostOnFail: 5,
        logSuccess: 'El resonador canta con la tormenta y ves la ruta.',
        logFailure: 'Una ráfaga te lanza contra el suelo y rompe el instrumento.'
      }
    ]
  }
];

const SCRIPT_MAP: Record<string, LandingDiplomacyScript> = SCRIPTS.reduce((acc, script) => {
  const key = script.race === 'default' ? 'default' : script.race;
  acc[key] = script;
  return acc;
}, {} as Record<string, LandingDiplomacyScript>);

export function getLandingDiplomacyScript(race?: PlanetInhabitants | null): LandingDiplomacyScript {
  if (!race) {
    return SCRIPT_MAP['default'];
  }
  return SCRIPT_MAP[race] ?? SCRIPT_MAP['default'];
}
