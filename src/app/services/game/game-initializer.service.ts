import { Injectable, ElementRef, PLATFORM_ID, Inject, Injector } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GameEngine } from '../../game/GameEngine';
import { WebGLService } from '../webgl.service';
import { ParticleEffectsService } from '../particle-effects.service';
import { ReticleManager } from '../../game/targeting';
import { AdaptiveTargetingIntegrator } from '../../game/targeting/v2/AdaptiveTargetingIntegrator';
import { TargetCatalogService } from '../../game/services/target-catalog.service';
import { TargetDetailService } from '../../game/services/target-detail.service';
import { AsteroidClusterService } from '../../game/services/game/asteroid-cluster.service';
import { RelationService } from '../relation.service';
import { AnimationManagerService } from '../../game/services/animations/animation-manager.service';
import { AudioEngineService } from '../audio/audio-engine.service';
import { MusicDirectorService } from '../audio/music-director.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';
import { SolarSystemService } from '../../game/services/game/solar-system.service';
import { HumanSolarSystemService } from '../../game/services/game/human-solar-system.service';
import { PortalPersistenceService } from '../../game/services/game/portal-persistence.service';
import { PortalRegistryService } from '../../game/services/game/portal-registry.service';
import { SolarSystemRuntimeSerializerService } from '../../game/services/game/solar-system-runtime-serializer.service';
import { CollisionManagerService } from '../../game/services/physics/collision-manager.service';
import { MissionService } from '../../game/services/game/mission.service';
import { RaceOutfittingBridgeService } from './race-outfitting-bridge.service';
import { PanelEventCoordinator } from '../../game/services/ui/panel-event-coordinator.service';
import { GameStateStore } from './game-state.store';
import { SpellIOCoordinator } from '../../game/services/spells/spell-io-coordinator.service';
import { CargoHoldService } from './cargo-hold.service';
import { CharacterProfileService } from './character-profile.service';
import { KeyBindingsService } from '../key-bindings.service';

export interface GameInitializationConfig {
  canvasWidth?: number;
  canvasHeight?: number;
  enableDebug?: boolean;
  maxFPS?: number;
  antialiasing?: boolean;
}

export interface InitializationResult {
  success: boolean;
  error?: string;
  webglVersion?: string;
  canvasInfo?: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
}

/**
 * Servicio para manejar la inicialización completa del juego
 */
@Injectable({
  providedIn: 'root'
})
export class GameInitializer {
  private isInitialized: boolean = false;
  private gameEngine: GameEngine | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private config: GameInitializationConfig = {};

  constructor(
    private webglService: WebGLService,
    private particleEffectsService: ParticleEffectsService,
    private injector: Injector,
    @Inject(PLATFORM_ID) private platformId: Object,
    private logger: LoggingService
  ) {}

  /**
   * Inicializa completamente el juego con un canvas
   */
  async initializeGame(
    canvasRef: ElementRef<HTMLCanvasElement>, 
    config: GameInitializationConfig = {}
  ): Promise<InitializationResult> {
    
    try {
      // Verificar que estamos en el navegador
      if (!isPlatformBrowser(this.platformId)) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_INITIALIZATION, 'Game initialization skipped - not in browser');
        return {
          success: false,
          error: 'SSR environment - game initialization skipped'
        };
      }

      // Guardar configuración
      this.config = { ...this.getDefaultConfig(), ...config };
      
      // Obtener canvas
      this.canvas = canvasRef.nativeElement;
      if (!this.canvas) {
        throw new Error('Canvas element not found');
      }

      // Configurar canvas
      this.setupCanvas();

      // Inicializar WebGL
      const webglResult = await this.initializeWebGL();
      if (!webglResult.success) {
        throw new Error(webglResult.error || 'WebGL initialization failed');
      }

    // Crear motor del juego con sistema de targeting completo
    const reticleManager = this.injector.get(ReticleManager);
    const targetCatalog = this.injector.get(TargetCatalogService);
    const targetDetails = this.injector.get(TargetDetailService);
    const asteroidClusterService = this.injector.get(AsteroidClusterService);
    const relationService = this.injector.get(RelationService);
    const animationManager = this.injector.get(AnimationManagerService);
    const adaptiveTargeting = this.injector.get(AdaptiveTargetingIntegrator);
    const audioEngine = this.injector.get(AudioEngineService);
    const musicDirector = this.injector.get(MusicDirectorService);
    const solarSystemService = this.injector.get(SolarSystemService);
  const humanSolarSystemService = this.injector.get(HumanSolarSystemService);
  const portalPersistenceService = this.injector.get(PortalPersistenceService);
  const portalRegistry = this.injector.get(PortalRegistryService);
  const runtimeSerializer = this.injector.get(SolarSystemRuntimeSerializerService);
    const panelEventCoordinator = this.injector.get(PanelEventCoordinator);
    const spellIOCoordinator = this.injector.get(SpellIOCoordinator);
    const gameStateStore = this.injector.get(GameStateStore);
    const cargoHoldService = this.injector.get(CargoHoldService);
    const characterProfileService = this.injector.get(CharacterProfileService);
    const keyBindings = this.injector.get(KeyBindingsService);
    this.gameEngine = new GameEngine(
      this.webglService,
      this.particleEffectsService,
      reticleManager,
      adaptiveTargeting,
      targetCatalog,
      targetDetails,
      asteroidClusterService,
      relationService,
      animationManager,
      this.logger,
      this.injector.get(CollisionManagerService),
      panelEventCoordinator,
      spellIOCoordinator,
      gameStateStore,
      cargoHoldService,
      characterProfileService,
      keyBindings,
      solarSystemService,
      humanSolarSystemService,
      portalPersistenceService,
      portalRegistry,
      runtimeSerializer,
      audioEngine,
      musicDirector,
      this.injector.get(MissionService)
    );

