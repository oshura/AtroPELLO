import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GameState } from './game-state.service';
import { SpaceshipDebugCollector } from '../debug/spaceship-debug-collector.service';
import { DebugStatsOverlayService } from '../debug/debug-stats-overlay.service';

export interface UIState {
  canvasSize: { width: number; height: number };
  fps: number;
  debugMode: boolean;
  showControls: boolean;
  showStats: boolean;
}

export interface GameStats {
  score: number;
  lives: number;
  level: number;
  asteroidsDestroyed: number;
  timeElapsed: number;
}

/**
 * Servicio para manejar toda la interacción con la UI del juego
 */
@Injectable({
  providedIn: 'root'
})
export class GameUIManager {
  private uiState: UIState = {
    canvasSize: { width: 0, height: 0 },
    fps: 0,
    debugMode: false,
    showControls: true,
    showStats: true
  };

  private gameStats: GameStats = {
    score: 0,
    lives: 3,
    level: 1,
    asteroidsDestroyed: 0,
    timeElapsed: 0
  };

  private statusElement: HTMLElement | null = null;
  private controlsElement: HTMLElement | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private debugCollector: SpaceshipDebugCollector,
    private statsOverlay: DebugStatsOverlayService
  ) {}

  /**
   * Inicializa los elementos de UI (solo en el navegador)
   */
  initializeUI(statusElementId?: string, controlsElementId?: string): void {
    if (!isPlatformBrowser(this.platformId)) {
      return; // No hacer nada en SSR
    }

    if (statusElementId) {
      this.statusElement = document.getElementById(statusElementId);
    }
    
    if (controlsElementId) {
      this.controlsElement = document.getElementById(controlsElementId);
    }

    this.updateUI();
  }

  /**
   * Inicializa overlay de stats con referencia opcional al GameEngine
   */
  initializeStatsOverlay(gameEngine?: any): void {
    this.statsOverlay.initialize(gameEngine);
  }

  /**
   * Actualiza el tamaño del canvas en la UI
   */
  updateCanvasSize(width: number, height: number): void {
    this.uiState.canvasSize = { width, height };
    this.updateUI();
  }

  /**
   * Actualiza los FPS mostrados
   */
  updateFPS(fps: number): void {
    this.uiState.fps = Math.round(fps);
    this.updateFPSDisplay();
  }

  /**
   * Actualiza las estadísticas del juego
   */
  updateGameStats(stats: Partial<GameStats>): void {
    this.gameStats = { ...this.gameStats, ...stats };
    this.updateStatsDisplay();
  }

  /**
   * Cambia el modo debug
   */
  toggleDebugMode(): boolean {
    this.uiState.debugMode = !this.uiState.debugMode;
    this.updateUI();
    return this.uiState.debugMode;
  }

  /**
   * Muestra u oculta los controles
   */
  toggleControls(): boolean {
    this.uiState.showControls = !this.uiState.showControls;
    this.updateControlsVisibility();
    return this.uiState.showControls;
  }

  /**
   * Muestra u oculta las estadísticas
   */
  toggleStats(): boolean {
    this.uiState.showStats = !this.uiState.showStats;
    this.updateStatsVisibility();
    return this.uiState.showStats;
  }

  /**
   * Muestra un mensaje de estado del juego
   */
  showGameStateMessage(state: GameState): void {
    let message = '';
    
    switch (state) {
      case GameState.INITIALIZING:
        message = 'Initializing game...';
        break;
      case GameState.READY:
        message = 'Press SPACE to start the game';
        break;
      case GameState.RUNNING:
        message = '';
        break;
      case GameState.PAUSED:
        message = 'Game Paused - Press ESC to resume';
        break;
      case GameState.STOPPED:
        message = 'Game Stopped - Press SPACE to restart';
        break;
      case GameState.ERROR:
        message = 'Game Error - Check console for details';
        break;
    }

    this.showMessage(message);
  }

  /**
   * Muestra un mensaje temporal (solo en el navegador)
   */
  showMessage(message: string, duration: number = 0): void {
    if (!isPlatformBrowser(this.platformId)) {
      return; // No hacer nada en SSR
    }

    if (this.statusElement) {
      this.statusElement.textContent = message;
      
      if (duration > 0) {
        setTimeout(() => {
          if (this.statusElement) {
            this.statusElement.textContent = '';
          }
        }, duration);
      }
    }
  }

  /**
   * Muestra un mensaje de error
   */
  showError(error: string): void {
    this.showMessage(`Error: ${error}`, 5000);
    console.error('Game UI Error:', error);
  }

  /**
   * Obtiene información de la UI para debug
   */
  getUIInfo(): any {
    return {
      uiState: { ...this.uiState },
      gameStats: { ...this.gameStats },
      hasStatusElement: !!this.statusElement,
      hasControlsElement: !!this.controlsElement
    };
  }

  /**
   * Actualiza toda la UI
   */
  private updateUI(): void {
    this.updateStatsDisplay();
    this.updateControlsVisibility();
    this.updateStatsVisibility();
  }

  /**
   * Actualiza la visualización de FPS
   */
  private updateFPSDisplay(): void {
    if (this.uiState.debugMode && this.statusElement) {
      const fpsText = `FPS: ${this.uiState.fps} | Canvas: ${this.uiState.canvasSize.width}x${this.uiState.canvasSize.height}`;
      
      // Solo actualizar si no hay otro mensaje importante
      if (!this.statusElement.textContent || this.statusElement.textContent.startsWith('FPS:')) {
        this.statusElement.textContent = fpsText;
      }
    }
  }

  /**
   * Actualiza la visualización de estadísticas (solo en el navegador)
   */
  private updateStatsDisplay(): void {
    if (!isPlatformBrowser(this.platformId) || !this.uiState.showStats) {
      return;
    }

    // Si hay un elemento específico para estadísticas, actualizarlo
    const statsElement = document.getElementById('game-stats');
    if (statsElement) {
      statsElement.innerHTML = `
        <div>Score: ${this.gameStats.score}</div>
        <div>Lives: ${this.gameStats.lives}</div>
        <div>Level: ${this.gameStats.level}</div>
        <div>Asteroids: ${this.gameStats.asteroidsDestroyed}</div>
        <div>Time: ${Math.floor(this.gameStats.timeElapsed)}s</div>
      `;
    }
  }

  /**
   * Actualiza la visibilidad de los controles
   */
  private updateControlsVisibility(): void {
    if (this.controlsElement) {
      this.controlsElement.style.display = this.uiState.showControls ? 'block' : 'none';
    }
  }

  /**
   * Actualiza la visibilidad de las estadísticas (solo en el navegador)
   */
  private updateStatsVisibility(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const statsElement = document.getElementById('game-stats');
    if (statsElement) {
      statsElement.style.display = this.uiState.showStats ? 'block' : 'none';
    }
  }

  /**
   * Resetea las estadísticas del juego
   */
  resetGameStats(): void {
    this.gameStats = {
      score: 0,
      lives: 3,
      level: 1,
      asteroidsDestroyed: 0,
      timeElapsed: 0
    };
    this.updateStatsDisplay();
  }

  /**
   * Incrementa la puntuación
   */
  addScore(points: number): void {
    this.gameStats.score += points;
    this.updateStatsDisplay();
  }

  /**
   * Decrementar vidas
   */
  loseLife(): number {
    this.gameStats.lives = Math.max(0, this.gameStats.lives - 1);
    this.updateStatsDisplay();
    return this.gameStats.lives;
  }

  /**
   * Incrementa el contador de asteroides destruidos
   */
  addAsteroidDestroyed(): void {
    this.gameStats.asteroidsDestroyed++;
    this.updateStatsDisplay();
  }

  /**
   * Actualiza el tiempo transcurrido
   */
  updateTimeElapsed(time: number): void {
    this.gameStats.timeElapsed = time;
    if (this.uiState.showStats) {
      this.updateStatsDisplay();
    }
  }

  /**
   * Obtiene las estadísticas actuales
   */
  getGameStats(): Readonly<GameStats> {
    return { ...this.gameStats };
  }

  /**
   * Obtiene el estado actual de la UI
   */
  getUIState(): Readonly<UIState> {
    return { ...this.uiState };
  }

  /**
   * Toggle del overlay de debug de la nave
   */
  toggleSpaceshipDebug(): boolean {
    return this.debugCollector.toggleDebugOverlay();
  }

  /**
   * Toggle del overlay de estadísticas (panel 'ñ')
   */
  toggleStatsOverlay(): boolean {
    return this.statsOverlay.toggle();
  }

  /**
   * Inicializa el debug collector con el GameEngine
   */
  initializeDebugCollector(gameEngine: any): void {
    this.debugCollector.initialize(gameEngine);
  }

  /**
   * Verifica si el debug está activo
   */
  isDebugActive(): boolean {
    return this.debugCollector.isDebugActive();
  }

  /**
   * Limpia recursos de la UI
   */
  cleanup(): void {
    this.statusElement = null;
    this.controlsElement = null;
    this.resetGameStats();
    this.debugCollector.cleanup();
  }
}