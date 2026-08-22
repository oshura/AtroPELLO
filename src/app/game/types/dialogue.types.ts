/**
 * Conversaciones con las razas (Fase 13 — docs/RAZAS.md).
 *
 * Espejo EXACTO de los ficheros `src/app/assets/narrative/landing/landing_missions_<raza>.json`,
 * que llevaban escritos desde hace tiempo sin que nadie los importara. El formato manda: los tipos
 * se adaptan a los datos, no al revés.
 */

export interface DialogueOption {
  id: string;
  /** Lo que el jugador pulsa. */
  label: string;
  /** Lo que la raza responde. */
  text: string;
}

export interface RaceMissionScriptMeta {
  race: string;
  /** Porcentaje de memoria que devuelve completar su misión. */
  memoryShare: number;
  missionType: 'artifact' | 'material' | 'hunt';
  artifactName?: string;
  targetHint?: string;
  /** Glifo que entregan al completar (nombre de `SpellType`). */
  uniqueGlyphId?: string;
  /** Criatura a abatir y bajo qué primigenio, en misiones de caza. */
  huntTarget?: { lesserBeing: string; elderGod?: string };
  /** Etiqueta de la prueba que aparece en la bodega al lograr la caza. */
  trophyLabel?: string;
}

export interface RaceMissionScript {
  meta: RaceMissionScriptMeta;
  offer: {
    /** Narración de apertura. */
    scene: string;
    options: DialogueOption[];
  };
  clues?: {
    minor?: { cost: string; text: string };
    major?: { subTask: string; success: string; failure: string };
    final?: { cost: string; text: string };
  };
  turnIn: {
    success: string;
    /** Fragmento de memoria recuperado: es el pago narrativo de la misión. */
    memoryFragment: string;
  };
}

/** Una línea ya dicha en la conversación en curso. */
export interface DialogueLine {
  speaker: 'race' | 'narrator';
  text: string;
}

/** Acción que el jugador puede tomar ahora mismo. */
export interface DialogueChoice {
  id: string;
  label: string;
  /**
   * 'ask' añade la respuesta al registro y deja la conversación abierta;
   * 'accept' toma el encargo; 'turn-in' lo entrega; 'leave' cierra.
   */
  kind: 'ask' | 'accept' | 'turn-in' | 'leave';
}

export type DialoguePhase = 'offer' | 'turn-in' | 'closed';

export interface DialogueSessionState {
  raceLabel: string;
  phase: DialoguePhase;
  log: DialogueLine[];
  choices: DialogueChoice[];
  /** Resumen del encargo mientras está activo. */
  missionSummary: string | null;
}
