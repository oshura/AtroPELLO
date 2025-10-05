import { Injectable } from '@angular/core';

export enum GameState {
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Servicio para gestionar el estado del juego
 */
@Injectable({
  providedIn: 'root'
})
export class GameStateManager {
  private currentState: GameState = GameState.INITIALIZING;
  private stateChangeListeners: ((state: GameState) => void)[] = [];

  constructor() {}

  /**
   * Obtiene el estado actual del juego
   */
  getCurrentState(): GameState {
    return this.currentState;
  }

  /**
   * Cambia el estado del juego
   */
  setState(newState: GameState): void {
    const previousState = this.currentState;
    this.currentState = newState;
    
    console.log(`🎮 Game State: ${previousState} → ${newState}`);
    
    // Notificar a los listeners
    this.stateChangeListeners.forEach(listener => listener(newState));
  }

  /**
   * Verifica si el juego está en un estado específico
   */
  isState(state: GameState): boolean {
    return this.currentState === state;
  }

  /**
   * Verifica si el juego está corriendo
   */
  isRunning(): boolean {
    return this.currentState === GameState.RUNNING;
  }

  /**
   * Verifica si el juego está listo para jugar
   */
  isReady(): boolean {
    return this.currentState === GameState.READY;
  }

  /**
   * Verifica si el juego está pausado
   */
  isPaused(): boolean {
    return this.currentState === GameState.PAUSED;
  }

  /**
   * Verifica si hay un error
   */
  hasError(): boolean {
    return this.currentState === GameState.ERROR;
  }

  /**
   * Puede transicionar al estado de corriendo
   */
  canStart(): boolean {
    return this.currentState === GameState.READY || this.currentState === GameState.PAUSED;
  }

  /**
   * Puede pausar el juego
   */
  canPause(): boolean {
    return this.currentState === GameState.RUNNING;
  }

  /**
   * Puede detener el juego
   */
  canStop(): boolean {
    return this.currentState === GameState.RUNNING || this.currentState === GameState.PAUSED;
  }

  /**
   * Suscribirse a cambios de estado
   */
  onStateChange(listener: (state: GameState) => void): void {
    this.stateChangeListeners.push(listener);
  }

  /**
   * Desuscribirse de cambios de estado
   */
  removeStateChangeListener(listener: (state: GameState) => void): void {
    const index = this.stateChangeListeners.indexOf(listener);
    if (index > -1) {
      this.stateChangeListeners.splice(index, 1);
    }
  }

  /**
   * Reinicia el estado del juego
   */
  reset(): void {
    this.setState(GameState.INITIALIZING);
  }
}