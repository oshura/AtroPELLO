import { ElementRef } from '@angular/core';
import { GameEngine } from '../GameEngine';
import { WebGLService } from '../../services/webgl.service';
import { ParticleEffectsService } from '../../services/particle-effects.service';
import { ReticleManager } from '../targeting';
import { AdaptiveTargetingIntegrator } from '../targeting/v2/AdaptiveTargetingIntegrator';
import { TargetCatalogService } from '../services/target-catalog.service';
import { TargetDetailService } from '../services/target-detail.service';
import { AsteroidClusterService } from '../services/game/asteroid-cluster.service';
import { RelationService } from '../../services/relation.service';
import { AnimationManagerService } from '../services/animations/animation-manager.service';
import { LoggingService } from '../../services/logging.service';
import { CollisionManagerService } from '../services/physics/collision-manager.service';
import { PanelEventCoordinator } from '../services/ui/panel-event-coordinator.service';
import { SpellIOCoordinator } from '../services/spells/spell-io-coordinator.service';
import { GameStateStore } from '../../services/game/game-state.store';
import { CargoHoldService } from '../../services/game/cargo-hold.service';
import { CharacterProfileService } from '../../services/game/character-profile.service';
import { KeyBindingsService } from '../../services/key-bindings.service';
import { SolarSystemService } from '../services/game/solar-system.service';
import { HumanSolarSystemService } from '../services/game/human-solar-system.service';
import { PortalPersistenceService } from '../services/game/portal-persistence.service';
import { PortalRegistryService } from '../services/game/portal-registry.service';
import { SolarSystemRuntimeSerializerService } from '../services/game/solar-system-runtime-serializer.service';
import { AudioEngineService } from '../../services/audio/audio-engine.service';
import { MusicDirectorService } from '../../services/audio/music-director.service';
import { PanelEventCallbacks } from '../services/ui/panel-event-coordinator.service';
import { CanvasResizeMetrics } from '../GameEngine';
import { IGameModeEngine, GameModeEvent, GameModeController } from './game-mode-engine.interface';
import { SharedGameContext } from './shared-game-context';
import { AtmosphereFlightModelService } from './physics/atmosphere-flight-model.service';

export interface SpaceGameEngineDependencies {
  webglService: WebGLService;
  particleEffectsService: ParticleEffectsService;
  reticleManager: ReticleManager;
  adaptiveTargeting: AdaptiveTargetingIntegrator;
  targetCatalog: TargetCatalogService;
  targetDetails: TargetDetailService;
  asteroidClusterService: AsteroidClusterService;
  relationService: RelationService;
  animationManager: AnimationManagerService;
  logger: LoggingService;
  collisionManager: CollisionManagerService;
  panelEventCoordinator: PanelEventCoordinator;
  spellIOCoordinator: SpellIOCoordinator;
  gameStateStore: GameStateStore;
  cargoHoldService: CargoHoldService;
  characterProfileService: CharacterProfileService;
  keyBindings: KeyBindingsService;
  atmospherePhysics: AtmosphereFlightModelService;
  solarSystemService: SolarSystemService;
  humanSolarSystemService: HumanSolarSystemService;
  portalPersistenceService: PortalPersistenceService;
  portalRegistry: PortalRegistryService;
  runtimeSerializer: SolarSystemRuntimeSerializerService;
  audioEngine: AudioEngineService;
  musicDirector: MusicDirectorService;
  modeController: GameModeController;
}

export class SpaceGameEngineAdapter implements IGameModeEngine {
  public readonly name = 'space';
  private engine: GameEngine | null = null;
  private externalRenderHostActive = false;

  constructor(private readonly deps: SpaceGameEngineDependencies) {}

  async initialize(
    canvasRef: ElementRef<HTMLCanvasElement>,
    sharedContext: SharedGameContext
  ): Promise<void> {
    if (!this.engine) {
      this.engine = new GameEngine(
        this.deps.webglService,
        this.deps.particleEffectsService,
        this.deps.reticleManager,
        this.deps.adaptiveTargeting,
        this.deps.targetCatalog,
        this.deps.targetDetails,
        this.deps.asteroidClusterService,
        this.deps.relationService,
        this.deps.animationManager,
        this.deps.logger,
        this.deps.collisionManager,
        this.deps.panelEventCoordinator,
        this.deps.spellIOCoordinator,
        this.deps.gameStateStore,
        this.deps.cargoHoldService,
        this.deps.characterProfileService,
        this.deps.keyBindings,
        this.deps.atmospherePhysics,
        this.deps.solarSystemService,
        this.deps.humanSolarSystemService,
        this.deps.portalPersistenceService,
        this.deps.portalRegistry,
        this.deps.runtimeSerializer,
        this.deps.audioEngine,
        this.deps.musicDirector
      );
      this.engine.setModeController(this.deps.modeController ?? null);
    }

    await this.engine.initialize(canvasRef);

    if (sharedContext) {
      sharedContext.hudManager = this.engine?.hudManager ?? sharedContext.hudManager ?? null;
      sharedContext.shaderManager = this.engine?.shaderManager ?? sharedContext.shaderManager ?? null;
      sharedContext.textureManager = this.engine?.textureManager ?? sharedContext.textureManager ?? null;
      sharedContext.gameEngine = this.engine;
    }
  }

  startLoop(): void {
    if (!this.engine) {
      return;
    }
    this.engine.setRenderDelegated(false, 'space-mode:startLoop');
    if (!this.engine.isLoopRunning()) {
      this.engine.start();
    }
    this.externalRenderHostActive = false;
  }

  stop(): void {
    if (!this.engine) {
      return;
    }
    if (this.engine.isRenderDelegated()) {
      this.engine.setRenderDelegated(false, 'space-mode:stop');
    }
    this.externalRenderHostActive = false;
    this.engine.stop();
  }

  applyCanvasResize(detail: CanvasResizeMetrics): void {
    this.engine?.applyCanvasResize(detail);
  }

  setInputHandlers(_: PanelEventCallbacks): void {
    // El GameEngine actual gestiona los callbacks directamente; no se requiere wiring adicional.
  }

  handleGameEvent(event: GameModeEvent): void {
    // El modo espacial todavía no necesita eventos personalizados.
    if (event?.type === 'landing:fade-out-complete') {
      // Placeholder para futuras integraciones.
    }
  }

  getEngineInstance(): GameEngine | null {
    return this.engine;
  }

  enterExternalRenderHostMode(origin: string = 'mode-switch:atmosphere'): void {
    if (!this.engine) {
      return;
    }
    if (!this.engine.isLoopRunning()) {
      this.engine.start();
    }
    this.engine.setRenderDelegated(true, origin);
    this.externalRenderHostActive = true;
  }

  exitExternalRenderHostMode(origin: string = 'mode-switch:space'): void {
    if (!this.engine) {
      return;
    }
    if (this.engine.isRenderDelegated()) {
      this.engine.setRenderDelegated(false, origin);
    }
    this.externalRenderHostActive = false;
  }
}
