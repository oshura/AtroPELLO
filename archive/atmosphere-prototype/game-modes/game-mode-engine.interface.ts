import { ElementRef } from '@angular/core';
import { PanelEventCallbacks } from '../services/ui/panel-event-coordinator.service';
import { CanvasResizeMetrics } from '../GameEngine';
import { SharedGameContext } from './shared-game-context';

export interface GameModeEvent {
  type: string;
  payload?: unknown;
}

export interface IGameModeEngine {
  /** Nombre único del modo (ej. 'space', 'atmosphere'). */
  readonly name: string;

  /** Inicializa recursos propios del modo reutilizando el contexto compartido. */
  initialize(canvasRef: ElementRef<HTMLCanvasElement>, shared: SharedGameContext): Promise<void>;

  /** Inicia el loop/render del modo actual. */
  startLoop(): void;

  /** Detiene el loop/render del modo actual y libera recursos temporales. */
  stop(): void;

  /** Propaga cambios de tamaño del canvas para ajustar viewports/proyecciones. */
  applyCanvasResize(metrics: CanvasResizeMetrics): void;

  /** Permite registrar callbacks personalizados en el PanelEventCoordinator. */
  setInputHandlers(callbacks: PanelEventCallbacks): void;

  /** Maneja eventos de transición (landing, takeoff, etc.) */
  handleGameEvent?(event: GameModeEvent): void;
}

export interface GameModeController {
  getCurrentMode(): string | null;
  switchMode(mode: string, event?: GameModeEvent): Promise<void>;
}