      // Las razas necesitan poder reacondicionar la nave desde los diálogos.
      this.injector.get(RaceOutfittingBridgeService).attachEngine(this.gameEngine);

      // Inicializar motor del juego
      await this.gameEngine.initialize(canvasRef);

      // Configurar eventos de redimensionado
      this.setupResizeHandlers();

      this.isInitialized = true;

      return {
        success: true,
        webglVersion: webglResult.webglVersion,
        canvasInfo: {
          width: this.canvas.width,
          height: this.canvas.height,
          devicePixelRatio: window.devicePixelRatio || 1
        }
      };

    } catch (error) {
      this.cleanup();
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown initialization error'
      };
    }
  }

  /**
   * Obtiene configuración por defecto
   */
  private getDefaultConfig(): GameInitializationConfig {
    return {
      canvasWidth: 800,
      canvasHeight: 600,
      enableDebug: false,
      maxFPS: 60,
      antialiasing: true
    };
  }

  /**
   * Configura las propiedades del canvas
   */
  private setupCanvas(): void {
    if (!this.canvas) return;

    // Establecer tamaño
    this.canvas.width = this.config.canvasWidth || 800;
    this.canvas.height = this.config.canvasHeight || 600;

    // Configurar estilos CSS
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.outline = 'none';

    // Hacer el canvas focusable para eventos de teclado
    if (!this.canvas.hasAttribute('tabindex')) {
      this.canvas.setAttribute('tabindex', '0');
    }

    this.logger.log(LogLevel.INFO, LogCategory.RENDER, 'Canvas configured', { width: this.canvas.width, height: this.canvas.height });
  }

  /**
   * Inicializa el contexto WebGL
   */
  private async initializeWebGL(): Promise<{ success: boolean; error?: string; webglVersion?: string }> {
    if (!this.canvas) {
      return { success: false, error: 'Canvas not available' };
    }

    try {
      const canvasRef = { nativeElement: this.canvas };
      const success = await this.webglService.initialize(canvasRef, {
        antialias: this.config.antialiasing || true,
        alpha: false,
        depth: true,
        powerPreference: 'high-performance'
      });
      
      if (!success) {
        return { success: false, error: 'Failed to create WebGL context' };
      }

      // Verificar capacidades WebGL
      const gl = this.webglService.getContext();
      if (!gl) {
        return { success: false, error: 'WebGL context is null' };
      }

      return { 
        success: true, 
        webglVersion: this.webglService.getWebGLVersion() 
      };

    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'WebGL initialization error' 
      };
    }
  }

  /**
   * Configura manejadores de redimensionado
   */
  private setupResizeHandlers(): void {
    const handleResize = () => {
      if (this.canvas && this.gameEngine) {
        // Actualizar canvas size si es necesario
        this.updateCanvasSize();
        
        // El GameEngine no tiene handleResize, pero WebGL se actualiza automáticamente
      }
    };

    // Escuchar cambios de tamaño de ventana
    window.addEventListener('resize', handleResize);
    
    // Limpiar evento al destruir
    // Nota: En un componente real, esto debería manejarse en ngOnDestroy
  }

  /**
   * Actualiza el tamaño del canvas si es necesario
   */
  private updateCanvasSize(): void {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;

    const displayWidth = Math.floor(rect.width * devicePixelRatio);
    const displayHeight = Math.floor(rect.height * devicePixelRatio);

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;

      // Actualizar viewport de WebGL
      const gl = this.webglService.getContext();
      if (gl) {
        gl.viewport(0, 0, displayWidth, displayHeight);
      }

      this.logger.log(LogLevel.INFO, LogCategory.RENDER, 'Canvas resized', { width: displayWidth, height: displayHeight });
    }

    if (this.gameEngine) {
      this.gameEngine.applyCanvasResize({
        width: rect.width,
        height: rect.height,
        pixelWidth: displayWidth,
        pixelHeight: displayHeight,
        devicePixelRatio
      });
    }
  }

  /**
   * Verifica si el juego está inicializado
   */
  isGameInitialized(): boolean {
    return this.isInitialized && !!this.gameEngine;
  }

  /**
   * Obtiene referencia al motor del juego
   */
  getGameEngine(): GameEngine | null {
    return this.gameEngine;
  }

  /**
   * Obtiene referencia al canvas
   */
  getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  /**
   * Obtiene configuración actual
   */
  getConfig(): Readonly<GameInitializationConfig> {
    return { ...this.config };
  }

  /**
   * Obtiene información de diagnóstico
   */
  getDiagnosticInfo(): any {
    return {
      isInitialized: this.isInitialized,
      hasGameEngine: !!this.gameEngine,
      hasCanvas: !!this.canvas,
      canvasSize: this.canvas ? `${this.canvas.width}x${this.canvas.height}` : 'N/A',
      webglVersion: this.webglService.getWebGLVersion(),
      config: this.config
    };
  }

  /**
   * Reinicia la inicialización
   */
  async reinitialize(canvasRef: ElementRef<HTMLCanvasElement>, config?: GameInitializationConfig): Promise<InitializationResult> {
    this.cleanup();
    return await this.initializeGame(canvasRef, config);
  }

  /**
   * Limpia recursos
   */
  cleanup(): void {
    if (this.gameEngine) {
      // Parar el juego si está corriendo
      this.gameEngine.stop();
      this.gameEngine = null;
    }

    this.canvas = null;
    this.isInitialized = false;
    
    // Limpiar contexto WebGL si es necesario
    this.webglService.destroy();
  }
}