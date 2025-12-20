import { Injectable, ElementRef } from '@angular/core';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { CanvasResizeMetrics } from '../GameEngine';
import { IGameModeEngine, GameModeEvent, GameModeController } from './game-mode-engine.interface';
import { SharedGameContext } from './shared-game-context';
import { SpaceGameEngineAdapter } from './space-game-engine-adapter';
import { HudMarqueeEventType } from '../types/hud.types';

export interface GameModeOrchestratorConfig {
  canvasRef: ElementRef<HTMLCanvasElement>;
  sharedContext: SharedGameContext;
  engines: IGameModeEngine[];
  defaultMode?: string;
}

@Injectable({ providedIn: 'root' })
export class GameModeOrchestrator implements GameModeController {
  private canvasRef: ElementRef<HTMLCanvasElement> | null = null;
  private sharedContext: SharedGameContext | null = null;
  private engines = new Map<string, IGameModeEngine>();
  private initializedModes = new Set<string>();
  private currentMode: string | null = null;

  constructor(private readonly logger: LoggingService) {}

  async initialize(config: GameModeOrchestratorConfig): Promise<void> {
    this.canvasRef = config.canvasRef;
    this.sharedContext = config.sharedContext;
    this.engines.clear();
    this.initializedModes.clear();

    for (const engine of config.engines) {
      this.engines.set(engine.name, engine);
    }

    const defaultMode = config.defaultMode ?? 'space';
    await this.ensureModeReady(defaultMode);
    const previousMode = this.currentMode;
    this.currentMode = defaultMode;
    this.handleModeActivated(defaultMode, { type: 'orchestrator:init' }, previousMode);
  }

  private async ensureModeReady(name: string): Promise<void> {
    if (!this.canvasRef || !this.sharedContext) {
      throw new Error('GameModeOrchestrator not configured with canvas/shared context');
    }

    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`GameModeOrchestrator: unknown mode "${name}"`);
    }

    if (this.initializedModes.has(name)) {
      return;
    }

    await engine.initialize(this.canvasRef, this.sharedContext);
    this.initializedModes.add(name);
  }

  getCurrentMode(): string | null {
    return this.currentMode;
  }

  getCurrentEngine(): IGameModeEngine | null {
    return this.currentMode ? this.engines.get(this.currentMode) ?? null : null;
  }

  getEngine(name: string): IGameModeEngine | null {
    return this.engines.get(name) ?? null;
  }

  async switchMode(mode: string, event?: GameModeEvent): Promise<void> {
    if (this.currentMode === mode) {
      if (event) {
        this.getCurrentEngine()?.handleGameEvent?.(event);
      }
      return;
    }

    const previousMode = this.currentMode;
    const previous = this.getCurrentEngine();
    this.logger.info(LogCategory.GAME_LOOP, 'Switching game mode', {
      from: previousMode,
      to: mode,
      trigger: event?.type ?? null,
    });
    if (previous instanceof SpaceGameEngineAdapter && mode === 'atmosphere') {
      previous.enterExternalRenderHostMode(event?.type ? `switch:${event.type}` : 'switch:atmosphere');
    } else {
      previous?.stop();
    }

    await this.ensureModeReady(mode);
    this.currentMode = mode;
    this.handleModeActivated(mode, event ?? null, previousMode);

    const next = this.getCurrentEngine();
    if (mode === 'space') {
      this.getSpaceEngineAdapter()?.exitExternalRenderHostMode(event?.type ? `switch:${event.type}` : 'switch:space');
    }
    next?.startLoop();
    if (event) {
      next?.handleGameEvent?.(event);
    }
    this.unblockPanelInputsAfterFade(mode, event);
  }

  applyCanvasResize(detail: CanvasResizeMetrics): void {
    this.getCurrentEngine()?.applyCanvasResize(detail);
  }

  broadcastEvent(event: GameModeEvent): void {
    for (const engine of this.engines.values()) {
      try {
        engine.handleGameEvent?.(event);
      } catch (error) {
        this.logger.warn(LogCategory.GAME_LOOP, 'Mode engine failed while handling event', {
          mode: engine.name,
          error,
          event,
        });
      }
    }
  }

  stopAll(): void {
    for (const engine of this.engines.values()) {
      try {
        engine.stop();
      } catch (error) {
        this.logger.warn(LogCategory.GAME_LOOP, 'Failed to stop mode engine', { mode: engine.name, error });
      }
    }
    this.currentMode = null;
  }

  getSpaceEngineAdapter(): SpaceGameEngineAdapter | null {
    const engine = this.engines.get('space');
    return engine instanceof SpaceGameEngineAdapter ? engine : null;
  }

  private handleModeActivated(mode: string, trigger: GameModeEvent | null, previousMode?: string | null): void {
    if (!this.sharedContext) {
      return;
    }
    const prev = previousMode ?? null;
    this.sharedContext.activeMode = mode;
    try {
      this.sharedContext.gameState.setActiveGameMode(mode, {
        reason: trigger?.type ?? 'manual-switch',
        eventType: trigger?.type ?? null,
      });
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Failed to update GameStateStore with active mode', {
        error,
        mode,
      });
    }

    this.emitModeChangedEvent(prev, mode, trigger);
    this.announceModeTransition(prev, mode);
  }

  private emitModeChangedEvent(previous: string | null, next: string, trigger?: GameModeEvent | null): void {
    const payload = {
      from: previous,
      to: next,
      trigger: trigger?.type ?? null,
      timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    };
    try {
      this.broadcastEvent({ type: 'mode:changed', payload });
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Failed to broadcast mode change event', { error, payload });
    }
  }

  private announceModeTransition(previous: string | null, next: string): void {
    const hud = this.sharedContext?.hudManager;
    if (!hud?.emitMarqueeEvent) {
      return;
    }
    const readable = next === 'atmosphere' ? 'Modo atmosférico activo' : 'Modo espacial activo';
    const details = previous ? `${previous} → ${next}` : next;
    try {
      hud.emitMarqueeEvent(HudMarqueeEventType.SYSTEM, `${readable} (${details})`, {
        dedupeKey: `mode-${next}`,
        priorityOverride: 2,
        loops: 1,
      });
    } catch (error) {
      this.logger.warn(LogCategory.HUD, 'HUD marquee rejected mode transition message', { error, next });
    }
  }

  private unblockPanelInputsAfterFade(mode: string, event?: GameModeEvent | null): void {
    if (mode !== 'atmosphere' || event?.type !== 'landing:fade-in') {
      return;
    }
    try {
      this.sharedContext?.panelCoordinator.setInputsBlocked(false);
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Failed to unblock panel inputs after fade', { error });
    }
  }
}
