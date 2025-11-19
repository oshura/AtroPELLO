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
  DISRUPT = 'DISRUPT'
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
    default:
      return '';
  }
}
