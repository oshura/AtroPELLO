import { Injectable } from '@angular/core';
import { GameEngine } from '../../game/GameEngine';

export interface KeyState {
  [key: string]: boolean;
}

/**
 * Servicio para manejar todos los inputs del juego
 */
@Injectable({
  providedIn: 'root'
})
export class GameInputHandler {
  private keyState: KeyState = {};
  private gameEngine: GameEngine | null = null;
  private inputEnabled: boolean = false;

  constructor() {
    this.initializeKeyState();
  }

  /**
   * Inicializa el estado de las teclas
   */
  private initializeKeyState(): void {
    const gameKeys = ['w', 'a', 's', 'd', 'q', 'e', 'y', 't', 'm', 'l', '+', '=', '-', '_', 'shift', 'control', 'escape', '0', '7', '8', '9'];
    gameKeys.forEach(key => {
      this.keyState[key.toLowerCase()] = false;
    });
  }

  /**
   * Establece la referencia al motor del juego
   */
  setGameEngine(engine: GameEngine): void {
    this.gameEngine = engine;
  }

  /**
   * Habilita o deshabilita el procesamiento de input
   */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.clearAllKeys();
    }
  }

  /**
   * Limpia el estado de todas las teclas
   */
  clearAllKeys(): void {
    Object.keys(this.keyState).forEach(key => {
      this.keyState[key] = false;
    });
  }

  /**
   * Maneja eventos de tecla presionada
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.inputEnabled || !this.gameEngine) {
      return false;
    }

    const key = event.key.toLowerCase();
    
    // Log para debug de controles
    console.log('🎮 Key pressed:', event.key, '(mapped to:', key, ')');

    // STEP 4: Cycle targets with T / Shift+T
    if (key === 't') {
      try { (this.gameEngine as any).cycleSelection?.(event.shiftKey === true); } catch {}
      event.preventDefault();
      return true;
    }
    
    // Manejar teclas especiales: reenviar 'escape' al motor para cerrar mapas/menus
    if (key === 'escape') {
      this.gameEngine.handleKeyDown(event.key);
      event.preventDefault();
      return true;
    }
    // Otras especiales que no se pasan al motor
    if (this.handleSpecialKeys(key)) {
      event.preventDefault();
      return true;
    }

    // Actualizar estado de la tecla
    if (key in this.keyState || ['+', '=', '-', '_', '0', '7', '8', '9'].includes(key)) {
      this.keyState[key] = true;
      this.gameEngine.handleKeyDown(event.key);
      event.preventDefault();
      return true;
    }

    return false;
  }

  /**
   * Maneja eventos de tecla liberada
   */
  handleKeyUp(event: KeyboardEvent): boolean {
    if (!this.inputEnabled || !this.gameEngine) {
      return false;
    }

    const key = event.key.toLowerCase();

    // Actualizar estado de la tecla
    if (key in this.keyState || ['0', '7', '8', '9'].includes(key)) {
      this.keyState[key] = false;
      this.gameEngine.handleKeyUp(event.key);
      event.preventDefault();
      return true;
    }

    return false;
  }

  /**
   * Maneja eventos de rueda del mouse para zoom
   */
  handleWheel(event: WheelEvent): boolean {
    if (!this.gameEngine) {
      return false;
    }

    // Normalizar el delta (diferentes navegadores pueden tener diferentes valores)
    const delta = -Math.sign(event.deltaY); // Invertir para que sea intuitivo
    
    this.gameEngine.handleZoom(delta);
    event.preventDefault();
    return true;
  }

  /**
   * Maneja teclas especiales del juego
   */
  private handleSpecialKeys(key: string): boolean {
    switch (key) {
      case 'escape':
        // La tecla escape se maneja externamente
        return true;
      case 'f11':
        // Fullscreen toggle podría manejarse aquí
        return false;
      default:
        return false;
    }
  }

  /**
   * Obtiene el estado actual de una tecla
   */
  isKeyPressed(key: string): boolean {
    return this.keyState[key.toLowerCase()] || false;
  }

  /**
   * Obtiene el estado completo de las teclas
   */
  getKeyState(): Readonly<KeyState> {
    return { ...this.keyState };
  }

  /**
   * Verifica si alguna tecla de movimiento está presionada
   */
  hasMovementInput(): boolean {
    return this.keyState['w'] || this.keyState['a'] || 
           this.keyState['s'] || this.keyState['d'] || 
           this.keyState['q'] || this.keyState['e'];
  }

  /**
   * Verifica si alguna tecla de velocidad está presionada
   */
  hasSpeedInput(): boolean {
    return this.keyState['+'] || this.keyState['='] ||
           this.keyState['-'] || this.keyState['_'];
  }

  /**
   * Obtiene información de debug del input
   */
  getDebugInfo(): any {
    return {
      inputEnabled: this.inputEnabled,
      hasGameEngine: !!this.gameEngine,
      activeKeys: Object.keys(this.keyState).filter(key => this.keyState[key]),
      keyState: { ...this.keyState }
    };
  }

  /**
   * Limpia recursos al destruir el servicio
   */
  cleanup(): void {
    this.clearAllKeys();
    this.gameEngine = null;
    this.inputEnabled = false;
  }
}