import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Modal } from '../modal/modal';
import { GameStateManager, GameState } from '../../services/game/game-state.service';
import { GameInputHandler } from '../../services/game/game-input.service';
import { GameInitializer } from '../../services/game/game-initializer.service';
import { GameUIManager } from '../../services/game/game-ui.service';

@Component({
  selector: 'app-game',
  imports: [Modal],
  templateUrl: './game.html',
  styleUrl: './game.scss'
})
export class Game implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  
  // Estado público para el template
  get gameState() { return this.stateManager.getCurrentState(); }
  get isGameRunning() { return this.gameState === GameState.RUNNING; }
  get isGameReady() { return this.gameState === GameState.READY; }

  constructor(
    private stateManager: GameStateManager,
    private inputHandler: GameInputHandler,
    private gameInitializer: GameInitializer,
    private uiManager: GameUIManager,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  async ngAfterViewInit() {
    console.log('🎮 Game component ngAfterViewInit - starting initialization...');
    
    // Solo inicializar en el navegador, no en SSR
    // FORZAR inicialización para depuración (desactivando detección SSR temporalmente)
    console.log('🔍 Force init - bypassing SSR detection for debugging');
    
    // Añadir un pequeño delay para asegurar que el DOM esté completamente listo
    setTimeout(async () => {
      try {
        await this.initializeGame();
      } catch (error) {
        console.error('❌ Error durante inicialización forzada:', error);
      }
    }, 500); // Más tiempo para asegurar que todo esté listo
  }

  ngOnDestroy() {
    this.cleanup();
  }

  /**
   * Inicialización completa usando GameInitializer
   */
  private async initializeGame(): Promise<void> {
    try {
      console.log('🎯 Starting game initialization...');
      
      // Verificar que estamos en el navegador
      if (!isPlatformBrowser(this.platformId)) {
        console.log('⚠️ Not in browser - skipping WebGL initialization');
        return;
      }
      
      // Test básico de WebGL
      const canvas = this.canvas.nativeElement;
      if (!canvas) {
        throw new Error('Canvas not available');
      }
      
      const testGL = canvas.getContext('webgl2') || canvas.getContext('webgl');
      console.log('🧪 WebGL test context:', !!testGL);
      if (testGL) {
        testGL.clearColor(0.2, 0.4, 0.8, 1.0);
        testGL.clear(testGL.COLOR_BUFFER_BIT);
        console.log('✅ WebGL basic test successful - canvas should be blue');
      }
      
      // Inicializar UI
      this.uiManager.initializeUI('game-status', 'game-controls');
      this.uiManager.showGameStateMessage(GameState.INITIALIZING);

      // Inicializar el juego
      const result = await this.gameInitializer.initializeGame(this.canvas, {
        canvasWidth: 800,
        canvasHeight: 600,
        enableDebug: false
      });

      if (result.success) {
        // Configurar input handler y debug collector
        const gameEngine = this.gameInitializer.getGameEngine();
        if (gameEngine) {
          this.inputHandler.setGameEngine(gameEngine);
          this.inputHandler.setInputEnabled(true);
          this.uiManager.initializeDebugCollector(gameEngine);
          // Also initialize the stats overlay with engine for richer data
          this.uiManager.initializeStatsOverlay(gameEngine);
        }

        // Configurar listeners de estado
        this.stateManager.onStateChange((state: GameState) => {
          this.uiManager.showGameStateMessage(state);
          this.inputHandler.setInputEnabled(state === GameState.RUNNING);
        });

        // Cambiar a estado listo
        this.stateManager.setState(GameState.READY);
        console.log('✅ Game initialized successfully!', result);
      } else {
        this.stateManager.setState(GameState.ERROR);
        this.uiManager.showError(result.error || 'Unknown initialization error');
        console.error('❌ Game initialization failed:', result.error);
      }
    } catch (error) {
      // Verificar si es un error de SSR específico
      if (error instanceof Error && error.message.includes('NotYetImplemented')) {
        console.log('⚠️ SSR error detected - this is expected during server-side rendering');
        // No cambiar el estado a ERROR para errores de SSR
        return;
      }
      
      this.stateManager.setState(GameState.ERROR);
      this.uiManager.showError(error instanceof Error ? error.message : 'Initialization error');
      console.error('❌ Game initialization error:', error);
    }
  }

  /**
   * Manejador de teclas usando GameInputHandler
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // Manejar teclas especiales del componente
    if (event.key === 'Escape') {
      // Si algún modal de opciones está visible y rebinding activo, el propio componente lo maneja; no cerrar aquí
      const gameEngine = this.gameInitializer.getGameEngine();
      if (gameEngine) {
        // Forward Escape so GameEngine panel logic runs (map/grimoire close or target clear)
        gameEngine.handleKeyDown('escape');
      }
      event.preventDefault();
      return;
    }

    // Tecla 'p' para pausar/reanudar
    if (event.key.toLowerCase() === 'p') {
      this.togglePause();
      event.preventDefault();
      return;
    }

    if (event.key === ' ' || event.key === 'Space') {
      if (this.gameState === GameState.READY || this.gameState === GameState.STOPPED) {
        this.startGame();
      } else if (this.gameState === GameState.PAUSED) {
        // Space resumes from pause to mirror welcome behavior
        this.togglePause();
      }
      event.preventDefault();
      return;
    }

    // Allow Enter to resume when paused (parity with primary action button)
    if (event.key === 'Enter') {
      if (this.gameState === GameState.PAUSED) {
        this.togglePause();
        event.preventDefault();
        return;
      }
    }

    if (event.key === 'F1') {
      this.toggleDebugOverlay();
      event.preventDefault();
      return;
    }

    // Toggle stats overlay with 'ñ' (Spanish keyboard)
    if (event.key === 'ñ') {
      const visible = this.uiManager.toggleStatsOverlay();
      console.log(visible ? '📊 Stats overlay (ñ) shown' : '📊 Stats overlay (ñ) hidden');
      event.preventDefault();
      return;
    }

    // Delegar al input handler
    const handled = this.inputHandler.handleKeyDown(event);
    if (handled) {
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    // Delegar al input handler
    const handled = this.inputHandler.handleKeyUp(event);
    if (handled) {
      event.preventDefault();
    }
  }

  @HostListener('wheel', ['$event'])
  handleWheel(event: WheelEvent): void {
    // Delegar al input handler para zoom
    const handled = this.inputHandler.handleWheel(event);
    if (handled) {
      event.preventDefault();
    }
  }

  /**
   * Inicia el juego usando GameStateManager
   */
  async startGame(): Promise<void> {
    if (!this.stateManager.canStart()) {
      console.warn('Cannot start game in current state:', this.gameState);
      return;
    }

    try {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (!gameEngine) {
        throw new Error('Game engine not available');
      }

      this.stateManager.setState(GameState.RUNNING);
      this.uiManager.resetGameStats();
      gameEngine.start();
      // Unlock and start audio scene on user start gesture
      try { (gameEngine as any).enableAudio?.(); } catch {}
      
      console.log('🎮 Game started!');
    } catch (error) {
      this.stateManager.setState(GameState.ERROR);
      this.uiManager.showError(error instanceof Error ? error.message : 'Failed to start game');
    }
  }

  /**
   * Para el juego usando GameStateManager
   */
  stopGame(): void {
    if (!this.stateManager.canStop()) {
      console.warn('Cannot stop game in current state:', this.gameState);
      return;
    }

    const gameEngine = this.gameInitializer.getGameEngine();
    if (gameEngine) {
      gameEngine.stop();
    }

    this.stateManager.setState(GameState.STOPPED);
    console.log('⏹️ Game stopped');
  }

  /**
   * Pausa/reanuda el juego
   */
  togglePause(): void {
    if (this.gameState === GameState.RUNNING) {
      if (this.stateManager.canPause()) {
        const gameEngine = this.gameInitializer.getGameEngine();
        if (gameEngine) {
          gameEngine.stop(); // GameEngine no tiene pause, usa stop
        }
        this.stateManager.setState(GameState.PAUSED);
        console.log('⏸️ Game paused');
      }
    } else if (this.gameState === GameState.PAUSED) {
      if (this.stateManager.canStart()) {
        const gameEngine = this.gameInitializer.getGameEngine();
        if (gameEngine) {
          gameEngine.start();
        }
        this.stateManager.setState(GameState.RUNNING);
        console.log('▶️ Game resumed');
      }
    }
  }

  /**
   * Toggle del overlay de debug de la nave (F1)
   */
  toggleDebugOverlay(): boolean {
    const isActive = this.uiManager.toggleSpaceshipDebug();
    console.log(isActive ? '🎯 Debug overlay activated' : '❌ Debug overlay deactivated');
    return isActive;
  }

  /**
   * Obtiene información de debug de todos los servicios
   */
  getDebugInfo(): any {
    return {
      gameState: this.stateManager.getCurrentState(),
      gameInitializer: this.gameInitializer.getDiagnosticInfo(),
      inputHandler: this.inputHandler.getDebugInfo(),
      uiManager: this.uiManager.getUIInfo(),
      debugActive: this.uiManager.isDebugActive(),
      stateManager: {
        currentState: this.stateManager.getCurrentState(),
        canStart: this.stateManager.canStart(),
        canPause: this.stateManager.canPause(),
        canStop: this.stateManager.canStop()
      }
    };
  }

  /**
   * Limpieza usando todos los servicios
   */
  private cleanup(): void {
    console.log('🧹 Cleaning up game component...');
    
    // Parar el juego si está corriendo
    if (this.gameState === GameState.RUNNING || this.gameState === GameState.PAUSED) {
      this.stopGame();
    }

    // Limpiar servicios
    this.inputHandler.cleanup();
    this.gameInitializer.cleanup();
    this.uiManager.cleanup();
    
    console.log('✅ Game component cleaned up');
  }
}
