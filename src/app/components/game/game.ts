import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, OnInit, HostListener, PLATFORM_ID, Inject, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Modal } from '../modal/modal';
import { DeathDialogComponent, DeathDialogAction } from '../dialogs/death-dialog/death-dialog';
import { WelcomeDialogComponent } from '../dialogs/welcome-dialog/welcome-dialog';
import { ControlsDialogComponent } from '../dialogs/controls-dialog/controls-dialog';
import { LandingPanelComponent } from '../landing-panel/landing-panel';
import { GameStateManager, GameState } from '../../services/game/game-state.service';
import { GameInputHandler } from '../../services/game/game-input.service';
import { GameInitializer } from '../../services/game/game-initializer.service';
import { GameUIManager } from '../../services/game/game-ui.service';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { LandingApproachContext } from '../../game/types/landing.types';
import { RespawnService } from '../../game/services/state/respawn.service';

@Component({
  selector: 'app-game',
  imports: [CommonModule, Modal, DeathDialogComponent, WelcomeDialogComponent, ControlsDialogComponent, LandingPanelComponent],
  templateUrl: './game.html',
  styleUrl: './game.scss'
})
export class Game implements AfterViewInit, OnDestroy, OnInit {
  @ViewChild('gameCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  
  // Estado público para el template
  get gameState() { return this.stateManager.getCurrentState(); }
  get isGameRunning() { return this.gameState === GameState.RUNNING; }
  get isGameReady() { return this.gameState === GameState.READY; }
  
  // Dialog states
  public showDeathDialog = false;
  public showControlsDialog = false;
  public showLandingPanel = false;
  public landingPanelContext: LandingApproachContext | null = null;
  private pausedByWiki = false;
  private wikiActive = false;

  constructor(
    private stateManager: GameStateManager,
    private inputHandler: GameInputHandler,
    private gameInitializer: GameInitializer,
    private uiManager: GameUIManager,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
    private logger: LoggingService,
    private cdr: ChangeDetectorRef,
    private respawnService: RespawnService
  ) {
    // Expose this instance globally for GameEngine access
    (globalThis as any).GameComponentInstance = this;
  }

  /** Called from GameEngine once landing cinematic fades to black */
  public openLandingPanel(context: LandingApproachContext): void {
    this.logger.info(LogCategory.GAME_LOOP, 'Landing panel opening', { planetId: context.planetId });
    this.landingPanelContext = context;
    this.showLandingPanel = true;
    this.setLandingMusicState(true);
    this.inputHandler.setInputEnabled(false);
    this.cdr.detectChanges();
  }

  public onLandingStay(): void {
    this.closeLandingPanel();
  }

  public onLandingTakeoff(): void {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Cannot start takeoff: GameEngine unavailable');
      return;
    }
    const takeoffFn = (engine as any).startTakeoffSequence;
    if (typeof takeoffFn === 'function') {
      try {
        const started = !!takeoffFn.call(engine);
        if (started) {
          this.closeLandingPanel();
        } else {
          this.logger.warn(LogCategory.GAME_LOOP, 'Takeoff sequence request was rejected');
        }
      } catch (error) {
        this.logger.error(LogCategory.GAME_LOOP, 'Takeoff sequence start failed', error);
      }
    } else {
      this.logger.warn(LogCategory.GAME_LOOP, 'Takeoff sequence not wired yet');
    }
  }

  /** Permite que GameEngine cierre el panel de aterrizaje ante eventos forzados (p. ej. colapso). */
  public forceCloseLandingPanel(reason?: string): void {
    this.logger.info(LogCategory.GAME_LOOP, 'Landing panel force-closed', { reason });
    this.closeLandingPanel();
  }

  private closeLandingPanel(): void {
    const wasVisible = this.showLandingPanel;
    this.showLandingPanel = false;
    this.landingPanelContext = null;
    if (wasVisible) {
      this.setLandingMusicState(false);
      this.updateInputEnabled();
      this.cdr.detectChanges();
    }
  }

