import { SpellType } from '../types/spell.types';

export interface SpellBehavior {
  type: SpellType;
  /** Blocks ship controls + most gameplay keys when true */
  lockShipControls: boolean;
  /** Prevents map/grimoire toggles and mouse routing when true */
  lockPanels: boolean;
  /** Hides outliners/hover overlays when true (unless animation opts in) */
  hideOutliners: boolean;
  /** Mutes hover UI audio cues when true */
  muteHoverAudio: boolean;
}

const DEFAULT_PROPS = {
  lockShipControls: true,
  lockPanels: true,
  hideOutliners: true,
  muteHoverAudio: true,
} satisfies Omit<SpellBehavior, 'type'>;

const createBehavior = (type: SpellType, overrides: Partial<Omit<SpellBehavior, 'type'>> = {}): SpellBehavior => ({
  type,
  ...DEFAULT_PROPS,
  ...overrides,
});

const DEFAULT_BEHAVIOR = createBehavior(SpellType.LONGJUMP);

export const SPELL_BEHAVIOR_MAP: Record<SpellType, SpellBehavior> = {
  [SpellType.LONGJUMP]: createBehavior(SpellType.LONGJUMP),
  [SpellType.GATE_RITE]: createBehavior(SpellType.GATE_RITE),
  [SpellType.ETERNAL_RITE]: createBehavior(SpellType.ETERNAL_RITE),
  [SpellType.DISRUPT]: createBehavior(SpellType.DISRUPT, {
    lockShipControls: false,
    lockPanels: false,
    hideOutliners: false,
    muteHoverAudio: false,
  }),
  [SpellType.SPEED]: createBehavior(SpellType.SPEED, {
    lockShipControls: false,
    lockPanels: false,
    hideOutliners: false,
    muteHoverAudio: false,
  }),
};

export function getSpellBehavior(spell?: SpellType | null): SpellBehavior {
  if (!spell) {
    return DEFAULT_BEHAVIOR;
  }
  if (SPELL_BEHAVIOR_MAP[spell]) {
    return SPELL_BEHAVIOR_MAP[spell];
  }
  return createBehavior(spell);
}
