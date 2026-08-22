import { Injectable } from '@angular/core';
import { KeyBindingsService } from '../key-bindings.service';
import { GameEngine } from '../../game/GameEngine';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';

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

  constructor(private keyBindings: KeyBindingsService, private logger: LoggingService) {
    this.initializeKeyState();
  }

  /**
   * Inicializa el estado de las teclas
   */
  private initializeKeyState(): void {
  const gameKeys = ['w', 'a', 's', 'd', 'q', 'e', 'h', 't', 'm', 'l', 'i', '+', '=', '-', '_', 'shift', 'capslock', 'control', 'escape', 'backspace', '0', '7', '8', '9', '1', '2', '3', '4'];
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
    const keyRaw = event.key.toLowerCase();
    const composite = event.shiftKey && keyRaw !== 'shift' ? 'shift+' + keyRaw : keyRaw;
    const action = this.keyBindings.findActionForKey(composite);
    if (keyRaw === 'shift') {
      this.keyState['shift'] = true;
      this.gameEngine.handleKeyDown('shift');
      event.preventDefault();
      return true;
    }
    if (keyRaw === 'capslock') {
      const isActive = typeof event.getModifierState === 'function'
        ? event.getModifierState('CapsLock')
        : !this.keyState['capslock'];
      this.keyState['capslock'] = isActive;
      this.gameEngine.setPrecisionLatchActive(isActive);
      event.preventDefault();
      return true;
    }
    // Debug
    // Debug trace at low frequency (optional)
    if (Math.random() < 0.001) {
      this.logger.log(LogLevel.TRACE, LogCategory.INPUT, 'Key pressed', { raw: event.key, normalized: composite, action });
    }

    if (action === 'target_next') {
      try { (this.gameEngine as any).cycleSelection?.(false); } catch {}
      event.preventDefault(); return true;
    }
    if (action === 'target_prev') {
      try { (this.gameEngine as any).cycleSelection?.(true); } catch {}
      event.preventDefault(); return true;
    }
    if (action === 'weapon_next' || action === 'weapon_prev') {
      this.gameEngine.cycleWeapon(action === 'weapon_prev');
      event.preventDefault(); return true;
    }
    if (action === 'clear_target') {
      // Forward to engine using default key (escape) regardless of rebound value
      this.gameEngine.handleKeyDown(this.keyBindings.getDefaultKey('clear_target'));
      event.preventDefault(); return true;
    }
    // If the user cleared the 'clear_target' binding (now blank), still treat raw Escape as clear/close
    if (!action && keyRaw === 'escape') {
      this.gameEngine.handleKeyDown('escape');
      event.preventDefault(); return true;
    }
    // Movement / ship / UI actions: translate rebound key to default original key so engine legacy logic works
    if (action) {
      const translated = this.keyBindings.getDefaultKey(action);
      // Update key state using translated default for compatibility
      this.keyState[translated] = true;
      this.gameEngine.handleKeyDown(translated);
      event.preventDefault();
      return true;
    }
    // Fallback: legacy special handling
    if (this.handleSpecialKeys(keyRaw)) { event.preventDefault(); return true; }
    return false;
  }

  /**
   * Maneja eventos de tecla liberada
   */
  handleKeyUp(event: KeyboardEvent): boolean {
    if (!this.inputEnabled || !this.gameEngine) {
      return false;
    }
    const keyRaw = event.key.toLowerCase();
    const composite = event.shiftKey && keyRaw !== 'shift' ? 'shift+' + keyRaw : keyRaw;
    const action = this.keyBindings.findActionForKey(composite);
    if (keyRaw === 'shift') {
      this.keyState['shift'] = false;
      this.gameEngine.handleKeyUp('shift');
      event.preventDefault();
      return true;
    }
    if (keyRaw === 'capslock') {
      const isActive = typeof event.getModifierState === 'function'
        ? event.getModifierState('CapsLock')
        : this.keyState['capslock'];
      this.keyState['capslock'] = isActive;
      this.gameEngine.setPrecisionLatchActive(isActive);
      event.preventDefault();
      return true;
    }
    if (action) {
      const translated = this.keyBindings.getDefaultKey(action);
      if (translated in this.keyState) this.keyState[translated] = false;
      this.gameEngine.handleKeyUp(translated);
      event.preventDefault(); return true;
    }
    if (keyRaw in this.keyState) {
      this.keyState[keyRaw] = false;
      this.gameEngine.handleKeyUp(event.key);
      event.preventDefault(); return true;
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
        // Dejar que el flujo principal lo maneje (no consumir aquí)
        return false;
      case 'f11':
        // Fullscreen toggle podría manejarse aquí
        return false;
      default:
        return false;
    }
  }

  // Legacy helpers removed (handled via findActionForKey)

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