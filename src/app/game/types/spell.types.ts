/**
 * Spell System Types
 * 
 * Define los tipos de hechizos/ritos disponibles en el grimorio.
 * Centraliza la definición de spells para evitar strings hardcoded.
 */

/**
 * Tipos de hechizos disponibles en el grimorio
 */
export enum SpellType {
  SPEED = 'SPEED',
  LONGJUMP = 'LONGJUMP',
  GATE_RITE = 'GATE_RITE',
  ETERNAL_RITE = 'ETERNAL_RITE',
  DISRUPT = 'DISRUPT',
  ANCHORING_PULSE = 'ANCHORING_PULSE',
  VOID_KINESIS = 'VOID_KINESIS',
  VOID_COCOON = 'VOID_COCOON',
  TEMPUS_SIGILLUM = 'TEMPUS_SIGILLUM',
  QUIMIO_SIGILLUM = 'QUIMIO_SIGILLUM',
  SPECIES_SCAN = 'SPECIES_SCAN',
  CREATURE_SCAN = 'CREATURE_SCAN',
  PORTAL_CONCORD = 'PORTAL_CONCORD'
}

/**
 * Estado de un hechizo en el grimorio
 */
export enum SpellState {
  LOCKED = 'LOCKED',       // Bloqueado, no disponible
  AVAILABLE = 'AVAILABLE', // Disponible para equipar
  EQUIPPED = 'EQUIPPED'    // Actualmente equipado
}

/**
 * Información de display para un spell
 */
export interface SpellDisplayInfo {
  type: SpellType;
  label: string;
  description: string;
  icon: string; // Identificador del icono
  state: SpellState;
}

/**
 * Helper: Verificar si un valor es un SpellType válido
 */
export function isSpellType(value: unknown): value is SpellType {
  return typeof value === 'string' && Object.values(SpellType).includes(value as SpellType);
}

/**
 * Helper: Obtener label legible para un SpellType
 */
export function getSpellLabel(spell: SpellType): string {
  switch (spell) {
    case SpellType.SPEED: return 'Speed Rite';
    case SpellType.LONGJUMP: return 'Long Jump';
    case SpellType.GATE_RITE: return 'Gate Rite';
    case SpellType.ETERNAL_RITE: return 'Eternal Rite';
    case SpellType.DISRUPT: return 'Disrupt';
    case SpellType.ANCHORING_PULSE: return 'Anchoring Pulse';
    case SpellType.VOID_KINESIS: return 'Void Kinesis';
    case SpellType.VOID_COCOON: return 'Void Cocoon';
    case SpellType.TEMPUS_SIGILLUM: return 'Tempus Sigillum';
    case SpellType.QUIMIO_SIGILLUM: return 'Quimio Sigillum';
    case SpellType.SPECIES_SCAN: return 'Augurio';
    case SpellType.CREATURE_SCAN: return 'Revelación';
    case SpellType.PORTAL_CONCORD: return 'Concordia Gate';
    default: return 'Unknown Spell';
  }
}

/**
 * Helper: Obtener descripción de un SpellType
 */
export function getSpellDescription(spell: SpellType): string {
  switch (spell) {
    case SpellType.SPEED:
      return 'Duplica temporalmente la velocidad máxima de la nave';
    case SpellType.LONGJUMP:
      return 'Salto largo instantáneo hacia adelante';
    case SpellType.GATE_RITE:
      return 'Abre un portal hacia la ubicación marcada';
    case SpellType.ETERNAL_RITE:
      return 'Congela el tiempo para todos los objetos excepto la nave';
    case SpellType.DISRUPT:
      return 'Desestabiliza portales cercanos';
    case SpellType.ANCHORING_PULSE:
      return 'Ancla asteroides cercanos y los arrastra a la bodega';
    case SpellType.VOID_KINESIS:
      return 'Condensa asteroides en energía del vacío utilizable';
    case SpellType.VOID_COCOON:
      return 'Encapsula la nave en un capullo del vacío que disipa impactos durante 30 segundos.';
    case SpellType.TEMPUS_SIGILLUM:
      return 'Sella el tiempo de un planeta cercano, purgando augurios previos y amansando seres menores.';
    case SpellType.QUIMIO_SIGILLUM:
      return 'Canaliza agentes rejuvenecedores que restauran un 5% de supervivencia (cap 100%).';
    case SpellType.SPECIES_SCAN:
      return 'Consume cordura temporal para revelar la raza de un planeta escaneado (<500u)';
    case SpellType.CREATURE_SCAN:
      return 'Consume cordura temporal para detectar el ser menor activo en un planeta (<500u)';
    case SpellType.PORTAL_CONCORD:
      return 'Purga el rencor de un portal hostil (<500u), convirtiéndolo en aliado y bloqueando incursiones menores.';
    default:
      return '';
  }
}

export interface SpellSanityCost {
  /** Cordura temporal consumida al completar el hechizo */
  temp: number;
  /** Cordura máxima reservada por tener este glifo aprendido */
  max: number;
}

export const SPELL_SANITY_COSTS: Record<SpellType, SpellSanityCost> = {
  [SpellType.SPEED]: { temp: 1, max: 2 },
  [SpellType.LONGJUMP]: { temp: 2, max: 4 },
  [SpellType.GATE_RITE]: { temp: 5, max: 5 },
  [SpellType.ETERNAL_RITE]: { temp: 1, max: 0 },
  [SpellType.DISRUPT]: { temp: 1, max: 1 },
  [SpellType.ANCHORING_PULSE]: { temp: 2, max: 3 },
  [SpellType.VOID_KINESIS]: { temp: 2, max: 3 },
  [SpellType.VOID_COCOON]: { temp: 3, max: 3 },
  [SpellType.TEMPUS_SIGILLUM]: { temp: 2, max: 5 },
  [SpellType.QUIMIO_SIGILLUM]: { temp: 5, max: 8 },
  [SpellType.SPECIES_SCAN]: { temp: 1, max: 3 },
  [SpellType.CREATURE_SCAN]: { temp: 1, max: 3 },
  [SpellType.PORTAL_CONCORD]: { temp: 2, max: 4 },
};

export function getSpellSanityCost(spell: SpellType): SpellSanityCost {
  return SPELL_SANITY_COSTS[spell] ?? { temp: 0, max: 0 };
}
