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

/** Ganancia de memoria por búsqueda en la estación (el recuerdo llega BUSCANDO, no descansando). */
const SEARCH_MEMORY_GAIN = 5;

/**
 * Acciones del menú de aterrizaje de la ESTACIÓN (distinto del de planetas): buscar / descansar /
 * recuperar vacío / (despegar lo gestiona el componente). Lógica fría dirigida por eventos. Muta el estado
 * vía GameStateStore + CharacterProfileService. docs/ESTACIONES.md §4. Buscar es SOLO bono (la carga
 * narrativa la lleva la presentación de cómic); descansar recupera vitales.
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
   * aquí va SOLO el bono (sin sucesos aleatorios de −vida/−cordura, decisión del usuario 2026-08-18):
   * descubrimiento de Void Jump si falta y SIEMPRE +5% de memoria (buscar es recordar).
   */
  search(): StationActionResult {
    this.advanceTime(1);
    const lines: StationActionLine[] = [
      { tone: 'info', text: 'Rebuscas entre los restos de la estación.' },
    ];
    // Descubrimiento de hechizo (idempotente): si Void Jump no está en el grimorio, se añade.
    if (!this.gameState.hasSpell(SpellType.LONGJUMP)) {
      this.gameState.learnSpell(SpellType.LONGJUMP);
      this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Station search: spell discovered', { spell: SpellType.LONGJUMP });
      lines.push({ tone: 'success', text: `Hechizo descubierto: ${getSpellLabel(SpellType.LONGJUMP)} (Void Jump). Añadido al grimorio.` });
    }
    const gained = this.gainMemory(SEARCH_MEMORY_GAIN);
    if (gained > 0) {
      lines.push({ tone: 'success', text: `Al remover los restos, un recuerdo encaja: +${gained}% de memoria.` });
    }
    if (lines.length === 1) {
      lines.push({ tone: 'info', text: 'No queda nada más que rescatar entre los restos.' });
    }
    return { title: 'Búsqueda por la estación', lines };
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