  private setLandingMusicState(active: boolean): void {
    try {
      const engine = this.gameInitializer.getGameEngine();
      if (!engine) {
        return;
      }
      if (typeof engine.isAtmosphereMusicSuppressed === 'function' && engine.isAtmosphereMusicSuppressed()) {
        this.logger.debug(LogCategory.MUSIC, 'Landing music suppressed by atmosphere scene', { active });
        return;
      }
      const music = (engine as any)?.music;
      if (!music) {
        return;
      }
      if (!active && this.gameState !== GameState.RUNNING) {
        return;
      }
      const scene = active ? 'landing' : 'exploration';
      const fade = active ? 700 : 900;
      const maybePromise = music.setScene(scene, fade);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch((sceneError: unknown) => {
          this.logger.warn(LogCategory.MUSIC, 'Landing music scene promise rejected', { active, sceneError });
        });
      }
    } catch (error) {
      this.logger.warn(LogCategory.MUSIC, 'Failed to toggle landing music', { active, error });
    }
  }

  ngOnInit() {
    // Auto-pause/resume when navigating to/from wiki
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const isWiki = event.url.startsWith('/wiki');
        this.wikiActive = isWiki;
        this.updateInputEnabled();
        
        if (isWiki && this.gameState === GameState.RUNNING) {
          this.logger.info(LogCategory.GAME_LOOP, 'Auto-pausing for wiki');
          this.pausedByWiki = true;
          this.pauseGame();
        } else if (!isWiki && this.pausedByWiki && this.gameState === GameState.PAUSED) {
          this.logger.info(LogCategory.GAME_LOOP, 'Auto-resuming from wiki');
          this.pausedByWiki = false;
          this.resumeGame();
        }
      });
  }

  async ngAfterViewInit() {
  this.logger.info(LogCategory.GAME_INITIALIZATION, 'Game component view init start');
    
    // Solo inicializar en el navegador, no en SSR
    // FORZAR inicialización para depuración (desactivando detección SSR temporalmente)
  this.logger.debug(LogCategory.DEBUG, 'Force init - bypassing SSR detection for debugging');
    
    // Añadir un pequeño delay para asegurar que el DOM esté completamente listo
    setTimeout(async () => {
      try {
        await this.initializeGame();
      } catch (error) {
        this.logger.error(LogCategory.GAME_INITIALIZATION, 'Forced initialization error', error);
      }
    }, 500); // Más tiempo para asegurar que todo esté listo
  }

  ngOnDestroy() {
    // Clean up global reference
    if ((globalThis as any).GameComponentInstance === this) {
      (globalThis as any).GameComponentInstance = null;
    }
    this.cleanup();
  }

  /**
   * Inicialización completa usando GameInitializer
   */
  private async initializeGame(): Promise<void> {
    try {
  this.logger.info(LogCategory.GAME_INITIALIZATION, 'Starting game initialization');
      
      // Verificar que estamos en el navegador
      if (!isPlatformBrowser(this.platformId)) {
        this.logger.warn(LogCategory.GAME_INITIALIZATION, 'Not in browser - skipping WebGL initialization');
        return;
      }
      
      // Test básico de WebGL
      const canvas = this.canvas.nativeElement;
      if (!canvas) {
        throw new Error('Canvas not available');
      }
      
      const testGL = canvas.getContext('webgl2') || canvas.getContext('webgl');
      this.logger.debug(LogCategory.RENDER, 'WebGL test context', { hasContext: !!testGL });
      if (testGL) {
        testGL.clearColor(0.2, 0.4, 0.8, 1.0);
        testGL.clear(testGL.COLOR_BUFFER_BIT);
        this.logger.info(LogCategory.RENDER, 'WebGL basic test successful');
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
          this.updateInputEnabled();
          this.uiManager.initializeDebugCollector(gameEngine);
          // Also initialize the stats overlay with engine for richer data
          this.uiManager.initializeStatsOverlay(gameEngine);
        }

        // Configurar listeners de estado
        this.stateManager.onStateChange((state: GameState) => {
          this.uiManager.showGameStateMessage(state);
          this.updateInputEnabled(state);
        });

        // Cambiar a estado listo
        this.stateManager.setState(GameState.READY);
        this.logger.info(LogCategory.GAME_INITIALIZATION, 'Game initialized successfully', result);
      } else {
        this.stateManager.setState(GameState.ERROR);
        this.uiManager.showError(result.error || 'Unknown initialization error');
        this.logger.error(LogCategory.GAME_INITIALIZATION, 'Game initialization failed', result.error);
      }
    } catch (error) {
      // Verificar si es un error de SSR específico
      if (error instanceof Error && error.message.includes('NotYetImplemented')) {
        this.logger.warn(LogCategory.GAME_INITIALIZATION, 'SSR error detected (expected)');
        // No cambiar el estado a ERROR para errores de SSR
        return;
      }
      
      this.stateManager.setState(GameState.ERROR);
      this.uiManager.showError(error instanceof Error ? error.message : 'Initialization error');
      this.logger.error(LogCategory.GAME_INITIALIZATION, 'Game initialization error', error);
    }
  }



  /**
   * Manejador de teclas usando GameInputHandler
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (this.shouldIgnoreGlobalInput(event)) {
      return;
    }
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
      this.logger.debug(LogCategory.PERFORMANCE, visible ? 'Stats overlay shown (ñ)' : 'Stats overlay hidden (ñ)');
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
    if (this.shouldIgnoreGlobalInput(event)) {
      return;
    }
    // Delegar al input handler
    const handled = this.inputHandler.handleKeyUp(event);
    if (handled) {
      event.preventDefault();
    }
  }

  @HostListener('wheel', ['$event'])
  handleWheel(event: WheelEvent): void {
    if (this.shouldIgnoreGlobalInput(event)) {
      return;
    }
    // Delegar al input handler para zoom
    const handled = this.inputHandler.handleWheel(event);
    if (handled) {
      event.preventDefault();
    }
  }

  private updateInputEnabled(stateOverride?: GameState): void {
    const state = stateOverride ?? this.stateManager.getCurrentState();
    const enable = state === GameState.RUNNING && !this.wikiActive;
    this.inputHandler.setInputEnabled(enable);
  }

  private shouldIgnoreGlobalInput(event: Event): boolean {
    if (this.wikiActive) {
      return true;
    }
    return this.isEditableTarget(event.target);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName?.toLowerCase();
    if (tag && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      return true;
    }
    if (target.isContentEditable) {
      return true;
    }
    return !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  /**
   * Inicia el juego usando GameStateManager
   */
  async startGame(): Promise<void> {
    if (!this.stateManager.canStart()) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Cannot start game in current state', { state: this.gameState });
      return;
    }

    try {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (!gameEngine) {
        throw new Error('Game engine not available');
      }

      // Cerrar diálogo de controles
      this.showControlsDialog = false;
      
      this.stateManager.setState(GameState.RUNNING);
      this.uiManager.resetGameStats();
      gameEngine.start();
      
      // Cambiar a música de exploración
      try {
        const music = (gameEngine as any).music;
        if (music) {
          music.setScene('exploration', 1500);
        }
      } catch {}
      
      this.logger.info(LogCategory.GAME_LOOP, 'Game started');
    } catch (error) {
      this.stateManager.setState(GameState.ERROR);
      this.uiManager.showError(error instanceof Error ? error.message : 'Failed to start game');
    }
  }

  /**
   * Maneja el evento de continuar desde el diálogo de bienvenida
   */
  onWelcomeContinue(): void {
    this.showControlsDialog = true;
  }

  /**
   * Para el juego usando GameStateManager
   */
  stopGame(): void {
    if (!this.stateManager.canStop()) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Cannot stop game in current state', { state: this.gameState });
      return;
    }

    const gameEngine = this.gameInitializer.getGameEngine();
    if (gameEngine) {
      gameEngine.stop();
    }

    this.stateManager.setState(GameState.STOPPED);
    this.logger.info(LogCategory.GAME_LOOP, 'Game stopped');
  }

  /**
   * Pausa el juego
   */
  private pauseGame(): void {
    if (this.stateManager.canPause()) {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (gameEngine) {
        gameEngine.stop();
        try { gameEngine.setAudioPausedForGame(true); } catch {}
        try {
          const music = (gameEngine as any).music;
          if (music) music.setScene('menu', 800);
        } catch {}
      }
      this.stateManager.setState(GameState.PAUSED);
      this.logger.info(LogCategory.GAME_LOOP, 'Game paused');
    }
  }

  /**
   * Reanuda el juego
   */
  private resumeGame(): void {
    if (this.stateManager.canStart()) {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (gameEngine) {
        gameEngine.start();
        try { gameEngine.setAudioPausedForGame(false); } catch {}
        try {
          const music = (gameEngine as any).music;
          if (music) music.setScene('exploration', 800);
        } catch {}
      }
      this.stateManager.setState(GameState.RUNNING);
      this.logger.info(LogCategory.GAME_LOOP, 'Game resumed');
    }
  }

  /**
   * Pausa/reanuda el juego (toggle)
   */
  togglePause(): void {
    if (this.gameState === GameState.RUNNING) {
      this.pauseGame();
    } else if (this.gameState === GameState.PAUSED) {
      this.resumeGame();
    }
  }

  /**
   * Handle death dialog actions
   */
  handleDeathAction(action: DeathDialogAction): void {
    this.showDeathDialog = false;
    const gameEngine = this.gameInitializer.getGameEngine();
    
    if (!gameEngine) {
      this.logger.error(LogCategory.GAME_LOOP, 'GameEngine not available for death action');
      return;
    }
    
    if (action === 'restart') {
      // Full solar system respawn
      try {
        (gameEngine as any).respawnGame?.();
        // Volver a música de exploración
        const music = (gameEngine as any).music;
        if (music) music.setScene('exploration', 1000);
        this.logger.info(LogCategory.GAME_LOOP, 'System respawned after death');
      } catch (e) {
        this.logger.error(LogCategory.GAME_LOOP, 'Failed to respawn game', e);
      }
    } else if (action === 'respawn') {
      try {
        this.respawnService.respawnFromDeath('UNKNOWN');
        try { gameEngine.setAudioPausedForGame(false); } catch {}
        try {
          const music = (gameEngine as any).music;
          if (music) music.setScene('exploration', 1000);
        } catch {}
        this.logger.info(LogCategory.GAME_LOOP, 'Respawn Sigillum requested from death dialog');
      } catch (error) {
        this.logger.error(LogCategory.GAME_LOOP, 'Respawn service failed, falling back to legacy respawn', error);
        try {
          (gameEngine as any).respawnGame?.();
        } catch {}
      }
    } else if (action === 'load') {
      // Load saved game: restore ship near portal with full health and void energy
      try {
        (gameEngine as any).loadSaveAfterDeath?.();
        // Volver a música de exploración
        const music = (gameEngine as any).music;
        if (music) music.setScene('exploration', 1000);
        this.logger.info(LogCategory.GAME_LOOP, 'Saved game loaded after death');
      } catch (e) {
        this.logger.error(LogCategory.GAME_LOOP, 'Failed to load save', e);
      }
    }
  }

  /**
   * Public method exposed to GameEngine to show death dialog
   */
  public triggerDeathDialog(): void {
    this.showDeathDialog = true;
    
    // Audio is already stopped by GameEngine.triggerDeathDialog() before calling this
    // No need to stop it again here
    
    // Cambiar a música de menú cuando aparece el diálogo de muerte
    try {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (gameEngine) {
        const music = (gameEngine as any).music;
        if (music) music.setScene('menu', 1000);
      }
    } catch {}
    // Forzar detección de cambios manualmente ya que este método
    // se llama desde el game loop (fuera del ciclo normal de Angular)
    this.cdr.detectChanges();
    this.logger.info(LogCategory.GAME_LOOP, 'Death dialog triggered (change detection forced)');
  }

  /**
   * Toggle del overlay de debug de la nave (F1)
   */
  toggleDebugOverlay(): boolean {
    const isActive = this.uiManager.toggleSpaceshipDebug();
    this.logger.debug(LogCategory.DEBUG, isActive ? 'Spaceship debug overlay activated' : 'Spaceship debug overlay deactivated');
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
    this.logger.info(LogCategory.GAME_INITIALIZATION, 'Cleaning up game component start');
    
    // Parar el juego si está corriendo
    if (this.gameState === GameState.RUNNING || this.gameState === GameState.PAUSED) {
      this.stopGame();
    }

    // Limpiar servicios
    this.inputHandler.cleanup();
    this.gameInitializer.cleanup();
    this.uiManager.cleanup();
    
    this.logger.info(LogCategory.GAME_INITIALIZATION, 'Game component cleaned up');
  }
}
