import { Injectable } from '@angular/core';
import { AudioEngineService } from '../services/audio/audio-engine.service';
import { MusicDirectorService, MusicScene } from '../services/audio/music-director.service';
import { WebGLService } from '../services/webgl.service';
import { ParticleEffectsService, WeatherPrecipitationConfig } from '../services/particle-effects.service';
import { GameObject } from './GameObject';
import { LesserBeingBase } from './game-objects/lesser-beings/lesser-being-base';
// Import all GameObjects from centralized barrel export
import {
  Spaceship, ThrusterState,
  Asteroid, SuperAsteroid, MegaAsteroid,
  createTardisCompanion,
  SpaceTurtleObject,
  Planet, PlanetColorName, PlanetType, DwarfPlanet, Protoplanet,
  GaseousPlanet, GiantPlanet, RingedPlanet, EarthSplitPlanet,
  Sun, Portal,
  GameObjectType
} from './game-objects';
import { Camera, CameraMode } from './Camera';
import { ShaderManager } from './ShaderManager';
import { SolarSystemService } from './services/game/solar-system.service';
import { HumanSolarSystemService } from './services/game/human-solar-system.service';
import { PortalPersistenceService } from './services/game/portal-persistence.service';
import { PortalRegistryService } from './services/game/portal-registry.service';
import { SolarSystemRuntimeSerializerService } from './services/game/solar-system-runtime-serializer.service';
import { applyPlanetSnapshotFields, defaultColorForKind, normalizePlanetKind } from './services/game/planet-state.codec';
import { EARTH_PLANET_ID, RINGED_PLANET_ID, isRingedPlanet } from './game-objects/planet-classification';
import { LandingPanelController, LandingPanelHost } from './services/state/landing-panel-controller';
import { AtmosphereAutoLandingCamera, AtmosphereAutoLandingCameraHost } from './services/state/atmosphere-auto-landing-camera';
import { LandingCameraHold, LandingCameraHoldHost } from './services/state/landing-camera-hold';
import { AtmosphereAutoLandingLock, AtmosphereAutoLandingLockHost } from './services/state/atmosphere-auto-landing-lock';
import { AtmosphereAutoTakeoff, AtmosphereAutoTakeoffHost } from './services/state/atmosphere-auto-takeoff';
import { SuppressionWindow } from './services/state/suppression-window';
import { TardisCompanionSystem, TardisCompanionHost } from './services/state/tardis-companion-system';
import { SpaceTurtleSystem, SpaceTurtleHost } from './services/state/space-turtle-system';
import { SpaceStationSystem, SpaceStationHost } from './services/state/space-station-system';
import { DockPort } from './game-objects/stations/dock-port';
import { StationRenderer, StationRenderHost } from './rendering/StationRenderer';
import { createPortalFromSnapshot } from './services/game/portal-state.codec';
import { captureLesserBeingSnapshot, cloneLesserBeingSnapshot } from './services/game/lesser-being-state.codec';
import { resolveSnapshotId, resolveSystemId, resolveSystemKey } from './services/game/system-identity';
import { PORTAL_SNAPSHOT_LABELS } from './constants/portal-snapshot-labels';
import { TextureManager } from './TextureManager';
import { HUDManager } from './hud/HUDManager';
import { FlightVectorReticleState } from './hud/elements/FlightVectorReticle';
import { FlightVectorReticleBuilder, FlightVectorReticleHost } from './hud/elements/flight-vector-reticle-builder';
import { ReticleManager } from './targeting';
import { AdaptiveTargetingIntegrator } from './targeting/v2/AdaptiveTargetingIntegrator';
import { collectWorldOccluders } from './targeting/v2/targeting-occluders';
import { AsteroidClusterService } from './services/game/asteroid-cluster.service';
import { TargetCatalogService } from './services/target-catalog.service';
import { AnimationManagerService } from './services/animations/animation-manager.service';
import { RelationService } from '../services/relation.service';
// Integration test removed; manual hook no longer available
import { TargetDetailService } from './services/target-detail.service';
import { TargetPreviewRenderer } from './hud/TargetPreviewRenderer';
import { SolarSystemPanel } from './hud/SolarSystemPanel';
import { GrimoirePanel } from './hud/GrimoirePanel';
import { InventoryPanel } from './hud/InventoryPanel';
import { PanelCursorOverlay } from './hud/utils/panel-cursor-overlay';
import { FlightVectorReticleOverlay } from './hud/utils/flight-vector-reticle-overlay';
import { SpellType, SpellState, getSpellSanityCost } from './types/spell.types';
import { RespawnAnchorMetadata } from './types/respawn.types';
import { GameStartContext, PlayerResetState } from './types/universe-state.types';
import { ScreenOverlayRenderer } from './rendering/ScreenOverlayRenderer';
import { InstancedAsteroidRenderer } from './rendering/InstancedAsteroidRenderer';
import { PlanetSurfaceRenderer } from './rendering/PlanetSurfaceRenderer';
import { PlanetRingRenderer } from './rendering/PlanetRingRenderer';
import { ShipRenderer } from './rendering/ship/ShipRenderer';
import { TargetOutline2DRenderer } from './hud/TargetOutline2DRenderer';
import { LoggingService, LogCategory, LogLevel } from '../services/logging.service';
import { CollisionResponseService } from './services/physics/collision-response.service';
import { CollisionManagerService } from './services/physics/collision-manager.service';
import { ShipCollisionSystem, ShipCollisionHost } from './services/physics/collision/ship-collision-system';
import { PanelEventCoordinator } from './services/ui/panel-event-coordinator.service';
import { SpellIOCoordinator } from './services/spells/spell-io-coordinator.service';
import { GameStateStore } from '../services/game/game-state.store';
import { CargoHoldService } from '../services/game/cargo-hold.service';
import { CharacterProfileService, ExperienceEventType } from '../services/game/character-profile.service';
import { KeyBindingsService, GameAction } from '../services/key-bindings.service';
// Snapshot types for system swapping
import { SolarSystemSnapshot, PortalSnapshot } from './types/solar-system.types';
import { TargetType, ITargetable } from './types/targeting.types';
import { getSpecificDisplayLabel, targetTypeToGameObjectType } from './types/game-object.types';
import {
  InventorySelection,
  InventoryPanelRegion,
  InventoryActionType
} from './types/inventory.types';
import { buildInventorySnapshot as composeInventorySnapshot } from './hud/elements/inventory-snapshot-builder';
import { buildCompassCountdownPayload } from './hud/elements/compass-countdown-builder';
import { LandingApproachContext, LandingPlanetIntel, LandingStatus, LandingThreatState } from './types/landing.types';
import {
  LESSER_BEING_LABELS,
  PLANET_INHABITANT_LABELS,
  LesserBeing,
  PlanetInhabitants,
  ElderGod,
  LesserBeingInstanceSnapshot,
  LesserBeingEncounterPlan,
} from './types/cosmic-life.types';
import { PLANET_INTEL_STATUS, PlanetMissionState } from './types/planet-intel.types';
import { GameObjectAnimosity } from './types/animosity.types';
import { AtmosphereTelemetryPanelState, AtmosphereTelemetryPayload, CompassCountdownPayload, HudMarqueeEventType } from './types/hud.types';
import { OrientationBasis, computeHeadingFromForward } from './targeting/compass-direction.util';
import { mat4 } from 'gl-matrix';

const PANEL_REOPEN_COOLDOWN_MS = 500;
import { Vector3 } from '../types/game.types';
import { LesserBeingController } from './services/lesser-beings/lesser-being-controller';
import { LesserBeingSpawner } from './services/lesser-beings/lesser-being-spawner';
import { LesserBeingCombatService } from './services/lesser-beings/lesser-being-combat.service';
import {
  AtmosphereGroundPalette,
  AtmosphereRenderOptions,
  AtmosphereSceneActivationOptions,
  AtmosphereSceneManager,
  AtmosphereSceneState,
} from './atmosphere/AtmosphereSceneManager';
import { AtmosphereTextureFactory } from './atmosphere/AtmosphereTextureFactory';
import { AtmosphereWeatherService, AtmosphereWeatherSnapshot } from './atmosphere/AtmosphereWeatherService';
import { calculateAtmosphereAttitude } from './utils/atmosphere-attitude.util';
import {
  computeAtmosphereDetailFactor,
  sampleAtmosphereSurfaceRadius,
  sampleAtmosphereSurfaceRadiusAlongNormal,
  terrainSeedFromPlanetId,
} from './atmosphere/terrain-sampler';
import {
  clamp,
  lerpScalar,
  smoothStep01,
  vec3Length,
  vec3Dot,
  vec3Cross,
  vec3Normalize,
  randomPerpendicularVector,
} from './math/vector-math';
import {
  identityMatrix,
  translateMatrix,
  rotateXMatrix,
  rotateYMatrix,
  rotateZMatrix,
  scaleMatrixUniform,
} from './math/matrix-math';
import { PlayerProgressionSystem } from './services/state/player-progression-system';
import { SunProximitySystem } from './services/state/sun-proximity-system';
import { LandingEvaluator, LandingEvaluatorHost } from './services/state/landing-evaluator';
import { ShipLandingPositioner, ShipLandingHost, ShipKineticsSnapshot } from './services/state/ship-landing-positioner';
import {
  resolvePlanetCenterFromContext as computePlanetCenterFromContext,
  deriveLandingNormalFromContext as computeLandingNormalFromContext,
  resolveLandingContactPoint as computeLandingContactPoint,
  sampleLandingSurfaceContext,
} from './services/state/landing-geometry';
import { AnchoringPulseBeam, AnchoringPulseBeamHost } from './services/spells/anchoring-pulse-beam';
import { DisruptionBeam, DisruptionBeamHost } from './services/spells/disruption-beam';
import { VoidKinesisBeam, VoidKinesisBeamHost } from './services/spells/void-kinesis-beam';
import { SpeedRiteSystem, SpeedRiteHost, SpeedRiteBaseline, SPEED_RITE_DEFAULT_DURATION_MS } from './services/state/speed-rite-system';
import { ProjectileView } from './services/weapons/projectile-system';
import { screenPointToWorldRay, ScreenRay } from './math/screen-ray';
import { BeamRenderer } from './rendering/weapons/beam-renderer';
import { ShipOutfittingService, ShipOutfittingHost } from './services/state/ship-outfitting.service';
import { MouseFlightSystem, MouseFlightHost } from './services/input/mouse-flight-system';
import { ELDER_GOD_LABELS } from './types/cosmic-life.types';
import { GateTuningState } from './types/gate-tuning.types';
import { AracnidWarSystem, AracnidWarHost, ARACNID_STATION_XP } from './services/state/aracnid-war-system';
import { AracnidWebStation } from './game-objects/stations/aracnid-web-station';
import { AracnidFighterBeing } from './game-objects/lesser-beings/aracnid-fighter-being';
import { AracnidStationRenderer, AracnidStationRenderHost } from './rendering/aracnid-station-renderer';
import { PlanetDrainBeam, PlanetDrainBeamHost } from './services/spells/planet-drain-beam';
import { getPlanetPaletteDescriptor } from './config/planet-palette.config';
import { VoidCocoonShieldRenderer } from './rendering/spells/void-cocoon-shield-renderer';
import { renderTargetOutline2D } from './targeting/v2/target-outline-driver';
import { generateFallbackPlanetName, getDebrisColorForObjectType } from './utils/debris-colors';
import { MissionService } from './services/game/mission.service';
import { WeaponEngineBridge } from './services/weapons/weapon-engine-bridge';
import { DamageableLike } from './services/weapons/weapon-targets';
import { ShipOutfitState, WeaponId } from './types/weapon.types';
import { getPlanetTypeLabel, humanizeEnumValue, rgbToHex } from './utils/label-utils';
import {
  atmosphereForceAltitudeFactor,
  WEATHER_DRIFT_OFFSET_MAX,
  ATMOSPHERE_TURBULENCE_SHAKE_THRESHOLD,
  ATMOSPHERE_AUTO_VECTOR_BAND_MIN,
} from './atmosphere/atmosphere-physics';
import { AtmosphereFlightSystem, AtmosphereFlightHost } from './atmosphere/atmosphere-flight-system';
import { AtmosphereShakeSystem } from './atmosphere/atmosphere-shake-system';
import {
  AtmosphereWeatherEffectsSystem,
  AtmosphereWeatherEffectsState,
  AtmosphereWeatherEffectsHost,
} from './atmosphere/atmosphere-weather-effects-system';
import {
  buildAtmosphereTelemetryPayload,
  buildAtmosphereTelemetryPanelState,
} from './atmosphere/atmosphere-telemetry';
import {
  AgeProgressionOutcome,
  AgeProgressionSource,
  HardcoreDeathContext,
  HardcoreDeathSource,
  LandingDeathSource,
} from './types/progression.types';

interface AuxiliaryAbilityRuntime {
  id: string;
  label: string;
  description: string;
  activationKey: string;
  cooldownMs: number;
  lastUsedAtMs: number;
  handler: () => boolean;
}

interface PlanetCollapsePayload {
  planetId: string;
  position: Vector3;
  radius: number;
  clusterCount?: number;
}

interface LandingTouchdownOptions {
  /** Avoid reconfiguring the atmosphere scene when the ship already transitioned */
  skipAtmosphereScene?: boolean;
  /** Skip opening the landing panel (used while showcasing the atmosphere scene) */
  skipLandingPanel?: boolean;
  /** Defer landing panel display to allow the auto-landing FX to breathe */
  deferLandingPanelMs?: number;
}

interface CanvasResizeMetrics {
  width?: number;
  height?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  devicePixelRatio?: number;
}


// AtmosphereWeatherEffectsState se movió a atmosphere/atmosphere-weather-effects-system.ts (Fase 5.1).
interface AtmosphereExitTransitionCallbacks {
  onBlackout?: () => void;
  onComplete?: () => void;
}
interface AtmosphereExitTransitionState {
  active: boolean;
  stage: 'idle' | 'fade-out' | 'blackout' | 'fade-in';
  alpha: number;
  elapsedMs: number;
  fadeOutMs: number;
  fadeInMs: number;
  blackoutHoldMs: number;
  origin: 'auto' | 'manual';
  blackoutActionExecuted: boolean;
  callbacks: AtmosphereExitTransitionCallbacks;
}

interface AtmosphereCollisionContact {
  normal: Vector3;
  contactPoint: Vector3;
  surfaceRadius: number;
}

// AtmosphereGravitySample se movió a atmosphere/atmosphere-flight-system.ts (Fase 5.1).

// AtmosphereAutoVectorSample se movió a atmosphere/atmosphere-flight-system.ts (Fase 5.1).

interface AtmosphereImpactProbeState {
  id: number;
  startedAt: number;
  expiresAt: number;
  lastLoggedAt: number;
}

/**
 * Motor principal del juego que coordina todos los sistemas
 */
@Injectable({
  providedIn: 'root'
})
export class GameEngine {
  public gl: WebGL2RenderingContext | null = null;
  private isRunning: boolean = false;
  private lastFrameTime: number = 0;
  private rafHandle: number | null = null;
  private rafScheduleSerial: number = 0;
  
  // Sistemas principales
  public camera!: Camera;
  public shaderManager!: ShaderManager;
  public textureManager!: TextureManager;
  private particleEffects!: ParticleEffectsService;
  public hudManager!: HUDManager;
  private reticleManager!: ReticleManager;
  public adaptiveTargeting!: AdaptiveTargetingIntegrator;
  public asteroidClusterService!: AsteroidClusterService;
  public targetCatalog!: TargetCatalogService;
  private targetDetails!: TargetDetailService;
  private targetPreview!: TargetPreviewRenderer;
  private systemPanel: SolarSystemPanel | null = null;
  private grimoirePanel: GrimoirePanel | null = null;
  private inventoryPanel: InventoryPanel | null = null;
  private inventorySelection: InventorySelection | null = null;
  private inventoryHoverKey: string | null = null;
  public overlayRenderer: ScreenOverlayRenderer | null = null;
  private atmosphereEntryFadeRemainingMs: number = 0;
  private atmosphereExitTransition: AtmosphereExitTransitionState = this.createDefaultAtmosphereExitTransitionState();
  private atmosphereExitGlideDirection: Vector3 | null = null;
  private atmosphereExitSurfaceNormal: Vector3 | null = null;
  private atmosphereExitVoidEnergyPrevPaused: boolean | null = null;
  private targetOutline2D: TargetOutline2DRenderer | null = null;
  public voidJumpActive: boolean = false;
  public collisionsDisabled: boolean = false;
  private landingDamageSuppressed: boolean = false;
  public portalRenderer: any = null; // PortalRenderer instance
  private lesserBeingRenderer: any = null;
  private readonly lesserBeingBaseColor = new Float32Array([1, 1, 1]);
  // Runtime toggle to enable/disable the 2D outliner overlay for performance testing
  private outlinerEnabled: boolean = true;
  // Landing overlay removed
  private domCanvas: HTMLCanvasElement | null = null;
  private panelCursorOverlay: PanelCursorOverlay | null = null;
  private flightVectorOverlay: FlightVectorReticleOverlay | null = null;
  // Defers a map selection when the user clicks immediately after opening the map
  // before the id->target mapping has been rebuilt in the first render pass.
  private pendingMapSelectId: string | null = null;
  private canvasResizeHandler: EventListener | null = null;
  
  public debugSpawnLesserBeing(species: LesserBeing): void {
    if (!this.lesserBeingSpawner || !this.spaceship) {
      this.logger.log(LogLevel.WARN, LogCategory.LESSER_BEINGS, 'No se pudo spawnear lesser being de debug', {
        hasSpawner: !!this.lesserBeingSpawner,
        hasShip: !!this.spaceship,
        species
      });
      return;
    }
    const forward = this.getShipForwardVector();
    const pos = {
      x: this.spaceship.position.x + forward.x * 100,
      y: this.spaceship.position.y + forward.y * 100,
      z: this.spaceship.position.z + forward.z * 100
    };
    this.lesserBeingSpawner.spawnDebugBeing(species, pos);
  }
  private auxiliaryAbilities: AuxiliaryAbilityRuntime[] = [];
  private readonly auxiliaryBindingActions: GameAction[] = [
    'aux_ability_1',
    'aux_ability_2',
    'aux_ability_3',
    'aux_ability_4',
  ];
  private landingStatus: LandingStatus = { ready: false, context: null };
  private landingThreat: LandingThreatState = { active: false, reasons: [] };
  private readonly landingThreatSuppression = new SuppressionWindow();
  private landingSequenceActive: boolean = false;
  private landingSequenceContext: LandingApproachContext | null = null;
  private landingTouchdownContext: LandingApproachContext | null = null;
  private takeoffSequenceActive: boolean = false;
  private takeoffSequencePhase: 'ground' | 'atmo-exit' | null = null;
  // Estado de candidato + umbrales de aterrizaje movidos a LandingEvaluator (Fase 5.2).
  private readonly LANDING_APPROACH_ALERT_DISTANCE = 300;
  private readonly LANDING_APPROACH_RESET_DISTANCE = 380;
  private readonly ATMOSPHERE_POST_LANDING_IMPULSE = 3;
  private readonly ATMOSPHERE_ENTRY_FADE_MS = 1900;
  private readonly ATMOSPHERE_EXIT_SURFACE_OFFSET = 50;
  private readonly ATMOSPHERE_EXIT_REENTRY_SPEED = 5;
  private readonly ATMOSPHERE_GROUND_COLLISION_PADDING = 1;
  private readonly ATMOSPHERE_AUTO_LAND_VERTICAL_SPEED_MAX = 1;
  private readonly ATMOSPHERE_AUTO_LAND_PANEL_DELAY_MS = 2000;
  private readonly ATMOSPHERE_AUTO_LAND_CINEMATIC_PANEL_DELAY_MS = 11500;
  private readonly ATMOSPHERE_AUTO_LAND_THREAT_SUPPRESSION_WINDOW_MS = 9000;
  private readonly ATMOSPHERE_AUTO_LAND_THREAT_RECOVERY_MS = 2000;
  private readonly ATMOSPHERE_AUTO_LAND_COLLISION_GRACE_WINDOW_MS = 9000;
  private readonly ATMOSPHERE_AUTO_LAND_COLLISION_RECOVERY_MS = 1500;
  private readonly ATMOSPHERE_GROUND_RESTITUTION = 0.28;
  private readonly ATMOSPHERE_GROUND_TANGENT_DAMPING = 0.65;
  private readonly ATMOSPHERE_GROUND_MIN_REBOUND_SPEED = 0.75;
  private readonly ATMOSPHERE_GROUND_REBOUND_PADDING = 6;
  private readonly ATMOSPHERE_GROUND_DAMAGE_SPEED_MIN = 1;
  private readonly ATMOSPHERE_GROUND_DAMAGE_SPEED_MAX = 10;
  private readonly ATMOSPHERE_GROUND_DAMAGE_MIN = 1;
  private readonly ATMOSPHERE_GROUND_DAMAGE_MAX = 100;
  private readonly ATMOSPHERE_IMPACT_PROBE_DURATION_MS = 2000;
  private readonly ATMOSPHERE_IMPACT_PROBE_LOG_INTERVAL_MS = 120;
  private readonly SPACE_THRUSTER_CLIP = 'sfx_thruster';
  private readonly ATMOSPHERE_THRUSTER_CLIP = 'sfx_thruster_atmo';
  private landingApproachAnnouncements: Map<string, number> = new Map();
  private readonly GLYPH_SCAN_RANGE = 500;
  private readonly PORTAL_CONCORD_RANGE = 500;
  private readonly ATMOSPHERE_LOCKED_SPELLS: SpellType[] = [
    SpellType.LONGJUMP,
    SpellType.RESPAWN_SIGILLUM,
  ];
  private readonly atmosphereSpellStateBackup = new Map<SpellType, SpellState>();
  private readonly RESPAWN_VOID_ENERGY_PAUSE_MS = 1200; // give void energy a brief grace period after respawn
  private readonly HAZARD_EXIT_GAP_MS = 4500;
  private hazardLastDamageMs: Map<string, number> = new Map();
  private readonly hazardEntryReasons = new Set<string>(['sun-radiation', 'aura']);
  private bootMarqueePrimed = false;
  // Central logger
  public readonly logger: LoggingService;
  public _targetDetailsCache: Record<string, any> = {};
  private readonly atmosphereAutoLandingCamera = new AtmosphereAutoLandingCamera();
  private readonly atmosphereAutoLandingCameraHost: AtmosphereAutoLandingCameraHost = {
    getCamera: () => this.camera ?? null,
    getSpaceship: () => this.spaceship ?? null,
    getLandingContext: () => this.landingTouchdownContext,
    hasCinematicCameraHold: () => this.landingCameraHold.isActive,
    deriveLandingNormal: (ctx) => this.deriveLandingNormalFromContext(ctx),
    resolveContactPoint: (ctx) => this.resolveLandingContactPoint(ctx),
    buildPerpendicularGroundDirection: (n) => this.buildPerpendicularGroundDirection(n),
    spawnAutoLandingDust: (p) => {
      if (this.particleEffects) {
        this.particleEffects.createDestructionDebris(p, 0.8, { r: 0.72, g: 0.62, b: 0.5 });
      }
    },
    startAutoLandingCue: () => {
      if (this.audio) {
        this.startAtmosphereAutoLandingCue({ restart: false });
      }
    },
    stopAutoLandingCue: () => this.stopAtmosphereAutoLandingCue(),
  };
  private atmosphereLandingCinematicActive = false;
  private atmosphereLandingCinematicContext: LandingApproachContext | null = null;
  private readonly landingCameraHold = new LandingCameraHold();
  private readonly landingCameraHoldHost: LandingCameraHoldHost = {
    getCamera: () => this.camera ?? null,
    isPanelAwaitingUser: () => this.landingPanelController.isAwaitingUser,
    clearAutoLandingPending: () => this.atmosphereAutoLandingCamera.clearPending(),
    takeAutoLandingPending: () => this.atmosphereAutoLandingCamera.takePending(),
    startAutoLandingCamera: (ctx) => this.startAtmosphereAutoLandingCamera(ctx),
  };
  private readonly atmosphereCollisionGrace = new SuppressionWindow();
  
  // HUD health update throttle (update every 250ms instead of every frame)
  private lastHealthUpdateTime: number = 0;
  private healthUpdateInterval: number = 250; // ms
  
  // Audio
  private audio: AudioEngineService | null = null;
  private music: MusicDirectorService | null = null;
  private musicSceneBeforeAtmosphere: MusicScene | null = null;
  private atmosphereMusicSuppressed: boolean = false;
  private thrusterCtl: ReturnType<AudioEngineService['createThrusterController']> | null = null;
  private audioUnlocked: boolean = false;
  private deathInProgress: boolean = false; // Prevents audio updates during death fade-out
  private audioSilencedForPause: boolean = false;
  private desiredThrusterClip: string = this.SPACE_THRUSTER_CLIP;
  private currentThrusterClip: string = this.SPACE_THRUSTER_CLIP;
  // Doppler cues (near fly-bys)
  private dopplerEnabled: boolean = true;
  private dopplerCues: Map<string, { cue: ReturnType<AudioEngineService['createDopplerCue']>; started: number }>
    = new Map();
  private lastObjPos: Map<string, { x: number; y: number; z: number }> = new Map();
  private lastCamPos: { x: number; y: number; z: number } | null = null;
  private camVel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private dopplerSkip: boolean = false; // throttle doppler updates (every other frame)
  private hoverAudioMuted: boolean = false;
  private panelInputsLocked: boolean = false;
  private precisionHoldActive: boolean = false;
  private precisionLatchActive: boolean = false;
  private precastChantDurationMs: number | null = null;
  // Daño por proximidad solar extraído a SunProximitySystem (Fase 5).
  private sunProximity: SunProximitySystem | null = null;
  // Atmosphere scene management
  private atmosphereTextureFactory: AtmosphereTextureFactory | null = null;
  private atmosphereSceneManager: AtmosphereSceneManager | null = null;
  private atmosphereSceneState: AtmosphereSceneState = {
    active: false,
    context: null,
    center: { x: 0, y: 0, z: 0 },
    groundRadius: 0,
    skyRadius: 0,
    groundCollisionRadius: 0,
    groundColor: new Float32Array([0.32, 0.32, 0.32]),
    skyColor: new Float32Array([0.05, 0.08, 0.18]),
    groundPalette: this.createFallbackGroundPalette(),
    groundPaletteKey: 'atmo-ground-default',
    entryAltitude: 0,
    lastUpdatedMs: 0,
    terrainSeed: 0,
  };
  private atmosphereGroundContactActive: boolean = false;
  private readonly atmosphereAutoLandingLock = new AtmosphereAutoLandingLock();
  private readonly atmosphereAutoLandingLockHost: AtmosphereAutoLandingLockHost = {
    isAtmosphereSceneActive: () => this.isAtmosphereSceneActive(),
    hasSpaceship: () => !!this.spaceship,
    isTakeoffSequenceActive: () => this.takeoffSequenceActive,
    computeAltitudeAboveGround: () => this.computeAltitudeAboveGround(),
    logDebug: (msg, data) => this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, msg, data),
  };
  private readonly atmosphereAutoTakeoff = new AtmosphereAutoTakeoff();
  private readonly atmosphereAutoTakeoffHost: AtmosphereAutoTakeoffHost = {
    isAtmosphereSceneActive: () => this.isAtmosphereSceneActive(),
    isAtmosphereExitTransitionActive: () => this.isAtmosphereExitTransitionActive(),
    isLandingSequenceActive: () => this.landingSequenceActive,
    isTakeoffSequenceActive: () => this.takeoffSequenceActive,
    hasLandingTouchdownContext: () => !!this.landingTouchdownContext,
    computeAltitudeAboveGround: () => this.computeAltitudeAboveGround(),
    startAtmosphereExitSequence: (origin) => this.startAtmosphereExitSequence(origin),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
    logWarn: (msg, data) => this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, msg, data),
  };
  private atmosphereWeather: AtmosphereWeatherService | null = null;
  private atmosphereWeatherSnapshot: AtmosphereWeatherSnapshot | null = null;
  private readonly weatherEffectsSystem = new AtmosphereWeatherEffectsSystem();
  private readonly weatherEffectsHost: AtmosphereWeatherEffectsHost = {
    isAtmosphereSceneActive: () => this.isAtmosphereSceneActive(),
    emitImpactAbsorptionWarning: () => this.emitImpactAbsorptionWarning(),
  };
  private readonly atmosphereFlight = new AtmosphereFlightSystem();
  private readonly atmosphereShake = new AtmosphereShakeSystem();
  private readonly landingEvaluator = new LandingEvaluator();
  private readonly landingEvaluatorHost: LandingEvaluatorHost = {
    getSpaceship: () => this.spaceship ?? null,
    getPlanets: () => this.gameState.planets,
    isAtmosphereSceneActive: () => this.isAtmosphereSceneActive(),
    getAtmosphereContext: () => this.atmosphereSceneState.context ?? null,
    getAtmosphereGroundRadius: () => this.atmosphereSceneState.groundRadius,
    computeAltitudeAboveGround: () => this.computeAltitudeAboveGround(),
    deriveLandingNormalFromContext: (ctx) => this.deriveLandingNormalFromContext(ctx),
    resolvePlanetCenterFromContext: (ctx) => this.resolvePlanetCenterFromContext(ctx),
    resolveLandingContactPoint: (ctx) => this.resolveLandingContactPoint(ctx),
    onThreatCheckFailed: (e) => this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'Landing threat proximity check failed', e),
  };
  private readonly shipLandingPositioner = new ShipLandingPositioner();
  private readonly shipLandingHost: ShipLandingHost = {
    getSpaceship: () => this.spaceship ?? null,
    setLastShipPos: (pos) => { this.lastShipPos = pos; },
  };
  private readonly atmosphereFlightHost: AtmosphereFlightHost = {
    getSpaceship: () => this.spaceship ?? null,
    getCamera: () => this.camera ?? null,
    getWeatherEffects: () => this.weatherEffectsSystem.effects,
    isAtmosphereSceneActive: () => this.isAtmosphereSceneActive(),
    isAtmosphereLandingCinematicShieldActive: () => this.isAtmosphereLandingCinematicShieldActive(),
    isLandingCinematicCameraHoldActive: () => this.landingCameraHold.isActive,
    getAtmosphereStabilityForceScale: () => this.getAtmosphereStabilityForceScale(),
    computeAltitudeAboveGround: () => this.computeAltitudeAboveGround(),
    computeAtmosphereUpVector: () => this.computeAtmosphereUpVector(),
    getNowMs: () => this.getNowMs(),
    isAtmosphereStabilityActive: () => this.isAtmosphereStabilityActive(),
    isAtmosphereSceneStateActive: () => this.atmosphereSceneState.active,
    getAtmosphereGroundContactActive: () => this.atmosphereGroundContactActive,
    getAtmosphereGravityContext: () => {
      const s = this.atmosphereSceneState;
      if (!s.active || !s.context) {
        return null;
      }
      return { center: s.center, groundRadius: s.groundRadius, skyRadius: s.skyRadius, planetType: s.context.planetType };
    },
    isAtmosphereGravityLandingHold: () => !!(this.landingPanelController.isAwaitingUser && this.landingTouchdownContext && !this.takeoffSequenceActive),
  };
  private atmosphereFogEnabled: boolean = true;
  private atmosphereCloudsEnabled: boolean = true;
  private atmosphereWireframeEnabled: boolean = false;
  // Auto-vector/deriva/drag movidos a AtmosphereFlightSystem (Fase 5.1).
  private atmosphereTelemetrySnapshot: AtmosphereTelemetryPayload | null = null;
  private atmosphereTelemetryLastStability: AtmosphereTelemetryPayload['stability'] | null = null;
  private atmosphereTelemetryLastLogMs = 0;
  private atmosphereTelemetryPanelState: AtmosphereTelemetryPanelState | null = null;
  // atmosphereGravityTelemetry vive ahora en AtmosphereFlightSystem (Fase 5.1).
  private atmosphereImpactProbeState: AtmosphereImpactProbeState | null = null;
  private atmosphereImpactProbeSerial = 0;
  // Auto-vector/deriva/turbulencia/jitter/shake/drag movidos a AtmosphereFlightSystem (Fase 5.1).
  private atmosphereManualStabilityUntilMs = 0;
  // weatherOverlay*/atmosphereImpactAbsorptionActive viven ahora en weatherEffectsSystem (Fase 5.1).
  // Rayo/relámpago atmosférico ELIMINADO (no era prioritario; se rehará distinto otro día).
  private atmosphereReadabilityOverlayEnabled = true;
  // Atmosphere audio SFX
  private atmosphereAirRushHandle: ReturnType<AudioEngineService['play']> | null = null;
  private atmosphereStallHandle: ReturnType<AudioEngineService['play']> | null = null;
  private atmosphereAutoLandingCueHandle: ReturnType<AudioEngineService['play']> | null = null;
  private weatherAudioHandle: ReturnType<AudioEngineService['play']> | null = null;
  private weatherAudioCue: string | null = null;
  private stallWarningSuppressedUntilTakeoff: boolean = false;
  private readonly landingPanelController = new LandingPanelController();
  private readonly landingPanelHost: LandingPanelHost = {
    openPanelUI: (context) => {
      const gameComponent = (globalThis as any).GameComponentInstance;
      if (gameComponent && typeof gameComponent.openLandingPanel === 'function') {
        gameComponent.openLandingPanel(context);
        return true;
      }
      return false;
    },
    forceClosePanelUI: (reason) => {
      try {
        const gameComponent = (globalThis as any).GameComponentInstance;
        if (!gameComponent) return;
        if (typeof gameComponent.forceCloseLandingPanel === 'function') {
          gameComponent.forceCloseLandingPanel(reason);
        } else if (typeof gameComponent.onLandingStay === 'function') {
          gameComponent.onLandingStay();
        }
      } catch (error) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to close landing panel after collapse', { reason, error });
      }
    },
    playLandingPanelAir: () => {
      if (!this.audio || !this.audioUnlocked) return null;
      this.stopAtmosphereAudio();
      if (!this.audio.has('sfx_passby_air')) return null;
      try {
        return this.audio.play('sfx_passby_air', { bus: 'sfx', volume: 0.2, loop: true, fadeInMs: 120 });
      } catch {
        return null;
      }
    },
    releaseLandingCinematicCameraHold: (reason) => this.releaseLandingCinematicCameraHold(reason),
    isLandingCameraHoldDeferredForTakeoff: () => this.landingCameraHold.isDeferredForTakeoff,
    logWarn: (message, data) => this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, message, data),
  };
  // WEATHER_DRIFT_OFFSET_MAX se movió a atmosphere/atmosphere-physics (compartido, Fase 5.1).
  private readonly ZERO_VECTOR: Vector3 = { x: 0, y: 0, z: 0 };
  // Constantes de auto-vector/deriva/drag/jitter/shake movidas a AtmosphereFlightSystem (Fase 5.1).
  // BAND_MIN, TURBULENCE_SHAKE_THRESHOLD y AUTO_VECTOR_SPEED_* (compartidas) viven en atmosphere-physics.
  // ATMOSPHERE_IMPACT_ABSORPTION_THRESHOLD se movió a atmosphere-weather-effects-system (Fase 5.1).
  private readonly ATMOSPHERE_AUTO_VECTOR_IMPACT_SUPPRESS_MS = 1400;
  private readonly ATMOSPHERE_STABILITY_DURATION_MS = 6000;
  private readonly ATMOSPHERE_STABILITY_FORCE_SCALE = 0.2;
  // Progresión del piloto (envejecimiento/supervivencia) extraída a PlayerProgressionSystem (Fase 5.6).
  private playerProgression: PlayerProgressionSystem | null = null;

  // Objetos del juego - MIGRATED TO GameStateStore
  // Acceso via this.gameState.spaceship, this.gameState.independentAsteroids, etc.
  public spaceship!: Spaceship; // Referencia pública para acceso externo
  
  // Asteroides efímeros (spawn aleatorio cerca de la nave)
  private ephemeralAsteroids: Asteroid[] = [];
  private ephemeralSpawnCounter: number = 0;
  private nextEphemeralCheckMs: number = 0; // próxima comprobación de spawn (cada 10s)
  
  // Debris asociados a un planeta (e.g., anillo de mega-asteroides de la Tierra dividida)
  public planetDebris: Map<string, Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }>> = new Map();
  // Compañera TARDIS (orbita la Tierra como un megaasteroide; huye al acercarse la nave). Lógica FUERA del engine.
  private readonly tardisCompanionSystem = new TardisCompanionSystem();
  private readonly tardisCompanionHost: TardisCompanionHost = {
    getShipPosition: () => this.spaceship ? this.spaceship.position : null,
    spawnVanishFlash: (pos) => { try { this.particleEffects?.createDestructionDebris(pos, 1.6, { r: 0.7, g: 0.95, b: 1.0 }); } catch {} },
    playVanishCue: () => { try { this.audio?.play('sfx_whoosh', { bus: 'sfx', volume: 0.5 }); } catch {} },
    destroyCompanion: (obj) => { try { this.destroyObject(obj); } catch {} },
    addCargoEntry: (entry) => { try { this.gameState.upsertCargoEntry(entry); } catch {} },
    emitMarquee: (text) => { try { this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, text); } catch {} },
    log: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };
  // Tortuga estelar neutral que cruza el sistema (entra → atraviesa el sol → sale → desaparece). Lógica FUERA del engine.
  private readonly spaceTurtleSystem = new SpaceTurtleSystem();
  private renderedTurtle: SpaceTurtleObject | null = null;
  private readonly spaceTurtleHost: SpaceTurtleHost = {
    getSunPosition: () => this.gameState.sun ? { ...this.gameState.sun.position } : null,
    getSystemRadius: () => {
      const sun = this.gameState.sun?.position;
      if (!sun) return 24000;
      // Linde = órbita del planeta más lejano (Plutón en la Tierra): la tortuga NO aparece más lejos que eso.
      let farthest = 6000;
      for (const p of this.gameState.planets) {
        if ((p as unknown) === this.gameState.sun) continue;
        const d = Math.hypot(p.position.x - sun.x, p.position.y - sun.y, p.position.z - sun.z);
        if (d > farthest) farthest = d;
      }
      const ship = this.spaceship?.position;
      const playerDist = ship ? Math.hypot(ship.x - sun.x, ship.y - sun.y, ship.z - sun.z) : 0;
      // Por delante del jugador (flyby) pero sin pasarse de la linde.
      return Math.min(farthest, Math.max(playerDist + 8000, 12000));
    },
    isReadyForSpawn: () => !!this.spaceship && !this.voidJumpActive &&
      this.resolveSystemId() !== 'human-system' && // nunca en el sistema solar de la Tierra, solo en otros
      (typeof this.animationManager?.getCurrentAnimation !== 'function' || this.animationManager.getCurrentAnimation() === null),
    randomUnitDirection: () => {
      // Sesgar la entrada hacia la dirección del jugador desde el sol → flyby garantizado de camino al sol.
      const sun = this.gameState.sun?.position;
      const ship = this.spaceship?.position;
      if (sun && ship) {
        const dx = ship.x - sun.x, dy = ship.y - sun.y, dz = ship.z - sun.z;
        const len = Math.hypot(dx, dy, dz);
        if (len > 1) {
          const j = 0.06; // jitter pequeño → pasa cerca del jugador
          return {
            x: dx / len + (Math.random() * 2 - 1) * j,
            y: dy / len + (Math.random() * 2 - 1) * j * 0.6,
            z: dz / len + (Math.random() * 2 - 1) * j,
          };
        }
      }
      const phi = Math.random() * Math.PI * 2;
      const y = (Math.random() * 2 - 1) * 0.22;
      const r = Math.sqrt(Math.max(1e-4, 1 - y * y));
      return { x: r * Math.cos(phi), y, z: r * Math.sin(phi) };
    },
    rollD100: () => 1 + Math.floor(Math.random() * 100),
    spawnDust: (pos) => { try { this.particleEffects?.createDestructionDebris(pos, 0.7, { r: 0.75, g: 0.88, b: 1.0 }); } catch {} },
    announce: (text) => {
      try { this.showPlaceholderText(text, 3500); } catch {}
      try { this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, text); } catch {}
    },
    addCargoEntry: (entry) => { try { this.gameState.upsertCargoEntry(entry); } catch {} },
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };
  private registeredTurtleId: string | null = null;
  private turtleKilledByBeing = false; // true si la tortuga muere por un ser menor (sin botín para el jugador)

  // Estación espacial humana: landmark fijo del sistema humano (toroide + puertos de acople). Lógica FUERA del engine.
  private readonly spaceStationSystem = new SpaceStationSystem();
  // Render de la estación extraído a StationRenderer (regla #1); el motor solo delega.
  private readonly stationRenderer = new StationRenderer();
  private readonly stationRenderHost: StationRenderHost = {
    getGl: () => this.gl,
    getShaderManager: () => this.shaderManager,
    getCamera: () => this.camera,
    getStationSystem: () => this.spaceStationSystem,
    getTextureManager: () => this.textureManager ?? null,
    getLightDirection: () => this.lightDirection,
    getLightColor: () => this.lightColor,
    getAmbientColor: () => this.ambientColor,
    getAmbientStrength: () => this.ambientStrength,
  };
  private stationDockCandidate: DockPort | null = null;
  private stationPanelOpen = false;
  private stationDockedPort: DockPort | null = null;
  // Modo de cámara previo al atraque (se restaura al despegar; se mantiene la cámara cinemática mientras está acoplada).
  private stationDockPrevCamMode: CameraMode | null = null;
  // Atraque/separación en curso (cinemática DockingSequenceAnimation vía AnimationManager). docs/ESTACIONES.md §3.
  private stationDockingActive = false;
  private readonly spaceStationHost: SpaceStationHost = {
    getShipPosition: () => this.spaceship ? { ...this.spaceship.position } : null,
    getEarthPosition: () => {
      const earth = this.gameState.findPlanetById(EARTH_PLANET_ID);
      return earth ? { ...earth.position } : null;
    },
    isHumanSystem: () => this.resolveSystemId() === 'human-system',
    isBusy: () => !this.spaceship || this.voidJumpActive ||
      (typeof this.animationManager?.getCurrentAnimation === 'function' && this.animationManager.getCurrentAnimation() !== null),
    onDockReady: (port) => {
      this.stationDockCandidate = port;
    },
    showDockHint: (text) => {
      try { this.showPlaceholderText(text, 2400); } catch {}
    },
    getShipVelocity: () => this.spaceship ? this.spaceship.velocity : null,
    isDockingBusy: () => this.stationPanelOpen || this.stationDockingActive,
    registerCollider: (def) => this.shipCollisionSystem.registerStructured(def),
    unregisterCollider: (id) => this.shipCollisionSystem.unregisterStructured(id),
    log: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  // ── Guerra arácnida (Fase 15): estaciones telaraña + hostilidad + oleadas de cazas ──
  private readonly aracnidWar = new AracnidWarSystem();
  private readonly aracnidStationRenderer = new AracnidStationRenderer();
  private readonly aracnidWarHost: AracnidWarHost = {
    isAracnidSystem: () => this.currentSnapshot?.meta?.['stationTheme'] === 'aracnida',
    getSystemTag: () => this.resolveSystemId(),
    getAracnidPlanetPositions: () =>
      this.gameState.planets
        .filter(p => p.inhabitants === PlanetInhabitants.ARACNIDOS)
        .map(p => ({ ...p.position })),
    getShipPosition: () => this.spaceship ? { ...this.spaceship.position } : null,
    getShipVelocity: () => this.spaceship ? this.spaceship.velocity : null,
    isBusy: () => !this.spaceship || this.voidJumpActive ||
      (typeof this.animationManager?.getCurrentAnimation === 'function' && this.animationManager.getCurrentAnimation() !== null),
    hasStoryFlag: (flag) => this.gameState.hasStoryFlag(flag),
    markStoryFlag: (flag) => this.gameState.markStoryFlag(flag),
    isHostile: () => this.gameState.getRaceStanding(PlanetInhabitants.ARACNIDOS).standing === 'hostile',
    declareHostility: () => this.declareRaceHostility(PlanetInhabitants.ARACNIDOS, 'LOS TEJEDORES TE DECLARAN ENEMIGO'),
    registerStation: (station) => {
      this.registerDestructionCallback(station);
      const shapes = station.getStructuredShapesLocal();
      if (shapes.length) {
        this.shipCollisionSystem.registerStructured({
          id: station.id,
          source: station,
          shapesLocal: shapes,
          objectType: GameObjectType.SPACE_STATION,
        });
      }
    },
    unregisterStationCollider: (id) => this.shipCollisionSystem.unregisterStructured(id),
    spawnFighter: (homeStationId, position) => {
      const fighter = new AracnidFighterBeing(homeStationId, { position });
      try {
        this.registerLesserBeing(fighter);
        return fighter;
      } catch (error) {
        this.logger.log(LogLevel.WARN, LogCategory.LESSER_BEINGS, 'No se pudo desplegar el caza arácnido', { error });
        return null;
      }
    },
    fireNeedle: (fighter, direction) => this.lesserBeingCombat?.fireAcidSpit(fighter, direction),
    registerStationKillForMissions: () => {
      const mission = this.missionService?.registerExterminationEvent(String(PlanetInhabitants.ARACNIDOS), 'station');
      if (mission?.status === 'ready-to-turn-in') {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.MISSION, this.exterminationReadyNotice(mission));
      } else if (mission?.exterminationTarget) {
        const t = mission.exterminationTarget;
        this.hudManager?.emitMarqueeEvent?.(
          HudMarqueeEventType.MISSION,
          `EXTERMINIO: ${t.planetsDestroyed}/${t.planetsRequired} MUNDOS · ${t.stationsDestroyed}/${t.stationsRequired} TELARES`
        );
      }
    },
    awardStationXp: () => {
      const gain = this.characterProfileService?.awardExperience(ARACNID_STATION_XP, 'aracnid-station');
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.LESSER_BEING, `Telar destruido: +${ARACNID_STATION_XP} XP`);
      if (gain?.leveledUp) {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, `NIVEL ${gain.level} ALCANZADO`);
      }
    },
    emitNotice: (text) => this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, text),
    log: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };
  private readonly aracnidStationRenderHost: AracnidStationRenderHost = {
    getGl: () => this.gl,
    getShaderManager: () => this.shaderManager,
    getCamera: () => this.camera,
    getStations: () => this.aracnidWar.getStations(),
    getSacs: () => this.aracnidWar.getSacs(),
    getLightDirection: () => this.lightDirection,
    getLightColor: () => this.lightColor,
    getAmbientColor: () => this.ambientColor,
    getAmbientStrength: () => this.ambientStrength,
  };
  // Track last applied snapshot id (debug)
  private lastAppliedSnapshotId: string | null = null;
  // Current active solar system snapshot (para acceder a configuración de debris efímero)
  private currentSnapshot: SolarSystemSnapshot | null = null;
  private currentSnapshotLabel: string | null = null;
  // Runtime portal traversal state
  private portalTraversalCooldownSec: number = 0; // prevents rapid re-entry
  private portalPrevDistances: Map<string, number> = new Map();
  // Previous ship position (for segment-plane intersection tests)
  private lastShipPos: { x: number; y: number; z: number } | null = null;
  private collapseClusterSerial: number = 0;
  // Collision damage cooldown tracking (object id -> next allowed timestamp ms)
  private collisionDamageCooldown: Map<string, number> = new Map();
  // Impact camera effect (red vignette) 0..1
  private impactVignetteLevel: number = 0;
  private _lastIndependentLogTime: number = 0; // Throttle para logs de asteroides independientes

  // Colisiones nave↔mundo extraídas a sistema externo (Fase 11 R2, docs/COLISIONES.md)
  private shipCollisionSystem!: ShipCollisionSystem;
  private readonly shipCollisionHost: ShipCollisionHost = {
    getShip: () => this.spaceship ?? null,
    isSuppressed: () => this.collisionsDisabled || this.isLandingDamageSuppressed() || this.isAtmosphereCollisionGraceActive(),
    getClusters: () => this.asteroidClusterService.getClusters(),
    getClusterExtentRadius: (c) => this.asteroidClusterService.getClusterExtentRadius(c),
    getEphemeralAsteroids: () => this.ephemeralAsteroids,
    forEachPlanetDebris: (cb) => { for (const arr of this.planetDebris.values()) { for (const d of arr) cb(d.obj); } },
    getLesserBeings: () => this.lesserBeings,
    applyShipDamage: (amount, sourceId, reason, options) => this.applyShipDamage(amount, sourceId, reason, options),
    applyDamageToObject: (obj, dmg) => this.applyDamageToObject(obj, dmg),
    makeAsteroidIndependent: (obj) => this.makeAsteroidIndependent(obj),
    emitShipDamageMarquee: (text) => { try { this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SHIP_DAMAGE, text); } catch {} },
    addImpactVignette: (bump) => { this.impactVignetteLevel = Math.max(this.impactVignetteLevel, Math.min(1, this.impactVignetteLevel + bump)); },
    isAudioUnlocked: () => !!this.audio && this.audioUnlocked,
    hasSfx: (name) => !!this.audio?.has(name),
    playSfx: (name, volume) => { try { this.audio?.play(name, { bus: 'sfx', volume, fadeInMs: 0 }); } catch {} },
    getWeatherImpactVolumeScale: () => this.getWeatherImpactVolumeScale(),
    isStructuredSuppressed: () => this.stationPanelOpen || this.stationDockingActive,
  };

  private lesserBeings: LesserBeingBase[] = [];
  public lesserBeingController: LesserBeingController | null = null;
  private lesserBeingSpawner: LesserBeingSpawner | null = null;
  private lesserBeingCombat: LesserBeingCombatService | null = null;
  private pendingVoidJumpEncounter: LesserBeingEncounterPlan | null = null;
  private pendingVoidJumpEncounterEvaluated = false;

  // Landing minigame removed
  
  // Configuración del mundo
  private readonly ASTEROID_COUNT = 15;
  
  // Configuración de iluminación
  private lightDirection = new Float32Array([0.5, -0.8, 0.3]); // Luz desde arriba-derecha
  private lightColor = new Float32Array([1.0, 1.0, 0.9]);      // Luz blanca-amarillenta
  private ambientColor = new Float32Array([0.25, 0.25, 0.35]); // Ambiente más tenue para mayor contraste
  private ambientStrength = 0.25;
  
  // El efecto de propulsión ahora se maneja en ParticleEffectsService
  
  // Matrices auxiliares
  private normalMatrix = new Float32Array(16);
  private readonly flightVectorReticleBuilder = new FlightVectorReticleBuilder();
  private readonly flightVectorReticleHost: FlightVectorReticleHost = {
    isReady: () => !!this.spaceship && !!this.camera,
    getShipPosition: () => this.spaceship!.position,
    getShipForward: () => this.getShipForwardVector(),
    getShipSpeed: () => this.spaceship?.currentSpeed ?? 0,
    getShipWeaponsCount: () => this.weaponBridge.installedCount,
    getCameraViewMatrix: () => this.camera!.viewMatrix as unknown as mat4,
    getCameraProjectionMatrix: () => this.camera!.projectionMatrix as unknown as mat4,
    isCinematicAnimationRunning: () => typeof this.animationManager?.getCurrentAnimation === 'function'
      ? this.animationManager.getCurrentAnimation() !== null
      : false,
    isPrecisionRotationActive: () => this.isPrecisionRotationActive(),
  };
  // Feature flag: toggle instanced rendering for asteroids
  private readonly USE_INSTANCING = true;
  private instancedRenderer: InstancedAsteroidRenderer | null = null;
  private planetSurfaceRenderer: PlanetSurfaceRenderer | null = null;
  private planetRingRenderer: PlanetRingRenderer | null = null;
  private shipRenderer: ShipRenderer | null = null;
  // Tipos de target que NO deben ser descartados por culling distancia/frustum
  private readonly neverCullTypes = new Set([TargetType.PLANET]);
  private pendingWingDeploymentProgress: number | null = null;
  private pendingNoseAnchorProgress: number | null = null;
  // Simple ephemeral text overlay (e.g., "ANIMATION NUMBER X.")
  private _placeholderOverlay: { tex: WebGLTexture; w: number; h: number; until: number } | null = null;

  // Timed spell: Double Phased Time Rite (speed buff) — estado y lógica en SpeedRiteSystem
  private readonly speedRiteSystem = new SpeedRiteSystem();
  private readonly speedRiteHost: SpeedRiteHost = {
    getShip: () => this.spaceship ?? null,
    isDynamicsFrozen: () => this.takeoffSequenceActive || this.landingSequenceActive || this.isAtmosphereExitTransitionActive(),
    onBaselinePublished: (baseline) => this.gameState.setShipSpeedBaseline(baseline),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };
  private voidCocoonActiveUntilMs: number | null = null;
  private voidCocoonLastImpactMs: number = 0;
  private voidCocoonShieldStartMs: number = 0;
  private voidCocoonShieldRenderer: VoidCocoonShieldRenderer | null = null;
  private cachedSpeedRiteRemainingSec: number | null = null;

  // Material Disruption Rite beam animation
  private readonly disruptionBeam = new DisruptionBeam();
  private readonly disruptionBeamHost: DisruptionBeamHost = {
    getSpaceship: () => this.spaceship ?? null,
    isAsteroidTarget: (t) => this.isAsteroidTarget(t),
    applyDamageToObject: (t, d) => this.applyDamageToObject(t, d),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  // Anchoring Pulse tether beam state
  private readonly anchoringPulseBeam = new AnchoringPulseBeam();
  private readonly anchoringPulseBeamHost: AnchoringPulseBeamHost = {
    getSpaceship: () => this.spaceship ?? null,
    getTargetPosition: (t) => this.getTargetPosition(t),
    makeAsteroidIndependent: (t) => this.makeAsteroidIndependent(t),
    isAsteroidTarget: (t): t is Asteroid => this.isAsteroidTarget(t),
    convertAsteroidToCargo: (t) => this.convertAsteroidToCargo(t),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  // Armamento del jugador (Fase 12 — docs/ARMAS.md). El motor solo cablea: la lógica vive fuera.
  /** Última posición del cursor en vuelo (para armas dirigidas con el ratón). */
  private flightPointer: { x: number; y: number } | null = null;
  /** Vuelo por ratón (Fase 14): el maniobrador Mi-Go dirige pitch/yaw con el cursor. */
  private readonly mouseFlight = new MouseFlightSystem();
  /** Toggle del piloto (tecla `c`); el dispositivo además debe estar instalado en el outfit. */
  private mouseFlightUserEnabled = true;
  private readonly mouseFlightHost: MouseFlightHost = {
    isDeviceInstalled: () => this.weaponBridge.getOutfit().mouseFlight === true,
    isUserEnabled: () => this.mouseFlightUserEnabled,
    areFlightInputsLocked: () =>
      this.areSpellGameplayInputsLocked() || (this.panelEventCoordinator?.isAnyPanelActive() ?? false),
    getPointer: () => {
      const pointer = this.flightPointer;
      const canvas = this.gl?.canvas as HTMLCanvasElement | undefined;
      if (!pointer || !canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return { x: pointer.x - rect.left, y: pointer.y - rect.top };
    },
    getCanvasSize: () => {
      const canvas = this.gl?.canvas as HTMLCanvasElement | undefined;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    },
    applyAnalog: (pitch, yaw) => {
      if (this.spaceship) {
        this.spaceship.analogPitch = pitch;
        this.spaceship.analogYaw = yaw;
      }
    },
  };
  private beamRenderer: BeamRenderer | null = null;
  private readonly shipOutfitting = new ShipOutfittingService();
  private readonly flightPointerRay: ScreenRay = {
    origin: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
  };
  private readonly weaponBridge = new WeaponEngineBridge({
    getShip: () => this.spaceship ?? null,
    getShipForward: () => this.getShipForwardVector(),
    getLesserBeings: () => this.lesserBeings as unknown as DamageableLike[],
    getLooseTargets: () => [
      this.spaceTurtleSystem.getRenderable() ? [this.spaceTurtleSystem.getRenderable() as unknown as DamageableLike] : null,
      this.gameState.independentAsteroids as unknown as DamageableLike[],
      this.ephemeralAsteroids as unknown as DamageableLike[],
      this.aracnidWar.getStations() as unknown as DamageableLike[],
    ],
    getAsteroidClusters: () => this.asteroidClusterService.getClusters(),
    getMouseRay: () => this.resolveFlightPointerRay(),
    getSelectedTarget: () => {
      const target = this.adaptiveTargeting?.getCurrentTarget();
      const position = target ? this.getTargetPosition(target) : null;
      return target && position ? { id: target.id, position } : null;
    },
    applyObjectDamage: (target, damage) => this.applyDamageToObject(target, damage),
    applyShipDamage: (damage, sourceId, kind) => this.applyShipDamage(damage, sourceId, kind),
    logBeingImpact: (sourceId, kind, applied) => this.logLesserBeingImpact(sourceId, kind, applied),
    consumeVoidEnergy: (amount) => {
      const ship = this.spaceship;
      if (!ship || ship.voidEnergyCurrent < amount) return false;
      ship.voidEnergyCurrent = Math.max(0, ship.voidEnergyCurrent - amount);
      return true;
    },
    emitWarning: (message) => this.hudManager?.emitMarqueeEvent(HudMarqueeEventType.WARNING, message),
    playSfx: (clip) => { try { if (this.audio?.has(clip)) this.audio.play(clip, { bus: 'sfx', volume: 0.5 }); } catch {} },
    onOutfitChanged: (outfit) => {
      this.gameState.setShipOutfit(outfit);
      this.shipRenderer?.rebuild({ engineTier: outfit.engineTier, occupiedHardpoints: outfit.weapons.map(w => w.slotIndex) });
    },
    areInputsLocked: () => this.areSpellGameplayInputsLocked(),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
    logDebug: (msg, data) => this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, msg, data),
  });

  // Void Kinesis sobre PLANETAS (Fase 15): drena la void mass del mundo hasta hacerlo desaparecer.
  private readonly planetDrainBeam = new PlanetDrainBeam();
  private readonly planetDrainHost: PlanetDrainBeamHost = {
    getSpaceship: () => this.spaceship ?? null,
    isPlanetAlive: (planet) => planet.active && this.gameState.planets.some(p => p.id === planet.id),
    addVoidEnergy: (amount) => {
      const ship = this.spaceship;
      if (!ship || amount <= 0) return 0;
      const applied = Math.min(amount, Math.max(0, ship.voidEnergyMax - ship.voidEnergyCurrent));
      ship.voidEnergyCurrent += applied;
      return applied;
    },
    consumePlanet: (planet) => this.consumePlanetByDrain(planet),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  // Void Kinesis conduit beam state
  private readonly voidKinesisBeam = new VoidKinesisBeam();
  private readonly voidKinesisBeamHost: VoidKinesisBeamHost = {
    getSpaceship: () => this.spaceship ?? null,
    isAsteroidTarget: (t) => this.isAsteroidTarget(t),
    resolveConversion: (t) => this.resolveVoidKinesisConversion(t),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  constructor(
    private webglService: WebGLService,
    private particleEffectsService: ParticleEffectsService,
    private reticleManagerService: ReticleManager,
    private adaptiveTargetingService: AdaptiveTargetingIntegrator,
    private targetCatalogService: TargetCatalogService,
    private targetDetailService: TargetDetailService,
    asteroidClusterService: AsteroidClusterService,
    private relationService: RelationService,
    private animationManager: AnimationManagerService,
    loggingService: LoggingService,
    private collisionManager: CollisionManagerService,
    private panelEventCoordinator: PanelEventCoordinator,
    private spellIOCoordinator: SpellIOCoordinator,
    public gameState: GameStateStore,
    private cargoHoldService: CargoHoldService,
    private characterProfileService: CharacterProfileService,
    private keyBindings: KeyBindingsService,
  public solarSystemService?: SolarSystemService,
  public humanSolarSystemService?: HumanSolarSystemService,
  public portalPersistenceService?: PortalPersistenceService,
  public portalRegistry?: PortalRegistryService,
  public runtimeSerializer?: SolarSystemRuntimeSerializerService,
    audioEngine?: AudioEngineService,
    musicDirector?: MusicDirectorService,
    /** Misiones: el motor sólo le notifica cazas cumplidas (Fase 13). */
    private missionService?: MissionService
  ) {
    this.reticleManager = this.reticleManagerService;
    this.adaptiveTargeting = this.adaptiveTargetingService;
    this.targetCatalog = this.targetCatalogService;
    this.targetDetails = this.targetDetailService;
    this.targetPreview = new TargetPreviewRenderer(256, 192);
    this.asteroidClusterService = asteroidClusterService;
    // Optional audio wiring
    this.audio = audioEngine || null;
    this.music = musicDirector || null;
    // Logger
    this.logger = loggingService;
    this.shipCollisionSystem = new ShipCollisionSystem(this.gameState, this.collisionManager, this.logger);
    this.registerDefaultAuxiliaryAbilities();

    this.lesserBeingController = new LesserBeingController(this);
    this.lesserBeingSpawner = new LesserBeingSpawner(this);
    this.lesserBeingCombat = new LesserBeingCombatService(this, this.weaponBridge.projectileSystem);
    this.atmosphereWeather = new AtmosphereWeatherService();
  }

  /**
   * Detect crossing through the pentacle plane of an active portal (not its sphere) and
   * traverse to its linked destination system. We test segment-plane intersection between
   * lastShipPos→currentShipPos and the portal's local plane, then check if the hit point
   * lies within the portal disk (radius R).
   */
  private handlePortalTraversal(deltaTime: number): void {
    try {
      // Cooldown timer
      if (this.portalTraversalCooldownSec > 0) {
        this.portalTraversalCooldownSec = Math.max(0, this.portalTraversalCooldownSec - deltaTime);
      }
      if (!this.gameState.portals || this.gameState.portals.length === 0) return;
      const shipPos = this.spaceship.position;
      const prevShip = this.lastShipPos || { ...shipPos };
      // Portal pentacle is modeled in portal local XY plane; with no dynamic rotation applied,
      // its world-space normal points along +Z. If rotation is introduced later, adapt this
      // to extract the rotated Z axis from portal.modelMatrix.
      const planeNormal = { x: 0, y: 0, z: 1 };
      const vx = shipPos.x - prevShip.x;
      const vy = shipPos.y - prevShip.y;
      const vz = shipPos.z - prevShip.z;
      const denomBase = vx * planeNormal.x + vy * planeNormal.y + vz * planeNormal.z;
      for (const portal of this.gameState.portals) {
        // Segment-plane intersection (plane through portal.position with normal +Z)
        const C = portal.position;
        const n = planeNormal;
        const d0 = (prevShip.x - C.x) * n.x + (prevShip.y - C.y) * n.y + (prevShip.z - C.z) * n.z;
        const d1 = (shipPos.x - C.x) * n.x + (shipPos.y - C.y) * n.y + (shipPos.z - C.z) * n.z;
        // Store latest signed distance for debug/reference (repurpose map)
        this.portalPrevDistances.set(portal.id, d1);
        const denom = denomBase; // same for all portals given fixed n
        // Crossed the plane this frame?
        const crossedPlane = (denom !== 0) && ((d0 === 0) || (d1 === 0) || (d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0));
        if (!crossedPlane) continue;
        // Intersection point along the segment
        const t = d0 / (d0 - d1);
        if (t < 0 || t > 1) continue;
        const ix = prevShip.x + (shipPos.x - prevShip.x) * t;
        const iy = prevShip.y + (shipPos.y - prevShip.y) * t;
        const iz = prevShip.z + (shipPos.z - prevShip.z) * t; // should be ~C.z if plane is z=C.z
        // Must lie within the portal disk radius in-plane
        const R = Math.max(1, portal.radius || (portal as any)?.boundingSphere?.radius || 200);
        const rx = ix - C.x;
        const ry = iy - C.y;
        const rz = iz - C.z; // should be ~0 on the plane
        const radial = Math.hypot(rx, ry); // in-plane distance (XY for n=+Z)
        if (radial > R) continue;
        // Also respect traversal cooldown
        if (this.portalTraversalCooldownSec > 0) continue;
        // Must have a link
        const destId = portal.linkedPortalId;
        if (!destId || !this.portalPersistenceService) continue;
        const destEntry = this.portalPersistenceService.findByPortalId(destId);
        if (!destEntry) {
          this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Traversal attempted but destination snapshot not found', { from: portal.id, to: destId });
          // Soft cooldown to avoid instant re-entry loop
          this.portalTraversalCooldownSec = 2.0;
          continue;
        }
        const { snapshot: destSnap, label: destinationLabel } = destEntry;
        // Fade out quickly (solid black opaque)
        try { this.overlayRenderer?.drawSolid([0,0,0], 1.0); } catch {}
        
        // Pausar consumo de void energy durante el traversal y restaurar al final
        const wasEnergyPaused = this.spaceship?.voidEnergyPaused ?? false;
        if (this.spaceship) {
          this.spaceship.voidEnergyPaused = true;
        }
        
          try {
            this.persistActiveSystemState({
              reason: 'portal-traversal',
              portalId: portal.id,
              destinationPortalId: destId
            });
          } catch (err) {
            this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Failed to persist origin snapshot prior to traversal', {
              portalId: portal.id,
              destinationPortalId: destId,
              err
            });
          }

          // Apply destination system
          this.applySolarSystemSnapshot(destSnap);
          if (destinationLabel) {
            try { this.setCurrentSnapshotLabel(destinationLabel); } catch {}
          }
        // Find the destination portal in the new scene
        const destPortal = this.gameState.findPortalById(destId);
        if (destPortal && this.spaceship) {
          // Runtime traversal behavior: preserve ship velocity and orientation.
          // Reposition the ship at the center of the destination portal (emerging from it)
          this.spaceship.position.x = destPortal.position.x;
          this.spaceship.position.y = destPortal.position.y;
          this.spaceship.position.z = destPortal.position.z;
          // Do NOT change look direction or speeds; cooldown prevents immediate re-entry bounce
          // Optionally nudge slightly along current forward to avoid z-fighting at exact center
          try {
            const fwd = vec3Normalize({ ...this.spaceship.forwardDirection });
            const eps = 0.01;
            this.spaceship.position.x += fwd.x * eps;
            this.spaceship.position.y += fwd.y * eps;
            this.spaceship.position.z += fwd.z * eps;
          } catch {}
          try { this.spaceship.resetVoidEnergyBaseline(); } catch {}
        }
        
        // Reactivar consumo de void energy tras el traversal
        if (this.spaceship) {
          this.spaceship.voidEnergyPaused = wasEnergyPaused;
        }
        
        // Quick fade-in to clear
        try { this.overlayRenderer?.drawSolid([0,0,0], 0.0); } catch {}
        // Set cooldown to prevent immediate re-entry
        this.portalTraversalCooldownSec = 3.0;
        // Reset previous distances to avoid mis-detection in the new system
        this.portalPrevDistances.clear();
        // Reset lastShipPos so next frame starts clean at new location
        this.lastShipPos = { ...this.spaceship.position };
        // Only process one portal per frame
        break;
      }
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'handlePortalTraversal error', e);
    }

  }

  private updateLandingTelemetry(availableTargets: ITargetable[]): void {
    const status = this.landingEvaluator.computeStatus(this.landingEvaluatorHost);
    this.landingStatus = status;
    this.gameState.setLandingStatus(status);

    const threat = this.isLandingThreatSuppressed()
      ? { active: false, reasons: [] }
      : this.landingEvaluator.computeThreat(availableTargets, this.landingEvaluatorHost);
    this.landingThreat = threat;
    this.gameState.setLandingThreat(threat);

    try {
      this.hudManager?.setLandingIndicators({
        landingReady: status.ready || this.isStationDockReady(),
        threatActive: threat.active
      });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Landing indicators update failed', e);
    }
  }

  // computeLandingStatus/computeAtmosphereLandingStatus/computeLandingThreat/resolveThreatLabel
  // se movieron a services/state/landing-evaluator.ts (Fase 5.2).

  private tryStartLandingSequence(): boolean {
    if (this.landingSequenceActive) {
      return true;
    }
    if (!this.landingStatus.ready || !this.landingStatus.context) {
      return false;
    }
    if (this.landingThreat.active) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing blocked by threat', {
        reasons: [...this.landingThreat.reasons]
      });
      return true;
    }
    if (!this.animationManager.startLandingSequence(this, this.landingStatus.context)) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Landing sequence request rejected (animation busy)');
      return false;
    }
    return true;
  }

  public notifyLandingSequenceStarted(context: LandingApproachContext): void {
    this.landingSequenceActive = true;
    this.landingSequenceContext = context;
    this.landingTouchdownContext = null;
    this.setLandingDamageSuppressed(true, 'landing-sequence-start');
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing sequence initiated', {
      planetId: context.planetId,
      planetName: context.planetName
    });
    try {
      const label = context.planetName ? `LANDING: ${context.planetName}` : 'LANDING SEQUENCE';
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.LANDING_SEQUENCE, label);
    } catch {}
  }

  public notifyLandingSequenceFinished(outcome: 'landed' | 'aborted', context?: LandingApproachContext | null): void {
    this.landingSequenceActive = false;
    this.landingSequenceContext = null;
    this.landingEvaluator.resetCandidate();
    const resetStatus: LandingStatus = { ready: false, context: null };
    this.landingStatus = resetStatus;
    try { this.gameState.setLandingStatus(resetStatus); } catch {}
    this.landingPanelController.setAudioFocusArmed(false);
    if (outcome === 'landed' && context) {
      this.landingPanelController.setAudioFocusArmed(true);
      this.setLandingDamageSuppressed(true, 'landing-touchdown');
      this.handleLandingTouchdown(context, { skipLandingPanel: true });
    } else {
      this.landingTouchdownContext = null;
      this.setLandingDamageSuppressed(false, 'landing-aborted');
      try { this.showPlaceholderText('ATERRIZAJE CANCELADO', 2000); } catch {}
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing sequence finished', { outcome });
  }

  public notifyAtmosphereLandingCinematicStarted(context: LandingApproachContext): void {
    this.atmosphereLandingCinematicActive = true;
    this.atmosphereLandingCinematicContext = context;
    this.stopAtmosphereAutoLandingCamera();
    this.extendLandingThreatSuppression(this.ATMOSPHERE_AUTO_LAND_THREAT_SUPPRESSION_WINDOW_MS);
    this.extendAtmosphereCollisionGrace(this.ATMOSPHERE_AUTO_LAND_COLLISION_GRACE_WINDOW_MS);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere landing cinematic started', {
      planetId: context.planetId,
      planetName: context.planetName,
    });
  }

  public notifyAtmosphereLandingCinematicFinished(
    outcome: 'completed' | 'aborted',
    context?: LandingApproachContext | null,
  ): void {
    const resolvedContext = context ?? this.atmosphereLandingCinematicContext;
    this.atmosphereLandingCinematicActive = false;
    this.atmosphereLandingCinematicContext = null;
    this.extendLandingThreatSuppression(this.ATMOSPHERE_AUTO_LAND_THREAT_RECOVERY_MS);
    this.extendAtmosphereCollisionGrace(this.ATMOSPHERE_AUTO_LAND_COLLISION_RECOVERY_MS);
    if (outcome === 'completed' && resolvedContext?.autoLand) {
      this.startAtmosphereAutoLandingCamera(resolvedContext);
    } else {
      this.stopAtmosphereAutoLandingCamera();
      if (outcome === 'aborted') {
        this.releaseLandingCinematicCameraHold('cinematic-aborted');
      }
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere landing cinematic finished', {
      outcome,
      planetId: resolvedContext?.planetId,
    });
  }

  public ensureAtmosphereLandingAirRushLoop(): void {
    this.primeAtmosphereAirRushCue();
  }

  public playAtmosphereLandingApproachCue(): void {
    this.startAtmosphereAutoLandingCue({ restart: true });
  }

  public spawnAtmosphereLandingDustSheets(position: Vector3, normal: Vector3): void {
    if (!this.particleEffects) {
      return;
    }
    this.particleEffects.spawnLandingDustBillboards(position, normal, 4);
  }


  public setWingDeploymentProgress(progress: number | null | undefined): void {
    if (!this.spaceship) {
      this.pendingWingDeploymentProgress = typeof progress === 'number' ? progress : 0;
      return;
    }
    this.spaceship.setWingDeploymentProgress(progress);
    this.pendingWingDeploymentProgress = null;
  }

  public setNoseAnchorProgress(progress: number | null | undefined): void {
    if (!this.spaceship) {
      this.pendingNoseAnchorProgress = typeof progress === 'number' ? progress : 0;
      return;
    }
    this.spaceship.setNoseAnchorProgress(progress);
    this.pendingNoseAnchorProgress = null;
  }

  public holdLandingCinematicCamera(prevMode: CameraMode | null): void {
    this.landingCameraHold.acquire(this.landingCameraHoldHost, prevMode);
  }

  private releaseLandingCinematicCameraHold(
    _reason?: string,
    options?: { restoreCamera?: boolean }
  ): void {
    this.landingCameraHold.release(this.landingCameraHoldHost, options);
  }

  public releaseLandingCameraHold(
    reason?: string,
    options?: { restoreCamera?: boolean }
  ): void {
    this.releaseLandingCinematicCameraHold(reason, options);
  }

  public notifyTakeoffSequenceStarted(
    context: LandingApproachContext,
    phase: 'ground' | 'atmo-exit' = 'ground'
  ): void {
    this.atmosphereAutoLandingCamera.clearPending();
    if (phase !== 'ground') {
      this.releaseLandingCinematicCameraHold('takeoff-sequence-start');
    }
    if (phase === 'ground' && this.landingCameraHold.isActive) {
      this.landingCameraHold.setDeferredForTakeoff(true);
    }
    this.stopAtmosphereAutoLandingCamera();
    this.takeoffSequenceActive = true;
    this.takeoffSequencePhase = phase;
    this.setLandingDamageSuppressed(true, 'takeoff-sequence-start');
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff sequence initiated', {
      planetId: context.planetId,
      planetName: context.planetName,
      phase
    });
    try {
      const label = context.planetName
        ? (phase === 'atmo-exit' ? `ASCENSO ORBITAL: ${context.planetName}` : `TAKEOFF: ${context.planetName}`)
        : (phase === 'atmo-exit' ? 'ATMOSPHERE EXIT' : 'TAKEOFF SEQUENCE');
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.TAKEOFF_SEQUENCE, label);
    } catch {}
  }

  public notifyTakeoffSequenceFinished(
    outcome: 'completed' | 'aborted' | 'stage-one',
    context?: LandingApproachContext | null,
    phase?: 'ground' | 'atmo-exit'
  ): void {
    const resolvedPhase = phase ?? this.takeoffSequencePhase ?? 'ground';
    this.takeoffSequenceActive = false;
    this.takeoffSequencePhase = null;
    const resolvedContext = context ?? this.landingTouchdownContext;

    if (outcome === 'stage-one') {
      this.collisionsDisabled = false;
      this.setLandingDamageSuppressed(false, 'takeoff-stage-one');
      this.setStallWarningSuppressedUntilTakeoff(false);
      this.resetLandingThreatSuppression();
      this.primeAtmosphereAirRushCue();
      try { this.showPlaceholderText('Ascenso inicial completado · Continúa hasta 1000u', 3200); } catch {}
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff stage-one completed', {
        planetId: resolvedContext?.planetId,
        planetName: resolvedContext?.planetName
      });
      return;
    }

    if (outcome === 'completed') {
      this.exitAtmosphereScene();
      try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
      this.landingTouchdownContext = null;
      this.collisionsDisabled = false;
      this.setLandingDamageSuppressed(false, 'takeoff-completed');
      try { this.showPlaceholderText('DESPEGUE COMPLETADO', 2000); } catch {}
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff sequence completed', { phase: resolvedPhase });
      return;
    }

    this.landingTouchdownContext = resolvedContext || null;
    this.collisionsDisabled = true;
    this.setLandingDamageSuppressed(true, 'takeoff-aborted');
    if (resolvedPhase === 'atmo-exit') {
      this.atmosphereAutoTakeoff.arm();
    }
    try { this.showPlaceholderText('DESPEGUE ABORTADO', 2200); } catch {}
    this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff sequence aborted', { phase: resolvedPhase });
  }

  private handleLandingTouchdown(context: LandingApproachContext, options?: LandingTouchdownOptions): void {
    if (!context) {
      return;
    }
    this.clearPendingLandingPanelTimer();
    const enrichedContext = this.enrichLandingContext(context);
    if (!options?.skipAtmosphereScene) {
      this.enterAtmosphereScene(enrichedContext);
    }
    this.refreshAtmosphereSceneContextSurfaceSample();
    const landingContext = this.sampleLandingContextSurface(enrichedContext);
    this.landingTouchdownContext = landingContext;
    if (landingContext.autoLand) {
      this.enableAtmosphereAutoLandingLock('auto-touchdown');
    } else {
      this.clearAtmosphereAutoLandingLock('manual-touchdown');
    }
    let autoLandCinematicActive = false;
    if (landingContext.autoLand) {
      autoLandCinematicActive = this.animationManager?.startAtmosphereLandingCinematic?.(this, landingContext, {
        forceReplace: true,
      }) ?? false;
      if (!autoLandCinematicActive) {
        this.startAtmosphereAutoLandingCamera(landingContext);
        const activeAnimation = this.animationManager?.getCurrentAnimation?.()?.name;
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Auto-landing cinematic unavailable, using fallback camera', {
          planetId: landingContext.planetId,
          blockingAnimation: activeAnimation ?? 'none',
        });
      }
    } else {
      this.stopAtmosphereAutoLandingCamera();
    }
    if (!autoLandCinematicActive) {
      this.applyAtmosphereLandingImpulse();
    } else if (this.spaceship) {
      this.spaceship.currentSpeed = 0;
      this.spaceship.targetSpeed = 0;
      this.spaceship.velocity.x = 0;
      this.spaceship.velocity.y = 0;
      this.spaceship.velocity.z = 0;
    }
    if (landingContext.autoLand && !autoLandCinematicActive) {
      this.extendLandingThreatSuppression(this.ATMOSPHERE_AUTO_LAND_THREAT_SUPPRESSION_WINDOW_MS);
      this.extendAtmosphereCollisionGrace(this.ATMOSPHERE_AUTO_LAND_COLLISION_GRACE_WINDOW_MS);
    }
    this.registerPlanetLandingVisit(landingContext.planetId);
    this.atmosphereAutoTakeoff.arm();
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing touchdown registered', {
      planetId: landingContext.planetId,
      planetName: landingContext.planetName,
      skipPanel: !!options?.skipLandingPanel,
      skipAtmosphereScene: !!options?.skipAtmosphereScene,
    });
    // Recuperado el control atmosférico, la nave vuelve a recibir daño normal
    this.setLandingDamageSuppressed(false, 'atmosphere-flight');
    this.setStallWarningSuppressedUntilTakeoff(true);

    this.landingPanelController.setAwaitingUser(false);

    let panelManaged = false;
    if (!options?.skipLandingPanel) {
      const baseDeferMs = options?.deferLandingPanelMs ?? (landingContext.autoLand ? this.ATMOSPHERE_AUTO_LAND_PANEL_DELAY_MS : 0);
      const deferMs = autoLandCinematicActive
        ? Math.max(baseDeferMs, this.ATMOSPHERE_AUTO_LAND_CINEMATIC_PANEL_DELAY_MS)
        : baseDeferMs;
      panelManaged = this.openLandingPanelWithDelay(landingContext, deferMs);
      this.landingPanelController.setAwaitingUser(panelManaged);
    } else {
      this.releaseLandingCinematicCameraHold('landing-panel-skipped');
    }

    if (panelManaged) {
      return;
    }

    this.releaseLandingCinematicCameraHold('landing-panel-unavailable');

    const label = landingContext.planetName ? `Aterrizaje en ${landingContext.planetName}` : 'Aterrizaje completado';
    try { this.showPlaceholderText(`${label} - Escena atmosférica activa`, 3000); } catch {}
  }

  private openLandingPanelWithDelay(context: LandingApproachContext, delayMs: number): boolean {
    return this.landingPanelController.openWithDelay(this.landingPanelHost, context, delayMs);
  }

  private clearPendingLandingPanelTimer(): void {
    this.landingPanelController.clearPendingTimer(this.landingPanelHost);
  }

  public notifyLandingPanelClosed(): void {
    this.landingPanelController.notifyClosed(this.landingPanelHost);
  }

  private registerPlanetLandingVisit(planetId?: string | null): void {
    if (!planetId) {
      try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
      return;
    }
    const planet = this.gameState.planets.find(p => p.id === planetId) as Planet | undefined;
    if (!planet) {
      try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
      return;
    }
    try { this.gameState.setActiveLandingPlanet?.(planet); } catch {}
    const alreadyVisited = planet.visited;
    try {
      if (typeof (planet as any).markVisited === 'function') {
        (planet as any).markVisited();
      } else {
        (planet as any).visited = true;
      }
    } catch {}
    if (!alreadyVisited) {
      try {
        this.characterProfileService.registerExperienceEvent(ExperienceEventType.PLANET_LANDING);
      } catch (error) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Landing XP registration failed', { planetId, error });
      }
    }
  }

  private enrichLandingContext(context: LandingApproachContext): LandingApproachContext {
    const planet = this.gameState.planets.find(p => p.id === context.planetId) as Planet | undefined;
    if (!planet) {
      return context;
    }
    const planetIntel = this.buildPlanetIntelDetails(planet);
    const base = this._targetDetailsCache?.[planet.id] || this.getFallbackDetails(planet);
    const planetProbabilityRaw = Number((planet as any)?.probabilityOfLifePct);
    const probabilitySource = Number.isFinite(planetProbabilityRaw)
      ? planetProbabilityRaw
      : Number((base as any)?.probabilityOfLifePct);
    const probability = Number.isFinite(probabilitySource)
      ? Math.max(0, Math.min(100, Math.round(probabilitySource)))
      : undefined;
    return {
      ...context,
      planetIntel,
      probabilityOfLifePct: probability,
    };
  }

  private refreshAtmosphereSceneContextSurfaceSample(): void {
    const state = this.atmosphereSceneState;
    if (!state?.active || !state.context) {
      return;
    }
    state.context = this.sampleLandingContextSurface(state.context);
    state.lastUpdatedMs = performance?.now?.() ?? Date.now();
  }

  private sampleLandingContextSurface(context: LandingApproachContext): LandingApproachContext {
    if (!context) {
      return context;
    }
    const state = this.atmosphereSceneState;
    const normal = vec3Normalize(context.surfaceNormal ?? this.deriveLandingNormalFromContext(context));
    const centerFromState = state?.center ? { ...state.center } : null;
    const contextCenter = this.resolvePlanetCenterFromContext(context);
    const planetCenter = centerFromState ?? contextCenter ?? (context.planetCenter ? { ...context.planetCenter } : null);
    const altitudeSample = this.computeAltitudeAboveGround();
    const detailAltitude = Number.isFinite(altitudeSample)
      ? Math.max(0, altitudeSample)
      : Math.max(0, Number.isFinite(context.distanceToSurface) ? context.distanceToSurface : 0);
    return sampleLandingSurfaceContext(context, {
      normal,
      planetCenter,
      stateGroundRadius: Number.isFinite(state?.groundRadius) ? (state?.groundRadius as number) : 0,
      stateCollisionRadius: Number.isFinite(state?.groundCollisionRadius) ? (state?.groundCollisionRadius as number) : 0,
      terrainSeed: state?.terrainSeed ?? 0,
      detailFactor: this.resolveAtmosphereDetailFactor(detailAltitude),
    });
  }

  public startTakeoffSequence(): boolean {
    this.stopAtmosphereAutoLandingCamera();
    this.landingPanelController.cancelAudioFocus();
    if (!this.landingTouchdownContext) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff requested without landing context');
      try { this.showPlaceholderText('DESPEGUE BLOQUEADO - SIN PLANETA', 2000); } catch {}
      return false;
    }
    if (this.landingSequenceActive) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff blocked: landing sequence still active');
      try { this.showPlaceholderText('ATERRIZAJE EN PROCESO', 2000); } catch {}
      return false;
    }
    if (this.takeoffSequenceActive) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff already in progress');
      return true;
    }
    if (!this.animationManager.startTakeoffSequence(this, this.landingTouchdownContext, { phase: 'ground' })) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff animation rejected (busy)');
      try { this.showPlaceholderText('DESPEGUE BLOQUEADO - SISTEMA OCUPADO', 2200); } catch {}
      return false;
    }
    return true;
  }

  private startAtmosphereExitSequence(origin: 'auto' | 'manual' = 'auto'): boolean {
    this.stopAtmosphereAutoLandingCamera();
    this.landingPanelController.cancelAudioFocus();
    if (!this.landingTouchdownContext) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit requested without landing context', { origin });
      try { this.showPlaceholderText('DESPEGUE BLOQUEADO - SIN PLANETA', 2000); } catch {}
      return false;
    }
    if (this.landingSequenceActive) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit blocked: landing sequence still active', { origin });
      return false;
    }
    if (this.takeoffSequenceActive) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere exit already running', { origin });
      return true;
    }
    if (this.isAtmosphereExitTransitionActive()) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere exit transition already active', { origin });
      return true;
    }
    const started = this.beginAtmosphereExitTransition(origin, {
      onBlackout: () => this.handleAtmosphereExitBlackoutStep(origin),
      onComplete: () => this.handleAtmosphereExitFadeInStart(origin),
    });
    if (!started) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to begin atmosphere exit transition', { origin });
      if (!this.animationManager.startTakeoffSequence(this, this.landingTouchdownContext, { phase: 'atmo-exit' })) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit animation rejected (busy)', { origin, fallback: true });
        return false;
      }
      return true;
    }
    this.atmosphereAutoTakeoff.disarm();
    return true;
  }

  public handleLandingPlanetCollapse(planet: Planet, info?: PlanetCollapsePayload): void {
    if (!planet) {
      return;
    }
    const collapseCenter = info?.position ? { ...info.position } : { ...planet.position };
    const collapseRadius = info?.radius ?? this.estimatePlanetRadius(planet);
    const clusterCount = Math.max(0, Math.floor(info?.clusterCount ?? 40));
    if (clusterCount > 0) {
      this.spawnCollapseDebrisClusters(planet.id, collapseCenter, collapseRadius, clusterCount);
    }
    const landedOnPlanet = this.landingTouchdownContext?.planetId === planet.id;
    if (landedOnPlanet) {
      this.forceExitLandingAfterCollapse(collapseCenter, collapseRadius);
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Processed landing planet collapse', {
      planetId: planet.id,
      clustersSpawned: clusterCount,
      landingInterrupted: landedOnPlanet
    });
  }

  // Público para SunProximitySystem (host). Ver docs/ARQUITECTURA.md Fase 5.
  public collectActiveSuns(): Sun[] {
    const suns: Sun[] = [];
    const seen = new Set<string>();
    const pushSun = (sun: Sun | null) => {
      if (!sun || seen.has(sun.id)) {
        return;
      }
      seen.add(sun.id);
      suns.push(sun);
    };
    pushSun(this.gameState.sun);
    for (const planet of this.gameState.planets) {
      if (planet?.getType?.() === GameObjectType.SUN) {
        pushSun(planet as Sun);
      }
    }
    return suns;
  }

  private forceExitLandingAfterCollapse(center: Vector3, radius: number): void {
    const context = this.landingTouchdownContext;
    const anchor = context?.surfacePoint ?? center;
    const normal = context?.surfaceNormal ?? { x: 0, y: 1, z: 0 };
    const safeNormal = vec3Normalize(normal);
    const safeDistance = Math.max(radius * 2, 800);
    const safePosition = {
      x: anchor.x + safeNormal.x * safeDistance,
      y: anchor.y + safeNormal.y * safeDistance,
      z: anchor.z + safeNormal.z * safeDistance,
    };
    this.placeShipAtPosition(safePosition);
    this.landingTouchdownContext = null;
    this.landingSequenceActive = false;
    this.takeoffSequenceActive = false;
    this.landingEvaluator.resetCandidate();
    this.collisionsDisabled = false;
    this.setLandingDamageSuppressed(false, 'planet-collapse');
    try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
    const resetStatus: LandingStatus = { ready: false, context: null };
    this.landingStatus = resetStatus;
    try { this.gameState.setLandingStatus(resetStatus); } catch {}
    this.closeLandingPanelUI('planet-collapse');
    try { this.showPlaceholderText('PLANETA COLAPSADO', 2500); } catch {}
  }

  private resolvePlanetCenterFromContext(context: LandingApproachContext): Vector3 | null {
    return computePlanetCenterFromContext(this.gameState.planets, context);
  }

  private placeShipAtPosition(position: Vector3): void {
    this.shipLandingPositioner.placeShipAtPosition(this.shipLandingHost, position);
  }

  private captureShipKineticsSnapshot(): ShipKineticsSnapshot | null {
    return this.shipLandingPositioner.captureKinetics(this.shipLandingHost);
  }

  private restoreShipKineticsSnapshot(
    snapshot: ShipKineticsSnapshot | null,
    options?: { ensureForwardVelocity?: boolean },
  ): void {
    this.shipLandingPositioner.restoreKinetics(this.shipLandingHost, snapshot, options);
  }

  public enterAtmosphereScene(context: LandingApproachContext, options?: Partial<AtmosphereSceneActivationOptions>): void {
    if (!context) {
      return;
    }
    this.requestThrusterClip(this.ATMOSPHERE_THRUSTER_CLIP);
    this.setAtmosphereActionLock(true);
    const now = performance?.now?.() ?? Date.now();
    const center = this.resolvePlanetCenterFromContext(context) ?? { x: 0, y: 0, z: 0 };
    // Altitud de entrada escalada x5 para coincidir con groundRadius aumentado
    const baseAltitude = Math.max(
      150,
      options?.entryAltitude ?? (Number.isFinite(context.distanceToSurface) ? context.distanceToSurface : 420)
    );
    const entryAltitude = baseAltitude * 5;
    // Escala atmosférica aumentada x5 para mejor sensación de espacio
    const baseRadius = Math.max(50, options?.groundRadius ?? context.radius ?? 900);
    const groundRadius = baseRadius * 5;
    const skyPadding = options?.skyPadding ?? 3000; // 600 * 5
    const skyRadius = Math.max(groundRadius + 500, options?.skyRadius ?? (groundRadius + skyPadding));
    const collisionPadding = Math.max(0, options?.groundCollisionPadding ?? this.ATMOSPHERE_GROUND_COLLISION_PADDING);
    const groundCollisionRadius = Math.max(
      groundRadius,
      options?.groundCollisionRadius ?? (groundRadius + collisionPadding)
    );
    const palette = this.deriveAtmospherePalette(context);
    const entryNormal = vec3Normalize(context.surfaceNormal ?? this.deriveLandingNormalFromContext(context));
    const scaledSurfacePoint = center
      ? {
        x: center.x + entryNormal.x * groundRadius,
        y: center.y + entryNormal.y * groundRadius,
        z: center.z + entryNormal.z * groundRadius,
      }
      : (context.surfacePoint ? { ...context.surfacePoint } : null);
    const contextClone: LandingApproachContext = {
      ...context,
      radius: groundRadius,
      surfacePoint: scaledSurfacePoint ?? (context.surfacePoint ? { ...context.surfacePoint } : context.surfacePoint),
      surfaceNormal: entryNormal,
      planetCenter: context.planetCenter ? { ...context.planetCenter } : context.planetCenter,
    };
    this.atmosphereSceneState = {
      active: true,
      context: contextClone,
      center,
      groundRadius,
      skyRadius,
      groundCollisionRadius,
      groundColor: palette.ground,
      skyColor: palette.sky,
      groundPalette: palette.groundPalette,
      groundPaletteKey: palette.paletteKey,
      entryAltitude,
      lastUpdatedMs: now,
      // Terreno determinista por planeta: misma semilla ⇒ mismas montañas/valles en cada visita.
      terrainSeed: terrainSeedFromPlanetId(context.planetId),
    };
    this.configureAtmosphereWeather(this.atmosphereSceneState);
    this.atmosphereGroundContactActive = false;
    this.silenceMusicForAtmosphere();
    this.atmosphereEntryFadeRemainingMs = this.ATMOSPHERE_ENTRY_FADE_MS;
    this.primeAtmosphereAirRushCue();
    const entryKinetics = this.captureShipKineticsSnapshot();
    this.applyAtmosphereEntryPosition(contextClone, entryAltitude, groundRadius);
    this.restoreShipKineticsSnapshot(entryKinetics, { ensureForwardVelocity: true });
    this.enforceAtmosphereMaxEntrySpeed();
  }

  private enforceAtmosphereMaxEntrySpeed(): void {
    if (!this.spaceship || !this.atmosphereSceneState.active) {
      return;
    }
    const maxSpeed = Math.max(0, this.spaceship.maxSpeed ?? 0);
    if (maxSpeed <= 0) {
      return;
    }
    const forward = vec3Normalize({ ...this.spaceship.forwardDirection });
    const hasForward = Math.abs(forward.x) + Math.abs(forward.y) + Math.abs(forward.z) > 1e-5;
    if (!hasForward) {
      return;
    }
    this.spaceship.currentSpeed = maxSpeed;
    this.spaceship.targetSpeed = maxSpeed;
    this.spaceship.isThrusting = true;
    this.spaceship.thrusterState = ThrusterState.ACCELERATING;
    this.spaceship.velocity.x = forward.x * maxSpeed;
    this.spaceship.velocity.y = forward.y * maxSpeed;
    this.spaceship.velocity.z = forward.z * maxSpeed;
    try {
      this.hudManager?.setStallWarning(false);
    } catch {}
  }

  private applyAtmosphereLandingImpulse(): void {
    if (!this.spaceship || !this.atmosphereSceneState.active) {
      return;
    }
    const maxSpeed = Math.max(0, this.spaceship.maxSpeed ?? 0);
    const impulse = Math.min(this.ATMOSPHERE_POST_LANDING_IMPULSE, maxSpeed);
    if (impulse <= 0) {
      return;
    }
    const nextTarget = Math.max(this.spaceship.targetSpeed, impulse);
    this.spaceship.targetSpeed = Math.min(maxSpeed, nextTarget);
    if (this.spaceship.currentSpeed < impulse) {
      this.spaceship.currentSpeed = impulse;
    }
    this.spaceship.thrusterState = ThrusterState.ACCELERATING;
    this.spaceship.isThrusting = true;

    const forward = vec3Normalize({ ...this.spaceship.forwardDirection });
    if (forward.x || forward.y || forward.z) {
      this.spaceship.velocity.x = forward.x * this.spaceship.currentSpeed;
      this.spaceship.velocity.y = forward.y * this.spaceship.currentSpeed;
      this.spaceship.velocity.z = forward.z * this.spaceship.currentSpeed;
    }

    try {
      this.hudManager?.setStallWarning(false);
    } catch {}
  }

  public exitAtmosphereScene(): void {
    if (!this.atmosphereSceneState.active) {
      return;
    }
    this.clearAtmosphereAutoLandingLock('exit-atmosphere');
    this.setStallWarningSuppressedUntilTakeoff(false);
    this.atmosphereFlight.autoVectorSuppressedUntilMs = 0;
    this.setAtmosphereActionLock(false);
    this.requestThrusterClip(this.SPACE_THRUSTER_CLIP);
    this.clearPendingLandingPanelTimer();
    // Detener todos los SFX atmosféricos
    this.stopAtmosphereAudio();
    this.landingPanelController.stopAudioFocus();
    this.restoreMusicAfterAtmosphere();
    this.stopAtmosphereAutoLandingCamera();
    // Limpiar estado
    this.atmosphereSceneState = this.createDefaultAtmosphereSceneState();
    this.resetAtmosphereWeather();
    this.atmosphereEntryFadeRemainingMs = 0;
    this.atmosphereGroundContactActive = false;
    this.atmosphereAutoTakeoff.disarm();
    this.landingPanelController.setAudioFocusArmed(false);
  }

  private configureAtmosphereWeather(state: AtmosphereSceneState): void {
    if (!this.atmosphereWeather) {
      this.atmosphereWeather = new AtmosphereWeatherService();
    }
    this.resetWeatherEffectsState();
    const now = performance?.now?.() ?? Date.now();
    try {
      this.atmosphereWeather.configureForScene(state, now);
      this.atmosphereWeatherSnapshot = this.atmosphereWeather.getSnapshot();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Weather controller configuration failed', { error });
      this.atmosphereWeatherSnapshot = null;
    }
  }

  private resetAtmosphereWeather(): void {
    try {
      this.atmosphereWeather?.reset();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Weather controller reset failed', { error });
    }
    this.atmosphereWeatherSnapshot = null;
    this.resetWeatherEffectsState();
    this.stopWeatherAudioLoop();
  }

  private teardownAtmosphereSceneState(origin: string = 'teardown'): void {
    const active = this.isAtmosphereSceneActive();
    try {
      if (active) {
        this.exitAtmosphereScene();
      } else {
        this.resetAtmosphereWeather();
        this.atmosphereSceneState = this.createDefaultAtmosphereSceneState();
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere teardown failed', { origin, error });
    }
    try {
      this.particleEffects?.clearWeatherEffects();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to clear weather particles during teardown', { origin, error });
    }
  }

  private setAtmosphereActionLock(active: boolean): void {
    try {
      this.gameState.setAtmosphereLockActive(active);
    } catch {}
    this.syncAtmosphereSpellLocks(active);
  }

  private syncAtmosphereSpellLocks(active: boolean): void {
    if (!this.grimoirePanel) {
      if (!active) {
        this.atmosphereSpellStateBackup.clear();
      }
      return;
    }
    if (active) {
      for (const spell of this.ATMOSPHERE_LOCKED_SPELLS) {
        if (!this.atmosphereSpellStateBackup.has(spell)) {
          this.atmosphereSpellStateBackup.set(spell, this.grimoirePanel.getSpellState(spell));
        }
        this.grimoirePanel.setSpellState(spell, SpellState.LOCKED);
      }
      return;
    }
    for (const spell of this.ATMOSPHERE_LOCKED_SPELLS) {
      const previous = this.atmosphereSpellStateBackup.get(spell) ?? SpellState.AVAILABLE;
      this.grimoirePanel.setSpellState(spell, previous);
    }
    this.atmosphereSpellStateBackup.clear();
  }

  private updateAtmosphereWeather(deltaTime: number): void {
    if (!this.isAtmosphereSceneActive() || !this.atmosphereWeather) {
      this.atmosphereWeatherSnapshot = null;
      this.weatherEffectsSystem.update(deltaTime, null, this.weatherEffectsHost);
      this.updateAtmosphereHudTelemetry();
      return;
    }
    const now = performance?.now?.() ?? Date.now();
    const altitude = this.computeAltitudeAboveGround();
    try {
      this.atmosphereWeather.update(now, deltaTime, altitude);
      this.atmosphereWeatherSnapshot = this.atmosphereWeather.getSnapshot();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Weather controller update failed', { error });
      this.atmosphereWeatherSnapshot = null;
    }
    this.weatherEffectsSystem.update(deltaTime, this.atmosphereWeatherSnapshot, this.weatherEffectsHost);
    this.updateAtmosphereHudTelemetry();
  }

  public getAtmosphereWeatherEffectsState(): AtmosphereWeatherEffectsState {
    return this.weatherEffectsSystem.effects;
  }

  private resetWeatherEffectsState(): void {
    this.weatherEffectsSystem.reset();
  }

  private createDefaultAtmosphereExitTransitionState(): AtmosphereExitTransitionState {
    return {
      active: false,
      stage: 'idle',
      alpha: 0,
      elapsedMs: 0,
      fadeOutMs: 1200,
      fadeInMs: 900,
      blackoutHoldMs: 400,
      origin: 'auto',
      blackoutActionExecuted: false,
      callbacks: {},
    };
  }

  // updateWeatherEffectsState/updateWeatherOverlayState/computeWeatherLightingTarget/
  // updateAtmosphereImpactAbsorptionHud se movieron a AtmosphereWeatherEffectsSystem (Fase 5.1).

  private getWeatherImpactVolumeScale(): number {
    return this.weatherEffectsSystem.getImpactVolumeScale(this.weatherEffectsHost);
  }

  /** Adaptador host: el sistema de clima avisa por aquí cuando los impactos se amortiguan. */
  private emitImpactAbsorptionWarning(): void {
    try {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.WARNING,
        'Absorción atmosférica: impactos amortiguados al 25%',
        { dedupeKey: 'atmo-impact-absorption' }
      );
    } catch {}
  }

  private computeAtmosphereForceAltitudeFactor(altitude?: number): number {
    // Cálculo puro en atmosphere-physics; aquí solo se resuelve la altitud (estado del engine).
    return atmosphereForceAltitudeFactor(altitude ?? this.computeAltitudeAboveGround());
  }

  private computeAtmosphereUpVector(): Vector3 | null {
    if (!this.spaceship || !this.atmosphereSceneState.active) {
      return null;
    }
    const center = this.atmosphereSceneState.center;
    const dx = this.spaceship.position.x - center.x;
    const dy = this.spaceship.position.y - center.y;
    const dz = this.spaceship.position.z - center.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) {
      return null;
    }
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  private applyAtmosphereAutoVector(deltaTime: number): void {
    this.atmosphereFlight.applyAutoVector(deltaTime, this.atmosphereFlightHost);
  }

  private applyAtmosphereWeatherForces(deltaTime: number): void {
    this.atmosphereFlight.applyWeatherForces(deltaTime, this.atmosphereFlightHost);
  }

  private applyAtmosphereDragAndAcceleration(deltaTime: number): void {
    this.atmosphereFlight.applyDragAndAcceleration(deltaTime, this.atmosphereFlightHost);
  }

  private applyAtmosphereCameraJitter(deltaTime: number): void {
    this.atmosphereShake.applyCameraJitter(deltaTime, this.atmosphereFlightHost);
  }

  private applyAtmosphereShipJitter(deltaTime: number): void {
    this.atmosphereShake.applyShipJitter(deltaTime, this.atmosphereFlightHost);
  }

  private updateAtmosphereHudTelemetry(): void {
    if (!this.isAtmosphereSceneActive() || !this.spaceship) {
      this.atmosphereTelemetrySnapshot = null;
      this.atmosphereTelemetryLastStability = null;
      this.atmosphereTelemetryPanelState = null;
      return;
    }
    const state = this.weatherEffectsSystem.effects;
    const altitude = Math.max(0, this.computeAltitudeAboveGround());
    const altitudeFactor = this.computeAtmosphereForceAltitudeFactor(altitude);
    const payload = buildAtmosphereTelemetryPayload({
      active: state.active,
      visibilityCurrent: state.visibilityCurrent,
      turbulenceCurrent: state.turbulenceCurrent,
      eventType: state.eventType,
      driftVector: this.atmosphereFlight.driftForceApplied,
      altitude,
      altitudeFactor,
      autoVectorCurrent: this.atmosphereFlight.autoVectorCurrent,
      autoVectorBandMin: ATMOSPHERE_AUTO_VECTOR_BAND_MIN,
    });
    this.atmosphereTelemetrySnapshot = payload;

    const now = performance?.now?.() ?? Date.now();
    if (this.atmosphereTelemetryLastStability !== payload.stability || now - this.atmosphereTelemetryLastLogMs >= 10000) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere telemetry', {
        stability: payload.stability,
        eventType: payload.eventType,
        drift: +payload.drift.magnitude.toFixed(2),
        turbulence: +payload.turbulence.toFixed(2),
        turbulenceSeverity: payload.turbulenceSeverity,
        lift: +payload.liftPerSecond.toFixed(2),
        visibility: +payload.visibility.toFixed(2),
      });
      this.atmosphereTelemetryLastStability = payload.stability;
      this.atmosphereTelemetryLastLogMs = now;
    }

    this.atmosphereTelemetryPanelState = buildAtmosphereTelemetryPanelState({
      context: this.atmosphereSceneState.context,
      telemetry: payload,
      weather: this.atmosphereWeatherSnapshot,
      altitudeAboveGround: altitude,
    });
  }

  // classifyAtmosphereTurbulence/buildAtmosphereTelemetryPanelState se movieron a
  // atmosphere/atmosphere-telemetry.ts (funciones puras con tests, Fase 5.1).

  // Helpers de formato: delegan en game/utils/label-utils (fuente única, Fase 5).
  private getPlanetTypeLabel(type?: PlanetType): string | undefined {
    return getPlanetTypeLabel(type);
  }

  // getAtmosphereWeatherDisplayLabel se movió a atmosphere/atmosphere-telemetry.ts (Fase 5.1).

  private updateWeatherParticles(deltaTime: number): void {
    if (!this.particleEffects || !this.spaceship) {
      return;
    }
    if (!this.isAtmosphereSceneActive()) {
      this.particleEffects.updateWeatherPrecipitation(this.spaceship, deltaTime, null);
      return;
    }
    const snapshot = this.atmosphereWeatherSnapshot;
    if (!snapshot || snapshot.precipitation === 'none') {
      this.particleEffects.updateWeatherPrecipitation(this.spaceship, deltaTime, null);
      return;
    }
    const up = this.computeAtmosphereUpVector() ?? { x: 0, y: 1, z: 0 };
    let forward = this.getCameraForwardVector();
    if (this.vectorLength(forward) < 1e-3) {
      forward = { x: 0, y: 0, z: 1 };
    }
    const config: WeatherPrecipitationConfig = {
      type: snapshot.precipitation,
      intensity: this.clamp(snapshot.intensity ?? 0, 0.05, 1),
      driftVector: snapshot.driftVector ?? this.ZERO_VECTOR,
      upVector: up,
      forwardVector: forward,
    };
    this.particleEffects.updateWeatherPrecipitation(this.spaceship, deltaTime, config);
  }

  // Helpers matemáticos: delegan en game/math (fuente única, ver docs/ARQUITECTURA.md Fase 5.8).
  private lerpScalar(a: number, b: number, t: number): number {
    return lerpScalar(a, b, t);
  }

  private smoothStep01(value: number): number {
    return smoothStep01(value);
  }

  private clamp(value: number, min: number, max: number): number {
    return clamp(value, min, max);
  }

  /**
   * Detiene todos los efectos de audio atmosféricos activos
   */
  private stopAtmosphereAudio(): void {
    if (this.atmosphereAirRushHandle && this.atmosphereAirRushHandle.isPlaying()) {
      this.atmosphereAirRushHandle.stop(150);
      this.atmosphereAirRushHandle = null;
    }
    this.stopAtmosphereStallWarning();
    this.stopWeatherAudioLoop();
  }

  private silenceMusicForAtmosphere(): void {
    if (this.atmosphereMusicSuppressed) {
      return;
    }
    this.atmosphereMusicSuppressed = true;
    if (!this.music) {
      return;
    }
    try {
      if (!this.musicSceneBeforeAtmosphere && typeof this.music.getCurrentScene === 'function') {
        this.musicSceneBeforeAtmosphere = this.music.getCurrentScene();
      }
      const maybePromise = this.music.setScene('silence', 700);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(err => {
          this.logger.log(LogLevel.WARN, LogCategory.MUSIC, 'Failed to silence music for atmosphere scene', err);
        });
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.MUSIC, 'Music silence request failed', error);
    }
  }

  private restoreMusicAfterAtmosphere(): void {
    const wasSuppressed = this.atmosphereMusicSuppressed;
    const targetScene: MusicScene = this.musicSceneBeforeAtmosphere ?? 'exploration';
    this.atmosphereMusicSuppressed = false;
    this.musicSceneBeforeAtmosphere = null;
    if (!wasSuppressed || !this.music) {
      return;
    }
    try {
      const maybePromise = this.music.setScene(targetScene, 900);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(err => {
          this.logger.log(LogLevel.WARN, LogCategory.MUSIC, 'Failed to restore music after atmosphere scene', { targetScene, err });
        });
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.MUSIC, 'Music restore request failed', { targetScene, error });
    }
  }

  private applyAtmosphereEntryPosition(context: LandingApproachContext, altitude: number, groundRadius: number): void {
    if (!this.spaceship) {
      return;
    }
    const normal = context.surfaceNormal ? vec3Normalize(context.surfaceNormal) : { x: 0, y: 1, z: 0 };
    // Recalcular surfacePoint usando groundRadius escalado (no el radius original del contexto)
    let surfacePoint = context.surfacePoint ? { ...context.surfacePoint } : null;
    const center = this.resolvePlanetCenterFromContext(context);
    if (center) {
      // Usar groundRadius para posicionar correctamente sobre la esfera escalada
      surfacePoint = {
        x: center.x + normal.x * groundRadius,
        y: center.y + normal.y * groundRadius,
        z: center.z + normal.z * groundRadius,
      };
    }
    if (!surfacePoint) {
      surfacePoint = { x: 0, y: 0, z: 0 };
    }
    const entry = {
      x: surfacePoint.x + normal.x * altitude,
      y: surfacePoint.y + normal.y * altitude,
      z: surfacePoint.z + normal.z * altitude,
    };
    this.placeShipAtPosition(entry);
  }

  private detectAtmosphereGroundCollision(): void {
    if (!this.spaceship || !this.isAtmosphereSceneActive()) {
      this.atmosphereGroundContactActive = false;
      return;
    }
    const state = this.atmosphereSceneState;
    if (!state.context) {
      this.atmosphereGroundContactActive = false;
      return;
    }
    const offset = {
      x: this.spaceship.position.x - state.center.x,
      y: this.spaceship.position.y - state.center.y,
      z: this.spaceship.position.z - state.center.z,
    };
    const distFromCenter = Math.hypot(offset.x, offset.y, offset.z);
    if (!Number.isFinite(distFromCenter)) {
      this.atmosphereGroundContactActive = false;
      return;
    }
    const shipRadius = Math.max(0, this.spaceship.boundingSphere?.radius ?? 0);
    const baseAltitude = Math.max(0, distFromCenter - state.groundRadius);
    const detailFactor = this.resolveAtmosphereDetailFactor(baseAltitude);
    const surfaceRadius = sampleAtmosphereSurfaceRadius({
      offset,
      groundRadius: state.groundRadius,
      detailFactor,
      seed: state.terrainSeed,
    });
    const collisionRadius = surfaceRadius + shipRadius;
    const isColliding = distFromCenter <= collisionRadius;
    const contactNormal = distFromCenter > 1e-6
      ? vec3Normalize(offset)
      : { x: 0, y: 1, z: 0 };
    const contactPoint = {
      x: state.center.x + contactNormal.x * surfaceRadius,
      y: state.center.y + contactNormal.y * surfaceRadius,
      z: state.center.z + contactNormal.z * surfaceRadius,
    };
    const contact: AtmosphereCollisionContact = {
      normal: contactNormal,
      contactPoint,
      surfaceRadius,
    };

    if (this.landingSequenceActive || this.takeoffSequenceActive) {
      this.atmosphereGroundContactActive = isColliding;
      return;
    }

    if (isColliding && !this.atmosphereGroundContactActive) {
      this.onAtmosphereGroundCollision(contact);
    }

    this.atmosphereGroundContactActive = isColliding;
  }

  private onAtmosphereGroundCollision(contact?: AtmosphereCollisionContact): void {
    if (this.atmosphereLandingCinematicActive) {
      return;
    }
    const context =
      this.landingTouchdownContext ??
      this.landingStatus.context ??
      this.atmosphereSceneState.context;
    if (!context) {
      return;
    }
    const collisionNormal = vec3Normalize(
      contact?.normal
        ?? context.surfaceNormal
        ?? this.deriveLandingNormalFromContext(context)
    );
    const gentleContact = this.shouldAutoLandFromCollision(collisionNormal);
    const lockActive = this.isAtmosphereAutoLandingLocked();
    const canAutoLand = !lockActive && this.landingStatus.ready && gentleContact;
    if (canAutoLand) {
      const payload: LandingApproachContext = { ...context, autoLand: true };
      if (contact?.contactPoint) {
        payload.surfacePoint = { ...contact.contactPoint };
      }
      if (contact?.surfaceRadius && Number.isFinite(contact.surfaceRadius)) {
        const nextRadius = Math.max(contact.surfaceRadius, payload.radius ?? 0);
        payload.radius = nextRadius;
      }
      payload.surfaceNormal = { ...collisionNormal };
      this.handleLandingTouchdown(payload, {
        skipAtmosphereScene: true,
        deferLandingPanelMs: this.ATMOSPHERE_AUTO_LAND_PANEL_DELAY_MS,
      });
      return;
    }
    if (lockActive && gentleContact) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Atmosphere auto-landing retrigger ignored (lock active)', {
        planetId: context.planetId,
      });
      return;
    }
    this.handleAtmosphereGroundImpact(context, collisionNormal, contact);
  }

  private enableAtmosphereAutoLandingLock(reason: string): void {
    this.atmosphereAutoLandingLock.enable(this.atmosphereAutoLandingLockHost, reason);
  }

  private clearAtmosphereAutoLandingLock(reason?: string): void {
    this.atmosphereAutoLandingLock.clear(this.atmosphereAutoLandingLockHost, reason);
  }

  private isAtmosphereAutoLandingLocked(): boolean {
    return this.atmosphereAutoLandingLock.isLocked(this.atmosphereAutoLandingLockHost);
  }

  private tryTriggerAtmosphereAutoLandingFromInput(): boolean {
    if (!this.isAtmosphereSceneActive()) {
      return false;
    }
    if (this.landingSequenceActive || this.takeoffSequenceActive) {
      return false;
    }
    if (this.atmosphereAutoLandingCamera.isActive) {
      return true;
    }
    if (this.isAtmosphereAutoLandingLocked()) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Auto-landing input ignored (lock active)');
      return false;
    }
    if (!this.landingStatus.ready || !this.landingStatus.context) {
      return false;
    }
    const payload: LandingApproachContext = {
      ...this.landingStatus.context,
      autoLand: true,
    };
    this.handleLandingTouchdown(payload, {
      skipAtmosphereScene: true,
      deferLandingPanelMs: this.ATMOSPHERE_AUTO_LAND_PANEL_DELAY_MS,
    });
    return true;
  }

  private maybeTriggerAtmosphereAutoTakeoff(): void {
    this.atmosphereAutoTakeoff.maybeTrigger(this.atmosphereAutoTakeoffHost);
  }

  private beginAtmosphereExitTransition(
    origin: 'auto' | 'manual',
    callbacks?: AtmosphereExitTransitionCallbacks,
  ): boolean {
    if (this.isAtmosphereExitTransitionActive()) {
      return false;
    }
    const nextState = this.createDefaultAtmosphereExitTransitionState();
    nextState.active = true;
    nextState.stage = 'fade-out';
    nextState.origin = origin;
    nextState.callbacks = callbacks ?? {};
    this.atmosphereExitTransition = nextState;
    this.collisionsDisabled = true;
    return true;
  }

  private updateAtmosphereExitTransition(deltaTime: number): void {
    const state = this.atmosphereExitTransition;
    if (!state.active || state.stage === 'idle') {
      return;
    }
    const deltaMs = Math.max(0, deltaTime * 1000);
    state.elapsedMs += deltaMs;

    if (state.stage === 'fade-out') {
      const denom = Math.max(1, state.fadeOutMs);
      const progress = this.clamp(state.elapsedMs / denom, 0, 1);
      state.alpha = this.smoothStep01(progress);
      if (progress >= 1) {
        state.stage = 'blackout';
        state.elapsedMs = 0;
        state.alpha = 1;
      }
      return;
    }

    if (state.stage === 'blackout') {
      state.alpha = 1;
      if (!state.blackoutActionExecuted) {
        state.blackoutActionExecuted = true;
        try {
          state.callbacks?.onBlackout?.();
        } catch (error) {
          this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit blackout callback failed', { error });
        }
      }
      if (state.elapsedMs >= state.blackoutHoldMs) {
        state.stage = 'fade-in';
        state.elapsedMs = 0;
        state.alpha = 1;
        try {
          state.callbacks?.onComplete?.();
        } catch (error) {
          this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit completion callback failed', { error });
        }
      }
      return;
    }

    if (state.stage === 'fade-in') {
      const denom = Math.max(1, state.fadeInMs);
      const progress = this.clamp(state.elapsedMs / denom, 0, 1);
      state.alpha = 1 - this.smoothStep01(progress);
      if (progress >= 1) {
        this.atmosphereExitTransition = this.createDefaultAtmosphereExitTransitionState();
        if (!this.takeoffSequenceActive) {
          this.collisionsDisabled = false;
        }
      }
    }
  }

  private isAtmosphereExitTransitionActive(): boolean {
    return this.atmosphereExitTransition.active && this.atmosphereExitTransition.stage !== 'idle';
  }

  private isAtmosphereExitTransitionBlocking(): boolean {
    return this.isAtmosphereExitTransitionActive();
  }

  private enforceAtmosphereExitShipHold(): void {
    if (!this.isAtmosphereExitTransitionBlocking() || !this.spaceship) {
      return;
    }
    if (this.atmosphereExitTransition.stage === 'fade-in') {
      return;
    }
    const ship = this.spaceship;
    ship.targetSpeed = 0;
    ship.currentSpeed = 0;
    ship.velocity = { x: 0, y: 0, z: 0 };
    ship.angularVelocity = { x: 0, y: 0, z: 0 };
    ship.isThrusting = false;
    ship.thrusterState = ThrusterState.IDLE;
    if (ship.controls) {
      ship.controls.forward = false;
      ship.controls.backward = false;
      ship.controls.left = false;
      ship.controls.right = false;
      ship.controls.up = false;
      ship.controls.down = false;
      ship.controls.speedUp = false;
      ship.controls.speedDown = false;
      ship.controls.rollLeft = false;
      ship.controls.rollRight = false;
    }
  }

  private handleAtmosphereExitBlackoutStep(origin: 'auto' | 'manual'): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Executing atmosphere exit blackout step', { origin });
    const sourceContext = this.landingTouchdownContext ?? this.landingStatus.context ?? null;
    let sampledContext = sourceContext ? this.sampleLandingContextSurface(sourceContext) : null;
    if (sampledContext) {
      this.landingTouchdownContext = sampledContext;
    } else {
      sampledContext = sourceContext;
    }
    try {
      this.exitAtmosphereScene();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to exit atmosphere scene during blackout', { error });
    }
    this.setLandingDamageSuppressed(true, 'atmo-exit-transition');
    if (this.spaceship) {
      this.atmosphereExitVoidEnergyPrevPaused = !!this.spaceship.voidEnergyPaused;
      this.spaceship.voidEnergyPaused = true;
    } else {
      this.atmosphereExitVoidEnergyPrevPaused = null;
    }
    if (sampledContext) {
      this.repositionShipForAtmosphereExit(sampledContext);
    } else {
      this.atmosphereExitGlideDirection = null;
      this.atmosphereExitSurfaceNormal = null;
    }
    if (this.camera) {
      try { this.camera.setCameraMode(CameraMode.COCKPIT); } catch {}
    }
  }

  private handleAtmosphereExitFadeInStart(origin: 'auto' | 'manual'): void {
    const context = this.landingTouchdownContext ?? this.landingStatus.context ?? null;
    const ship = this.spaceship;
    if (ship) {
      const glideDir = this.resolveAtmosphereExitGlideDirection();
      const targetSpeed = this.ATMOSPHERE_EXIT_REENTRY_SPEED;
      ship.velocity = {
        x: glideDir.x * targetSpeed,
        y: glideDir.y * targetSpeed,
        z: glideDir.z * targetSpeed,
      };
      ship.currentSpeed = targetSpeed;
      ship.targetSpeed = targetSpeed;
      ship.thrusterState = targetSpeed > 0 ? ThrusterState.CRUISING : ThrusterState.IDLE;
      ship.isThrusting = targetSpeed > 0;
      try { ship.updateModelMatrix(); } catch {}
    } else {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Atmosphere exit fade-in lacks spaceship reference', { origin });
    }
    if (this.spaceship) {
      const resumePaused = this.atmosphereExitVoidEnergyPrevPaused;
      this.spaceship.voidEnergyPaused = resumePaused ?? false;
    }
    this.atmosphereExitVoidEnergyPrevPaused = null;
    this.completeAtmosphereExitAfterGlide(origin, context);
  }

  private resolveAtmosphereExitGlideDirection(): Vector3 {
    if (this.atmosphereExitGlideDirection) {
      return { ...this.atmosphereExitGlideDirection };
    }
    const normal = this.atmosphereExitSurfaceNormal ?? { x: 0, y: 1, z: 0 };
    const fallback = this.buildPerpendicularGroundDirection(normal);
    this.atmosphereExitGlideDirection = fallback;
    return { ...fallback };
  }

  private completeAtmosphereExitAfterGlide(origin: 'auto' | 'manual', context?: LandingApproachContext | null): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere exit glide finalized', {
      origin,
      targetSpeed: this.ATMOSPHERE_EXIT_REENTRY_SPEED,
    });
    this.notifyTakeoffSequenceFinished('completed', context ?? this.landingTouchdownContext, 'atmo-exit');
    this.atmosphereExitGlideDirection = null;
    this.atmosphereExitSurfaceNormal = null;
  }

  private repositionShipForAtmosphereExit(context: LandingApproachContext | null): void {
    if (!this.spaceship || !context) {
      this.atmosphereExitSurfaceNormal = null;
      this.atmosphereExitGlideDirection = null;
      return;
    }
    const center = this.resolvePlanetCenterFromContext(context)
      ?? context.surfacePoint
      ?? { x: 0, y: 0, z: 0 };
    const normal = vec3Normalize(context.surfaceNormal ?? this.deriveLandingNormalFromContext(context));
    const radius = Math.max(1, context.radius ?? 0);
    const surfacePoint = context.surfacePoint ?? {
      x: center.x + normal.x * radius,
      y: center.y + normal.y * radius,
      z: center.z + normal.z * radius,
    };
    const shipRadius = Math.max(0, this.spaceship.boundingSphere?.radius ?? 0);
    const clearance = shipRadius + this.ATMOSPHERE_EXIT_SURFACE_OFFSET;
    const target = {
      x: surfacePoint.x + normal.x * clearance,
      y: surfacePoint.y + normal.y * clearance,
      z: surfacePoint.z + normal.z * clearance,
    };
    this.placeShipAtPosition(target);
    const forward = vec3Normalize(this.spaceship.forwardDirection || normal);
    let tangent = this.projectOntoPlane(forward, normal);
    if (this.vectorLength(tangent) < 1e-3) {
      tangent = this.buildPerpendicularGroundDirection(normal);
    } else {
      tangent = vec3Normalize(tangent);
    }
    const lookTarget = {
      x: target.x + tangent.x,
      y: target.y + tangent.y,
      z: target.z + tangent.z,
    };
    try { this.spaceship.lookAt(lookTarget, normal); } catch {}
    try { this.spaceship.updateModelMatrix(); } catch {}
    if (this.spaceship.boundingSphere) {
      this.spaceship.boundingSphere.center = { ...this.spaceship.position };
    }
    this.atmosphereExitSurfaceNormal = normal;
    this.atmosphereExitGlideDirection = tangent;
  }

  private updateAtmosphereAutoLandingCamera(_deltaTime: number): void {
    this.atmosphereAutoLandingCamera.update(this.atmosphereAutoLandingCameraHost);
  }

  private shouldAutoLandFromCollision(normal: Vector3): boolean {
    if (!this.spaceship) {
      return false;
    }
    const velocity = this.spaceship.velocity || { x: 0, y: 0, z: 0 };
    const verticalSpeed = this.dotProduct(velocity, normal);
    return Math.abs(verticalSpeed) <= this.ATMOSPHERE_AUTO_LAND_VERTICAL_SPEED_MAX;
  }

  private handleAtmosphereGroundImpact(
    context: LandingApproachContext,
    normal: Vector3,
    contact?: AtmosphereCollisionContact
  ): void {
    if (!this.spaceship || !this.isAtmosphereSceneActive()) {
      return;
    }
    const state = this.atmosphereSceneState;
    const contactSurfaceRadius = contact?.surfaceRadius;
    const hasContactSurface = typeof contactSurfaceRadius === 'number' && Number.isFinite(contactSurfaceRadius);
    const contactPoint = contact?.contactPoint ?? null;
    const derivedCenterFromContact = hasContactSurface && contactPoint
      ? {
          x: contactPoint.x - normal.x * contactSurfaceRadius,
          y: contactPoint.y - normal.y * contactSurfaceRadius,
          z: contactPoint.z - normal.z * contactSurfaceRadius,
        }
      : contactPoint;
    const center = state.center
      ?? this.resolvePlanetCenterFromContext(context)
      ?? derivedCenterFromContact
      ?? { x: 0, y: 0, z: 0 };
    const baseSurfaceRadius = Math.max(
      state.groundRadius || 0,
      state.groundCollisionRadius || 0,
      Math.max(0, context.radius ?? 0)
    );
    const detailFactor = this.resolveAtmosphereDetailFactor(Math.max(0, this.computeAltitudeAboveGround()));
    const sampledSurface = hasContactSurface
      ? contactSurfaceRadius
      : sampleAtmosphereSurfaceRadiusAlongNormal(normal, baseSurfaceRadius, detailFactor, state.terrainSeed);
    const safeSurfaceRadius = Number.isFinite(sampledSurface)
      ? Math.max(sampledSurface, baseSurfaceRadius)
      : baseSurfaceRadius;
    const shipRadius = Math.max(0, this.spaceship.boundingSphere?.radius ?? 0);
    const separation = safeSurfaceRadius + shipRadius + this.ATMOSPHERE_GROUND_REBOUND_PADDING;
    const reboundPosition = {
      x: center.x + normal.x * separation,
      y: center.y + normal.y * separation,
      z: center.z + normal.z * separation,
    };
    this.spaceship.position = reboundPosition;
    if (this.spaceship.boundingSphere) {
      this.spaceship.boundingSphere.center = { ...reboundPosition };
    }
    try { this.spaceship.updateModelMatrix(); } catch {}

    const velocity = this.spaceship.velocity ? { ...this.spaceship.velocity } : { x: 0, y: 0, z: 0 };
    const verticalSpeed = this.dotProduct(velocity, normal);
    const verticalComponent = {
      x: normal.x * verticalSpeed,
      y: normal.y * verticalSpeed,
      z: normal.z * verticalSpeed,
    };
    const lateral = {
      x: velocity.x - verticalComponent.x,
      y: velocity.y - verticalComponent.y,
      z: velocity.z - verticalComponent.z,
    };
    const impactSpeed = Math.abs(verticalSpeed);
    let reboundSpeed = impactSpeed * this.ATMOSPHERE_GROUND_RESTITUTION;
    if (!Number.isFinite(reboundSpeed)) {
      reboundSpeed = this.ATMOSPHERE_GROUND_MIN_REBOUND_SPEED;
    }
    reboundSpeed = Math.max(this.ATMOSPHERE_GROUND_MIN_REBOUND_SPEED, reboundSpeed);
    const dampedLateral = {
      x: lateral.x * this.ATMOSPHERE_GROUND_TANGENT_DAMPING,
      y: lateral.y * this.ATMOSPHERE_GROUND_TANGENT_DAMPING,
      z: lateral.z * this.ATMOSPHERE_GROUND_TANGENT_DAMPING,
    };
    const newVelocity = {
      x: dampedLateral.x + normal.x * reboundSpeed,
      y: dampedLateral.y + normal.y * reboundSpeed,
      z: dampedLateral.z + normal.z * reboundSpeed,
    };
    this.spaceship.velocity = newVelocity;
    const reboundSpeedMagnitude = Math.max(0, Math.hypot(newVelocity.x, newVelocity.y, newVelocity.z));
    const clampedReboundSpeed = Math.min(
      reboundSpeedMagnitude,
      Math.max(0, this.spaceship.maxSpeed ?? reboundSpeedMagnitude)
    );
    this.spaceship.currentSpeed = clampedReboundSpeed;
    this.spaceship.targetSpeed = clampedReboundSpeed;
    const cruising = clampedReboundSpeed > 0.1;
    this.spaceship.isThrusting = cruising;
    this.spaceship.thrusterState = cruising ? ThrusterState.CRUISING : ThrusterState.IDLE;
    const now = this.getNowMs();
    const suppressUntil = now + this.ATMOSPHERE_AUTO_VECTOR_IMPACT_SUPPRESS_MS;
    if (suppressUntil > this.atmosphereFlight.autoVectorSuppressedUntilMs) {
      this.atmosphereFlight.autoVectorSuppressedUntilMs = suppressUntil;
    }
    this.releaseStallWarningSuppressionAfterImpact();

    const damageRange = this.ATMOSPHERE_GROUND_DAMAGE_MAX - this.ATMOSPHERE_GROUND_DAMAGE_MIN;
    let dealtDamage = 0;
    if (impactSpeed >= this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MIN) {
      const scaleDen = Math.max(1e-3, this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MAX - this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MIN);
      const normalized = Math.min(1, (impactSpeed - this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MIN) / scaleDen);
      const rawDamage = this.ATMOSPHERE_GROUND_DAMAGE_MIN + normalized * damageRange;
      const roundedDamage = Math.round(rawDamage);
      if (roundedDamage > 0) {
        dealtDamage = this.applyShipDamage(roundedDamage, 'atmo-ground', 'Impacto atmosférico', { suppressHud: true });
        if (dealtDamage > 0) {
          try {
            const remaining = `${Math.round(this.spaceship.healthCurrent)}/${Math.round(this.spaceship.healthMax)}`;
            this.hudManager?.emitMarqueeEvent?.(
              HudMarqueeEventType.SHIP_DAMAGE,
              `Impacto atmosférico: -${Math.round(dealtDamage)}u (${remaining})`
            );
          } catch {}
        }
      }
    }

    if (this.particleEffects) {
      const dustOrigin = {
        x: reboundPosition.x - normal.x * Math.max(2, shipRadius * 0.2),
        y: reboundPosition.y - normal.y * Math.max(2, shipRadius * 0.2),
        z: reboundPosition.z - normal.z * Math.max(2, shipRadius * 0.2),
      };
      try { this.particleEffects.createDestructionDebris(dustOrigin, 0.6, { r: 0.7, g: 0.55, b: 0.4 }); } catch {}
    }

    const vignetteBump = Math.min(0.35, 0.08 + impactSpeed / 80);
    this.impactVignetteLevel = Math.min(1, this.impactVignetteLevel + vignetteBump);

    if (this.audio && this.audioUnlocked) {
      const heavy = impactSpeed >= (this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MIN + this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MAX) * 0.5;
      const desired = heavy ? 'sfx_collision_heavy' : 'sfx_collision_light';
      const clip = this.audio.has(desired) ? desired : (this.audio.has('sfx_collision_light') ? 'sfx_collision_light' : null);
      if (clip) {
        const baseVolume = Math.max(0.25, Math.min(0.9, 0.35 + (impactSpeed / this.ATMOSPHERE_GROUND_DAMAGE_SPEED_MAX) * 0.4));
        const volume = Math.min(1, baseVolume * this.getWeatherImpactVolumeScale());
        try { this.audio.play(clip, { bus: 'sfx', volume, fadeInMs: 0 }); } catch {}
      }
    }

    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere ground impact handled', {
      impactSpeed: impactSpeed.toFixed(2),
      damage: dealtDamage,
      reboundSpeed: reboundSpeed.toFixed(2),
      tangentSpeed: Math.hypot(dampedLateral.x, dampedLateral.y, dampedLateral.z).toFixed(2),
    });

    this.startAtmosphereImpactProbe();
  }

  private startAtmosphereImpactProbe(): void {
    if (!this.logger.isCategoryEnabled(LogCategory.GAME_LOOP)) {
      this.atmosphereImpactProbeState = null;
      return;
    }
    const now = this.getNowMs();
    this.atmosphereImpactProbeState = {
      id: ++this.atmosphereImpactProbeSerial,
      startedAt: now,
      expiresAt: now + this.ATMOSPHERE_IMPACT_PROBE_DURATION_MS,
      lastLoggedAt: 0,
    };
    this.logAtmosphereImpactProbeSample('impact');
  }

  private tickAtmosphereImpactProbe(): void {
    const probe = this.atmosphereImpactProbeState;
    if (!probe) {
      return;
    }
    if (!this.logger.isCategoryEnabled(LogCategory.GAME_LOOP) || !this.isAtmosphereSceneActive()) {
      this.atmosphereImpactProbeState = null;
      return;
    }
    const now = this.getNowMs();
    if (now >= probe.expiresAt) {
      this.atmosphereImpactProbeState = null;
      return;
    }
    if (probe.lastLoggedAt && (now - probe.lastLoggedAt) < this.ATMOSPHERE_IMPACT_PROBE_LOG_INTERVAL_MS) {
      return;
    }
    probe.lastLoggedAt = now;
    this.logAtmosphereImpactProbeSample('sample');
  }

  private logAtmosphereImpactProbeSample(reason: 'impact' | 'sample'): void {
    if (!this.logger.isCategoryEnabled(LogCategory.GAME_LOOP) || !this.spaceship) {
      return;
    }
    const probe = this.atmosphereImpactProbeState;
    const altitude = this.computeAltitudeAboveGround();
    const velocity = this.spaceship.velocity ?? { x: 0, y: 0, z: 0 };
    const gravity = this.atmosphereFlight.gravityTelemetry;
    const autoVector = this.atmosphereFlight.autoVectorTelemetry;
    const payload = {
      probeId: probe?.id ?? null,
      reason,
      elapsedMs: probe ? Math.max(0, Math.round(this.getNowMs() - probe.startedAt)) : 0,
      altitude: Number(altitude.toFixed(2)),
      groundContact: this.atmosphereGroundContactActive,
      speed: {
        current: Number((this.spaceship.currentSpeed ?? 0).toFixed(2)),
        target: Number((this.spaceship.targetSpeed ?? 0).toFixed(2)),
      },
      velocity: {
        x: Number((velocity.x ?? 0).toFixed(3)),
        y: Number((velocity.y ?? 0).toFixed(3)),
        z: Number((velocity.z ?? 0).toFixed(3)),
      },
      gravity: gravity
        ? {
            altitude: Number(gravity.altitude.toFixed(2)),
            perSecond: Number(gravity.gravityPerSecond.toFixed(3)),
            final: Number(gravity.finalGravity.toFixed(3)),
            speedFactor: Number(gravity.speedFactor.toFixed(3)),
          }
        : null,
      autoVector: autoVector
        ? {
            altitude: Number(autoVector.altitude.toFixed(2)),
            targetLift: Number(autoVector.targetLift.toFixed(3)),
            liftFactor: Number(autoVector.liftFactor.toFixed(3)),
            current: Number(autoVector.autoVectorCurrent.toFixed(3)),
            velocityDelta: Number(autoVector.liftVelocity.toFixed(4)),
          }
        : null,
    };
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Atmosphere impact probe sample', payload);
  }

  private startAtmosphereAutoLandingCamera(context: LandingApproachContext): void {
    this.atmosphereAutoLandingCamera.start(this.atmosphereAutoLandingCameraHost, context);
  }

  private stopAtmosphereAutoLandingCamera(): void {
    this.atmosphereAutoLandingCamera.stop(this.atmosphereAutoLandingCameraHost);
  }

  private buildPerpendicularGroundDirection(normal: Vector3): Vector3 {
    const reference = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const perpendicular = this.crossProduct(normal, reference);
    const length = this.vectorLength(perpendicular);
    if (length < 1e-4) {
      return { x: 1, y: 0, z: 0 };
    }
    return {
      x: perpendicular.x / length,
      y: perpendicular.y / length,
      z: perpendicular.z / length,
    };
  }

  private deriveLandingNormalFromContext(context: LandingApproachContext): Vector3 {
    return computeLandingNormalFromContext(this.gameState.planets, context);
  }

  private resolveLandingContactPoint(context: LandingApproachContext): Vector3 {
    return computeLandingContactPoint(this.gameState.planets, context);
  }

  public playLandingCinematicTouchdownFx(position: Vector3, normal: Vector3, options?: { skipAudio?: boolean }): void {
    const offset = Math.max(1.2, this.spaceship?.boundingSphere?.radius ?? 1);
    if (this.particleEffects) {
      const dustOrigin = {
        x: position.x - normal.x * offset,
        y: position.y - normal.y * offset,
        z: position.z - normal.z * offset,
      };
      const palette = { r: 0.7, g: 0.58, b: 0.46 };
      try { this.particleEffects.createDestructionDebris(dustOrigin, 0.85, palette); } catch {}
    }
    if (options?.skipAudio || !this.audio || !this.audioUnlocked) {
      return;
    }
    if (this.audio.has('sfx_autoland_touchdown')) {
      try {
        this.audio.play('sfx_autoland_touchdown', {
          bus: 'sfx',
          volume: 0.78,
          fadeInMs: 20,
        });
      } catch {}
      return;
    }
    if (this.audio.has('sfx_passby_air')) {
      try {
        this.audio.play('sfx_passby_air', {
          bus: 'sfx',
          volume: 0.35,
        });
      } catch {}
    }
  }

  private startAtmosphereAutoLandingCue(options?: { restart?: boolean }): void {
    if (!this.audio) {
      return;
    }
    const restart = options?.restart ?? true;
    if (!restart && this.atmosphereAutoLandingCueHandle) {
      return;
    }
    if (restart && this.atmosphereAutoLandingCueHandle) {
      try { this.atmosphereAutoLandingCueHandle.stop(80); } catch {}
      this.atmosphereAutoLandingCueHandle = null;
    }
    // Prefer the dedicated cue and reset any previous playback so the swell matches the new touchdown
    if (this.audio.has('sfx_autoland_touchdown')) {
      this.atmosphereAutoLandingCueHandle = this.audio.play('sfx_autoland_touchdown', {
        volume: 0.78,
        bus: 'sfx',
        fadeInMs: 30,
      });
      if (this.atmosphereAutoLandingCueHandle) {
        return;
      }
    }
    let fallback: string | null = null;
    if (this.audio.has('sfx_collision_light')) {
      fallback = 'sfx_collision_light';
    } else if (this.audio.has('sfx_passby_air')) {
      fallback = 'sfx_passby_air';
    }
    if (fallback) {
      try { this.audio.play(fallback, { bus: 'sfx', volume: 0.55 }); } catch {}
    }
  }

  private stopAtmosphereAutoLandingCue(fadeOutMs: number = 140): void {
    if (!this.atmosphereAutoLandingCueHandle) {
      return;
    }
    try { this.atmosphereAutoLandingCueHandle.stop(fadeOutMs); } catch {}
    this.atmosphereAutoLandingCueHandle = null;
  }

  private deriveAtmospherePalette(context: LandingApproachContext): {
    ground: Float32Array;
    sky: Float32Array;
    groundPalette: AtmosphereGroundPalette;
    paletteKey: string;
  } {
    const descriptor = getPlanetPaletteDescriptor(context.planetType);
    const palette = {
      lowlands: new Float32Array(descriptor.palette.lowlands),
      highlands: new Float32Array(descriptor.palette.highlands),
      dunes: new Float32Array(descriptor.palette.dunes),
      polar: new Float32Array(descriptor.palette.polar),
      strata: new Float32Array(descriptor.palette.strata),
      valleys: new Float32Array(descriptor.palette.valleys),
      plains: new Float32Array(descriptor.palette.plains),
      midlands: new Float32Array(descriptor.palette.midlands),
      peaks: new Float32Array(descriptor.palette.peaks),
    } satisfies AtmosphereGroundPalette;
    return {
      ground: new Float32Array(descriptor.ground),
      sky: new Float32Array(descriptor.sky),
      groundPalette: palette,
      paletteKey: `${context.planetId ?? 'unknown'}|${descriptor.key}`,
    };
  }

  public isAtmosphereSceneActive(): boolean {
    return !!(this.atmosphereSceneState?.active && this.atmosphereSceneState.context);
  }

  public isAtmosphereMusicSuppressed(): boolean {
    return this.atmosphereMusicSuppressed;
  }

  /**
   * Calcula la altitud sobre el suelo (no sobre el centro del planeta)
   */
  /**
   * Detail factor para muestrear el terreno: usa el valor realmente aplicado a la malla
   * (AtmosphereSceneManager) para que física y geometría dibujada coincidan; si la malla
   * aún no se ha renderizado, cae al cálculo por altitud.
   */
  private resolveAtmosphereDetailFactor(baseAltitude: number): number {
    const applied = this.atmosphereSceneManager?.getAppliedGroundDetailFactor?.();
    if (typeof applied === 'number') {
      return applied;
    }
    return computeAtmosphereDetailFactor(Math.max(0, baseAltitude));
  }

  private computeAltitudeAboveGround(): number {
    if (!this.spaceship || !this.isAtmosphereSceneActive()) {
      return 0;
    }
    const state = this.atmosphereSceneState;
    const center = state.center;
    const offset = {
      x: this.spaceship.position.x - center.x,
      y: this.spaceship.position.y - center.y,
      z: this.spaceship.position.z - center.z,
    };
    const distFromCenter = Math.hypot(offset.x, offset.y, offset.z);
    if (!Number.isFinite(distFromCenter)) {
      return 0;
    }
    const shipRadius = Math.max(0, this.spaceship.boundingSphere?.radius ?? 0);
    const baseAltitude = Math.max(0, distFromCenter - state.groundRadius);
    const detailFactor = this.resolveAtmosphereDetailFactor(baseAltitude);
    const surfaceRadius = sampleAtmosphereSurfaceRadius({
      offset,
      groundRadius: state.groundRadius,
      detailFactor,
      seed: state.terrainSeed,
    });
    return Math.max(0, distFromCenter - surfaceRadius - shipRadius);
  }

  private renderAtmosphereScene(): void {
    if (!this.atmosphereSceneManager || !this.camera) {
      return;
    }
    this.atmosphereSceneManager.render(
      this.atmosphereSceneState,
      this.camera,
      this.atmosphereWeatherSnapshot,
      this.getAtmosphereRenderOptions(),
    );
  }

  private getAtmosphereRenderOptions(): AtmosphereRenderOptions {
    return {
      timeMs: performance?.now?.() ?? Date.now(),
      fogEnabled: this.atmosphereFogEnabled,
      cloudsEnabled: this.atmosphereCloudsEnabled,
    };
  }

  private renderAtmosphereEntryFadeOverlay(): void {
    if (!this.overlayRenderer) {
      return;
    }
    if (this.atmosphereEntryFadeRemainingMs <= 0 || this.ATMOSPHERE_ENTRY_FADE_MS <= 0) {
      return;
    }
    const alpha = Math.max(
      0,
      Math.min(1, this.atmosphereEntryFadeRemainingMs / this.ATMOSPHERE_ENTRY_FADE_MS)
    );
    if (alpha <= 0) {
      return;
    }
    this.overlayRenderer.drawSolid([0, 0, 0], alpha);
  }

  private renderAtmosphereExitTransitionOverlay(): void {
    if (!this.overlayRenderer) {
      return;
    }
    if (!this.atmosphereExitTransition.active || this.atmosphereExitTransition.stage === 'idle') {
      return;
    }
    const alpha = this.clamp(this.atmosphereExitTransition.alpha, 0, 1);
    if (alpha <= 1e-3) {
      return;
    }
    this.overlayRenderer.drawSolid([0, 0, 0], alpha);
  }

  private renderWeatherCameraFilters(): void {
    if (!this.overlayRenderer || !this.isAtmosphereSceneActive()) {
      return;
    }
    if (!this.atmosphereReadabilityOverlayEnabled) {
      return;
    }
    const readabilityState = this.atmosphereSceneManager?.getSurfaceReadabilityState();
    const overlaySoftCap = readabilityState?.overlaySoftCap ?? 0.85;
    const highlightColor = readabilityState?.highlightColor;
    const emphasis = readabilityState?.emphasis ?? 0;

    const weatherOverlayAlpha = this.weatherEffectsSystem.overlayAlpha;
    const weatherOverlayColor = this.weatherEffectsSystem.overlayColor;
    if (weatherOverlayAlpha > 1e-3) {
      const overlayColor: [number, number, number] = [
        weatherOverlayColor[0],
        weatherOverlayColor[1],
        weatherOverlayColor[2],
      ];
      if (highlightColor && emphasis > 1e-3) {
        const mix = 0.18 + emphasis * 0.32;
        overlayColor[0] = this.lerpScalar(overlayColor[0], highlightColor[0], mix);
        overlayColor[1] = this.lerpScalar(overlayColor[1], highlightColor[1], mix * 0.85);
        overlayColor[2] = this.lerpScalar(overlayColor[2], highlightColor[2], mix * 0.65);
      }
      const alpha = this.clamp(weatherOverlayAlpha, 0, overlaySoftCap);
      if (alpha > 1e-3) {
        this.overlayRenderer.drawSolid(overlayColor, alpha);
      }
    }
  }

  public setAtmosphereTextureDebugLogging(enabled: boolean): void {
    if (!this.atmosphereSceneManager) {
      return;
    }
    this.atmosphereSceneManager.setTextureDebugLogging(enabled);
    this.logger.log(LogLevel.INFO, LogCategory.TEXTURE, 'Atmosphere texture debug logging', {
      enabled,
    });
  }

  public setAtmosphereReadabilityOverlayEnabled(enabled: boolean): void {
    this.atmosphereReadabilityOverlayEnabled = !!enabled;
    this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Atmosphere readability overlay', {
      enabled: this.atmosphereReadabilityOverlayEnabled,
    });
  }

  public setAtmosphereExteriorDetailLocked(enabled: boolean): void {
    if (!this.atmosphereSceneManager) {
      return;
    }
    this.atmosphereSceneManager.setExteriorDetailLocked(enabled);
    this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Atmosphere exterior detail lock', {
      enabled,
    });
  }

  public setAtmosphereWireframeEnabled(enabled: boolean): void {
    this.atmosphereWireframeEnabled = !!enabled;
    if (this.atmosphereSceneManager) {
      this.atmosphereSceneManager.setWireframeEnabled(this.atmosphereWireframeEnabled);
    }
    this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Atmosphere wireframe overlay', {
      enabled: this.atmosphereWireframeEnabled,
    });
  }

  public isAtmosphereWireframeEnabled(): boolean {
    return this.atmosphereWireframeEnabled;
  }

  private renderParticleEffectsLayer(): void {
    if (!this.particleEffects || !this.camera || !this.shaderManager) {
      return;
    }
    this.particleEffects.render(this.camera);
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
    this.shaderManager.setSpecular(
      new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]),
      0.15,
      32.0,
    );
    this.shaderManager.setLitColor(new Float32Array([0.7, 0.75, 0.8]));
  }

  private spawnCollapseDebrisClusters(planetId: string, center: Vector3, radius: number, clusterCount: number): void {
    if (!this.asteroidClusterService) {
      return;
    }
    const gl = this.gl as WebGL2RenderingContext | null;
    for (let i = 0; i < clusterCount; i++) {
      const clusterId = `collapse-${planetId}-${++this.collapseClusterSerial}-${i}`;
      const clusterCenter = this.randomPointInShell(center, radius * 0.2, radius * 1.25);
      const direction = vec3Normalize({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
      const speed = 5 + Math.random() * 35;
      const includeSuper = Math.random() < 0.2;
      const memberCount = includeSuper ? 5 + Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 4);
      const inst = this.asteroidClusterService.createCluster({
        id: clusterId,
        center: clusterCenter,
        direction,
        speed,
        count: memberCount,
        includeSuper,
        radius: Math.max(30, radius * 0.25),
        centerSpeedFactor: 0.55
      });
      if (gl) {
        for (const obj of inst.objects) {
          if (!obj.vertexBuffer) {
            try { obj.initBuffers(gl); } catch {}
          }
        }
      }
      this.registerClusterObjects(inst);
    }
  }

  private registerClusterObjects(inst: ReturnType<AsteroidClusterService['createCluster']>): void {
    for (const obj of inst.objects) {
      this.registerDestructionCallback(obj);
      if (!this.targetCatalog) {
        continue;
      }
      try {
        const targetType = obj.getTargetType?.() ?? TargetType.ASTEROID;
        if (targetType === TargetType.SUPER_ASTEROID) {
          this.targetCatalog.add(TargetType.SUPER_ASTEROID, obj as any);
        } else {
          this.targetCatalog.add(TargetType.ASTEROID, obj as any);
        }
      } catch {}
    }
  }

  private randomPointInShell(center: Vector3, innerRadius: number, outerRadius: number): Vector3 {
    const min = Math.max(0, Math.min(innerRadius, outerRadius));
    const max = Math.max(min + 1, Math.max(innerRadius, outerRadius));
    const dir = vec3Normalize({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
    const distance = min + Math.random() * (max - min);
    return {
      x: center.x + dir.x * distance,
      y: center.y + dir.y * distance,
      z: center.z + dir.z * distance,
    };
  }

  private estimatePlanetRadius(planet: Planet): number {
    const candidates = [
      planet.scale?.x ?? 0,
      planet.initialRadius ?? 0,
      planet.boundingSphere?.radius ?? 0
    ].filter(value => Number.isFinite(value) && value > 0) as number[];
    const candidate = candidates.length ? Math.max(...candidates) : 0;
    return Math.max(200, candidate);
  }

  private closeLandingPanelUI(reason?: string): void {
    this.landingPanelController.closeUI(this.landingPanelHost, reason);
  }

  /** Lazy-init del sistema de daño solar (sin DI). */
  private ensureSunProximity(): SunProximitySystem {
    if (!this.sunProximity) {
      this.sunProximity = new SunProximitySystem(this.logger);
    }
    return this.sunProximity;
  }

  /** Marquee de peligro (wrapper host para SunProximitySystem). */
  public emitHazardMarquee(message: string): void {
    try {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.HAZARD, message);
    } catch {}
  }

  /** Incrementa el vignette de impacto acotado a 1 (wrapper host). */
  public addImpactVignette(boost: number): void {
    this.impactVignetteLevel = Math.min(1, this.impactVignetteLevel + boost);
  }

  /**
   * Inicializa el motor del juego
   */
  public async initialize(canvasRef: any): Promise<boolean> {
    try {
      // Inicializar WebGL
      if (!this.webglService.initialize(canvasRef)) {
        this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'No se pudo inicializar WebGL');
        return false;
      }

      this.gl = this.webglService.getContext() as WebGL2RenderingContext;
      if (!this.gl) {
        this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'No se pudo obtener el contexto WebGL');
        return false;
      }

      // Configurar WebGL
      this.setupWebGL();

      // Inicializar sistemas
      this.shaderManager = new ShaderManager(this.webglService);
      if (!this.shaderManager.isReady()) {
        this.logger.log(LogLevel.ERROR, LogCategory.SHADERS, 'No se pudieron inicializar los shaders');
        return false;
      }
      this.atmosphereTextureFactory = new AtmosphereTextureFactory();
      this.atmosphereSceneManager = new AtmosphereSceneManager(
        this.gl,
        this.shaderManager,
        this.atmosphereTextureFactory,
      );
      this.atmosphereSceneManager.setWireframeEnabled(this.atmosphereWireframeEnabled);

      // Inicializar gestor de texturas
      this.textureManager = new TextureManager(this.gl);
      this.textureManager.createMetallicTexture();
      this.textureManager.createGradientTexture();
      // Pre-cargar textura de magma (opcional). Desactivado por defecto para evitar 404s si no existe el asset.
      const USE_SUN_MAGMA_TEXTURE = false;
      if (USE_SUN_MAGMA_TEXTURE) {
        try {
          const tried = await this.textureManager.loadTextureFromUrl('magma', '/assets/textures/magma.png');
          if (!tried) {
            await this.textureManager.loadTextureFromUrl('magma', '/textures/magma.png');
          }
        } catch {}
      }

      // Inicializar sistema de partículas
      this.particleEffects = this.particleEffectsService;
      this.particleEffects.initialize(this.shaderManager);
      

      // Inicializar sistema HUD con texturas dinámicas (FASE 3)
      this.hudManager = new HUDManager(this.gl);
  this.logger.log(LogLevel.INFO, LogCategory.HUD, 'HUDManager inicializado con Canvas 2D → WebGL');
        this.queueStartupMarqueeSequence();

      // Inicializar renderer 2D de outline/placa de target (STEP 5)
      try {
        this.targetOutline2D = new TargetOutline2DRenderer(this.webglService as any);
        const ok = this.targetOutline2D.initialize();
        if (!ok) {
          this.logger.log(LogLevel.WARN, LogCategory.HUD, 'TargetOutline2DRenderer no pudo inicializarse');
          this.targetOutline2D = null;
        }
  // Increase redraw rate for smoother motion (~8Hz)
  // Lower throttle so outline texture updates can track selection without visible lag
  try { (this.targetOutline2D as any).setMinUploadInterval?.(16); } catch {}
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Error inicializando TargetOutline2DRenderer', e);
        this.targetOutline2D = null;
      }

  // Inicializar panel de mapa del sistema (overlay top-down, opaco)
  this.systemPanel = new SolarSystemPanel(this.gl, 1024, 1024);
  this.systemPanel.setEnabled(false); // desactivado por defecto
  // Initialize Grimoire panel (ancient book overlay)
  try {
    this.grimoirePanel = new GrimoirePanel(this.gl, this.audio, 1024, 1024); // nace deshabilitado
    this.grimoirePanel.setKnownSpellsProvider(() => this.gameState.getKnownSpells());
    this.syncGrimoireLayoutFromState('engine-init');
    if (this.gameState.isAtmosphereLockActive()) {
      this.syncAtmosphereSpellLocks(true);
    }
  } catch (e) {
    this.logger.log(LogLevel.WARN, LogCategory.HUD, 'GrimoirePanel initialization failed', e);
    this.grimoirePanel = null;
  }

  try {
    this.inventoryPanel = new InventoryPanel(this.gl, 1024, 1024);
    this.inventoryPanel.setEnabled(false);
  } catch (e) {
    this.logger.log(LogLevel.WARN, LogCategory.HUD, 'InventoryPanel initialization failed', e);
    this.inventoryPanel = null;
  }

  

  // Crear cámara
  const canvas = canvasRef.nativeElement;
    this.domCanvas = canvas;
        this.ensureFlightVectorOverlay();
        this.registerCanvasResizeListener(canvas);
        this.applyCanvasResize({
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          pixelWidth: canvas.width,
          pixelHeight: canvas.height,
          devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        });
      const aspect = canvas.width / canvas.height;
      this.camera = new Camera(aspect);

      // Instanced renderer setup (optional)
      if (this.USE_INSTANCING) {
        this.instancedRenderer = new InstancedAsteroidRenderer(this.gl, this.shaderManager);
      }
  // Superficie planetaria procedural (esfera a todas las distancias, sin sprite/flicker) — docs §10
      this.planetSurfaceRenderer = new PlanetSurfaceRenderer(this.gl);
  // Anillos reales de planetas anillados (Saturno), a todas las distancias — docs §10.b
      this.planetRingRenderer = new PlanetRingRenderer(this.gl);
  // Nave del jugador (Vástago): servicio de render con shader propio — docs §10.c
      this.shipRenderer = new ShipRenderer(this.gl);
  // Overlay renderer for robust full-screen fades and image flashes
  this.overlayRenderer = new ScreenOverlayRenderer(this.gl);
    // Nuevo renderer encapsulado para portales (visual halo/eye futuro)
    try { this.portalRenderer = new (require('./rendering/PortalRenderer').PortalRenderer)(this.webglService as any, this.shaderManager); } catch {}
    try {
      const lesserRendererModule = require('./rendering/LesserBeingRenderer');
      this.lesserBeingRenderer = new lesserRendererModule.LesserBeingRenderer(this.webglService as any, this.shaderManager);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'No se pudo inicializar LesserBeingRenderer', e);
      this.lesserBeingRenderer = null;
    }
  // Landing overlay removed

      // Inicializar sistema de retícula con renderizado (FASE 2)
      const reticleInit = await this.reticleManager.initialize(this.camera, this.shaderManager);
      if (!reticleInit) {
        this.logger.log(LogLevel.ERROR, LogCategory.TARGETING, 'Error inicializando sistema de retícula');
        return false;
      }
      this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'ReticleManager inicializado con visual system');

      // Inicializar nuevo sistema de targeting adaptativo
      const adaptiveInit = await this.adaptiveTargeting.initialize(this.camera, this.shaderManager);
      if (!adaptiveInit) {
        this.logger.log(LogLevel.ERROR, LogCategory.TARGETING, 'Error inicializando sistema de targeting adaptativo');
        return false;
      }
      this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'AdaptiveTargetingIntegrator inicializado');

      // Crear objetos del juego
      this.createGameObjects();

      if (this.reticleManager && this.spaceship) {
        this.reticleManager.setDistanceOriginProvider(() => ({ ...this.spaceship.position }));
      }
      if (this.adaptiveTargeting && this.spaceship) {
        this.adaptiveTargeting.setDistanceOriginProvider(() => ({ ...this.spaceship.position }));
        // Oclusores de silueta real (§1.2.2): estación (SDF) + planetas/sol (esferas, radio = scale.x vivo).
        this.adaptiveTargeting.setOccluderProvider(() => collectWorldOccluders(
          this.spaceStationSystem.getTargetOccluders(), [...this.gameState.planets, this.gameState.sun]));
      }

      // Setup panel event coordinator with all callbacks
      this.setupPanelEventCoordinator();

  // Registro de targets se realiza al crear los clusters (initializeAllBuffers)
  this.logger.log(LogLevel.INFO, LogCategory.GAME_INITIALIZATION, 'GameEngine inicializado correctamente');
      // Expose a simple console hook to toggle the 2D outliner at runtime for FPS testing
      try {
        const w = (globalThis as any);
        w.Debug = w.Debug || {};
        // Helper to enable/disable log categories from console
        w.Debug.enableLog = (cat: string) => {
          const category = (LogCategory as any)[cat];
          if (category) {
            this.logger.enableCategory(category);
            console.log(`✓ Enabled logging for ${cat}`);
          } else {
            console.warn(`Unknown category: ${cat}. Available: ${Object.keys(LogCategory).join(', ')}`);
          }
        };
        w.Debug.disableLog = (cat: string) => {
          const category = (LogCategory as any)[cat];
          if (category) {
            this.logger.disableCategory(category);
            console.log(`✗ Disabled logging for ${cat}`);
          }
        };
        w.Debug.showLogCategories = () => {
          const enabled = this.logger.getEnabledCategories();
          console.log('Enabled log categories:', enabled);
          console.log('Available categories:', Object.keys(LogCategory));
        };
        w.Debug.setOutlinerEnabled = (v: boolean) => {
          this.outlinerEnabled = !!v;
          this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Outliner enabled', { value: this.outlinerEnabled });
        };
        w.Debug.setOutlinerUpdateMs = (ms: number) => {
          try {
            (this.targetOutline2D as any)?.setMinUploadInterval?.(ms);
            this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Outliner update min interval set', { ms });
          } catch (e) {
            this.logger.log(LogLevel.WARN, LogCategory.DEBUG, 'No se pudo ajustar el intervalo del outliner', e);
          }
        };
        // Targeting runtime tweaks
        w.Debug.Targeting = w.Debug.Targeting || {};
        w.Debug.Targeting.useRaycastHover = (v: boolean) => {
          try { this.adaptiveTargeting?.setUseRaycastHover?.(!!v); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'useRaycastHover', { value: !!v }); } catch {}
        };
        w.Debug.Targeting.dominantGate = (v: boolean) => {
          try { this.adaptiveTargeting?.setDominantGateEnabled?.(!!v); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'dominantGateEnabled', { value: !!v }); } catch {}
        };
        w.Debug.Targeting.setDominantFraction = (f: number) => {
          try { this.adaptiveTargeting?.setDominantRadiusFraction?.(Number(f)); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'dominantRadiusFraction', { value: f }); } catch {}
        };
        // Panels: Map and Grimoire (ancient book)
        w.Debug.Panels = w.Debug.Panels || {};
        w.Debug.Panels.setMapEnabled = (v: boolean) => {
          try { 
            const wasEnabled = this.systemPanel?.isEnabled();
            this.systemPanel?.setEnabled(!!v); 
            // Play appropriate map sound
            if (this.audio) {
              if (v && !wasEnabled) {
                this.audio.play('ui_map_open', { bus: 'ui', volume: 0.6 });
              } else if (!v && wasEnabled) {
                this.audio.play('ui_map_close', { bus: 'ui', volume: 0.6 });
              }
            }
          } catch {}
          if (v) { 
            try { 
              this.grimoirePanel?.setEnabled(false);
              // Play grimoire close sound when auto-closing for map (debug mode)
              if (this.audio) {
                this.audio.play('ui_grimoire_close', { bus: 'ui', volume: 0.6 });
              }
            } catch {} 
          }
          this.updateMapClickBinding();
          this.updateGrimoirePointerBinding();
          this.updateCanvasCursor();
          this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Map panel enabled', { value: !!v });
        };
        w.Debug.Panels.setGrimoireEnabled = (v: boolean) => {
          try { 
            const wasEnabled = this.grimoirePanel?.isEnabled();
            this.grimoirePanel?.setEnabled(!!v); 
            // Play appropriate sound
            if (this.audio) {
              if (v && !wasEnabled) {
                this.audio.play('ui_grimoire_open', { bus: 'ui', volume: 0.6 });
              } else if (!v && wasEnabled) {
                this.audio.play('ui_grimoire_close', { bus: 'ui', volume: 0.6 });
              }
            }
          } catch {}
          if (v) { try { this.systemPanel?.setEnabled(false); } catch {} }
          this.updateMapClickBinding();
          this.updateGrimoirePointerBinding();
          this.updateCanvasCursor();
          this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Grimoire panel enabled', { value: !!v });
        };

        w.Debug.Atmosphere = w.Debug.Atmosphere || {};
        w.Debug.Atmosphere.setFogEnabled = (v: boolean) => {
          this.atmosphereFogEnabled = v !== false;
          this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Atmosphere fog toggle', { value: this.atmosphereFogEnabled });
        };
        w.Debug.Atmosphere.setCloudsEnabled = (v: boolean) => {
          this.atmosphereCloudsEnabled = v !== false;
          this.logger.log(LogLevel.INFO, LogCategory.DEBUG, 'Atmosphere clouds toggle', { value: this.atmosphereCloudsEnabled });
        };
        w.Debug.Atmosphere.setTextureDebug = (v: boolean) => {
          this.setAtmosphereTextureDebugLogging(v !== false);
        };
        w.Debug.Atmosphere.setReadabilityOverlayEnabled = (v: boolean) => {
          this.setAtmosphereReadabilityOverlayEnabled(v !== false);
        };
        w.Debug.Atmosphere.setExteriorDetailLocked = (v: boolean) => {
          this.setAtmosphereExteriorDetailLocked(v !== false);
        };
        w.Debug.Atmosphere.snapshot = () => {
          try {
            console.table?.(this.atmosphereWeatherSnapshot || { eventType: 'none' });
          } catch {}
          return this.atmosphereWeatherSnapshot;
        };
      } catch {}
      return true;

    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_INITIALIZATION, 'Error al inicializar GameEngine', error);
      return false;
    }
  }

  /** Apply a procedural or serialized SolarSystemSnapshot to the current engine state. */
  public applySolarSystemSnapshot(snapshot: SolarSystemSnapshot): { portalsCreated: PortalSnapshot[] } {
    if (!snapshot) { this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'applySolarSystemSnapshot: snapshot null'); return { portalsCreated: [] }; }
    const gl = this.gl;
    this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Applying snapshot', { id: snapshot.id, planets: snapshot.planets.length, clusters: snapshot.clusters?.length || 0 });
    
    // Guardar snapshot actual para acceder a su configuración
    this.setCurrentSnapshotReference(snapshot);
    // Remove any active roaming lesser beings from previous system context
    this.clearActiveLesserBeings();
    // IMPORTANT: Do NOT carry over existing portals when applying a new system snapshot.
    // Design: The origin portal remains only in the origin system; the destination portal is part of the new snapshot.
    // Clearing the current portal list avoids duplicates (origin + destination) coexisting in the same context.
    this.gameState.portals.length = 0;
    // Clear planets & debris
    this.gameState.planets.length = 0;
    this.gameState.sun = null;
    this.planetDebris.clear();
    this.tardisCompanionSystem.clear();
    this.spaceTurtleSystem.clear();
    this.stationRenderer.clear();
    this.spaceStationSystem.clear(this.spaceStationHost);
    this.aracnidStationRenderer.clear();
    this.aracnidWar.clear(this.aracnidWarHost);
    this.stationDockCandidate = null;
    this.stationPanelOpen = false;
    this.stationDockedPort = null;
    this.stationDockingActive = false;
    const persistedDebrisPlanets = new Set<string>();
    if (Array.isArray(snapshot.planetDebris)) {
      for (const entry of snapshot.planetDebris) {
        if (entry?.planetId) {
          persistedDebrisPlanets.add(entry.planetId);
        }
      }
    }
    // Clear clusters
    try { this.asteroidClusterService.clearAll?.(); } catch {}
    // Reset target catalog buckets (keep portal bucket)
    try {
      this.targetCatalog.register(TargetType.PLANET, []);
      this.targetCatalog.register(TargetType.ASTEROID, []);
      this.targetCatalog.register(TargetType.SUPER_ASTEROID, []);
      this.targetCatalog.register(TargetType.CLUSTER, []);
      this.targetCatalog.register(TargetType.MEGA_ASTEROID, []);
    } catch {}

    // Sun
    try {
      if (snapshot.sun) {
        const sun = new Sun(snapshot.sun.id, snapshot.sun.radius, { ...snapshot.sun.position });
        sun.customName = snapshot.sun.name || sun.customName;
        // Anchor sun: ensure zero orbit so it never drifts
        sun.orbitCenter = { ...snapshot.sun.position } as any;
        sun.semiMajor = 0; sun.semiMinor = 0; sun.orbitAngularSpeed = 0; sun.orbitAngle = 0; sun.orbitOrientation = 0;
        (sun as any).orbitNormal = { x: 0, y: 1, z: 0 };
        (sun as any).orbitU = { x: 1, y: 0, z: 0 };
        if (gl && !sun.vertexBuffer) sun.initBuffers(gl as WebGL2RenderingContext);
        this.gameState.planets.push(sun as any);
        this.gameState.sun = sun;
      }
    } catch (e) { this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Sun instantiation failed', e); }

    // Planets — la construcción de la subclase queda aquí; los campos persistentes
    // se aplican vía planet-state.codec (fuente única, ver docs/ARQUITECTURA.md §4.3).
    for (const p of snapshot.planets) {
      try {
        const kind = String(normalizePlanetKind(p.kind, p.baseColorName) ?? '').toLowerCase();
        // Snapshots legacy serializaban también el sol dentro de planets[]; se omite aquí
        // porque snapshot.sun ya lo instancia (evita un planeta fantasma bajo el sol).
        if (kind === 'sun' || (snapshot.sun && p.id === snapshot.sun.id)) {
          continue;
        }
        // Prefer explicit snapshot color when provided; else pick by kind
        const color: any = p.baseColorName || defaultColorForKind(kind);
        const pos = { ...p.position };
        // Construir con el radio ORIGINAL: usar el radio visible (encogido por void mass)
        // como initialRadius provocaba doble encogimiento en cada re-aplicación del snapshot.
        const baseRadius = Number.isFinite(p.initialRadius) ? p.initialRadius! : p.radius;
        const snapshotRadius = Number.isFinite(baseRadius) ? Math.max(1, baseRadius || 1) : 1000;
        let planetObj: Planet;
        // Construcción de la subclase dirigida por DATOS (kind). 'earth_split' = la Tierra partida
        // (antes era un caso especial por id; ahora lo dirige el kind, ver Fase 6.4).
        switch (kind) {
          case 'earth_split': {
            // Force canonical Earth base color 'azul_marino' to keep split hemisphere tint/texture
            const earthColor: any = (p.baseColorName || 'azul_marino');
            const earthDebrisCount = persistedDebrisPlanets.has(p.id) ? 0 : 320;
            const created = EarthSplitPlanet.createWithDebris(p.id, earthColor, p.radius || 400, pos, 150, earthDebrisCount);
            planetObj = created.planet as Planet;
            // Register debris locals to follow Earth spin in update loop
            const arr: Array<{ obj: any; local: { x: number; y: number; z: number } }> = [];
            for (const m of created.debris) {
              arr.push({ obj: m, local: { x: m.position.x - pos.x, y: m.position.y - pos.y, z: m.position.z - pos.z } });
            }
            this.planetDebris.set(p.id, arr as any);
            // Apply canonical Earth axial tilt (23.5°) and spin to drive debris rotation
            try { (planetObj as any).axialTiltRad = (23.5 * Math.PI) / 180; } catch {}
            try { (planetObj as any).angularVelocity = (planetObj as any).angularVelocity || { x: 0, y: 0, z: 0 }; } catch {}
            (planetObj as any).angularVelocity.y = (2 * Math.PI) / 300; // ~1 rev / 5 min
            break;
          }
          case 'ringed': planetObj = new RingedPlanet(p.id, color, snapshotRadius, pos, { radiusIsAbsolute: true }); break;
          case 'gaseous': planetObj = new GaseousPlanet(p.id, color, snapshotRadius, pos); break;
          case 'giant': planetObj = new GiantPlanet(p.id, color, snapshotRadius, pos, { radiusIsAbsolute: true }); break;
          case 'dwarf': planetObj = new DwarfPlanet(p.id, color, snapshotRadius, pos); break;
          case 'protoplanet': planetObj = new Protoplanet(p.id, color, snapshotRadius, pos); break;
          case 'terrestrial': planetObj = new Planet(p.id, color, snapshotRadius, pos); break;
          case 'rocky': planetObj = new Planet(p.id, color, snapshotRadius, pos); break;
          default: planetObj = new Planet(p.id, color, snapshotRadius, pos); break;
        }
        applyPlanetSnapshotFields(planetObj, p);
        // Ensure a sensible default spin so debris belts rotate with their parent
        try {
          const kindSpin = ((): number => {
            if (isRingedPlanet(p.id, kind)) return (2 * Math.PI) / 500; // a bit slower
            if (kind === 'gaseous' || kind === 'giant') return (2 * Math.PI) / 900; // slow giants
            return (2 * Math.PI) / 600; // default
          })();
          (planetObj as any).angularVelocity = (planetObj as any).angularVelocity || { x: 0, y: 0, z: 0 };
          if (!Number.isFinite((planetObj as any).angularVelocity.y) || (planetObj as any).angularVelocity.y === 0) {
            (planetObj as any).angularVelocity.y = kindSpin;
          }
          // Apply a reasonable axial tilt to ringed planets to incline the ring
          // (solo si el snapshot no trae el tilt persistido — el códec ya lo aplicó si venía).
          if (p.axialTiltRad === undefined && isRingedPlanet(p.id, kind)) {
            (planetObj as any).axialTiltRad = (26.7 * Math.PI) / 180;
          }
        } catch {}
        if (gl && !planetObj.vertexBuffer) planetObj.initBuffers(gl as WebGL2RenderingContext);
        this.gameState.planets.push(planetObj);
        try { this.gameState.syncPlanetIntelFromPlanet?.(planetObj); } catch {}
        // Register reactive destruction callback
        this.registerDestructionCallback(planetObj);
        // Cinturón de debris dirigido por DATOS (snapshot.debrisBelt). Fallback al id canónico de
        // Saturno para saves antiguos que aún no traen el campo (mismos parámetros que el legacy).
        const debrisBeltCfg = p.debrisBelt ?? (p.id === RINGED_PLANET_ID ? { count: 280, spreadScale: 0.45, yScale: 0.7 } : null);
        if (debrisBeltCfg && !persistedDebrisPlanets.has(planetObj.id)) {
          try {
            const belt = this.createDebrisBeltForPlanet(planetObj, debrisBeltCfg.count, {
              spreadScale: debrisBeltCfg.spreadScale,
              yScale: debrisBeltCfg.yScale,
            });
            this.planetDebris.set(planetObj.id, belt as any);
          } catch {}
        }
        // Compañera TARDIS: data-driven por `kind` NORMALIZADO (la Tierra), igual que el switch del factory
        // (¡no `p.kind` crudo, que en saves puede ser 'tierra'/vacío!). Transitoria (excluida de la
        // serialización), orbita como un megaasteroide más y se desvanece al acercarse la nave (<50u).
        if (kind === 'earth_split') {
          try {
            const companion = createTardisCompanion(planetObj);
            if (gl && !companion.obj.vertexBuffer) companion.obj.initBuffers(gl as WebGL2RenderingContext);
            const arr = this.planetDebris.get(planetObj.id) ?? [];
            arr.push(companion);
            this.planetDebris.set(planetObj.id, arr);
            this.tardisCompanionSystem.register(companion.obj);
            this.registerDestructionCallback(companion.obj);
            try { this.targetCatalog.add(TargetType.MEGA_ASTEROID, companion.obj as unknown as ITargetable); } catch {}
          } catch {}
        }
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Planet instantiation failed', { id: p.id, e });
      }
    }
    try { this.targetCatalog.register(TargetType.PLANET, this.gameState.planets as any); } catch {}

    // Clusters
    const normals: any[] = [];
    const supers: any[] = [];
    try {
      for (const c of (snapshot.clusters || [])) {
        const inst = this.asteroidClusterService.createCluster({
          id: c.id,
          center: { ...c.center },
          direction: { ...c.direction },
          speed: c.speed,
          count: c.count,
          includeSuper: c.includeSuper,
          radius: c.radius,
          centerSpeedFactor: c.centerSpeedFactor,
        });
        if (gl) { for (const o of inst.objects) if (!o.vertexBuffer) o.initBuffers(gl as WebGL2RenderingContext); }
        for (const o of inst.objects) {
          // Register reactive destruction callback for each asteroid
          this.registerDestructionCallback(o);
          const objectType = this.resolveObjectType(o);
          if (objectType === GameObjectType.SUPER_ASTEROID) {
            supers.push(o as any);
          } else {
            normals.push(o as any);
          }
        }
      }
      this.targetCatalog.register(TargetType.ASTEROID, normals);
      this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
      this.targetCatalog.register(TargetType.CLUSTER, []);
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Cluster instantiation error', e); }

    // Portals (replace with those from the snapshot only)
    const createdPortals: PortalSnapshot[] = [];
    try {
      // Reset target catalog bucket for portals to reflect the new system state
      try { this.targetCatalog.register(TargetType.PORTAL, [] as any); } catch {}
      for (const p of (snapshot.portals || [])) {
        if (this.gameState.portals.some(ep => ep.id === p.id)) { createdPortals.push(p); continue; }
        // Factory canónica: portal-state.codec (fuente única de campos persistentes).
        const portal = createPortalFromSnapshot(p, this.logger);
        if (gl && !portal.vertexBuffer) portal.initBuffers(gl as WebGL2RenderingContext);
        this.gameState.portals.push(portal);
        // Register reactive destruction callback
        this.registerDestructionCallback(portal);
        this.targetCatalog.add(TargetType.PORTAL, portal as any);
        createdPortals.push(p);
      }
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Portal instantiation error', e); }

    this.lastAppliedSnapshotId = snapshot.id || null;
    // Restore debris from snapshot (generic) if provided
    try {
      if (snapshot.planetDebris && snapshot.planetDebris.length) {
        for (const d of snapshot.planetDebris) {
          const parent = this.gameState.findPlanetById(d.planetId);
          if (!parent) continue;
          const pos = {
            x: parent.position.x + d.localOffset.x,
            y: parent.position.y + d.localOffset.y,
            z: parent.position.z + d.localOffset.z
          };
          const size = d.size && Number.isFinite(d.size) ? Math.max(0.01, d.size) : 1;
          const debrisType = String(d.type || 'mega').toLowerCase();
          const obj = debrisType === 'mega'
            ? new MegaAsteroid(d.id, pos, size, undefined, { sizeIsAbsolute: true })
            : new MegaAsteroid(d.id, pos, size);
          obj.updateModelMatrix();
          const existing = this.planetDebris.get(d.planetId) || [];
            existing.push({ obj, local: { ...d.localOffset } });
          this.planetDebris.set(d.planetId, existing as any);
          if (gl && !obj.vertexBuffer) obj.initBuffers(gl as WebGL2RenderingContext);
          // Register reactive destruction callback
          this.registerDestructionCallback(obj);
          try { this.targetCatalog.add(TargetType.MEGA_ASTEROID, obj as any); } catch {}
        }
      }
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Debris restore failed', e); }
    try { this.restorePersistedLesserBeings(snapshot); } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.LESSER_BEINGS, 'Failed to restore persisted lesser beings', e);
    }
    this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot applied', { id: snapshot.id, planetCount: this.gameState.planets.length, portalCount: this.gameState.portals.length });
    return { portalsCreated: createdPortals };
  }

  /**
   * Configura el estado inicial de WebGL
   */
  private setupWebGL(): void {
    if (!this.gl) return;

    // Habilitar depth testing
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);

    // DESHABILITAR culling temporalmente para depurar las alas
    this.gl.disable(this.gl.CULL_FACE);
    // this.gl.cullFace(this.gl.BACK);
    // this.gl.frontFace(this.gl.CCW);

    // Color de fondo (espacio negro)
    this.gl.clearColor(0.05, 0.05, 0.15, 1.0);

    // Configurar viewport
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  /**
   * Crea los objetos iniciales del juego
   */
  private createGameObjects(): void {
    if (!this.gl) return;

    try {
      // Crear nave del jugador en el origen
      this.spaceship = new Spaceship({ x: 0, y: 0, z: 0 });
      this.gameState.spaceship = this.spaceship;
      this.spaceship.cargoCapacityCurrent = 0;
      try {
        this.cargoHoldService.clearManifest();
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'No se pudo limpiar el manifiesto de carga al crear la nave', e);
      }
      
      // Registrar callback reactivo para verificación automática de muerte
      this.spaceship.setHealthChangeCallback((newHealth: number, oldHealth: number) => {
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Ship health changed', { 
          old: Math.round(oldHealth), 
          new: Math.round(newHealth) 
        });
        
        // Verificar condición de muerte reactivamente
        if (newHealth <= 0 && oldHealth > 0) {
          this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Ship destroyed - triggering death dialog (reactive)');
          this.triggerDeathDialog();
        }
      });
      
      if (this.pendingWingDeploymentProgress !== null) {
        this.spaceship.setWingDeploymentProgress(this.pendingWingDeploymentProgress);
        this.pendingWingDeploymentProgress = null;
      }
      if (this.pendingNoseAnchorProgress !== null) {
        this.spaceship.setNoseAnchorProgress(this.pendingNoseAnchorProgress);
        this.pendingNoseAnchorProgress = null;
      }

      this.logger.log(LogLevel.INFO, LogCategory.GAME_INITIALIZATION, 'Spaceship created successfully', { position: this.spaceship.position });
      this.refreshShipDynamicsBaseline(true);
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_INITIALIZATION, 'Error creating spaceship', error);
      throw error;
    }
    this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Spaceship geometry check', {
      vertices: this.spaceship.vertices.length,
      indices: this.spaceship.indices.length,
      visible: this.spaceship.visible,
      active: this.spaceship.active
    });
    // ¡CRÍTICO! Inicializar buffers WebGL para los objetos iniciales
    this.initializeAllBuffers();
    // Register existing portals if any (none initially)
    if (this.gameState.portals.length) {
      this.gameState.portals.forEach(p => p.initBuffers(this.gl!));
      this.targetCatalog.add(TargetType.PORTAL, this.gameState.portals[0] as any); // simple add; multiple handled later
    }
    // Prepare audio controllers after ship exists
    try {
      if (this.audio) {
        this.audio.ensureContext();
        this.applyRequestedThrusterClip();
      }
    } catch {}
  }

  // Registro de targets ahora se hace tras crear los clusters en initializeAllBuffers()
  
  /**
   * Inicializa los buffers WebGL para todos los objetos del juego
   */
  private initializeAllBuffers(): void {
    if (!this.gl) {
      this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'Cannot initialize buffers: WebGL context not available');
      return;
    }
    
    // Inicializar buffers de la nave
    this.spaceship.initBuffers(this.gl);
    this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Spaceship buffers initialized', {
      vertexBuffer: !!this.spaceship.vertexBuffer,
      indexBuffer: !!this.spaceship.indexBuffer,
      vertices: this.spaceship.vertices.length,
      indices: this.spaceship.indices.length
    });
    
    // 1) Sistema humano: ÚNICA fuente = HumanSolarSystemService.createSnapshot() aplicado por el
    // camino normal de snapshots. El antiguo createPlanets() hardcodeado (segunda implementación
    // paralela, no determinista, muerta en producción) se eliminó (docs/ARQUITECTURA.md Fase 6.5).
    if (this.humanSolarSystemService) {
      try {
        const snap = this.humanSolarSystemService.createSnapshot();
        this.applySolarSystemSnapshot(snap);
        this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Applied human solar system snapshot during buffer init', { id: snap.id });
      } catch (e) {
        this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to apply human solar system snapshot', e);
      }
    } else {
      this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'HumanSolarSystemService unavailable: no initial system created');
    }
    this.gameState.planets.forEach(p => p.initBuffers(this.gl!));
    this.targetCatalog.register(TargetType.PLANET, this.gameState.planets as unknown as ITargetable[]);

    // 2) Construir un rastro de clusters a lo largo de la elipse orbital de la Tierra
    const earth = this.gameState.findPlanetById(EARTH_PLANET_ID);
    const createdClusters: ReturnType<typeof this.asteroidClusterService.createCluster>[] = [];
    if (earth) {
      const a = earth.semiMajor;
      const b = earth.semiMinor;
      const orient = earth.orbitOrientation;
      const ctr = earth.orbitCenter;
      const phiEarth = earth.orbitAngle;

      // Utilidades para la elipse en el PLANO ORBITAL 3D de la Tierra
      // Base del plano: normal N y ejes en el plano U0 (semieje mayor) y V0 = N×U0 (semieje menor sin orientación)
      const N = (() => {
        const n = earth.orbitNormal;
        const l = Math.hypot(n.x, n.y, n.z) || 1;
        return { x: n.x / l, y: n.y / l, z: n.z / l };
      })();
      const U0 = (() => {
        // Asegurar que U0 esté en el plano (ortogonal a N)
        const u = earth.orbitU;
        const dot = u.x * N.x + u.y * N.y + u.z * N.z;
        const ux = u.x - dot * N.x;
        const uy = u.y - dot * N.y;
        const uz = u.z - dot * N.z;
        const l = Math.hypot(ux, uy, uz) || 1;
        return { x: ux / l, y: uy / l, z: uz / l };
      })();
      const V0 = (() => {
        // V0 = normalize(N × U0)
        const vx = N.y * U0.z - N.z * U0.y;
        const vy = N.z * U0.x - N.x * U0.z;
        const vz = N.x * U0.y - N.y * U0.x;
        const l = Math.hypot(vx, vy, vz) || 1;
        return { x: vx / l, y: vy / l, z: vz / l };
      })();
      // Aplicar orientación en el plano: U = U0*cos(o) + V0*sin(o), V = -U0*sin(o) + V0*cos(o)
      const co = Math.cos(orient), so = Math.sin(orient);
      const U = { x: U0.x * co + V0.x * so, y: U0.y * co + V0.y * so, z: U0.z * co + V0.z * so };
      const V = { x: -U0.x * so + V0.x * co, y: -U0.y * so + V0.y * co, z: -U0.z * so + V0.z * co };
      const posAt = (phi: number) => {
        const c = Math.cos(phi), s = Math.sin(phi);
        return {
          x: ctr.x + U.x * (a * c) + V.x * (b * s),
          y: ctr.y + U.y * (a * c) + V.y * (b * s),
          z: ctr.z + U.z * (a * c) + V.z * (b * s)
        };
      };
      const tanAt = (phi: number) => {
        // d/dphi de la elipse en el plano: (-a*sinφ)U + (b*cosφ)V (normalizado)
        const c = Math.cos(phi), s = Math.sin(phi);
        let tx = U.x * (-a * s) + V.x * (b * c);
        let ty = U.y * (-a * s) + V.y * (b * c);
        let tz = U.z * (-a * s) + V.z * (b * c);
        const tl = Math.hypot(tx, ty, tz) || 1;
        return { x: tx / tl, y: ty / tl, z: tz / tl };
      };
      const speedAt = (phi: number) => Math.hypot(a * Math.sin(phi), b * Math.cos(phi));
      const phiBehindBy = (ds: number) => {
        // Integración simple hacia atrás en phi para alcanzar distancia ds ≈ ∫|r'(phi)| dphi
        let acc = 0;
        let phi = phiEarth;
        const maxIter = 10000;
        for (let i = 0; i < maxIter && acc < ds; i++) {
          const s = speedAt(phi);
          const dphi = Math.min(0.01, (ds - acc) / Math.max(1e-6, s));
          acc += s * dphi;
          phi -= dphi; // hacia atrás (opuesto al avance orbital)
        }
        return phi;
      };

  // Especificación de filas y longitudes: fila 4 es 10 más larga que la 3 → [20, 40, 50, 60, 40, 20]
  const rowsSpec = [20, 40, 50, 60, 40, 20];
      const maxCols = Math.max(...rowsSpec);
      const ROW_SPACING = 75; // separación lateral entre filas
      const COL_SPACING = 300; // separación a lo largo de la órbita entre clusters
      const START_OFFSET = 10000; // inicio del rastro detrás de la Tierra

      // Precalcular los phi de columna para la fila más larga (referencia)
      const phiCols: number[] = [];
      for (let c = 0; c < maxCols; c++) {
        const ds = START_OFFSET + c * COL_SPACING;
        phiCols.push(phiBehindBy(ds));
      }

  // Offsets laterales base por fila (simétricos). Se aplicará un "abanico":
  // la anchura crecerá con la columna (más lejos en el rastro, más abierto)
  const baseRowOffsets = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(m => m * ROW_SPACING);

      // Crear los clusters fila por fila
  const CLUSTER_SPEED = 1.5;
      const CLUSTER_COUNT_PER = 8;
      const CLUSTER_INCLUDE_SUPER = true;
      const CLUSTER_RADIUS = 12;
      const CLUSTER_CENTER_FACTOR = 0.5;
  const FAN_FACTOR = 1.2; // 0 = sin abanico; 1.2 = 120% más ancho al final
  // Jitter base aumentado para romper alineaciones
  const JITTER_LATERAL = 120; // variación aleatoria lateral (u)
  const JITTER_ALONG = 180;   // variación aleatoria a lo largo (u)
  const JITTER_Y = 80;        // variación vertical (u)
  // Caos omnidireccional adicional alrededor del origen del clúster
  const CHAOS_BASE = 120;     // radio mínimo de caos cerca de la Tierra
  const CHAOS_FAR = 600;      // radio adicional hacia el extremo lejano (se escala con distancia)

      for (let r = 0; r < rowsSpec.length; r++) {
        const cols = rowsSpec[r];
        // Desplazar filas cortas para que ocupen el tramo lejano (más grueso)
        const cStart = Math.max(0, maxCols - cols);
        for (let c = 0; c < cols; c++) {
          const cGlobal = cStart + c;
          const phi = phiCols[cGlobal];
          const base = posAt(phi);
          const t = tanAt(phi); // sentido de movimiento de Earth (tangente en el plano orbital)
          // Normal lateral en el plano orbital: s = normalize(N × t)
          let sx = N.y * t.z - N.z * t.y;
          let sy = N.z * t.x - N.x * t.z;
          let sz = N.x * t.y - N.y * t.x;
          { const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl; }
          // Abanico GLOBAL: poco abierto cerca de la Tierra (cGlobal≈0) y más abierto lejos (cGlobal≈maxCols-1)
          const gFrac = (maxCols > 1) ? (cGlobal / (maxCols - 1)) : 0;
          const spread = 1 + FAN_FACTOR * gFrac;
          const lateralBase = baseRowOffsets[r] * spread;
          // Jitter para romper la regularidad
          const jLat = (Math.random() * 2 - 1) * JITTER_LATERAL;
          const jAlong = (Math.random() * 2 - 1) * JITTER_ALONG;
          const jY = (Math.random() * 2 - 1) * JITTER_Y;
          let center = {
            x: base.x + sx * (lateralBase + jLat) + t.x * jAlong + N.x * jY,
            y: base.y + sy * (lateralBase + jLat) + t.y * jAlong + N.y * jY,
            z: base.z + sz * (lateralBase + jLat) + t.z * jAlong + N.z * jY
          };
          // Caos omnidireccional: desplazar el origen en una dirección aleatoria 3D
          const chaosR = CHAOS_BASE + CHAOS_FAR * gFrac;
          const rx = Math.random() * 2 - 1;
          const ry = Math.random() * 2 - 1;
          const rz = Math.random() * 2 - 1;
          const rlen = Math.hypot(rx, ry, rz) || 1;
          const k = Math.random() * chaosR; // magnitud aleatoria hasta chaosR
          center.x += (rx / rlen) * k;
          center.y += (ry / rlen) * k;
          center.z += (rz / rlen) * k;
          const dir = t; // seguir el sentido de movimiento (no invertido)
          const cluster = this.asteroidClusterService.createCluster({
            id: `trail-${r}-${c}`,
            center,
            direction: dir,
            speed: CLUSTER_SPEED,
            count: CLUSTER_COUNT_PER,
            includeSuper: CLUSTER_INCLUDE_SUPER,
            radius: CLUSTER_RADIUS,
            centerSpeedFactor: CLUSTER_CENTER_FACTOR
          });
          createdClusters.push(cluster);
        }
      }

      // Posicionar la nave en la otra punta del rastro (extremo más lejano, más grueso) y mirando hacia la Tierra
      try {
        // Usar la última columna global (más lejana) para alinear con la parte más abierta
        const cEnd = maxCols - 1;
        const phiEnd = phiCols[cEnd];
        const endPos = posAt(phiEnd);
        const tEnd = tanAt(phiEnd);
        // Lateral en el plano orbital para posicionar la nave
        let sx = N.y * tEnd.z - N.z * tEnd.y;
        let sy = N.z * tEnd.x - N.x * tEnd.z;
        let sz = N.x * tEnd.y - N.y * tEnd.x;
        { const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl; }
        // Fila central con longitud máxima (primera coincidencia)
        const rCenter = rowsSpec.findIndex(v => v === maxCols);
        // Usar apertura máxima del abanico en el extremo lejano
        const spread = 1 + FAN_FACTOR * 1;
        const lateralBase = baseRowOffsets[(rCenter >= 0 ? rCenter : 2)] * spread;
        const shipPos = {
          x: endPos.x + sx * (lateralBase + 150),
          y: endPos.y + sy * (lateralBase + 150),
          z: endPos.z + sz * (lateralBase + 150)
        };
        this.spaceship.position.x = shipPos.x;
        this.spaceship.position.y = shipPos.y;
        this.spaceship.position.z = shipPos.z;
        // Orientar la nave 90° respecto a la dirección hacia la Tierra (no mirar directamente)
        const fx = earth.position.x - shipPos.x;
        const fy = earth.position.y - shipPos.y;
        const fz = earth.position.z - shipPos.z;
        const fl = Math.max(1e-6, Math.hypot(fx, fy, fz));
        // up mundial
        const ux = 0, uy = 1, uz = 0;
        // right = normalize(up × fwd)
        const rx = uy * fz - uz * fy;
        const ry = uz * fx - ux * fz;
        const rz = ux * fy - uy * fx;
        const rl = Math.max(1e-6, Math.hypot(rx, ry, rz));
        const perpTarget = {
          x: shipPos.x + rx / rl,
          y: shipPos.y + ry / rl,
          z: shipPos.z + rz / rl,
        };
        this.spaceship.lookAt(perpTarget);
        this.spaceship.updateModelMatrix();
        this.bootstrapDefaultRespawnAnchor();
      } catch {}
    } else {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Earth not found; skipping cluster trail');
    }

    // Inicializar buffers de los objetos de todos los clusters
    createdClusters.forEach(c => c.objects.forEach(o => o.initBuffers(this.gl!)));

    // Registrar todos los objetos (buckets separados por tipo)
    const smalls: ITargetable[] = [];
    const supers: ITargetable[] = [];
    createdClusters.forEach(c => {
      c.objects.forEach(o => {
        // Register reactive destruction callback for each asteroid
        this.registerDestructionCallback(o);
        if ((o as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(o as unknown as ITargetable);
        else smalls.push(o as unknown as ITargetable);
      });
    });
    this.targetCatalog.register(TargetType.ASTEROID, smalls);
    this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
    // Inicializar buffers y registrar debris asociados a planetas como MEGA_ASTEROID
    for (const arr of this.planetDebris.values()) {
      for (const d of arr) {
        if (!d.obj.vertexBuffer) d.obj.initBuffers(this.gl!);
        // Register reactive destruction callback for mega asteroids
        this.registerDestructionCallback(d.obj);
        this.targetCatalog.add(TargetType.MEGA_ASTEROID, d.obj as unknown as ITargetable);
      }
    }

  // Ya posicionamos la nave en el inicio del rastro; no mover todo cerca del Sol
  }

  /**
   * Inicia el bucle principal del juego
   */
  public start(): void {
  this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'GameEngine.start() called', { wasRunning: this.isRunning });
    
    if (!this.isRunning) {
      this.cancelPendingFrame('start');
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.gameLoop();
  this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'GameEngine iniciado', { isRunning: this.isRunning });
    } else {
  this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'GameEngine ya estaba corriendo');
    }
  }

  /** Call this from a user gesture (Space/click) to unlock audio and start scene music */
  public async enableAudio(): Promise<void> {
    try {
      if (!this.audio) return;
      this.audio.ensureContext();
      const ok = await this.audio.unlock();
      this.audioUnlocked = ok;
      this.logger.log(LogLevel.INFO, LogCategory.AUDIO, `🔊 Audio unlocked: ${ok}, audioUnlocked flag: ${this.audioUnlocked}`);
      this.applyRequestedThrusterClip();
      // Don't change music scene here - let caller decide which scene to play
      // Start always-on ambience loop (logdark) once unlocked
      try { if (ok) this.audio.startAmbientLoop('sfx_logdark'); } catch {}
      // Pre-start thruster loop at silence for smooth fade when first needed
      if (ok && this.thrusterCtl) {
        this.thrusterCtl.start(0.0);
      }
      this.logger.log(LogLevel.INFO, LogCategory.AUDIO, 'Audio enabled', { ok });
    } catch (e) {
      console.error('🔴 Audio enable failed:', e);
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Audio enable failed', e);
    }
  }

  /** Toggle pause mix so only ambience keeps playing during gameplay pauses */
  public setAudioPausedForGame(paused: boolean): void {
    if (!this.audio || this.audioSilencedForPause === paused) return;
    this.audioSilencedForPause = paused;
    try {
      if (paused) {
        this.audio.pauseNonAmbientBuses();
        try { this.thrusterCtl?.stop(150); } catch {}
      } else {
        this.audio.resumeNonAmbientBuses();
        if (this.audioUnlocked && this.thrusterCtl) {
          this.thrusterCtl.start(0.0);
        }
      }
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Failed to toggle paused audio mix', e);
    }
  }

  private requestThrusterClip(clip: string): void {
    if (this.desiredThrusterClip === clip) {
      return;
    }
    this.desiredThrusterClip = clip;
    if (this.audio) {
      this.applyRequestedThrusterClip();
    } else {
      this.currentThrusterClip = clip;
    }
  }

  private applyRequestedThrusterClip(): void {
    if (!this.audio) {
      return;
    }
    if (this.thrusterCtl && this.currentThrusterClip === this.desiredThrusterClip) {
      return;
    }
    try { this.thrusterCtl?.stop(120); } catch {}
    try {
      this.thrusterCtl = this.audio.createThrusterController(this.desiredThrusterClip);
      this.currentThrusterClip = this.desiredThrusterClip;
      if (this.audioUnlocked) {
        this.thrusterCtl?.start(0.0);
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Thruster controller rebuild failed', {
        clip: this.desiredThrusterClip,
        error,
      });
    }
  }

  /**
   * Detiene el juego
   */
  public stop(): void {
    this.isRunning = false;
    this.cancelPendingFrame('stop');
  this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'GameEngine detenido');
  }

  /**
   * Reubica la nave y traslada todos los clusters para comenzar a ~distFromSurface del Sol
   * en una dirección aleatoria. Mantiene offsets relativos de miembros en cada clúster.
   */
  /**
   * Bucle principal del juego
   */
  private gameLoop = (): void => {
    this.rafHandle = null;
    // DEBUG CRÍTICO - Verificar isRunning
    if (!this.isRunning) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'GameLoop blocked - isRunning false', { isRunning: this.isRunning });
      return;
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convertir a segundos
    this.lastFrameTime = currentTime;

    // DEBUG CRÍTICO - Verificar gameLoop
    if (performance.now() % 2000 < 50) { // Cada 2 segundos
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'GameEngine.gameLoop() executed', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        isRunning: this.isRunning,
        currentTime: Math.round(currentTime)
      });
    }

    // Actualizar lógica del juego
    this.update(deltaTime);

    // Renderizar frame
    this.render();

    // Programar siguiente frame
    if (!this.isRunning) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Skipping RAF schedule because loop stopped mid-frame');
      return;
    }
    this.scheduleNextFrame('game-loop');
  };

  private scheduleNextFrame(origin: string): void {
    if (!this.isRunning) {
      return;
    }
    if (this.rafHandle !== null) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Detected overlapping RAF before scheduling next frame', {
        origin,
        rafId: this.rafHandle
      });
    }
    this.rafScheduleSerial += 1;
    this.rafHandle = requestAnimationFrame(this.gameLoop);
    if (this.rafScheduleSerial % 240 === 0) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'RAF scheduled checkpoint', {
        origin,
        serial: this.rafScheduleSerial,
        rafId: this.rafHandle
      });
    }
  }

  private cancelPendingFrame(origin: string): void {
    if (this.rafHandle === null) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'No RAF pending to cancel', { origin });
      return;
    }
    cancelAnimationFrame(this.rafHandle);
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Cancelled pending RAF', {
      origin,
      rafId: this.rafHandle
    });
    this.rafHandle = null;
  }

  /**
   * Actualiza la lógica del juego
   */
  private update(deltaTime: number): void {
    // Actualizar animaciones (bloquean inputs si están activas)
    this.animationManager.update(this, deltaTime);
    this.syncSpellIOStates();
    // DEBUG CRÍTICO - Verificar que update se ejecuta
    if (performance.now() % 1500 < 50) { // Cada 1.5 segundos
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'GameEngine.update() executed', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        spaceship: !!this.spaceship,
        asteroids: 0 /* TODO: Get from cluster service */
      });
    }
    
    // Actualizar nave si existe
    if (!this.spaceship) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Spaceship is undefined in update method');
      return;
    }

    this.updateAtmosphereExitTransition(deltaTime);
    if (this.isAtmosphereExitTransitionBlocking()) {
      this.enforceAtmosphereExitShipHold();
    }

    if (this.atmosphereEntryFadeRemainingMs > 0) {
      this.atmosphereEntryFadeRemainingMs = Math.max(
        0,
        this.atmosphereEntryFadeRemainingMs - deltaTime * 1000
      );
    }

    this.updateAgeAndSurvivability(deltaTime);
    // Activar suavizado de alta velocidad durante void jump / gate rite transit
    try {
      const voidJumpActive = this.voidJumpActive;
      // También activar mientras haya una animación que bloquee inputs (GateRite transit lo habilita explícitamente)
      if (this.spaceship && typeof (this.spaceship as any).setHighSpeedSmoothing === 'function') {
        (this.spaceship as any).setHighSpeedSmoothing(voidJumpActive);
      }
    } catch {}

  // Tick del HUD para transiciones (fade-in/out)
  try { if (this.hudManager && (this.hudManager as any).tick) (this.hudManager as any).tick(deltaTime); } catch {}

  // Capture ship position before integration for portal plane crossing tests
  try { this.lastShipPos = { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z }; } catch {}
  // Aplicar gravedad atmosférica ANTES del update de la nave para que se integre correctamente
  if (this.isAtmosphereSceneActive()) {
    this.applyAtmosphereGravity(deltaTime);
  }
  this.applyAtmosphereAutoVector(deltaTime);
  this.applyAtmosphereWeatherForces(deltaTime);
  this.applyAtmosphereShipJitter(deltaTime);
  this.applyAtmosphereDragAndAcceleration(deltaTime);
  this.spaceship.update(deltaTime);
  // Actualizar audio atmosférico después del update para tener la velocidad correcta
  if (this.isAtmosphereSceneActive()) {
    this.updateAtmosphereWeather(deltaTime);
    this.updateAtmosphereAudio(deltaTime);
    this.detectAtmosphereGroundCollision();
    this.maybeTriggerAtmosphereAutoTakeoff();
    this.tickAtmosphereImpactProbe();
  } else if (this.atmosphereGroundContactActive) {
    this.atmosphereGroundContactActive = false;
  }
  this.updateAtmosphereAutoLandingCamera(deltaTime);
  this.ensureSunProximity().tick(deltaTime, this);

    // Update independent asteroids (ejected from clusters after collision)
    this.updateIndependentAsteroids(deltaTime);

    this.lesserBeingSpawner?.update(deltaTime);
    this.lesserBeingController?.update(deltaTime);
    this.updateLesserBeings(deltaTime);
    this.mouseFlight.update(this.mouseFlightHost);
    this.weaponBridge.update(deltaTime);
    this.spaceTurtleSystem.update(this.spaceTurtleHost, deltaTime);
    this.spaceStationSystem.update(this.spaceStationHost, deltaTime);
    this.aracnidWar.update(this.aracnidWarHost, deltaTime);

    // Apply ongoing collision slide (lateral reposition), antes de que la cámara lea la posición
    this.shipCollisionSystem.applySlide(this.shipCollisionHost, deltaTime);

    // Decay impact vignette
    if (this.impactVignetteLevel > 0) {
      const DECAY_PER_SEC = 0.33; // fades to 0 in ~3s from 1.0 (antes: 0.67 = 1.5s, original 1.6 = 0.6s)
      this.impactVignetteLevel = Math.max(0, this.impactVignetteLevel - DECAY_PER_SEC * deltaTime);
    }

    // ============================
    // Spawn y mantenimiento de asteroides efímeros
    // ============================
    try {
      // Obtener configuración del snapshot actual (o valores por defecto)
      const debrisConfig = this.currentSnapshot?.ephemeralDebris || {
        checkIntervalMs: 10000,
        spawnProbability: 0.05,
        spawnCountMin: 1,
        spawnCountMax: 3
      };
      
      const nowMs = performance.now();
      if (nowMs >= this.nextEphemeralCheckMs) {
        this.nextEphemeralCheckMs = nowMs + debrisConfig.checkIntervalMs;
        // Evaluar probabilidad de aparición
        if (Math.random() < debrisConfig.spawnProbability && this.spaceship) {
          const range = debrisConfig.spawnCountMax - debrisConfig.spawnCountMin;
          const toSpawn = debrisConfig.spawnCountMin + Math.floor(Math.random() * (range + 1));
          for (let i=0;i<toSpawn;i++) {
            // Dirección aleatoria sobre esfera
            let dx = (Math.random() - 0.5) * 2;
            let dy = (Math.random() - 0.5) * 2;
            let dz = (Math.random() - 0.5) * 2;
            const len = Math.hypot(dx,dy,dz) || 1; dx/=len; dy/=len; dz/=len;
            // Posición a 500u de la nave
            const spawnPos = {
              x: this.spaceship.position.x + dx * 500,
              y: this.spaceship.position.y + dy * 500,
              z: this.spaceship.position.z + dz * 500,
            };
            // Dirección del asteroide orientada a pasar cerca de la nave (apuntar hacia posición actual de la nave)
            const dirToShip = { x: -dx, y: -dy, z: -dz }; // apunta de spawnPos hacia la nave
            const dirLen = Math.hypot(dirToShip.x, dirToShip.y, dirToShip.z) || 1;
            dirToShip.x/=dirLen; dirToShip.y/=dirLen; dirToShip.z/=dirLen;
            const id = `temp-ast-${this.ephemeralSpawnCounter++}`;
            const size = 0.6 + Math.random()*0.9; // 0.6..1.5
            const a = new Asteroid(id, spawnPos, size, dirToShip);
            // Marcar como temporal para filtros futuros (flag opcional)
            (a as any).isEphemeral = true;
            // Alinear propiedades físicas con asteroides de cluster
            const compositions = ['iron','silicate','carbonaceous','nickel','mixed'] as const;
            (a as any).composition = compositions[Math.floor(Math.random()*compositions.length)];
            // Albedo eliminado del modelo: no asignar
            (a as any).massTons = 50 + Math.floor(Math.random() * 101); // 50..150
            // Void mass 2..5u igual que los asteroides normales
            (a as any).voidMassUnits = 2 + Math.floor(Math.random() * 4);
            this.ephemeralAsteroids.push(a);
            // Register reactive destruction callback
            this.registerDestructionCallback(a);
            // Inicializar buffers si GL listo
            try { if (this.gl && !a.vertexBuffer) a.initBuffers(this.gl); } catch {}
          }
        }
      }
      // Actualizar y filtrar asteroides efímeros
      if (this.spaceship && this.ephemeralAsteroids.length) {
        const shipPos = this.spaceship.position;
        const updated: Asteroid[] = [];
        for (const a of this.ephemeralAsteroids) {
          try { a.update(deltaTime); } catch {}
          const dx = a.position.x - shipPos.x;
          const dy = a.position.y - shipPos.y;
          const dz = a.position.z - shipPos.z;
          const dist = Math.hypot(dx,dy,dz);
          if (dist <= 1000) {
            updated.push(a);
          } else {
            // Liberar recursos gráficos al eliminar
            try { if (this.gl && a.vertexBuffer) this.gl.deleteBuffer(a.vertexBuffer); } catch {}
          }
        }
        this.ephemeralAsteroids = updated;
      }
    } catch {}

    // Runtime portal traversal (outside Gate Rite cinematic)
    this.handlePortalTraversal(deltaTime);

    // Update audio listener pose and ship-related continuous sounds
    try {
      if (this.audio && this.camera) {
        const fwd = vec3Normalize({
          x: this.camera.target.x - this.camera.position.x,
          y: this.camera.target.y - this.camera.position.y,
          z: this.camera.target.z - this.camera.position.z,
        });
        // Listener at camera
        this.audio.setListenerPose({ ...this.camera.position }, fwd, { ...this.camera.up });
        // Estimate listener (camera) velocity
        try {
          if (this.lastCamPos) {
            const dt = Math.max(1e-6, deltaTime);
            this.camVel = {
              x: (this.camera.position.x - this.lastCamPos.x) / dt,
              y: (this.camera.position.y - this.lastCamPos.y) / dt,
              z: (this.camera.position.z - this.lastCamPos.z) / dt,
            };
          }
          this.lastCamPos = { ...this.camera.position };
        } catch {}
      }
      if (this.audioUnlocked && this.thrusterCtl && this.spaceship && !this.deathInProgress) {
        const state = this.spaceship.thrusterState;
        const speed = this.spaceship.currentSpeed;
        // Use base max (pre-rite) to allow audio to continue 100%→200% during the rite
        const baseMax = this.getShipBaseMaxSpeed();
        const speedOverBase = Math.max(0, Math.min(2, speed / Math.max(1e-6, baseMax))); // allow up to 200% mapping
        const speedNorm = speedOverBase; // pass extended [0..2] to audio
        // Map visual thruster states to an accel proxy [0..1]
        let accelNorm = 0.0;
        switch (state) {
          case ThrusterState.ACCELERATING: accelNorm = 1.0; break;
          case ThrusterState.BRAKING: accelNorm = 0.35; break;
          case ThrusterState.CRUISING: accelNorm = 0.15; break;
          case ThrusterState.IDLE: default: accelNorm = -0.25; break; // idle signal: slightly lower pitch/volume
        }
        // If at/near cap, pressing '+' shouldn't create an acceleration bump: treat as cruising
        // Treat as cruising when at cap (100% or 200% if rite active)
        const riteActive = this.isSpeedRiteActive();
        const atCap = riteActive ? (speedOverBase >= 1.995) : (speed / Math.max(1e-6, this.spaceship.maxSpeed) >= 0.995);
        if (atCap && state === ThrusterState.ACCELERATING) {
          accelNorm = 0.15;
        }
        // Keep thruster loop running even at idle (very low volume & slightly lower pitch)
        this.thrusterCtl.start(0.0);
        this.thrusterCtl.update(speedNorm, accelNorm);
      }

      // Near fly-by Doppler cues for asteroids/ships (throttled every other frame)
      try {
        if (this.audioUnlocked && this.audio && this.dopplerEnabled && this.camera && this.spaceship) {
          this.dopplerSkip = !this.dopplerSkip;
          const processThisFrame = !this.dopplerSkip; // skip every other frame to save CPU
          if (processThisFrame) {
            const shipPos = { ...this.spaceship.position };
            const listenerPos = { ...shipPos };
            const shipVelocity = this.spaceship.velocity
              ? { x: this.spaceship.velocity.x, y: this.spaceship.velocity.y, z: this.spaceship.velocity.z }
              : { x: this.camVel.x, y: this.camVel.y, z: this.camVel.z };
            const shipRadius = Math.max(2, this.spaceship.boundingSphere?.radius ?? this.spaceship.scale?.x ?? 0);
            const getObjectRadius = (obj: any): number => {
              const bound = obj?.boundingSphere?.radius;
              if (typeof bound === 'number' && isFinite(bound)) {
                return Math.max(0, bound);
              }
              if (typeof obj?.radius === 'number' && isFinite(obj.radius)) {
                return Math.max(0, obj.radius);
              }
              if (typeof obj?.size === 'number' && isFinite(obj.size)) {
                return Math.max(0, obj.size);
              }
              if (obj?.scale) {
                const sx = typeof obj.scale.x === 'number' ? obj.scale.x : 0;
                const sy = typeof obj.scale.y === 'number' ? obj.scale.y : sx;
                const sz = typeof obj.scale.z === 'number' ? obj.scale.z : sx;
                return Math.max(0, sx, sy, sz);
              }
              return 0;
            };
            const computeHullDistance = (obj: any): number => {
              const objRadius = getObjectRadius(obj);
              const dx = obj.position.x - shipPos.x;
              const dy = obj.position.y - shipPos.y;
              const dz = obj.position.z - shipPos.z;
              const centerDist = Math.hypot(dx, dy, dz);
              return Math.max(0, centerDist - shipRadius - objRadius);
            };
            const dt = Math.max(1e-6, deltaTime);
            const NEAR_IN = 10;  // enter radius with hysteresis (tighter proximity threshold)
            const FAR_OUT = 14;  // exit radius slightly larger to prevent flicker
            const MIN_SPEED = 2; // min relative speed to trigger
            const PREFERRED = 'sfx_passby';
            const ALT1 = 'sfx_flyby';
            const ALT2 = 'sfx_whoosh';

            // Select closest qualifying object (with stickiness) and ensure only one active cue
            let closestId: string | null = null;
            let closestPos: { x:number;y:number;z:number } | null = null;
            let closestVel: { x:number;y:number;z:number } | null = null;
            let closestDist = Infinity;
            // First pass: find absolute closest within NEAR_IN and above speed threshold
            for (const c of this.asteroidClusterService.getClusters()) {
              for (const o of c.objects) {
                const hullDistance = computeHullDistance(o);
                if (hullDistance > NEAR_IN) continue;
                const prev = this.lastObjPos.get(o.id) || { x: o.position.x, y: o.position.y, z: o.position.z };
                const ev = { x: (o.position.x - prev.x) / dt, y: (o.position.y - prev.y) / dt, z: (o.position.z - prev.z) / dt };
                const relV = { x: ev.x - shipVelocity.x, y: ev.y - shipVelocity.y, z: ev.z - shipVelocity.z };
                const relSpeed = Math.hypot(relV.x, relV.y, relV.z);
                if (relSpeed < MIN_SPEED) { this.lastObjPos.set(o.id, { x: o.position.x, y: o.position.y, z: o.position.z }); continue; }
                if (hullDistance < closestDist) {
                  closestDist = hullDistance; closestId = o.id; closestPos = { x:o.position.x, y:o.position.y, z:o.position.z }; closestVel = ev;
                }
              }
            }

            // Stickiness: if we already have an active cue, keep it until it truly exits or a much closer object appears
            const activeEntry = Array.from(this.gameState.dopplerCues.entries())[0]; // at most one after we enforce below
            if (activeEntry) {
              const [activeId, entry] = activeEntry;
              // Locate active object to measure distance
              let objPos: { x:number;y:number;z:number } | null = null;
              let activeObj: any = null;
              for (const c of this.asteroidClusterService.getClusters()) {
                const cand = c.objects.find((o: any) => o.id === activeId);
                if (cand) {
                  objPos = { x: cand.position.x, y: cand.position.y, z: cand.position.z };
                  activeObj = cand;
                  break;
                }
              }
              if (objPos) {
                const objRadius = getObjectRadius(activeObj);
                const dx = objPos.x - shipPos.x, dy = objPos.y - shipPos.y, dz = objPos.z - shipPos.z;
                const distCenter = Math.hypot(dx, dy, dz);
                const hullDist = Math.max(0, distCenter - shipRadius - objRadius);
                // If still within FAR_OUT, prefer to keep active unless a new target is significantly closer (15%).
                // Also: if no new candidate found, keep the active one while inside FAR_OUT (hysteresis hold).
                if (hullDist <= FAR_OUT && (!closestId || closestDist > hullDist * 0.85)) {
                  closestId = activeId; closestPos = objPos;
                  const prev = this.lastObjPos.get(activeId) || objPos;
                  closestVel = { x: (objPos.x - prev.x) / dt, y: (objPos.y - prev.y) / dt, z: (objPos.z - prev.z) / dt };
                  closestDist = hullDist;
                }
              }
            }

            // Update existing cue (and stop any extra entries)
            for (const [id, entry] of Array.from(this.gameState.dopplerCues.entries())) {
              if (id !== closestId) {
                try { entry.cue.stop(80); } catch {}
                this.gameState.dopplerCues.delete(id);
                continue;
              }
              if (!closestPos) { try { entry.cue.stop(80); } catch {}; this.gameState.dopplerCues.delete(id); continue; }
              const prev = this.lastObjPos.get(id) || closestPos;
              const ev = closestVel || { x: (closestPos.x - prev.x) / dt, y: (closestPos.y - prev.y) / dt, z: (closestPos.z - prev.z) / dt };
              entry.cue.update(closestPos, listenerPos, ev, shipVelocity);
              this.lastObjPos.set(id, closestPos);
            }

            // Create cue if we have a selected target and none is active
            if (closestId && !this.gameState.dopplerCues.has(closestId)) {
              const SOUND_NAME = this.audio.has(PREFERRED) ? PREFERRED : (this.audio.has(ALT1) ? ALT1 : ALT2);
              const p = closestPos!;
              const cue = this.audio.createDopplerCue({ name: SOUND_NAME, initialPos: { x: p.x, y: p.y, z: p.z }, baseVolume: 0.75, audibleRadius: 30, cUnits: 300, bus: 'sfx', loop: true });
              this.gameState.dopplerCues.set(closestId, { cue, started: performance.now() });
              this.lastObjPos.set(closestId, { x: p.x, y: p.y, z: p.z });
            }
          }
        }
      } catch {}
    } catch {}

    const now = performance.now();
    this.speedRiteSystem.tick(this.speedRiteHost, now);
    this.cachedSpeedRiteRemainingSec = this.speedRiteSystem.remainingSec(now);

    if (this.voidCocoonActiveUntilMs && now >= this.voidCocoonActiveUntilMs) {
      this.voidCocoonActiveUntilMs = null;
      this.voidCocoonLastImpactMs = 0;
    }

  // Actualizar efectos de partículas
  this.particleEffects.updateAmbientDust(this.spaceship, deltaTime);
    this.particleEffects.updateThrusterEffect(this.spaceship, deltaTime);
    this.particleEffects.updateDestructionDebris(this.camera, deltaTime);
    this.particleEffects.updateLandingDustBillboards(deltaTime);
    this.updateWeatherParticles(deltaTime);

    // Update active spell beams
    this.updateAnchoringPulseBeam(deltaTime);
    this.updateVoidKinesisBeam(deltaTime);
    this.planetDrainBeam.update(this.planetDrainHost, deltaTime);
    this.updateDisruptionBeam();

    // Actualizar cámara con nueva posición
    this.camera.update(this.spaceship, deltaTime);
    this.applyAtmosphereCameraJitter(deltaTime);
  // Update portals (spin)
  try { this.gameState.portals.forEach(p => p.update(deltaTime)); } catch {}

    // Asteroides sueltos eliminados: gestionamos solo clusters
  // Actualizar clusters: mueven su centro y sincronizan física común
  this.asteroidClusterService.updateClusters(deltaTime);
  // LOD por distancia con histéresis: toProxy=750u, toFull=700u, dwell=0.4s
  const lodChanged = this.asteroidClusterService.updateLOD(this.spaceship.position, deltaTime, { toProxy: 1050, toFull: 1000, dwell: 0.4, cooldown: 1.2 });
  if (lodChanged && this.gl) {
    // Re-crear buffers para objetos nuevos (y liberar proxies antiguos)
    this.asteroidClusterService.getClusters().forEach(c => {
      if (c.lodMode === 'proxy') {
        if (c.proxy && !c.proxy.vertexBuffer) c.proxy.initBuffers(this.gl!);
      } else {
        c.objects.forEach(o => { if (!o.vertexBuffer) o.initBuffers(this.gl!); });
      }
    });
    // Re-registrar targets según modo
    const normals: ITargetable[] = [];
    const supers: ITargetable[] = [];
    const clusters: ITargetable[] = [];
    this.asteroidClusterService.getClusters().forEach(c => {
      if (c.lodMode === 'proxy' && c.proxy) clusters.push(c.proxy as unknown as ITargetable);
      if (c.lodMode === 'full') {
        c.objects.forEach(o => {
          if ((o as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(o as unknown as ITargetable);
          else normals.push(o as unknown as ITargetable);
        });
      }
    });
    this.targetCatalog.register(TargetType.ASTEROID, normals);
    this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
    this.targetCatalog.register(TargetType.CLUSTER, clusters);

    // Transferencia estable de selección: solo si el clúster propietario del target actual cambia de LOD
    const current = this.adaptiveTargeting.getCurrentTarget();
    if (current) {
      const currentType = current.getTargetType();
      // Caso A: seleccionado es un miembro (asteroide/super) y su clúster colapsa a proxy
      if (currentType !== TargetType.CLUSTER) {
        const owner = this.asteroidClusterService
          .getClusters()
          .find(c => c.objects.some(o => o.id === current.id));
        if (owner && owner.lodMode === 'proxy' && owner.proxy) {
          // Persistir el miembro seleccionado para restaurar al expandir
          owner.lastSelectedMemberId = current.id;
          owner.freezeBySelection = true; // evitar flip inmediato que vuelva a mover selección
          this.reticleManager.selectTarget(owner.proxy as unknown as ITargetable);
        }
      } else {
        // Caso B: seleccionado es un proxy de clúster y su clúster expande a full
        // Nota: switchToFull() elimina el proxy; por tanto, no confíes solo en c.proxy para encontrar al dueño.
        const clusters = this.asteroidClusterService.getClusters();
        const suffix = '-cluster';
        const clusterId = current.id.endsWith(suffix) ? current.id.slice(0, -suffix.length) : current.id;
        const owner = clusters.find(c => (c.proxy && c.proxy.id === current.id) || c.id === clusterId);
        if (owner && owner.lodMode === 'full') {
          // Si hay un miembro previamente seleccionado, restaurarlo; si no, usar el primero
          const preferredId = owner.lastSelectedMemberId;
          const next = preferredId ? owner.objects.find(o => o.id === preferredId) : owner.objects?.[0];
          if (next) this.reticleManager.selectTarget(next as unknown as ITargetable);
          owner.freezeBySelection = true; // proteger un ciclo de LOD tras restaurar
        }
      }
    }
  }

  
  // Aplicar update a cada objeto del cluster (mueve posición según direction/driftSpeed) o proxy
  this.asteroidClusterService.getClusters().forEach(c => {
    if (c.lodMode === 'proxy') {
      if (c.proxy) c.proxy.update(deltaTime);
    }
    // Limpiar la bandera de freeze tras aplicar el frame
    if (c.freezeBySelection) c.freezeBySelection = false;
  });
  // Centro conduce a los miembros en 'full': evita integrar física por objeto
  this.asteroidClusterService.applyCenterDrivenFullUpdate(deltaTime);
  // Actualizar órbitas de planetas
  this.updatePlanets(deltaTime);
  // Persistencia: no re-centrar por defecto; dejamos vivir alrededor del centro
  // (Si se desea contención, llamar a enforceBoundsRelativeToCenter(threshold) aquí)

    // Superasteroides sueltos eliminados: vienen del cluster

    // Actualizar sistema de targeting con objetos disponibles (catálogo genérico)
  let availableTargets = this.targetCatalog.getAllTargets();
  // Tortuga estelar: target seleccionable (y destruible). Registra su callback de destrucción una vez.
  try {
    const turtle = this.spaceTurtleSystem.getRenderable();
    if (turtle && turtle.isActive()) {
      if (this.registeredTurtleId !== turtle.id) {
        this.registeredTurtleId = turtle.id;
        this.registerDestructionCallback(turtle);
      }
      if (!availableTargets.some(t => t.id === turtle.id)) availableTargets.push(turtle as unknown as ITargetable);
    }
  } catch {}
  // Estación espacial: el CUERPO es seleccionable (radio de selección propio, sin colisión) y cada PUERTO
  // ("Puerto espacial") también, acoplable o no. Ver ESTACIONES §1.2.1.
  try {
    const stationBody = this.spaceStationSystem.getRenderable();
    if (stationBody && stationBody.isActive() && !availableTargets.some(t => t.id === stationBody.id)) {
      availableTargets.push(stationBody as unknown as ITargetable);
    }
    for (const port of this.spaceStationSystem.getPorts()) {
      if (port.isActive() && !availableTargets.some(t => t.id === port.id)) {
        availableTargets.push(port as unknown as ITargetable);
      }
    }
  } catch {}
  // Estaciones telaraña arácnidas (Fase 15): seleccionables y destruibles.
  try {
    for (const web of this.aracnidWar.getStations()) {
      if (web.isActive() && !availableTargets.some(t => t.id === web.id)) {
        availableTargets.push(web as unknown as ITargetable);
      }
    }
  } catch {}
  // Incluir asteroides efímeros como targets adicionales (tipo ASTEROID)
  try {
    if (this.ephemeralAsteroids.length) {
      const ephemeralsActive = this.ephemeralAsteroids.filter(a => a.isActive && a.isActive());
      if (ephemeralsActive.length) {
        // Registrar en catálogo si no están ya
        const existing = this.targetCatalog.getByType(TargetType.ASTEROID).map(t => t.id);
        const toAdd = ephemeralsActive.filter(a => !existing.includes(a.id));
        if (toAdd.length) {
          const merged = [...this.targetCatalog.getByType(TargetType.ASTEROID), ...toAdd];
          this.targetCatalog.register(TargetType.ASTEROID, merged as ITargetable[]);
        }
      }
      // Añadir a lista de disponibles sin duplicar
      for (const a of ephemeralsActive) {
        if (!availableTargets.some(t => t.id === a.id)) availableTargets.push(a as ITargetable);
      }
    }
  } catch {}
  // Incluir asteroides independientes (eyectados de clusters) como targets adicionales
  try {
    if (this.gameState.independentAsteroids.length) {
      const independentsActive = this.gameState.independentAsteroids.filter(a => a.isActive && a.isActive());
      if (independentsActive.length) {
        // Registrar en catálogo si no están ya
        const existing = this.targetCatalog.getByType(TargetType.ASTEROID).map(t => t.id);
        const toAdd = independentsActive.filter(a => !existing.includes(a.id));
        if (toAdd.length) {
          const merged = [...this.targetCatalog.getByType(TargetType.ASTEROID), ...toAdd];
          this.targetCatalog.register(TargetType.ASTEROID, merged as ITargetable[]);
        }
      }
      // Añadir a lista de disponibles sin duplicar
      for (const a of independentsActive) {
        if (!availableTargets.some(t => t.id === a.id)) availableTargets.push(a as ITargetable);
      }
    }
  } catch {}
  // Excluir completamente los clusters (proxies y miembros) si su centro está a >20,000u de la nave
  try {
    const farClusterIds = new Set<string>();
    const farMemberIds = new Set<string>();
    for (const c of this.asteroidClusterService.getClusters()) {
      const dxS = c.center.x - this.spaceship.position.x;
      const dyS = c.center.y - this.spaceship.position.y;
      const dzS = c.center.z - this.spaceship.position.z;
      const distShip = Math.hypot(dxS, dyS, dzS);
      if (distShip > 20000) {
        if (c.proxy) farClusterIds.add(c.proxy.id);
        for (const o of c.objects) farMemberIds.add(o.id);
      }
    }
    if (farClusterIds.size || farMemberIds.size) {
      availableTargets = availableTargets.filter(t => !farClusterIds.has(t.id) && !farMemberIds.has(t.id));
    }
  } catch {}
  // Filtro: mega-asteroides de ciertos anillos (Tierra, Saturno) no seleccionables hasta estar "cerca"
  // Cerca = nave a < 20,000u de cada megaasteroide; en distancias medias se dibujan, pero no aparecen como target
  try {
    const NEAR_RANGE = 20000;
    const gatedPlanetIds = [EARTH_PLANET_ID, RINGED_PLANET_ID];
    const allGated = new Set<string>();
    const allowedNear = new Set<string>();
    for (const pid of gatedPlanetIds) {
      const arr = this.planetDebris.get(pid);
      if (!arr || !arr.length) continue;
      for (const d of arr) {
        allGated.add(d.obj.id);
        const dx = d.obj.position.x - this.spaceship.position.x;
        const dy = d.obj.position.y - this.spaceship.position.y;
        const dz = d.obj.position.z - this.spaceship.position.z;
        const distShip = Math.hypot(dx, dy, dz);
        if (distShip < NEAR_RANGE) allowedNear.add(d.obj.id);
      }
    }
    if (allGated.size) {
      availableTargets = availableTargets.filter(t => !allGated.has(t.id) || allowedNear.has(t.id));
    }
  } catch {}

  // Asegurar que el target actualmente seleccionado no se pierda por filtros de distancia
  try {
    const currentSel = this.adaptiveTargeting.getCurrentTarget?.();
    if (currentSel && !availableTargets.some(t => t.id === currentSel.id)) {
      availableTargets = [currentSel, ...availableTargets];
    }
  } catch {}
    
    // Debug ocasional para verificar targets
    if (Math.random() < 0.001) { // 0.1% chance
      this.logger.log(LogLevel.DEBUG, LogCategory.TARGETING, 'GameEngine targets update', {
        asteroidCount: 0 /* TODO: Get from cluster service */,
        targetCount: availableTargets.length,
        firstTarget: availableTargets[0]?.getDisplayName() || 'none'
      });
    }
    
    // DEBUG CRÍTICO - Verificar llamada (increased frequency for testing)
    if (performance.now() % 5000 < 50) { // Cada 5 segundos aprox para testing
      this.logger.log(LogLevel.DEBUG, LogCategory.TARGETING, 'AdaptiveTargeting.update()', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        asteroids: this.targetCatalog.getByType(TargetType.ASTEROID).length,
        targets: availableTargets.length,
        firstTarget: availableTargets[0]?.getDisplayName() || 'none',
        adaptiveTargeting: !!this.adaptiveTargeting,
        reticleManager: !!this.reticleManager
      });
    }
    
    // Update ReticleManager first to get mouse position
    this.reticleManager.update(deltaTime, availableTargets);
    
    // Get mouse position from ReticleManager
    const mousePos = this.reticleManager.getDebugSnapshot().mouse;
    
    // Check if any UI panel occludes the 3D scene (prevents 3D hover when interacting with panels)
    const mapOccludes = this.systemPanel?.containsPoint?.(mousePos.x, mousePos.y) ?? false;
    const grimoireOccludes = this.grimoirePanel?.containsPoint?.(mousePos.x, mousePos.y) ?? false;
    const inventoryOccludes = this.inventoryPanel?.containsPoint?.(mousePos.x, mousePos.y) ?? false;
    const skipDetection = mapOccludes || grimoireOccludes || inventoryOccludes;
    
      this.updateLandingTelemetry(availableTargets);

    // Update adaptive targeting system (performs detection and maintains mouse velocity)
    if (this.adaptiveTargeting) {
      this.adaptiveTargeting.update(deltaTime, availableTargets, mousePos, skipDetection);
    } else {
      this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'AdaptiveTargeting not initialized yet');
    }

  // Update target preview animation regardless of selection
  this.targetPreview.update(deltaTime);

  // Drive HUD Target Panel from hovered/selected targets using adaptive system
    const hovered = this.adaptiveTargeting.getHoveredTarget();
    const selected = this.adaptiveTargeting.getCurrentTarget() || hovered;

    // Sync selection to SolarSystemPanel (Map) when it is open
    try {
      if (this.systemPanel && this.systemPanel.isEnabled()) {
        const currentSelected = this.adaptiveTargeting.getCurrentTarget?.();
        const currentSelectedMapId = currentSelected ? this.resolveMapIdForTarget(currentSelected) : null;
        const panelSelectedId = (this.systemPanel as any).getSelectedId?.() || null;
        // Only update the map if the selection actually changed
        if ((currentSelectedMapId || null) !== (panelSelectedId || null)) {
          try { this.systemPanel.setSelectedId(currentSelectedMapId); } catch {}
        }
      }
    } catch {}
    // Backfill planet-specific runtime props if selected
    if (selected && selected.getTargetType && selected.getTargetType() === TargetType.PLANET) {
      const p: any = selected as any;
      const remaining = typeof p.voidMassRemaining === 'number' ? p.voidMassRemaining : p.voidMassUnits;
      p.voidMassUnits = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
      if (!p.customName) {
        p.customName = this.generatePlanetName();
      }
      // Optionally compute and cache approximate volume in Gu for quick lookup
      if (p && p.scale && typeof p.scale.x === 'number' && p.scale.x > 0) {
        const r = Number(p.scale.x);
  const vol = (4.0 / 3.0) * Math.PI * Math.pow(r, 3);
  p.volumeMu = Number((vol / 1e6).toFixed(2));
      }
    }
  // Inform preview renderer of which target we’re showing to adapt rotation speed
  this.targetPreview.setPreviewTarget(selected || null);
    if (selected) {
      // Distance (edge by default, center for portal)
      const distanceRaw = this.getDisplayDistanceToTarget(selected);
      const distance = Number.isFinite(distanceRaw) ? distanceRaw : 0;

    // Relation via shared service to stay in sync with Outliner/Reticle
  const relation = this.relationService.getRelation(selected);
  const selType = selected.getTargetType();

      // Render preview into offscreen canvas
      this.targetPreview.renderPreview(selected);
      if (Math.random() < 0.01) {
        this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'TargetPreview status', (this.targetPreview as any).getStatus?.());
      }
  const previewCanvas = this.targetPreview.getCanvas();

    // Details: fetch async once per different selection (simple cache by id)
      // For now, fire-and-forget; the HUD will be updated next frame when resolved
      this.fetchAndCacheTargetDetails(selected);

  const baseDetails = this._targetDetailsCache?.[selected.id] || this.getFallbackDetails(selected);
  // Añadir propiedades visibles comunes: masa del vacío del objeto si existe
  const voidMass = (selected as any).voidMassUnits ?? 0;
  
  // Label de tipo por subtipo específico (fuente única en game-object.types)
  const objectType = (selected as unknown as GameObject)?.getType?.() || GameObjectType.UNKNOWN;
  const typeLabel = getSpecificDisplayLabel(objectType, selType);

      // Include planet-specific hints when selected is a planet
      const planetIntel = selType === TargetType.PLANET ? this.buildPlanetIntelDetails(selected as Planet) : null;
      const planetHints = (selType === TargetType.PLANET)
        ? {
            planetType: (selected as any).planetType || (baseDetails as any)?.planetType || (selected as any).baseColorName,
            probabilityOfLifePct: (selected as any).probabilityOfLifePct ?? (baseDetails as any)?.probabilityOfLifePct ?? 0,
            volumeMu:
              (selected as any).volumeMu
              ?? (baseDetails as any)?.volumeMu
              ?? (typeof (baseDetails as any)?.volumeGu === 'number'
                    ? Number(((baseDetails as any).volumeGu * 1000).toFixed(2))
                    : undefined),
            ...(planetIntel || {}),
          }
        : {};
      // Update health values only every 250ms to reduce overhead (but always include them)
      const now = performance.now();
      const shouldUpdateHealth = (now - this.lastHealthUpdateTime) >= this.healthUpdateInterval;
      
      // Always get current health values
      const healthCurrent = (selected as any).healthCurrent ?? (baseDetails as any)?.healthCurrent ?? 100;
      const healthMax = (selected as any).healthMax ?? (baseDetails as any)?.healthMax ?? 100;
      
      // Calculate percentage (either cached or fresh)
      let healthPct: number;
      if (shouldUpdateHealth) {
        healthPct = (healthCurrent && healthMax) ? Math.round((healthCurrent / healthMax) * 100) : 100;
        this.lastHealthUpdateTime = now;
      } else {
        // Use last calculated value or recalculate if first time
        healthPct = (healthCurrent && healthMax) ? Math.round((healthCurrent / healthMax) * 100) : 100;
      }
      
      const healthData = { healthCurrent, healthMax, healthPct };
      
      const details = { ...baseDetails, ...planetHints, ...healthData, type: typeLabel, previewStatus: (this.targetPreview as any).getStatus?.(), voidMassUnits: voidMass } as any;

      this.hudManager.updateTargetPanel({
        name: selected.getDisplayName(),
        distance,
        relation,
        previewCanvas,
        details,
        active: true
      });
    } else {
      this.hudManager.clearTargetPanel();
    }

    // Detectar colisiones
    this.shipCollisionSystem.checkCollisions(this.shipCollisionHost);

    // Landing system removed
  }

  // Landing system removed

  // --- Helpers for landing system ---
  private raySphere(ro: { x: number; y: number; z: number }, rd: { x: number; y: number; z: number }, center: { x: number; y: number; z: number }, radius: number): { t: number; point: { x: number; y: number; z: number } } | null {
    const ox = ro.x - center.x, oy = ro.y - center.y, oz = ro.z - center.z;
    const b = ox * rd.x + oy * rd.y + oz * rd.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    let t = -b - sqrt;
    if (t <= 1e-6) t = -b + sqrt;
    if (t <= 1e-6) return null;
    return { t, point: { x: ro.x + rd.x * t, y: ro.y + rd.y * t, z: ro.z + rd.z * t } };
  }

  private projectOntoPlane(v: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }) {
    const dot = v.x * n.x + v.y * n.y + v.z * n.z;
    return { x: v.x - dot * n.x, y: v.y - dot * n.y, z: v.z - dot * n.z };
  }

  private worldToNDC(p: { x: number; y: number; z: number }): { x: number; y: number } {
    const v = new Float32Array([p.x, p.y, p.z, 1]);
    const view = this.camera.viewMatrix as unknown as Float32Array;
    const proj = this.camera.projectionMatrix as unknown as Float32Array;
    const vx = view[0] * v[0] + view[4] * v[1] + view[8]  * v[2] + view[12] * v[3];
    const vy = view[1] * v[0] + view[5] * v[1] + view[9]  * v[2] + view[13] * v[3];
    const vz = view[2] * v[0] + view[6] * v[1] + view[10] * v[2] + view[14] * v[3];
    const vw = view[3] * v[0] + view[7] * v[1] + view[11] * v[2] + view[15] * v[3];
    const cx = proj[0] * vx + proj[4] * vy + proj[8]  * vz + proj[12] * vw;
    const cy = proj[1] * vx + proj[5] * vy + proj[9]  * vz + proj[13] * vw;
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;
    const invW = cw !== 0 ? 1 / cw : 1;
    return { x: cx * invW, y: cy * invW };
  }

  private registerDefaultAuxiliaryAbilities(): void {
    const definitions: Array<Omit<AuxiliaryAbilityRuntime, 'activationKey' | 'lastUsedAtMs'>> = [
      {
        id: 'aux-life-scanner',
        label: 'Escáner Auxiliar de Habitantes',
        description: 'Revela habitantes y seres menores de planetas a < 500u.',
        cooldownMs: 8000,
        handler: () => this.executeAuxiliaryLifeScanner(),
      },
      {
        id: 'aux-atmo-stabilizer',
        label: 'Estabilizador Vectorial Atmosférico',
        description: 'Cancela el auto-vector y amortigua turbulencias durante 6s.',
        cooldownMs: 16000,
        handler: () => this.executeAuxiliaryAtmosphereStabilizer(),
      },
    ];
    this.auxiliaryAbilities = definitions.map((def, idx) => {
      const bindingAction = this.auxiliaryBindingActions[idx];
      const activationKey = this.resolveAuxiliaryActivationKey(bindingAction);
      return {
        ...def,
        activationKey,
        lastUsedAtMs: -Infinity,
      };
    });
  }

  private resolveAuxiliaryActivationKey(action: GameAction | undefined): string {
    if (!action) {
      return '?';
    }
    try {
      const current = this.keyBindings?.get(action);
      if (current && current.trim().length > 0) {
        return current;
      }
      return this.keyBindings?.getDefaultKey(action) || '?';
    } catch {
      return '?';
    }
  }

  private tryActivateAuxiliaryAbilityForKey(key: string): boolean {
    if (!/^[1-4]$/.test(key)) {
      return false;
    }
    const ability = this.auxiliaryAbilities[parseInt(key, 10) - 1];
    if (!ability) {
      return false;
    }
    const now = performance.now();
    const remainingMs = ability.cooldownMs - (now - ability.lastUsedAtMs);
    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      try { this.showPlaceholderText(`Bahía auxiliar en enfriamiento (${seconds}s)`, 1400); } catch {}
      return true;
    }
    const success = ability.handler();
    ability.lastUsedAtMs = success ? now : ability.lastUsedAtMs;
    return true;
  }

  private executeAuxiliaryLifeScanner(): boolean {
    if (!this.spaceship) {
      try { this.showPlaceholderText('Escáner auxiliar inactivo (sin nave)', 1600); } catch {}
      return false;
    }
    const target = this.adaptiveTargeting?.getCurrentTarget?.() || this.reticleManager?.getCurrentTarget?.();
    if (!target) {
      try { this.showPlaceholderText('Selecciona un planeta para escanear', 1600); } catch {}
      return false;
    }
    const asAny = target as any;
    const targetType = typeof asAny?.getTargetType === 'function' ? asAny.getTargetType() : null;
    const isPlanet = targetType === TargetType.PLANET || asAny?.getType?.() === GameObjectType.PLANET;
    if (!isPlanet || typeof asAny?.markLifeScanned !== 'function') {
      try { this.showPlaceholderText('El objetivo actual no es un planeta escaneable', 1700); } catch {}
      return false;
    }
    const planet = asAny as Planet;
    const surfaceDistance = this.getSurfaceDistanceToPlanet(planet);
    const range = 500;
    if (surfaceDistance == null || surfaceDistance > range) {
      const readable = surfaceDistance != null ? Math.round(surfaceDistance) : '∞';
      try { this.showPlaceholderText(`Planeta fuera de alcance (${readable}u)`, 1700); } catch {}
      return false;
    }
    const previouslyLifeScanned = !!planet.lifeScanned;
    const previouslyCreatureScanned = !!planet.creatureScanned;
    try { planet.markLifeScanned(); } catch { (planet as any).lifeScanned = true; }
    try { planet.markCreatureScanned(); } catch { (planet as any).creatureScanned = true; }

    if (!previouslyLifeScanned && planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE) {
      try { this.characterProfileService.registerExperienceEvent(ExperienceEventType.NEW_SPECIES_DISCOVERED); } catch {}
    }

    const inhabitantLabel = planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE
      ? (PLANET_INHABITANT_LABELS[planet.inhabitants] ?? 'Habitantes detectados')
      : PLANET_INHABITANT_LABELS[PlanetInhabitants.NONE];
    const creatureLabel = planet.lesserBeing
      ? (LESSER_BEING_LABELS[planet.lesserBeing] ?? 'Presencia anómala detectada')
      : LESSER_BEING_LABELS[LesserBeing.NONE];

    const hasCivilization = planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE;
    planet.civilizationIntelStatus = hasCivilization
      ? PLANET_INTEL_STATUS.CONFIRMED_PRESENT
      : PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
    const hasLesserBeing = planet.lesserBeing && planet.lesserBeing !== LesserBeing.NONE;
    planet.lesserBeingIntelStatus = hasLesserBeing
      ? PLANET_INTEL_STATUS.CONFIRMED_PRESENT
      : PLANET_INTEL_STATUS.CONFIRMED_ABSENT;
    try { this.gameState.syncPlanetIntelFromPlanet(planet); } catch {}

    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Auxiliary scanner executed', {
      planetId: planet.id,
      inhabitants: inhabitantLabel,
      lesserBeing: creatureLabel,
      range,
      surfaceDistance,
    });
    try {
      this.showPlaceholderText(`ESCÁNER AUX: ${planet.getDisplayName()}\n${inhabitantLabel} / ${creatureLabel}`, 2600);
    } catch {}
    return true;
  }

  private executeAuxiliaryAtmosphereStabilizer(): boolean {
    if (!this.isAtmosphereSceneActive()) {
      try { this.showPlaceholderText('El estabilizador solo funciona dentro de una atmósfera activa', 1800); } catch {}
      return false;
    }
    const now = performance.now();
    this.atmosphereManualStabilityUntilMs = now + this.ATMOSPHERE_STABILITY_DURATION_MS;
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Atmosphere stabilizer engaged', {
      durationMs: this.ATMOSPHERE_STABILITY_DURATION_MS,
    });
    try { this.showPlaceholderText('Estabilizador vectorial activo (6s)', 1500); } catch {}
    try {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.WARNING,
        'Estabilizador vectorial activo — autopilot suprimido',
        { dedupeKey: 'atmo-stabilizer-active', force: true }
      );
    } catch {}
    return true;
  }

  private isAtmosphereStabilityActive(): boolean {
    if (this.atmosphereManualStabilityUntilMs <= 0) {
      return false;
    }
    const now = performance?.now?.() ?? Date.now();
    return now < this.atmosphereManualStabilityUntilMs;
  }

  private isAtmosphereLandingCinematicShieldActive(): boolean {
    return !!this.atmosphereLandingCinematicActive || this.landingPanelController.isAwaitingUser;
  }

  private getNowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  private extendLandingThreatSuppression(windowMs: number): void {
    this.landingThreatSuppression.extend(this.getNowMs(), windowMs);
  }

  private isLandingThreatSuppressed(): boolean {
    if (this.isAtmosphereLandingCinematicShieldActive()) {
      return true;
    }
    return this.landingThreatSuppression.isActive(this.getNowMs());
  }

  private resetLandingThreatSuppression(): void {
    this.landingThreatSuppression.reset();
  }

  private extendAtmosphereCollisionGrace(windowMs: number): void {
    this.atmosphereCollisionGrace.extend(this.getNowMs(), windowMs);
  }

  private isAtmosphereCollisionGraceActive(): boolean {
    if (this.isAtmosphereLandingCinematicShieldActive()) {
      return true;
    }
    return this.atmosphereCollisionGrace.isActive(this.getNowMs());
  }

  private getAtmosphereStabilityForceScale(): number {
    if (!this.isAtmosphereStabilityActive()) {
      return 1;
    }
    const now = performance?.now?.() ?? Date.now();
    const remaining = Math.max(0, this.atmosphereManualStabilityUntilMs - now);
    const normalized = Math.min(1, remaining / this.ATMOSPHERE_STABILITY_DURATION_MS);
    return this.ATMOSPHERE_STABILITY_FORCE_SCALE
      + (1 - this.ATMOSPHERE_STABILITY_FORCE_SCALE) * (1 - normalized);
  }

  private getSurfaceDistanceToPlanet(planet: Planet): number | null {
    if (!planet || !this.spaceship) {
      return null;
    }
    const shipPos = this.spaceship.position;
    const dx = planet.position.x - shipPos.x;
    const dy = planet.position.y - shipPos.y;
    const dz = planet.position.z - shipPos.z;
    const distanceToCenter = Math.hypot(dx, dy, dz);
    if (!isFinite(distanceToCenter)) {
      return null;
    }
    const radius = Math.max(0, planet.scale?.x ?? 0);
    return Math.max(0, distanceToCenter - radius);
  }

  private buildPlanetIntelDetails(target: Planet | null): LandingPlanetIntel {
    const defaults: LandingPlanetIntel = {
      planetInhabitantsDisplay: 'Desconocido',
      planetLesserBeingDisplay: 'Desconocido',
      planetLifeIntelKnown: false,
      planetCreatureIntelKnown: false,
      planetHasKnownSpecies: false,
      planetVisited: false,
    };
    if (!target) return defaults;

    const inhabitantsKey = target.inhabitants ?? PlanetInhabitants.NONE;
    const hasKnownSpecies = !!target.lifeScanned && inhabitantsKey !== PlanetInhabitants.NONE;
    const inhabitantsDisplay = (() => {
      if (!target.lifeScanned) {
        return 'Desconocido';
      }
      if (inhabitantsKey === PlanetInhabitants.NONE) {
        return PLANET_INHABITANT_LABELS[PlanetInhabitants.NONE];
      }
      return PLANET_INHABITANT_LABELS[inhabitantsKey] ?? this.humanizeEnumValue(String(inhabitantsKey));
    })();

    const hasLesserBeing = target.lesserBeing && target.lesserBeing !== LesserBeing.NONE;
    const lesserBeingDisplay = (() => {
      if (!target.creatureScanned) {
        return 'Desconocido';
      }
      if (!hasLesserBeing) {
        return LESSER_BEING_LABELS[LesserBeing.NONE];
      }
      return LESSER_BEING_LABELS[target.lesserBeing as LesserBeing]
        ?? this.humanizeEnumValue(String(target.lesserBeing));
    })();

    return {
      planetInhabitantsDisplay: inhabitantsDisplay,
      planetLesserBeingDisplay: lesserBeingDisplay,
      planetLifeIntelKnown: !!target.lifeScanned,
      planetCreatureIntelKnown: !!target.creatureScanned,
      planetHasKnownSpecies: hasKnownSpecies,
      planetVisited: !!target.visited,
    };
  }

  private humanizeEnumValue(value: string): string {
    return humanizeEnumValue(value);
  }

  // Ensure display-friendly properties exist synchronously to avoid one-frame stale labels
  private prepareDisplayPropsForTarget(target: ITargetable): void {
    try {
      const tt = target.getTargetType?.();
      if (tt === TargetType.PLANET) {
        const p: any = target as any;
        const intrinsicVoidMass = typeof p.voidMassRemaining === 'number' ? p.voidMassRemaining : p.voidMassUnits;
        p.voidMassUnits = Number.isFinite(intrinsicVoidMass) ? Math.max(0, intrinsicVoidMass) : 0;
        if (!p.customName) {
          p.customName = this.generatePlanetName();
        }
        if (p && p.scale && typeof p.scale.x === 'number' && p.scale.x > 0 && (typeof p.volumeMu !== 'number' || !isFinite(p.volumeMu))) {
          const r = Number(p.scale.x);
          const vol = (4.0 / 3.0) * Math.PI * Math.pow(r, 3);
          p.volumeMu = Number((vol / 1e6).toFixed(2));
        }
      } else if (tt && String(tt).toLowerCase().includes('asteroid')) {
        const a: any = target as any;
        if (!(typeof a.voidMassUnits === 'number' && isFinite(a.voidMassUnits) && a.voidMassUnits > 0)) {
          // Align with normal asteroid 2–5u by default
          a.voidMassUnits = 2 + Math.floor(Math.random() * 4);
        }
      }
    } catch {}
  }

  private async fetchAndCacheTargetDetails(target: ITargetable) {
    const cache = (this._targetDetailsCache ||= {});
    if (cache[target.id]) return; // Already have details
    try {
  const res = await this.targetDetails.getDetails(target);
      // Decorate asteroid details with fantastical metals when applicable
      if (res.type === TargetType.ASTEROID) {
        // No sobreescribir composición/albedo/mass si ya vienen fijados por la factoría
        const data: any = res.data as any;
        data.composition = data.composition ?? (target as any).composition ?? 'mixed';
        // Albedo eliminado: no incluir en detalles
        data.massTons = data.massTons ?? (target as any).massTons ?? (50 + Math.floor(Math.random() * 101));
        // Incluir masa del vacío si el target la expone
        data.voidMassUnits = (target as any).voidMassUnits ?? 0;
      }
      // Enrich planets with requested details if missing
      if (res.type === TargetType.PLANET) {
        const data: any = res.data as any;
        const planetTarget: any = target as any;
        // Planet type: prefer Planet.planetType enum, fallback to baseColorName
        if (!('planetType' in data)) {
          data.planetType = planetTarget?.planetType ?? (planetTarget?.baseColorName ? String(planetTarget.baseColorName) : 'unknown');
        }
        // Probability of Life: default to 0 if missing
        if (typeof (data as any).probabilityOfLifePct !== 'number' || !isFinite((data as any).probabilityOfLifePct)) {
          (data as any).probabilityOfLifePct = 0;
        }
        const remainingVoidMass = typeof planetTarget?.voidMassRemaining === 'number' && isFinite(planetTarget.voidMassRemaining)
          ? Math.max(0, planetTarget.voidMassRemaining)
          : undefined;
        if (typeof data.voidMassUnits !== 'number' || !isFinite(data.voidMassUnits)) {
          data.voidMassUnits = typeof remainingVoidMass === 'number' ? remainingVoidMass : 0;
        } else if (typeof remainingVoidMass === 'number') {
          data.voidMassUnits = remainingVoidMass;
        }
        // If an older service returns volumeGu, convert to Mu
        if (typeof (data as any).volumeMu !== 'number' && typeof (data as any).volumeGu === 'number') {
          (data as any).volumeMu = Number(((data as any).volumeGu * 1000).toFixed(2));
        }
        // Volume in Mu (Mega units) ≈ (4/3 π r^3) / 1e6 (compute if still missing)
        if (typeof (data as any).volumeMu !== 'number' || !isFinite((data as any).volumeMu)) {
          const r = Number(planetTarget?.scale?.x ?? planetTarget?.radius ?? 0);
          const vol = (4.0 / 3.0) * Math.PI * Math.pow(Math.max(0, r), 3);
          (data as any).volumeMu = Number.isFinite(vol) ? Number((vol / 1e6).toFixed(2)) : 0;
        }
        // Random planet-like name if none provided
        if (!planetTarget.customName) {
          planetTarget.customName = this.generatePlanetName();
        }
        if (!('name' in data) || !data.name) {
          data.name = planetTarget.customName;
        }
      }
      cache[target.id] = res.data;
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'Target details fetch failed', e);
    }
  }

  private getFallbackDetails(target: ITargetable) {
    if (target.getTargetType() === TargetType.ASTEROID) {
      return { composition: 'basalt', massTons: 1200 };
    }
    if (target.getTargetType() === TargetType.PLANET) {
      const p: any = target as any;
      let name = p?.customName as string | undefined;
      if (!name) {
        name = this.generatePlanetName();
        try { (p as any).customName = name; } catch {}
      }
  const r = Number(p?.scale?.x ?? p?.radius ?? 0);
  const volumeMu = Number((((4.0 / 3.0) * Math.PI * Math.pow(Math.max(0, r), 3)) / 1e6).toFixed(2));
  const voidMassUnits = typeof p?.voidMassRemaining === 'number' && isFinite(p.voidMassRemaining)
    ? Math.max(0, p.voidMassRemaining)
    : 0;
  const planetType = p?.planetType ?? (p?.baseColorName ? String(p.baseColorName) : 'unknown');
  const probabilityOfLifePct = (() => {
    const raw = Number(p?.probabilityOfLifePct);
    if (Number.isFinite(raw)) {
      return Math.max(0, Math.min(100, Math.round(raw)));
    }
    return 0;
  })();
  return { name, planetType, volumeMu, voidMassUnits, probabilityOfLifePct };
    }
    return {};
  }

  // Generate a random planet name inspired by discovered exoplanets and classical naming
  private generatePlanetName(): string {
    // Delegate to SolarSystemService so names are unique across systems
    try {
      const svc = this.solarSystemService as any;
      if (svc && typeof svc.generateUniquePlanetName === 'function') {
        return svc.generateUniquePlanetName();
      }
    } catch {}
    return generateFallbackPlanetName();
  }

  /**
   * Apply damage to a game object and destroy it if health depletes
   */
  private applyDamageToObject(obj: any, damage: number): void {
    if (!obj || typeof obj.healthCurrent !== 'number' || typeof obj.healthMax !== 'number') {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Cannot apply damage - invalid health properties', { 
        id: obj?.id, 
        hasHealthCurrent: typeof obj?.healthCurrent === 'number',
        hasHealthMax: typeof obj?.healthMax === 'number'
      });
      return;
    }
    
    // Primer golpe a algo arácnido (estación o caza): se acabó la neutralidad (Fase 15).
    if (damage > 0 && (obj instanceof AracnidWebStation || obj instanceof AracnidFighterBeing)) {
      this.aracnidWar.notifyPlayerAggression(this.aracnidWarHost);
    }

    const prevHealth = obj.healthCurrent;
    obj.healthCurrent = Math.max(0, obj.healthCurrent - damage);

    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Object damaged', {
      id: obj.id, 
      damage, 
      prevHealth: prevHealth.toFixed(0), 
      newHealth: obj.healthCurrent.toFixed(0),
      healthMax: obj.healthMax,
      willDestroy: obj.healthCurrent <= 0
    });
    
    // Destruction is now handled reactively by GameObject.healthCurrent setter
    // No need for manual check here - the callback will fire automatically
  }

  // ══ Armamento del jugador (Fase 12): delegadores; el cableado vive en WeaponEngineBridge ══

  /** Rota el arma seleccionada (tecla R / shift+R). */
  public cycleWeapon(previous: boolean): void {
    const definition = this.weaponBridge.cycle(previous);
    if (definition) {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, `ARMA: ${definition.label.toUpperCase()}`);
    }
  }

  /** Gatillo mantenido (botón derecho del ratón en vuelo). */
  public setWeaponTriggerHeld(held: boolean): void {
    this.weaponBridge.setTriggerHeld(held);
  }

  /**
   * Monta un arma en la nave (recompensa de misión, compra o herramienta de depuración).
   * `ensureSlot` abre un anclaje si están todos ocupados: exclusivo del overlay de depuración.
   */
  public installShipWeapon(weaponId: WeaponId, options?: { ensureSlot?: boolean }): boolean {
    return this.weaponBridge.install(weaponId, options);
  }

  /** Aplica un equipamiento completo (carga de partida, mejoras de raza). */
  public applyShipOutfit(outfit: ShipOutfitState | null | undefined): void {
    this.weaponBridge.applyOutfit(outfit);
  }

  /** Host de las mejoras de nave que otorgan las razas (Fase 13). */
  private readonly outfittingHost: ShipOutfittingHost = {
    getShip: () => this.spaceship ?? null,
    getOutfit: () => this.weaponBridge.getOutfit(),
    applyOutfit: (outfit) => this.weaponBridge.applyOutfit(outfit),
    installWeapon: (weaponId) => this.weaponBridge.install(weaponId),
    onDynamicsChanged: () => {
      // La nave es otra: la base de velocidad se reobserva y el rito olvida la anterior.
      this.speedRiteSystem.resetBase();
      this.refreshShipDynamicsBaseline(true);
    },
    emitNotice: (message) => this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, message),
    logInfo: (msg, data) => this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, msg, data),
  };

  /** Reacondicionamiento completo de los Grises: toberas, gauss y módulo de vacío ampliado. */
  public applyGreysShipUpgrade(): boolean {
    return this.shipOutfitting.applyGreysUpgrade(this.outfittingHost);
  }

  /** Injerto de los Mi-Go (Fase 15): maniobrador de cursor y giroscopios retensados. */
  public applyMiGoShipUpgrade(): boolean {
    return this.shipOutfitting.applyMiGoUpgrade(this.outfittingHost);
  }

  /** Raza a hostil (Fase 15): standing + aviso + planetas en enemigo + sus encargos caducan. */
  private declareRaceHostility(race: PlanetInhabitants, notice: string): void {
    if (this.gameState.getRaceStanding(race).standing === 'hostile') {
      return;
    }
    this.gameState.setRaceStanding(race, 'hostile');
    for (const planet of this.gameState.planets) {
      if (planet.inhabitants === race) {
        try { planet.setAnimosity(GameObjectAnimosity.ENEMY); } catch {}
        this.gameState.syncPlanetIntelFromPlanet(planet);
      }
    }
    for (const mission of this.missionService?.listMissions() ?? []) {
      if ((mission.requestedBy ?? mission.race) === race && mission.status !== 'completed' && mission.status !== 'failed') {
        this.missionService?.failMission(mission.id, 'race-hostile');
      }
    }
    this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.WARNING, notice);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Race turned hostile', { race });
  }

  /** Toggle del vuelo por ratón (tecla `c`); sólo tiene sentido con el maniobrador instalado. */
  public toggleMouseFlight(): void {
    if (this.weaponBridge.getOutfit().mouseFlight !== true) {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.WARNING, 'SIN MANIOBRADOR: LOS MI-GO LO INJERTAN');
      return;
    }
    this.mouseFlightUserEnabled = !this.mouseFlightUserEnabled;
    if (this.spaceship && !this.mouseFlightUserEnabled) {
      this.spaceship.analogPitch = 0;
      this.spaceship.analogYaw = 0;
    }
    this.hudManager?.emitMarqueeEvent?.(
      HudMarqueeEventType.SYSTEM,
      this.mouseFlightUserEnabled ? 'MANIOBRADOR DE CURSOR: ACTIVO' : 'MANIOBRADOR DE CURSOR: APAGADO'
    );
  }

  /** Compra en la tienda de una raza. */
  public applyRaceShopEffect(effect: 'weapon' | 'weapon_slot' | 'engine_tier', weaponId?: WeaponId): boolean {
    if (effect === 'engine_tier') {
      return this.shipOutfitting.upgradeEngine(this.outfittingHost);
    }
    if (effect === 'weapon_slot') {
      return this.shipOutfitting.addWeaponSlot(this.outfittingHost);
    }
    return weaponId ? this.shipOutfitting.grantWeapon(this.outfittingHost, weaponId) : false;
  }

  /**
   * Sintoniza el PRÓXIMO Rito de la Puerta hacia el dominio de un primigenio. Lo usan los Grises
   * para mandarte a territorio de Yog-Sothoth sin que tengas que buscarlo a ciegas.
   */
  public tuneNextGateRite(elderGod: ElderGod | null): void {
    if (!elderGod) {
      this.gameState.setGateTuning(null);
      return;
    }
    this.tuneNextGateRiteWith({ forcedElderGod: elderGod }, ELDER_GOD_LABELS[elderGod]);
  }

  /**
   * Sintonía completa del próximo rito (Fase 15): destinos con raza garantizada, número de mundos
   * habitados y tema de estaciones (el sistema de guerra arácnido, el sistema natal de Yig…).
   */
  public tuneNextGateRiteWith(tuning: GateTuningState, noticeLabel?: string): void {
    this.gameState.setGateTuning(tuning);
    if (noticeLabel) {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.SYSTEM,
        `RITO SINTONIZADO: ${noticeLabel.toUpperCase()}`
      );
    }
  }

  /** Dibuja el haz continuo del arma seleccionada. Devuelve true si pintó algo. */
  private renderWeaponBeam(): boolean {
    const state = this.weaponBridge.getBeamRenderState();
    if (!state) {
      return false;
    }
    return this.drawBeamQuad(state.startPos, state.endPos, state.widthU, state.color, state.intensity, 0.3);
  }

  /**
   * Dibujo compartido de TODOS los haces (hechizos y armas), delegado en `BeamRenderer`.
   * Antes cada haz repetía ~110 líneas de WebGL con dos defectos: la perpendicular se calculaba en
   * el plano XY —un haz vertical degeneraba en una línea invisible— y se creaban y destruían dos
   * VBOs en cada frame.
   */
  private drawBeamQuad(
    start: Vector3,
    end: Vector3,
    width: number,
    color: [number, number, number],
    intensity: number,
    tailFade: number
  ): boolean {
    if (!this.gl || !this.camera) {
      return false;
    }
    this.beamRenderer ??= new BeamRenderer(this.gl, this.shaderManager);
    // Forward de la cámara: tercera fila de la matriz de vista, negada.
    const v = this.camera.viewMatrix;
    this.beamRenderer.draw(
      { start, end, width, color, intensity, tailFade },
      { x: -v[2], y: -v[6], z: -v[10] },
      this.camera.viewMatrix,
      this.camera.projectionMatrix
    );
    return true;
  }

  /** Nombre del primigenio del sistema si el jugador ya lo ha averiguado; null si no (Fase 13). */
  private getRevealedElderGodLabel(): string | null {
    const meta = this.currentSnapshot?.meta;
    if (!meta?.elderGodRevealed) {
      return null;
    }
    const elderGod = meta.elderGod as ElderGod | undefined;
    return elderGod ? ELDER_GOD_LABELS[elderGod] ?? null : null;
  }

  /** Rayo del cursor en vuelo, para las armas dirigidas con el ratón. */
  private resolveFlightPointerRay(): ScreenRay | null {
    const pointer = this.flightPointer;
    const canvas = this.gl?.canvas as HTMLCanvasElement | undefined;
    if (!pointer || !canvas || !this.camera) {
      return null;
    }
    return screenPointToWorldRay(
      pointer.x,
      pointer.y,
      canvas.getBoundingClientRect(),
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.flightPointerRay
    );
  }

  public applyShipDamage(
    amount: number,
    sourceId: string,
    reason: string,
    options?: { suppressHud?: boolean; customHudMessage?: string; sourceObject?: any }
  ): number {
    if (!this.spaceship || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }

    const now = performance.now();
    if (this.isVoidCocoonActive(now)) {
      this.handleVoidCocoonImpact(options?.sourceObject ?? { id: sourceId }, amount, { reason });
      return 0;
    }

    const previous = this.spaceship.healthCurrent;
    const next = Math.max(0, previous - amount);
    if (next === previous) {
      return 0;
    }

    this.spaceship.healthCurrent = next;
    const dealt = previous - next;

    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Ship damaged by hostile entity', {
      sourceId,
      reason,
      damage: dealt,
      healthBefore: previous,
      healthAfter: next
    });

    if (!options?.suppressHud) {
      const message = options?.customHudMessage ?? `Daño (${reason}): -${Math.round(dealt)}u`;
      try {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SHIP_DAMAGE, message);
      } catch {}
    }

    this.impactVignetteLevel = Math.min(1, this.impactVignetteLevel + Math.min(0.25, dealt / 120));
    return dealt;
  }

  public logLesserBeingImpact(sourceId: string, attackKind: string, damage: number): void {
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Lesser being attack connected', {
      sourceId,
      attackKind,
      damage
    });
  }

  /**
   * Get debris particle color based on object type
   */
  private stopDopplerCueForObject(objectId: string | null | undefined): void {
    if (!objectId) {
      return;
    }
    const entry = this.gameState.dopplerCues.get(objectId);
    if (entry) {
      try {
        entry.cue.stop(80);
      } catch {}
      this.gameState.dopplerCues.delete(objectId);
    }
    this.lastObjPos.delete(objectId);
  }

  /**
   * Remove an object from the game world permanently
   */
  private destroyObject(obj: any): void {
    if (!obj || !obj.id) return;

    // Premio si es la TARDIS y se destruyó/loteó (el sistema decide; nada si solo huyó por proximidad).
    this.tardisCompanionSystem.onObjectDestroyed(obj, this.tardisCompanionHost);
    // Tortuga estelar destruida: si la mató el jugador → botín; si la mató un ser menor → solo desaparece.
    if ((obj as { isSpaceTurtle?: boolean }).isSpaceTurtle) {
      if (this.turtleKilledByBeing) {
        this.turtleKilledByBeing = false;
        this.spaceTurtleSystem.clear();
      } else {
        this.spaceTurtleSystem.notifyDestroyed(this.spaceTurtleHost);
      }
    }

    // Create destruction debris particles at object's position
    if (this.particleEffects && obj.position) {
      // Calculate approximate size for particle generation
      const size = obj.size || 1.0;
      // Generate particles (color based on object type)
      const color = getDebrisColorForObjectType(this.resolveObjectType(obj));
      this.particleEffects.createDestructionDebris(obj.position, size, color);
    }
    
    // Mark as inactive immediately to prevent targeting/rendering
    obj.active = false;
    obj.visible = false;
    
    const objId = obj.id;
    this.stopDopplerCueForObject(objId);
    const typeName = obj.constructor?.name || 'Unknown';
    const objectType = this.resolveObjectType(obj);
    let removed = false;

    if (obj instanceof LesserBeingBase) {
      this.handleLesserBeingDestroyed(obj);
      this.unregisterLesserBeing(objId);
      removed = true;
    }

    // Estación telaraña arácnida destruida (Fase 15): storyFlag + misión + XP + repliegue de cazas.
    if (obj instanceof AracnidWebStation) {
      this.aracnidWar.notifyStationDestroyed(this.aracnidWarHost, objId);
      removed = true;
    }

    // Delegate primary removal to the GameStateStore so all collections stay in sync
    try {
      removed = this.gameState.removeObject(obj as GameObject) || removed;
    } catch {}

    // Additional cleanup for transient structures not owned by the store
    if (objectType === GameObjectType.ASTEROID) {
      // NOTE: Regular cluster asteroids are managed by AsteroidClusterService
      // and don't need removal here (clusters handle their own lifecycle)

      // Check ephemeral asteroids
      const ephIdx = this.ephemeralAsteroids.findIndex(a => a.id === objId);
      if (ephIdx >= 0) {
        this.ephemeralAsteroids.splice(ephIdx, 1);
        removed = true;
      }
      // Check if it's in a cluster
      if (!removed) {
        try {
          this.asteroidClusterService.getClusters().forEach(cluster => {
            const clusterIdx = cluster.objects.findIndex(o => o.id === objId);
            if (clusterIdx >= 0) {
              cluster.objects.splice(clusterIdx, 1);
              removed = true;
              this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Asteroid removed from cluster', {
                asteroidId: objId,
                clusterId: cluster.id,
                remainingInCluster: cluster.objects.length
              });
            }
          });
        } catch {}
      }
    } else if (objectType === GameObjectType.SUPER_ASTEROID) {
      // Also remove from cluster service if it's part of a cluster
      try {
        this.asteroidClusterService.getClusters().forEach(cluster => {
          const clusterIdx = cluster.objects.findIndex(o => o.id === objId);
          if (clusterIdx >= 0) {
            cluster.objects.splice(clusterIdx, 1);
            removed = true;
            this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'SuperAsteroid removed from cluster', {
              asteroidId: objId,
              clusterId: cluster.id,
              remainingInCluster: cluster.objects.length
            });
          }
        });
      } catch {}
    } else if (objectType === GameObjectType.MEGA_ASTEROID) {
      // Remove from planet debris map for visual debris trails
      for (const [planetId, debris] of this.planetDebris.entries()) {
        const idx = debris.findIndex(d => d.obj.id === objId);
        if (idx >= 0) {
          debris.splice(idx, 1);
          removed = true;
          if (debris.length === 0) this.planetDebris.delete(planetId);
          break;
        }
      }
    }
    
    if (!removed) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Object not found in any array for destruction', { id: objId, type: typeName, objectType });
    }
    
    // Clear from targeting system
    try {
      // Force ReticleManager to clear this object if it's currently targeted or hovered
      if (this.reticleManager) {
        const reticleState = (this.reticleManager as any).state;
        if (reticleState) {
          if (reticleState.currentTarget?.id === objId) {
            (this.reticleManager as any).clearTarget?.();
            this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Cleared destroyed object from current target', { id: objId });
          }
          if (reticleState.hoveredTarget?.id === objId) {
            reticleState.hoveredTarget = null;
            this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Cleared destroyed object from hovered target', { id: objId });
          }
        }
      }
      // Clear from AdaptiveTargeting system
      if (this.adaptiveTargeting) {
        const currentTarget = this.adaptiveTargeting.getCurrentTarget?.();
        const hoveredTarget = this.adaptiveTargeting.getHoveredTarget?.();
        if (currentTarget?.id === objId) {
          this.adaptiveTargeting.selectTarget?.(null);
          this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Cleared destroyed object from AdaptiveTargeting currentTarget', { id: objId });
        }
        if (hoveredTarget?.id === objId) {
          // AdaptiveTargeting doesn't have a clearHover method, but it will be filtered next frame
          this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Destroyed object was hovered in AdaptiveTargeting (will be filtered next frame)', { id: objId });
        }
      }
      // Clear HUD target panel if showing this object
      if (this.hudManager) {
        this.hudManager.clearTargetPanel();
        this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Cleared HUD target panel', { id: objId });
      }
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to clear from targeting system', e);
    }
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Object removed from world', { id: objId, type: typeName, objectType, removed });
  }

  private handleLesserBeingDestroyed(being: LesserBeingBase): void {
    if (!being) {
      return;
    }
    this.registerHuntKill(being);
    if (!being.hasLanded) {
      this.rewardLesserBeingKill(being);
      return;
    }
    if (being.landedPlanetId) {
      this.clearPlanetOccupation(being.landedPlanetId);
    }
  }

  /**
   * Una muerte puede ser la prueba que pide una misión de caza. El trofeo sólo se materializa si
   * la criatura y el dominio del sistema coinciden con lo encargado (Fase 13).
   */
  private registerHuntKill(being: LesserBeingBase): void {
    try {
      const mission = this.missionService?.registerHuntKill(
        String(being.beingType),
        String(this.getCurrentSystemElderGod())
      );
      if (mission) {
        this.hudManager?.emitMarqueeEvent?.(
          HudMarqueeEventType.MISSION,
          `PRUEBA OBTENIDA: ${mission.requiredCargoLabel ?? 'trofeo'}`
        );
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'registerHuntKill falló', { error });
    }
  }

  private rewardLesserBeingKill(being: LesserBeingBase): void {
    const rewardXp = 100;
    let leveledUpTo: number | null = null;
    try {
      const gain = this.characterProfileService?.awardExperience(rewardXp, 'lesser-being');
      leveledUpTo = gain?.leveledUp ? gain.level : null;
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to award XP for lesser being kill', { error });
    }
    this.tryApplyCorruptionBonus(20);
    const sanityAwarded = this.grantTemporarySanity(20);
    try {
      const corChunk = sanityAwarded > 0 ? `, +${sanityAwarded} COR` : '';
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.LESSER_BEING,
        `${being.getDisplayName()} destruido: +${rewardXp} XP${corChunk}`
      );
      // Al promocionar, la barra de experiencia vuelve a cero: sin este aviso el ascenso pasa
      // desapercibido y parece que la recompensa no se ha aplicado.
      if (leveledUpTo !== null) {
        this.hudManager?.emitMarqueeEvent?.(
          HudMarqueeEventType.SYSTEM,
          `NIVEL ${leveledUpTo} ALCANZADO`
        );
      }
    } catch {}
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Lesser being destroyed before landing', {
      beingId: being.id,
      type: being.beingType
    });
  }

  private tryApplyCorruptionBonus(amount: number): void {
    const svc = this.characterProfileService as any;
    if (svc?.addCorruption) {
      try {
        svc.addCorruption(amount, { temporary: true });
        return;
      } catch (error) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to apply corruption reward', { amount, error });
        return;
      }
    }
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Corruption reward skipped (service unavailable)', { amount });
  }

  private clearPlanetOccupation(planetId: string): void {
    const planet = this.gameState.planets.find(p => p.id === planetId);
    if (planet) {
      planet.setLesserBeing(null);
      planet.creatureScanned = false;
    }
  }

  private grantTemporarySanity(amount: number): number {
    if (!this.characterProfileService || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const cap = typeof this.gameState.getSanityCap === 'function' ? this.gameState.getSanityCap() : this.gameState.getSanityBaseMax?.() ?? 99;
    const current = this.gameState.characterProfile.sanity ?? 0;
    const target = Math.min(cap, current + amount);
    const delta = Math.max(0, target - current);
    if (delta <= 0) {
      return 0;
    }
    try {
      this.characterProfileService.adjustVitals({ sanity: delta });
      return delta;
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to apply sanity reward', { amount, error });
      return 0;
    }
  }

  /**
   * Register reactive destruction callback for any GameObject
   * When object health reaches 0, it will be automatically destroyed
   */
  private registerDestructionCallback(obj: GameObject): void {
    if (!obj || typeof obj.setDestroyedCallback !== 'function') return;
    
    obj.setDestroyedCallback((destroyedObj: GameObject) => {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Object destruction triggered reactively', { 
        id: destroyedObj.id, 
        type: destroyedObj.constructor?.name 
      });
      this.destroyObject(destroyedObj);
    });
  }

  /**
   * Eject asteroid from its cluster and convert to independent object with individual motion
   */
  private makeAsteroidIndependent(obj: any): void {
    if (!obj || !obj.id) return;
    
    const objId = obj.id;
    
    // Mark as pending ejection immediately to prevent cluster service from overwriting position
    (obj as any)._pendingEjection = true;
    (obj as any)._isIndependent = true; // Flag para que Asteroid.update() no sobreescriba velocidad
    
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🔧 makeAsteroidIndependent START', {
      asteroidId: objId,
      currentVelocity: obj.velocity ? `(${obj.velocity.x.toFixed(2)}, ${obj.velocity.y.toFixed(2)}, ${obj.velocity.z.toFixed(2)})` : 'null',
      position: `(${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})`
    });
    
    // Check if already independent
    if (this.gameState.isIndependentAsteroid(objId)) {
      this.logger.log(LogLevel.WARN, LogCategory.COLLISION_PHYSICS, '⚠️ Asteroid already independent', { asteroidId: objId });
      return;
    }
    
    // Remove from cluster
    let removedFromCluster = false;
    try {
      this.asteroidClusterService.getClusters().forEach(cluster => {
        const idx = cluster.objects.findIndex(o => o.id === objId);
        if (idx >= 0) {
          cluster.objects.splice(idx, 1);
          removedFromCluster = true;
          this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Asteroid ejected from cluster', { 
            asteroidId: objId, 
            clusterId: cluster.id,
            remainingInCluster: cluster.objects.length
          });
        }
      });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.COLLISION_PHYSICS, '⚠️ Failed to remove from cluster', e);
    }
    
    if (!removedFromCluster) {
      this.logger.log(LogLevel.WARN, LogCategory.COLLISION_PHYSICS, '⚠️ Asteroid not in cluster, cannot eject', { asteroidId: objId });
      return; // Not in a cluster, skip
    }
    
    // Add to independent asteroids array
    this.gameState.independentAsteroids.push(obj);
    
    // Register reactive destruction callback (if not already registered)
    this.registerDestructionCallback(obj);
    
    // Mark spawn time for culling
    (obj as any)._independentSince = performance.now();
    
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '✅ makeAsteroidIndependent COMPLETE', { 
      asteroidId: objId, 
      velocity: `(${obj.velocity.x.toFixed(2)}, ${obj.velocity.y.toFixed(2)}, ${obj.velocity.z.toFixed(2)})`,
      position: `(${obj.position.x.toFixed(0)}, ${obj.position.y.toFixed(0)}, ${obj.position.z.toFixed(0)})`,
      totalIndependent: this.gameState.independentAsteroids.length,
      pendingEjection: !!(obj as any)._pendingEjection
    });
  }

  /**
   * Update independent asteroids: apply motion and cull by distance
   */
  private updateIndependentAsteroids(deltaTime: number): void {
    if (!this.spaceship || this.gameState.independentAsteroids.length === 0) return;
    
    const shipPos = this.spaceship.position;
    const CULLING_DISTANCE = 25000; // Remove if farther than 25km
    const now = performance.now();
    const MIN_LIFETIME_MS = 5000; // Keep at least 5s before culling
    
    // Log periódico (cada 5s) para ver estado de asteroides independientes
    if (!this._lastIndependentLogTime || now - this._lastIndependentLogTime > 5000) {
      this._lastIndependentLogTime = now;
      if (this.gameState.independentAsteroids.length > 0) {
        const sample = this.gameState.independentAsteroids[0];
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🔄 Updating independent asteroids', {
          count: this.gameState.independentAsteroids.length,
          sampleId: sample.id,
          sampleVelocity: `(${sample.velocity.x.toFixed(2)}, ${sample.velocity.y.toFixed(2)}, ${sample.velocity.z.toFixed(2)})`,
          samplePosition: `(${sample.position.x.toFixed(0)}, ${sample.position.y.toFixed(0)}, ${sample.position.z.toFixed(0)})`
        });
      }
    }
    
    // Update and cull
    for (let i = this.gameState.independentAsteroids.length - 1; i >= 0; i--) {
      const ast = this.gameState.independentAsteroids[i];
      
      // Apply velocity
      ast.position.x += ast.velocity.x * deltaTime;
      ast.position.y += ast.velocity.y * deltaTime;
      ast.position.z += ast.velocity.z * deltaTime;
      
      // Apply rotation
      if ((ast as any).rotationRate) {
        const rate = (ast as any).rotationRate;
        ast.rotation.x += rate.x * deltaTime;
        ast.rotation.y += rate.y * deltaTime;
        ast.rotation.z += rate.z * deltaTime;
      }
      
      ast.updateModelMatrix();
      if (ast.boundingSphere) {
        ast.boundingSphere.center = { ...ast.position };
      }
      
      // Check distance for culling
      const dx = ast.position.x - shipPos.x;
      const dy = ast.position.y - shipPos.y;
      const dz = ast.position.z - shipPos.z;
      const distance = Math.hypot(dx, dy, dz);
      
      const lifetime = now - ((ast as any)._independentSince || 0);
      
      if (distance > CULLING_DISTANCE && lifetime > MIN_LIFETIME_MS) {
        this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Independent asteroid culled', { 
          id: ast.id, 
          distance: distance.toFixed(0),
          lifetime: (lifetime / 1000).toFixed(1) + 's'
        });
        this.gameState.independentAsteroids.splice(i, 1);
      }
    }
  }

  private updateLesserBeings(deltaTime: number): void {
    if (!this.lesserBeings.length) {
      return;
    }
    for (let i = this.lesserBeings.length - 1; i >= 0; i--) {
      const being = this.lesserBeings[i];
      if (!being?.active) {
        continue;
      }
      try {
        being.update(deltaTime);
      } catch (err) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to update lesser being', {
          id: being.id,
          type: being.constructor?.name,
          err
        });
      }
    }
  }

  /**
   * Complete game reset: destroys all objects, regenerates solar system from scratch
   */
  /**
   * Trigger death dialog (called from collision system when ship health <= 0)
   */
  private triggerDeathDialog(): void {
    // Set flag to prevent gameLoop from restarting thruster during fade
    this.deathInProgress = true;
    this.closeLandingPanelUI('death-dialog');
    
    // Silence everything but ambience during death pause
    try { this.setAudioPausedForGame(true); }
    catch (e) { this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Failed to pause audio mix on death', e); }
    
    // Delay game pause slightly to allow audio fades to complete
    // This ensures AudioContext can process the fade-out envelope
    setTimeout(() => {
      this.isRunning = false;
      
      // Now call game component to show death dialog
      try {
        const gameComponent = (globalThis as any).GameComponentInstance;
        if (gameComponent && typeof gameComponent.triggerDeathDialog === 'function') {
          gameComponent.triggerDeathDialog();
        } else {
          // Fallback: immediate respawn if dialog not available
          this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Death dialog not available - falling back to immediate respawn');
          this.respawnGame();
        }
      } catch (e) {
        this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Failed to trigger death dialog', e);
        this.respawnGame();
      }
    }, 300); // 300ms delay to allow fades to complete
  }

  /**
   * Applies a prepared restart context (respawn/save load) without rebuilding everything from scratch.
   */
  public restartWithContext(context: GameStartContext): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'RestartWithContext invoked', {
      reason: context.restartReason,
      targetSystemId: context.targetSystemId,
      runtimeSource: context.runtimeState.source,
      anchorId: context.respawnAnchor?.anchorId ?? null
    });

    // Ensure loop/audio are paused before mutating state
    this.stop();
    this.setAudioPausedForGame(true);
    this.deathInProgress = false;

    try {
      this.animationManager?.forceTerminateCurrentAnimation(this);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to terminate animation before restart', error);
    }

    try {
      this.resetLoopStateForRestart();
      this.syncGrimoireLayoutFromState('restart');

      const shipApplied = this.applyPlayerResetState(context.playerState);
      if (!shipApplied) {
        throw new Error('Spaceship instance unavailable for restart');
      }

      this.updateCharacterVitalsFromRespawn(context.playerState);

      if (context.restartReason === 'RESPAWN') {
        try {
          this.characterProfileService.registerExperienceEvent(ExperienceEventType.PLAYER_DEATH);
        } catch (error) {
          this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to apply respawn XP penalty', error);
        }
      }

      this.emitRespawnNotifications(context);
      try { this.clearTargetSelection(); } catch {}

      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Restart context applied', {
        systemId: context.targetSystemId,
        runtimeSource: context.runtimeState.source,
        anchorId: context.respawnAnchor?.anchorId ?? null,
        restoredStat: context.playerState.restoredStat
      });

      this.startLoopAfterRestart();
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Restart with context failed - falling back to legacy respawn', error);
      this.respawnGame();
    }
  }

  private startLoopAfterRestart(): void {
    this.gameState.gameRunning = true;
    this.lastFrameTime = performance.now();
    this.isRunning = true;
    this.scheduleNextFrame('restart-loop');
    this.setAudioPausedForGame(false);
  }

  private applyPlayerResetState(state: PlayerResetState): boolean {
    const ship = this.spaceship;
    if (!ship) {
      return false;
    }

    const velocity = state.velocity ?? { x: 0, y: 0, z: 0 };
    ship.position = { ...state.position };
    ship.velocity = { ...velocity };
    ship.angularVelocity = { x: 0, y: 0, z: 0 };
    const speed = Math.min(ship.maxSpeed, this.vectorLength(velocity));
    ship.currentSpeed = speed;
    ship.targetSpeed = speed;
    ship.thrusterState = ThrusterState.IDLE;
    ship.isThrusting = false;
    ship.thrusterIntensity = 0;
    ship.healthMax = state.shipHealth.max ?? ship.healthMax;
    ship.healthCurrent = Math.max(1, Math.min(ship.healthMax, state.shipHealth.current));
    const resetVoidEnergy = Math.max(0, Math.min(ship.voidEnergyMax, state.voidEnergy));
    if (typeof ship.applyRespawnVoidEnergy === 'function') {
      ship.applyRespawnVoidEnergy(resetVoidEnergy, this.RESPAWN_VOID_ENERGY_PAUSE_MS);
    } else {
      ship.voidEnergyCurrent = resetVoidEnergy;
      ship.voidEnergyPaused = false;
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn void energy restored', {
      applied: resetVoidEnergy,
      max: ship.voidEnergyMax,
      pauseMs: this.RESPAWN_VOID_ENERGY_PAUSE_MS,
      restoredStat: state.restoredStat ?? 'none'
    });

    const anyShip = ship as any;
    if (typeof anyShip.applyOrientationSnapshot === 'function') {
      anyShip.applyOrientationSnapshot(state.orientation ?? null);
    } else if (state.orientation?.forward) {
      const upHint = state.orientation.up ?? { x: 0, y: 1, z: 0 };
      ship.lookAt({
        x: ship.position.x + state.orientation.forward.x,
        y: ship.position.y + state.orientation.forward.y,
        z: ship.position.z + state.orientation.forward.z
      }, upHint);
    }

    ship.updateModelMatrix();
    this.lastShipPos = { ...ship.position };
    this.gameState.spaceship = ship;
    // La nave entrante trae su propia dinámica: cortar el Rito del Tiempo Doblado y recalcular la
    // baseline, para que un rito de la partida anterior no siga vivo sobre la nave nueva.
    this.speedRiteSystem.reset();
    this.refreshShipDynamicsBaseline(true);
    // Equipamiento: lo dejó el serializer en el store (o es el de la partida en curso al respawnear).
    this.applyShipOutfit(this.gameState.getShipOutfit());
    this.weaponBridge.clearProjectiles();
    return true;
  }

  private updateCharacterVitalsFromRespawn(state: PlayerResetState): void {
    try {
      this.gameState.updateCharacterVitals({
        sanity: state.sanity,
        health: state.vitality
      });
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to sync character vitals after respawn', { error });
    }
  }

  private emitRespawnNotifications(context: GameStartContext): void {
    const anchorLabel = context.respawnAnchor?.label
      ?? context.respawnAnchor?.planetName
      ?? context.targetSystemId;
    try {
      if (anchorLabel) {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.RESPAWN, `Respawn: ${anchorLabel}`);
      }
      if (context.playerState.restoredStat === 'sanity') {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.RESPAWN, 'Cordura estabilizada tras el despertar.');
      } else if (context.playerState.restoredStat === 'health') {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.RESPAWN, 'Vitalidad restaurada tras el sigilo.');
      }
    } catch {}
  }

  private queueStartupMarqueeSequence(): void {
    if (this.bootMarqueePrimed) {
      return;
    }
    this.bootMarqueePrimed = true;
    const introMessages = [
      'Explosion detectada.',
      'Integridad comprometida.',
      'Piloto dañado',
      'Sugerencia: contactar nave nodriza.'
    ];
    for (const message of introMessages) {
      try {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, message, {
          force: true,
          allowDuplicate: true,
        });
      } catch {}
    }
  }

  private resetLoopStateForRestart(): void {
    this.teardownAtmosphereSceneState('restart-loop');
    this.ephemeralAsteroids = [];
    this.gameState.collisionCooldowns.clear();
    this.gameState.dopplerCues.clear();
    this.lastObjPos.clear();
    this.portalTraversalCooldownSec = 0;
    this.portalPrevDistances.clear();
    this.lastShipPos = null;
    this.collisionDamageCooldown.clear();
    this.shipCollisionSystem.reset();
    this.impactVignetteLevel = 0;
    this.pendingMapSelectId = null;
    this.landingSequenceActive = false;
    this.takeoffSequenceActive = false;
    this.landingSequenceContext = null;
    this.landingTouchdownContext = null;
    this.landingStatus = { ready: false, context: null };
    this.landingThreat = { active: false, reasons: [] };
    this.landingThreatSuppression.reset();
    this.landingDamageSuppressed = false;
    this.atmosphereCollisionGrace.reset();
    this.voidJumpActive = false;
    this.pendingWingDeploymentProgress = null;
    try { this.spaceship?.setWingDeploymentProgress(0); } catch {}
    this.resetPanelInteractionState('restart-loop');
  }

  private resetPanelInteractionState(origin: string = 'reset-panel-state'): void {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    try {
      if (this.systemPanel) {
        try { this.systemPanel.setEnabled(false); } catch {}
        try { this.systemPanel.setHoveredId?.(null); } catch {}
      }
      this.panelEventCoordinator?.setMapEnabled(false);
      try { this.updateMapClickBinding(); } catch {}
      this.gameState.mapReopenAllowedAtMs = now;
    } catch {}

    try {
      if (this.grimoirePanel) {
        this.grimoirePanel.setEnabled(false);
        this.gameState.grimoireReopenAllowedAtMs = now;
      }
      this.panelEventCoordinator?.setGrimoireEnabled(false);
      try { this.updateGrimoirePointerBinding(); } catch {}
    } catch {}

    try {
      if (this.inventoryPanel) {
        this.inventoryPanel.setEnabled(false);
        this.inventoryPanel.resetScroll();
      }
      this.clearInventorySelection();
      this.inventoryHoverKey = null;
      this.panelEventCoordinator?.setInventoryEnabled(false);
      try { this.updateInventoryPointerBinding(); } catch {}
      this.gameState.inventoryReopenAllowedAtMs = now;
    } catch {}

    this.clearPanelCursorOverlay();
    this.syncPanelCursorOverlay();
    this.updateCanvasCursor();
    this.panelInputsLocked = false;
    try { this.panelEventCoordinator?.setInputsBlocked(false); } catch {}

    this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'Panel interaction state reset', { origin });
  }

  private vectorLength(vec?: Vector3 | null): number {
    return vec3Length(vec);
  }

  private dotProduct(a: Vector3, b: Vector3): number {
    return vec3Dot(a, b);
  }

  private crossProduct(a: Vector3, b: Vector3): Vector3 {
    return vec3Cross(a, b);
  }

  private randomPerpendicularVector(normal: Vector3): Vector3 {
    return randomPerpendicularVector(normal);
  }

  /**
   * Full solar system respawn (called from death dialog "Restart" button)
   */
  public respawnGame(): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn initiated - regenerating solar system');
    try {
      this.characterProfileService.registerExperienceEvent(ExperienceEventType.PLAYER_DEATH);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to apply respawn XP penalty', error);
    }
    
    // Reset death flag
    this.deathInProgress = false;
    this.resetPanelInteractionState('full-respawn');
    this.teardownAtmosphereSceneState('respawn-game');

    try {
      this.gameState.clearRespawnAnchor('full-respawn');
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to clear respawn anchor during full respawn', { error });
    }
    
    // Force terminate any active animation before respawning
    try {
      this.animationManager?.forceTerminateCurrentAnimation(this);
    } catch (err) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Error terminating animation during respawn', err);
    }

    // Stop game loop temporarily
    const wasRunning = this.isRunning;
    this.isRunning = false;

    try {
      // Clear all game objects
            this.ephemeralAsteroids = [];
      this.gameState.superAsteroids.length = 0;
      this.gameState.independentAsteroids.length = 0;
      this.gameState.planets.length = 0;
      this.gameState.portals.length = 0;
      this.gameState.sun = null;
      this.planetDebris.clear();
    this.tardisCompanionSystem.clear();
    this.spaceTurtleSystem.clear();
    this.stationRenderer.clear();
    this.spaceStationSystem.clear(this.spaceStationHost);
    this.aracnidStationRenderer.clear();
    this.aracnidWar.clear(this.aracnidWarHost);
    this.stationDockCandidate = null;
    this.stationPanelOpen = false;
    this.stationDockedPort = null;
    this.stationDockingActive = false;

      // Clear cluster service (will be repopulated by createGameObjects)
      // Note: AsteroidClusterService doesn't have clear() method, objects will be replaced
      
      // Clear collision cooldowns
      this.gameState.collisionCooldowns.clear();
      
      // Clear doppler cues
      this.gameState.dopplerCues.clear();
      this.lastObjPos.clear();
      
      // Reset camera effects
      this.impactVignetteLevel = 0;
      this.shipCollisionSystem.reset();

      // Reset portal state
      this.portalTraversalCooldownSec = 0;
      this.portalPrevDistances.clear();
      this.lastShipPos = null;
      
      // Recreate all game objects (solar system + spaceship)
      this.createGameObjects();
      
      // Stop any residual audio before restarting (cleanup after animations/previous state)
      try {
        if (this.thrusterCtl) {
          this.thrusterCtl.stop(0);
        }
        if (this.audio) {
          this.audio.stopAmbientLoop(0);
        }
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Failed to stop residual audio before respawn', e);
      }
      
      // Restart audio: ambient loop and thruster (at idle volume)
      try {
        if (this.audioUnlocked && this.audio) {
          this.audio.startAmbientLoop('sfx_logdark');
        }
        if (this.audioUnlocked && this.thrusterCtl) {
          this.thrusterCtl.start(0.0); // start at silent, will update based on ship state
        }
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Failed to restart audio after respawn', e);
      }
      
      // Camera will automatically follow spaceship (target is set in camera update logic)
      
      // Clear all target selections (HUD, outliner, adaptive targeting, reticle)
      try { this.clearTargetSelection(); } catch {}
      
      // Display marquee
      try {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, 'Sistema solar regenerado');
      } catch {}
      
      // Restart game loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      
      // Explicitly restart the game loop
      this.scheduleNextFrame('respawn-complete');
      
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn complete - game loop restarted');
      this.setAudioPausedForGame(false);
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn failed', e);
      // Try to restart anyway
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.scheduleNextFrame('respawn-fallback');
      this.setAudioPausedForGame(false);
    }
  }

  /** Lazy-init del sistema de progresión (sin DI para no tocar el constructor del engine). */
  private ensureProgression(): PlayerProgressionSystem {
    if (!this.playerProgression) {
      this.playerProgression = new PlayerProgressionSystem(this.gameState, this.characterProfileService, this.logger);
    }
    return this.playerProgression;
  }

  private updateAgeAndSurvivability(deltaTime: number): void {
    this.ensureProgression().tickAging(deltaTime, this);
  }

  public applyExternalAgeDelta(days: number, source: AgeProgressionSource = 'landing'): AgeProgressionOutcome {
    return this.ensureProgression().applyExternalAgeDelta(days, source, this);
  }

  public handleHardcoreDeath(context: HardcoreDeathContext): void {
    if (this.deathInProgress || !this.spaceship) {
      return;
    }

    this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Hardcore death triggered', context);
    const message = context.message ?? this.resolveHardcoreDeathMessage(context.source);
    try {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.WARNING, message);
    } catch {}

    this.closeLandingPanelUI('hardcore-death');

    try {
      this.spaceship.healthCurrent = 0;
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Failed to enforce hardcore death', error);
    }
  }

  public triggerLandingFatality(source: LandingDeathSource, metadata?: Record<string, unknown>): void {
    this.handleHardcoreDeath({ source, metadata });
  }

  private resolveHardcoreDeathMessage(source: HardcoreDeathSource): string {
    switch (source) {
      case 'landing-health':
        return 'El cuerpo del piloto falla durante la expedición planetaria.';
      case 'landing-sanity':
        return 'La mente del piloto se fractura durante la expedición planetaria.';
      default:
        return 'El piloto sucumbe a la edad: supervivencia agotada.';
    }
  }

  /**
   * Load saved game after death (called from death dialog "Load Save" button)
   * Restores ship near a portal with full health and void energy
   */
  public loadSaveAfterDeath(): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Loading save after death');
    
    // Reset death flag
    this.deathInProgress = false;
    this.resetPanelInteractionState('load-save-after-death');
    
    if (!this.spaceship) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Cannot load save: spaceship not available');
      return;
    }

    try {
      // Find nearest portal
      let nearestPortal: any = null;
      let minDist = Infinity;
      
      for (const portal of this.gameState.portals) {
        const dx = portal.position.x - this.spaceship.position.x;
        const dy = portal.position.y - this.spaceship.position.y;
        const dz = portal.position.z - this.spaceship.position.z;
        const dist = Math.hypot(dx, dy, dz);
        
        if (dist < minDist) {
          minDist = dist;
          nearestPortal = portal;
        }
      }

      // If no portal found, use primary sun as fallback
      if (!nearestPortal && this.gameState.sun) {
        nearestPortal = this.gameState.sun;
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'No portal found - using sun as spawn point');
      }

      if (nearestPortal) {
        // Position ship 1000u away from portal
        const offset = 1000;
        this.spaceship.position.x = nearestPortal.position.x + offset;
        this.spaceship.position.y = nearestPortal.position.y;
        this.spaceship.position.z = nearestPortal.position.z;
        
        // Reset velocity
        this.spaceship.velocity = { x: 0, y: 0, z: 0 } as any;
        this.spaceship.currentSpeed = 0;
        this.spaceship.targetSpeed = 0;
        
        // Restore full health
        this.spaceship.healthCurrent = this.spaceship.healthMax;
        
        // Restore full void energy
        this.spaceship.voidEnergyCurrent = this.spaceship.voidEnergyMax;
        
        // Clear collision cooldowns
        this.gameState.collisionCooldowns.clear();
        
        // Reset camera effects
        this.impactVignetteLevel = 0;
        this.shipCollisionSystem.reset();
        
        // Restart audio: ambient loop and thruster (at idle volume)
        try {
          if (this.audioUnlocked && this.audio) {
            this.audio.startAmbientLoop('sfx_logdark');
          }
          if (this.audioUnlocked && this.thrusterCtl) {
            this.thrusterCtl.start(0.0); // start at silent, will update based on ship state
          }
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Failed to restart audio after load save', e);
        }
        
        // Clear all target selections (HUD, outliner, adaptive targeting, reticle)
        try { this.clearTargetSelection(); } catch {}
        
        // Display marquee
        try {
          this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, 'Partida cargada - Sistema restaurado');
        } catch {}
        
        // Restart game loop
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        
        // Explicitly restart the game loop
        this.scheduleNextFrame('load-save-after-death');
        
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Save loaded - game loop restarted', { 
          position: { ...this.spaceship.position },
          health: this.spaceship.healthCurrent,
          voidEnergy: this.spaceship.voidEnergyCurrent
        });
        this.setAudioPausedForGame(false);
      } else {
        this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Cannot load save: no spawn point found');
        // Fallback to full respawn
        this.respawnGame();
      }
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Load save failed', e);
      // Fallback to full respawn
      this.respawnGame();
    }
  }

  /**
   * Renderiza el frame actual
   */
  private render(): void {
    if (!this.gl || !this.shaderManager) {
      this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'Render skipped: gl or shaderManager not available');
      return;
    }

    // Limpiar buffers
    this.webglService.clear();

    // Usar programa con iluminación
    this.shaderManager.useLitProgram();
    
    // BYPASS TEMPORAL - Forzar update desde render
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    if (deltaTime > 0) {
      this.update(deltaTime);
      this.lastFrameTime = currentTime;
    }
    
    // Log detallado cada 60 frames para evitar spam
    if (Math.floor(performance.now() / 1000) % 3 === 0) {
      this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Rendering frame', { ship: this.spaceship?.position, asteroids: 0 /* TODO: Get from cluster service */ });
    }

    // Configurar iluminación global
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
    // Parámetros especulares globales por defecto
    this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.15, 32.0);
    // Establecer un color base por defecto para lit en el frame (evita depender de draws previos)
    this.shaderManager.setLitColor(new Float32Array([0.7, 0.75, 0.8]));

    // Renderizar haces especiales antes de la nave para que queden por debajo de la cabina
    const restoreLitProgram = () => {
      this.shaderManager.useLitProgram();
      this.shaderManager.setLighting(
        this.lightDirection,
        this.lightColor,
        this.ambientColor,
        this.ambientStrength
      );
      this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.15, 32.0);
      this.shaderManager.setLitColor(new Float32Array([0.7, 0.75, 0.8]));
    };

    if (this.disruptionBeam.isActive) {
      this.renderDisruptionBeam();
      restoreLitProgram();
    }
    if (this.anchoringPulseBeam.isActive) {
      this.renderAnchoringPulseBeam();
      restoreLitProgram();
    }
    if (this.voidKinesisBeam.isActive) {
      this.renderVoidKinesisBeam();
      restoreLitProgram();
    }
    if (this.planetDrainBeam.isActive) {
      this.renderPlanetDrainBeam();
      restoreLitProgram();
    }
    if (this.renderWeaponBeam()) {
      restoreLitProgram();
    }

    // Renderizar nave con shader texturizado (por encima del beam)
  this.renderSpaceship();

    if (this.voidCocoonActiveUntilMs && performance.now() < this.voidCocoonActiveUntilMs) {
      this.renderVoidCocoonShield();
      restoreLitProgram();
    }
    // Color base por defecto de asteroides (si no se establece luego)
    this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4]));

    const isAtmosphereScene = this.isAtmosphereSceneActive();
    if (isAtmosphereScene) {
      this.renderAtmosphereScene();
      restoreLitProgram();
    } else {
      this.renderDefaultSolarScene(restoreLitProgram);
    }

    this.renderParticleEffectsLayer();

    // Render overlays de animaciones (fade) sobre outlines
    this.animationManager.render(this);

    try {
      this.renderWeatherCameraFilters();
    } catch {}

  // Renderizar overlay de mapa del sistema o el grimorio si están activados (opacos, reemplazan HUD)
  if (this.systemPanel && this.systemPanel.isEnabled()) {
    try {
      const center = this.gameState.sun ? { ...this.gameState.sun.position } : { x: 0, y: 0, z: 0 } as any;
      // Rebuild id->target mapping each frame for map selection
      this.gameState.mapIdToTarget.clear();
      // Map the 'center' synthetic id to the actual primary sun target so clicks select it reliably
      if (this.gameState.sun) {
        this.gameState.mapIdToTarget.set('center', this.gameState.sun as unknown as ITargetable);
      }
  const planets = this.gameState.planets
        // Exclude the primary sun from the map's planet list to avoid blue dot + label
        .filter(p => !(this.gameState.sun && p.id === this.gameState.sun.id))
        .map(p => {
        // Prefer Planet.getDisplayName() which already returns customName if present
        const label = (p.getDisplayName?.() || (p as any).customName || p.id);
          // Normalize planet kind to lowercase for map filters
          const kindRaw = String((p as any).planetType || '').toLowerCase();
          const kind = ((): string | undefined => {
            if (!kindRaw) return undefined;
            // Map enum labels to filter keys
            if (kindRaw === 'tierra') return 'tierra';
            if (kindRaw === 'ringed') return 'ringed';
            if (kindRaw === 'gaseous') return 'gaseous';
            if (kindRaw === 'giant') return 'giant';
            if (kindRaw === 'dwarf') return 'dwarf';
            if (kindRaw === 'protoplanet') return 'protoplanet';
            if (kindRaw === 'planetoid') return 'planetoid';
            if (kindRaw === 'rocky' || kindRaw === 'terrestrial') return 'rocky';
            return kindRaw;
          })();
        this.gameState.mapIdToTarget.set(p.id, p as unknown as ITargetable);
        return {
          id: p.id,
          label,
          pos: { x: p.position.x, y: p.position.y, z: p.position.z },
            kind,
          orbit: (p.semiMajor && p.semiMajor > 0)
            ? { center: { x: p.orbitCenter.x, y: p.orbitCenter.y, z: p.orbitCenter.z }, a: p.semiMajor, b: p.semiMinor, orient: p.orbitOrientation }
            : undefined,
          orbit3d: (p.semiMajor && p.semiMajor > 0)
            ? { center: { x: p.orbitCenter.x, y: p.orbitCenter.y, z: p.orbitCenter.z }, a: p.semiMajor, b: p.semiMinor, u: { x: p.orbitU.x, y: p.orbitU.y, z: p.orbitU.z }, n: { x: p.orbitNormal.x, y: p.orbitNormal.y, z: p.orbitNormal.z }, orient: p.orbitOrientation }
            : undefined
        };
      });
      const clusters = this.asteroidClusterService.getClusters().map(c => {
        const rep: ITargetable | null = (c.proxy as unknown as ITargetable) || (c.objects[0] as unknown as ITargetable) || null;
        if (rep) this.gameState.mapIdToTarget.set(c.id, rep);
        return { id: c.id, label: c.id, center: { x: c.center.x, y: c.center.y, z: c.center.z } };
      });
      const debris: Array<{ id: string; pos: { x: number; y: number; z: number }; label?: string; color?: string; radiusPx?: number }> = [];
      const enemies: Array<{ id: string; pos: { x: number; y: number; z: number }; label?: string; color?: string; radiusPx?: number }> = [];
      for (const arr of this.planetDebris.values()) {
        for (const d of arr) {
          debris.push({ id: d.obj.id, pos: { x: d.obj.position.x, y: d.obj.position.y, z: d.obj.position.z }, label: d.obj.getDisplayName?.() || d.obj.id });
          this.gameState.mapIdToTarget.set(d.obj.id, d.obj as unknown as ITargetable);
        }
      }
        // Ephemeral asteroids también se muestran como 'debris' (temporales)
        if (this.ephemeralAsteroids.length) {
          for (const ea of this.ephemeralAsteroids) {
            debris.push({ id: ea.id, pos: { x: ea.position.x, y: ea.position.y, z: ea.position.z }, label: ea.getDisplayName?.() || ea.id });
            this.gameState.mapIdToTarget.set(ea.id, ea as unknown as ITargetable);
          }
        }
        // Asteroides independientes (eyectados de clusters) también deben aparecer en el mapa
        if (this.gameState.independentAsteroids.length) {
          for (const ia of this.gameState.independentAsteroids) {
            if (ia.isActive && !ia.isActive()) continue;
            debris.push({ id: ia.id, pos: { x: ia.position.x, y: ia.position.y, z: ia.position.z }, label: ia.getDisplayName?.() || ia.id });
            this.gameState.mapIdToTarget.set(ia.id, ia as unknown as ITargetable);
          }
        }
        if (this.lesserBeings.length) {
          for (const lb of this.lesserBeings) {
            if (!lb.active || !lb.visible) continue;
            enemies.push({
              id: lb.id,
              pos: { x: lb.position.x, y: lb.position.y, z: lb.position.z },
              label: lb.getDisplayName?.() || LESSER_BEING_LABELS[lb.beingType] || lb.id,
              color: '#ff4040',
              radiusPx: 3.6,
            });
            this.gameState.mapIdToTarget.set(lb.id, lb as unknown as ITargetable);
          }
        }
      const ship = this.spaceship ? { pos: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z }, label: 'Ship' } : undefined;
      if (this.spaceship) {
        // Allow selecting the player's ship as an ally from the map
        this.gameState.mapIdToTarget.set('ship', this.spaceship as unknown as ITargetable);
      }
      // Portals
      const portals = this.gameState.portals.map(p => {
        this.gameState.mapIdToTarget.set(p.id, p as unknown as ITargetable);
        const label = p.concordSealActive
          ? 'Portal Concord'
          : (p.animosity === GameObjectAnimosity.ENEMY ? 'Portal Hostil' : 'Portal');
        return { id: p.id, pos: { x: p.position.x, y: p.position.y, z: p.position.z }, label };
      });
        // If there is a deferred map selection (click happened before mapping), resolve it now
        if (this.pendingMapSelectId) {
          const pendingTgt = this.gameState.mapIdToTarget.get(this.pendingMapSelectId);
          if (pendingTgt && this.adaptiveTargeting) {
            try { this.prepareDisplayPropsForTarget(pendingTgt as ITargetable); } catch {}
            try { this.adaptiveTargeting.selectTarget(pendingTgt); } catch {}
            try { this.fetchAndCacheTargetDetails(pendingTgt as ITargetable); } catch {}
            try { this.systemPanel.setSelectedId(this.pendingMapSelectId); } catch {}
          }
          this.pendingMapSelectId = null;
        }
      // Prepare details for active item (selected or hovered)
      let details: Record<string, any> | undefined = undefined;
      try {
        const activeId = (this.systemPanel as any).getSelectedId?.() || (this.systemPanel as any).getHoveredId?.() || null;
        if (activeId) {
          const tgt = this.gameState.mapIdToTarget.get(activeId);
          if (tgt) {
            // Ensure details are fetched (async); use cached or fallback immediately
            this.fetchAndCacheTargetDetails(tgt as ITargetable);
            const base = this._targetDetailsCache?.[tgt.id] || this.getFallbackDetails(tgt as ITargetable);
            const tt = (tgt as ITargetable).getTargetType?.();
            
            // Label de tipo por subtipo específico (fuente única en game-object.types)
            const mapObjectType = (tgt as unknown as GameObject)?.getType?.() || GameObjectType.UNKNOWN;
            const typeLabel = getSpecificDisplayLabel(mapObjectType, tt);

            const planetIntel = (tt === TargetType.PLANET)
              ? this.buildPlanetIntelDetails(tgt as Planet)
              : null;
            const planetHints = (tt === TargetType.PLANET) ? {
              planetType: (tgt as any).planetType || (base as any)?.planetType || (tgt as any).baseColorName,
              probabilityOfLifePct: (tgt as any).probabilityOfLifePct ?? (base as any)?.probabilityOfLifePct ?? 0,
              volumeMu:
                (tgt as any).volumeMu
                ?? (base as any)?.volumeMu
                ?? (typeof (base as any)?.volumeGu === 'number'
                      ? Number(((base as any).volumeGu * 1000).toFixed(2))
                      : undefined),
              ...(planetIntel || {}),
            } : {};
            const voidMass = (tgt as any).voidMassUnits ?? 0;
            details = { ...(base || {}), ...planetHints, type: typeLabel, voidMassUnits: voidMass } as any;
          }
        }
      } catch {}

  // Only show center label when the star has an explicit customName; do not fallback to id
  const centerLabel = this.gameState.sun ? ((this.gameState.sun as any).customName || undefined) : undefined;
  // Tortuga estelar: marcador neutral (verde) en el mapa para que se la pueda localizar mientras cruza.
  const turtle = this.spaceTurtleSystem.getRenderable();
  if (turtle) {
    enemies.push({ id: turtle.id, pos: { x: turtle.position.x, y: turtle.position.y, z: turtle.position.z }, label: '🐢 Tortuga estelar', color: '#3ad07a', radiusPx: 6 });
  }
  // Estaciones espaciales: marcador propio (categoría STATION, filtrable). Punto en el centro de la estación.
  const stations: Array<{ id: string; pos: { x: number; y: number; z: number }; label?: string; color?: string; radiusPx?: number }> = [];
  const stationObj = this.spaceStationSystem.getRenderable();
  if (stationObj) {
    stations.push({ id: stationObj.id, pos: { x: stationObj.position.x, y: stationObj.position.y, z: stationObj.position.z }, label: '🛰️ ' + stationObj.getDisplayName(), color: '#6fe0ff', radiusPx: 6 });
    this.gameState.mapIdToTarget.set(stationObj.id, stationObj as unknown as ITargetable); // clic del mapa la selecciona
  }
  this.systemPanel.updateMap({ center, centerLabel, planets, clusters, debris, enemies, stations, ship, portals, marginPx: 48, details, elderGodLabel: this.getRevealedElderGodLabel() });
      this.systemPanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
      this.flightVectorOverlay?.setState(null);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'SolarSystemPanel render failed', e);
    }
  } else if (this.grimoirePanel && this.grimoirePanel.isEnabled()) {
    try {
      // Update and render the grimoire; delta not tracked here, content is quasi-static
      this.grimoirePanel.update(0);
      this.grimoirePanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
      this.flightVectorOverlay?.setState(null);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'GrimoirePanel render failed', e);
    }
  } else if (this.inventoryPanel && this.inventoryPanel.isEnabled()) {
    try {
      this.refreshInventoryPanelSnapshot();
      this.inventoryPanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
      this.flightVectorOverlay?.setState(null);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'InventoryPanel render failed', e);
    }
  } else {
    // Draw background landing overlay behind the cockpit HUD (full camera view)
    try {
      // Landing overlay removed
    } catch {}
    // Renderizar HUD al final para que quede por encima de objetos y outlines
    this.renderHUDPlane();
  }

  // Render ephemeral placeholder text overlay if active
  try {
    if (this.overlayRenderer && this._placeholderOverlay) {
      const now = performance.now();
      if (now < this._placeholderOverlay.until) {
        this.overlayRenderer.drawTextureCover(
          this._placeholderOverlay.tex,
          this._placeholderOverlay.w,
          this._placeholderOverlay.h,
          1.0,
          1.0
        );
      } else {
        // Cleanup expired
        if (this.gl && this._placeholderOverlay.tex) this.gl.deleteTexture(this._placeholderOverlay.tex);
        this._placeholderOverlay = null;
      }
    }
  } catch {}

  try {
    this.renderAtmosphereEntryFadeOverlay();
  } catch {}

  try {
    this.renderAtmosphereExitTransitionOverlay();
  } catch {}

  // Draw red impact vignette last (on top)
  try {
    if (this.overlayRenderer && this.impactVignetteLevel > 0) {
      this.overlayRenderer.drawVignette([1, 0, 0], Math.min(0.85, this.impactVignetteLevel), 0.58, 0.4);
    }
  } catch {}
  }

  private renderDefaultSolarScene(restoreLitProgram: () => void): void {
    if (!this.gl) {
      return;
    }

    // Renderizar objetos de clusters o proxy según LOD
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    if (this.USE_INSTANCING && this.instancedRenderer) {
      const smalls: GameObject[] = [];
      const supers: GameObject[] = [];
      this.asteroidClusterService.getClusters().forEach(c => {
        const dxS = c.center.x - this.spaceship.position.x;
        const dyS = c.center.y - this.spaceship.position.y;
        const dzS = c.center.z - this.spaceship.position.z;
        const distShip = Math.hypot(dxS, dyS, dzS);
        if (distShip > 20000) return;
        if (!this.isClusterVisible(c, 5000, TargetType.CLUSTER)) {
          return;
        }
        if (c.lodMode === 'proxy' && c.representativeId) {
          const rep = c.objects.find(o => o.id === c.representativeId);
          if (rep) {
            (rep as any).renderOpacity = 1.0;
            if ((rep as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(rep);
            else smalls.push(rep);
          }
        } else if (c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy');
        if (shouldRenderMembers) {
          for (const o of c.objects) {
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) continue;
            if ((o as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(o);
            else smalls.push(o);
          }
        }
      });
      if (this.ephemeralAsteroids.length) {
        for (const a of this.ephemeralAsteroids) {
          if (a.isActive()) smalls.push(a);
        }
      }
      if (this.gameState.independentAsteroids.length) {
        for (const a of this.gameState.independentAsteroids) {
          if (a.isActive()) smalls.push(a);
        }
      }
      this.instancedRenderer.renderBatches(
        smalls,
        supers,
        this.camera.viewMatrix,
        this.camera.projectionMatrix,
        this.lightDirection,
        this.lightColor,
        this.ambientColor,
        this.ambientStrength,
        new Float32Array([0.6, 0.5, 0.4])
      );
      this.resetGLForLitDraw();
      this.shaderManager.useLitProgram();
      this.shaderManager.setLighting(
        this.lightDirection,
        this.lightColor,
        this.ambientColor,
        this.ambientStrength
      );
    } else {
      this.asteroidClusterService.getClusters().forEach(c => {
        const dxS = c.center.x - this.spaceship.position.x;
        const dyS = c.center.y - this.spaceship.position.y;
        const dzS = c.center.z - this.spaceship.position.z;
        const distShip = Math.hypot(dxS, dyS, dzS);
        if (distShip > 20000) return;
        if (!this.isClusterVisible(c, 4000, TargetType.CLUSTER)) {
          return;
        }
        if (!c.representativeId && c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy') || (c.lodMode === 'proxy' && !!c.representativeId);
        if (shouldRenderMembers) {
          c.objects.forEach(o => {
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) return;
            this.shaderManager.setLitOpacity((o as any).renderOpacity ?? 1.0);
            this.renderObject(o);
          });
          if (c.lodMode === 'proxy' && c.representativeId) {
            const rep = c.objects.find(o => o.id === c.representativeId);
            if (rep) {
              this.shaderManager.setLitOpacity(1.0);
              this.renderObject(rep);
            }
          }
        }
      });
      if (this.ephemeralAsteroids.length) {
        for (const a of this.ephemeralAsteroids) {
          if (a.isActive()) {
            this.shaderManager.setLitOpacity(1.0);
            this.renderObject(a);
          }
        }
      }
      if (this.gameState.independentAsteroids.length) {
        for (const a of this.gameState.independentAsteroids) {
          if (a.isActive()) {
            this.shaderManager.setLitOpacity(1.0);
            this.renderObject(a);
          }
        }
      }
    }

    let deferredProjectileViews: ProjectileView[] | null = null;
    let projectilePassTime = 0;

    if (this.lesserBeings.length) {
      for (const being of this.lesserBeings) {
        if (!being.active || !being.visible) {
          continue;
        }
        const opacity = typeof (being as any).renderOpacity === 'number' ? (being as any).renderOpacity : 1.0;
        this.shaderManager.setLitOpacity(opacity);
        this.shaderManager.setLitColor(this.lesserBeingBaseColor);
        this.renderObject(being);
      }
      this.shaderManager.setLitOpacity(1.0);
      if (this.lesserBeingRenderer) {
        try {
          this.lesserBeingRenderer.render(
            this.lesserBeings,
            this.camera.viewMatrix,
            this.camera.projectionMatrix,
            (performance.now() || 0) / 1000
          );
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'LesserBeingRenderer render falló', e);
        }
      }
      restoreLitProgram();
    }

    // Proyectiles de AMBAS facciones: los del jugador existen aunque no haya seres menores en el
    // sistema, así que este paso no puede colgar del bloque de arriba.
    if (this.lesserBeingRenderer) {
      deferredProjectileViews = this.weaponBridge.getRenderViews();
      projectilePassTime = deferredProjectileViews ? (performance.now() || 0) / 1000 : 0;
    }

    this.renderPlanets();

    if (this.lesserBeingRenderer?.hasDeferredTentacles?.()) {
      try {
        this.lesserBeingRenderer.renderDeferredTentacles(
          this.camera.viewMatrix,
          this.camera.projectionMatrix
        );
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'LesserBeingRenderer tentacles falló post-planetas', e);
      }
      restoreLitProgram();
    }

    if (deferredProjectileViews?.length && this.lesserBeingRenderer) {
      try {
        this.lesserBeingRenderer.renderProjectiles(
          deferredProjectileViews,
          this.camera.viewMatrix,
          this.camera.projectionMatrix,
          projectilePassTime || (performance.now() || 0) / 1000
        );
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'LesserBeingRenderer renderProjectiles falló post-planetas', e);
      }
      restoreLitProgram();
    }
    try {
      const portalRenderer = this.portalRenderer;
      if (portalRenderer) {
        portalRenderer.render(this.gameState.portals, this.camera.viewMatrix, this.camera.projectionMatrix, (performance.now() || 0) / 1000);
      }
    } catch {}

    // renderOutlineSystem() eliminado (Fase 6.1): los outlines 3D de v1 están desactivados y solo
    // alimentaba el cerebro de detección de ReticleManager, que está MUERTO (updateTargetDetection
    // nunca se llama; v2 AdaptiveTargeting es el único sistema activo). El outline visible es el
    // overlay 2D de v2 (renderTargetOutline2D). Ver docs/ARQUITECTURA.md Hallazgo 6.1.
    this.renderTargetOutline2D();
  }

  /**
   * Aplica gravedad atmosférica hacia el centro de la esfera de suelo
   * La intensidad aumenta a medida que la nave se acerca a la superficie
   */
  private applyAtmosphereGravity(deltaTime: number): void {
    this.atmosphereFlight.applyGravity(deltaTime, this.atmosphereFlightHost);
  }

  // computeAtmosphereAutoVectorSpeedFactor se movió a AtmosphereFlightSystem (Fase 5.1).

  /**
   * Actualiza los efectos de audio atmosféricos según la velocidad de la nave
   * - Alta velocidad (>2.5): sfx_passby_air (aire silbando)
   * - Baja velocidad (<0.8): sfx_stall loop (pérdida de sustentación)
   */
  private updateAtmosphereAudio(deltaTime: number): void {
    if (!this.audio) {
      this.stopWeatherAudioLoop();
      return;
    }
    if (!this.spaceship || !this.atmosphereSceneState.active) {
      this.stopWeatherAudioLoop();
      return;
    }

    const speed = this.spaceship.currentSpeed;
    const HIGH_SPEED_THRESHOLD = 2.5;  // Umbral para aire silbando
    const LOW_SPEED_THRESHOLD = 0.8;   // Umbral para stall warning

    // === AIR RUSH (alta velocidad) ===
    if (speed > HIGH_SPEED_THRESHOLD) {
      // Reproducir aire silbando si no está activo
      if (!this.atmosphereAirRushHandle || !this.atmosphereAirRushHandle.isPlaying()) {
        this.atmosphereAirRushHandle = this.audio.play('sfx_passby_air', {
          volume: 0.4,
          bus: 'sfx',
          loop: false, // one-shot de 1.2s
        });
      }
    }

    // === STALL WARNING (baja velocidad) ===
    const stallAllowed = !this.stallWarningSuppressedUntilTakeoff;
    const stallActive = stallAllowed && speed < LOW_SPEED_THRESHOLD;
    if (stallActive) {
      if (!this.atmosphereStallHandle || !this.atmosphereStallHandle.isPlaying()) {
        this.atmosphereStallHandle = this.audio.play('sfx_stall', {
          volume: 0.5,
          bus: 'sfx',
          loop: true,
        });
      }
    } else {
      this.stopAtmosphereStallWarning();
    }

    if (this.hudManager) {
      this.hudManager.setStallWarning(stallActive);
    }

    this.updateWeatherAudioLoop();
  }

  private setStallWarningSuppressedUntilTakeoff(active: boolean): void {
    if (this.stallWarningSuppressedUntilTakeoff === active) {
      return;
    }
    this.stallWarningSuppressedUntilTakeoff = active;
    if (active) {
      this.stopAtmosphereStallWarning();
    }
  }

  private releaseStallWarningSuppressionAfterImpact(): void {
    if (!this.stallWarningSuppressedUntilTakeoff) {
      return;
    }
    if (this.landingSequenceActive || this.takeoffSequenceActive || this.atmosphereLandingCinematicActive) {
      return;
    }
    if (this.landingPanelController.isAwaitingUser) {
      return;
    }
    this.setStallWarningSuppressedUntilTakeoff(false);
  }

  private stopAtmosphereStallWarning(): void {
    if (this.atmosphereStallHandle && this.atmosphereStallHandle.isPlaying()) {
      try { this.atmosphereStallHandle.stop(200); } catch {}
      this.atmosphereStallHandle = null;
    }
    try { this.hudManager?.setStallWarning(false); } catch {}
  }

  private updateWeatherAudioLoop(): void {
    if (!this.audio || !this.spaceship || !this.isAtmosphereSceneActive()) {
      this.stopWeatherAudioLoop();
      return;
    }
    const snapshot = this.atmosphereWeatherSnapshot;
    const cue = snapshot?.audioCue ?? null;
    const intensity = snapshot ? this.clamp(snapshot.intensity ?? 0, 0, 1) : 0;
    if (!snapshot || !cue || intensity <= 0.01 || !this.audio.has(cue)) {
      this.stopWeatherAudioLoop();
      return;
    }

    if (!this.weatherAudioHandle || !this.weatherAudioHandle.isPlaying() || this.weatherAudioCue !== cue) {
      try { this.weatherAudioHandle?.stop(200); } catch {}
      this.weatherAudioHandle = this.audio.play(cue, {
        loop: true,
        bus: 'weather',
        volume: 0,
        fadeInMs: 200,
      });
      this.weatherAudioCue = cue;
    }

    const targetVolume = 0.12 + intensity * 0.55;
    if (this.weatherAudioHandle) {
      this.weatherAudioHandle.setVolume(targetVolume);
    }
    // Audio de trueno ELIMINADO junto con el rayo atmosférico (no prioritario, se rehará otro día).
  }

  private stopWeatherAudioLoop(): void {
    if (this.weatherAudioHandle) {
      try { this.weatherAudioHandle.stop(200); } catch {}
      this.weatherAudioHandle = null;
    }
    this.weatherAudioCue = null;
  }

  private primeAtmosphereAirRushCue(): void {
    if (!this.audio || !this.atmosphereSceneState.active) {
      return;
    }
    if (this.atmosphereAirRushHandle && this.atmosphereAirRushHandle.isPlaying()) {
      return;
    }
    this.atmosphereAirRushHandle = this.audio.play('sfx_passby_air', {
      volume: 0.4,
      bus: 'sfx',
      loop: false,
    });
  }

  private createDefaultAtmosphereSceneState(): AtmosphereSceneState {
    return {
      active: false,
      context: null,
      center: { x: 0, y: 0, z: 0 },
      groundRadius: 0,
      skyRadius: 0,
      groundCollisionRadius: 0,
      groundColor: new Float32Array([0.32, 0.32, 0.32]),
      skyColor: new Float32Array([0.05, 0.08, 0.18]),
      groundPalette: this.createFallbackGroundPalette(),
      groundPaletteKey: 'atmo-ground-default',
      entryAltitude: 0,
      lastUpdatedMs: 0,
      terrainSeed: 0,
    };
  }

  private createFallbackGroundPalette(): AtmosphereGroundPalette {
    return {
      lowlands: new Float32Array([0.32, 0.32, 0.32]),
      highlands: new Float32Array([0.48, 0.44, 0.38]),
      dunes: new Float32Array([0.55, 0.42, 0.30]),
      polar: new Float32Array([0.82, 0.86, 0.92]),
      strata: new Float32Array([0.40, 0.36, 0.30]),
      valleys: new Float32Array([0.30, 0.26, 0.24]),
      plains: new Float32Array([0.44, 0.34, 0.30]),
      midlands: new Float32Array([0.58, 0.46, 0.36]),
      peaks: new Float32Array([0.76, 0.66, 0.54]),
    };
  }

  /** Crea 9 planetas en órbitas elípticas concéntricas en el plano XZ
   * Requisitos:
   * - 9 planetas totales
   * - 1 gaseous, 1 giant
   * - Tierra en la 3ª órbita más cercana al centro
   * - El giant debe tener su órbita (a,b) un 15% mayor que un planetoide equivalente
   */
  /** Actualiza la posición/orientación de planetas según su órbita */
  private updatePlanets(dt: number): void {
    for (const p of this.gameState.planets) {
      // Skip orbital translation for anchored primary sun
      if (this.gameState.sun && p.id === this.gameState.sun.id) {
        p.update(dt);
        continue;
      }
      p.orbitAngle += p.orbitAngularSpeed * dt;
      // Mantener ángulo en rango
      if (p.orbitAngle > Math.PI * 2) p.orbitAngle -= Math.PI * 2;
      if (p.orbitAngle < 0) p.orbitAngle += Math.PI * 2;
      // Elipse en el plano local: r = uR * (a cos t) + vR * (b sin t)
      // 1) Asegurar base ortonormal del plano
      const n0 = vec3Normalize({ x: p.orbitNormal.x, y: p.orbitNormal.y, z: p.orbitNormal.z });
      // Proyectar orbitU al plano y normalizar; fallback si degenerado
      const dotUN = (p.orbitU.x * n0.x + p.orbitU.y * n0.y + p.orbitU.z * n0.z);
      let u0 = { x: p.orbitU.x - dotUN * n0.x, y: p.orbitU.y - dotUN * n0.y, z: p.orbitU.z - dotUN * n0.z };
      const lenU0 = Math.hypot(u0.x, u0.y, u0.z);
      if (lenU0 < 1e-6) {
        // Elegir un vector arbitrario no paralelo a n0
        const w = Math.abs(n0.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
        // u0 = normalize(w - (w·n) n)
        const dotWN = (w.x*n0.x + w.y*n0.y + w.z*n0.z);
        u0 = { x: w.x - dotWN*n0.x, y: w.y - dotWN*n0.y, z: w.z - dotWN*n0.z };
      }
      u0 = vec3Normalize(u0);
      // v = n × u
      let v0 = { x: n0.y*u0.z - n0.z*u0.y, y: n0.z*u0.x - n0.x*u0.z, z: n0.x*u0.y - n0.y*u0.x };
      v0 = vec3Normalize(v0);
      // 2) Aplicar rotación en el plano por orbitOrientation (mantener compatibilidad)
      const co = Math.cos(p.orbitOrientation || 0);
      const so = Math.sin(p.orbitOrientation || 0);
      const uR = { x: u0.x*co + v0.x*so, y: u0.y*co + v0.y*so, z: u0.z*co + v0.z*so };
      const vR = { x: -u0.x*so + v0.x*co, y: -u0.y*so + v0.y*co, z: -u0.z*so + v0.z*co };
      // 3) Posición global
      const ct = Math.cos(p.orbitAngle), st = Math.sin(p.orbitAngle);
      const rx = uR.x * (p.semiMajor * ct) + vR.x * (p.semiMinor * st);
      const ry = uR.y * (p.semiMajor * ct) + vR.y * (p.semiMinor * st);
      const rz = uR.z * (p.semiMajor * ct) + vR.z * (p.semiMinor * st);
      p.position.x = p.orbitCenter.x + rx;
      p.position.y = p.orbitCenter.y + ry;
      p.position.z = p.orbitCenter.z + rz;
  // Integrar rotación propia con dt y actualizar matrices
  p.update(dt);
      // Mover debris asociados (si existen), manteniendo su offset local y rotándolos con la Tierra
      const debris = this.planetDebris.get(p.id);
      if (debris && debris.length) {
        const cosY = Math.cos(p.rotation.y || 0);
        const sinY = Math.sin(p.rotation.y || 0);
        // Axial tilt (around Z) to incline the debris belt with the planet's axis
        const tilt = (p as any).axialTiltRad || 0;
        const cT = Math.cos(tilt);
        const sT = Math.sin(tilt);
        for (const d of debris) {
          const lx = d.local.x, ly = d.local.y, lz = d.local.z;
          // 1) Rotación de spin alrededor de Y (espacio del planeta)
          const rxY = lx * cosY - lz * sinY;
          const rzY = lx * sinY + lz * cosY;
          // 2) Aplicar inclinación axial alrededor de Z para inclinar el cinturón
          const rxZ = cT * rxY - sT * ly;
          const ryZ = sT * rxY + cT * ly;
          d.obj.position.x = p.position.x + rxZ;
          d.obj.position.y = p.position.y + ryZ;
          d.obj.position.z = p.position.z + rzY;
          d.obj.updateModelMatrix();
          if (d.obj.boundingSphere) d.obj.boundingSphere.center = { ...d.obj.position } as any;
        }
      }
    }
    this.tardisCompanionSystem.update(this.tardisCompanionHost);
  }

  /**
   * Create a debris belt of MegaAsteroids around a planet, similar to Earth's but without hemisphere gap logic.
   * Returns an array of { obj, local } entries for planetDebris.
   */
  private createDebrisBeltForPlanet(
    planet: Planet,
    totalCount: number,
    options?: { spreadScale?: number; yScale?: number }
  ): Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }> {
    const arr: Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }> = [];
    // Use originalRadius if available (for RingedPlanet), otherwise use scale.x
    const R = Math.max(1, planet.scale.x);
    // Escalas opcionales: spreadScale comprime el rango radial (rMax-rMin) y la aleatoriedad; yScale comprime el grosor vertical
    const spreadScale = Math.max(0.05, Math.min(1.0, options?.spreadScale ?? 1.0));
    const yScale = Math.max(0.05, Math.min(1.0, options?.yScale ?? 1.0));
    // Distribute in three belts: near, mid, far
    const nNear = Math.max(0, Math.round(totalCount * 0.55));
    const nMid  = Math.max(0, Math.round(totalCount * 0.30));
    const nFar  = Math.max(0, Math.max(0, totalCount - nNear - nMid));
    const addBelt = (count: number, rMinMul: number, rMaxMul: number, jitter: number, yAmpMul: number, label: string) => {
      for (let i = 0; i < count; i++) {
        const t = Math.random() * Math.PI * 2;
        // Comprimir el rango radial según spreadScale para anillos menos dispersos
        const effectiveMax = rMinMul + (rMaxMul - rMinMul) * spreadScale;
        const mul = rMinMul + Math.random() * Math.max(0.0001, (effectiveMax - rMinMul));
        const r = R * mul * (1 + (Math.random() - 0.5) * (jitter * spreadScale));
        const x = Math.cos(t) * r;
        const z = Math.sin(t) * r;
        // Thin vertical thickness with slight jitter; will be tilted by planet.axialTiltRad in update
        const amp = (R * 0.02) * (yAmpMul * yScale);
        const yOffset = (Math.random() < 0.5 ? -1 : 1) * (Math.random() * amp);
        const pos = { x: planet.position.x + x, y: planet.position.y + yOffset, z: planet.position.z + z };
        const size = 0.6 * (0.7 + Math.random() * 0.6);
        const obj = new MegaAsteroid(`${planet.id}-mega-${label}-${i}`, pos, size);
        const local = { x: pos.x - planet.position.x, y: pos.y - planet.position.y, z: pos.z - planet.position.z };
        arr.push({ obj, local });
      }
    };
    addBelt(nNear, 1.6, 2.1, 0.06, 0.35, 'near');
    addBelt(nMid,  2.2, 2.9, 0.10, 0.22, 'mid');
    addBelt(nFar,  3.0, 3.8, 0.14, 0.12, 'far');
    return arr;
  }

  /** Renderiza planetas con LOD de shading para evitar artefactos por distancia:
   * - < 5,000u: shader texturizado tintado (detallado)
   * - 5,000u..20,000u: lit monocromo sin especular (Lambert simple)
   * - >= 20,000u: básico sin iluminación (flat color) para máxima estabilidad
   */
  private renderPlanets(): void {
    if (!this.gl || !this.shaderManager) return;
    const cam = this.camera;
  // Guardar estado mínimo para no interferir con otros pases
    const prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    const wasBlend = this.gl.isEnabled(this.gl.BLEND);
    // Asegurar estado de profundidad correcto para planetas
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(true);
    
    for (const p of this.gameState.planets) {
      const isSun = (p as any).planetType === 'Sun';
      const isPrimarySun = p === this.gameState.sun;
      // Calcular iluminación basada en Sol si existe (direccional desde el sol al objeto)
      let lightDir = this.lightDirection;
      let ambientStrengthLocal = this.ambientStrength;
      let lightColorLocal = this.lightColor;
      if (this.gameState.sun) {
        const lx = p.position.x - this.gameState.sun.position.x;
        const ly = p.position.y - this.gameState.sun.position.y;
        const lz = p.position.z - this.gameState.sun.position.z;
        const len = Math.hypot(lx, ly, lz) || 1;
        lightDir = new Float32Array([lx / len, ly / len, lz / len]);
        // Luz más cálida
        lightColorLocal = new Float32Array([1.0, 0.95, 0.75]);
        // Ambiente dependiente de distancia (más cerca = más luz rebotada)
        const d = Math.max(1, len);
        const inv = 1.0 / Math.pow(d / 5000, 1.2);
        // Reducir base ambiental para más contraste lejos del Sol
        ambientStrengthLocal = Math.min(0.6, 0.03 + inv * 0.55);
      }
      // Distancia cámara-planet (para decidir la textura de magma del Sol)
      const cdx = p.position.x - cam.position.x;
      const cdy = p.position.y - cam.position.y;
      const cdz = p.position.z - cam.position.z;
      const distCam = Math.hypot(cdx, cdy, cdz);

      // Render de la esfera (a todas las distancias, sin sprite/flicker). Caps emisivas en 2º pase.
      if (isSun) {
        // Distancia cámara-Sol para decidir magma
        // Usar flat color hasta muy cerca (20ku) para evitar flickering por aliasing de textura
        const magma = this.textureManager.getTexture('magma');
        if (distCam < 20000 && magma && this.shaderManager.unlitTexProgram) {
          // Sun core con textura de magma (self-lit, sin iluminación)
          this.shaderManager.useUnlitTexProgram();
          this.calculateNormalMatrix(p.modelMatrix);
          this.shaderManager.setUnlitTexMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
          this.shaderManager.setUnlitDiffuseTexture(magma);
          p.render(this.gl, this.shaderManager.unlitTexProgram!, cam.viewMatrix, cam.projectionMatrix);
        } else if (this.planetSurfaceRenderer) {
          // Sun core procedural: granulación + manchas + oscurecimiento del limbo — docs §10.b
          this.calculateNormalMatrix(p.modelMatrix);
          const sunCamPos = new Float32Array([cam.position.x, cam.position.y, cam.position.z]);
          this.planetSurfaceRenderer.renderSun(p as Planet, p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix, sunCamPos, performance.now() / 1000);
        } else {
          // Fallback: self-lit, flat color
          this.shaderManager.useBasicProgram();
          this.calculateNormalMatrix(p.modelMatrix);
          this.shaderManager.setBasicMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
          p.render(this.gl, this.shaderManager.basicProgram!, cam.viewMatrix, cam.projectionMatrix);
        }
      } else if (this.planetSurfaceRenderer && this.planetSurfaceRenderer.handles(p as Planet)) {
        // Superficie procedural (rocky/terrestrial/gaseous/ice + rim de atmósfera). docs/ARQUITECTURA.md §10
        this.calculateNormalMatrix(p.modelMatrix);
        const camPos = new Float32Array([cam.position.x, cam.position.y, cam.position.z]);
        this.planetSurfaceRenderer.renderPlanet(
          p as Planet, p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix,
          camPos, lightDir, lightColorLocal, this.ambientColor, ambientStrengthLocal,
          performance.now() / 1000
        );
      } else {
        // Tierra partida (earth_split): render texturizado con núcleo emisivo (se conserva su look especial)
        this.shaderManager.useTexturedProgram();
        this.calculateNormalMatrix(p.modelMatrix);
        this.shaderManager.setTexturedMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
        const base = new Float32Array([p.color.r, p.color.g, p.color.b]);
        this.shaderManager.setTexturedLighting(lightDir, lightColorLocal, this.ambientColor, ambientStrengthLocal, base);
        const metallicTexture = this.textureManager.getTexture('metallic');
        const gradientTexture = this.textureManager.getTexture('gradient');
        if (metallicTexture && gradientTexture) {
          this.shaderManager.setTexturedTextures(metallicTexture, gradientTexture);
        }
        // Emisivo desde el núcleo de la Tierra
        const lp = new Float32Array([p.position.x, p.position.y, p.position.z]);
        const lc = new Float32Array([1.0, 0.25, 0.05]);
        this.shaderManager.setPointLightTextured(lp, lc, 2.0, 1500.0, true);
        p.render(this.gl, this.shaderManager.texturedProgram!, cam.viewMatrix, cam.projectionMatrix);
      }

      // Anillos reales (Saturno): tras la superficie, a todas las distancias — docs §10.b
      if (this.planetRingRenderer && (p as Planet).planetType === PlanetType.Ringed) {
        this.planetRingRenderer.render(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
      }

      // Segundo pase: tapas emisivas del planeta partido (si aplica)
      if ((p as any).renderCapsEmissive) {
        try {
          (p as any).renderCapsEmissive(this.gl, this.shaderManager, cam.viewMatrix, cam.projectionMatrix);
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderCapsEmissive failed', e);
        }
      }
      // Brillo del Sol (si aplica)
      // Para el primarySun, SIEMPRE renderizar el glow (sin importar frustum/posición)
      if ((p as any).renderGlow && isPrimarySun) {
        try {
          (p as any).renderGlow(this.gl as any, this.shaderManager, this.camera);
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderGlow(primary sun) failed', e);
        }
      } else if ((p as any).renderGlow && isSun) {
        // Otros soles (si los hay)
        try {
          (p as any).renderGlow(this.gl as any, this.shaderManager, this.camera);
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderGlow(secondary sun) failed', e);
        }
      } else if ((p as any).renderGlow) {
        // Otros objetos con glow
        try {
          (p as any).renderGlow(this.gl as any, this.shaderManager, this.camera);
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderGlow failed', e);
        }
      }
      // Si el sol está detrás de la cámara, mantener un glow ambiente suave
      if (isSun) {
        try {
          const camPos = this.camera.position;
          const camFwd = { x: this.camera.target.x - camPos.x, y: this.camera.target.y - camPos.y, z: this.camera.target.z - camPos.z };
          const camFwdLen = Math.hypot(camFwd.x, camFwd.y, camFwd.z) || 1; camFwd.x/=camFwdLen; camFwd.y/=camFwdLen; camFwd.z/=camFwdLen;
          const toSun = { x: p.position.x - camPos.x, y: p.position.y - camPos.y, z: p.position.z - camPos.z };
          const toSunLen = Math.hypot(toSun.x, toSun.y, toSun.z) || 1; const nd = { x: toSun.x/toSunLen, y: toSun.y/toSunLen, z: toSun.z/toSunLen };
          const dot = camFwd.x*nd.x + camFwd.y*nd.y + camFwd.z*nd.z;
          if (dot < 0) {
            (p as any).renderAmbientGlow(this.gl as any, this.shaderManager, this.camera, 0.035);
          }
        } catch {}
      }

      // Gate Rite: storm shell overlay during collapse (if metadata present)
      try {
        const storm = (p as any)._gateRiteStormShell;
        if (storm && this.shaderManager.stormShellProgram && this.gl) {
          const gl = this.gl as WebGL2RenderingContext;
          const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
          const wasBlend = gl.isEnabled(gl.BLEND);
          const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
          const wasCull = gl.isEnabled(gl.CULL_FACE);
          gl.enable(gl.BLEND);
          // Additive to make veins pop without darkening
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(false);
          gl.disable(gl.CULL_FACE);

          const shellScale = 1.06; // slightly larger than current (shrinking) sphere
          this.shaderManager.useStormShellProgram();
          this.shaderManager.setStormShellMatrices(p.modelMatrix, this.camera.viewMatrix, this.camera.projectionMatrix);
          const base = new Float32Array([1.0, 0.38, 0.10]);
          const vein = new Float32Array([1.0, 0.95, 0.85]);
          this.shaderManager.setStormShellParams(storm.time || 0, storm.intensity ?? 1.0, storm.flash ?? 0.0, shellScale, base, vein);

          // Bind only position attribute from planet geometry
          const aPos = (this.shaderManager as any).stormShellAttributes['position'];
          if (aPos !== undefined && aPos >= 0 && (p as any).vertexBuffer && (p as any).indexBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, (p as any).vertexBuffer);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, (p as any).indexBuffer);
            gl.drawElements(gl.TRIANGLES, p.indices.length, gl.UNSIGNED_SHORT, 0);
            gl.disableVertexAttribArray(aPos);
          }

          // Restore default depth mask and a sane blend func for subsequent passes
          gl.depthMask(true);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          if (!wasBlend) gl.disable(gl.BLEND);
          if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
          if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
          if (prevProg) gl.useProgram(prevProg as any);
        }
      } catch {}
    }
    
    // GARANTIZAR: Renderizar halo del primarySun SIEMPRE, incluso si el bucle lo saltó
    // Esto asegura que el brillo solar sea visible sin importar frustum/posición
    if (this.gameState.sun && (this.gameState.sun as any).renderGlow) {
      try {
        (this.gameState.sun as any).renderGlow(this.gl as any, this.shaderManager, this.camera);
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderGlow(primary sun post-loop) failed', e);
      }
    }
    
    // Renderizar debris asociados a planetas con LOD sencillo
    this.renderPlanetDebris();
    this.renderSpaceTurtle();
    this.stationRenderer.render(this.stationRenderHost);
    this.aracnidStationRenderer.render(this.aracnidStationRenderHost);
    // Desbindeo explícito de texturas usadas por el pase texturizado de planetas
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE0);
    // Restaurar estado
    if (!wasBlend) this.gl.disable(this.gl.BLEND);
    if (prevProgram) this.gl.useProgram(prevProgram);
  }

  /** Convert float RGB [0..1] to hex string */
  private rgbToHex(r: number, g: number, b: number): string {
    return rgbToHex(r, g, b);
  }

  /** Renderiza la tortuga estelar (si la hay) con el shader iluminado + color por vértice + emissive (ojos). */
  private renderSpaceTurtle(): void {
    const turtle = this.spaceTurtleSystem.getRenderable();
    // Liberar los buffers de la tortuga anterior cuando cambia o desaparece (evita leaks por avistamiento).
    if (turtle !== this.renderedTurtle) {
      if (this.renderedTurtle && this.gl) { try { this.renderedTurtle.destroy(this.gl); } catch {} }
      this.renderedTurtle = turtle;
    }
    if (!turtle || !this.gl || !this.shaderManager || !this.camera) {
      return;
    }
    const gl = this.gl;
    if (!turtle.vertexBuffer) turtle.initBuffers(gl);
    turtle.uploadDynamicGeometry(gl); // la pose de nado cambia cada frame
    const cam = this.camera;
    const camPosArr = new Float32Array([cam.position.x, cam.position.y, cam.position.z]);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    this.shaderManager.useLitProgram();
    this.calculateNormalMatrix(turtle.modelMatrix);
    this.shaderManager.setLitMatrices(turtle.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
    this.shaderManager.setLighting(this.lightDirection, this.lightColor, this.ambientColor, this.ambientStrength);
    this.shaderManager.setSpecular(camPosArr, 0.2, 14.0);
    this.shaderManager.setLitVertexColorMode(true);
    this.shaderManager.setLitEmissive(1.0);
    turtle.render(gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
    this.shaderManager.setLitVertexColorMode(false);
    this.shaderManager.setLitEmissive(0.0);
  }

  /** ¿Se puede acoplar AHORA? Nave dentro del corredor de marcos Y a ≤5 u/s RELATIVA al puerto (§8). */
  private isStationDockReady(): boolean {
    return this.spaceStationSystem.isDockReady();
  }

  // El aviso HUD del corredor (relativa en vivo / "acople listo") lo emite SpaceStationSystem via
  // host.showDockHint (§8): el piloto "Land" se enciende en updateLandingTelemetry con isStationDockReady.

  /** ENTER: inicia la cinemática de atraque si se puede acoplar (corredor + relativa ≤5). */
  public requestStationDock(): boolean {
    // Auto-sanar: si el flag quedó colgado pero no hay cinemática de acople REAL en curso, resetearlo.
    if (this.stationDockingActive &&
        (this.animationManager?.getCurrentAnimation?.()?.name ?? null) !== 'docking-sequence') {
      this.stationDockingActive = false;
    }
    if (this.stationPanelOpen || this.stationDockingActive) {
      return false;
    }
    // Condición §8: nave dentro del corredor de marcos Y a ≤5 u/s relativa (la que anuncia el piloto).
    const cand = this.spaceStationSystem.getDockCandidate();
    if (!cand || !this.spaceStationSystem.isDockReady()) {
      return false; // sin corredor o demasiado rápido → ENTER no es para acoplar
    }
    this.startStationDocking('docking', cand);
    return true;
  }

  /** Lanza la cinemática de atraque/separación (DockingSequenceAnimation) y guarda el modo de cámara previo. */
  private startStationDocking(mode: 'docking' | 'undocking', port: DockPort): void {
    if (!this.spaceship) {
      return;
    }
    if (mode === 'docking') {
      this.stationDockPrevCamMode = this.camera?.getCurrentMode?.() ?? null;
    }
    this.stationDockingActive = true;
    let started = false;
    try {
      started = this.animationManager.startDockingSequence(this, {
        mode,
        portPosition: { ...port.position },
        approachNormal: { ...(port.approachNormal ?? { x: 0, y: 1, z: 0 }) },
        onComplete: (aborted: boolean) => this.onStationDockingComplete(mode, port, aborted),
      });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'startDockingSequence lanzó excepción', e);
    }
    if (!started) {
      this.stationDockingActive = false;
      const blocking = this.animationManager?.getCurrentAnimation?.()?.name ?? 'ninguna';
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'La cinemática de acople no arrancó', { blocking, mode });
      try { this.showPlaceholderText(`No se pudo iniciar el acople (animación en curso: ${blocking})`, 3000); } catch {}
    }
  }

  /** Fin de la cinemática: al atracar abre el menú (la cámara MANUAL se mantiene); al separar restaura la cámara. */
  private onStationDockingComplete(mode: 'docking' | 'undocking', port: DockPort, aborted: boolean): void {
    this.stationDockingActive = false;
    if (mode === 'docking') {
      if (!aborted) {
        this.openStationPanel(port);
      }
    } else {
      try { if (this.stationDockPrevCamMode != null) this.camera?.setCameraMode?.(this.stationDockPrevCamMode); } catch {}
      this.stationDockPrevCamMode = null;
    }
  }

  private openStationPanel(port: DockPort): void {
    this.stationPanelOpen = true;
    this.stationDockedPort = port;
    port.occupied = true;
    const station = this.spaceStationSystem.getRenderable();
    const stationName = station ? station.getDisplayName() : 'Estación';
    const comp = (globalThis as { GameComponentInstance?: { openStationPanel?: (d: { stationName: string; portName: string }) => void } }).GameComponentInstance;
    if (comp && typeof comp.openStationPanel === 'function') {
      try { comp.openStationPanel({ stationName, portName: port.getDisplayName() }); } catch {}
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Station dock panel opened', { port: port.id });
  }

  /** Llamado desde el componente al despegar: libera el puerto y lanza la animación de separación. */
  public notifyStationPanelClosed(): void {
    this.stationPanelOpen = false;
    const port = this.stationDockedPort;
    this.stationDockedPort = null;
    if (port) {
      port.occupied = false;
      this.startStationDocking('undocking', port);
    }
  }

  /** Renderiza los mega-asteroides de debris vinculados a planetas con un LOD simple */
  private renderPlanetDebris(): void {
    if (!this.gl || !this.shaderManager) return;
    const cam = this.camera;
    const camPosArr = new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]);
    // Culling específico: si la cámara está a >= SPRITE LOD (~50,000u), no renderizar debris de ese planeta
    const SPRITE_LOD_DISTANCE = 50000;
    const earth = this.gameState.findPlanetById(EARTH_PLANET_ID);
    const saturn = this.gameState.findPlanetById(RINGED_PLANET_ID);
    let skipEarth = false;
    let skipSaturn = false;
    if (earth && this.camera) {
      const dxE = earth.position.x - this.camera.position.x;
      const dyE = earth.position.y - this.camera.position.y;
      const dzE = earth.position.z - this.camera.position.z;
      const distCamToEarth = Math.hypot(dxE, dyE, dzE);
      skipEarth = distCamToEarth >= SPRITE_LOD_DISTANCE;
    }
    if (saturn && this.camera) {
      const dxS = saturn.position.x - this.camera.position.x;
      const dyS = saturn.position.y - this.camera.position.y;
      const dzS = saturn.position.z - this.camera.position.z;
      const distCamToSaturn = Math.hypot(dxS, dyS, dzS);
      skipSaturn = distCamToSaturn >= SPRITE_LOD_DISTANCE;
    }
    for (const [pid, arr] of this.planetDebris.entries()) {
      if ((skipEarth && pid === EARTH_PLANET_ID) || (skipSaturn && pid === RINGED_PLANET_ID)) continue;
      for (const d of arr) {
        const a = d.obj;
        if ((a as { isTardis?: boolean }).isTardis) {
          // Cuerpo SOMBREADO (luz) + ventanas/farol EMISSIVE: el shader iluminado normalmente ignora
          // v_color (usa un único u_baseColor); aquí activamos el modo color-por-vértice + emissive SÓLO
          // para la TARDIS y lo reseteamos después para no afectar al resto de objetos iluminados.
          this.shaderManager.useLitProgram();
          this.calculateNormalMatrix(a.modelMatrix);
          this.shaderManager.setLitMatrices(a.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
          this.shaderManager.setLighting(this.lightDirection, this.lightColor, this.ambientColor, this.ambientStrength);
          this.shaderManager.setSpecular(camPosArr, 0.15, 12.0);
          this.shaderManager.setLitVertexColorMode(true);
          this.shaderManager.setLitEmissive(1.0);
          a.render(this.gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
          this.shaderManager.setLitVertexColorMode(false);
          this.shaderManager.setLitEmissive(0.0);
          continue;
        }
        const dx = a.position.x - this.spaceship.position.x;
        const dy = a.position.y - this.spaceship.position.y;
        const dz = a.position.z - this.spaceship.position.z;
        const distShip = Math.hypot(dx, dy, dz);

        if (distShip < 5000) {
          // Cercano: lit con especular suave
          this.shaderManager.useLitProgram();
          this.calculateNormalMatrix(a.modelMatrix);
          this.shaderManager.setLitMatrices(a.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
          this.shaderManager.setLighting(this.lightDirection, this.lightColor, this.ambientColor, this.ambientStrength);
          this.shaderManager.setSpecular(camPosArr, 0.2, 16.0);
          this.shaderManager.setLitColor(new Float32Array([(a as any).color?.r ?? 0.6, (a as any).color?.g ?? 0.5, (a as any).color?.b ?? 0.4]));
          a.render(this.gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
        } else if (distShip < 20000) {
          // Medio: sin especular para evitar parpadeos
          this.shaderManager.useLitProgram();
          this.calculateNormalMatrix(a.modelMatrix);
          this.shaderManager.setLitMatrices(a.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
          this.shaderManager.setLighting(this.lightDirection, this.lightColor, this.ambientColor, this.ambientStrength);
          this.shaderManager.setSpecular(camPosArr, 0.0, 1.0);
          this.shaderManager.setLitColor(new Float32Array([(a as any).color?.r ?? 0.6, (a as any).color?.g ?? 0.5, (a as any).color?.b ?? 0.4]));
          a.render(this.gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
        } else {
          // Lejano: flat color
          this.shaderManager.useBasicProgram();
          this.shaderManager.setBasicMatrices(a.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
          a.render(this.gl, this.shaderManager.basicProgram!, cam.viewMatrix, cam.projectionMatrix);
        }
      }
    }
  }

  /**
   * Cluster-level frustum/distance culling.
   * Returns true if the cluster's bounding sphere intersects the camera frustum cone approximation.
   * Also applies a hard distance cutoff (farDistance).
   */
  private isClusterVisible(cluster: any, farDistance: number = 4000, type?: TargetType): boolean {
    // Excepción por tipo: ciertos tipos nunca se cullan (p.ej., PLANET)
    if (type !== undefined && this.neverCullTypes.has(type)) return true;
    // Compute bounding radius from persistent offsets (stable across LOD)
    let radius = (cluster.config?.radius ?? 10);
    if (cluster.memberOffsets) {
      for (const off of cluster.memberOffsets.values()) {
        const d = Math.hypot(off.x, off.y, off.z);
        if (d > radius) radius = d;
      }
    }
    const center = cluster.center;
    const camPos = this.camera.position;
    const toC = { x: center.x - camPos.x, y: center.y - camPos.y, z: center.z - camPos.z };
    const dist = Math.hypot(toC.x, toC.y, toC.z);
    // Hard cutoff: if sphere entirely beyond farDistance, cull
    if (dist - radius > farDistance) return false;

    // Build camera basis
    const fwd = vec3Normalize({ x: this.camera.target.x - camPos.x, y: this.camera.target.y - camPos.y, z: this.camera.target.z - camPos.z });
    // Ensure up basis is orthonormal
    const worldUp = this.camera.up;
    const right = vec3Normalize({
      x: fwd.y * worldUp.z - fwd.z * worldUp.y,
      y: fwd.z * worldUp.x - fwd.x * worldUp.z,
      z: fwd.x * worldUp.y - fwd.y * worldUp.x,
    });
    const upB = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    };

    // Coordinates in camera basis
    const depth = toC.x * fwd.x + toC.y * fwd.y + toC.z * fwd.z;
    const sideX = toC.x * right.x + toC.y * right.y + toC.z * right.z;
    const sideY = toC.x * upB.x + toC.y * upB.y + toC.z * upB.z;

    // Behind camera completely (allow small radius tolerance)
    if (depth + radius <= 0) return false;

    // Get tan(fov/2) from projection matrix, and aspect from proj[5]/proj[0]
    const proj = this.camera.projectionMatrix as unknown as Float32Array;
    const f = proj[5] || 1; // f = 1/tan(fov/2)
    const tanHalfFovy = 1 / f;
    const aspect = (proj[0] !== 0) ? (f / (proj[0])) : 1.7777778;
    const tanHalfFovx = tanHalfFovy * aspect;

    // Frustum side checks with radius inflation
    const halfW = depth * tanHalfFovx + radius;
    const halfH = depth * tanHalfFovy + radius;
    if (Math.abs(sideX) > halfW) return false;
    if (Math.abs(sideY) > halfH) return false;

    return true;
  }

  /**
   * Renderiza la nave con textura metálica
   */
  private renderSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship || !this.textureManager) {
      return;
    }
    if (!this.spaceship.vertexBuffer) {
      this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'Spaceship has no vertex buffer - skipping render');
      return;
    }
    // Estado GL limpio para el pase lit (compartido con otros pases)
    this.resetGLForLitDraw();
    // Iluminacion de la nave: luz desde el Sol si existe
    let shipLightDir = this.lightDirection;
    let shipLightColor = this.lightColor;
    if (this.gameState.sun) {
      const lx = this.spaceship.position.x - this.gameState.sun.position.x;
      const ly = this.spaceship.position.y - this.gameState.sun.position.y;
      const lz = this.spaceship.position.z - this.gameState.sun.position.z;
      const len = Math.hypot(lx, ly, lz) || 1;
      shipLightDir = new Float32Array([lx / len, ly / len, lz / len]);
      shipLightColor = new Float32Array([1.0, 0.95, 0.8]);
    }
    // Render de la nave (Vastago) delegado al servicio ShipRenderer - docs/ARQUITECTURA.md 10.c
    if (this.shipRenderer) {
      this.shipRenderer.render(this.spaceship, this.camera, shipLightDir, shipLightColor, this.ambientColor, this.ambientStrength, performance.now() / 1000);
    }
    // Restaurar programa lit y pintar la retícula de targeting (se pinta junto a la nave)
    this.shaderManager.useLitProgram();
    this.renderReticleSystem();
  }

  // Aísla el draw lit: apaga blending, desbindea texturas y reestablece programa/iluminación para la nave
  private resetGLForLitDraw(): void {
    if (!this.gl || !this.shaderManager) return;
    // Transparencias fuera para la nave
    this.gl.disable(this.gl.BLEND);
    // Deshabilitar todos los atributos de vértice y limpiar divisores de instancing
    const maxAttribs = this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS) as number;
    for (let i = 0; i < maxAttribs; i++) {
      const enabled = this.gl.getVertexAttrib(i, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean;
      if (enabled) this.gl.disableVertexAttribArray(i);
      // Asegurar divisor a 0 para evitar residuales de instancing
      this.gl.vertexAttribDivisor(i, 0);
    }
    // Desvincular ARRAY_BUFFER genérico para evitar punteros colgantes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    // Desbindeo de texturas por si un pase texturizado dejó algo activo
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE0);
    // Reforzar shader lit y su iluminación
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
  }

  /**
   * Renderiza un objeto individual
   */
  private renderObject(object: GameObject): void {
    if (!this.gl || !this.shaderManager) {
  this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'RenderObject skipped: gl or shaderManager not available');
      return;
    }
    
    // Verificar que el objeto tiene buffers inicializados
    if (!object.vertexBuffer) {
  this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'Object has no vertex buffer - skipping', { id: object.id });
      return;
    }

    // Calcular matriz normal (para iluminación)
    this.calculateNormalMatrix(object.modelMatrix);

    // Establecer matrices
    this.shaderManager.setLitMatrices(
      object.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Renderizar objeto
    object.render(this.gl, this.shaderManager.litProgram!, this.camera.viewMatrix, this.camera.projectionMatrix);
  }

  /**
   * Calcula la matriz normal para iluminación
   */
  private calculateNormalMatrix(modelMatrix: Float32Array): void {
    // La matriz normal es la inversa transpuesta de la parte superior izquierda 3x3
    // de la matriz modelo. Para transformaciones uniformes, podemos usar la matriz original.
    
    // Copiar la parte 3x3 superior izquierda
    this.normalMatrix[0] = modelMatrix[0];  this.normalMatrix[1] = modelMatrix[1];  this.normalMatrix[2] = modelMatrix[2];   this.normalMatrix[3] = 0;
    this.normalMatrix[4] = modelMatrix[4];  this.normalMatrix[5] = modelMatrix[5];  this.normalMatrix[6] = modelMatrix[6];   this.normalMatrix[7] = 0;
    this.normalMatrix[8] = modelMatrix[8];  this.normalMatrix[9] = modelMatrix[9];  this.normalMatrix[10] = modelMatrix[10]; this.normalMatrix[11] = 0;
    this.normalMatrix[12] = 0;              this.normalMatrix[13] = 0;              this.normalMatrix[14] = 0;               this.normalMatrix[15] = 1;
  }

  private setLandingDamageSuppressed(active: boolean, reason?: string): void {
    if (this.landingDamageSuppressed === active) {
      return;
    }
    this.landingDamageSuppressed = active;
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing damage suppression toggled', {
      active,
      reason
    });
  }

  // Público para SunProximitySystem (host). Ver docs/ARQUITECTURA.md Fase 5.
  public isLandingDamageSuppressed(): boolean {
    return this.landingDamageSuppressed;
  }

  /**
   * Maneja eventos de teclado
   */
  private areSpellGameplayInputsLocked(): boolean {
    try {
      const spellLocked = this.spellIOCoordinator?.areGameplayInputsLocked?.() ?? false;
      return spellLocked || this.animationManager.isBlockingInputs() || this.isAtmosphereExitTransitionBlocking();
    } catch {
      return this.animationManager.isBlockingInputs() || this.isAtmosphereExitTransitionBlocking();
    }
  }

  private arePanelsLockedBySpell(): boolean {
    try {
      const panelLocked = this.spellIOCoordinator?.arePanelsLocked?.() ?? false;
      return panelLocked || this.animationManager.isBlockingInputs() || this.isAtmosphereExitTransitionBlocking();
    } catch {
      return this.animationManager.isBlockingInputs() || this.isAtmosphereExitTransitionBlocking();
    }
  }

  private syncSpellIOStates(): void {
    const shouldMuteHover = this.spellIOCoordinator?.shouldMuteHoverAudio?.() ?? false;
    if (shouldMuteHover !== this.hoverAudioMuted) {
      this.hoverAudioMuted = shouldMuteHover;
      try { this.adaptiveTargeting?.setHoverAudioMuted?.(shouldMuteHover); } catch {}
    }

    const lockPanels = this.arePanelsLockedBySpell();
    if (lockPanels !== this.panelInputsLocked) {
      this.panelInputsLocked = lockPanels;
      try { this.panelEventCoordinator?.setInputsBlocked(lockPanels); } catch {}
    }
  }

  private getPrecastChantDurationMs(): number {
    if (this.precastChantDurationMs && this.precastChantDurationMs > 0) {
      return this.precastChantDurationMs;
    }
    const sec = this.audio?.getBufferDuration?.('sfx_precast_ritual');
    if (sec && isFinite(sec) && sec > 0) {
      this.precastChantDurationMs = Math.max(300, Math.round(sec * 1000));
      return this.precastChantDurationMs;
    }
    // Fallback to legacy 2s delay if duration unavailable (do not cache so we can retry once buffer loads)
    return 2000;
  }

  public handleKeyDown(key: string): void {
    const normalized = key.toLowerCase();
    // Block most inputs during animations/pre-cast delay; allow Escape/backspace while locked
    if (this.areSpellGameplayInputsLocked() && normalized !== 'escape' && normalized !== 'backspace') {
      return;
    }
    // Manejo de cambio de modos de cámara
    if (normalized === '0') {
      this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
      return;
    } else if (normalized === '7') {
      this.camera.setCameraMode(CameraMode.REAR_VIEW);
      return;
    } else if (normalized === '8') {
      this.camera.setCameraMode(CameraMode.COCKPIT);
      return;
    } else if (normalized === '9') {
      this.camera.setCameraMode(CameraMode.REAR_TRACKING);
      return;
    }

    if (normalized === 'enter') {
      if (this.tryTriggerAtmosphereAutoLandingFromInput()) {
        return;
      }
      if (this.tryStartLandingSequence()) {
        return;
      }
    }

    if (normalized === 'backspace') {
      this.hudManager?.replayLastMarqueeHistory?.();
      return;
    }

    if (this.tryActivateAuxiliaryAbilityForKey(key)) {
      return;
    }

    // Manejo de controles de nave
    if (this.spaceship && !this.areSpellGameplayInputsLocked()) {
      this.updateShipControls(key, true);
    }
    // Toggle panel de mapa del sistema con tecla 'M'
    if (normalized === 'm') {
      if (this.arePanelsLockedBySpell()) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Map toggle blocked by spell IO lock');
        return;
      }
      if (this.systemPanel) {
        const now = performance.now();
        const next = !this.systemPanel.isEnabled();
        if (next) {
          // Opening: respect reopen cooldown
          if (now < this.gameState.mapReopenAllowedAtMs) {
            this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Map reopen blocked by cooldown', { remainingMs: Math.round(this.gameState.mapReopenAllowedAtMs - now) });
            return;
          }
          this.systemPanel.setEnabled(true);
          // Play map open sound
          try {
            if (this.audio) {
              this.audio.play('ui_map_open', { bus: 'ui', volume: 0.6 });
            }
          } catch (e) {
            this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Map open sound failed', e);
          }
        } else {
          // Closing: arm cooldown
          this.systemPanel.setEnabled(false);
          // Play map close sound
          try {
            if (this.audio) {
              this.audio.play('ui_map_close', { bus: 'ui', volume: 0.6 });
            }
          } catch (e) {
            this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Map close sound failed', e);
          }
          this.gameState.mapReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
          this.clearPanelCursorOverlay();
        }
        // Ensure mutual exclusivity with Grimoire
        if (this.systemPanel.isEnabled() && this.grimoirePanel) {
          try { 
            this.grimoirePanel.setEnabled(false); 
            this.gameState.grimoireReopenAllowedAtMs = performance.now() + PANEL_REOPEN_COOLDOWN_MS;
          } catch {}
        }
        if (this.systemPanel.isEnabled() && this.inventoryPanel?.isEnabled()) {
          try {
            this.inventoryPanel.setEnabled(false);
            this.inventoryPanel.resetScroll();
            this.clearInventorySelection();
            this.gameState.inventoryReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
            this.updateInventoryPointerBinding();
            this.updateCanvasCursor();
          } catch {}
        }
        if (this.systemPanel.isEnabled()) {
          try { this.systemPanel.resetView(); } catch {}
          // Preselect current target in the map when opening (prefer adaptive selection)
          try {
            const current = this.adaptiveTargeting?.getCurrentTarget?.() || this.reticleManager?.getCurrentTarget?.();
            if (current) {
              const selId = this.resolveMapIdForTarget(current);
              try { this.systemPanel.setSelectedId(selId); } catch {}
            } else {
              try { this.systemPanel.setSelectedId(null); } catch {}
            }
          } catch {}
        }
      }
      try { this.updateMapClickBinding(); } catch {}
      try { this.updateGrimoirePointerBinding(); } catch {}
      try { this.updateCanvasCursor(); } catch {}
      this.syncPanelCursorOverlay();
      return;
    }
    // Toggle Grimoire (ancient book) with 'G'
    if (normalized === 'g') {
      if (this.arePanelsLockedBySpell()) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Grimoire toggle blocked by spell IO lock');
        return;
      }
      if (this.grimoirePanel) {
        const now = performance.now();
        // Considerar el estado interactivo (evita que "cerrando" cuente como abierto)
        const currentlyOpen = (this.grimoirePanel as any).isInteractive?.() ?? this.grimoirePanel.isEnabled();
        const next = !currentlyOpen;
        if (next) {
          if (now < this.gameState.grimoireReopenAllowedAtMs) {
            this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Grimoire reopen blocked by cooldown', { remainingMs: Math.round(this.gameState.grimoireReopenAllowedAtMs - now) });
            return;
          }
          this.grimoirePanel.setEnabled(true);
          // Play grimoire open sound
          try {
            if (this.audio) {
              this.audio.play('ui_grimoire_open', { bus: 'ui', volume: 0.6 });
            }
          } catch (e) {
            this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Grimoire open sound failed', e);
          }
        } else {
          this.grimoirePanel.setEnabled(false);
          this.gameState.grimoireReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
          // Play grimoire close sound
          try {
            if (this.audio) {
              this.audio.play('ui_grimoire_close', { bus: 'ui', volume: 0.6 });
            }
          } catch (e) {
            this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Grimoire close sound failed', e);
          }
          this.clearPanelCursorOverlay();
        }
        // Ensure map is closed when grimoire opens
        if (this.grimoirePanel.isEnabled() && this.systemPanel) {
          try { 
            this.systemPanel.setEnabled(false); 
            this.gameState.mapReopenAllowedAtMs = performance.now() + PANEL_REOPEN_COOLDOWN_MS;
          } catch {}
        }
        if (this.grimoirePanel.isEnabled() && this.inventoryPanel?.isEnabled()) {
          try {
            this.inventoryPanel.setEnabled(false);
            this.inventoryPanel.resetScroll();
            this.clearInventorySelection();
            this.gameState.inventoryReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
            this.updateInventoryPointerBinding();
            this.updateCanvasCursor();
          } catch {}
        }
        if (!this.grimoirePanel.isEnabled()) {
          // Closing grimoire: clear selection
          this.clearTargetSelection();
        }
      }
      try { this.updateMapClickBinding(); } catch {}
      try { this.updateGrimoirePointerBinding(); } catch {}
      try { this.updateCanvasCursor(); } catch {}
      this.syncPanelCursorOverlay();
      return;
    }
    // Toggle Inventory panel with 'I'
    if (normalized === 'i') {
      if (this.arePanelsLockedBySpell()) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Inventory toggle blocked by spell IO lock');
        return;
      }
      this.handleInventoryToggle();
      return;
    }
    // Escape: cerrar paneles (mapa, grimorio, inventario) o limpiar selección
    if (normalized === 'escape') {
      this.handleEscape();
      return;
    }
    // Fase 2: lanzar hechizo con 'h' (desde el grimorio o recordando el seleccionado)
    if (normalized === 'h') {
      if (this.grimoirePanel && this.grimoirePanel.isEnabled()) {
        const spell = (this.grimoirePanel as any).getSelectedSpellType?.() as SpellType | null;
        if (!spell) {
          return;
        }
        try { (this.grimoirePanel as any)?.clearSelection?.(); } catch {}
        const target = this.adaptiveTargeting?.getCurrentTarget?.() || this.adaptiveTargeting?.getHoveredTarget?.();
        try { this.grimoirePanel.setEnabled(false); } catch {}
        try {
          if (this.audio) {
            this.audio.play('ui_grimoire_close', { bus: 'ui', volume: 0.6 });
          }
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Grimoire close sound failed', e);
        }
        try { this.updateGrimoirePointerBinding(); } catch {}
        try { this.updateCanvasCursor(); } catch {}
        this.clearPanelCursorOverlay();
        this.syncPanelCursorOverlay();
        this.initiateSpellCast(spell, target);
        return;
      }
      if (this.grimoirePanel) {
        const spell = (this.grimoirePanel as any).getSelectedSpellType?.() as SpellType | null;
        if (!spell) return;
        try { (this.grimoirePanel as any)?.clearSelection?.(); } catch {}
        const target = this.adaptiveTargeting?.getCurrentTarget?.() || this.adaptiveTargeting?.getHoveredTarget?.();
        if (this.systemPanel && this.systemPanel.isEnabled()) {
          this.systemPanel.setEnabled(false);
          this.gameState.mapReopenAllowedAtMs = performance.now() + PANEL_REOPEN_COOLDOWN_MS;
          try { this.updateMapClickBinding(); } catch {}
          try { this.updateCanvasCursor(); } catch {}
          this.clearPanelCursorOverlay();
          this.syncPanelCursorOverlay();
        }
        this.initiateSpellCast(spell, target);
        return;
      }
      return;
    }
  }
  public handleKeyUp(key: string): void {
    if (this.spaceship && !this.areSpellGameplayInputsLocked()) {
      this.updateShipControls(key, false);
    }
  }

  private getTargetPosition(target: any): { x: number; y: number; z: number } | null {
    if (!target) return null;
    if (target.boundingSphere?.center) {
      return { ...target.boundingSphere.center };
    }
    if (target.position) {
      return { x: target.position.x, y: target.position.y, z: target.position.z };
    }
    return null;
  }

  private getDistanceFromShip(point: { x: number; y: number; z: number }): number {
    if (!this.spaceship) return Infinity;
    const dx = point.x - this.spaceship.position.x;
    const dy = point.y - this.spaceship.position.y;
    const dz = point.z - this.spaceship.position.z;
    return Math.hypot(dx, dy, dz);
  }

  private initiateSpellCast(spell: SpellType, target: ITargetable | null): void {
    const desiredCamera = spell === SpellType.SPEED ? CameraMode.COCKPIT : CameraMode.INMOVILE_EXTERNAL;
    if (this.camera && this.camera.getCurrentMode() !== desiredCamera) {
      try { this.camera.setCameraMode(desiredCamera); } catch {}
    }
    const precastDelayMs = this.getPrecastChantDurationMs();
    const requiresChant = spell !== SpellType.SPEED;
    if (requiresChant) {
      try {
        this.animationManager.startBlockingDelay(precastDelayMs, { spellType: spell });
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.ANIMATION, 'Blocking delay failed for spell', { spell, error: e });
      }
    }
    try {
      if (this.audio) {
        this.audio.play('sfx_precast_ritual', { bus: 'sfx', volume: 0.7 });
      }
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Pre-cast ritual sound failed', e);
    }
    if (!requiresChant) {
      this.triggerSpeedRiteInstantly();
      this.applySpellSanityCost(spell);
      return;
    }
    setTimeout(() => this.resolveSpellCast(spell, target), precastDelayMs);
  }

  private resolveSpellCast(spell: SpellType, target: ITargetable | null): void {
    const executed = this.performSpellEffect(spell, target);
    if (executed) {
      this.applySpellSanityCost(spell);
    }
  }

  private performSpellEffect(spell: SpellType, target: ITargetable | null): boolean {
    switch (spell) {
      case SpellType.LONGJUMP:
        return this.performLongJump(target);
      case SpellType.GATE_RITE:
        return this.performGateRite(target);
      case SpellType.ETERNAL_RITE:
        try {
          this.animationManager.startEternalRite(this);
          return true;
        } catch (e) {
          this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'Eternal Rite start error', e);
          return false;
        }
      case SpellType.ANCHORING_PULSE:
        return this.castAnchoringPulse(target ?? null);
      case SpellType.VOID_KINESIS:
        return this.castVoidKinesis(target ?? null);
      case SpellType.VOID_COCOON:
        return this.castVoidCocoon();
      case SpellType.DISRUPT:
        return this.performDisruptionRite(target);
      case SpellType.SPECIES_SCAN:
        return this.castSpeciesScanGlyph(target ?? null);
      case SpellType.CREATURE_SCAN:
        return this.castCreatureScanGlyph(target ?? null);
      case SpellType.PORTAL_CONCORD:
        return this.castPortalConcord(target ?? null);
      case SpellType.TEMPUS_SIGILLUM:
        return this.castTempusSigillum(target ?? null);
      case SpellType.QUIMIO_SIGILLUM:
        return this.castQuimioSigillum();
      case SpellType.RESPAWN_SIGILLUM:
        return this.castRespawnSigillum();
      case SpellType.SPEED:
        this.triggerSpeedRiteInstantly();
        return true;
      default:
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Unhandled spell cast', { spell });
        return false;
    }
  }

  private applySpellSanityCost(spell: SpellType): void {
    const cost = getSpellSanityCost(spell);
    const amount = Math.max(0, cost?.temp ?? 0);
    if (amount === 0) {
      return;
    }
    try {
      this.characterProfileService.adjustVitals({ sanity: -amount });
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Spell sanity cost applied', {
        spell,
        amount,
        sanityAfter: this.gameState.characterProfile.sanity,
      });
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to apply spell sanity cost', { spell, error });
    }
  }

  private isAsteroidTarget(target: any): target is Asteroid {
    if (!target) return false;
    if (typeof target.getTargetType === 'function') {
      try {
        const legacyType = target.getTargetType();
        if (legacyType !== undefined && legacyType !== null) {
          const resolved = targetTypeToGameObjectType(legacyType as TargetType);
          if (resolved === GameObjectType.ASTEROID || resolved === GameObjectType.SUPER_ASTEROID || resolved === GameObjectType.MEGA_ASTEROID) {
            return true;
          }
          if (typeof legacyType === 'string') {
            const lowered = legacyType.toLowerCase();
            if (lowered.includes('asteroid')) {
              return true;
            }
          }
        }
      } catch {}
    }
    const objectType = this.resolveObjectType(target);
    return objectType === GameObjectType.ASTEROID || objectType === GameObjectType.SUPER_ASTEROID || objectType === GameObjectType.MEGA_ASTEROID;
  }

  /**
   * Start the Material Disruption Rite beam animation
   */
  public startDisruptionBeam(targetPos: { x: number; y: number; z: number }, target: any): void {
    this.disruptionBeam.start(this.disruptionBeamHost, targetPos, target);
  }

  private updateDisruptionBeam(): void {
    this.disruptionBeam.update(this.disruptionBeamHost);
  }

  /**
   * Render disruption beam (purple line from ship to target)
   */
  private renderDisruptionBeam(): void {
    const beam = this.disruptionBeam.renderState;
    if (!beam) return;
    const elapsed = performance.now() - beam.startTime;
    const progress = Math.min(1, elapsed / beam.duration);
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 0.01);
    // Fundido de entrada y de salida en los extremos de la animacion.
    const fade = progress < 0.1 ? progress / 0.1 : (progress > 0.9 ? (1 - progress) / 0.1 : 1);
    this.drawBeamQuad(beam.startPos, beam.endPos, 0.3 * pulse, [0.8, 0.4, 1.0], fade * pulse, 0.3);
  }

  /** Launches the Anchoring Pulse tether beam */
  public startAnchoringPulseBeam(target: Asteroid): void {
    this.anchoringPulseBeam.start(this.anchoringPulseBeamHost, target);
  }

  private updateAnchoringPulseBeam(deltaTime: number): void {
    this.anchoringPulseBeam.update(this.anchoringPulseBeamHost, deltaTime);
  }

  private renderAnchoringPulseBeam(): void {
    const beam = this.anchoringPulseBeam.renderState;
    if (!beam) return;
    const pulse = 0.6 + 0.4 * Math.sin((performance.now() - beam.startTime) * 0.01);
    this.drawBeamQuad(beam.startPos, beam.endPos, 0.24, [0.35, 0.9, 1.0], pulse, 0.15);
  }

  private convertAsteroidToCargo(target: Asteroid): boolean {
    if (!this.spaceship || !target) {
      return false;
    }
    const yieldUnits = this.calculateCargoYieldFromAsteroid(target);
    if (this.spaceship.cargoCapacityRemaining < yieldUnits) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Cargo conversion aborted - insufficient capacity', {
        targetId: target.id,
        yieldUnits,
        remaining: this.spaceship.cargoCapacityRemaining,
      });
      this.showPlaceholderText('BODEGA SIN ESPACIO', 1800);
      return false;
    }
    const stored = this.spaceship.addCargo(yieldUnits);
    if (stored <= 0) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Cargo hold is full - cannot store asteroid', {
        targetId: target.id,
        yieldUnits,
      });
      return false;
    }
    try {
      this.cargoHoldService.registerAsteroidConversion(target, stored);
      if (this.inventoryPanel?.isEnabled()) {
        this.refreshInventoryPanelSnapshot();
      }
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Cargo manifest update failed', e);
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Asteroid converted to cargo', {
      targetId: target.id,
      storedUnits: stored,
      composition: (target as any).composition ?? 'unknown'
    });
    this.destroyObject(target);
    return true;
  }

  private calculateCargoYieldFromAsteroid(target: Asteroid): number {
    const rawMass = Number((target as any).massTons ?? NaN);
    const massTons = isFinite(rawMass) && rawMass > 0 ? rawMass : Math.max(10, (target.size ?? 1) * 60);
    const units = Math.floor(massTons * 0.02); // 2% of reported mass, truncated
    return Math.max(1, units);
  }

  /** Launches the Void Kinesis conduit beam */
  public startVoidKinesisBeam(targetPos: { x: number; y: number; z: number }, target: Asteroid): void {
    this.voidKinesisBeam.start(this.voidKinesisBeamHost, targetPos, target);
  }

  private updateVoidKinesisBeam(deltaTime: number): void {
    this.voidKinesisBeam.update(this.voidKinesisBeamHost, deltaTime);
  }

  private renderVoidKinesisBeam(): void {
    const beam = this.voidKinesisBeam.renderState;
    if (!beam) return;
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() - beam.startTime) * 0.02);
    this.drawBeamQuad(beam.startPos, beam.endPos, 0.36, [1.0, 0.2, 0.1], pulse, 0.3);
  }

  /** Escudo del Void Cocoon: parámetros del frame aquí, dibujo en VoidCocoonShieldRenderer. */
  private renderVoidCocoonShield(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship || !this.camera) return;
    if (!this.voidCocoonActiveUntilMs) return;
    const now = performance.now();
    if (now >= this.voidCocoonActiveUntilMs) return;
    const shieldRadius = Math.max(2.4, (this.spaceship.boundingSphere?.radius ?? 1.2) * 1.75);
    const modelMatrix = this.createThrusterMatrix(shieldRadius);
    if (!modelMatrix) return;
    this.voidCocoonShieldRenderer ??= new VoidCocoonShieldRenderer(this.gl, this.shaderManager);
    this.voidCocoonShieldRenderer.draw({
      modelMatrix,
      viewMatrix: this.camera.viewMatrix,
      projectionMatrix: this.camera.projectionMatrix,
      elapsedSec: (now - this.voidCocoonShieldStartMs) / 1000,
      remainingSec: (this.voidCocoonActiveUntilMs - now) / 1000,
      impactFlash: Math.min(1, Math.max(0, 1 - (now - this.voidCocoonLastImpactMs) / 350)),
    });
  }

  private resolveVoidKinesisConversion(target: Asteroid): void {
    if (!target || !this.isAsteroidTarget(target)) {
      return;
    }
    if (!this.spaceship) {
      return;
    }
    const gainInfo = this.calculateVoidEnergyGainFromAsteroid(target);
    const projected = this.spaceship.voidEnergyCurrent + gainInfo.gain;
    if (projected > this.spaceship.voidEnergyMax) {
      this.showPlaceholderText('RESERVA DEL VACÍO LLENA', 2000);
      return;
    }
    const gained = this.addVoidEnergyFromAsteroid(target, gainInfo);
    try {
      if (gained > 0) {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, `Energía del vacío +${gained}`);
      } else {
        this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, 'Energía del vacío al máximo');
      }
    } catch {}
  }

  private calculateVoidEnergyGainFromAsteroid(target: Asteroid): { gain: number; voidUnits: number } {
    const voidUnits = Math.max(1, Math.round((target as any).voidMassUnits ?? (target.size ?? 1) * 2));
    const gain = Math.max(8, Math.round(voidUnits * 7));
    return { gain, voidUnits };
  }

  private addVoidEnergyFromAsteroid(target: Asteroid, info?: { gain: number; voidUnits: number }): number {
    if (!this.spaceship) {
      return 0;
    }
    const { gain, voidUnits } = info ?? this.calculateVoidEnergyGainFromAsteroid(target);
    const before = this.spaceship.voidEnergyCurrent;
    this.spaceship.voidEnergyCurrent = Math.min(
      this.spaceship.voidEnergyMax,
      this.spaceship.voidEnergyCurrent + gain
    );
    const applied = this.spaceship.voidEnergyCurrent - before;
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Void Kinesis energy conversion', {
      targetId: target.id,
      requestedGain: gain,
      appliedGain: applied,
      voidUnits,
    });
    this.destroyObject(target);
    return applied;
  }

  private performLongJump(target: ITargetable | null): boolean {
    if (!this.spaceship) {
      try { this.showPlaceholderText('NO SPACESHIP.', 2000); } catch {}
      return false;
    }
    if (this.gameState.isAtmosphereLockActive()) {
      try { this.showPlaceholderText('VOID JUMP BLOQUEADO\nSal de la atmósfera primero', 2200); } catch {}
      return false;
    }
    if (!target) {
      try { this.showPlaceholderText('TARGET SELECTION REQUIRED.', 2000); } catch {}
      return false;
    }
    const targetPos = this.getTargetPosition(target);
    if (!targetPos) {
      try { this.showPlaceholderText('TARGET POSITION UNKNOWN.', 2000); } catch {}
      return false;
    }
    const dist = this.getDistanceFromShip(targetPos);
    if (dist <= 4000) {
      try { this.showPlaceholderText('TARGET TOO CLOSE (<4000u)', 2000); } catch {}
      return false;
    }
    if (this.lesserBeingSpawner?.prepareVoidJumpEncounter) {
      const plan = this.lesserBeingSpawner.prepareVoidJumpEncounter();
      this.setPendingVoidJumpEncounter(plan, true);
    } else {
      this.clearPendingVoidJumpEncounter();
    }
    try {
      const started = this.animationManager.startVoidJump(this, target);
      if (!started) {
        this.clearPendingVoidJumpEncounter();
      }
      return true;
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'Void Jump start error', e);
      return false;
    }
  }

  private performGateRite(target: ITargetable | null): boolean {
    if (!this.spaceship) {
      try { this.showPlaceholderText('GATE RITE REQUIERE PLANETA', 2000); } catch {}
      return false;
    }
    const asAny = target as any;
    const isPlanet = typeof asAny?.getTargetType === 'function' && String(asAny.getTargetType()) === 'planet';
    if (!isPlanet) {
      try { this.showPlaceholderText('GATE RITE REQUIERE PLANETA', 2000); } catch {}
      return false;
    }
    const center = asAny.position as { x: number; y: number; z: number };
    const radius = Math.max(1, (asAny.scale?.x ?? asAny.radius ?? 0));
    const dx = center.x - this.spaceship.position.x;
    const dy = center.y - this.spaceship.position.y;
    const dz = center.z - this.spaceship.position.z;
    const distToCenter = Math.hypot(dx, dy, dz);
    const surfaceOffset = distToCenter - radius;
    if (surfaceOffset > 50) {
      try { this.showPlaceholderText('DEMASIADO LEJOS DEL PLANETA (>50u)', 2000); } catch {}
      return false;
    }
    try { this.clearTargetSelection(); } catch {}
    try {
      this.animationManager.startGateRite(this, asAny);
      return true;
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'GateRite start error', e);
      return false;
    }
  }

  private performDisruptionRite(target: ITargetable | null): boolean {
    if (!target || !this.spaceship) {
      try { this.showPlaceholderText('NO VALID TARGET', 1500); } catch {}
      return false;
    }
    const targetPos = this.getTargetPosition(target);
    if (!targetPos) {
      try { this.showPlaceholderText('NO VALID TARGET', 1500); } catch {}
      return false;
    }
    const dist = this.getDistanceFromShip(targetPos);
    if (dist > 50) {
      try { this.showPlaceholderText('TARGET TOO FAR (>50u)', 1500); } catch {}
      return false;
    }
    try {
      this.animationManager.startDisruptionRite(this, target);
      return true;
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'DisruptionRite start error', e);
      return false;
    }
  }

  private castSpeciesScanGlyph(target: ITargetable | null): boolean {
    const validated = this.validateGlyphScanTarget(target);
    if (!validated) {
      return false;
    }
    const { planet, surfaceDistance } = validated;
    const previouslyLifeScanned = !!planet.lifeScanned;
    try { planet.markLifeScanned(); } catch { (planet as any).lifeScanned = true; }
    if (!previouslyLifeScanned && planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE) {
      try { this.characterProfileService.registerExperienceEvent(ExperienceEventType.NEW_SPECIES_DISCOVERED); } catch {}
    }
    const inhabitantLabel = planet.inhabitants && planet.inhabitants !== PlanetInhabitants.NONE
      ? (PLANET_INHABITANT_LABELS[planet.inhabitants] ?? 'Habitantes detectados')
      : PLANET_INHABITANT_LABELS[PlanetInhabitants.NONE];
    const planetName = typeof planet.getDisplayName === 'function'
      ? planet.getDisplayName()
      : (planet.customName ?? planet.id ?? 'Planeta');
    const sanityCost = getSpellSanityCost(SpellType.SPECIES_SCAN);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Glyph species scan executed', {
      planetId: planet.id,
      inhabitants: inhabitantLabel,
      surfaceDistance,
      sanityCost: sanityCost.temp,
    });
    try {
      this.showPlaceholderText(`AUGURIO:\n${planetName} · ${inhabitantLabel}`, 2600);
    } catch {}
    return true;
  }

  private castCreatureScanGlyph(target: ITargetable | null): boolean {
    const validated = this.validateGlyphScanTarget(target);
    if (!validated) {
      return false;
    }
    const { planet, surfaceDistance } = validated;
    const previouslyCreatureScanned = !!planet.creatureScanned;
    try { planet.markCreatureScanned(); } catch { (planet as any).creatureScanned = true; }
    const hasLesserBeing = planet.lesserBeing && planet.lesserBeing !== LesserBeing.NONE;
    const creatureLabel = hasLesserBeing
      ? (LESSER_BEING_LABELS[planet.lesserBeing as LesserBeing] ?? 'Presencia anómala detectada')
      : LESSER_BEING_LABELS[LesserBeing.NONE];
    const planetName = typeof planet.getDisplayName === 'function'
      ? planet.getDisplayName()
      : (planet.customName ?? planet.id ?? 'Planeta');
    const sanityCost = getSpellSanityCost(SpellType.CREATURE_SCAN);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Glyph creature scan executed', {
      planetId: planet.id,
      lesserBeing: creatureLabel,
      surfaceDistance,
      sanityCost: sanityCost.temp,
      newlyScanned: !previouslyCreatureScanned,
    });
    const headline = hasLesserBeing ? 'REVELACIÓN' : 'REVELACIÓN INCONCLUSA';
    try {
      this.showPlaceholderText(`${headline}:\n${planetName} · ${creatureLabel}`, 2600);
    } catch {}
    return true;
  }

  private validateGlyphScanTarget(target: ITargetable | null): { planet: Planet; surfaceDistance: number } | null {
    if (!this.spaceship) {
      try { this.showPlaceholderText('Escáner ritual inactivo (sin nave)', 1600); } catch {}
      return null;
    }
    if (!target) {
      try { this.showPlaceholderText('Selecciona un planeta para escanear', 1600); } catch {}
      return null;
    }
    const asAny = target as any;
    const targetType = typeof asAny?.getTargetType === 'function' ? asAny.getTargetType() : null;
    const isPlanet = targetType === TargetType.PLANET || asAny?.getType?.() === GameObjectType.PLANET;
    if (!isPlanet) {
      try { this.showPlaceholderText('El objetivo actual no es un planeta escaneable', 1700); } catch {}
      return null;
    }
    const planet = asAny as Planet;
    const surfaceDistance = this.getSurfaceDistanceToPlanet(planet);
    if (surfaceDistance == null || surfaceDistance > this.GLYPH_SCAN_RANGE) {
      const readable = surfaceDistance != null ? Math.round(surfaceDistance) : '∞';
      try { this.showPlaceholderText(`Planeta fuera de alcance (${readable}u)`, 1700); } catch {}
      return null;
    }
    return { planet, surfaceDistance };
  }

  private castAnchoringPulse(target: ITargetable | null): boolean {
    if (!this.spaceship) {
      return false;
    }
    if (!target || !this.isAsteroidTarget(target)) {
      this.showPlaceholderText('ANCHORING PULSE REQUIERE ASTEROIDE', 1500);
      return false;
    }
    const pos = this.getTargetPosition(target);
    if (!pos) {
      this.showPlaceholderText('SIN POSICIÓN VÁLIDA', 1500);
      return false;
    }
    if (this.getDistanceFromShip(pos) > 50) {
      this.showPlaceholderText('TARGET TOO FAR (>50u)', 1500);
      return false;
    }
    const requiredCargo = this.calculateCargoYieldFromAsteroid(target);
    if (this.spaceship.cargoCapacityRemaining < requiredCargo) {
      this.showPlaceholderText(`BODEGA SIN ESPACIO (${requiredCargo}u)`, 2000);
      return false;
    }
    try {
      this.animationManager.startAnchoringPulse(this, target);
      return true;
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'Anchoring Pulse animation failed', e);
      return false;
    }
  }

  private castPortalConcord(target: ITargetable | null): boolean {
    if (!this.spaceship) {
      return false;
    }
    const portal = this.resolvePortalConcordTarget(target);
    if (!portal) {
      try { this.showPlaceholderText('CONCORDIA GATE\nPortal hostil fuera de alcance (<500u)', 2200); } catch {}
      return false;
    }
    const distance = this.getDistanceFromShip(portal.position);
    if (!Number.isFinite(distance) || distance > this.PORTAL_CONCORD_RANGE) {
      const label = distance === Infinity ? '∞' : `${Math.round(distance)}u`;
      try { this.showPlaceholderText(`CONCORDIA GATE\nPortal a ${label}`, 2200); } catch {}
      return false;
    }
    if (portal.isConcordSealed && portal.isConcordSealed()) {
      try { this.showPlaceholderText('CONCORDIA GATE\nPortal ya sellado', 2000); } catch {}
      return false;
    }
    if (portal.animosity !== GameObjectAnimosity.ENEMY) {
      try { this.showPlaceholderText('CONCORDIA GATE\nSolo portales hostiles', 2000); } catch {}
      return false;
    }
    portal.setAnimosity(GameObjectAnimosity.FRIENDLY);
    portal.setConcordSealState(true, true);
    portal.preventsLesserIncursions = true;
    this.persistPortalSnapshotState(portal);
    const label = typeof portal.getDisplayName === 'function' ? portal.getDisplayName() : portal.id;
    try {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.PORTAL, `Concordia Gate · ${label}`);
    } catch {}
    try { this.showPlaceholderText(`CONCORDIA GATE\n${label} pacificado`, 2400); } catch {}    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Concordia Gate seal applied', {
      portalId: portal.id,
      distance,
      preventsLesserIncursions: portal.preventsLesserIncursions,
    });
    return true;
  }

  private resolvePortalConcordTarget(target: ITargetable | null): Portal | null {
    const direct = this.asPortal(target);
    if (direct) {
      return direct;
    }
    if (!this.spaceship) {
      return null;
    }
    let closest: { portal: Portal; distance: number } | null = null;
    for (const portal of this.gameState.portals) {
      if (!portal || portal.animosity !== GameObjectAnimosity.ENEMY) continue;
      const distance = this.getDistanceFromShip(portal.position);
      if (!Number.isFinite(distance) || distance > this.PORTAL_CONCORD_RANGE) continue;
      if (!closest || distance < closest.distance) {
        closest = { portal, distance };
      }
    }
    return closest?.portal ?? null;
  }

  private asPortal(target: ITargetable | null): Portal | null {
    if (!target) {
      return null;
    }
    if (target instanceof Portal) {
      return target;
    }
    const anyTarget = target as any;
    try {
      const type = typeof anyTarget?.getTargetType === 'function' ? anyTarget.getTargetType() : null;
      if (type === TargetType.PORTAL) {
        return anyTarget as Portal;
      }
      const goType = typeof anyTarget?.getType === 'function' ? anyTarget.getType() : null;
      if (goType === GameObjectType.PORTAL) {
        return anyTarget as Portal;
      }
    } catch {}
    return null;
  }

  private shouldUseCenterDistance(target: ITargetable | null): boolean {
    if (!target) {
      return false;
    }
    if (target instanceof Portal) {
      return true;
    }
    try {
      const tType = (target as any).getTargetType?.();
      if (tType === TargetType.PORTAL) {
        return true;
      }
    } catch {}
    try {
      const goType = (target as any).getType?.();
      if (goType === GameObjectType.PORTAL) {
        return true;
      }
    } catch {}
    return false;
  }

  private getDisplayDistanceToTarget(target: ITargetable): number {
    if (!target || !target.position) {
      return Infinity;
    }
    const origin = this.spaceship?.position ?? this.camera?.position ?? null;
    if (!origin) {
      return Infinity;
    }
    const dx = target.position.x - origin.x;
    const dy = target.position.y - origin.y;
    const dz = target.position.z - origin.z;
    const distanceToCenter = Math.hypot(dx, dy, dz);
    if (!isFinite(distanceToCenter)) {
      return Infinity;
    }
    if (this.shouldUseCenterDistance(target)) {
      return distanceToCenter;
    }
    const radius = this.getApproximateTargetRadius(target);
    return Math.max(0, distanceToCenter - radius);
  }

  private getApproximateTargetRadius(target: ITargetable): number {
    const anyTarget = target as any;
    if (anyTarget?.boundingSphere && typeof anyTarget.boundingSphere.radius === 'number') {
      return Math.max(0, Number(anyTarget.boundingSphere.radius));
    }
    if (typeof anyTarget?.radius === 'number' && isFinite(anyTarget.radius)) {
      return Math.max(0, Number(anyTarget.radius));
    }
    if (typeof anyTarget?.scale?.x === 'number' && isFinite(anyTarget.scale.x)) {
      return Math.max(0, Number(anyTarget.scale.x));
    }
    return 0;
  }

  private castVoidKinesis(target: ITargetable | null): boolean {
    if (!this.spaceship) {
      return false;
    }
    // Fase 15 (la "cirugía" de los Mi-Go): sobre un PLANETA, el rito drena su void mass hasta
    // hacerlo desaparecer. Sobre un asteroide sigue el camino clásico de condensación.
    if (target instanceof Planet) {
      return this.castVoidKinesisOnPlanet(target);
    }
    if (!target || !this.isAsteroidTarget(target)) {
      this.showPlaceholderText('VOID KINESIS REQUIERE ASTEROIDE O PLANETA', 1500);
      return false;
    }
    const pos = this.getTargetPosition(target);
    if (!pos) {
      this.showPlaceholderText('SIN POSICIÓN VÁLIDA', 1500);
      return false;
    }
    if (this.getDistanceFromShip(pos) > 50) {
      this.showPlaceholderText('TARGET TOO FAR (>50u)', 1500);
      return false;
    }
    const voidGainInfo = this.calculateVoidEnergyGainFromAsteroid(target);
    const projectedVoid = this.spaceship.voidEnergyCurrent + voidGainInfo.gain;
    if (projectedVoid > this.spaceship.voidEnergyMax) {
      this.showPlaceholderText('RESERVA DEL VACÍO LLENA', 2000);
      return false;
    }
    try {
      this.animationManager.startVoidKinesis(this, target);
      return true;
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'Void Kinesis animation failed', e);
      return false;
    }
  }

  /** Drenaje de un planeta (Fase 15): canal largo que se bebe su void mass hasta hacerlo desaparecer. */
  private castVoidKinesisOnPlanet(planet: Planet): boolean {
    if (this.planetDrainBeam.isActive) {
      this.showPlaceholderText('YA HAY UN DRENAJE EN CURSO', 1500);
      return false;
    }
    if (this.resolveSystemId() === 'human-system') {
      // El hogar no se bebe: la Tierra partida y sus vecinos son historia, no combustible.
      this.showPlaceholderText('EL SISTEMA NATAL SE RESISTE AL DRENAJE', 2000);
      return false;
    }
    if (this.gameState.getActiveLandingPlanet()?.id === planet.id) {
      this.showPlaceholderText('NO PUEDES DRENAR EL SUELO QUE PISAS', 2000);
      return false;
    }
    if (this.getDistanceFromShip(planet.position) > 2500) {
      this.showPlaceholderText('DEMASIADO LEJOS PARA EL DRENAJE (>2500u)', 1500);
      return false;
    }
    const started = this.planetDrainBeam.start(this.planetDrainHost, planet);
    if (started) {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, `DRENANDO ${this.describePlanetName(planet).toUpperCase()}`);
    }
    return started;
  }

  private describePlanetName(planet: Planet): string {
    try {
      if (typeof planet.getDisplayName === 'function') {
        return planet.getDisplayName();
      }
    } catch {}
    return planet.customName ?? planet.id;
  }

  private renderPlanetDrainBeam(): void {
    const beam = this.planetDrainBeam.renderState;
    if (!beam || !this.spaceship) return;
    const pulse = 0.45 + 0.4 * Math.sin((performance.now() - beam.startedAtMs) * 0.012);
    // Violeta y más grueso que el de asteroides: se está bebiendo un MUNDO.
    this.drawBeamQuad(this.spaceship.position, beam.endPos, 0.9 + beam.progress * 1.4, [0.62, 0.3, 0.95], pulse, 0.25);
  }

  /** Consuma el drenaje: retira el planeta (sin portal), persiste y dispara las consecuencias. */
  private consumePlanetByDrain(planet: Planet): void {
    try {
      const planets = this.gameState.planets;
      const idx = planets.findIndex(p => p.id === planet.id);
      if (idx >= 0) planets.splice(idx, 1);
      this.targetCatalog.register(TargetType.PLANET, planets as unknown as ITargetable[]);
    } catch {}
    try {
      if (this.particleEffects) {
        this.particleEffects.createDestructionDebris(planet.position, Math.max(4, planet.scale.x * 0.15), { r: 0.62, g: 0.3, b: 0.95 });
      }
    } catch {}
    planet.active = false;
    planet.visible = false;
    this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.SYSTEM, `${this.describePlanetName(planet).toUpperCase()} CONSUMIDO POR EL VACÍO`);
    this.notifyPlanetRemoved(planet, 'void-drain');
    try {
      this.persistActiveSystemState({ reason: 'planet-drained' });
    } catch {}
  }

  /**
   * Consecuencias de destruir un planeta, sea por Gate Rite o por drenaje (Fase 15): si estaba
   * habitado, su raza te declara hostil y las misiones de exterminio que la señalan avanzan.
   */
  public notifyPlanetRemoved(planet: { id: string; inhabitants?: PlanetInhabitants | null }, cause: 'gate-rite' | 'void-drain'): void {
    const race = planet.inhabitants;
    if (!race || race === PlanetInhabitants.NONE) {
      return;
    }
    const raceLabel = PLANET_INHABITANT_LABELS[race] ?? String(race);
    const mission = this.missionService?.registerExterminationEvent(String(race), 'planet');
    if (mission?.status === 'ready-to-turn-in') {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.MISSION, this.exterminationReadyNotice(mission));
    } else if (mission?.exterminationTarget) {
      const t = mission.exterminationTarget;
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.MISSION,
        `EXTERMINIO: ${t.planetsDestroyed}/${t.planetsRequired} MUNDOS · ${t.stationsDestroyed}/${t.stationsRequired} TELARES`
      );
    }
    this.declareRaceHostility(race, `${raceLabel.toUpperCase()}: NO OLVIDARÁN ESTE MUNDO`);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Inhabited planet removed', { planetId: planet.id, race, cause });
  }

  /** "Entrega con quien te lo encargó": el exterminio cumplido nombra a su patrocinador. */
  private exterminationReadyNotice(mission: PlanetMissionState): string {
    const sponsor = mission.requestedBy ?? mission.race;
    const label = sponsor ? PLANET_INHABITANT_LABELS[sponsor] ?? String(sponsor) : 'tu patrocinador';
    return `EXTERMINIO CUMPLIDO: ENTREGA CON ${label.toUpperCase()}`;
  }

  private isVoidCocoonActive(referenceTime?: number): boolean {
    if (!this.voidCocoonActiveUntilMs) {
      return false;
    }
    const now = referenceTime ?? performance.now();
    return now < this.voidCocoonActiveUntilMs;
  }

  private castVoidCocoon(): boolean {
    if (!this.spaceship) {
      return false;
    }
    const durationMs = 30000;
    const now = performance.now();
    this.voidCocoonActiveUntilMs = now + durationMs;
    this.voidCocoonLastImpactMs = now;
    this.voidCocoonShieldStartMs = now;
    try {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, 'Void Cocoon: capullo protector desplegado');
    } catch {}
    try {
      if (this.audio && this.audio.has('sfx_precast_ritual')) {
       // this.audio.play('sfx_precast_ritual', { bus: 'sfx', volume: 0.7 });
      }
    } catch {}
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Void Cocoon activated', {
      durationMs
    });
    return true;
  }

  private persistPortalSnapshotState(portal: Portal): void {
    const patch = {
      animosity: portal.animosity,
      concordSealActive: portal.concordSealActive,
      concordSealActivatedAt: portal.concordSealActivatedAt,
      preventsLesserIncursions: portal.preventsLesserIncursions,
    } as const;
    try {
      const portals = this.currentSnapshot?.portals;
      if (portals && portals.length) {
        const snapPortal = portals.find(p => p.id === portal.id);
        if (snapPortal) {
          Object.assign(snapPortal, patch);
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Failed to sync portal snapshot state', { portalId: portal.id, error });
    }
    try {
      this.portalPersistenceService?.updatePortalSnapshot?.(portal.id, patch);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Portal persistence update failed', { portalId: portal.id, error });
    }
  }

  private castTempusSigillum(target: ITargetable | null): boolean {
    const validated = this.validateGlyphScanTarget(target);
    if (!validated) {
      return false;
    }
    const { planet } = validated;
    const planetName = typeof planet.getDisplayName === 'function'
      ? planet.getDisplayName()
      : (planet.customName ?? planet.id ?? 'Planeta');

    const previousInhabitants = planet.inhabitants;
    planet.lifeScanned = false;
    planet.visited = false;
    planet.inhabitants = PlanetInhabitants.NONE;
    const rerolledInhabitants = planet.assignInhabitantsFromProbability(() => Math.random());

    try {
      planet.setLesserBeing(null);
    } catch {
      (planet as any).lesserBeing = null;
    }
    planet.creatureScanned = true; // Mostrar inmediatamente que no hay ser menor tras el sellado
    if (typeof (planet as any).setAnimosity === 'function') {
      try { (planet as any).setAnimosity(GameObjectAnimosity.NEUTRAL); } catch {}
    }

    try {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.VOID_RITUAL,
        `Tempus Sigillum · ${planetName} rejuvenecido`
      );
    } catch {}
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Tempus Sigillum seal applied', {
      planetId: planet.id,
      probability: planet.probabilityOfLifePct,
      previousInhabitants,
      rerolledInhabitants,
    });
    return true;
  }

  private castQuimioSigillum(): boolean {
    const before = this.gameState.characterProfile.survivability ?? 0;
    if (before >= 100) {
      try {
        this.showPlaceholderText('QUIMIO SIGILLUM\nSupervivencia al máximo', 2200);
      } catch {}
      return false;
    }

    const after = this.characterProfileService.adjustSurvivability(5);
    const applied = Math.max(0, after - before);
    if (applied <= 0) {
      try {
        this.showPlaceholderText('QUIMIO SIGILLUM\nSin efecto', 2000);
      } catch {}
      return false;
    }

    const deltaLabel = `+${applied.toFixed(0)}%`;
    try {
      this.showPlaceholderText(`QUIMIO SIGILLUM\n${deltaLabel} supervivencia`, 2400);
    } catch {}
    try {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.VOID_RITUAL,
        `Quimio Sigillum restauró ${deltaLabel}`
      );
    } catch {}
    try {
      this.animationManager?.startQuimioSigillum(this);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.ANIMATION, 'Failed to start Quimio Sigillum animation', error);
    }
    try {
      if (this.audio) {
        const clip = this.audio.has('sfx_precast_ritual')
          ? 'sfx_precast_ritual'
          : (this.audio.has('sfx_heal') ? 'sfx_heal' : null);
        if (clip) {
          this.audio.play(clip, { bus: 'sfx', volume: 0.65 });
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Quimio Sigillum audio failed', error);
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Quimio Sigillum applied', {
      beforeSurvivability: before,
      afterSurvivability: after,
      appliedDelta: applied,
    });
    return true;
  }

  private castRespawnSigillum(): boolean {
    if (!this.spaceship) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Respawn Sigillum blocked: ship unavailable');
      return false;
    }
    if (this.gameState.isAtmosphereLockActive()) {
      try { this.showPlaceholderText('RESPAWN SIGILLUM BLOQUEADO\nSolo disponible en sistema solar', 2400); } catch {}
      return false;
    }
    const context = this.landingTouchdownContext ?? null;
    const anchor = this.buildRespawnAnchorMetadata(context);
    if (!anchor) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn Sigillum failed: anchor build returned null');
      try { this.showPlaceholderText('RESPAWN SIGILLUM\nError al grabar', 2200); } catch {}
      return false;
    }
    this.gameState.setRespawnAnchor(anchor);
    const displayName = anchor.label || anchor.planetName || 'Ancla en deriva';
    try {
      this.hudManager?.emitMarqueeEvent?.(
        HudMarqueeEventType.VOID_RITUAL,
        `Respawn Sigillum · ${displayName}`
      );
    } catch {}
    try { this.showPlaceholderText(`RESPAWN SIGILLUM\n${displayName}`, 2400); } catch {}
    try {
      const started = this.animationManager.startRespawnSigillum(this);
      if (!started) {
        this.logger.log(LogLevel.WARN, LogCategory.ANIMATION, 'Respawn Sigillum animation skipped (busy)');
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.ANIMATION, 'Respawn Sigillum animation error', error);
    }
    try {
      if (this.audio) {
        const clip = this.audio.has('sfx_precast_ritual') ? 'sfx_precast_ritual' : (this.audio.has('sfx_heal') ? 'sfx_heal' : null);
        if (clip) {
          this.audio.play(clip, { bus: 'sfx', volume: 0.55 });
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Respawn Sigillum audio failed', error);
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn Sigillum anchor engraved', {
      anchorId: anchor.anchorId,
      systemId: anchor.systemId,
      planetId: anchor.planetId,
      planetName: anchor.planetName ?? null,
    });
    return true;
  }

  private buildRespawnAnchorMetadata(
    context: LandingApproachContext | null,
    options?: { snapshotLabel?: string; reuseExistingSnapshot?: boolean }
  ): RespawnAnchorMetadata | null {
    if (!this.spaceship) {
      return null;
    }
    const systemId = this.resolveSystemId() ?? 'system-unknown';
    const shipPosition: Vector3 = {
      x: this.spaceship.position.x,
      y: this.spaceship.position.y,
      z: this.spaceship.position.z,
    };
    const planetId = context?.planetId ?? null;
    const planet = planetId ? this.gameState.planets.find(p => p.id === planetId) as Planet | undefined : undefined;
    let planetName = context?.planetName ?? undefined;
    if (!planetName && planet) {
      try {
        planetName = typeof planet.getDisplayName === 'function'
          ? planet.getDisplayName()
          : (planet.customName ?? planet.id ?? undefined);
      } catch {}
      if (!planetName && planet.id) {
        planetName = planet.id;
      }
    }
    const landingSite = context?.surfacePoint && context?.surfaceNormal
      ? {
          surfacePoint: { ...context.surfacePoint },
          surfaceNormal: vec3Normalize(context.surfaceNormal),
          radius: context.radius ?? (planet ? this.estimatePlanetRadius(planet) : 0),
        }
      : undefined;
    const timestamp = Date.now();
    const anchorId = `respawn-${timestamp.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const notes: string[] = [];
    if (context?.planetType) {
      notes.push(`Tipo ${context.planetType}`);
    }
    if (typeof context?.probabilityOfLifePct === 'number') {
      notes.push(`Vida ${context.probabilityOfLifePct}%`);
    }
    if (!context) {
      notes.push('Ancla grabada en deriva espacial');
    }
    const fallbackSector = `Sector ${Math.round(shipPosition.x)}:${Math.round(shipPosition.y)}:${Math.round(shipPosition.z)}`;
    const label = planetName ?? fallbackSector;
    const snapshotMeta = options?.reuseExistingSnapshot
      ? this.resolveSnapshotMetaFromLabel(systemId, options?.snapshotLabel)
      : this.persistRespawnSnapshot(systemId, options?.snapshotLabel);
    const metadata: RespawnAnchorMetadata = {
      anchorId,
      systemId,
      snapshotId: snapshotMeta.snapshotId,
      snapshotLabel: snapshotMeta.snapshotLabel,
      planetId,
      planetName: planetName ?? null,
      createdAt: timestamp,
      label,
      shipPosition,
      shipForward: this.getShipForwardVector(),
      landingSite,
      notes: notes.length ? notes.join(' · ') : undefined,
    };
    return metadata;
  }

  private bootstrapDefaultRespawnAnchor(): void {
    try {
      const existingDefault = this.gameState.getDefaultRespawnAnchor();
      if (existingDefault) {
        if (!this.gameState.getRespawnAnchor()) {
          this.gameState.setRespawnAnchor(existingDefault);
        }
        return;
      }
      const ensuredLabel = this.persistActiveSystemSnapshot(
        { reason: 'bootstrap-default-respawn-anchor' },
        PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT
      ) ?? PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT;
      const anchor = this.buildRespawnAnchorMetadata(null, {
        snapshotLabel: ensuredLabel,
        reuseExistingSnapshot: true
      });
      if (!anchor) {
        this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Bootstrap respawn anchor skipped: metadata unavailable');
        return;
      }
      anchor.label = anchor.label ?? 'Trail Entry';
      anchor.notes = anchor.notes
        ? `${anchor.notes} · Ancla inicial del trail humano`
        : 'Ancla inicial del trail humano';
      this.gameState.setDefaultRespawnAnchor(anchor, { activateWhenMissing: true });
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Default respawn anchor seeded', {
        anchorId: anchor.anchorId,
        systemId: anchor.systemId
      });
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to seed default respawn anchor', { error });
    }
  }

  private resolveSnapshotMetaFromLabel(
    systemId: string,
    label: string | null | undefined
  ): { snapshotId: string | null; snapshotLabel: string | null } {
    if (!label) {
      return { snapshotId: null, snapshotLabel: null };
    }
    if (!this.portalPersistenceService) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot meta resolution skipped: PortalPersistenceService unavailable', {
        label,
        systemId
      });
      return { snapshotId: null, snapshotLabel: null };
    }
    const snapshot = this.portalPersistenceService.get(label);
    if (!snapshot) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot meta resolution failed: label missing', {
        label,
        systemId
      });
      return this.persistRespawnSnapshot(systemId, label);
    }
    const snapshotId = resolveSnapshotId(snapshot) ?? systemId;
    return { snapshotId, snapshotLabel: label };
  }

  private persistRespawnSnapshot(
    systemId: string,
    labelOverride?: string
  ): { snapshotId: string | null; snapshotLabel: string | null } {
    const normalizedOverride = labelOverride?.trim() || null;
    const adoptOverrideLabel = normalizedOverride === PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT;
    let label = normalizedOverride || PORTAL_SNAPSHOT_LABELS.RESPAWN_ANCHOR_LATEST;
    const liveSnapshot = this.currentSnapshot;
    const fallbackId = resolveSnapshotId(liveSnapshot) ?? systemId;

    if (!normalizedOverride) {
      try { this.ensureCurrentSnapshotLabel(); } catch {}
    }

    if (label && adoptOverrideLabel) {
      try { this.setCurrentSnapshotLabel(label); } catch {}
    }

    if (!label) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Respawn snapshot skipped: missing label reference', {
        systemId,
        labelOverride
      });
      return { snapshotId: fallbackId, snapshotLabel: null };
    }

    if (!this.portalPersistenceService) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Respawn snapshot skipped: PortalPersistenceService unavailable');
      return { snapshotId: fallbackId, snapshotLabel: null };
    }

    const serializer = this.runtimeSerializer;
    if (serializer) {
      const snapshot = serializer.saveWithLabel(label, this);
      if (snapshot) {
        const snapshotId = resolveSnapshotId(snapshot) ?? systemId;
        return { snapshotId, snapshotLabel: label };
      }
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime snapshot serializer returned null during respawn persistence', { label, systemId });
    }

    const existingSnapshot = this.portalPersistenceService.get(label);
    if (existingSnapshot) {
      const snapshotId = resolveSnapshotId(existingSnapshot) ?? systemId;
      return { snapshotId, snapshotLabel: label };
    }

    if (!liveSnapshot) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Respawn snapshot skipped: no current snapshot available');
      return { snapshotId: fallbackId, snapshotLabel: null };
    }

    try {
      const clone = this.cloneSolarSystemSnapshot(liveSnapshot);
      clone.meta = { ...(clone.meta || {}), snapshotLabel: label };
      clone.meta['proceduralSystemId'] = clone.meta['proceduralSystemId'] ?? systemId;
      const snapshotId = resolveSnapshotId(clone) ?? systemId;
      this.portalPersistenceService.save(label, clone);
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Respawn anchor snapshot persisted (fallback mode)', {
        label,
        snapshotId,
        systemId
      });
      return { snapshotId, snapshotLabel: label };
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Respawn snapshot persistence failed', { error });
      return { snapshotId: fallbackId, snapshotLabel: null };
    }
  }

  private cloneSolarSystemSnapshot(snapshot: SolarSystemSnapshot): SolarSystemSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
  }

  private handleVoidCocoonImpact(source: any, attemptedDamage: number, context?: { reason?: string }): void {
    if (!this.voidCocoonActiveUntilMs) {
      return;
    }
    const now = performance.now();
    this.voidCocoonLastImpactMs = now;
    try {
      const label = source?.id ?? context?.reason ?? 'impact';
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Void Cocoon absorbed damage', {
        source: label,
        attemptedDamage,
      });
    } catch {}
    try {
      this.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.VOID_RITUAL, 'Void Cocoon absorbió un impacto');
    } catch {}
    try {
      if (this.audio) {
        const clip = this.audio.has('sfx_collision_light') ? 'sfx_collision_light' : 'sfx_whoosh';
        const vol = Math.min(1, 0.55 * this.getWeatherImpactVolumeScale());
        this.audio.play(clip, { bus: 'sfx', volume: vol });
      }
    } catch {}
  }

  private isSpeedRiteActive(now: number = performance.now()): boolean {
    return this.speedRiteSystem.isActive(now);
  }

  /** Velocidad máxima BASE (pre-rito): audio de thrusters, HUD extendido 0..200 % y persistencia. */
  public getShipBaseMaxSpeed(): number {
    return this.speedRiteSystem.getBaseMaxSpeed(this.spaceship?.maxSpeed ?? 0);
  }

  private refreshShipDynamicsBaseline(force: boolean = false): void {
    this.speedRiteSystem.refreshBaseline(this.speedRiteHost, force);
  }

  /** Apply the Double Phased Time Rite: doubles maxSpeed for a duration (default 2 minutes) */
  public applySpeedRite(durationMs: number = SPEED_RITE_DEFAULT_DURATION_MS): void {
    this.speedRiteSystem.apply(this.speedRiteHost, durationMs);
  }

  /** Activate Speed Rite immediately without triggering blocking animations */
  private triggerSpeedRiteInstantly(): void {
    this.applySpeedRite(SPEED_RITE_DEFAULT_DURATION_MS);
    try {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Speed Rite activated instantly');
    } catch {}
  }

  /** Minimal full-screen text overlay helper for placeholder animations */
  public showPlaceholderText(msg: string, durationMs: number = 2000): void {
    if (!this.gl || !this.overlayRenderer) return;
    const gl = this.gl;
    const screen = gl.canvas as HTMLCanvasElement;
    const W = Math.max(1, screen.width || 1024);
    const H = Math.max(1, screen.height || 768);
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // Centered banner
    const padX = Math.round(W * 0.12);
    const bannerW = W - padX * 2;
    const bannerH = Math.round(Math.min(200, H * 0.18));
    const bannerX = (W - bannerW) / 2;
    const bannerY = (H - bannerH) / 2;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    ctx.restore();
    // Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(Math.min(bannerH * 0.42, 64))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(msg, W / 2, H / 2);
    // Upload to a GL texture
    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Flip canvas Y for WebGL texture space
    let prevFlip = 0;
    try { prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as number; } catch {}
    try { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); } catch {}
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
    // Restore previous flip state
    try { gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0); } catch {}
    gl.bindTexture(gl.TEXTURE_2D, null);
    // Replace any existing overlay
    if (this._placeholderOverlay) {
      try { this.gl.deleteTexture(this._placeholderOverlay.tex); } catch {}
    }
    this._placeholderOverlay = { tex, w: W, h: H, until: performance.now() + Math.max(0, durationMs) };
  }

  /** STEP 4: Cycle selection with Tab / Shift+Tab (reverse) */
  public cycleSelection(reverse: boolean = false): void {
    try {
      const dir = reverse ? -1 : 1;
      (this.adaptiveTargeting as any).cycleTarget?.(dir);
    } catch (e) {
  this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'Cycle selection failed', e);
    }
  }

  /**
   * Maneja el zoom de la cámara
   */
  public handleZoom(delta: number): void {
    // Ignore camera zoom while the system map is active
    if (this.systemPanel && this.systemPanel.isEnabled()) {
      return;
    }
    if (this.camera) {
      this.camera.handleZoom(delta);
    }
  }

  /**
   * Deselecciona el target actual (usado por Escape desde el componente Game)
   */
  public clearTargetSelection(): void {
    try {
      // 1. Limpiar selección en el sistema principal de retícula / targeting legacy
      if (this.reticleManager && this.reticleManager.selectTarget) {
        this.reticleManager.selectTarget(null);
      }
      // 2. Limpiar selección en el sistema adaptativo (v2) si existe
      try { (this.adaptiveTargeting as any)?.selectTarget?.(null); } catch {}
      // 3. Limpiar panel HUD de target y estado interno del HUD
      if (this.hudManager) {
        try { (this.hudManager as any).setTarget?.(null); } catch {}
        try { this.hudManager.clearTargetPanel(); } catch {}
      }
      // 4. Si el mapa está abierto, limpiar también la selección visual del mapa
      if (this.systemPanel && this.systemPanel.isEnabled()) {
        try { (this.systemPanel as any).setSelectedId?.(null); } catch {}
      }
      // 5. Forzar una invalidación mínima del outliner 2D (opcional): al no renderizar en el frame siguiente desaparecerá.
      //    Si existiera necesidad de un "flush" explícito se podría implementar un método clear(channel).
      //    Aquí simplemente no hacemos nada más: dejar de llamar render() elimina la superposición.
    } catch {}
  }

  /**
   * Actualiza los controles de la nave
   */
  private updateShipControls(key: string, pressed: boolean): void {
    if (!this.spaceship) return;

    const keyLower = key.toLowerCase();

    switch (keyLower) {
      case 'w':
        this.spaceship.controls.down = pressed; // Pitch down (invertido)
        break;
      case 's':
        this.spaceship.controls.up = pressed; // Pitch up (invertido)
        break;
      case 'a':
        this.spaceship.controls.left = pressed; // Yaw left (remapeado)
        break;
      case 'd':
        this.spaceship.controls.right = pressed; // Yaw right (remapeado)
        break;
      case 'q':
        this.spaceship.controls.rollRight = pressed; // Invertido: Q hace lo de E
        break;
      case 'e':
        this.spaceship.controls.rollLeft = pressed;  // Invertido: E hace lo de Q
        break;
      case '+':
      case '=':
        {
          const was = this.spaceship.controls.speedUp;
          this.spaceship.controls.speedUp = pressed;
          // On key press edge for acceleration, trigger a short lower-pitch onset if not at max speed
          if (pressed && !was && this.thrusterCtl) {
            // For onset suppression, map to 0..1 relative to base max (pre-rite)
            const baseMax = this.getShipBaseMaxSpeed();
            const speedOverBase = Math.max(0, Math.min(2, this.spaceship.currentSpeed / Math.max(1e-6, baseMax)));
            const norm01 = Math.max(0, Math.min(1, speedOverBase));
            try { (this.thrusterCtl as any).accelOnset?.(norm01); } catch {}
          }
        }
        break;
      case '-':
      case '_':
        this.spaceship.controls.speedDown = pressed;
        break;
      case 'shift':
        this.setPrecisionHoldActive(pressed);
        break;
    }
  }

  private setPrecisionHoldActive(active: boolean): void {
    if (this.precisionHoldActive === active) {
      return;
    }
    this.precisionHoldActive = active;
    this.refreshPrecisionRotationState();
  }

  public setPrecisionLatchActive(active: boolean): void {
    if (this.precisionLatchActive === active) {
      return;
    }
    this.precisionLatchActive = active;
    this.refreshPrecisionRotationState();
  }

  public isPrecisionRotationActive(): boolean {
    return !!(this.spaceship?.isPrecisionRotationActive?.());
  }

  private refreshPrecisionRotationState(): void {
    const shouldEnable = this.precisionHoldActive || this.precisionLatchActive;
    try {
      this.spaceship?.setPrecisionRotationActive(shouldEnable);
    } catch {}
  }

  private registerCanvasResizeListener(canvas: HTMLCanvasElement): void {
    this.unregisterCanvasResizeListener();
    this.canvasResizeHandler = (event: Event) => {
      const detail = (event as CustomEvent<CanvasResizeMetrics>).detail;
      this.applyCanvasResize(detail);
    };
    canvas.addEventListener('webgl-resize', this.canvasResizeHandler);
  }

  private unregisterCanvasResizeListener(): void {
    if (this.domCanvas && this.canvasResizeHandler) {
      this.domCanvas.removeEventListener('webgl-resize', this.canvasResizeHandler);
    }
    this.canvasResizeHandler = null;
  }

  /**
   * Sincroniza el canvas cuando cambia de tamaño (ResizeObserver o handler manual)
   */
  public applyCanvasResize(detail?: CanvasResizeMetrics): void {
    if (!this.domCanvas) {
      return;
    }

    const fallbackWidth = this.domCanvas.clientWidth || this.domCanvas.width;
    const fallbackHeight = this.domCanvas.clientHeight || this.domCanvas.height;
    const cssWidth = detail?.width ?? fallbackWidth;
    const cssHeight = detail?.height ?? fallbackHeight;
    const devicePixelRatio = detail?.devicePixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

    const pixelWidthRaw = detail?.pixelWidth ?? cssWidth * devicePixelRatio;
    const pixelHeightRaw = detail?.pixelHeight ?? cssHeight * devicePixelRatio;

    const pixelWidth = Math.max(1, Math.round(pixelWidthRaw || 1));
    const pixelHeight = Math.max(1, Math.round(pixelHeightRaw || 1));
    const displayWidth = Math.max(1, Math.round((cssWidth || pixelWidth)));
    const displayHeight = Math.max(1, Math.round((cssHeight || pixelHeight)));

    if (this.domCanvas.width !== pixelWidth || this.domCanvas.height !== pixelHeight) {
      this.domCanvas.width = pixelWidth;
      this.domCanvas.height = pixelHeight;
    }

    this.updateAspectRatio(pixelWidth, pixelHeight, displayWidth, displayHeight);
  }

  /**
   * Actualiza el aspect ratio cuando cambia el tamaño del canvas
   */
  public updateAspectRatio(pixelWidth: number, pixelHeight: number, displayWidth?: number, displayHeight?: number): void {
    const safePixelWidth = Math.max(1, Math.round(pixelWidth));
    const safePixelHeight = Math.max(1, Math.round(pixelHeight));

    if (this.camera) {
      this.camera.setAspectRatio(safePixelWidth / safePixelHeight);
    }
    
    if (this.gl) {
      this.gl.viewport(0, 0, safePixelWidth, safePixelHeight);
    }

    const hudWidth = Math.max(1, Math.round(displayWidth ?? safePixelWidth));
    const hudHeight = Math.max(1, Math.round(displayHeight ?? safePixelHeight));

    this.reticleManager?.updateCanvasSize(hudWidth, hudHeight);
    this.adaptiveTargeting?.updateCanvasSize(hudWidth, hudHeight);
  }

  /**
   * Obtiene información de debug
   */
  public getDebugInfo(): any {
    return {
      isRunning: this.isRunning,
      objectCount: 0 /* TODO: Get from cluster service */ + 1,
      cameraInfo: this.camera ? this.camera.getDebugInfo() : null,
      spaceshipPosition: this.spaceship ? { ...this.spaceship.position } : null,
      spaceshipVelocity: this.spaceship ? { ...this.spaceship.velocity } : null
    };
  }

  /**
   * Limpia recursos al destruir el motor
   */
  public cleanup(): void {
    this.stop();
    this.unregisterCanvasResizeListener();
    
    if (this.shaderManager) {
      this.shaderManager.cleanup();
    }
    
    if (this.textureManager) {
      this.textureManager.cleanup();
    }

    if (this.particleEffects) {
      this.particleEffects.cleanup();
    }
    // Cleanup de renderers propios (nave/planetas)
    this.shipRenderer?.cleanup();
    this.planetSurfaceRenderer?.cleanup();
    this.planetRingRenderer?.cleanup();
    this.voidCocoonShieldRenderer = null; // sus buffers caen con el contexto GL

    if (this.atmosphereSceneManager) {
      this.atmosphereSceneManager.dispose();
      this.atmosphereSceneManager = null;
    }
    this.atmosphereTextureFactory = null;
    this.restoreMusicAfterAtmosphere();
    this.atmosphereSceneState = this.createDefaultAtmosphereSceneState();
    
  this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'GameEngine cleaned up');
  }

  /**
   * Ejecuta tests de integración para verificar la relación cámara-nave
   */
  // runIntegrationTests() removed from automatic flow; manual hook exposed via Debug.runIntegrationTests

  /**
   * Crea matriz de transformación para el thruster con orden correcto: Escala → Rotación → Traslación
   */
  private createThrusterMatrix(scaleFactor: number): Float32Array | null {
    if (!this.spaceship) {
      return null;
    }
    try {
      this.spaceship.updateModelMatrix();
    } catch {}
    const matrix = new Float32Array(this.spaceship.modelMatrix);
    const baseRadius = Math.max(0.25, this.spaceship.boundingSphere?.radius ?? 1);
    const uniformScale = scaleFactor / baseRadius;
    this.scaleMatrixUniform(matrix, uniformScale);
    return matrix;
  }

  /**
   * Matriz identidad
   */
  // Helpers de matrices: delegan en game/math (fuente única, ver docs/ARQUITECTURA.md Fase 5.8).
  private identityMatrix(matrix: Float32Array): void {
    identityMatrix(matrix);
  }

  private translateMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
    translateMatrix(matrix, x, y, z);
  }

  private rotateXMatrix(matrix: Float32Array, angle: number): void {
    rotateXMatrix(matrix, angle);
  }

  private rotateYMatrix(matrix: Float32Array, angle: number): void {
    rotateYMatrix(matrix, angle);
  }

  private rotateZMatrix(matrix: Float32Array, angle: number): void {
    rotateZMatrix(matrix, angle);
  }

  private scaleMatrixUniform(matrix: Float32Array, factor: number): void {
    scaleMatrixUniform(matrix, factor);
  }

  /**
   * Crea la geometría del plano HUD inclinado (FASE 2)
   */
  private createHUDPlaneGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    // Dimensiones del plano HUD ajustadas
    const width = 3.0;  // 1.5x más ancho (2.0 * 1.5 = 3.0)
    const height = 0.75; // Mitad de profundidad (1.5 / 2 = 0.75)
    
    // Posición relativa a la cámara (acercamos para pegar la base)
    const distance = 1.1; // Distancia de la cámara (más cerca)
    const tilt = -30 * (Math.PI / 180); // Inclinación de 30° hacia la cámara
    
    // Vértices del plano rectangular (antes de inclinar)
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
  this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'Creando geometría HUD', {
      width, height, distance, tilt: tilt * 180 / Math.PI
    });
    
    // Crear vértices del plano inclinado (base pegada al borde inferior)
    const vertices = [
      // Esquina inferior izquierda
      -halfWidth, -halfHeight * Math.cos(tilt) - 0.5, distance + halfHeight * Math.sin(tilt),
      
      // Esquina inferior derecha  
      halfWidth, -halfHeight * Math.cos(tilt) - 0.5, distance + halfHeight * Math.sin(tilt),
      
      // Esquina superior derecha
      halfWidth, halfHeight * Math.cos(tilt) - 0.5, distance - halfHeight * Math.sin(tilt),
      
      // Esquina superior izquierda
      -halfWidth, halfHeight * Math.cos(tilt) - 0.5, distance - halfHeight * Math.sin(tilt)
    ];
    
  this.logger.log(LogLevel.TRACE, LogCategory.HUD, 'Vértices HUD', { vertices });
    
    // Índices para formar los triángulos del plano
    const indices = [
      0, 1, 2,  // Primer triángulo
      0, 2, 3   // Segundo triángulo
    ];
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Renderiza el HUD con texturas dinámicas (FASE 3)
   * CORREGIDO: El HUD es FIJO relativo a la cámara, no rota con la nave
   */
  private renderHUDPlane(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship || !this.hudManager) {
  this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'HUD render skipped - missing components', {
        hasGL: !!this.gl,
        hasShaderManager: !!this.shaderManager,
        hasSpaceship: !!this.spaceship,
        hasHudManager: !!this.hudManager
      });
      return;
    }

    const now = performance.now();

    // DEBUG: Verificar modo de cámara actual
    const currentCameraMode = this.camera.getCurrentMode();
  this.logger.log(LogLevel.TRACE, LogCategory.HUD, 'HUD render attempt - Camera mode', {
      currentMode: currentCameraMode,
      isCockpit: currentCameraMode === CameraMode.COCKPIT,
      CockpitEnum: CameraMode.COCKPIT
    });

    // Obtener datos del juego para el HUD
    // En modo atmosférico, usar solo currentSpeed (forward) para evitar parpadeo por gravedad
    const velocityMagnitude = this.isAtmosphereSceneActive() 
      ? this.spaceship.currentSpeed
      : Math.sqrt(
          this.spaceship.velocity.x ** 2 + 
          this.spaceship.velocity.y ** 2 + 
          this.spaceship.velocity.z ** 2
        );

    const orientationBasis: OrientationBasis = this.spaceship.getOrientationBasis();
    const atmosphereOrientation = this.isAtmosphereSceneActive()
      ? calculateAtmosphereAttitude({
          shipBasis: orientationBasis,
          shipPosition: { ...this.spaceship.position },
          planetCenter: this.atmosphereSceneState.center,
        })
      : null;
    const baseMax = this.getShipBaseMaxSpeed();
    const speedPctExtended = (this.spaceship.currentSpeed / Math.max(1e-6, baseMax)) * 100; // 0..200 when jumping/rite
    const voidJumpActive = !!this.voidJumpActive;
    const speedForHud = voidJumpActive ? Math.max(0, Math.min(100, speedPctExtended)) : Math.max(0, Math.min(200, speedPctExtended));
    const flightVectorReticle = this.buildFlightVectorReticleState(speedForHud);
    this.updateFlightVectorOverlay(flightVectorReticle);
    const gameData = {
      velocity: velocityMagnitude,
      heading: computeHeadingFromForward(orientationBasis.forward),
      pitch: this.spaceship.rotation.x * (180 / Math.PI),
      roll: this.spaceship.rotation.z * (180 / Math.PI),
      altitude: this.spaceship.position.y,
  speed: speedForHud,
      maxSpeed: this.spaceship.maxSpeed,
      baseMaxSpeed: baseMax,
      voidEnergy: {
        current: this.spaceship.voidEnergyCurrent,
        max: this.spaceship.voidEnergyMax,
        pct: (this.spaceship.voidEnergyCurrent / this.spaceship.voidEnergyMax) * 100
      },
      shipHealth: {
        current: this.spaceship.healthCurrent,
        max: this.spaceship.healthMax,
        pct: (this.spaceship.healthCurrent / Math.max(1, this.spaceship.healthMax)) * 100
      },
      shipCargo: {
        current: this.spaceship.cargoCapacityCurrent,
        max: this.spaceship.cargoCapacityMax,
        pct: (this.spaceship.cargoCapacityCurrent / Math.max(1, this.spaceship.cargoCapacityMax)) * 100
      },
      weapons: this.weaponBridge.buildHudSnapshot(now),
      orientation: orientationBasis,
      // Pasar posición de la nave para cálculo de bearing/elevación en brújula
      position: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z },
      speedRiteRemainingSec: this.speedRiteSystem.remainingSec(now),
      compassCountdown: this.getCompassCountdownPayload(now),
      precisionModeActive: this.isPrecisionRotationActive(),
      // Portal cooldown HUD removido (no se expone)
      // Atmosphere mode: artificial horizon + altimeter
      atmosphereMode: this.isAtmosphereSceneActive(),
      altitudeAboveGround: this.computeAltitudeAboveGround(),
      atmospherePitch: atmosphereOrientation?.pitch ?? null,
      atmosphereRoll: atmosphereOrientation?.roll ?? null,
      atmosphereTelemetryPanel: this.atmosphereTelemetryPanelState,
    };

    // Sincronizar el target actual del sistema de retícula con el HUD
    try {
      const currentTarget = this.adaptiveTargeting?.getCurrentTarget ? this.adaptiveTargeting.getCurrentTarget() : null;
      if (this.hudManager?.setTarget) {
        this.hudManager.setTarget(currentTarget);
      }
    } catch (e) {
  this.logger.log(LogLevel.WARN, LogCategory.HUD, 'No se pudo sincronizar target con HUD', e);
    }

    // Actualizar elementos del HUD
    this.hudManager.update(gameData);

    // Renderizar HUD que se mueve CON la cámara
    this.hudManager.render(
      this.camera.getCurrentMode(),
      this.shaderManager,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.camera.position
    );

  this.logger.log(LogLevel.TRACE, LogCategory.HUD, 'HUD dinámico FIJO renderizado', {
      velocity: gameData.velocity.toFixed(1),
      heading: gameData.heading.toFixed(1),
      speed: gameData.speed.toFixed(1)
    });
  }

  private getCompassCountdownPayload(now: number = performance.now()): CompassCountdownPayload | null {
    return buildCompassCountdownPayload(now, {
      voidCocoonActiveUntilMs: this.voidCocoonActiveUntilMs,
      speedRiteUntilMs: this.speedRiteSystem.expiresAtMs,
      speedRiteActive: this.isSpeedRiteActive(now),
    });
  }

  private buildFlightVectorReticleState(speedGaugeValue: number): FlightVectorReticleState | null {
    return this.flightVectorReticleBuilder.build(this.flightVectorReticleHost, speedGaugeValue);
  }

  /**
   * Crea la matriz de transformación para el HUD (relativa a la nave)
   */
  private createHUDMatrix(): Float32Array {
    const matrix = new Float32Array(16);
    
    // Inicializar como matriz identidad
    this.identityMatrix(matrix);
    
    // Aplicar las rotaciones de la nave para que el HUD rote con ella
    this.rotateXMatrix(matrix, this.spaceship.rotation.x);
    this.rotateYMatrix(matrix, this.spaceship.rotation.y); 
    this.rotateZMatrix(matrix, this.spaceship.rotation.z);
    
    // Aplicar traslación de la nave
    this.translateMatrix(matrix, this.spaceship.position.x, this.spaceship.position.y, this.spaceship.position.z);
    
    return matrix;
  }

  /**
   * Renderiza el sistema de retícula (FASE 2)
   */
  private renderReticleSystem(): void {
    if (!this.reticleManager) return;

    const deltaTime = (performance.now() - this.lastFrameTime) / 1000;
    this.reticleManager.render(deltaTime);
  }


  /** STEP 5: outliner 2D — la decisión de pintado vive en target-outline-driver (regla #1). */
  private renderTargetOutline2D(): void {
    renderTargetOutline2D({
      isEnabled: () => this.outlinerEnabled && !!this.targetOutline2D && !!this.adaptiveTargeting,
      getOutline: () => this.targetOutline2D,
      getTargeting: () => this.adaptiveTargeting,
      shouldHideOverlays: () =>
        this.spellIOCoordinator?.shouldHideOutliners?.() ?? (!!this.animationManager?.isBlockingInputs?.()),
      getDevicePixelRatio: () => this.webglService.getState().devicePixelRatio || 1,
      getDisplayDistance: (t) => this.getDisplayDistanceToTarget(t),
    });
  }

  /** Attach or detach click binding based on panel enabled state */
  /**
   * @deprecated Legacy method - now handled by PanelEventCoordinator
   * Updates map panel event binding state in the coordinator
   */
  private updateMapClickBinding(): void {
    if (!this.systemPanel) return;
    const enabled = this.systemPanel.isEnabled();
    this.panelEventCoordinator.setMapEnabled(enabled);
    
    // Clear map selection state when disabling
    if (!enabled) {
      try { this.systemPanel.setSelectedId(null); } catch {}
      try { this.systemPanel.setHoveredId(null); } catch {}
    }
  }

  /**
   * @deprecated Legacy method - now handled by PanelEventCoordinator
   * Updates grimoire panel event binding state in the coordinator
   */
  private updateGrimoirePointerBinding(): void {
    if (!this.grimoirePanel) return;
    // Usar estado interactivo (cierra handlers inmediatamente al iniciar animación de cierre)
    const enabled = (this.grimoirePanel as any).isInteractive?.() ?? this.grimoirePanel.isEnabled();
    this.panelEventCoordinator.setGrimoireEnabled(enabled);
  }

  private updateInventoryPointerBinding(): void {
    const enabled = !!(this.inventoryPanel && this.inventoryPanel.isEnabled());
    this.panelEventCoordinator.setInventoryEnabled(enabled);
  }

  private refreshInventoryPanelSnapshot(): void {
    if (!this.inventoryPanel || !this.inventoryPanel.isEnabled()) {
      return;
    }
    const snapshot = composeInventorySnapshot(this.gameState, this.spaceship);
    if (snapshot) {
      this.inventoryPanel.update(snapshot);
    }
  }

  /**
   * @deprecated Legacy method - cursor management could be extracted to CursorManager (FASE 6d)
   * Hide OS cursor when Grimoire is enabled; restore otherwise
   */
  private updateCanvasCursor(): void {
    try {
      if (!this.domCanvas) return;
      const gOn = !!(this.grimoirePanel && this.grimoirePanel.isEnabled());
      const invOn = !!(this.inventoryPanel && this.inventoryPanel.isEnabled());
      if (gOn || invOn) {
        this.domCanvas.style.cursor = 'none';
      } else {
        this.domCanvas.style.cursor = '';
      }
    } catch {}
  }

  private syncPanelCursorOverlay(): void {
    if (!this.panelCursorOverlay) {
      return;
    }
    let state = null;
    if (this.systemPanel?.isEnabled()) {
      state = this.systemPanel.getCursorOverlayState?.() ?? null;
    } else if (this.grimoirePanel?.isEnabled()) {
      state = this.grimoirePanel.getCursorOverlayState?.() ?? null;
    } else if (this.inventoryPanel?.isEnabled()) {
      state = this.inventoryPanel.getCursorOverlayState?.() ?? null;
    }
    this.panelCursorOverlay.setState(state);
  }

  private clearPanelCursorOverlay(): void {
    if (!this.panelCursorOverlay) {
      return;
    }
    this.panelCursorOverlay.setState(null);
  }

  private ensureFlightVectorOverlay(): void {
    if (this.flightVectorOverlay || !this.domCanvas) {
      return;
    }
    this.flightVectorOverlay = new FlightVectorReticleOverlay(this.domCanvas);
  }

  private updateFlightVectorOverlay(state: FlightVectorReticleState | null): void {
    if (!state || !this.shouldDisplayFlightVectorOverlay()) {
      this.flightVectorOverlay?.setState(null);
      return;
    }
    this.ensureFlightVectorOverlay();
    this.flightVectorOverlay?.setState(state);
  }

  private shouldDisplayFlightVectorOverlay(): boolean {
    if (!this.camera || !this.spaceship) {
      return false;
    }
    if (this.systemPanel?.isEnabled() || this.grimoirePanel?.isEnabled() || this.inventoryPanel?.isEnabled()) {
      return false;
    }
    return true;
  }

  /**
   * Configura eventos del mouse para el sistema de targeting adaptativo
   */
  /**
   * Initialize PanelEventCoordinator with all event callbacks
   */
  private setupPanelEventCoordinator(): void {
    const canvas = this.webglService.getCanvas();
    
    if (!canvas) {
      this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'No canvas available for event coordinator');
      return;
    }

    this.domCanvas = canvas;
    if (!this.panelCursorOverlay) {
      this.panelCursorOverlay = new PanelCursorOverlay(canvas);
    }

    // Initialize coordinator with comprehensive callbacks
    this.panelEventCoordinator.initialize(canvas, {
      // Map panel events (mouse/wheel)
      onMapClick: (clientX, clientY) => this.handleMapClick(clientX, clientY),
      onMapMove: (clientX, clientY) => this.handleMapMove(clientX, clientY),
      onMapWheel: (deltaY, clientX, clientY) => this.handleMapWheel(deltaY, clientX, clientY),
      onMapPointerDown: (clientX, clientY, button) => this.handleMapPointerDown(clientX, clientY, button),
      onMapPointerUp: (clientX, clientY, button) => this.handleMapPointerUp(clientX, clientY, button),
      
      // Grimoire panel events (mouse)
      onGrimoireClick: (clientX, clientY) => this.handleGrimoireClick(clientX, clientY),
      onGrimoireMove: (clientX, clientY) => this.handleGrimoireMove(clientX, clientY),
      onGrimoirePointerDown: (clientX, clientY, button) => this.handleGrimoirePointerDown(clientX, clientY, button),
      onGrimoirePointerUp: (clientX, clientY, button) => this.handleGrimoirePointerUp(clientX, clientY, button),

      // Inventory panel events (mouse/wheel)
      onInventoryClick: (clientX, clientY) => this.handleInventoryClick(clientX, clientY),
      onInventoryMove: (clientX, clientY) => this.handleInventoryMove(clientX, clientY),
      onInventoryWheel: (deltaY, clientX, clientY) => this.handleInventoryWheel(deltaY, clientX, clientY),
      
      // 3D targeting (when no panel active)
      on3DClick: (event) => this.handle3DClick(event),

      // Vuelo: botón derecho mantenido = disparar el arma seleccionada
      onFlightPointerMove: (clientX, clientY) => { this.flightPointer = { x: clientX, y: clientY }; },
      onFlightPointerDown: (button) => { if (button === 2) this.setWeaponTriggerHeld(true); },
      onFlightPointerUp: (button) => { if (button === 2) this.setWeaponTriggerHeld(false); },
      onFlightContextMenu: () => true
    });

    this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'PanelEventCoordinator initialized successfully');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Panel Event Callback Handlers (called by PanelEventCoordinator)
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMapToggle(): void {
    if (!this.systemPanel) return;
    const wasEnabled = this.systemPanel.isEnabled();
    const now = performance.now();
    this.systemPanel.setEnabled(!wasEnabled);
    this.panelEventCoordinator.setMapEnabled(!wasEnabled);
    
    if (!wasEnabled) {
      // Map opened
      try { this.audio?.play('ui_map_open'); } catch {}
      if (this.grimoirePanel?.isEnabled()) {
        this.grimoirePanel.setEnabled(false);
        this.panelEventCoordinator.setGrimoireEnabled(false);
      }
      if (this.inventoryPanel?.isEnabled()) {
        this.inventoryPanel.setEnabled(false);
        this.inventoryPanel.resetScroll();
        this.clearInventorySelection();
        this.gameState.inventoryReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
        this.updateInventoryPointerBinding();
        this.updateCanvasCursor();
      }
    } else {
      // Map closed
      try { this.audio?.play('ui_map_close'); } catch {}
      this.gameState.mapReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
      this.clearPanelCursorOverlay();
    }
    this.syncPanelCursorOverlay();
  }

  private handleMapPointerDown(clientX: number, clientY: number, button: number): void {
    if (button !== 2 || !this.systemPanel || !this.systemPanel.isEnabled() || !this.gl || !this.domCanvas) {
      return;
    }
    const rect = this.domCanvas.getBoundingClientRect();
    const viewportW = (this.gl.canvas as HTMLCanvasElement).width;
    const viewportH = (this.gl.canvas as HTMLCanvasElement).height;
    try {
      if (this.systemPanel.beginPanFromViewport(clientX, clientY, rect, viewportW, viewportH)) {
        this.systemPanel.setHoveredId(null);
      }
    } catch {}
  }

  private handleMapPointerUp(_clientX: number, _clientY: number, button: number): void {
    if (button !== 2 || !this.systemPanel) {
      return;
    }
    try {
      this.systemPanel.endPan();
    } catch {}
  }

  private handleMapClick(clientX: number, clientY: number): void {
    if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl || !this.domCanvas) return;
    
    const rect = this.domCanvas.getBoundingClientRect();
    const id = this.systemPanel.hitTestViewport(
      clientX,
      clientY,
      rect,
      (this.gl.canvas as HTMLCanvasElement).width,
      (this.gl.canvas as HTMLCanvasElement).height,
      'click'
    );
    
    if (id) {
      // No permitir selección de la nave en el mapa (solo hover outline)
      if (id === 'ship') return;
      
      const target = this.gameState.mapIdToTarget.get(id);
      if (target && this.adaptiveTargeting) {
        try { this.prepareDisplayPropsForTarget(target as unknown as ITargetable); } catch {}
        try { this.adaptiveTargeting.selectTarget(target); } catch {}
        try { this.fetchAndCacheTargetDetails(target as unknown as ITargetable); } catch {}
        try { this.systemPanel.setSelectedId(id); } catch {}
      } else {
        // Defer selection until id->target mapping is rebuilt in the first render pass
        this.pendingMapSelectId = id;
      }
    }
  }

  private handleMapMove(clientX: number, clientY: number): void {
    if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl || !this.domCanvas) return;
    
    const rect = this.domCanvas.getBoundingClientRect();
    const viewportW = (this.gl.canvas as HTMLCanvasElement).width;
    const viewportH = (this.gl.canvas as HTMLCanvasElement).height;
    
    // Update cursor position on the map
    try {
      this.systemPanel.setCursorFromViewport(
        clientX,
        clientY,
        rect,
        viewportW,
        viewportH
      );
      this.syncPanelCursorOverlay();
    } catch {}

    if (this.systemPanel.isPanActive()) {
      try {
        this.systemPanel.updatePanFromViewport(
          clientX,
          clientY,
          rect,
          viewportW,
          viewportH
        );
        this.systemPanel.setHoveredId(null);
      } catch {}
      return;
    }
    
    const id = this.systemPanel.hitTestViewport(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      'move'
    );
    
    // Play hover sound when hovering over a new object (but not the ship)
    const prevId = this.systemPanel.getHoveredId();
    if (!this.hoverAudioMuted && id !== prevId && id && id !== 'ship') {
      try { this.audio?.play('ui_outline_hover', { bus: 'ui', volume: 0.3 }); } catch {}
    }
    
    try { this.systemPanel.setHoveredId(id); } catch {}
  }

  private handleMapWheel(deltaY: number, clientX: number, clientY: number): void {
    if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl || !this.domCanvas) return;
    
    const rect = this.domCanvas.getBoundingClientRect();
    const viewportW = (this.gl.canvas as HTMLCanvasElement).width;
    const viewportH = (this.gl.canvas as HTMLCanvasElement).height;
    try {
      this.systemPanel.handleWheelFromViewport(
        deltaY,
        clientX,
        clientY,
        rect,
        viewportW,
        viewportH
      );
    } catch {}
  }

  private handleGrimoireToggle(): void {
    if (!this.grimoirePanel) return;
    const wasEnabled = this.grimoirePanel.isEnabled();
    const now = performance.now();
    this.grimoirePanel.setEnabled(!wasEnabled);
    this.panelEventCoordinator.setGrimoireEnabled(!wasEnabled);
    
    if (!wasEnabled) {
      // Grimoire opened
      try { this.audio?.play('ui_grimoire_open'); } catch {}
      if (this.systemPanel?.isEnabled()) {
        this.systemPanel.setEnabled(false);
        this.panelEventCoordinator.setMapEnabled(false);
      }
      if (this.inventoryPanel?.isEnabled()) {
        this.inventoryPanel.setEnabled(false);
        this.inventoryPanel.resetScroll();
        this.clearInventorySelection();
        this.gameState.inventoryReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
        this.updateInventoryPointerBinding();
        this.updateCanvasCursor();
      }
    } else {
      // Grimoire closed
      try { this.audio?.play('ui_grimoire_close'); } catch {}
      this.gameState.grimoireReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
      this.clearPanelCursorOverlay();
    }
    this.syncPanelCursorOverlay();
  }

  private handleGrimoireClick(clientX: number, clientY: number): void {
    if (!this.grimoirePanel || !this.grimoirePanel.isEnabled()) return;
    if ((this.grimoirePanel as any).isGlyphDragging?.()) {
      return;
    }

    const panelAny = this.grimoirePanel as any;
    // Set selected spell from hover
    const hoveredSpell = panelAny.getHoveredSpellType?.();
    if (hoveredSpell) {
      try {
        panelAny.setSelectedSpellType?.(hoveredSpell);
      } catch {}
      return;
    }

    // Clicked on empty parchment: clear current selection if any
    const previouslyEquipped = panelAny.getSelectedSpellType?.() ?? null;
    let selectionCleared = false;
    try {
      panelAny.setSelectedSpellType?.(null);
      selectionCleared = true;
    } catch {
      try {
        panelAny.clearSelection?.();
        selectionCleared = true;
      } catch {}
    }
    if (previouslyEquipped && selectionCleared) {
      try { this.audio?.play('ui_outline_clear', { bus: 'ui', volume: 0.4 }); } catch {}
    }
  }

  private handleGrimoireMove(clientX: number, clientY: number): void {
    this.updateGrimoireCursor(clientX, clientY);
  }

  private handleGrimoirePointerDown(clientX: number, clientY: number, button: number): void {
    if (!this.grimoirePanel || !this.grimoirePanel.isEnabled()) return;
    this.updateGrimoireCursor(clientX, clientY);
    if (button === 2) {
      const started = (this.grimoirePanel as any).beginGlyphDrag?.();
      if (started && this.audio) {
        try { this.audio.play('ui_outline_clear', { bus: 'ui', volume: 0.35 }); } catch {}
      }
    }
  }

  private handleGrimoirePointerUp(clientX: number, clientY: number, button: number): void {
    if (!this.grimoirePanel || !this.grimoirePanel.isEnabled()) return;
    this.updateGrimoireCursor(clientX, clientY);
    if (button === 2) {
      const result = (this.grimoirePanel as any).endGlyphDrag?.();
      if (result && result.spell && result.normalized) {
        this.gameState.setGrimoireGlyphPosition(result.spell, result.normalized);
        this.syncGrimoireLayoutFromState('glyph-updated');
      }
    }
  }

  private syncGrimoireLayoutFromState(origin: string = 'unknown'): void {
    if (!this.grimoirePanel || !this.gameState) {
      return;
    }
    try {
      const layout = this.gameState.getGrimoireGlyphLayoutSnapshot();
      this.grimoirePanel.applyNormalizedGlyphLayout(layout);
      this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'Grimoire layout synchronized', {
        origin,
        glyphs: Object.keys(layout as Record<string, unknown>).length
      });
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Failed to sync grimoire layout from state', {
        origin,
        error
      });
    }
  }

  private updateGrimoireCursor(clientX: number, clientY: number): void {
    if (!this.grimoirePanel || !this.grimoirePanel.isEnabled() || !this.gl || !this.domCanvas) return;
    const rect = this.domCanvas.getBoundingClientRect();
    try {
      this.grimoirePanel.setCursorFromViewport(
        clientX,
        clientY,
        rect,
        (this.gl.canvas as HTMLCanvasElement).width,
        (this.gl.canvas as HTMLCanvasElement).height
      );
      this.syncPanelCursorOverlay();
    } catch {}
  }

  private handleInventoryToggle(): void {
    if (!this.inventoryPanel) {
      return;
    }

    const now = performance.now();
    const isEnabled = this.inventoryPanel.isEnabled();
    const next = !isEnabled;

    if (next) {
      if (now < this.gameState.inventoryReopenAllowedAtMs) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Inventory reopen blocked by cooldown', {
          remainingMs: Math.round(this.gameState.inventoryReopenAllowedAtMs - now)
        });
        return;
      }
      // Close other overlays for mutual exclusivity
      if (this.systemPanel?.isEnabled()) {
        this.systemPanel.setEnabled(false);
        this.gameState.mapReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
        this.updateMapClickBinding();
      }
      if (this.grimoirePanel?.isEnabled()) {
        this.grimoirePanel.setEnabled(false);
        this.gameState.grimoireReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
        this.updateGrimoirePointerBinding();
      }
      this.inventoryPanel.resetScroll();
      this.inventoryPanel.setEnabled(true);
      this.clearInventorySelection();
      this.refreshInventoryPanelSnapshot();
      this.inventoryHoverKey = null;
      try {
        this.audio?.play('ui_inventory_open', { bus: 'ui', volume: 0.6 });
      } catch (e) {
        this.logger.log(LogLevel.DEBUG, LogCategory.AUDIO, 'Inventory open sound failed', e);
      }
    } else {
      this.inventoryPanel.setEnabled(false);
      this.inventoryPanel.resetScroll();
      this.clearInventorySelection();
      this.gameState.inventoryReopenAllowedAtMs = now + PANEL_REOPEN_COOLDOWN_MS;
      this.inventoryHoverKey = null;
      try {
        this.audio?.play('ui_inventory_close', { bus: 'ui', volume: 0.6 });
      } catch (e) {
        this.logger.log(LogLevel.DEBUG, LogCategory.AUDIO, 'Inventory close sound failed', e);
      }
    }

    this.updateInventoryPointerBinding();
    this.updateCanvasCursor();
    this.syncPanelCursorOverlay();
  }

  private handleInventoryClick(clientX: number, clientY: number): void {
    if (!this.inventoryPanel || !this.inventoryPanel.isEnabled() || !this.gl || !this.domCanvas) {
      return;
    }

    const rect = this.domCanvas.getBoundingClientRect();
    try {
      this.inventoryPanel.setCursorFromViewport(
        clientX,
        clientY,
        rect,
        (this.gl.canvas as HTMLCanvasElement).width,
        (this.gl.canvas as HTMLCanvasElement).height
      );
      this.syncPanelCursorOverlay();
    } catch {}

    const region = this.inventoryPanel.pickRegionAtCursor();
    this.updateInventoryHoverState(region);
    if (!region) {
      this.clearInventorySelection();
      return;
    }

    if (region.kind === 'action') {
      if (region.enabled) {
        this.handleInventoryAction(region.action);
      } else {
        try { this.audio?.play('ui_error_small', { bus: 'ui', volume: 0.3 }); } catch {}
      }
      return;
    }

    this.applyInventorySelection(region);
  }

  private handleInventoryMove(clientX: number, clientY: number): void {
    if (!this.inventoryPanel || !this.inventoryPanel.isEnabled() || !this.gl || !this.domCanvas) {
      return;
    }

    const rect = this.domCanvas.getBoundingClientRect();
    try {
      this.inventoryPanel.setCursorFromViewport(
        clientX,
        clientY,
        rect,
        (this.gl.canvas as HTMLCanvasElement).width,
        (this.gl.canvas as HTMLCanvasElement).height
      );
      this.syncPanelCursorOverlay();
      const hoveredRegion = this.inventoryPanel.pickRegionAtCursor();
      this.updateInventoryHoverState(hoveredRegion);
    } catch {}
  }

  private handleInventoryWheel(deltaY: number, clientX: number, clientY: number): void {
    if (!this.inventoryPanel || !this.inventoryPanel.isEnabled() || !this.gl || !this.domCanvas) {
      return;
    }

    const rect = this.domCanvas.getBoundingClientRect();
    try {
      this.inventoryPanel.setCursorFromViewport(
        clientX,
        clientY,
        rect,
        (this.gl.canvas as HTMLCanvasElement).width,
        (this.gl.canvas as HTMLCanvasElement).height
      );
      this.syncPanelCursorOverlay();
      this.inventoryPanel.handleWheelFromViewport(deltaY);
    } catch {}
  }

  private applyInventorySelection(region: InventoryPanelRegion): void {
    let selection: InventorySelection | null = null;
    switch (region.kind) {
      case 'cargo':
        selection = { kind: 'cargo', entryId: region.entryId };
        break;
      case 'equipment':
        selection = { kind: 'equipment', slot: region.slot };
        break;
      case 'personal':
        selection = { kind: 'personal', slot: region.slot, index: region.index };
        break;
      default:
        selection = null;
    }

    if (!selection) {
      this.clearInventorySelection();
      return;
    }

    this.inventorySelection = selection;
    try {
      this.inventoryPanel?.setSelection(selection);
    } catch {}

    try { this.audio?.play('ui_outline_select', { bus: 'ui', volume: 0.35 }); } catch {}
  }

  private updateInventoryHoverState(region: InventoryPanelRegion | null): void {
    const key = this.getInventoryRegionKey(region);
    if (key === this.inventoryHoverKey) {
      return;
    }
    this.inventoryHoverKey = key;
    if (!region || !key) {
      return;
    }
    if (this.isInventoryRegionSelected(region)) {
      return;
    }
    try { this.audio?.play('ui_outline_hover', { bus: 'ui', volume: 0.28 }); } catch {}
  }

  private getInventoryRegionKey(region: InventoryPanelRegion | null): string | null {
    if (!region) {
      return null;
    }
    switch (region.kind) {
      case 'cargo':
        return `cargo:${region.entryId}`;
      case 'equipment':
        return `equipment:${region.slot}`;
      case 'personal':
        return `personal:${region.slot}:${region.index}`;
      default:
        return null;
    }
  }

  private isInventoryRegionSelected(region: InventoryPanelRegion): boolean {
    if (!this.inventorySelection) {
      return false;
    }
    switch (region.kind) {
      case 'cargo':
        return this.inventorySelection.kind === 'cargo' && this.inventorySelection.entryId === region.entryId;
      case 'equipment':
        return this.inventorySelection.kind === 'equipment' && this.inventorySelection.slot === region.slot;
      case 'personal':
        return this.inventorySelection.kind === 'personal'
          && this.inventorySelection.slot === region.slot
          && this.inventorySelection.index === region.index;
      default:
        return false;
    }
  }

  private handleInventoryAction(action: InventoryActionType): void {
    switch (action) {
      case InventoryActionType.JETTISON:
        this.jettisonSelectedInventoryItem();
        break;
      default:
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Unhandled inventory action', { action });
    }
  }

  private jettisonSelectedInventoryItem(): void {
    const selection = this.inventorySelection;
    if (!selection) {
      this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Jettison requested with no selection');
      return;
    }

    if (selection.kind === 'cargo') {
      const entry = this.gameState.cargoManifest.find(item => item.id === selection.entryId);
      if (!entry) {
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Cargo selection missing from manifest', { selection });
        this.clearInventorySelection();
        return;
      }
      const removedUnits = this.spaceship?.removeCargo(entry.units) ?? 0;
      this.cargoHoldService.removeCargoEntry(entry.id);
      this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Cargo jettisoned', {
        entryId: entry.id,
        label: entry.label,
        removedUnits
      });
    } else if (selection.kind === 'equipment') {
      this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Equipment slots cannot be jettisoned', { slot: selection.slot });
      return;
    } else if (selection.kind === 'personal') {
      if (selection.index < 0) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Cannot jettison empty personal slot', {
          slot: selection.slot
        });
      } else {
        const removed = this.gameState.removePersonalGearAtIndex(selection.index);
        if (!removed || removed.slot !== selection.slot) {
          this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Personal gear index invalid', {
            index: selection.index,
            slot: selection.slot
          });
        } else {
          this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Personal gear jettisoned', {
            slot: removed.slot,
            label: removed.label
          });
        }
      }
    }

    try { this.audio?.play('ui_outline_clear', { bus: 'ui', volume: 0.4 }); } catch {}
    this.clearInventorySelection();
    this.refreshInventoryPanelSnapshot();
  }

  private clearInventorySelection(): void {
    this.inventorySelection = null;
    try { this.inventoryPanel?.setSelection(null); } catch {}
  }

  private handleEscape(): void {
    // Close any open panel
    if (this.systemPanel?.isEnabled()) {
      this.systemPanel.setEnabled(false);
      this.panelEventCoordinator.setMapEnabled(false);
      try { this.audio?.play('ui_map_close'); } catch {}
      this.clearPanelCursorOverlay();
      this.syncPanelCursorOverlay();
      return;
    }
    
    if (this.grimoirePanel?.isEnabled()) {
      this.grimoirePanel.setEnabled(false);
      this.panelEventCoordinator.setGrimoireEnabled(false);
      try { this.audio?.play('ui_grimoire_close'); } catch {}
      this.updateCanvasCursor();
      this.clearPanelCursorOverlay();
      this.syncPanelCursorOverlay();
      return;
    }

    if (this.inventoryPanel?.isEnabled()) {
      this.inventoryPanel.setEnabled(false);
      this.inventoryPanel.resetScroll();
      this.clearInventorySelection();
      this.gameState.inventoryReopenAllowedAtMs = performance.now() + PANEL_REOPEN_COOLDOWN_MS;
      this.updateInventoryPointerBinding();
      this.inventoryHoverKey = null;
      try { this.audio?.play('ui_inventory_close', { bus: 'ui', volume: 0.6 }); } catch {}
      this.updateCanvasCursor();
      this.clearPanelCursorOverlay();
      this.syncPanelCursorOverlay();
      return;
    }
    
    // No panel open, clear target selection
    if (this.adaptiveTargeting) {
      try {
        (this.adaptiveTargeting as any).clearTargetSelection?.();
      } catch {}
    }
  }

  private handleCameraMode(mode: string): void {
    if (!this.camera) return;
    try {
      this.camera.setCameraMode(parseInt(mode, 10));
    } catch {}
  }

  private handle3DClick(event: MouseEvent): void {
    if (!this.adaptiveTargeting) return;
    
    this.adaptiveTargeting.handleClick();
    
    // After selection via 3D click, ensure display props are ready and warm target details
    try {
      const sel = this.adaptiveTargeting.getCurrentTarget?.();
      if (sel) {
        this.prepareDisplayPropsForTarget(sel);
        this.fetchAndCacheTargetDetails(sel);
      }
    } catch {}
  }

  /** Map ID resolver for a given world target: returns the map item id to select/highlight */
  private resolveMapIdForTarget(target: ITargetable): string | null {
    try {
      // Primary Sun maps to 'center'
      if (this.gameState.sun && (target as any).id === (this.gameState.sun as any).id) return 'center';
      // Planets map to their own id
      const ttype = target.getTargetType?.();
      if (ttype === TargetType.PLANET) return target.id;
      // Earth debris: individual mega-asteroids are present as items by their id
      for (const arr of this.planetDebris.values()) {
        if (arr.find(d => d.obj.id === target.id)) return target.id;
      }
      // Clusters: map member or proxy to the cluster id
      try {
        for (const c of this.asteroidClusterService.getClusters()) {
          if (c.proxy && c.proxy.id === (target as any).id) return c.id;
          if (c.objects.find(o => o.id === (target as any).id)) return c.id;
        }
      } catch {}
      // Ship (ally)
      if (this.spaceship && (target as any).id === (this.spaceship as any).id) return 'ship';
      // Fallback: direct id (may not exist as an item, safe no-op)
      return (target as any).id || null;
    } catch {
      return null;
    }
  }

  public registerLesserBeing(being: LesserBeingBase): void {
    if (!being) {
      return;
    }
    const duplicate = this.lesserBeings.find(b => b.id === being.id);
    if (duplicate) {
      return;
    }
    this.lesserBeings.push(being);
    this.registerDestructionCallback(being);
    try {
      if (this.gl && !being.vertexBuffer) {
        being.initBuffers(this.gl);
      }
    } catch (err) {
      this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'Failed to init lesser being buffers', { id: being.id, err });
    }
    // Los seres con piloto propio (cazas arácnidos) no entran en la IA genérica: los mueve su sistema.
    if (!being.externallyPiloted) {
      try { this.lesserBeingController?.registerBeing(being as any); } catch {}
    }
    const currentShips = [...this.targetCatalog.getByType(TargetType.SPACESHIP).filter(t => t.id !== being.id), being as unknown as ITargetable];
    this.targetCatalog.register(TargetType.SPACESHIP, currentShips);
    this.gameState.mapIdToTarget.set(being.id, being as unknown as ITargetable);
  }

  public unregisterLesserBeing(beingId: string): void {
    if (!beingId) {
      return;
    }
    const idx = this.lesserBeings.findIndex(b => b.id === beingId);
    if (idx >= 0) {
      this.lesserBeings.splice(idx, 1);
    }
    try { this.lesserBeingController?.unregisterBeing(beingId); } catch {}
    try { this.lesserBeingSpawner?.handleBeingRemoved(beingId); } catch {}
    try { this.lesserBeingCombat?.handleBeingRemoved(beingId); } catch {}
    const remaining = this.targetCatalog.getByType(TargetType.SPACESHIP).filter(t => t.id !== beingId);
    this.targetCatalog.register(TargetType.SPACESHIP, remaining);
    this.gameState.mapIdToTarget.delete(beingId);
  }

  public directLesserBeingToShip(beingId: string, options?: { immediateAttack?: boolean }): boolean {
    if (!beingId) {
      return false;
    }
    try {
      return this.lesserBeingController?.forceShipEngagement(beingId, options) ?? false;
    } catch (error) {
      this.logger.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Failed to force ship engagement', {
        beingId,
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }

  public addGameObject(obj: GameObject): void {
    if (obj instanceof LesserBeingBase) {
      this.registerLesserBeing(obj);
      return;
    }
    this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'addGameObject invoked with unsupported type', {
      id: obj?.id,
      type: obj?.constructor?.name
    });
  }

  private resolveSystemId(snapshot?: SolarSystemSnapshot | null): string | null {
    // Identidad canónica: system-identity.ts (única fuente, ver docs/ARQUITECTURA.md §4.3).
    return resolveSystemId(snapshot ?? this.currentSnapshot);
  }

  private resolvePersistentSystemKey(snapshot?: SolarSystemSnapshot | null): string | null {
    return resolveSystemKey(snapshot ?? this.currentSnapshot, { fallbackLabel: this.currentSnapshotLabel });
  }

  public getPersistentSystemKey(snapshot?: SolarSystemSnapshot | null): string | null {
    return this.resolvePersistentSystemKey(snapshot);
  }

  private setCurrentSnapshotReference(snapshot: SolarSystemSnapshot, label?: string | null): void {
    this.currentSnapshot = snapshot;
    this.setCurrentSnapshotLabel(label ?? snapshot.meta?.['snapshotLabel'] ?? null, { mutateSnapshot: false });
    if (this.currentSnapshotLabel) {
      snapshot.meta = { ...(snapshot.meta || {}), snapshotLabel: this.currentSnapshotLabel };
    }
  }

  public setCurrentSnapshotLabel(
    label: string | null,
    options?: { mutateSnapshot?: boolean }
  ): void {
    const normalized = label && label.trim().length ? label : null;
    this.currentSnapshotLabel = normalized;
    const mutateSnapshot = options?.mutateSnapshot !== false;
    if (!mutateSnapshot) {
      if (normalized && this.currentSnapshot) {
        this.currentSnapshot.meta = { ...(this.currentSnapshot.meta || {}), snapshotLabel: normalized };
      }
      return;
    }
    if (this.currentSnapshot) {
      this.currentSnapshot.meta = { ...(this.currentSnapshot.meta || {}) };
      if (normalized) {
        this.currentSnapshot.meta['snapshotLabel'] = normalized;
      } else {
        delete (this.currentSnapshot.meta as Record<string, any>)['snapshotLabel'];
      }
    }
  }

  public getCurrentSnapshotLabel(): string | null {
    return this.currentSnapshotLabel ?? this.currentSnapshot?.meta?.['snapshotLabel'] ?? null;
  }

  public ensureCurrentSnapshotLabel(): string | null {
    const existing = this.getCurrentSnapshotLabel();
    if (existing) {
      return existing;
    }
    const derived = this.buildDerivedSystemLabel();
    if (!derived) {
      return null;
    }
    const result = this.refreshCurrentSystemSnapshot(derived);
    return result.label;
  }

  public refreshCurrentSystemSnapshot(label?: string | null): { label: string | null; snapshot: SolarSystemSnapshot | null } {
    const resolvedLabel = (label && label.trim().length) ? label : this.getCurrentSnapshotLabel();
    if (!resolvedLabel || !this.runtimeSerializer) {
      return { label: resolvedLabel ?? null, snapshot: this.currentSnapshot ?? null };
    }
    const snapshot = this.runtimeSerializer.saveWithLabel(resolvedLabel, this);
    if (snapshot) {
      this.setCurrentSnapshotReference(snapshot, resolvedLabel);
      return { label: resolvedLabel, snapshot };
    }
    return { label: resolvedLabel, snapshot: this.currentSnapshot ?? null };
  }

  private buildDerivedSystemLabel(): string | null {
    const systemId = this.resolveSystemId() ?? 'system-unknown';
    return `system-${systemId}`;
  }

  private syncHumanDefaultSnapshotIfNeeded(effectiveLabel?: string | null): void {
    if (!this.runtimeSerializer) {
      return;
    }
    const systemId = this.resolveSystemId();
    if (systemId !== 'human-system') {
      return;
    }
    if (effectiveLabel === PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT) {
      return;
    }
    try {
      this.runtimeSerializer.saveWithLabel(PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT, this);
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to sync HUMAN_DEFAULT snapshot label', {
        systemId,
        effectiveLabel,
        error
      });
    }
  }

  private refreshRespawnAnchorSnapshot(
    sourceLabel?: string | null,
    sourceSnapshot?: SolarSystemSnapshot | null
  ): void {
    const anchor = this.gameState.getRespawnAnchor();
    const targetLabel = anchor?.snapshotLabel?.trim();
    if (!targetLabel) {
      return;
    }
    if (targetLabel === PORTAL_SNAPSHOT_LABELS.HUMAN_DEFAULT) {
      // The default fallback anchor is managed by syncHumanDefaultSnapshotIfNeeded; avoid overwriting it with
      // procedural systems when the player has no custom Sigillum.
      return;
    }
    if (!this.portalPersistenceService) {
      return;
    }

    const representativeSnapshot = sourceSnapshot ?? this.currentSnapshot ?? null;
    if (!this.shouldMirrorRespawnAnchor(anchor, representativeSnapshot)) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Respawn anchor snapshot mirror skipped (system mismatch)', {
        targetLabel,
        anchorSystemId: anchor?.systemId ?? null,
        anchorSnapshotId: anchor?.snapshotId ?? null,
        currentSystemId: this.resolveSystemId(representativeSnapshot),
        currentPersistentKey: this.resolvePersistentSystemKey(representativeSnapshot)
      });
      return;
    }

    const labelsMatch = Boolean(sourceLabel && sourceLabel === targetLabel);
    let snapshot: SolarSystemSnapshot | null = sourceSnapshot ?? null;

    if (!snapshot && sourceLabel) {
      snapshot = this.portalPersistenceService.get(sourceLabel) ?? null;
    }

    if (!snapshot && this.runtimeSerializer) {
      snapshot = this.runtimeSerializer.captureCurrentSnapshot(this);
    }

    if (snapshot && (!labelsMatch || !sourceLabel)) {
      const mirrored: SolarSystemSnapshot = {
        ...snapshot,
        meta: { ...(snapshot.meta || {}), snapshotLabel: targetLabel }
      };
      this.portalPersistenceService.save(targetLabel, mirrored);
      snapshot = mirrored;
    }

    if (!snapshot) {
      snapshot = this.portalPersistenceService.get(targetLabel) ?? null;
    }

    if (!snapshot) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Respawn anchor snapshot refresh skipped', {
        targetLabel,
        sourceLabel
      });
      return;
    }

    const snapshotId = resolveSnapshotId(snapshot);
    this.gameState.syncAnchorSnapshotMeta(targetLabel, { snapshotId });
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn anchor snapshot mirrored', {
      targetLabel,
      snapshotId,
      sourceLabel
    });
  }

  private shouldMirrorRespawnAnchor(anchor: RespawnAnchorMetadata | null, snapshot?: SolarSystemSnapshot | null): boolean {
    if (!anchor) {
      return false;
    }
    const anchorKeys: string[] = [];
    if (anchor.systemId && anchor.systemId.trim().length) {
      anchorKeys.push(anchor.systemId.trim());
    }
    if (anchor.snapshotId && anchor.snapshotId.trim().length) {
      anchorKeys.push(anchor.snapshotId.trim());
    }
    if (!anchorKeys.length) {
      return true;
    }
    const reference = snapshot ?? this.currentSnapshot ?? null;
    const candidateKeys: string[] = [];
    const persistentKey = this.resolvePersistentSystemKey(reference);
    if (persistentKey && persistentKey.trim().length) {
      candidateKeys.push(persistentKey.trim());
    }
    const systemId = this.resolveSystemId(reference);
    if (systemId && systemId.trim().length) {
      candidateKeys.push(systemId.trim());
    }
    if (!candidateKeys.length) {
      return false;
    }
    for (const key of anchorKeys) {
      if (candidateKeys.includes(key)) {
        return true;
      }
    }
    return false;
  }

  public persistActiveSystemState(
    context?: { reason?: string; portalId?: string; destinationPortalId?: string },
    labelOverride?: string | null
  ): string | null {
    try {
      this.persistCurrentSystemLesserBeings();
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.LESSER_BEINGS, 'Failed to persist roaming lesser beings before state capture', {
        ...(context || {}),
        error
      });
    }
    return this.persistActiveSystemSnapshot(context, labelOverride);
  }

  private persistActiveSystemSnapshot(
    context?: { reason?: string; portalId?: string; destinationPortalId?: string },
    labelOverride?: string | null
  ): string | null {
    const normalizedOverride = labelOverride?.trim() || null;
    let effectiveLabel: string | null = null;

    if (normalizedOverride) {
      this.setCurrentSnapshotLabel(normalizedOverride);
      effectiveLabel = normalizedOverride;
    } else {
      effectiveLabel = this.ensureCurrentSnapshotLabel();
    }

    if (!effectiveLabel) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Active system snapshot skipped: label unavailable', {
        ...(context || {}),
        labelOverride
      });
      return null;
    }

    const { label: refreshedLabel, snapshot: refreshedSnapshot } = this.refreshCurrentSystemSnapshot(effectiveLabel);
    if (!this.runtimeSerializer) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime serializer unavailable during active system snapshot persist', {
        ...(context || {}),
        label: effectiveLabel
      });
      return refreshedLabel;
    }

    this.logger.log(LogLevel.DEBUG, LogCategory.SOLAR_SYSTEM_GENERATION, 'Active system snapshot refreshed', {
      ...(context || {}),
      label: effectiveLabel
    });
    this.syncHumanDefaultSnapshotIfNeeded(effectiveLabel);
    this.refreshRespawnAnchorSnapshot(refreshedLabel ?? effectiveLabel, refreshedSnapshot ?? this.currentSnapshot ?? null);
    return refreshedLabel;
  }

  private snapshotActiveLesserBeings(): LesserBeingInstanceSnapshot[] {
    // Fuente única: lesser-being-state.codec.
    return this.lesserBeings
      .filter(being => being && being.active)
      .map(being => captureLesserBeingSnapshot(being));
  }

  private clearActiveLesserBeings(): void {
    if (!this.lesserBeings.length) {
      return;
    }
    const ids = this.lesserBeings.map(b => b.id);
    for (const id of ids) {
      this.unregisterLesserBeing(id);
    }
  }

  private persistCurrentSystemLesserBeings(): void {
    const systemKey = this.resolvePersistentSystemKey();
    if (!systemKey) {
      return;
    }
    const snapshots = this.snapshotActiveLesserBeings().filter(snap => !snap.hasLanded && !snap.landedPlanetId);
    this.gameState.saveLesserBeingSnapshots(systemKey, snapshots);
    if (snapshots.length) {
      this.logger.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Persisted roaming lesser beings for system', {
        systemId: systemKey,
        count: snapshots.length
      });
    }
    this.clearActiveLesserBeings();
  }

  private restorePersistedLesserBeings(snapshot: SolarSystemSnapshot): void {
    const systemKey = this.resolvePersistentSystemKey(snapshot);
    if (!systemKey) {
      return;
    }
    let stored = this.gameState.getLesserBeingSnapshots(systemKey);
    if (!stored.length) {
      const metaPayload = snapshot.meta?.['lesserBeingMemory'];
      if (Array.isArray(metaPayload) && metaPayload.length) {
        // Clonado profundo vía códec (fuente única).
        stored = (metaPayload as LesserBeingInstanceSnapshot[]).map(raw => cloneLesserBeingSnapshot(raw));
      }
    }
    if (!stored.length) {
      return;
    }
    const revived: string[] = [];
    for (const data of stored) {
      const being = this.lesserBeingSpawner?.reviveFromSnapshot(data);
      if (!being) {
        continue;
      }
      this.registerLesserBeing(being);
      revived.push(being.id);
    }
    this.gameState.clearLesserBeingSnapshots(systemKey);
    if (revived.length) {
      this.logger.log(LogLevel.INFO, LogCategory.LESSER_BEINGS, 'Restored persistent lesser beings for system', {
        systemId: systemKey,
        count: revived.length
      });
    }
  }

  public getPlayerShip(): Spaceship | null {
    return this.spaceship ?? null;
  }

  public getLesserBeingCombat(): LesserBeingCombatService | null {
    return this.lesserBeingCombat;
  }

  /** La tortuga estelar activa (o null). La usan los seres menores para reevaluar objetivo y atacarla. */
  public getSpaceTurtle(): SpaceTurtleObject | null {
    return this.spaceTurtleSystem.getRenderable();
  }

  /** Daño directo a la tortuga (lo aplican los seres menores; sus ataques normales van a la nave). Si la
   * mata un ser menor NO hay botín para el jugador (solo desaparece). */
  public damageSpaceTurtle(amount: number): void {
    const turtle = this.spaceTurtleSystem.getRenderable();
    if (!turtle || !turtle.isActive() || amount <= 0) {
      return;
    }
    if (turtle.healthCurrent - amount <= 0) {
      this.turtleKilledByBeing = true; // la destrucción la disparará el setter de healthCurrent
    }
    this.applyDamageToObject(turtle, amount);
  }

  public findNearestFreePlanet(position: Vector3): Planet | null {
    let nearest: Planet | null = null;
    let bestDistance = Infinity;
    for (const candidate of this.gameState.planets) {
      if (!(candidate instanceof Planet)) {
        continue;
      }
      const occupant = (candidate as any).lesserBeing as LesserBeing | null | undefined;
      const occupied = occupant && occupant !== LesserBeing.NONE;
      if (occupied) {
        continue;
      }
      const dx = candidate.position.x - position.x;
      const dy = candidate.position.y - position.y;
      const dz = candidate.position.z - position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < bestDistance) {
        bestDistance = dist;
        nearest = candidate;
      }
    }
    return nearest;
  }

  public getSystemBoundaryRadius(): number {
    const snapshotRadius = Number(this.currentSnapshot?.meta?.['systemRadius']);
    if (Number.isFinite(snapshotRadius) && snapshotRadius > 0) {
      return snapshotRadius;
    }
    const center = this.gameState.sun?.position ?? { x: 0, y: 0, z: 0 };
    let maxDistance = 0;
    for (const planet of this.gameState.planets) {
      const dx = planet.position.x - center.x;
      const dy = planet.position.y - center.y;
      const dz = planet.position.z - center.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > maxDistance) {
        maxDistance = dist;
      }
    }
    return Math.max(1500, maxDistance + 500);
  }

  public getCurrentSystemElderGod(): ElderGod {
    const configured = this.currentSnapshot?.meta?.['elderGod'];
    if (configured && (Object.values(ElderGod) as string[]).includes(configured)) {
      return configured as ElderGod;
    }
    return ElderGod.CTHULHU;
  }

  public peekPendingVoidJumpEncounter(): LesserBeingEncounterPlan | null {
    return this.pendingVoidJumpEncounter;
  }

  private setPendingVoidJumpEncounter(plan: LesserBeingEncounterPlan | null, evaluated: boolean): void {
    this.pendingVoidJumpEncounter = plan;
    this.pendingVoidJumpEncounterEvaluated = evaluated;
  }

  private consumePendingVoidJumpEncounter(): { plan: LesserBeingEncounterPlan | null; evaluated: boolean } {
    const snapshot = {
      plan: this.pendingVoidJumpEncounter,
      evaluated: this.pendingVoidJumpEncounterEvaluated,
    };
    this.pendingVoidJumpEncounter = null;
    this.pendingVoidJumpEncounterEvaluated = false;
    return snapshot;
  }

  public clearPendingVoidJumpEncounter(): void {
    this.pendingVoidJumpEncounter = null;
    this.pendingVoidJumpEncounterEvaluated = false;
  }

  public handleVoidJumpCompleted(): void {
    const { plan, evaluated } = this.consumePendingVoidJumpEncounter();
    if (evaluated) {
      this.lesserBeingSpawner?.onVoidJumpCompleted(plan ?? null);
      return;
    }
    this.lesserBeingSpawner?.onVoidJumpCompleted();
  }
  
  private getShipForwardVector(): Vector3 {
    const fallback = { x: 0, y: 0, z: -1 };
    if (!this.spaceship) {
      return fallback;
    }
    const forward = (this.spaceship as any).forwardDirection as Vector3 | undefined;
    if (!forward) {
      return fallback;
    }
    const len = Math.hypot(forward.x, forward.y, forward.z);
    if (!len || !isFinite(len)) {
      return fallback;
    }
    return {
      x: forward.x / len,
      y: forward.y / len,
      z: forward.z / len
    };
  }

  private getCameraForwardVector(): Vector3 {
    if (this.camera) {
      const dir = {
        x: this.camera.target.x - this.camera.position.x,
        y: this.camera.target.y - this.camera.position.y,
        z: this.camera.target.z - this.camera.position.z,
      };
      const len = Math.hypot(dir.x, dir.y, dir.z);
      if (len > 1e-5 && isFinite(len)) {
        return { x: dir.x / len, y: dir.y / len, z: dir.z / len };
      }
    }
    if (this.spaceship) {
      return this.getShipForwardVector();
    }
    return { x: 0, y: 0, z: 1 };
  }
  private resolveObjectType(obj: any): GameObjectType {
    if (!obj) {
      return GameObjectType.UNKNOWN;
    }
    try {
      if (obj instanceof LesserBeingBase) {
        return GameObjectType.LESSER_BEING;
      }
      if (obj instanceof Spaceship) {
        return GameObjectType.SPACESHIP;
      }
    } catch {}
    try {
      const go = obj as GameObject;
      if (typeof go.getType === 'function') {
        const type = go.getType();
        if (type) {
          return type;
        }
      }
    } catch {}
    try {
      if (typeof obj.getTargetType === 'function') {
        const legacyType = obj.getTargetType();
        if (legacyType !== undefined && legacyType !== null) {
          const resolved = targetTypeToGameObjectType(legacyType as TargetType);
          if (resolved) {
            return resolved;
          }
        }
      }
    } catch {}
    const ctorName = (obj?.constructor?.name || '').replace(/^_/, '');
    switch (ctorName) {
      case 'Asteroid':
        return GameObjectType.ASTEROID;
      case 'SuperAsteroid':
        return GameObjectType.SUPER_ASTEROID;
      case 'MegaAsteroid':
        return GameObjectType.MEGA_ASTEROID;
      case 'ClusterObject':
        return GameObjectType.CLUSTER;
      case 'Planet':
        return GameObjectType.PLANET;
      case 'RingedPlanet':
        return GameObjectType.RINGED_PLANET;
      case 'GaseousPlanet':
        return GameObjectType.GASEOUS_PLANET;
      case 'GiantPlanet':
        return GameObjectType.GIANT_PLANET;
      case 'DwarfPlanet':
        return GameObjectType.DWARF_PLANET;
      case 'Protoplanet':
        return GameObjectType.PROTOPLANET;
      case 'EarthSplitPlanet':
        return GameObjectType.EARTH_SPLIT_PLANET;
      case 'Sun':
        return GameObjectType.SUN;
      case 'Portal':
        return GameObjectType.PORTAL;
      case 'Spaceship':
        return GameObjectType.SPACESHIP;
      default:
        if (ctorName.includes('Asteroid')) {
          return GameObjectType.ASTEROID;
        }
        if (ctorName.includes('Planet')) {
          return GameObjectType.PLANET;
        }
        return GameObjectType.UNKNOWN;
    }
  }
}




