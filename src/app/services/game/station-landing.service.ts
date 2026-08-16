import { Injectable } from '@angular/core';
import { GameStateStore } from './game-state.store';
import { CharacterProfileService } from './character-profile.service';
import { GameInitializer } from './game-initializer.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import { SpellType, getSpellLabel } from '../../game/types/spell.types';

export interface StationActionLine {
  tone: 'info' | 'success' | 'warning' | 'danger';
  text: string;
}

export interface StationActionResult {
  title: string;
  lines: StationActionLine[];
}

/** Sucesos grotescos al buscar (pérdida de cordura). Lovecraftiano; ver docs/HISTORIA.md §5. */
const GROTESQUE_EVENTS: string[] = [
  'Hallas a la tripulación fundida con los mamparos, bocas abiertas en un grito sin sonido.',
  'Un técnico flota en su traje; tras el visor, el casco está lleno de un humo que te mira.',
  'En la enfermería, los cuerpos se han dispuesto solos en un círculo perfecto, mirando al centro vacío.',
  'Las paredes rezuman una savia tibia que late al ritmo de tu propio corazón.',
  'Un altavoz repite la última orden del capitán al revés, con tu voz.',
];
/** Sucesos estructurales al buscar (pérdida de vida). */
const STRUCTURAL_EVENTS: string[] = [
  'Una descompresión súbita te golpea contra el casco.',
  'Un conducto de refrigerante revienta y te abrasa el costado.',
  'El suelo cede sobre un hueco de tres cubiertas; te sujetas por los dedos.',
  'Una viga desprendida te aplasta contra una esclusa atascada.',
];
/** Ganancia de memoria por búsqueda en la estación (el recuerdo llega BUSCANDO, no descansando). */
const SEARCH_MEMORY_GAIN = 5;

/**
 * Acciones del menú de aterrizaje de la ESTACIÓN (distinto del de planetas): buscar / descansar /
 * recuperar vacío / (despegar lo gestiona el componente). Lógica fría dirigida por eventos. Muta el estado
 * vía GameStateStore + CharacterProfileService. docs/ESTACIONES.md §4. Slice 1 = efectos base; Slice 2
 * enriquecerá las tablas de sucesos grotescos/estructurales y la cinemática de recuerdos.
 */
@Injectable({ providedIn: 'root' })
export class StationLandingService {
  constructor(
    private readonly gameState: GameStateStore,
    private readonly characterProfile: CharacterProfileService,
    private readonly gameInitializer: GameInitializer,
    private readonly logger: LoggingService,
  ) {}

  /** Descansar (100%): recupera vida y cordura y avanza el tiempo (la memoria se gana BUSCANDO). */
  rest(): StationActionResult {
    this.characterProfile.adjustVitals({ health: 25, sanity: 20 });
    this.advanceTime(1);
    this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Station rest');
    return {
      title: 'Descanso en la estación',
      lines: [
        { tone: 'info', text: 'Aseguras una esclusa estanca y duermes entre el zumbido de los reactores.' },
        { tone: 'success', text: 'Recuperas vida y cordura.' },
      ],
    };
  }

  /** Suma memoria (capada a 100) y devuelve la ganancia real aplicada. */
  private gainMemory(pct: number): number {
    const before = this.gameState.memoryPercent;
    const after = Math.min(100, before + pct);
    this.gameState.memoryPercent = after;
    try { this.gameState.characterProfile.memory = Math.min(100, (this.gameState.characterProfile.memory ?? 0) + pct); } catch { /* perfil sin memoria */ }
    return after - before;
  }

  /** Recuperar vacío (100%): rellena el depósito de energía de vacío de la nave. */
  refuelVoid(): StationActionResult {
    const ship = this.gameState.spaceship;
    if (!ship) {
      return { title: 'Recargar vacío', lines: [{ tone: 'warning', text: 'No hay nave acoplada.' }] };
    }
    if (ship.voidEnergyCurrent >= ship.voidEnergyMax) {
      return { title: 'Recargar vacío', lines: [{ tone: 'warning', text: 'El depósito de vacío ya está lleno.' }] };
    }
    ship.voidEnergyCurrent = ship.voidEnergyMax;
    return {
      title: 'Recargar vacío',
      lines: [
        { tone: 'info', text: 'Conectas la nave a los condensadores de la estación.' },
        { tone: 'success', text: 'Depósito de energía de vacío al máximo.' },
      ],
    };
  }

  /**
   * Buscar por la estación. El panel reproduce antes la PRESENTACIÓN de cómic (PresentationService);
   * aquí va el desenlace mecánico: descubrimiento de hechizo (si falta) o suceso grotesco (−cordura) /
   * estructural (−vida), y SIEMPRE +5% de memoria (buscar es recordar). Slice 2 ampliará las tablas.
   */
  search(): StationActionResult {
    const result = this.resolveSearchOutcome();
    const gained = this.gainMemory(SEARCH_MEMORY_GAIN);
    if (gained > 0) {
      result.lines.push({ tone: 'success', text: `Al remover los restos, un recuerdo encaja: +${gained}% de memoria.` });
    }
    return result;
  }

  private resolveSearchOutcome(): StationActionResult {
    const success = Math.random() <= 0.5;
    if (!success) {
      this.characterProfile.adjustVitals({ health: -6 });
      this.advanceTime(1);
      return {
        title: 'Búsqueda por la estación',
        lines: [
          { tone: 'info', text: 'Avanzas por un pasadizo a oscuras, con la linterna parpadeando.' },
          { tone: 'danger', text: 'Una plancha cede bajo tus pies; te hieres al caer. (−vida)' },
        ],
      };
    }
    this.advanceTime(1);
    // Descubrimiento de hechizo (idempotente): si Void Jump no está en el grimorio, se añade.
    if (!this.gameState.hasSpell(SpellType.LONGJUMP)) {
      this.gameState.learnSpell(SpellType.LONGJUMP);
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Station search: spell discovered', { spell: SpellType.LONGJUMP });
      return {
        title: 'Búsqueda por la estación',
        lines: [
          { tone: 'info', text: 'Entre datos corruptos hallas un glifo grabado en una placa de vacío.' },
          { tone: 'success', text: `Hechizo descubierto: ${getSpellLabel(SpellType.LONGJUMP)} (Void Jump). Añadido al grimorio.` },
        ],
      };
    }
    // Suceso grotesco (−cordura) o estructural (−vida), elegido de las tablas.
    if (Math.random() < 0.5) {
      this.characterProfile.adjustVitals({ sanity: -10 });
      return {
        title: 'Búsqueda por la estación',
        lines: [
          { tone: 'info', text: 'Una compuerta se abre con un siseo de aire viciado.' },
          { tone: 'danger', text: `${this.pick(GROTESQUE_EVENTS)} (−cordura)` },
        ],
      };
    }
    this.characterProfile.adjustVitals({ health: -8 });
    return {
      title: 'Búsqueda por la estación',
      lines: [
        { tone: 'info', text: 'Cruzas una sección con la integridad comprometida.' },
        { tone: 'warning', text: `${this.pick(STRUCTURAL_EVENTS)} (−vida)` },
      ],
    };
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private advanceTime(days: number): void {
    try {
      const engine = this.gameInitializer.getGameEngine() as unknown as {
        applyExternalAgeDelta?: (d: number, src: string) => unknown;
      } | null;
      if (engine && typeof engine.applyExternalAgeDelta === 'function') {
        engine.applyExternalAgeDelta(days, 'station');
        return;
      }
    } catch { /* ignore */ }
    try { this.characterProfile.addDaysToAge(days); } catch { /* ignore */ }
  }
}
