import { Injectable } from '@angular/core';
import { AudioEngineService } from '../services/audio/audio-engine.service';
import { MusicDirectorService } from '../services/audio/music-director.service';
import { WebGLService } from '../services/webgl.service';
import { ParticleEffectsService } from '../services/particle-effects.service';
import { GameObject } from './GameObject';
import { LesserBeingBase } from './game-objects/lesser-beings/lesser-being-base';
// Import all GameObjects from centralized barrel export
import {
  Spaceship, ThrusterState,
  Asteroid, SuperAsteroid, MegaAsteroid,
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
import { TextureManager } from './TextureManager';
import { HUDManager } from './hud/HUDManager';
import { ReticleManager } from './targeting';
import { AdaptiveTargetingIntegrator } from './targeting/v2/AdaptiveTargetingIntegrator';
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
import { SpellType, getSpellSanityCost } from './types/spell.types';
import { ScreenOverlayRenderer } from './rendering/ScreenOverlayRenderer';
import { InstancedAsteroidRenderer } from './rendering/InstancedAsteroidRenderer';
import { BillboardRenderer } from './rendering/BillboardRenderer';
import { TargetOutline2DRenderer } from './hud/TargetOutline2DRenderer';
import { LoggingService, LogCategory, LogLevel } from '../services/logging.service';
import { CollisionResponseService } from './services/physics/collision-response.service';
import { CollisionManagerService } from './services/physics/collision-manager.service';
import { PanelEventCoordinator } from './services/ui/panel-event-coordinator.service';
import { SpellIOCoordinator } from './services/spells/spell-io-coordinator.service';
import { GameStateStore } from '../services/game/game-state.store';
import { CargoHoldService } from '../services/game/cargo-hold.service';
import { CharacterProfileService, ExperienceEventType } from '../services/game/character-profile.service';
import { KeyBindingsService, GameAction } from '../services/key-bindings.service';
// Snapshot types for system swapping
import { SolarSystemSnapshot, PortalSnapshot } from './types/solar-system.types';
import { TargetType, ITargetable } from './types/targeting.types';
import { getDisplayLabelFromTargetType } from './types/game-object.types';
import {
  EquipmentSlot,
  InventorySnapshot,
  InventorySelection,
  InventoryPanelRegion,
  InventoryActionType
} from './types/inventory.types';
import { LandingApproachContext, LandingPlanetIntel, LandingStatus, LandingThreatState } from './types/landing.types';
import {
  LESSER_BEING_LABELS,
  PLANET_INHABITANT_LABELS,
  LesserBeing,
  PlanetInhabitants,
  ElderGod,
  LesserBeingInstanceSnapshot,
} from './types/cosmic-life.types';
import { PLANET_INTEL_STATUS } from './types/planet-intel.types';
import { GameObjectAnimosity } from './types/animosity.types';
import { CompassCountdownPayload } from './types/hud.types';
import { OrientationBasis, computeHeadingFromForward } from './targeting/compass-direction.util';
import { Vector3 } from '../types/game.types';
import { LesserBeingController } from './services/lesser-beings/lesser-being-controller';
import { LesserBeingSpawner } from './services/lesser-beings/lesser-being-spawner';
import { LesserBeingCombatService } from './services/lesser-beings/lesser-being-combat.service';

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
  // Defers a map selection when the user clicks immediately after opening the map
  // before the id->target mapping has been rebuilt in the first render pass.
  private pendingMapSelectId: string | null = null;
  
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
  private landingSequenceActive: boolean = false;
  private landingSequenceContext: LandingApproachContext | null = null;
  private landingTouchdownContext: LandingApproachContext | null = null;
  private landedShipAttachment: { planetId: string; offset: Vector3 } | null = null;
  private takeoffSequenceActive: boolean = false;
  private landingCandidatePlanetId: string | null = null;
  private landingCandidateStartMs: number | null = null;
  private readonly LANDING_DISTANCE_THRESHOLD = 50;
  private readonly LANDING_SPEED_THRESHOLD = 5;
  private readonly LANDING_ALIGNMENT_MAX_DOT = 0.5; // cos(60°) tolerance from perfect parallel
  private readonly LANDING_READY_HOLD_MS = 3000; // require 3s of stability before enabling landing
  private readonly LANDING_THREAT_RADIUS = 500;
  private readonly GLYPH_SCAN_RANGE = 500;
  private readonly PORTAL_CONCORD_RANGE = 500;
  // Central logger
  public readonly logger: LoggingService;
  public _targetDetailsCache: Record<string, any> = {};
  
  // HUD health update throttle (update every 250ms instead of every frame)
  private lastHealthUpdateTime: number = 0;
  private healthUpdateInterval: number = 250; // ms
  
  // Audio
  private audio: AudioEngineService | null = null;
  private music: MusicDirectorService | null = null;
  private thrusterCtl: ReturnType<AudioEngineService['createThrusterController']> | null = null;
  private audioUnlocked: boolean = false;
  private deathInProgress: boolean = false; // Prevents audio updates during death fade-out
  private audioSilencedForPause: boolean = false;
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
  private precastChantDurationMs: number | null = null;
  private sunExposureTimerMs: number = 0;
  private readonly SUN_DAMAGE_INTERVAL_MS: number = 5000;
  private readonly SUN_DAMAGE_THRESHOLD: number = 3000;
  private readonly SUN_DAMAGE_STEP_DISTANCE: number = 100;
  private readonly AGE_SECONDS_PER_DAY: number = 60; // 1 minuto de juego = 1 día
  private readonly SURVIVABILITY_DECAY_START_YEAR: number = 50;
  private ageTimerAccumulatorSec: number = 0;
  
  // Objetos del juego - MIGRATED TO GameStateStore
  // Acceso via this.gameState.spaceship, this.gameState.independentAsteroids, etc.
  public spaceship!: Spaceship; // Referencia pública para acceso externo
  
  // Asteroides efímeros (spawn aleatorio cerca de la nave)
  private ephemeralAsteroids: Asteroid[] = [];
  private ephemeralSpawnCounter: number = 0;
  private nextEphemeralCheckMs: number = 0; // próxima comprobación de spawn (cada 10s)
  
  // Debris asociados a un planeta (e.g., anillo de mega-asteroides de la Tierra dividida)
  public planetDebris: Map<string, Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }>> = new Map();
  // Track last applied snapshot id (debug)
  private lastAppliedSnapshotId: string | null = null;
  // Current active solar system snapshot (para acceder a configuración de debris efímero)
  private currentSnapshot: SolarSystemSnapshot | null = null;
  // Runtime portal traversal state
  private portalTraversalCooldownSec: number = 0; // prevents rapid re-entry
  private portalPrevDistances: Map<string, number> = new Map();
  // Previous ship position (for segment-plane intersection tests)
  private lastShipPos: { x: number; y: number; z: number } | null = null;
  private collapseClusterSerial: number = 0;
  // Collision damage cooldown tracking (object id -> next allowed timestamp ms)
  private collisionDamageCooldown: Map<string, number> = new Map();
  private collisionPairCooldown: Map<string, number> = new Map(); // Cooldown para pares de objetos (ship-obj)
  // Impact camera effect (red vignette) 0..1
  private impactVignetteLevel: number = 0;
  // Smooth lateral displacement after large-object collisions
  private collisionSlide: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number }; t: number; duration: number } | null = null;
  // Collision debug logging throttle
  private _lastCollisionLogSec: number = 0;
  private _lastIndependentLogTime: number = 0; // Throttle para logs de asteroides independientes

  private lesserBeings: LesserBeingBase[] = [];
  public lesserBeingController: LesserBeingController | null = null;
  private lesserBeingSpawner: LesserBeingSpawner | null = null;
  private lesserBeingCombat: LesserBeingCombatService | null = null;

  // Landing minigame removed
  
  // Configuración del mundo
  private readonly WORLD_SIZE = 50;
  private readonly ASTEROID_COUNT = 15;
  
  // Configuración de iluminación
  private lightDirection = new Float32Array([0.5, -0.8, 0.3]); // Luz desde arriba-derecha
  private lightColor = new Float32Array([1.0, 1.0, 0.9]);      // Luz blanca-amarillenta
  private ambientColor = new Float32Array([0.25, 0.25, 0.35]); // Ambiente más tenue para mayor contraste
  private ambientStrength = 0.25;
  
  // El efecto de propulsión ahora se maneja en ParticleEffectsService
  
  // Matrices auxiliares
  private normalMatrix = new Float32Array(16);
  // Debug: track potential attribute collisions/state
  private onceLoggedAttribCollision: boolean = false;
  private lastNormalAttribEnabled: boolean | null = null;
  // Feature flag: toggle instanced rendering for asteroids
  private readonly USE_INSTANCING = true;
  private instancedRenderer: InstancedAsteroidRenderer | null = null;
  private billboardRenderer: BillboardRenderer | null = null;
  // Tipos de target que NO deben ser descartados por culling distancia/frustum
  private readonly neverCullTypes = new Set([TargetType.PLANET]);

  // VAOs/VBOs cache for spaceship modules (to avoid per-frame buffer churn)
  private shipVAO: {
    nose: WebGLVertexArrayObject | null,
    body: WebGLVertexArrayObject | null,
    cockpit: WebGLVertexArrayObject | null,
    nozzle: WebGLVertexArrayObject | null,
    wings: WebGLVertexArrayObject | null,
    thruster: WebGLVertexArrayObject | null,
  } = { nose: null, body: null, cockpit: null, nozzle: null, wings: null, thruster: null };
  private shipBuffers: {
    nose?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    body?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    cockpit?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    nozzle?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    wings?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    thruster?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
  } = {};
  // Record the last applied dynamic scale for the thruster to refresh geometry when it changes
  private lastThrusterScale: number = -1;
  // Simple ephemeral text overlay (e.g., "ANIMATION NUMBER X.")
  private _placeholderOverlay: { tex: WebGLTexture; w: number; h: number; until: number } | null = null;

  // Timed spell: Double Phased Time Rite (speed buff)
  private speedRiteUntilMs: number | null = null;
  private speedRiteOriginalMax: number | null = null;
  private speedRiteOriginalAccel: number | null = null;
  private speedRiteOriginalDecel: number | null = null;
  private voidCocoonActiveUntilMs: number | null = null;
  private voidCocoonLastImpactMs: number = 0;
  private voidCocoonShieldStartMs: number = 0;
  private voidCocoonShieldGeometry: { vbo: WebGLBuffer | null; ibo: WebGLBuffer | null; indexCount: number } | null = null;
  private cachedSpeedRiteRemainingSec: number | null = null;

  // Material Disruption Rite beam animation
  private disruptionBeam: {
    active: boolean;
    startPos: { x: number; y: number; z: number };
    endPos: { x: number; y: number; z: number };
    target: any;
    startTime: number;
    duration: number; // milliseconds
  } | null = null;

  // Anchoring Pulse tether beam state
  private anchoringPulseBeam: {
    active: boolean;
    target: Asteroid | null;
    startPos: { x: number; y: number; z: number };
    endPos: { x: number; y: number; z: number };
    startTime: number;
    maxDuration: number;
    pullSpeed: number;
    captureRadius: number;
  } | null = null;

  // Void Kinesis conduit beam state
  private voidKinesisBeam: {
    active: boolean;
    startPos: { x: number; y: number; z: number };
    endPos: { x: number; y: number; z: number };
    target: Asteroid | null;
    startTime: number;
    maxDuration: number;
    shrinkRate: number;
    currentScalar: number;
    minScalar: number;
    baseScale: { x: number; y: number; z: number };
    baseSize: number;
    pixelScalar: number;
  } | null = null;

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
    audioEngine?: AudioEngineService,
    musicDirector?: MusicDirectorService
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
    this.registerDefaultAuxiliaryAbilities();

    this.lesserBeingController = new LesserBeingController(this);
    this.lesserBeingSpawner = new LesserBeingSpawner(this);
    this.lesserBeingCombat = new LesserBeingCombatService(this);
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
        const destSnap = this.portalPersistenceService.findByPortalId(destId);
        if (!destSnap) {
          this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Traversal attempted but destination snapshot not found', { from: portal.id, to: destId });
          // Soft cooldown to avoid instant re-entry loop
          this.portalTraversalCooldownSec = 2.0;
          continue;
        }
        // Fade out quickly (solid black opaque)
        try { this.overlayRenderer?.drawSolid([0,0,0], 1.0); } catch {}
        
        // Pausar consumo de void energy durante el traversal
        const wasEnergyPaused = this.spaceship.voidEnergyPaused;
        this.spaceship.voidEnergyPaused = true;
        
          // Persist current system lesser beings before leaving
          try { this.persistCurrentSystemLesserBeings(); } catch {}

          // Apply destination system
          this.applySolarSystemSnapshot(destSnap);
        // Find the destination portal in the new scene
        const destPortal = this.gameState.findPortalById(destId);
        if (destPortal) {
          // Runtime traversal behavior: preserve ship velocity and orientation.
          // Reposition the ship at the center of the destination portal (emerging from it)
          this.spaceship.position.x = destPortal.position.x;
          this.spaceship.position.y = destPortal.position.y;
          this.spaceship.position.z = destPortal.position.z;
          // Do NOT change look direction or speeds; cooldown prevents immediate re-entry bounce
          // Optionally nudge slightly along current forward to avoid z-fighting at exact center
          try {
            const fwd = this.normalize({ ...this.spaceship.forwardDirection });
            const eps = 0.01;
            this.spaceship.position.x += fwd.x * eps;
            this.spaceship.position.y += fwd.y * eps;
            this.spaceship.position.z += fwd.z * eps;
          } catch {}
        }
        
        // Reactivar consumo de void energy tras el traversal
        this.spaceship.voidEnergyPaused = wasEnergyPaused;
        
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
    const status = this.computeLandingStatus();
    this.landingStatus = status;
    this.gameState.setLandingStatus(status);

    const threat = this.computeLandingThreat(availableTargets);
    this.landingThreat = threat;
    this.gameState.setLandingThreat(threat);

    try {
      this.hudManager?.setLandingIndicators({
        landingReady: status.ready,
        threatActive: threat.active
      });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Landing indicators update failed', e);
    }
  }

  private computeLandingStatus(): LandingStatus {
    if (!this.spaceship || !this.gameState.planets.length) {
      this.landingCandidateStartMs = null;
      this.landingCandidatePlanetId = null;
      return { ready: false, context: null };
    }

    const shipPos = this.spaceship.position;
    let bestPlanet: Planet | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestRadius = 0;

    for (const planet of this.gameState.planets) {
      const radius = Math.max(1, planet.scale?.x ?? planet.scale?.y ?? planet.scale?.z ?? 0);
      const dx = planet.position.x - shipPos.x;
      const dy = planet.position.y - shipPos.y;
      const dz = planet.position.z - shipPos.z;
      const centerDist = Math.hypot(dx, dy, dz);
      const surface = centerDist - radius;
      if (surface < bestDistance) {
        bestPlanet = planet;
        bestDistance = surface;
        bestRadius = radius;
      }
    }

    if (!bestPlanet) {
      this.landingCandidateStartMs = null;
      this.landingCandidatePlanetId = null;
      return { ready: false, context: null };
    }

    const planet = bestPlanet;
    const dx = shipPos.x - planet.position.x;
    const dy = shipPos.y - planet.position.y;
    const dz = shipPos.z - planet.position.z;
    const centerDist = Math.hypot(dx, dy, dz);
    const surfaceDistance = centerDist - bestRadius;
    const normal = centerDist > 0 ? this.normalize({ x: dx, y: dy, z: dz }) : { x: 0, y: 1, z: 0 };
    const surfacePoint = {
      x: planet.position.x + normal.x * bestRadius,
      y: planet.position.y + normal.y * bestRadius,
      z: planet.position.z + normal.z * bestRadius
    };
    const forward = this.normalize({ ...this.spaceship.forwardDirection });
    const alignmentDot = forward.x * normal.x + forward.y * normal.y + forward.z * normal.z;
    const relativeSpeed = Math.abs(this.spaceship.currentSpeed);

    const meetsDistance = surfaceDistance <= this.LANDING_DISTANCE_THRESHOLD;
    const meetsSpeed = relativeSpeed <= this.LANDING_SPEED_THRESHOLD;
    const meetsAlignment = Math.abs(alignmentDot) <= this.LANDING_ALIGNMENT_MAX_DOT;
    const meetsAll = meetsDistance && meetsSpeed && meetsAlignment;

    const now = performance.now();
    if (!meetsAll) {
      this.landingCandidateStartMs = null;
      this.landingCandidatePlanetId = null;
    } else {
      if (this.landingCandidatePlanetId !== planet.id) {
        this.landingCandidatePlanetId = planet.id;
        this.landingCandidateStartMs = now;
      } else if (this.landingCandidateStartMs == null) {
        this.landingCandidateStartMs = now;
      }
    }

    const ready = Boolean(
      meetsAll &&
      this.landingCandidateStartMs !== null &&
      now - this.landingCandidateStartMs >= this.LANDING_READY_HOLD_MS
    );

    const context: LandingStatus['context'] = {
      planetId: planet.id,
      planetName: planet.getDisplayName(),
      planetType: planet.planetType,
      radius: bestRadius,
      distanceToSurface: surfaceDistance,
      relativeSpeed,
      alignmentDot,
      surfaceNormal: normal,
      surfacePoint,
      planetCenter: { x: planet.position.x, y: planet.position.y, z: planet.position.z },
      lastUpdatedMs: now
    };

    return { ready, context };
  }

  private computeLandingThreat(availableTargets: ITargetable[]): LandingThreatState {
    if (!this.spaceship) {
      return { active: false, reasons: [] };
    }

    let enemyNearby = false;
    try {
      const shipPos = this.spaceship.position;
      enemyNearby = availableTargets.some(target => {
        if (!target || !target.position) {
          return false;
        }
        const animosity = (target as any)?.animosity as GameObjectAnimosity | undefined;
        if (animosity !== GameObjectAnimosity.ENEMY) {
          return false;
        }
        const dx = target.position.x - shipPos.x;
        const dy = target.position.y - shipPos.y;
        const dz = target.position.z - shipPos.z;
        const dist = Math.hypot(dx, dy, dz);
        return dist <= this.LANDING_THREAT_RADIUS;
      });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'Landing threat proximity check failed', e);
    }

    return enemyNearby
      ? { active: true, reasons: ['Enemy nearby'] }
      : { active: false, reasons: [] };
  }

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
      try { this.showPlaceholderText('AMENAZA DETECTADA - ESTABILIZA ANTES DE ATERRIZAR', 2200); } catch {}
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
      this.hudManager?.addMarqueeMessage(label);
    } catch {}
  }

  public notifyLandingSequenceFinished(outcome: 'landed' | 'aborted', context?: LandingApproachContext | null): void {
    this.landingSequenceActive = false;
    this.landingSequenceContext = null;
    this.landingCandidatePlanetId = null;
    this.landingCandidateStartMs = null;
    const resetStatus: LandingStatus = { ready: false, context: null };
    this.landingStatus = resetStatus;
    try { this.gameState.setLandingStatus(resetStatus); } catch {}
    if (outcome === 'landed' && context) {
      this.setLandingDamageSuppressed(true, 'landing-touchdown');
      this.handleLandingTouchdown(context);
    } else {
      this.clearLandedShipAttachment();
      this.landingTouchdownContext = null;
      this.setLandingDamageSuppressed(false, 'landing-aborted');
      try { this.showPlaceholderText('ATERRIZAJE CANCELADO', 2000); } catch {}
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing sequence finished', { outcome });
  }

  public notifyTakeoffSequenceStarted(context: LandingApproachContext): void {
    this.takeoffSequenceActive = true;
    this.setLandingDamageSuppressed(true, 'takeoff-sequence-start');
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff sequence initiated', {
      planetId: context.planetId,
      planetName: context.planetName
    });
    try {
      const label = context.planetName ? `TAKEOFF: ${context.planetName}` : 'TAKEOFF SEQUENCE';
      this.hudManager?.addMarqueeMessage(label);
    } catch {}
  }

  public notifyTakeoffSequenceFinished(outcome: 'completed' | 'aborted', context?: LandingApproachContext | null): void {
    this.takeoffSequenceActive = false;
    const resolvedContext = context ?? this.landingTouchdownContext;
    if (outcome === 'completed') {
      try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
      this.landingTouchdownContext = null;
      this.clearLandedShipAttachment();
      this.collisionsDisabled = false;
      this.setLandingDamageSuppressed(false, 'takeoff-completed');
      try { this.showPlaceholderText('DESPEGUE COMPLETADO', 2000); } catch {}
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Takeoff sequence completed');
    } else {
      this.landingTouchdownContext = resolvedContext || null;
      // Stay invulnerable to terrain until another attempt or manual exit
      this.collisionsDisabled = true;
      this.setLandingDamageSuppressed(true, 'takeoff-aborted');
      try { this.showPlaceholderText('DESPEGUE ABORTADO', 2200); } catch {}
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff sequence aborted');
    }
  }

  private handleLandingTouchdown(context: LandingApproachContext): void {
    const enrichedContext = this.enrichLandingContext(context);
    this.parkShipAtPlanetCore(enrichedContext);
    this.landingTouchdownContext = enrichedContext;
    this.registerPlanetLandingVisit(context.planetId);
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Landing touchdown registered', {
      planetId: context.planetId,
      planetName: context.planetName
    });
    try {
      const gameComponent = (globalThis as any).GameComponentInstance;
      if (gameComponent && typeof gameComponent.openLandingPanel === 'function') {
        gameComponent.openLandingPanel(enrichedContext);
        return;
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Landing panel open failed', error);
    }
    const label = context.planetName ? `Aterrizaje completado: ${context.planetName}` : 'Aterrizaje completado';
    try { this.showPlaceholderText(`${label} (panel no disponible)`, 2200); } catch {}
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

  public startTakeoffSequence(): boolean {
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
    if (!this.animationManager.startTakeoffSequence(this, this.landingTouchdownContext)) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Takeoff animation rejected (busy)');
      try { this.showPlaceholderText('DESPEGUE BLOQUEADO - SISTEMA OCUPADO', 2200); } catch {}
      return false;
    }
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

  private collectActiveSuns(): Sun[] {
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
    const safeNormal = this.normalize(normal);
    const safeDistance = Math.max(radius * 2, 800);
    const safePosition = {
      x: anchor.x + safeNormal.x * safeDistance,
      y: anchor.y + safeNormal.y * safeDistance,
      z: anchor.z + safeNormal.z * safeDistance,
    };
    this.repositionShipAfterCollapse(safePosition);
    this.landingTouchdownContext = null;
    this.clearLandedShipAttachment();
    this.landingSequenceActive = false;
    this.takeoffSequenceActive = false;
    this.landingCandidatePlanetId = null;
    this.landingCandidateStartMs = null;
    this.collisionsDisabled = false;
    this.setLandingDamageSuppressed(false, 'planet-collapse');
    try { this.gameState.setActiveLandingPlanet?.(null); } catch {}
    const resetStatus: LandingStatus = { ready: false, context: null };
    this.landingStatus = resetStatus;
    try { this.gameState.setLandingStatus(resetStatus); } catch {}
    this.closeLandingPanelUI('planet-collapse');
    try { this.showPlaceholderText('PLANETA COLAPSADO', 2500); } catch {}
  }

  private repositionShipAfterCollapse(position: Vector3): void {
    this.placeShipAtPosition(position);
  }

  private parkShipAtPlanetCore(context: LandingApproachContext): void {
    const anchor = this.resolvePlanetCenterFromContext(context);
    if (!anchor) {
      this.clearLandedShipAttachment();
      return;
    }
    this.placeShipAtPosition(anchor);
    this.bindShipToPlanet(context, anchor);
  }

  private resolvePlanetCenterFromContext(context: LandingApproachContext): Vector3 | null {
    if (context.planetCenter) {
      return { ...context.planetCenter };
    }
    if (!context.surfacePoint || !context.surfaceNormal) {
      return null;
    }
    const normal = this.normalize(context.surfaceNormal);
    return {
      x: context.surfacePoint.x - normal.x * context.radius,
      y: context.surfacePoint.y - normal.y * context.radius,
      z: context.surfacePoint.z - normal.z * context.radius
    };
  }

  private placeShipAtPosition(position: Vector3): void {
    if (!this.spaceship) {
      return;
    }
    this.spaceship.position = { ...position };
    this.spaceship.velocity = { x: 0, y: 0, z: 0 };
    this.spaceship.angularVelocity = { x: 0, y: 0, z: 0 };
    this.spaceship.currentSpeed = 0;
    this.spaceship.targetSpeed = 0;
    this.spaceship.isThrusting = false;
    this.spaceship.thrusterState = ThrusterState.IDLE;
    this.spaceship.updateModelMatrix();
    if (this.spaceship.boundingSphere) {
      this.spaceship.boundingSphere.center = { ...this.spaceship.position };
    }
    this.lastShipPos = { ...this.spaceship.position };
  }

  private bindShipToPlanet(context: LandingApproachContext, anchor: Vector3): void {
    if (!context.planetId) {
      this.clearLandedShipAttachment();
      return;
    }
    const planet = this.gameState.findPlanetById(context.planetId);
    if (!planet) {
      this.clearLandedShipAttachment();
      return;
    }
    this.landedShipAttachment = {
      planetId: planet.id,
      offset: {
        x: anchor.x - planet.position.x,
        y: anchor.y - planet.position.y,
        z: anchor.z - planet.position.z
      }
    };
  }

  private maintainLandedShipAttachment(): void {
    if (!this.landedShipAttachment || !this.landingTouchdownContext) {
      return;
    }
    if (this.landingSequenceActive || this.takeoffSequenceActive || !this.spaceship) {
      return;
    }
    const planet = this.gameState.findPlanetById(this.landedShipAttachment.planetId);
    if (!planet) {
      return;
    }
    const desired = {
      x: planet.position.x + this.landedShipAttachment.offset.x,
      y: planet.position.y + this.landedShipAttachment.offset.y,
      z: planet.position.z + this.landedShipAttachment.offset.z
    };
    const dx = desired.x - this.spaceship.position.x;
    const dy = desired.y - this.spaceship.position.y;
    const dz = desired.z - this.spaceship.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < 1e-4) {
      return;
    }
    this.spaceship.position.x = desired.x;
    this.spaceship.position.y = desired.y;
    this.spaceship.position.z = desired.z;
    this.spaceship.velocity = { x: 0, y: 0, z: 0 };
    this.spaceship.angularVelocity = { x: 0, y: 0, z: 0 };
    this.spaceship.currentSpeed = 0;
    this.spaceship.targetSpeed = 0;
    this.spaceship.updateModelMatrix();
    if (this.spaceship.boundingSphere) {
      this.spaceship.boundingSphere.center = { ...this.spaceship.position };
    }
    this.lastShipPos = { ...this.spaceship.position };
  }

  private clearLandedShipAttachment(): void {
    this.landedShipAttachment = null;
  }

  private spawnCollapseDebrisClusters(planetId: string, center: Vector3, radius: number, clusterCount: number): void {
    if (!this.asteroidClusterService) {
      return;
    }
    const gl = this.gl as WebGL2RenderingContext | null;
    for (let i = 0; i < clusterCount; i++) {
      const clusterId = `collapse-${planetId}-${++this.collapseClusterSerial}-${i}`;
      const clusterCenter = this.randomPointInShell(center, radius * 0.2, radius * 1.25);
      const direction = this.normalize({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
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
    const dir = this.normalize({ x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 });
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
    try {
      const gameComponent = (globalThis as any).GameComponentInstance;
      if (!gameComponent) {
        return;
      }
      if (typeof gameComponent.forceCloseLandingPanel === 'function') {
        gameComponent.forceCloseLandingPanel(reason);
      } else if (typeof gameComponent.onLandingStay === 'function') {
        gameComponent.onLandingStay();
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to close landing panel after collapse', { reason, error });
    }
  }

  private getSunRadius(sun: Sun): number {
    const scaleRadius = Number.isFinite((sun as any)?.scale?.x) ? (sun as any).scale.x : null;
    const explicitRadius = Number.isFinite((sun as any)?.radius) ? (sun as any).radius : null;
    const radius = scaleRadius ?? explicitRadius ?? 0;
    return Math.max(0, radius);
  }

  private getSunsWithinDistance(maxDistance: number): Array<{ sun: Sun; distanceToCenter: number; surfaceDistance: number }> {
    if (!this.spaceship) {
      return [];
    }
    const shipPos = this.spaceship.position;
    const damaging: Array<{ sun: Sun; distanceToCenter: number; surfaceDistance: number }> = [];
    for (const sun of this.collectActiveSuns()) {
      const dx = sun.position.x - shipPos.x;
      const dy = sun.position.y - shipPos.y;
      const dz = sun.position.z - shipPos.z;
      const distanceToCenter = Math.hypot(dx, dy, dz);
      const surfaceDistance = Math.max(0, distanceToCenter - this.getSunRadius(sun));
      if (surfaceDistance <= maxDistance) {
        damaging.push({ sun, distanceToCenter, surfaceDistance });
      }
    }
    return damaging.sort((a, b) => a.surfaceDistance - b.surfaceDistance);
  }

  private handleSunProximityDamage(deltaTime: number): void {
    if (!this.spaceship || this.isLandingDamageSuppressed()) {
      this.sunExposureTimerMs = 0;
      return;
    }
    const nearby = this.getSunsWithinDistance(this.SUN_DAMAGE_THRESHOLD);
    if (!nearby.length) {
      this.sunExposureTimerMs = 0;
      return;
    }

    this.sunExposureTimerMs += deltaTime * 1000;
    while (this.sunExposureTimerMs >= this.SUN_DAMAGE_INTERVAL_MS) {
      this.sunExposureTimerMs -= this.SUN_DAMAGE_INTERVAL_MS;
      this.applySunDamageTick();
      if (!this.spaceship || this.spaceship.healthCurrent <= 0) {
        break;
      }
      const stillNear = this.getSunsWithinDistance(this.SUN_DAMAGE_THRESHOLD);
      if (!stillNear.length) {
        this.sunExposureTimerMs = 0;
        break;
      }
    }
  }

  private applySunDamageTick(): void {
    if (!this.spaceship) {
      return;
    }
    const damaging = this.getSunsWithinDistance(this.SUN_DAMAGE_THRESHOLD);
    if (!damaging.length) {
      return;
    }

    let totalDamage = 0;
    for (const entry of damaging) {
      const closeness = Math.max(0, this.SUN_DAMAGE_THRESHOLD - entry.surfaceDistance);
      const bonus = Math.floor(closeness / this.SUN_DAMAGE_STEP_DISTANCE);
      totalDamage += 1 + Math.max(0, bonus);
    }

    if (totalDamage <= 0) {
      return;
    }

    const previousHealth = this.spaceship.healthCurrent;
    this.spaceship.healthCurrent = Math.max(0, this.spaceship.healthCurrent - totalDamage);

    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Sun proximity damage applied', {
      totalDamage,
      damagingSuns: damaging.length,
      surfaceDistances: damaging.map(d => Math.round(d.surfaceDistance)),
      centerDistances: damaging.map(d => Math.round(d.distanceToCenter)),
      healthBefore: previousHealth,
      healthAfter: this.spaceship.healthCurrent,
    });

    try {
      this.hudManager?.addMarqueeMessage?.(
        `Radiación solar: -${totalDamage}u (${this.spaceship.healthCurrent}/${this.spaceship.healthMax})`
      );
    } catch {}

    const vignetteBoost = Math.min(0.4, totalDamage / 25);
    this.impactVignetteLevel = Math.min(1, this.impactVignetteLevel + vignetteBoost);
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
    this.grimoirePanel = new GrimoirePanel(this.gl, this.audio, 1024, 1024);
    this.grimoirePanel.setEnabled(false);
    try {
      const savedLayout = this.gameState.getGrimoireGlyphLayoutSnapshot();
      this.grimoirePanel.applyNormalizedGlyphLayout(savedLayout);
    } catch (e) {
      this.logger.log(LogLevel.DEBUG, LogCategory.HUD, 'No se pudo aplicar layout guardado del grimorio', e);
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
      const aspect = canvas.width / canvas.height;
      this.camera = new Camera(aspect);

      // Instanced renderer setup (optional)
      if (this.USE_INSTANCING) {
        this.instancedRenderer = new InstancedAsteroidRenderer(this.gl, this.shaderManager);
      }
  // Billboard renderer for distant impostors (planets, etc.)
      this.billboardRenderer = new BillboardRenderer(this.gl);
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

      // Configure targeting distance origin to use the spaceship center (so distances are reported from the ship)
      if (this.reticleManager && this.spaceship) {
        this.reticleManager.setDistanceOriginProvider(() => ({ ...this.spaceship.position }));
      }
      
      // Configure adaptive targeting distance origin
      if (this.adaptiveTargeting && this.spaceship) {
        this.adaptiveTargeting.setDistanceOriginProvider(() => ({ ...this.spaceship.position }));
      }

      // Setup panel event coordinator with all callbacks
      this.setupPanelEventCoordinator();

  // Registro de targets se realiza al crear los clusters (initializeAllBuffers)

      // Integration tests removed

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
    this.currentSnapshot = snapshot;
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

    // Planets
    const pickColor = (k?: string): any => {
      const x = String(k || '').toLowerCase();
      if (x === 'ringed') return 'gris';
      if (x === 'gaseous') return 'azul_hielo';
      if (x === 'giant') return 'marron';
      if (x === 'dwarf') return 'gris';
      if (x === 'protoplanet') return 'gris';
      if (x === 'terrestrial' || x === 'rocky') return 'azul_marino';
      return 'marron';
    };
    for (const p of snapshot.planets) {
      try {
        const kind = String(p.kind || '').toLowerCase();
        // Prefer explicit snapshot color when provided; else pick by kind
        const snapshotColor = (p as any).baseColorName as any;
        const color: any = snapshotColor || pickColor(kind);
        const pos = { ...p.position };
        let planetObj: Planet;
        // Special cases for handcrafted system
        if (p.id === 'planet-earth') {
          // Force canonical Earth base color 'azul_marino' to keep split hemisphere tint/texture
          const earthColor: any = (snapshotColor || 'azul_marino');
          const created = EarthSplitPlanet.createWithDebris('planet-earth', earthColor, p.radius || 400, pos, 150, 320);
          planetObj = created.planet as Planet;
          // Register debris locals to follow Earth spin in update loop
          const arr: Array<{ obj: any; local: { x: number; y: number; z: number } }> = [];
          for (const m of created.debris) {
            arr.push({ obj: m, local: { x: m.position.x - pos.x, y: m.position.y - pos.y, z: m.position.z - pos.z } });
          }
          this.planetDebris.set('planet-earth', arr as any);
          // Apply canonical Earth axial tilt (23.5°) and spin to drive debris rotation
          try { (planetObj as any).axialTiltRad = (23.5 * Math.PI) / 180; } catch {}
          try { (planetObj as any).angularVelocity = (planetObj as any).angularVelocity || { x: 0, y: 0, z: 0 }; } catch {}
          (planetObj as any).angularVelocity.y = (2 * Math.PI) / 300; // ~1 rev / 5 min
        } else {
          switch (kind) {
            case 'ringed': planetObj = new RingedPlanet(p.id, color, p.radius, pos); break;
            case 'gaseous': planetObj = new GaseousPlanet(p.id, color, p.radius, pos); break;
            case 'giant': planetObj = new GiantPlanet(p.id, color, p.radius, pos); break;
            case 'dwarf': planetObj = new DwarfPlanet(p.id, color, p.radius, pos); break;
            case 'protoplanet': planetObj = new Protoplanet(p.id, color, p.radius, pos); break;
            case 'terrestrial': planetObj = new Planet(p.id, color, p.radius, pos); break;
            case 'rocky': planetObj = new Planet(p.id, color, p.radius, pos); break;
            default: planetObj = new Planet(p.id, color, p.radius, pos); break;
          }
        }
        if (p.name) planetObj.customName = p.name;
        if (typeof p.probabilityOfLifePct === 'number') (planetObj as any).probabilityOfLifePct = p.probabilityOfLifePct;
        planetObj.assignInhabitantsFromProbability();
        if (typeof p.inhabitants === 'string') {
          planetObj.inhabitants = p.inhabitants as PlanetInhabitants;
        }
        if (typeof p.lesserBeing !== 'undefined') {
          planetObj.lesserBeing = (p.lesserBeing as LesserBeing | null) ?? null;
        }
        if (typeof p.hasArtifact === 'boolean') {
          planetObj.hasArtifact = p.hasArtifact;
        }
        if (typeof p.artifactIntelStatus === 'string') {
          planetObj.artifactIntelStatus = p.artifactIntelStatus as any;
        }
        if (typeof p.civilizationIntelStatus === 'string') {
          planetObj.civilizationIntelStatus = p.civilizationIntelStatus as any;
        }
        if (typeof p.lesserBeingIntelStatus === 'string') {
          planetObj.lesserBeingIntelStatus = p.lesserBeingIntelStatus as any;
        }
        if (typeof p.pendingMission !== 'undefined') {
          planetObj.pendingMission = p.pendingMission as any;
        }
        if (p.resourceStock) {
          planetObj.resourceStock = { ...planetObj.resourceStock, ...p.resourceStock };
        }
        if (typeof p.visited === 'boolean') {
          planetObj.visited = p.visited;
        }
        if (typeof p.lifeScanned === 'boolean') {
          planetObj.lifeScanned = p.lifeScanned;
        }
        if (typeof p.creatureScanned === 'boolean') {
          planetObj.creatureScanned = p.creatureScanned;
        }
        if (typeof p.animosity === 'string' && typeof (planetObj as any).setAnimosity === 'function') {
          try { (planetObj as any).setAnimosity(p.animosity); } catch {}
        }
        if (p.orbit) {
          planetObj.orbitCenter = { ...(p.orbit.center || { x: 0, y: 0, z: 0 }) } as any;
          planetObj.semiMajor = p.orbit.semiMajor;
          planetObj.semiMinor = p.orbit.semiMinor;
          planetObj.orbitOrientation = p.orbit.orientation || 0;
          planetObj.orbitAngle = p.orbit.angle || 0;
          planetObj.orbitAngularSpeed = p.orbit.angularSpeed || planetObj.orbitAngularSpeed;
          (planetObj as any).orbitNormal = { ...(p.orbit.normal || { x: 0, y: 1, z: 0 }) };
          (planetObj as any).orbitU = { ...(p.orbit.u || { x: 1, y: 0, z: 0 }) };
        }
        // Preserve serialized void-mass metadata so handcrafted/procedural systems stay in sync.
        const hasVoidMassFields = typeof p.voidMassCapacity === 'number' || typeof p.voidMassRemaining === 'number';
        if (hasVoidMassFields) {
          const capacity = Number.isFinite(p.voidMassCapacity) ? Math.max(0, p.voidMassCapacity!)
            : Math.max(0, Number.isFinite(p.voidMassRemaining) ? p.voidMassRemaining! : 0);
          const remaining = Number.isFinite(p.voidMassRemaining) ? Math.max(0, p.voidMassRemaining!) : undefined;
          planetObj.setVoidMassLevels(capacity, remaining);
        } else if (typeof p.hasVoidMass === 'boolean' && p.hasVoidMass) {
          const fallbackCapacity = Math.max(1, Math.round((planetObj.initialRadius || 100) * 0.25));
          planetObj.setVoidMassLevels(fallbackCapacity, fallbackCapacity);
        }
        if (typeof p.voidMassIntelStatus !== 'undefined') {
          planetObj.voidMassIntelStatus = p.voidMassIntelStatus;
        }
        // Ensure a sensible default spin so debris belts rotate with their parent
        try {
          const kindSpin = ((): number => {
            if (p.id === 'planet-saturn' || kind === 'ringed') return (2 * Math.PI) / 500; // a bit slower
            if (kind === 'gaseous' || kind === 'giant') return (2 * Math.PI) / 900; // slow giants
            return (2 * Math.PI) / 600; // default
          })();
          (planetObj as any).angularVelocity = (planetObj as any).angularVelocity || { x: 0, y: 0, z: 0 };
          if (!Number.isFinite((planetObj as any).angularVelocity.y) || (planetObj as any).angularVelocity.y === 0) {
            (planetObj as any).angularVelocity.y = kindSpin;
          }
          // Apply a reasonable axial tilt to ringed planets to incline the ring
          if (p.id === 'planet-saturn' || kind === 'ringed') {
            (planetObj as any).axialTiltRad = (26.7 * Math.PI) / 180;
          }
        } catch {}
        if (gl && !planetObj.vertexBuffer) planetObj.initBuffers(gl as WebGL2RenderingContext);
        this.gameState.planets.push(planetObj);
        try { this.gameState.syncPlanetIntelFromPlanet?.(planetObj); } catch {}
        // Register reactive destruction callback
        this.registerDestructionCallback(planetObj);
        // Saturn debris belt similar to legacy if available
        if (p.id === 'planet-saturn') {
          try {
            const belt = this.createDebrisBeltForPlanet(planetObj, 280, { spreadScale: 0.45, yScale: 0.7 });
            this.planetDebris.set(planetObj.id, belt as any);
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
          const name = (o as any)?.constructor?.name;
            if (name === 'SuperAsteroid') supers.push(o as any); else normals.push(o as any);
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
        const portal = new Portal(p.id, { ...p.position }, p.radius, this.logger);
        portal.linkedPortalId = p.linkedPortalId;
        portal.applyEyeState(p.eyeState);
        if (p.animosity) {
          try { portal.setAnimosity(p.animosity); } catch {}
        }
        if (typeof p.concordSealActive === 'boolean') {
          portal.setConcordSealState(
            p.concordSealActive,
            p.preventsLesserIncursions ?? portal.preventsLesserIncursions,
            p.concordSealActivatedAt,
            { immediateStrength: true }
          );
        }
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
          const size = d.size || 1;
          const obj = new MegaAsteroid(d.id, pos, size);
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
      
      this.logger.log(LogLevel.INFO, LogCategory.GAME_INITIALIZATION, 'Spaceship created successfully', { position: this.spaceship.position });
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
        this.thrusterCtl = this.audio.createThrusterController('sfx_thruster');
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
    
    // 1) Crear y registrar planetas primero usando snapshot humano si disponible
    if (this.humanSolarSystemService) {
      try {
        const snap = this.humanSolarSystemService.createSnapshot();
        this.applySolarSystemSnapshot(snap);
        this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Applied human solar system snapshot during buffer init', { id: snap.id });
      } catch (e) {
        this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed human snapshot; falling back', e);
        this.createPlanets();
      }
    } else {
      this.createPlanets();
    }
    this.gameState.planets.forEach(p => p.initBuffers(this.gl!));
    this.targetCatalog.register(TargetType.PLANET, this.gameState.planets as unknown as ITargetable[]);

    // 2) Construir un rastro de clusters a lo largo de la elipse orbital de la Tierra
    const earth = this.gameState.findPlanetById('planet-earth');
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

  /**
   * Detiene el juego
   */
  public stop(): void {
    this.isRunning = false;
  this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'GameEngine detenido');
  }

  /**
   * Reubica la nave y traslada todos los clusters para comenzar a ~distFromSurface del Sol
   * en una dirección aleatoria. Mantiene offsets relativos de miembros en cada clúster.
   */
  private randomizeStartNearSun(distFromSurface: number = 5000): void {
    if (!this.gameState.sun) return;
    const sunCenter = this.gameState.sun.position;
    const sunRadius = this.gameState.sun.scale.x; // radio en this.scale
    // Vector unitario aleatorio uniforme en la esfera
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const z = 2 * v - 1; // [-1,1]
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const dir = { x: r * Math.cos(theta), y: z, z: r * Math.sin(theta) };
    const spawnDist = sunRadius + Math.max(0, distFromSurface);
    const startPos = {
      x: sunCenter.x + dir.x * spawnDist,
      y: sunCenter.y + dir.y * spawnDist,
      z: sunCenter.z + dir.z * spawnDist,
    };

    // Mover nave
    this.spaceship.position.x = startPos.x;
    this.spaceship.position.y = startPos.y;
    this.spaceship.position.z = startPos.z;
    this.spaceship.updateModelMatrix();

    // Trasladar clusters completos para que queden alrededor de la nueva zona de inicio
    const clusters = this.asteroidClusterService.getClusters();
    if (clusters.length) {
      // Calcular centroide actual de clusters
      let cx = 0, cy = 0, cz = 0;
      for (const c of clusters) { cx += c.center.x; cy += c.center.y; cz += c.center.z; }
      cx /= clusters.length; cy /= clusters.length; cz /= clusters.length;
      const shift = { x: startPos.x - cx, y: startPos.y - cy, z: startPos.z - cz };
      for (const c of clusters) {
        // Mover centro
        c.center.x += shift.x;
        c.center.y += shift.y;
        c.center.z += shift.z;
        // Reposicionar miembros como center + offset persistente y actualizar matrices
        for (const obj of c.objects) {
          const off = c.memberOffsets.get(obj.id);
          if (off) {
            obj.position.x = c.center.x + off.x;
            obj.position.y = c.center.y + off.y;
            obj.position.z = c.center.z + off.z;
          } else {
            // Si no hubiera offset registrado (caso raro), aplicar misma traslación
            obj.position.x += shift.x;
            obj.position.y += shift.y;
            obj.position.z += shift.z;
          }
          obj.update(0);
        }
        // Si existiera proxy inicializado (no debería aún), trasladarlo también
        if (c.proxy) {
          c.proxy.position.x += shift.x;
          c.proxy.position.y += shift.y;
          c.proxy.position.z += shift.z;
          c.proxy.update(0);
        }
      }
    }

    this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Randomized start near Sun', { startPos, sunRadius, distFromSurface });
  }

  /**
   * Bucle principal del juego
   */
  private gameLoop = (): void => {
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
    requestAnimationFrame(this.gameLoop);
  };

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
  this.spaceship.update(deltaTime);
  this.maintainLandedShipAttachment();
  this.handleSunProximityDamage(deltaTime);

    // Update independent asteroids (ejected from clusters after collision)
    this.updateIndependentAsteroids(deltaTime);

    this.lesserBeingSpawner?.update(deltaTime);
    this.lesserBeingController?.update(deltaTime);
    this.updateLesserBeings(deltaTime);
    this.lesserBeingCombat?.update(deltaTime);

    // Apply ongoing collision slide (lateral reposition over ~1s)
    if (this.collisionSlide) {
      this.collisionSlide.t += deltaTime;
      const k = Math.max(0, Math.min(1, this.collisionSlide.t / Math.max(1e-6, this.collisionSlide.duration)));
      // Smoothstep easing
      const s = k * k * (3 - 2 * k);
      const nx = this.collisionSlide.start.x + (this.collisionSlide.end.x - this.collisionSlide.start.x) * s;
      const ny = this.collisionSlide.start.y + (this.collisionSlide.end.y - this.collisionSlide.start.y) * s;
      const nz = this.collisionSlide.start.z + (this.collisionSlide.end.z - this.collisionSlide.start.z) * s;
      this.spaceship.position.x = nx;
      this.spaceship.position.y = ny;
      this.spaceship.position.z = nz;
      this.spaceship.updateModelMatrix();
      try { if (this.spaceship.boundingSphere) this.spaceship.boundingSphere.center = { ...this.spaceship.position }; } catch {}
      if (k >= 1) this.collisionSlide = null;
    }

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
        const fwd = this.normalize({
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
        const baseMax = (this.speedRiteOriginalMax && isFinite(this.speedRiteOriginalMax)) ? this.speedRiteOriginalMax : this.spaceship.maxSpeed;
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
        const riteActive = !!(this.speedRiteUntilMs && performance.now() < (this.speedRiteUntilMs || 0));
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

    // Timed spell upkeep: expire or compute remaining time for HUD
    let speedRiteRemainingSec: number | null = null;
    if (this.speedRiteUntilMs && isFinite(this.speedRiteUntilMs)) {
      const now = performance.now();
      if (now >= this.speedRiteUntilMs) {
        // Expired: restore original max speed if known
        if (this.speedRiteOriginalMax !== null) {
          this.spaceship.maxSpeed = this.speedRiteOriginalMax;
          // Clamp target/current to new cap to avoid overshoot visuals
          this.spaceship.targetSpeed = Math.min(this.spaceship.targetSpeed, this.spaceship.maxSpeed);
          this.spaceship.currentSpeed = Math.min(this.spaceship.currentSpeed, this.spaceship.maxSpeed);
        }
        // Restore accel/decel baselines if known
        if (this.speedRiteOriginalAccel !== null) {
          this.spaceship.acceleration = this.speedRiteOriginalAccel;
        }
        if (this.speedRiteOriginalDecel !== null) {
          this.spaceship.deceleration = this.speedRiteOriginalDecel;
        }
        this.speedRiteUntilMs = null;
        this.speedRiteOriginalMax = null;
        this.speedRiteOriginalAccel = null;
        this.speedRiteOriginalDecel = null;
      } else {
        // Use floor to avoid showing a lingering "00:01" when < 1s remains
        speedRiteRemainingSec = Math.max(0, Math.floor((this.speedRiteUntilMs - now) / 1000));
      }
      this.cachedSpeedRiteRemainingSec = speedRiteRemainingSec;
      if (this.voidCocoonActiveUntilMs && now >= this.voidCocoonActiveUntilMs) {
        this.voidCocoonActiveUntilMs = null;
        this.voidCocoonLastImpactMs = 0;
      }
    } else {
      this.cachedSpeedRiteRemainingSec = null;
      const now = performance.now();
      if (this.voidCocoonActiveUntilMs && now >= this.voidCocoonActiveUntilMs) {
        this.voidCocoonActiveUntilMs = null;
        this.voidCocoonLastImpactMs = 0;
      }
    }
    
  // Actualizar efectos de partículas
  this.particleEffects.updateAmbientDust(this.spaceship, deltaTime);
    this.particleEffects.updateThrusterEffect(this.spaceship, deltaTime);
    this.particleEffects.updateDestructionDebris(this.camera, deltaTime);

    // Update active spell beams
    this.updateAnchoringPulseBeam(deltaTime);
    this.updateVoidKinesisBeam(deltaTime);
    this.updateDisruptionBeam();

    // Actualizar cámara con nueva posición
    this.camera.update(this.spaceship, deltaTime);
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
    const gatedPlanetIds = ['planet-earth', 'planet-saturn'];
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
  
  // Obtener tipo real del objeto usando getType()
  const objectType = (selected as unknown as GameObject)?.getType?.() || GameObjectType.UNKNOWN;
  
  // Determinar label basado en tipo específico
  let typeLabel: string;
  switch (objectType) {
    case GameObjectType.MEGA_ASTEROID:
      typeLabel = 'MegaAsteroid';
      break;
    case GameObjectType.SUPER_ASTEROID:
      typeLabel = 'SuperAsteroid';
      break;
    case GameObjectType.RINGED_PLANET:
      typeLabel = 'Ringed';
      break;
    case GameObjectType.DWARF_PLANET:
      typeLabel = 'Dwarf';
      break;
    case GameObjectType.PROTOPLANET:
      typeLabel = 'Protoplanet';
      break;
    default:
      typeLabel = getDisplayLabelFromTargetType(selType);
  }
  
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
    this.checkCollisions();

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

  private resetAfterCrash(): void {
    // Simple respawn near the sun and clear state
    try { this.randomizeStartNearSun(5000); } catch {}
    if (this.spaceship) {
      this.spaceship.velocity = { x: 0, y: 0, z: 0 } as any;
      this.spaceship.currentSpeed = 0;
      this.spaceship.targetSpeed = 0;
    }
    // Landing mechanic removed
  // Landing windows cleanup call removed
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
    return value
      .split('_')
      .map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
      .join(' ');
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
    // Fallback: local generator (non-unique)
    const catalogPrefixes = ['Kepler', 'TRAPPIST', 'Gliese', 'Proxima', 'HD', 'K2', 'Tau', 'LHS', 'WASP', 'HIP'];
    const separators = ['-', ' ', ' '];
    const suffixAlpha = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const num = () => Math.floor(10 + Math.random() * 8900);
    const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    const style = Math.random();
    if (style < 0.5) {
      return `${pick(catalogPrefixes)}${pick(separators)}${num()}${Math.random() < 0.5 ? '' : ' '}${pick(suffixAlpha)}`.trim();
    } else {
      const myth = ['Aether', 'Chronos', 'Erebus', 'Gaia', 'Nyx', 'Hera', 'Hyperion', 'Icarus', 'Janus', 'Tethys', 'Rhea', 'Atlas'];
      const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
      return `${pick(myth)} ${pick(romans)}`;
    }
  }

  // typeToLabel() eliminado - usar getDisplayLabelFromTargetType() de game-object.types

  // Los efectos de propulsión ahora se manejan en ParticleEffectsService

  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  /**
   * Mantiene objetos dentro de los límites del mundo
   */
  private wrapPosition(object: GameObject): void {
    const halfWorld = this.WORLD_SIZE / 2;
    
    if (object.position.x > halfWorld) object.position.x = -halfWorld;
    if (object.position.x < -halfWorld) object.position.x = halfWorld;
    
    if (object.position.y > halfWorld) object.position.y = -halfWorld;
    if (object.position.y < -halfWorld) object.position.y = halfWorld;
    
    if (object.position.z > halfWorld) object.position.z = -halfWorld;
    if (object.position.z < -halfWorld) object.position.z = halfWorld;
  }

  /**
   * Detecta colisiones entre objetos
   */
  private checkCollisions(): void {
    if (!this.spaceship || this.collisionsDisabled || this.isLandingDamageSuppressed()) {
      return;
    }
    const now = performance.now();
    // Debug: log ship bounding sphere status once per second
    if (Math.floor(now / 1000) % 5 === 0 && !this._lastCollisionLogSec || Math.floor(now / 1000) !== this._lastCollisionLogSec) {
      this._lastCollisionLogSec = Math.floor(now / 1000);
      const shipBS = this.spaceship.boundingSphere;
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision check', { 
        shipBS: shipBS ? { r: shipBS.radius.toFixed(1), pos: `(${shipBS.center.x.toFixed(0)}, ${shipBS.center.y.toFixed(0)}, ${shipBS.center.z.toFixed(0)})` } : 'null'
      });
    }
    // Helper to apply damage with cooldown per object
    const applyDamage = (obj: any, amount: number): void => {
      if (!obj || !obj.id) return;
      const nextAllowed = this.gameState.collisionCooldowns.get(obj.id) || 0;
      if (now < nextAllowed) return; // still in cooldown
      this.gameState.collisionCooldowns.set(obj.id, now + 500); // 0.5s cooldown per source
      // Portal is ethereal: ignore negative/zero damage
      if (amount <= 0) return;
      const prev = this.spaceship.healthCurrent;
      this.spaceship.healthCurrent = Math.max(0, this.spaceship.healthCurrent - amount);
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Ship damage', { source: obj.id, amount, prev, now: this.spaceship.healthCurrent });
      // Simple HUD feedback: add marquee message
      try { this.hudManager?.addMarqueeMessage?.(`Impacto: -${amount}u (${this.spaceship.healthCurrent}/${this.spaceship.healthMax})`); } catch {}
      // Death verification is now handled reactively by healthCurrent setter
    };
    // Aggregate potential collision sources (clusters members, super, mega, planets, sun, ephemerals)
    const sources: any[] = [];
    try {
      this.asteroidClusterService.getClusters().forEach(c => {
        // Include ALL cluster objects regardless of LOD mode to ensure SuperAsteroids are checked
        c.objects.forEach(o => { if (o.isActive && o.isActive()) sources.push(o); });
        // Also include proxy if present (avoid duplicates via lodMode check)
        if (c.lodMode === 'proxy' && c.proxy && !c.representativeId && c.proxy.isActive && c.proxy.isActive()) sources.push(c.proxy);
      });
    } catch {}
    try { this.ephemeralAsteroids.forEach(a => { if (a.isActive && a.isActive()) sources.push(a); }); } catch {}
    try { this.gameState.independentAsteroids.forEach(a => { if (a.isActive && a.isActive()) sources.push(a); }); } catch {}
    try { this.gameState.planets.forEach(p => { if (p.isActive && p.isActive()) sources.push(p); }); } catch {}
    try { if (this.gameState.sun && this.gameState.sun.isActive && this.gameState.sun.isActive()) sources.push(this.gameState.sun); } catch {}
    try { this.gameState.portals.forEach(p => { if (p.isActive && p.isActive()) sources.push(p); }); } catch {}
    // Mega asteroides en planetDebris
    try { for (const arr of this.planetDebris.values()) { for (const d of arr) { if (d.obj.isActive && d.obj.isActive()) sources.push(d.obj); } } } catch {}
    // Debug: log sources count periodically
    if (this._lastCollisionLogSec && Math.floor(now / 1000) === this._lastCollisionLogSec) {
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision sources', { count: sources.length });
    }
    for (const obj of sources) {
      try {
        // Check collision pair cooldown (500ms) para permitir que física se aplique
        const pairKey = `ship-${obj.id}`;
        const pairCooldownUntil = this.collisionPairCooldown.get(pairKey) || 0;
        if (now < pairCooldownUntil) continue; // Skip this pair, still in cooldown
        
        const collided = this.spaceship.checkCollision(obj);
        if (collided) {
          // Set cooldown for this collision pair (500ms)
          this.collisionPairCooldown.set(pairKey, now + 500);
          
          // Determine damage based on type/class name (handle underscore prefix from minification)
          const rawName = (obj as any)?.constructor?.name || 'Unknown';
          const name = rawName.startsWith('_') ? rawName.substring(1) : rawName;
          // Debug: log collision detected
          this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Collision detected!', { name, rawName, id: obj.id });
          let dmg = 0;
          if (name === 'Asteroid') dmg = 10;
          else if (name === 'SuperAsteroid') dmg = 75;
          else if (name === 'MegaAsteroid') dmg = 150;
          else if (name === 'Planet' || name === 'RingedPlanet' || name === 'GaseousPlanet' || name === 'GiantPlanet' || name === 'DwarfPlanet' || name === 'Protoplanet' || name === 'EarthSplitPlanet') dmg = 100000;
          else if (name === 'Sun') dmg = 100000;
          else if (name === 'Portal') dmg = 0; // ethereal
          // Proxy cluster object (ClusterObject) treat like small asteroid
          else if (name === 'ClusterObject') dmg = 10;
          if (dmg > 0) {
            // Physics response before applying potential fatal damage
            this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Calling handleCollisionResponse', { name, dmg, audioUnlocked: this.audioUnlocked });
            try { 
              this.handleCollisionResponse(obj, name, dmg); 
            } catch (e) {
              this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'handleCollisionResponse failed', e);
            }
            const cocoonActive = !!(this.voidCocoonActiveUntilMs && now < this.voidCocoonActiveUntilMs);
            if (cocoonActive) {
              this.handleVoidCocoonImpact(obj, dmg, { reason: name });
            } else {
              applyDamage(obj, dmg);
            }
            
            // Apply mutual damage: ship deals 50 damage to the object
            this.applyDamageToObject(obj, 50);
          }
        }
      } catch {}
    }
  }

  /** Handle physical response, camera effect and audio for a collision */
  private handleCollisionResponse(obj: any, name: string, dmg: number): void {
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'handleCollisionResponse start', { name, dmg, audioUnlocked: this.audioUnlocked });
    if (!this.spaceship || !this.collisionManager) return;
    
    // Determinar si el objetivo es miembro de cluster
    const isClusterMember = !this.gameState.isIndependentAsteroid(obj.id) && 
                            !this.ephemeralAsteroids.some(a => a.id === obj.id);
    
    // Delegar TODA la lógica al CollisionManager
    const result = this.collisionManager.handleCollision(
      this.spaceship,
      obj,
      isClusterMember
    );
    
    // Aplicar resultados según tipo de colisión
    if (result.collisionType === 'small-movable') {
      // Física completa 3D: actualizar nave y asteroide
      
      this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '📊 Physics response calculated', {
        asteroidId: obj.id,
        newVelocity: result.targetNewVelocity ? 
          `(${result.targetNewVelocity.x.toFixed(2)}, ${result.targetNewVelocity.y.toFixed(2)}, ${result.targetNewVelocity.z.toFixed(2)})` : 'null',
        shouldEject: result.shouldEject,
        impulseMagnitude: result.impulseMagnitude.toFixed(2)
      });
      
      // IMPORTANTE: Marcar como independiente ANTES de aplicar velocidad para evitar sobreescritura
      // Incluso con impulso pequeño, el asteroide debe mantener su velocidad de colisión
      if (result.impulseMagnitude > 0.1) {
        (obj as any)._isIndependent = true;
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '📌 Asteroid marked as independent (preserves velocity)', {
          asteroidId: obj.id,
          impulse: result.impulseMagnitude.toFixed(2)
        });
      }
      
      // Aplicar resultado a la nave
      this.spaceship.position = result.newPosition;
      this.spaceship.velocity = result.newVelocity;
      this.spaceship.updateModelMatrix();
      
      // Actualizar bounding sphere de la nave
      try {
        if (this.spaceship.boundingSphere) {
          this.spaceship.boundingSphere.center = { ...this.spaceship.position };
        }
      } catch {}
      
      // Eyectar de cluster si hay cualquier colisión real (impulso > 0.1)
      // Esto asegura que el asteroide se añade a independentAsteroids y no se recalcula como cluster member
      if (result.impulseMagnitude > 0.1 && isClusterMember) {
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🚀 Ejecting asteroid from cluster', {
          asteroidId: obj.id,
          reason: 'Collision detected',
          impulse: result.impulseMagnitude.toFixed(2),
          highImpulse: result.shouldEject
        });
        this.makeAsteroidIndependent(obj);
      }
      
      // Aplicar resultado al asteroide (sale disparado según ángulo de impacto)
      // IMPORTANTE: Hacer esto DESPUÉS de eyectar para que no sea sobreescrito por applyCenterDrivenFullUpdate
      if (result.targetNewVelocity && obj.velocity) {
        obj.velocity.x = result.targetNewVelocity.x;
        obj.velocity.y = result.targetNewVelocity.y;
        obj.velocity.z = result.targetNewVelocity.z;
        
        this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '✅ Velocity applied to asteroid', {
          asteroidId: obj.id,
          velocityAfter: `(${obj.velocity.x.toFixed(2)}, ${obj.velocity.y.toFixed(2)}, ${obj.velocity.z.toFixed(2)})`,
          isIndependent: this.gameState.isIndependentAsteroid(obj.id),
          hasPendingEjection: !!(obj as any)._pendingEjection
        });
      }
      
    } else if (result.collisionType === 'large-immovable' || result.collisionType === 'massive-slide') {
      // Slide suave para objetos grandes/masivos
      const R = Math.max(10, (obj.boundingSphere?.radius ?? 200));
      const slide = Math.max(30, Math.min(250, R * 0.1));
      
      // Calcular dirección de slide (tangente + normal)
      const dx = this.spaceship.position.x - obj.position.x;
      const dy = this.spaceship.position.y - obj.position.y;
      const dz = this.spaceship.position.z - obj.position.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const normal = { x: dx / dist, y: dy / dist, z: dz / dist };
      
      // Tangente perpendicular a velocidad y normal
      const v = this.spaceship.velocity;
      const tangent = {
        x: v.x - (v.x * normal.x + v.y * normal.y + v.z * normal.z) * normal.x,
        y: v.y - (v.x * normal.x + v.y * normal.y + v.z * normal.z) * normal.y,
        z: v.z - (v.x * normal.x + v.y * normal.y + v.z * normal.z) * normal.z
      };
      const tlen = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
      tangent.x /= tlen; tangent.y /= tlen; tangent.z /= tlen;
      
      const start = { ...this.spaceship.position };
      const end = {
        x: start.x + tangent.x * slide + normal.x * 5,
        y: start.y + tangent.y * slide + normal.y * 5,
        z: start.z + tangent.z * slide + normal.z * 5
      };
      
      this.collisionSlide = { start, end, t: 0, duration: 0.3 };
      this.spaceship.velocity = result.newVelocity;
      
    } else if (result.collisionType === 'ethereal') {
      // Sin física (portales)
      // No hacer nada
    }

    // Camera impact vignette bump
    const bump = Math.min(0.9, 0.08 + (dmg / 250));
    this.impactVignetteLevel = Math.max(this.impactVignetteLevel, Math.min(1, this.impactVignetteLevel + bump));
    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Vignette effect triggered', { bump, impactVignetteLevel: this.impactVignetteLevel });

    // Audio cue (light/heavy)
    try {
      if (this.audio && this.audioUnlocked) {
        const heavy = dmg >= 80;
        const desired = heavy ? 'sfx_collision_heavy' : 'sfx_collision_light';
        const clip = this.audio.has(desired) ? desired : (heavy ? 'sfx_whoosh' : 'ui_select');
        const vol = Math.max(0.2, Math.min(0.9, 0.25 + dmg / 180));
        this.audio.play(clip, { bus: 'sfx', volume: vol, fadeInMs: 0 });
      } else if (!this.audioUnlocked) {
        this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision sound skipped - audio not unlocked');
      }
    } catch {}

    // Debug marquee for collision (throttled by damage cooldown outside)
    try { this.hudManager?.addMarqueeMessage?.(`Colisión: ${name} dmg=${dmg}`); } catch {}
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

  public applyShipDamage(amount: number, sourceId: string, reason: string): number {
    if (!this.spaceship || !Number.isFinite(amount) || amount <= 0) {
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
    try {
      this.hudManager?.addMarqueeMessage?.(`Daño (${reason}): -${Math.round(dealt)}u`);
    } catch {}
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
  private getObjectDebrisColor(obj: GameObject): { r: number; g: number; b: number } {
    const typeName = obj.constructor?.name || '';
    
    // Asteroids: gris-marrón rocoso
    if (typeName.includes('Asteroid')) {
      return { r: 0.7, g: 0.5, b: 0.3 };
    }
    
    // Planets: tonos azulados/verdosos
    if (typeName.includes('Planet')) {
      return { r: 0.3, g: 0.6, b: 0.8 };
    }
    
    // Portals: púrpura místico
    if (typeName === 'Portal') {
      return { r: 0.8, g: 0.3, b: 0.9 };
    }
    
    // Default: gris neutro
    return { r: 0.6, g: 0.6, b: 0.6 };
  }

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
    
    // Create destruction debris particles at object's position
    if (this.particleEffects && obj.position) {
      // Calculate approximate size for particle generation
      const size = obj.size || 1.0;
      // Generate particles (color based on object type)
      const color = this.getObjectDebrisColor(obj);
      this.particleEffects.createDestructionDebris(obj.position, size, color);
    }
    
    // Mark as inactive immediately to prevent targeting/rendering
    obj.active = false;
    obj.visible = false;
    
    const objId = obj.id;
    this.stopDopplerCueForObject(objId);
    const typeName = obj.constructor?.name || 'Unknown';
    let removed = false;

    if (obj instanceof LesserBeingBase) {
      this.handleLesserBeingDestroyed(obj);
      this.unregisterLesserBeing(objId);
      removed = true;
    }

    // Delegate primary removal to the GameStateStore so all collections stay in sync
    try {
      removed = this.gameState.removeObject(obj as GameObject) || removed;
    } catch {}

    // Additional cleanup for transient structures not owned by the store
    if (typeName === 'Asteroid' || typeName === '_Asteroid') {
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
    } else if (typeName === 'SuperAsteroid' || typeName === '_SuperAsteroid') {
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
    } else if (typeName === 'MegaAsteroid' || typeName === '_MegaAsteroid') {
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
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Object not found in any array for destruction', { id: objId, type: typeName });
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
    
    // Visual feedback
    try { this.hudManager?.addMarqueeMessage?.(`${typeName} destruido`); } catch {}
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Object removed from world', { id: objId, type: typeName, removed });
  }

  private handleLesserBeingDestroyed(being: LesserBeingBase): void {
    if (!being) {
      return;
    }
    if (!being.hasLanded) {
      this.rewardLesserBeingKill(being);
      return;
    }
    if (being.landedPlanetId) {
      this.clearPlanetOccupation(being.landedPlanetId);
    }
  }

  private rewardLesserBeingKill(being: LesserBeingBase): void {
    const rewardXp = 100;
    try {
      this.characterProfileService?.awardExperience(rewardXp, 'lesser-being');
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Failed to award XP for lesser being kill', { error });
    }
    this.tryApplyCorruptionBonus(20);
    const sanityAwarded = this.grantTemporarySanity(20);
    try {
      const corChunk = sanityAwarded > 0 ? `, +${sanityAwarded} COR` : '';
      this.hudManager?.addMarqueeMessage?.(`${being.getDisplayName()} destruido: +${rewardXp} XP${corChunk}`);
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
      
      // Clear cluster service (will be repopulated by createGameObjects)
      // Note: AsteroidClusterService doesn't have clear() method, objects will be replaced
      
      // Clear collision cooldowns
      this.gameState.collisionCooldowns.clear();
      
      // Clear doppler cues
      this.gameState.dopplerCues.clear();
      this.lastObjPos.clear();
      
      // Reset camera effects
      this.impactVignetteLevel = 0;
      this.collisionSlide = null;
      
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
      try { this.hudManager?.addMarqueeMessage?.('Sistema solar regenerado'); } catch {}
      
      // Restart game loop
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      
      // Explicitly restart the game loop
      requestAnimationFrame(() => this.gameLoop());
      
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn complete - game loop restarted');
      this.setAudioPausedForGame(false);
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn failed', e);
      // Try to restart anyway
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      requestAnimationFrame(() => this.gameLoop());
      this.setAudioPausedForGame(false);
    }
  }

  private updateAgeAndSurvivability(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    this.ageTimerAccumulatorSec += deltaTime;
    if (this.ageTimerAccumulatorSec < this.AGE_SECONDS_PER_DAY) {
      return;
    }

    const daysToApply = Math.floor(this.ageTimerAccumulatorSec / this.AGE_SECONDS_PER_DAY);
    this.ageTimerAccumulatorSec -= daysToApply * this.AGE_SECONDS_PER_DAY;
    if (daysToApply <= 0) {
      return;
    }

    const ageResult = this.characterProfileService.addDaysToAge(daysToApply);
    if (!ageResult.daysApplied) {
      return;
    }

    this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Age advanced via timer', {
      daysApplied: ageResult.daysApplied,
      yearsBefore: ageResult.yearsBefore,
      yearsAfter: ageResult.yearsAfter,
      yearsGained: ageResult.yearsGained
    });

    if (ageResult.yearsGained <= 0) {
      return;
    }

    for (let year = ageResult.yearsBefore + 1; year <= ageResult.yearsAfter; year++) {
      if (year > this.SURVIVABILITY_DECAY_START_YEAR) {
        const before = this.gameState.characterProfile.survivability;
        const after = this.characterProfileService.adjustSurvivability(-1);
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Survivability decayed due to aging', {
          year,
          survivabilityBefore: before,
          survivabilityAfter: after
        });
        const rollOutcome = this.performSurvivabilityDeathRoll('aging', after, year);
        if (rollOutcome.didDie) {
          return;
        }
      }
    }
  }

  private performSurvivabilityDeathRoll(
    source: 'aging',
    survivability: number,
    ageYears: number
  ): { didDie: boolean; roll: number } {
    const roll = Math.random() * 100;
    const survived = roll <= survivability;
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Hardcore survivability roll executed', {
      source,
      roll: Number(roll.toFixed(2)),
      survivability,
      ageYears,
      survived
    });
    if (survived) {
      return { didDie: false, roll };
    }
    this.handleHardcoreDeath({ source, roll, survivability, ageYears });
    return { didDie: true, roll };
  }

  private handleHardcoreDeath(context: { source: 'aging'; roll: number; survivability: number; ageYears: number }): void {
    if (this.deathInProgress || !this.spaceship) {
      return;
    }

    this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Hardcore death triggered', context);
    try {
      this.hudManager?.addMarqueeMessage?.('El piloto sucumbe a la edad: supervivencia agotada.');
    } catch {}

    try {
      this.spaceship.healthCurrent = 0;
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Failed to enforce hardcore death', error);
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
        this.collisionSlide = null;
        
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
        try { this.hudManager?.addMarqueeMessage?.('Partida cargada - Sistema restaurado'); } catch {}
        
        // Restart game loop
        this.isRunning = true;
        this.lastFrameTime = performance.now();
        
        // Explicitly restart the game loop
        requestAnimationFrame(() => this.gameLoop());
        
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

  private oldRespawnGame(): void {
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn initiated - regenerating solar system');
    
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
      
      // Clear cluster service (will be repopulated by createGameObjects)
      // Note: AsteroidClusterService doesn't have clear() method, objects will be replaced
      
      // Clear collision cooldowns
      this.gameState.collisionCooldowns.clear();
      
      // Clear doppler cues
      this.gameState.dopplerCues.clear();
      this.lastObjPos.clear();
      
      // Reset camera effects
      this.impactVignetteLevel = 0;
      this.collisionSlide = null;
      
      // Reset portal state
      this.portalTraversalCooldownSec = 0;
      this.portalPrevDistances.clear();
      this.lastShipPos = null;
      
      // Recreate all game objects (solar system + spaceship)
      this.createGameObjects();
      
      // Camera will automatically follow spaceship (target is set in camera update logic)
      
      // Display marquee
      try { this.hudManager?.addMarqueeMessage?.('Sistema solar regenerado'); } catch {}
      
      // Restart game loop
      if (wasRunning) {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
      }
      
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Respawn complete');
    } catch (e) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Respawn failed', e);
      // Try to restart anyway
      if (wasRunning) {
        this.isRunning = true;
        this.lastFrameTime = performance.now();
      }
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

    if (this.disruptionBeam?.active) {
      this.renderDisruptionBeam();
      restoreLitProgram();
    }
    if (this.anchoringPulseBeam?.active) {
      this.renderAnchoringPulseBeam();
      restoreLitProgram();
    }
    if (this.voidKinesisBeam?.active) {
      this.renderVoidKinesisBeam();
      restoreLitProgram();
    }

    // Renderizar nave con shader texturizado (por encima del beam)
  this.renderSpaceship();

    if (this.voidCocoonActiveUntilMs && performance.now() < this.voidCocoonActiveUntilMs) {
      this.renderVoidCocoonShield();
      restoreLitProgram();
    }
    
    // Renderizar efectos de partículas en programa básico (usa additive blending)
    // Asegurar que el estado de la nave/asteroides no se contamine
    this.particleEffects.render(this.camera);
    
    // Reforzar de nuevo programa lit y su iluminación tras partículas
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

    // Cambiar de vuelta al shader estándar para asteroides
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
    // Color base por defecto de asteroides (si no se establece luego)
    this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4]));

  // Renderizar asteroides del cluster con shader estándar
  this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4])); // Color gris-marrón rocoso

    // Renderizar objetos de clusters o proxy según LOD
  // Asegurar blending para soportar opacidades en fades
  this.gl.enable(this.gl.BLEND);
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

  if (this.USE_INSTANCING && this.instancedRenderer) {
      // Gather batches
      const smalls: GameObject[] = [];
      const supers: GameObject[] = [];
      this.asteroidClusterService.getClusters().forEach(c => {
        // Skip clusters farther than 20,000u from the ship (no render / no account)
        const dxS = c.center.x - this.spaceship.position.x;
        const dyS = c.center.y - this.spaceship.position.y;
        const dzS = c.center.z - this.spaceship.position.z;
        const distShip = Math.hypot(dxS, dyS, dzS);
        if (distShip > 20000) return;
        // Cluster-level frustum/distance culling (skip entire cluster if not visible)
        if (!this.isClusterVisible(c, 5000, TargetType.CLUSTER)) {
          return;
        }
        // Si estamos en modo proxy y hay representante, renderizarlo sin fade
        if (c.lodMode === 'proxy' && c.representativeId) {
          const rep = c.objects.find(o => o.id === c.representativeId);
          if (rep) {
            // Asegurar opacidad completa para el representante
            (rep as any).renderOpacity = 1.0;
            if ((rep as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(rep);
            else smalls.push(rep);
          }
        } else if (c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          // Si no hay representante, usar el proxy visual
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        // Miembros: instanciar si lod 'full' o si estamos fadeando hacia proxy
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy');
        if (shouldRenderMembers) {
          for (const o of c.objects) {
            // Evitar duplicar el representante si ya se añadió explícitamente
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) continue;
            if ((o as unknown as GameObject)?.getType?.() === GameObjectType.SUPER_ASTEROID) supers.push(o);
            else smalls.push(o);
          }
        }
      });
      // Append ephemeral asteroids (always smalls)
      if (this.ephemeralAsteroids.length) {
        for (const a of this.ephemeralAsteroids) {
          if (a.isActive()) smalls.push(a);
        }
      }
      // Append independent asteroids (always smalls)
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
      // Tras instancing, reforzar estado lit y limpiar divisores/atributos
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
        // Skip clusters farther than 20,000u from the ship (no render / no account)
        const dxS = c.center.x - this.spaceship.position.x;
        const dyS = c.center.y - this.spaceship.position.y;
        const dzS = c.center.z - this.spaceship.position.z;
        const distShip = Math.hypot(dxS, dyS, dzS);
        if (distShip > 20000) return;
        // Cluster-level frustum/distance culling (skip entire cluster if not visible)
        if (!this.isClusterVisible(c, 4000, TargetType.CLUSTER)) {
          return;
        }
        // Proxy si existe y relevante, salvo que tengamos un representante
        if (!c.representativeId && c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        // Miembros si corresponde
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy') || (c.lodMode === 'proxy' && !!c.representativeId);
        if (shouldRenderMembers) {
          c.objects.forEach(o => {
            // Evitar doble render del representante (no instanciado) en proxy
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) return;
            this.shaderManager.setLitOpacity((o as any).renderOpacity ?? 1.0);
            this.renderObject(o);
          });
          // Render explícito del representante en no instanciado si aplica
          if (c.lodMode === 'proxy' && c.representativeId) {
            const rep = c.objects.find(o => o.id === c.representativeId);
            if (rep) {
              this.shaderManager.setLitOpacity(1.0);
              this.renderObject(rep);
            }
          }
        }
      });
      // Render ephemeral asteroids in non-instanced path
      if (this.ephemeralAsteroids.length) {
        for (const a of this.ephemeralAsteroids) {
          if (a.isActive()) {
            this.shaderManager.setLitOpacity(1.0);
            this.renderObject(a);
          }
        }
      }
      // Render independent asteroids in non-instanced path
      if (this.gameState.independentAsteroids.length) {
        for (const a of this.gameState.independentAsteroids) {
          if (a.isActive()) {
            this.shaderManager.setLitOpacity(1.0);
            this.renderObject(a);
          }
        }
      }
    }

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

  // Renderizar planetas después de asteroides
  this.renderPlanets();
  // Render portals (halo encapsulado en PortalRenderer)
  try {
    const portalRenderer = this.portalRenderer;
    if (portalRenderer) {
      portalRenderer.render(this.gameState.portals, this.camera.viewMatrix, this.camera.projectionMatrix, (performance.now() || 0) / 1000);
    }
  } catch {}

  // Renderizar outlines avanzados (FASE 4) sobre la escena
  this.renderOutlineSystem();

  // STEP 5: Renderizar nuevo outliner 2D bajo HUD y Mapa
  this.renderTargetOutline2D();

  // Render overlays de animaciones (fade) sobre outlines
  this.animationManager.render(this);

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
            
            // Obtener tipo real del objeto usando getType()
            const mapObjectType = (tgt as unknown as GameObject)?.getType?.() || GameObjectType.UNKNOWN;
            
            // Determinar label basado en tipo específico
            let typeLabel: string;
            switch (mapObjectType) {
              case GameObjectType.MEGA_ASTEROID:
                typeLabel = 'MegaAsteroid';
                break;
              case GameObjectType.SUPER_ASTEROID:
                typeLabel = 'SuperAsteroid';
                break;
              case GameObjectType.RINGED_PLANET:
                typeLabel = 'Ringed';
                break;
              case GameObjectType.DWARF_PLANET:
                typeLabel = 'Dwarf';
                break;
              case GameObjectType.PROTOPLANET:
                typeLabel = 'Protoplanet';
                break;
              default:
                typeLabel = getDisplayLabelFromTargetType(tt);
            }
            
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
  this.systemPanel.updateMap({ center, centerLabel, planets, clusters, debris, enemies, ship, portals, marginPx: 48, details });
      this.systemPanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'SolarSystemPanel render failed', e);
    }
  } else if (this.grimoirePanel && this.grimoirePanel.isEnabled()) {
    try {
      // Update and render the grimoire; delta not tracked here, content is quasi-static
      this.grimoirePanel.update(0);
      this.grimoirePanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.HUD, 'GrimoirePanel render failed', e);
    }
  } else if (this.inventoryPanel && this.inventoryPanel.isEnabled()) {
    try {
      this.refreshInventoryPanelSnapshot();
      this.inventoryPanel.render((this.gl.canvas as HTMLCanvasElement).width, (this.gl.canvas as HTMLCanvasElement).height);
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

  // Draw red impact vignette last (on top)
  try {
    if (this.overlayRenderer && this.impactVignetteLevel > 0) {
      this.overlayRenderer.drawVignette([1, 0, 0], Math.min(0.85, this.impactVignetteLevel), 0.58, 0.4);
    }
  } catch {}
  }

  /** Crea 9 planetas en órbitas elípticas concéntricas en el plano XZ
   * Requisitos:
   * - 9 planetas totales
   * - 1 gaseous, 1 giant
   * - Tierra en la 3ª órbita más cercana al centro
   * - El giant debe tener su órbita (a,b) un 15% mayor que un planetoide equivalente
   */
  private createPlanets(): void {
    // Si ya existen, no recrear
    if (this.gameState.planets.length > 0) return;

    const center = { x: 0, y: 0, z: 0 };
    // Crear Sol en el centro (inmóvil)
    const sunRadius = 1800; // radio grande
    const sun = new Sun('sol-primario', sunRadius, { ...center });
    sun.orbitCenter = { ...center };
    sun.semiMajor = 0; sun.semiMinor = 0; sun.orbitAngularSpeed = 0; sun.orbitAngle = 0;
    sun.angularVelocity.y = 0.0005; // leve rotación visual
    this.gameState.planets.push(sun);
    this.gameState.sun = sun;
  const count = 9;
    const minA = 50000; // semi-eje mayor mínimo
    const maxA = 100000; // semi-eje mayor máximo

    // Precalcular órbitas base para 9 anillos (lineal en a)
    type Orbit = { a: number; b: number; orient: number; angle0: number };
    const baseOrbits: Orbit[] = [];
  for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const a = Math.round(minA + t * (maxA - minA));
      const e = 0.25 + Math.random() * 0.25; // 0.25..0.5
      const b = Math.round(a * Math.sqrt(1 - e * e));
      baseOrbits.push({
        a,
        b,
        orient: Math.random() * Math.PI * 2,
        angle0: Math.random() * Math.PI * 2,
      });
    }

  // Índices fijos por encargo (0-based):
  // 0: Mercurio, 1: Venus, 2: Tierra, 3: Marte, 4: Júpiter (Giant), 5: Saturn (Ringed), 6: Urano (Gaseous), 7: Neptuno, 8: Plutón
  const mercuryIdx = 0;
  const venusIdx = 1;
  const earthIdx = 2; // Tierra
  const marsIdx = 3;
  const jupiterIdx = 4;
  const saturnIdx = 5;
  const uranusIdx = 6;
  const neptuneIdx = 7;
  const plutoIdx = 8;

    // Paleta rotativa
    const colors: PlanetColorName[] = ['verde','azul_hielo','marron','gris','azul_marino','rojo_carmesi','violeta_oscuro','azul_hielo','marron'];

    // Rastrea el borde exterior (a) de la órbita previa para garantizar separación mínima
    let lastOuterA = 0;
    const legacyVoidMassCapacityByIndex: Record<number, number> = {
      [mercuryIdx]: 600,
      [venusIdx]: 2200,
      [earthIdx]: 3600,
      [marsIdx]: 1500,
      [jupiterIdx]: 9000,
      [saturnIdx]: 7800,
      [uranusIdx]: 5200,
      [neptuneIdx]: 4200,
      [plutoIdx]: 600
    };
    const assignLegacyVoidMass = (index: number, planet: Planet) => {
      const capacity = legacyVoidMassCapacityByIndex[index] ?? 0;
      if (capacity > 0) {
        planet.setVoidMassLevels(capacity, capacity);
      } else {
        planet.setVoidMassLevels(0, 0);
      }
    };
    for (let i = 0; i < count; i++) {
      const { a: aBase, b: bBase, orient, angle0 } = baseOrbits[i];
      let a = aBase;
      let b = bBase;

      // Enforce >= 10,000u separation between consecutive concentric ellipses
      // For ellipses centered at 'center', radial range is [b, a]; ensure b_i >= a_{i-1} + 10000
      const spacingMin = 10000;
      if (i > 0) {
        const S = b / Math.max(1, a); // S = b/a = sqrt(1 - e^2)
        const requiredInner = lastOuterA + spacingMin;
        const requiredA = Math.ceil(requiredInner / Math.max(1e-6, S));
        if (a < requiredA) {
          a = requiredA;
          b = Math.round(a * S);
        }
      }

      // Plano orbital ÚNICO por planeta (distinto para cada uno, pasando por el origen)
      const deg = (v: number) => v * Math.PI / 180;
      // Conjunto de inclinaciones con buena separación visual
      const inclinationsDegUnique = [-20, -12, -7, -3, 0, 3, 7, 12, 20];
      // Longitudes del nodo ascendente (Ω) variadas
      const nodesDeg = [48.3, 76.7, 5.0, 49.6, 100.5, 113.7, 74.0, 131.8, 110.3];
      const inc = deg(inclinationsDegUnique[Math.min(i, inclinationsDegUnique.length - 1)]);
      const Omega = deg(nodesDeg[Math.min(i, nodesDeg.length - 1)]);
      // Normal n = rotar (0,1,0) por inc alrededor de eje en XZ con ángulo Omega (Rodrigues)
      const axis = { x: Math.cos(Omega), y: 0, z: Math.sin(Omega) };
      const n0 = { x: 0, y: 1, z: 0 };
      const c = Math.cos(inc), s = Math.sin(inc);
      const dot_an = axis.x*n0.x + axis.y*n0.y + axis.z*n0.z; // = 0
      const cross_an = { x: axis.y*n0.z - axis.z*n0.y, y: axis.z*n0.x - axis.x*n0.z, z: axis.x*n0.y - axis.y*n0.x };
      const n = this.normalize({
        x: n0.x * c + cross_an.x * s + axis.x * dot_an * (1 - c),
        y: n0.y * c + cross_an.y * s + axis.y * dot_an * (1 - c),
        z: n0.z * c + cross_an.z * s + axis.z * dot_an * (1 - c),
      });
      // u0 = proyección de X al plano (fallback a Z si degenera)
      const ref = { x: 1, y: 0, z: 0 };
      const dotRN = ref.x*n.x + ref.y*n.y + ref.z*n.z;
      let u0 = { x: ref.x - dotRN*n.x, y: ref.y - dotRN*n.y, z: ref.z - dotRN*n.z };
      if (Math.hypot(u0.x, u0.y, u0.z) < 1e-6) u0 = { x: 0, y: 0, z: 1 };
      u0 = this.normalize(u0);
      // v0 = n × u0
      let v0 = { x: n.y*u0.z - n.z*u0.y, y: n.z*u0.x - n.x*u0.z, z: n.x*u0.y - n.y*u0.x };
      v0 = this.normalize(v0);
      // Aplicar orientación en el plano (compatibilidad con orbitOrientation)
      const co = Math.cos(orient), so = Math.sin(orient);
      const uR = { x: u0.x*co + v0.x*so, y: u0.y*co + v0.y*so, z: u0.z*co + v0.z*so };
      const vR = { x: -u0.x*so + v0.x*co, y: -u0.y*so + v0.y*co, z: -u0.z*so + v0.z*co };
      const ct = Math.cos(angle0), st = Math.sin(angle0);
      const pos = {
        x: center.x + uR.x * (a * ct) + vR.x * (b * st),
        y: center.y + uR.y * (a * ct) + vR.y * (b * st),
        z: center.z + uR.z * (a * ct) + vR.z * (b * st),
      };

      // Tipo y radio
      const color = colors[i % colors.length];
      let radius: number;
      let planetObj: Planet;

      if (i === mercuryIdx) {
  // Mercurio: rojo carmesí, tamaño ~ 0.5 Tierra (clasificado como Dwarf)
        // pos precomputada en su plano orbital
        radius = 200; // mitad de 400 (Tierra)
  planetObj = new DwarfPlanet(`planet-mercury`, 'rojo_carmesi', radius, pos);
        planetObj.customName = 'Mercurio';
      } else if (i === venusIdx) {
        // Venus: tono cálido/marrón
        // pos precomputada en su plano orbital
        radius = 360; // un poco menor que Tierra
        planetObj = new Planet(`planet-venus`, 'marron', radius, pos);
        planetObj.customName = 'Venus';
      } else if (i === earthIdx) {
        // Tierra en 3ª órbita con planeta dividido y anillo de mega-asteroides
        radius = 400; // tamaño medio estable (radio)
        // pos precomputada en su plano orbital
  // Bring hemispheres 75u closer each (reduce gap by 150u): 300 → 150
  const created = EarthSplitPlanet.createWithDebris(`planet-earth`, 'azul_marino', radius, pos, 150, 320);
  planetObj = created.planet;
  planetObj.customName = 'Earth';
        planetObj.probabilityOfLifePct = 0;
        // Registrar offsets locales para que los debris sigan a la Tierra
        const arr: Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }> = [];
        for (const m of created.debris) {
          const local = { x: m.position.x - pos.x, y: m.position.y - pos.y, z: m.position.z - pos.z };
          arr.push({ obj: m, local });
        }
        this.planetDebris.set('planet-earth', arr);
      } else if (i === marsIdx) {
        // Marte: rojizo/marrón, algo menor
        // pos precomputada en su plano orbital
        radius = 300;
        planetObj = new Planet(`planet-mars`, 'marron', radius, pos);
        planetObj.customName = 'Marte';
      } else if (i === jupiterIdx) {
        // Júpiter (Giant) en 5ª órbita, nombre fijo
        // Gigante con órbita 15% mayor (min y max efectivos)
        a = Math.round(aBase * 1.15);
        b = Math.round(bBase * 1.15);
        // Recalcular pos con nuevos a/b manteniendo mismo plano/orientación
        const ctJ = Math.cos(angle0), stJ = Math.sin(angle0);
        const pos = {
          x: center.x + uR.x * (a * ctJ) + vR.x * (b * stJ),
          y: center.y + uR.y * (a * ctJ) + vR.y * (b * stJ),
          z: center.z + uR.z * (a * ctJ) + vR.z * (b * stJ),
        };
        // Radio base más grande, GiantPlanet multiplica x10 internamente
        radius = 300 + Math.random() * 200; // 300..500 (antes de x10)
        planetObj = new GiantPlanet(`planet-jupiter`, 'marron', radius, pos);
        planetObj.customName = 'Júpiter';
      } else if (i === saturnIdx) {
        // Saturn (Ringed) en 6ª órbita, con anillo de mega-asteroides
        // pos precomputada en su plano orbital
        // Tamaño entre planetoide y giant, más cerca de planetoide
        radius = 1100; // significativamente mayor que planetoide, menor que giant
        planetObj = new RingedPlanet(`planet-saturn`, 'gris', radius, pos);
        planetObj.customName = 'Saturn';
  // Generar y registrar cinturón de mega-asteroides similar al de la Tierra
  // Para Saturn, comprimimos la dispersión radial y el grosor vertical del anillo
  const saturnDebris = this.createDebrisBeltForPlanet(planetObj, 280, { spreadScale: 0.45, yScale: 0.7 });
        this.planetDebris.set(planetObj.id, saturnDebris);
      } else if (i === uranusIdx) {
        // Urano: gaseoso, tono azul hielo
        // pos precomputada en su plano orbital
        radius = 1200;
        planetObj = new GaseousPlanet(`planet-uranus`, 'azul_hielo', radius, pos);
        planetObj.customName = 'Urano';
      } else if (i === neptuneIdx) {
        // Neptuno: azul marino profundo (no necesariamente gaseoso aquí)
        // pos precomputada en su plano orbital
        radius = 1000;
        planetObj = new Planet(`planet-neptune`, 'azul_marino', radius, pos);
        planetObj.customName = 'Neptuno';
      } else if (i === plutoIdx) {
  // Plutón: pequeño, frío, gris (clasificado como Protoplanet)
        // pos precomputada en su plano orbital
        radius = 80;
  planetObj = new Protoplanet(`planet-pluto`, 'gris', radius, pos);
        planetObj.customName = 'Plutón';
      } else {
        // Planetoide genérico
        // pos precomputada en su plano orbital
        const diameter = 200 + Math.random() * 800; // 200..1000 → radio 100..500
        radius = diameter * 0.5;
        planetObj = new Planet(`planet-${i}`, color, radius, pos);
        // Names for generic ones will be assigned by generator below
      }

      // Configuración de órbita común
      planetObj.orbitCenter = { ...center };
      planetObj.semiMajor = a;
      planetObj.semiMinor = b;
      planetObj.orbitOrientation = orient;
      planetObj.orbitAngle = angle0;
      // Guardar plano orbital ya calculado
      planetObj.orbitNormal = n;
      planetObj.orbitU = u0;
      // Velocidad angular orbital ~ a^{-3/2} (heurística kepler)
      planetObj.orbitAngularSpeed = 0.00003 * Math.pow(50000 / a, 1.5);
        // Rotación propia: 1 vuelta/300s
      planetObj.angularVelocity.y = (Math.PI * 2) / 300;

        planetObj.assignInhabitantsFromProbability();
      assignLegacyVoidMass(i, planetObj);

  // Assign canonical catalog-like name at construction only if not already named
  try {
    if (!(planetObj as any).customName) {
      (planetObj as any).customName = this.generatePlanetName();
    }
  } catch {}
  this.gameState.planets.push(planetObj);
  // Actualizar separación: el siguiente anillo debe respetar b_next >= lastOuterA + spacing
  lastOuterA = a;
    }
  }

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
      const n0 = this.normalize({ x: p.orbitNormal.x, y: p.orbitNormal.y, z: p.orbitNormal.z });
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
      u0 = this.normalize(u0);
      // v = n × u
      let v0 = { x: n0.y*u0.z - n0.z*u0.y, y: n0.z*u0.x - n0.x*u0.z, z: n0.x*u0.y - n0.y*u0.x };
      v0 = this.normalize(v0);
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
    const proj = cam.projectionMatrix as unknown as Float32Array;
    const f = proj[5] || 1.0;
    const fovV = 2 * Math.atan(1 / f);
    const viewportH = (this.gl.canvas as HTMLCanvasElement).height || 1;
    const SPRITE_LOD_DISTANCE = 50000; // u
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
      // Distancia desde la nave (criterio de cercanía pedido)
      const dx = p.position.x - this.spaceship.position.x;
      const dy = p.position.y - this.spaceship.position.y;
      const dz = p.position.z - this.spaceship.position.z;
      const distShip = Math.hypot(dx, dy, dz);

      // Distancia cámara-planet para LOD de sprite
      const cdx = p.position.x - cam.position.x;
      const cdy = p.position.y - cam.position.y;
      const cdz = p.position.z - cam.position.z;
      const distCam = Math.hypot(cdx, cdy, cdz);

  // LOD de sprite: a partir de 50k u, render como billboard para mayor estabilidad/ rendimiento
  // EXCEPCIÓN: el Sol nunca usa sprite para asegurar el glow y la estabilidad de brillo
  if (this.billboardRenderer && distCam >= SPRITE_LOD_DISTANCE && !isSun) {
        // Calcular diámetro en píxeles según tamaño angular geométrico y clamp
        const Rw = (p as any).scale?.x ?? 1;
        let diameterPx = (2 * Rw * viewportH) / (Math.max(1e-3, distCam) * fovV);
        diameterPx = Math.max(8, Math.min(256, diameterPx));
          // Textura: especial para Tierra partida, genérica circular para otros (tint = blanco)
        const isEarthSplit = (p as any).planetType === 'Tierra';
          const isEarthBillboard = isEarthSplit || p.id === 'planet-earth';
        // Calcular dirección de luz desde el Sol al planeta para iluminación dinámica
        let lightDir: { x: number; y: number; z: number } | undefined;
        if (this.gameState.sun) {
          // Vector desde planeta hacia Sol (normalizado)
          const toSunX = this.gameState.sun.position.x - p.position.x;
          const toSunY = this.gameState.sun.position.y - p.position.y;
          const toSunZ = this.gameState.sun.position.z - p.position.z;
          const sunDist = Math.sqrt(toSunX * toSunX + toSunY * toSunY + toSunZ * toSunZ) || 1;
          const sunDirWorldX = toSunX / sunDist;
          const sunDirWorldY = toSunY / sunDist;
          const sunDirWorldZ = toSunZ / sunDist;
          
          // Calcular base de cámara para transformar a espacio de vista
          const camToPlanetX = p.position.x - cam.position.x;
          const camToPlanetY = p.position.y - cam.position.y;
          const camToPlanetZ = p.position.z - cam.position.z;
          const camToPlanetDist = Math.sqrt(camToPlanetX*camToPlanetX + camToPlanetY*camToPlanetY + camToPlanetZ*camToPlanetZ) || 1;
          // Forward = dirección hacia el planeta (normalizado)
          const fwdX = camToPlanetX / camToPlanetDist;
          const fwdY = camToPlanetY / camToPlanetDist;
          const fwdZ = camToPlanetZ / camToPlanetDist;
          
          // Right = forward x up (producto cruz)
          const upX = cam.up.x, upY = cam.up.y, upZ = cam.up.z;
          const rightX = fwdY * upZ - fwdZ * upY;
          const rightY = fwdZ * upX - fwdX * upZ;
          const rightZ = fwdX * upY - fwdY * upX;
          const rightLen = Math.sqrt(rightX*rightX + rightY*rightY + rightZ*rightZ) || 1;
          const rightNormX = rightX / rightLen;
          const rightNormY = rightY / rightLen;
          const rightNormZ = rightZ / rightLen;
          
          // Up = right x forward (reorthonormalizado)
          const upNewX = rightNormY * fwdZ - rightNormZ * fwdY;
          const upNewY = rightNormZ * fwdX - rightNormX * fwdZ;
          const upNewZ = rightNormX * fwdY - rightNormY * fwdX;
          
          // Proyectar dirección del Sol en el espacio de vista del billboard
          // X = componente a la derecha (right), Y = componente arriba (up), Z = profundidad (forward)
          const lightViewX = sunDirWorldX * rightNormX + sunDirWorldY * rightNormY + sunDirWorldZ * rightNormZ;
          const lightViewY = sunDirWorldX * upNewX + sunDirWorldY * upNewY + sunDirWorldZ * upNewZ;
          const lightViewZ = sunDirWorldX * fwdX + sunDirWorldY * fwdY + sunDirWorldZ * fwdZ;
          
          lightDir = { x: lightViewX, y: lightViewY, z: Math.abs(lightViewZ) + 0.5 }; // Asegurar z positivo para visibilidad
        }
        const tex = isEarthSplit
          ? this.billboardRenderer.getEarthSplitTexture()
          : this.billboardRenderer.getCircleTexture(this.rgbToHex(p.color.r, p.color.g, p.color.b), lightDir);
        const tint: [number,number,number,number] = [1,1,1,1];
        // Compute camera basis (forward from target-position; right = forward x up; up re-orthonormalized)
        const fwdU = this.normalize({ x: cam.target.x - cam.position.x, y: cam.target.y - cam.position.y, z: cam.target.z - cam.position.z });
        const upW = cam.up;
        const right = this.normalize({ x: fwdU.y*upW.z - fwdU.z*upW.y, y: fwdU.z*upW.x - fwdU.x*upW.z, z: fwdU.x*upW.y - fwdU.y*upW.x });
        const upB = { x: right.y*fwdU.z - right.z*fwdU.y, y: right.z*fwdU.x - right.x*fwdU.z, z: right.x*fwdU.y - right.y*fwdU.x };
        // If planet is Ringed (e.g., Saturn), draw ring in two parts: upper half behind, lower half in front
        const isRinged = ((p as any)?.planetType === PlanetType.Ringed || String((p as any)?.planetType||'').toLowerCase()==='ringed');
        const earthRingDiameterPx = isEarthBillboard ? Math.min(320, diameterPx * 1.25) : 0;
        if (isEarthBillboard) {
          const ringTexUpper = this.billboardRenderer.getRingTextureUpper('ring-earth');
          this.billboardRenderer.render(
            p.position,
            earthRingDiameterPx,
            cam.viewMatrix,
            cam.projectionMatrix,
            cam.position,
            upB,
            right,
            [0.85,0.95,1,0.7],
            ringTexUpper
          );
        }
        if (isRinged) {
          const ringTexUpper = this.billboardRenderer.getRingTextureUpper('ring-saturn');
          const ringDiameterPx = Math.min(384, diameterPx * 2.2);
          // Render upper half of ring first (behind planet)
          this.billboardRenderer.render(
            p.position,
            ringDiameterPx,
            cam.viewMatrix,
            cam.projectionMatrix,
            cam.position,
            upB,
            right,
            [1,1,1,0.98],
            ringTexUpper
          );
        }
        // Render planet sphere
        this.billboardRenderer.render(
          p.position,
          diameterPx,
          cam.viewMatrix,
          cam.projectionMatrix,
          cam.position,
          upB,
          right,
          tint,
          tex
        );
        // If ringed, render lower half of ring in front of planet
        if (isRinged) {
          const ringTexLower = this.billboardRenderer.getRingTextureLower('ring-saturn');
          const ringDiameterPx = Math.min(384, diameterPx * 2.2);
          this.billboardRenderer.render(
            p.position,
            ringDiameterPx,
            cam.viewMatrix,
            cam.projectionMatrix,
            cam.position,
            upB,
            right,
            [1,1,1,0.98],
            ringTexLower
          );
        }
        if (isEarthBillboard) {
          const ringTexLower = this.billboardRenderer.getRingTextureLower('ring-earth');
          this.billboardRenderer.render(
            p.position,
            earthRingDiameterPx,
            cam.viewMatrix,
            cam.projectionMatrix,
            cam.position,
            upB,
            right,
            [0.85,0.95,1,0.85],
            ringTexLower
          );
        }
        // Saltar render geométrico y pases especiales (caps/glow) en modo sprite
        continue;
      }

      // Render normal; caps emisivas se pintan en un segundo pase después

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
        } else {
          // Sun core: self-lit, flat color (estable a grandes distancias)
          this.shaderManager.useBasicProgram();
          this.calculateNormalMatrix(p.modelMatrix);
          this.shaderManager.setBasicMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
          p.render(this.gl, this.shaderManager.basicProgram!, cam.viewMatrix, cam.projectionMatrix);
        }
      } else if (distShip < 5000) {
        // Cercano: texturizado tintado con baseColor (detalle alto)
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
        // Emissive point light from Earth's core (only for Earth)
        if (p.id === 'planet-earth') {
          const lp = new Float32Array([p.position.x, p.position.y, p.position.z]);
          const lc = new Float32Array([1.0, 0.25, 0.05]);
          this.shaderManager.setPointLightTextured(lp, lc, 2.0, 1500.0, true);
        } else {
          const lp = new Float32Array([0,0,0]);
          const lc = new Float32Array([0,0,0]);
          this.shaderManager.setPointLightTextured(lp, lc, 0.0, 0.0, false);
        }
        p.render(this.gl, this.shaderManager.texturedProgram!, cam.viewMatrix, cam.projectionMatrix);
      } else if (distShip < 20000) {
        // Medio: por defecto lit sin especular para estabilidad; EXCEPCIÓN Tierra: mantener shader texturizado
        const isEarth = p.id === 'planet-earth' || (p as any).planetType === 'Tierra';
        if (isEarth) {
          // Mantener texturas visibles en semiesferas a media distancia
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
          this.shaderManager.setPointLightTextured(lp, lc, 1.5, 2000.0, true);
          p.render(this.gl, this.shaderManager.texturedProgram!, cam.viewMatrix, cam.projectionMatrix);
        } else {
          this.shaderManager.useLitProgram();
          this.calculateNormalMatrix(p.modelMatrix);
          this.shaderManager.setLitMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
          this.shaderManager.setLighting(lightDir, lightColorLocal, this.ambientColor, ambientStrengthLocal);
          // Anular especular en mid-range (reduce ruido por precisión)
          const camPos = new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]);
          this.shaderManager.setSpecular(camPos, 0.0, 1.0);
          this.shaderManager.setLitColor(new Float32Array([p.color.r, p.color.g, p.color.b]));
          // Sin punto emisivo en el resto
          const lp = new Float32Array([0,0,0]);
          const lc = new Float32Array([0,0,0]);
          this.shaderManager.setPointLightLit(lp, lc, 0.0, 0.0, false);
          p.render(this.gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
        }
      } else {
        // Lejano: sin iluminación (flat color) para máxima estabilidad visual
        this.shaderManager.useBasicProgram();
        // Reutilizar la misma normalMatrix para consistencia en model transform, aunque basic no usa normal
        this.calculateNormalMatrix(p.modelMatrix);
        this.shaderManager.setBasicMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
        // El color por vértice ya es el base del planeta (generateVertexColors), así evitamos uniforms extra
        p.render(this.gl, this.shaderManager.basicProgram!, cam.viewMatrix, cam.projectionMatrix);
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
    const toByte = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(toByte(r))}${h(toByte(g))}${h(toByte(b))}`;
  }

  /** Renderiza los mega-asteroides de debris vinculados a planetas con un LOD simple */
  private renderPlanetDebris(): void {
    if (!this.gl || !this.shaderManager) return;
    const cam = this.camera;
    const camPosArr = new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]);
    // Culling específico: si la cámara está a >= SPRITE LOD (~50,000u), no renderizar debris de ese planeta
    const SPRITE_LOD_DISTANCE = 50000;
    const earth = this.gameState.findPlanetById('planet-earth');
    const saturn = this.gameState.findPlanetById('planet-saturn');
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
      if ((skipEarth && pid === 'planet-earth') || (skipSaturn && pid === 'planet-saturn')) continue;
      for (const d of arr) {
        const a = d.obj;
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
    const fwd = this.normalize({ x: this.camera.target.x - camPos.x, y: this.camera.target.y - camPos.y, z: this.camera.target.z - camPos.z });
    // Ensure up basis is orthonormal
    const worldUp = this.camera.up;
    const right = this.normalize({
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

    // Verificar que la nave tiene buffers inicializados
    if (!this.spaceship.vertexBuffer) {
  this.logger.log(LogLevel.ERROR, LogCategory.RENDER, 'Spaceship has no vertex buffer - skipping render');
      return;
    }

    // Aislar: la nave se renderiza SOLO con el shader lit
    this.resetGLForLitDraw();

    // Debug: attribute collision check once
    if (!this.onceLoggedAttribCollision) {
      const litNormalIdx = this.shaderManager.litAttributes['normal'];
      const basicColorIdx = this.shaderManager.basicAttributes['color'];
  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Attrib indices check', { litNormalIdx, basicColorIdx, equal: litNormalIdx === basicColorIdx });
      this.onceLoggedAttribCollision = true;
    }

    // Calcular matriz normal
    this.calculateNormalMatrix(this.spaceship.modelMatrix);
    // Configurar matrices para lit y asegurar iluminación
    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );
    // Iluminación de la nave: dirigir la luz desde el Sol hacia la nave si existe
    let shipLightDir = this.lightDirection;
    let shipLightColor = this.lightColor;
    if (this.gameState.sun) {
      const lx = this.spaceship.position.x - this.gameState.sun.position.x;
      const ly = this.spaceship.position.y - this.gameState.sun.position.y;
      const lz = this.spaceship.position.z - this.gameState.sun.position.z;
      const len = Math.hypot(lx, ly, lz) || 1;
      shipLightDir = new Float32Array([lx / len, ly / len, lz / len]);
      // Luz algo más cálida para la nave
      shipLightColor = new Float32Array([1.0, 0.95, 0.8]);
    }
    this.shaderManager.setLighting(
      shipLightDir,
      shipLightColor,
      this.ambientColor,
      this.ambientStrength
    );
    // Habilitar iluminación a doble cara para evitar caras negras en módulos finos (alas)
    // Usamos setPointLightLit con intensidad 0 como vector para fijar u_twoSidedLighting = 1.0
    this.shaderManager.setPointLightLit(new Float32Array([0,0,0]), new Float32Array([0,0,0]), 0.0, 0.0, true);

  // Debug: before ship modules, check a_normal enabled state
  this.debugNormalAttribEnabled('before-ship-modules');

  // Renderizar usando el método texturizado personalizado
  this.renderModularSpaceship();

  // Debug: after ship modules
  this.debugNormalAttribEnabled('after-ship-modules');
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
   * Renderiza la nave con atributos de textura
   */
  private renderTexturedSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const program = this.shaderManager.texturedProgram;
    if (!program) return;

    // Configurar atributos de posición
    const positionLocation = this.shaderManager.texturedAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.vertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar atributos de normales
    const normalLocation = this.shaderManager.texturedAttributes['normal'];
    if (normalLocation >= 0 && this.spaceship.normalBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.normalBuffer);
      this.gl.enableVertexAttribArray(normalLocation);
      this.gl.vertexAttribPointer(normalLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar atributos UV
    const uvLocation = this.shaderManager.texturedAttributes['uv'];
    if (uvLocation >= 0 && this.spaceship.uvBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.uvBuffer);
      this.gl.enableVertexAttribArray(uvLocation);
      this.gl.vertexAttribPointer(uvLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    // Dibujar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.spaceship.indexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, this.spaceship.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar atributos
    if (positionLocation >= 0) this.gl.disableVertexAttribArray(positionLocation);
    if (normalLocation >= 0) this.gl.disableVertexAttribArray(normalLocation);
    if (uvLocation >= 0) this.gl.disableVertexAttribArray(uvLocation);
  }

  /**
   * Renderiza la nave con componentes modulares
   */
  private renderModularSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // Renderizar cada componente de la nave por separado
    this.renderSpaceshipNose();
    this.renderSpaceshipBody();
    this.renderSpaceshipCockpit();  // Cabina del piloto
    this.renderSpaceshipEngineNozzle();  // Tubo del motor
    this.renderSpaceshipWings();
    this.renderSpaceshipThruster();
    // this.renderOrientationIndicator(); // Temporalmente deshabilitada
    
  // HUD se renderiza al final del frame para asegurar que quede por encima de todo
    
    // Renderizar sistema de retícula (FASE 2)
    this.renderReticleSystem();

    // Debug: after reticle render, check which program is active
    if (this.gl) {
      const prog = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Program after reticle render', { programId: prog ? (prog as any) : null });
    }
  }

  // Ensure VAO and buffers for a ship module; compute normals once
  private ensureShipModuleVAO(
    key: keyof GameEngine['shipVAO'],
    geometry: { vertices: Float32Array; indices: Uint16Array },
    normalAttribName: 'normal' = 'normal'
  ): void {
    if (!this.gl || !this.shaderManager) return;
    // Create buffers if missing
    if (!this.shipBuffers[key]) {
      const v = this.gl.createBuffer()!;
      const n = this.gl.createBuffer()!;
      const i = this.gl.createBuffer()!;
      // Upload geometry
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, v);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.vertices, this.gl.STATIC_DRAW);
      const normals = this.computeNormals(geometry.vertices, geometry.indices);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, n);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, i);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.STATIC_DRAW);
      this.shipBuffers[key] = { v, n, i, indexCount: geometry.indices.length } as any;
    }
    // Create VAO if missing
    if (!this.shipVAO[key]) {
      const vao = this.gl.createVertexArray();
      if (!vao) return;
      this.shipVAO[key] = vao;
      this.gl.bindVertexArray(vao);
      // Bind attribute layout for lit program
      const aPos = this.shaderManager.litAttributes['position'];
      const aNrm = this.shaderManager.litAttributes[normalAttribName];
      // Position
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers[key]!.v);
      if (aPos >= 0) {
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 3, this.gl.FLOAT, false, 0, 0);
      }
      // Normal
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers[key]!.n);
      if (aNrm >= 0) {
        this.gl.enableVertexAttribArray(aNrm);
        this.gl.vertexAttribPointer(aNrm, 3, this.gl.FLOAT, false, 0, 0);
      }
      // Indices
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.shipBuffers[key]!.i);
      // Unbind VAO
      this.gl.bindVertexArray(null);
    }
  }

  private drawShipModule(key: keyof GameEngine['shipVAO']): void {
    if (!this.gl) return;
    if (!this.shipVAO[key] || !this.shipBuffers[key]) return;
    this.gl.bindVertexArray(this.shipVAO[key]);
    this.gl.drawElements(this.gl.TRIANGLES, this.shipBuffers[key]!.indexCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.bindVertexArray(null);
  }

  /**
   * Renderiza el cono/pirámide de la punta delantera (textura naranja)
   */
  private renderSpaceshipNose(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // No renderizar el nose en modo COCKPIT para tener vista despejada
    const isInCockpitMode = this.camera.getCurrentMode() === CameraMode.COCKPIT;
    if (isInCockpitMode) {
      return; // Salir sin renderizar nada
    }

    const noseGeometry = this.spaceship.createNoseGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;
    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('nose', noseGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color naranja para el nose (asegurar baseColor por módulo)
  this.shaderManager.setLitColor(new Float32Array([1.0, 0.6, 0.2]));

    // Draw
    this.drawShipModule('nose');
  }

  /**
   * Renderiza el cuerpo esférico principal (textura metálica)
   */
  private renderSpaceshipBody(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const bodyGeometry = this.spaceship.createBodyGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('body', bodyGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color metálico plateado para el body (asegurar baseColor por módulo)
  this.shaderManager.setLitColor(new Float32Array([0.7, 0.7, 0.8]));
    // Especular metálico medio para el cuerpo
    this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.25, 48.0);

    // Draw
    this.drawShipModule('body');
  }

  /**
   * Renderiza la cabina del piloto (esfera azul oscuro reflectante)
   */
  private renderSpaceshipCockpit(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // No renderizar la cabina en modo COCKPIT para tener vista despejada
    const isInCockpitMode = this.camera.getCurrentMode() === CameraMode.COCKPIT;
    if (isInCockpitMode) {
      return; // Salir sin renderizar nada
    }

  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Renderizando cabina del piloto');
  const cockpitGeometry = this.spaceship.createCockpitGeometry();
  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Geometría de cabina creada', { vertices: cockpitGeometry.vertices.length });
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('cockpit', cockpitGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color azul eléctrico para la cabina del piloto (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.0, 0.5, 1.0])); 

    // Draw
    this.drawShipModule('cockpit');
  }

  /**
   * Renderiza el tubo del motor que conecta el cuerpo con el thruster
   */
  private renderSpaceshipEngineNozzle(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Renderizando tubo del motor');
  const nozzleGeometry = this.spaceship.createEngineNozzleGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('nozzle', nozzleGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color metálico oscuro para el tubo del motor (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.4, 0.4, 0.45])); // Gris metálico

    // Draw
    this.drawShipModule('nozzle');
  }

  /**
   * Renderiza las alas laterales (textura azul metálica)
   */
  private renderSpaceshipWings(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

  const wingsGeometry = this.spaceship.createWingsGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('wings', wingsGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color azul metálico para las wings (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.2, 0.4, 0.8]));

    // Draw
    this.drawShipModule('wings');
  }

  /**
   * Renderiza la esfera del thruster trasero (color dinámico rojo→amarillo)
   */
  private renderSpaceshipThruster(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

  const thrusterGeometry = this.spaceship.createThrusterGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('thruster', thrusterGeometry);

    // Si el factor de escala del thruster ha cambiado, actualizar los buffers con nueva geometría
    const currentScale = this.spaceship.thrusterScaleFactor;
    if (this.shipBuffers['thruster'] && Math.abs(currentScale - this.lastThrusterScale) > 0.005) {
      const geom = this.spaceship.createThrusterGeometry();
      const normals = this.computeNormals(geom.vertices, geom.indices);
      // Re-subir datos a los buffers existentes
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers['thruster']!.v);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, geom.vertices, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers['thruster']!.n);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.shipBuffers['thruster']!.i);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geom.indices, this.gl.STATIC_DRAW);
      this.shipBuffers['thruster']!.indexCount = geom.indices.length;
      this.lastThrusterScale = currentScale;
    } else if (!this.shipBuffers['thruster']) {
      // Primera creación: registrar el scale actual
      this.lastThrusterScale = currentScale;
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color dinámico del thruster basado en velocidad: rojo (0) → naranja (medio) → amarillo (máx)
    const speedRatio = Math.max(0, Math.min(1, this.spaceship.currentSpeed / Math.max(1e-6, this.spaceship.maxSpeed)));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const mix = (c0: [number,number,number], c1: [number,number,number], t: number): [number,number,number] => [
      lerp(c0[0], c1[0], t),
      lerp(c0[1], c1[1], t),
      lerp(c0[2], c1[2], t)
    ];
    // Escalera/gradiente: rojo → naranja → amarillo
    const RED: [number,number,number] = [1.0, 0.15, 0.05];
    const ORANGE: [number,number,number] = [1.0, 0.6, 0.0];
    const YELLOW: [number,number,number] = [1.0, 0.95, 0.2];

    let color: [number,number,number] = RED;
    if (speedRatio <= 0.5) {
      color = mix(RED, ORANGE, speedRatio / 0.5);
    } else {
      color = mix(ORANGE, YELLOW, (speedRatio - 0.5) / 0.5);
    }
    // Ajuste de brillo para simular emisivo leve según actividad
    let brightness = 1.0;
    switch (this.spaceship.thrusterState) {
      case ThrusterState.IDLE:
        brightness = 0.9;
        break;
      case ThrusterState.BRAKING:
        // Frenando: rojo más intenso independientemente de la velocidad
        color = [1.2, 0.2, 0.08];
        brightness = 1.8;
        break;
      case ThrusterState.ACCELERATING:
      case ThrusterState.CRUISING:
        brightness = 1.0 + speedRatio * 1.1; // hasta ~2.1 en máximo
        break;
    }
    const red = color[0] * brightness;
    const green = color[1] * brightness;
    const blue = color[2] * brightness;

    this.shaderManager.setLitColor(new Float32Array([red, green, blue]));
  // Especular alto para tobera brillante
  this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.4, 64.0);

  // Draw
  this.drawShipModule('thruster');

    // NO RESETEAR COLOR - dejar que cada objeto maneje el suyo

    // No buffer deletion; cached
  }

  /**
   * Renderiza una bola negra indicadora de orientación (arriba de la nave)
   */
  private renderOrientationIndicator(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // Usar la geometría del thruster pero más pequeña (esfera)
    const indicatorGeometry = this.spaceship.createThrusterGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales
    const indicatorVertexBuffer = this.gl.createBuffer();
    const indicatorIndexBuffer = this.gl.createBuffer();

    // Configurar geometría
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, indicatorGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indicatorIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indicatorGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Crear geometría modificada: más pequeña y desplazada hacia arriba
    const modifiedVertices = new Float32Array(indicatorGeometry.vertices.length);
    
    // Escalar los vértices (hacer la bola más pequeña) y desplazar hacia arriba
    for (let i = 0; i < indicatorGeometry.vertices.length; i += 3) {
      modifiedVertices[i] = indicatorGeometry.vertices[i] * 0.3;         // X * 0.3 (más pequeña)
      modifiedVertices[i + 1] = indicatorGeometry.vertices[i + 1] * 0.3 + 0.4; // Y * 0.3 + 0.4 (arriba)
      modifiedVertices[i + 2] = indicatorGeometry.vertices[i + 2] * 0.3 + 0.2; // Z * 0.3 + 0.2 (adelante)
    }
    
    // Actualizar el buffer con la geometría modificada
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, modifiedVertices, this.gl.STATIC_DRAW);
    
    // Usar la matriz modelo de la nave directamente
    this.spaceship.updateModelMatrix();
    
    // Usar directamente la matriz de la nave (más simple)
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // NO establecer color específico - usar el color por defecto del sistema
    // Los asteroides manejan sus propios colores internamente

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indicatorIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, indicatorGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(indicatorVertexBuffer);
    this.gl.deleteBuffer(indicatorIndexBuffer);
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

  // Debug helper: check if lit.a_normal attribute array is enabled in default VAO
  private debugNormalAttribEnabled(where: string): void {
    if (!this.gl || !this.shaderManager) return;
    const idx = this.shaderManager.litAttributes['normal'];
    if (idx < 0) return;
    const enabled = !!this.gl.getVertexAttrib(idx, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
    if (this.lastNormalAttribEnabled !== enabled) {
  this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'a_normal enabled state changed', { where, enabled });
      this.lastNormalAttribEnabled = enabled;
    }
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

  // Calcula normales por vértice acumulando normales de cara y normalizando
  private computeNormals(vertices: Float32Array, indices: Uint16Array): Float32Array {
    const vCount = vertices.length / 3;
    const normals = new Float32Array(vertices.length);
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      const v0x = vertices[i0], v0y = vertices[i0 + 1], v0z = vertices[i0 + 2];
      const v1x = vertices[i1], v1y = vertices[i1 + 1], v1z = vertices[i1 + 2];
      const v2x = vertices[i2], v2y = vertices[i2 + 1], v2z = vertices[i2 + 2];
      const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
      const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
      // Cross e1 x e2
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
      normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
      normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
    }
    // Normalize
    for (let i = 0; i < vCount; i++) {
      const ix = i * 3;
      const nx = normals[ix], ny = normals[ix + 1], nz = normals[ix + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[ix] = nx / len; normals[ix + 1] = ny / len; normals[ix + 2] = nz / len;
    }
    return normals;
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

  private isLandingDamageSuppressed(): boolean {
    return this.landingDamageSuppressed;
  }

  /**
   * Maneja eventos de teclado
   */
  private areSpellGameplayInputsLocked(): boolean {
    try {
      return this.spellIOCoordinator?.areGameplayInputsLocked() ?? this.animationManager.isBlockingInputs();
    } catch {
      return this.animationManager.isBlockingInputs();
    }
  }

  private arePanelsLockedBySpell(): boolean {
    try {
      return this.spellIOCoordinator?.arePanelsLocked() ?? this.animationManager.isBlockingInputs();
    } catch {
      return this.animationManager.isBlockingInputs();
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
    // Block most inputs during animations/pre-cast delay; allow Escape to close panels
    if (this.areSpellGameplayInputsLocked() && key.toLowerCase() !== 'escape') {
      return;
    }
    // Manejo de cambio de modos de cámara
    if (key === '0') {
      this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
      return;
    } else if (key === '7') {
      this.camera.setCameraMode(CameraMode.REAR_VIEW);
      return;
    } else if (key === '8') {
      this.camera.setCameraMode(CameraMode.COCKPIT);
      return;
    } else if (key === '9') {
      this.camera.setCameraMode(CameraMode.REAR_TRACKING);
      return;
    }

    if (key.toLowerCase() === 'enter') {
      if (this.tryStartLandingSequence()) {
        return;
      }
    }

    if (this.tryActivateAuxiliaryAbilityForKey(key)) {
      return;
    }

    // Manejo de controles de nave
    if (this.spaceship && !this.areSpellGameplayInputsLocked()) {
      this.updateShipControls(key, true);
    }
    // Toggle panel de mapa del sistema con tecla 'M'
    if (key.toLowerCase() === 'm') {
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
          this.gameState.mapReopenAllowedAtMs = now + 1000;
          this.clearPanelCursorOverlay();
        }
        // Ensure mutual exclusivity with Grimoire
        if (this.systemPanel.isEnabled() && this.grimoirePanel) {
          try { 
            this.grimoirePanel.setEnabled(false); 
            this.gameState.grimoireReopenAllowedAtMs = performance.now() + 1000;
          } catch {}
        }
        if (this.systemPanel.isEnabled() && this.inventoryPanel?.isEnabled()) {
          try {
            this.inventoryPanel.setEnabled(false);
            this.inventoryPanel.resetScroll();
            this.clearInventorySelection();
            this.gameState.inventoryReopenAllowedAtMs = now + 1000;
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
    if (key.toLowerCase() === 'g') {
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
          this.gameState.grimoireReopenAllowedAtMs = now + 1000;
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
            this.gameState.mapReopenAllowedAtMs = performance.now() + 1000;
          } catch {}
        }
        if (this.grimoirePanel.isEnabled() && this.inventoryPanel?.isEnabled()) {
          try {
            this.inventoryPanel.setEnabled(false);
            this.inventoryPanel.resetScroll();
            this.clearInventorySelection();
            this.gameState.inventoryReopenAllowedAtMs = now + 1000;
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
    if (key.toLowerCase() === 'i') {
      if (this.arePanelsLockedBySpell()) {
        this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Inventory toggle blocked by spell IO lock');
        return;
      }
      this.handleInventoryToggle();
      return;
    }
    // Escape: cerrar paneles (mapa, grimorio, inventario) o limpiar selección
    if (key.toLowerCase() === 'escape') {
      this.handleEscape();
      return;
    }
    // Fase 2: lanzar hechizo con 'h' (desde el grimorio o recordando el seleccionado)
    if (key.toLowerCase() === 'h') {
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
          this.gameState.mapReopenAllowedAtMs = performance.now() + 1000;
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
    if (this.camera && this.camera.getCurrentMode() !== CameraMode.INMOVILE_EXTERNAL) {
      this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
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
    const typeName = target.constructor?.name || '';
    if (typeof target.getTargetType === 'function') {
      const t = String(target.getTargetType());
      if (t.toLowerCase().includes('asteroid')) {
        return true;
      }
    }
    return typeName.includes('Asteroid');
  }

  /**
   * Start the Material Disruption Rite beam animation
   */
  public startDisruptionBeam(targetPos: { x: number; y: number; z: number }, target: any): void {
    if (!this.spaceship) return;
    
    // Get ship's cockpit position (forward from center)
    const shipPos = { ...this.spaceship.position };
    
    this.disruptionBeam = {
      active: true,
      startPos: shipPos,
      endPos: targetPos,
      target: target,
      startTime: performance.now(),
      duration: 1500 // 1.5 seconds beam duration
    };
    
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Disruption beam started', { 
      distance: Math.hypot(targetPos.x - shipPos.x, targetPos.y - shipPos.y, targetPos.z - shipPos.z) 
    });
  }

  /**
   * Update disruption beam animation and apply damage
   */
  private updateDisruptionBeam(): void {
    if (!this.disruptionBeam || !this.disruptionBeam.active) return;
    
    const now = performance.now();
    const elapsed = now - this.disruptionBeam.startTime;
    
    // Recalculate beam positions each frame (ship and target move)
    if (this.spaceship) {
      this.disruptionBeam.startPos = { ...this.spaceship.position };
    }
    
    if (this.disruptionBeam.target?.position) {
      this.disruptionBeam.endPos = { ...this.disruptionBeam.target.position };
    }
    
    if (elapsed >= this.disruptionBeam.duration) {
      // Beam finished - destroy target if it's an asteroid
      const target = this.disruptionBeam.target;
      const typeName = target?.constructor?.name || '';
      
      if (typeName.includes('Asteroid')) {
        // Apply lethal damage (triggers reactive destruction system)
        this.applyDamageToObject(target, target.healthMax || 9999);
      }
      
      // Deactivate beam
      this.disruptionBeam = null;
    }
  }

  /**
   * Render disruption beam (purple line from ship to target)
   */
  private renderDisruptionBeam(): void {
    if (!this.gl || !this.disruptionBeam || !this.disruptionBeam.active) return;
    
    const gl = this.gl;
    const beam = this.disruptionBeam;
    
    // Calculate animation progress (0 to 1)
    const elapsed = performance.now() - beam.startTime;
    const progress = Math.min(1, elapsed / beam.duration);
    
    // Pulsing intensity
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 0.01);
    
    // Use basic shader for the beam
    this.shaderManager.useBasicProgram();
    
    // Create beam geometry (thick line with triangles)
    const thickness = 0.15 * pulse;
    const start = beam.startPos;
    const end = beam.endPos;
    
    // Direction vector
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    
    if (length < 0.01) return;
    
    // Perpendicular vectors for quad
    const right = { x: -dy, y: dx, z: 0 };
    const rightLen = Math.hypot(right.x, right.y, right.z);
    if (rightLen > 0.01) {
      right.x /= rightLen;
      right.y /= rightLen;
      right.z /= rightLen;
    }
    
    // Beam quad vertices
    const vertices = new Float32Array([
      start.x - right.x * thickness, start.y - right.y * thickness, start.z - right.z * thickness,
      start.x + right.x * thickness, start.y + right.y * thickness, start.z + right.z * thickness,
      end.x - right.x * thickness, end.y - right.y * thickness, end.z - right.z * thickness,
      end.x + right.x * thickness, end.y + right.y * thickness, end.z + right.z * thickness
    ]);
    
    // Purple/magenta color with fade
    const alpha = progress < 0.1 ? (progress / 0.1) : (progress > 0.9 ? (1 - progress) / 0.1 : 1);
    const r = 0.8 * alpha * pulse;
    const g = 0.4 * alpha * pulse;
    const b = 1.0 * alpha * pulse;
    
    const colors = new Float32Array([
      r, g, b,
      r, g, b,
      r*0.7, g*0.7, b*0.7,
      r*0.7, g*0.7, b*0.7
    ]);
    
    // Create temporary buffers
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    
    if (!vbo || !cbo) return;
    
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    
    const posLoc = this.shaderManager.basicAttributes['position'];
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    
    const colorLoc = this.shaderManager.basicAttributes['color'];
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    
    // Set matrices
    const identity = new Float32Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    this.shaderManager.setBasicMatrices(identity, this.camera.viewMatrix, this.camera.projectionMatrix);
    
    // Enable blending for transparency and force overlay above planets/billboards
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive for glow effect
    const depthTestWasEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthTestWasEnabled) {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.depthMask(false);
    
    // Draw beam
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    // Restore state
    gl.depthMask(true);
    if (depthTestWasEnabled) {
      gl.enable(gl.DEPTH_TEST);
    }
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colorLoc);
    
    // Cleanup temporary buffers
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(cbo);
  }

  /** Launches the Anchoring Pulse tether beam */
  public startAnchoringPulseBeam(target: Asteroid): void {
    if (!this.spaceship || !target) return;
    const targetPos = this.getTargetPosition(target);
    if (!targetPos) return;
    try { this.makeAsteroidIndependent(target); } catch {}
    this.anchoringPulseBeam = {
      active: true,
      target,
      startPos: { ...this.spaceship.position },
      endPos: targetPos,
      startTime: performance.now(),
      maxDuration: Number.POSITIVE_INFINITY,
      pullSpeed: 2.0,
      captureRadius: 4.5,
    };
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Anchoring Pulse beam engaged', {
      targetId: target.id,
      composition: (target as any).composition ?? 'unknown'
    });
  }

  private updateAnchoringPulseBeam(deltaTime: number): void {
    if (!this.anchoringPulseBeam?.active || !this.spaceship) return;
    const beam = this.anchoringPulseBeam;
    const target = beam.target;
    if (!target || !this.isAsteroidTarget(target)) {
      this.finishAnchoringPulseBeam('canceled');
      return;
    }
    if (typeof target.isActive === 'function' && !target.isActive()) {
      this.finishAnchoringPulseBeam('canceled');
      return;
    }
    beam.startPos = { ...this.spaceship.position };
    beam.endPos = { x: target.position.x, y: target.position.y, z: target.position.z };
    const elapsed = performance.now() - beam.startTime;
    if (elapsed > beam.maxDuration) {
      this.finishAnchoringPulseBeam('expired');
      return;
    }
    const dx = this.spaceship.position.x - target.position.x;
    const dy = this.spaceship.position.y - target.position.y;
    const dz = this.spaceship.position.z - target.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= beam.captureRadius) {
      const stored = this.convertAsteroidToCargo(target);
      this.finishAnchoringPulseBeam(stored ? 'converted' : 'canceled');
      return;
    }
    const step = Math.max(0, beam.pullSpeed * deltaTime);
    if (step > 0 && dist > 1e-3) {
      const ratio = Math.min(1, step / dist);
      target.position.x += dx * ratio;
      target.position.y += dy * ratio;
      target.position.z += dz * ratio;
      target.velocity.x = 0;
      target.velocity.y = 0;
      target.velocity.z = 0;
      target.angularVelocity.x = 0;
      target.angularVelocity.y = 0;
      target.angularVelocity.z = 0;
      target.updateModelMatrix();
      if (target.boundingSphere) {
        target.boundingSphere.center = { ...target.position };
      }
    }
  }

  private finishAnchoringPulseBeam(reason: 'converted' | 'expired' | 'canceled'): void {
    if (this.anchoringPulseBeam) {
      this.anchoringPulseBeam.active = false;
    }
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Anchoring Pulse beam finished', { reason });
    this.anchoringPulseBeam = null;
  }

  private renderAnchoringPulseBeam(): void {
    if (!this.gl || !this.anchoringPulseBeam?.active) return;
    const beam = this.anchoringPulseBeam;
    const gl = this.gl;
    const start = beam.startPos;
    const end = beam.endPos;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-3) return;
    const thickness = 0.12;
    const right = { x: -dy, y: dx, z: 0 };
    const rightLen = Math.hypot(right.x, right.y, right.z) || 1;
    right.x /= rightLen; right.y /= rightLen; right.z /= rightLen;
    const vertices = new Float32Array([
      start.x - right.x * thickness, start.y - right.y * thickness, start.z - right.z * thickness,
      start.x + right.x * thickness, start.y + right.y * thickness, start.z + right.z * thickness,
      end.x - right.x * thickness, end.y - right.y * thickness, end.z - right.z * thickness,
      end.x + right.x * thickness, end.y + right.y * thickness, end.z + right.z * thickness,
    ]);
    const pulse = 0.6 + 0.4 * Math.sin((performance.now() - beam.startTime) * 0.01);
    const r = 0.35 * pulse;
    const g = 0.9 * pulse;
    const b = 1.0 * pulse;
    const colors = new Float32Array([
      r, g, b,
      r, g, b,
      r * 0.8, g * 0.8, b * 0.9,
      r * 0.8, g * 0.8, b * 0.9,
    ]);
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    if (!vbo || !cbo) return;
    this.shaderManager.useBasicProgram();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    const posLoc = this.shaderManager.basicAttributes['position'];
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    const colorLoc = this.shaderManager.basicAttributes['color'];
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    const identity = new Float32Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    this.shaderManager.setBasicMatrices(identity, this.camera.viewMatrix, this.camera.projectionMatrix);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthEnabled) gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
    if (depthEnabled) gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colorLoc);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(cbo);
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
      try { this.hudManager?.addMarqueeMessage?.('Libera carga para anclar'); } catch {}
      return false;
    }
    const stored = this.spaceship.addCargo(yieldUnits);
    if (stored <= 0) {
      this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Cargo hold is full - cannot store asteroid', {
        targetId: target.id,
        yieldUnits,
      });
      try { this.hudManager?.addMarqueeMessage?.('Carga completa - libera espacio'); } catch {}
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
    try { this.hudManager?.addMarqueeMessage?.(`Carga +${stored}u`); } catch {}
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
    if (!this.spaceship || !targetPos) return;
    const baseScale = {
      x: target.scale?.x ?? target.size,
      y: target.scale?.y ?? target.size,
      z: target.scale?.z ?? target.size,
    };
    const baseSize = target.size ?? 1;
    const pixelRadius = 0.02; // ≈1px in world space at typical camera distances
    const minScalar = Math.max(pixelRadius / Math.max(0.01, baseSize), 0.01);
    this.voidKinesisBeam = {
      active: true,
      startPos: { ...this.spaceship.position },
      endPos: targetPos,
      target,
      startTime: performance.now(),
      maxDuration: 6000,
      shrinkRate: 0.85,
      currentScalar: 1,
      minScalar,
      baseScale,
      baseSize,
      pixelScalar: minScalar,
    };
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Void Kinesis beam started', {
      targetId: target.id,
      voidMassUnits: (target as any).voidMassUnits ?? null,
    });
  }

  private updateVoidKinesisBeam(deltaTime: number): void {
    if (!this.voidKinesisBeam?.active || !this.spaceship) return;
    const beam = this.voidKinesisBeam;
    const target = beam.target;
    if (!target || !this.isAsteroidTarget(target) || (typeof target.isActive === 'function' && !target.isActive())) {
      this.voidKinesisBeam = null;
      return;
    }
    beam.startPos = { ...this.spaceship.position };
    beam.endPos = { ...target.position };

    const elapsed = performance.now() - beam.startTime;
    if (elapsed >= beam.maxDuration) {
      this.resolveVoidKinesisConversion(target);
      return;
    }

    // Shrink asteroid visually until it "pixels out"
    const shrinkAmount = beam.shrinkRate * deltaTime;
    beam.currentScalar = Math.max(beam.minScalar, beam.currentScalar - shrinkAmount);
    const appliedScalar = beam.currentScalar;
    target.scale = {
      x: beam.baseScale.x * appliedScalar,
      y: beam.baseScale.y * appliedScalar,
      z: beam.baseScale.z * appliedScalar,
    };
    target.size = Math.max(beam.baseSize * appliedScalar, beam.baseSize * beam.pixelScalar);
    target.updateModelMatrix();
    if (target.boundingSphere) {
      target.boundingSphere.radius = Math.max(0.01, target.size * 2);
    }

    if (beam.currentScalar <= beam.pixelScalar + 1e-3) {
      this.resolveVoidKinesisConversion(target);
    }
  }

  private renderVoidKinesisBeam(): void {
    if (!this.gl || !this.voidKinesisBeam?.active) return;
    const beam = this.voidKinesisBeam;
    const gl = this.gl;
    const start = beam.startPos;
    const end = beam.endPos;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-3) return;
    const thickness = 0.18;
    const right = { x: -dy, y: dx, z: 0 };
    const rightLen = Math.hypot(right.x, right.y, right.z) || 1;
    right.x /= rightLen; right.y /= rightLen; right.z /= rightLen;
    const vertices = new Float32Array([
      start.x - right.x * thickness, start.y - right.y * thickness, start.z - right.z * thickness,
      start.x + right.x * thickness, start.y + right.y * thickness, start.z + right.z * thickness,
      end.x - right.x * thickness, end.y - right.y * thickness, end.z - right.z * thickness,
      end.x + right.x * thickness, end.y + right.y * thickness, end.z + right.z * thickness,
    ]);
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() - beam.startTime) * 0.02);
    const colors = new Float32Array([
      1.0 * pulse, 0.2 * pulse, 0.1 * pulse,
      1.0 * pulse, 0.2 * pulse, 0.1 * pulse,
      0.7 * pulse, 0.05 * pulse, 0.05 * pulse,
      0.7 * pulse, 0.05 * pulse, 0.05 * pulse,
    ]);
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    if (!vbo || !cbo) return;
    this.shaderManager.useBasicProgram();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    const posLoc = this.shaderManager.basicAttributes['position'];
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    const colorLoc = this.shaderManager.basicAttributes['color'];
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    const identity = new Float32Array(16);
    identity[0] = identity[5] = identity[10] = identity[15] = 1;
    this.shaderManager.setBasicMatrices(identity, this.camera.viewMatrix, this.camera.projectionMatrix);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST);
    if (depthEnabled) gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.depthMask(true);
    if (depthEnabled) gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colorLoc);
    gl.deleteBuffer(vbo);
    gl.deleteBuffer(cbo);
  }

  private ensureVoidCocoonShieldGeometry(): boolean {
    if (this.voidCocoonShieldGeometry?.vbo && this.voidCocoonShieldGeometry?.ibo) {
      return true;
    }
    if (!this.gl) {
      return false;
    }
    const gl = this.gl;
    const latSegments = 24;
    const lonSegments = 36;
    const positions: number[] = [];
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat / latSegments) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon / lonSegments) * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const x = cosPhi * sinTheta;
        const y = cosTheta;
        const z = sinPhi * sinTheta;
        positions.push(x, y, z);
      }
    }
    const stride = lonSegments + 1;
    const indexList: number[] = [];
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * stride + lon;
        const second = first + stride;
        indexList.push(first, second, first + 1);
        indexList.push(second, second + 1, first + 1);
      }
    }
    const positionArray = new Float32Array(positions);
    const indexArray = new Uint16Array(indexList);
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !ibo) {
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);
    this.voidCocoonShieldGeometry = { vbo, ibo, indexCount: indexArray.length };
    return true;
  }

  private renderVoidCocoonShield(): void {
    if (!this.gl || !this.shaderManager || !this.shaderManager.stormShellProgram) return;
    if (!this.spaceship || !this.camera) return;
    if (!this.voidCocoonActiveUntilMs) return;
    const now = performance.now();
    if (now >= this.voidCocoonActiveUntilMs) return;
    if (!this.ensureVoidCocoonShieldGeometry() || !this.voidCocoonShieldGeometry) return;

    const gl = this.gl;
    const mesh = this.voidCocoonShieldGeometry;
    const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = !!gl.getParameter(gl.DEPTH_WRITEMASK);
    const wasCull = gl.isEnabled(gl.CULL_FACE);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    const shieldRadius = Math.max(2.4, (this.spaceship.boundingSphere?.radius ?? 1.2) * 1.75);
    const modelMatrix = this.createThrusterMatrix(shieldRadius);
    if (!modelMatrix) return;
    const elapsedSec = (now - this.voidCocoonShieldStartMs) / 1000;
    const remainingSec = (this.voidCocoonActiveUntilMs - now) / 1000;
    const normalized = Math.max(0, Math.min(1, remainingSec / 30));
    const baseIntensity = 0.55 + 0.35 * normalized + 0.15 * Math.sin(elapsedSec * 2.4);
    const impactFlash = Math.min(1, Math.max(0, 1 - (now - this.voidCocoonLastImpactMs) / 350));

    this.shaderManager.useStormShellProgram();
    this.shaderManager.setStormShellMatrices(modelMatrix, this.camera.viewMatrix, this.camera.projectionMatrix);
    const baseColor = new Float32Array([0.08, 0.28, 0.42]);
    const veinColor = new Float32Array([0.45, 0.9, 1.0]);
    this.shaderManager.setStormShellParams(
      elapsedSec,
      Math.min(1.3, baseIntensity),
      Math.min(1, impactFlash),
      1.08,
      baseColor,
      veinColor,
    );

    const posLoc = this.shaderManager.stormShellAttributes['position'];
    if (posLoc !== undefined && posLoc >= 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(posLoc);
    }

    gl.depthMask(prevDepthMask);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    if (wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    gl.useProgram(prevProgram);
  }

  private resolveVoidKinesisConversion(target: Asteroid): void {
    if (!target || !this.isAsteroidTarget(target)) {
      this.voidKinesisBeam = null;
      return;
    }
    if (!this.spaceship) {
      this.voidKinesisBeam = null;
      return;
    }
    const gainInfo = this.calculateVoidEnergyGainFromAsteroid(target);
    const projected = this.spaceship.voidEnergyCurrent + gainInfo.gain;
    if (projected > this.spaceship.voidEnergyMax) {
      this.showPlaceholderText('RESERVA DEL VACÍO LLENA', 2000);
      this.voidKinesisBeam = null;
      return;
    }
    const gained = this.addVoidEnergyFromAsteroid(target, gainInfo);
    try {
      if (gained > 0) {
        this.hudManager?.addMarqueeMessage?.(`Energía del vacío +${gained}`);
      } else {
        this.hudManager?.addMarqueeMessage?.('Energía del vacío al máximo');
      }
    } catch {}
    this.voidKinesisBeam = null;
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
      try { this.showPlaceholderText('ANIMATION NUMBER 2.', 2000); } catch {}
      return false;
    }
    if (this.spaceship.voidEnergyCurrent < 50) {
      try { this.showPlaceholderText('ENERGÍA DEL VACÍO INSUFICIENTE (50u)', 2000); } catch {}
      return false;
    }
    if (!target) {
      try { this.showPlaceholderText('ANIMATION NUMBER 2.', 2000); } catch {}
      return false;
    }
    const targetPos = this.getTargetPosition(target);
    if (!targetPos) {
      try { this.showPlaceholderText('ANIMATION NUMBER 2.', 2000); } catch {}
      return false;
    }
    const dist = this.getDistanceFromShip(targetPos);
    if (dist <= 4000) {
      this.logger.log(LogLevel.INFO, LogCategory.TARGETING, '[VoidJump] Target demasiado cerca (<4000u)', { distance: Math.round(dist) });
      try { this.showPlaceholderText('ANIMATION NUMBER 2.', 2000); } catch {}
      return false;
    }
    this.spaceship.voidEnergyCurrent = Math.max(0, this.spaceship.voidEnergyCurrent - 50);
    try {
      this.animationManager.startVoidJump(this, target);
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
    try { this.hudManager?.addMarqueeMessage?.(`Concordia Gate · ${label}`); } catch {}
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
    if (!target || !this.isAsteroidTarget(target)) {
      this.showPlaceholderText('VOID KINESIS REQUIERE ASTEROIDE', 1500);
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

  private castVoidCocoon(): boolean {
    if (!this.spaceship) {
      return false;
    }
    const durationMs = 30000;
    const now = performance.now();
    this.voidCocoonActiveUntilMs = now + durationMs;
    this.voidCocoonLastImpactMs = now;
    this.voidCocoonShieldStartMs = now;
    this.ensureVoidCocoonShieldGeometry();
    try {
      this.hudManager?.addMarqueeMessage?.('Void Cocoon: capullo protector desplegado');
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
      this.hudManager?.addMarqueeMessage?.(`Tempus Sigillum · ${planetName} rejuvenecido`);
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
      this.hudManager?.addMarqueeMessage?.(`Quimio Sigillum restauró ${deltaLabel}`);
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
      this.hudManager?.addMarqueeMessage?.('Void Cocoon absorbió un impacto');
    } catch {}
    try {
      if (this.audio) {
        const clip = this.audio.has('sfx_collision_light') ? 'sfx_collision_light' : 'sfx_whoosh';
        this.audio.play(clip, { bus: 'sfx', volume: 0.55 });
      }
    } catch {}
  }

  /** Apply the Double Phased Time Rite: doubles maxSpeed for a duration (default 2 minutes) */
  public applySpeedRite(durationMs: number = 120000): void {
    if (!this.spaceship) return;
    const now = performance.now();
    // Cache original max once (first activation)
    if (this.speedRiteOriginalMax === null || !isFinite(this.speedRiteOriginalMax)) {
      this.speedRiteOriginalMax = this.spaceship.maxSpeed;
    }
    if (this.speedRiteOriginalAccel === null || !isFinite(this.speedRiteOriginalAccel)) {
      this.speedRiteOriginalAccel = this.spaceship.acceleration;
    }
    if (this.speedRiteOriginalDecel === null || !isFinite(this.speedRiteOriginalDecel)) {
      this.speedRiteOriginalDecel = this.spaceship.deceleration;
    }
    // Apply doubled max speed from the original baseline
    const base = this.speedRiteOriginalMax ?? this.spaceship.maxSpeed;
    this.spaceship.maxSpeed = base * 2;
    // Double accel/decel from their baselines
    const baseA = this.speedRiteOriginalAccel ?? this.spaceship.acceleration;
    const baseD = this.speedRiteOriginalDecel ?? this.spaceship.deceleration;
    this.spaceship.acceleration = baseA * 2;
    this.spaceship.deceleration = baseD * 2;
    // Extend/refresh duration
    this.speedRiteUntilMs = now + Math.max(0, durationMs);
  }

  /** Activate Speed Rite immediately without triggering blocking animations */
  private triggerSpeedRiteInstantly(): void {
    this.applySpeedRite(120000);
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
            const baseMax = (this.speedRiteOriginalMax && isFinite(this.speedRiteOriginalMax)) ? this.speedRiteOriginalMax : this.spaceship.maxSpeed;
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
    }
  }

  /**
   * Actualiza el aspect ratio cuando cambia el tamaño del canvas
   */
  public updateAspectRatio(width: number, height: number): void {
    if (this.camera) {
      this.camera.setAspectRatio(width / height);
    }
    
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }

    // Actualizar tamaño del sistema de retícula
    if (this.reticleManager) {
      this.reticleManager.updateCanvasSize(width, height);
    }
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
    
    if (this.shaderManager) {
      this.shaderManager.cleanup();
    }
    
    if (this.textureManager) {
      this.textureManager.cleanup();
    }

    if (this.particleEffects) {
      this.particleEffects.cleanup();
    }
    // Cleanup VAOs and buffers for ship modules
    if (this.gl) {
      const delVAO = (v: WebGLVertexArrayObject | null) => { if (v) this.gl!.deleteVertexArray(v); };
      delVAO(this.shipVAO.nose); delVAO(this.shipVAO.body); delVAO(this.shipVAO.cockpit);
      delVAO(this.shipVAO.nozzle); delVAO(this.shipVAO.wings); delVAO(this.shipVAO.thruster);
      const delBuf = (b?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer }) => {
        if (!b) return; this.gl!.deleteBuffer(b.v); this.gl!.deleteBuffer(b.n); this.gl!.deleteBuffer(b.i);
      };
      delBuf(this.shipBuffers.nose); delBuf(this.shipBuffers.body); delBuf(this.shipBuffers.cockpit);
      delBuf(this.shipBuffers.nozzle); delBuf(this.shipBuffers.wings); delBuf(this.shipBuffers.thruster);
      if (this.voidCocoonShieldGeometry) {
        if (this.voidCocoonShieldGeometry.vbo) this.gl.deleteBuffer(this.voidCocoonShieldGeometry.vbo);
        if (this.voidCocoonShieldGeometry.ibo) this.gl.deleteBuffer(this.voidCocoonShieldGeometry.ibo);
        this.voidCocoonShieldGeometry = null;
      }
    }
    
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
  private identityMatrix(matrix: Float32Array): void {
    matrix[0] = 1; matrix[1] = 0; matrix[2] = 0; matrix[3] = 0;
    matrix[4] = 0; matrix[5] = 1; matrix[6] = 0; matrix[7] = 0;
    matrix[8] = 0; matrix[9] = 0; matrix[10] = 1; matrix[11] = 0;
    matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
  }

  /**
   * Traslación
   */
  private translateMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[12] += matrix[0] * x + matrix[4] * y + matrix[8] * z;
    matrix[13] += matrix[1] * x + matrix[5] * y + matrix[9] * z;
    matrix[14] += matrix[2] * x + matrix[6] * y + matrix[10] * z;
  }

  /**
   * Rotación X
   */
  private rotateXMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[4] = temp[4] * cos + temp[8] * sin;
    matrix[5] = temp[5] * cos + temp[9] * sin;
    matrix[6] = temp[6] * cos + temp[10] * sin;
    matrix[8] = temp[8] * cos - temp[4] * sin;
    matrix[9] = temp[9] * cos - temp[5] * sin;
    matrix[10] = temp[10] * cos - temp[6] * sin;
  }

  /**
   * Rotación Y
   */
  private rotateYMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos - temp[8] * sin;
    matrix[1] = temp[1] * cos - temp[9] * sin;
    matrix[2] = temp[2] * cos - temp[10] * sin;
    matrix[8] = temp[0] * sin + temp[8] * cos;
    matrix[9] = temp[1] * sin + temp[9] * cos;
    matrix[10] = temp[2] * sin + temp[10] * cos;
  }

  /**
   * Rotación Z
   */
  private rotateZMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos + temp[4] * sin;
    matrix[1] = temp[1] * cos + temp[5] * sin;
    matrix[2] = temp[2] * cos + temp[6] * sin;
    matrix[4] = temp[4] * cos - temp[0] * sin;
    matrix[5] = temp[5] * cos - temp[1] * sin;
    matrix[6] = temp[6] * cos - temp[2] * sin;
  }

  /**
   * Escalado uniforme
   */
  private scaleMatrixUniform(matrix: Float32Array, factor: number): void {
    matrix[0] *= factor;
    matrix[1] *= factor;
    matrix[2] *= factor;
    matrix[4] *= factor;
    matrix[5] *= factor;
    matrix[6] *= factor;
    matrix[8] *= factor;
    matrix[9] *= factor;
    matrix[10] *= factor;
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
    const velocityMagnitude = Math.sqrt(
      this.spaceship.velocity.x ** 2 + 
      this.spaceship.velocity.y ** 2 + 
      this.spaceship.velocity.z ** 2
    );

    const orientationBasis: OrientationBasis = this.spaceship.getOrientationBasis();
    const baseMax = (this.speedRiteOriginalMax && isFinite(this.speedRiteOriginalMax)) ? this.speedRiteOriginalMax : this.spaceship.maxSpeed;
    const speedPctExtended = (this.spaceship.currentSpeed / Math.max(1e-6, baseMax)) * 100; // 0..200 when jumping/rite
    const riteActive = !!(this.speedRiteUntilMs && isFinite(this.speedRiteUntilMs) && now < this.speedRiteUntilMs);
    const voidJumpActive = !!this.voidJumpActive;
    const speedForHud = voidJumpActive ? Math.max(0, Math.min(100, speedPctExtended)) : Math.max(0, Math.min(200, speedPctExtended));
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
      weapons: this.spaceship.weapons,
      orientation: orientationBasis,
      // Pasar posición de la nave para cálculo de bearing/elevación en brújula
      position: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z },
      speedRiteRemainingSec: riteActive ? Math.max(0, Math.floor((this.speedRiteUntilMs! - now) / 1000)) : null,
      compassCountdown: this.getCompassCountdownPayload(now),
      // Portal cooldown HUD removido (no se expone)
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
    type PrioritizedCountdown = { priority: number; payload: CompassCountdownPayload };
    const candidates: PrioritizedCountdown[] = [];

    if (this.voidCocoonActiveUntilMs && now < this.voidCocoonActiveUntilMs) {
      const seconds = (this.voidCocoonActiveUntilMs - now) / 1000;
      if (seconds > 0) {
        candidates.push({
          priority: 1,
          payload: { seconds, label: 'COCOON', accentColor: '#6ef6ff' }
        });
      }
    }

    if (this.speedRiteUntilMs && now < this.speedRiteUntilMs) {
      const seconds = (this.speedRiteUntilMs - now) / 1000;
      if (seconds > 0) {
        candidates.push({
          priority: 3,
          payload: { seconds, label: 'SPEED RITE', accentColor: '#ff3055' }
        });
      }
    }

    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0].payload;
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

  /**
   * Renderiza el sistema de outlines avanzados (FASE 4)
   */
  private renderOutlineSystem(): void {
    if (!this.reticleManager || !this.camera) return;

    // Obtener todos los targets de forma genérica
    let availableTargets = this.targetCatalog.getAllTargets();
    // Excluir clusters lejanos también del render de outlines
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
    // Aplicar el mismo filtro de visibilidad para debris de la Tierra
    try {
      const earth = this.gameState.findPlanetById('planet-earth');
      if (earth && this.camera) {
        const dxE = earth.position.x - this.camera.position.x;
        const dyE = earth.position.y - this.camera.position.y;
        const dzE = earth.position.z - this.camera.position.z;
        const distCamToEarth = Math.hypot(dxE, dyE, dzE);
        if (distCamToEarth > 20000) {
          const earthDebris = this.planetDebris.get('planet-earth');
          if (earthDebris && earthDebris.length) {
            const exIds = new Set(earthDebris.map(d => d.obj.id));
            availableTargets = availableTargets.filter(t => !exIds.has(t.id));
          }
        }
      }
    } catch {}

    // Renderizar outlines con matrices actuales de la cámara
    this.reticleManager.renderOutlines(
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      availableTargets
    );
  }

  /** STEP 5: Render del nuevo outliner 2D (si hay seleccionado o hovered) */
  private renderTargetOutline2D(): void {
    if (!this.outlinerEnabled) return; // disabled for performance testing
    if (!this.targetOutline2D || !this.adaptiveTargeting) return;
    try {
      const selected = this.adaptiveTargeting.getCurrentTarget?.();
      const hovered = this.adaptiveTargeting.getHoveredTarget?.();
      if (!selected && !hovered) return;

      // During animations (and pre-cast blocking delay), suppress overlays for a clean view
      const blockOverlays = this.spellIOCoordinator?.shouldHideOutliners?.() ?? (!!this.animationManager?.isBlockingInputs?.());

      const dpr = (this.webglService.getState().devicePixelRatio || 1);

      // Helper: build render data from TargetDisplayInfo and optionally dim the color
      const toRGBA = (hex: string, alpha: number): string => {
        const h = hex.replace('#','');
        const bigint = parseInt(h.length === 3
          ? (h[0]+h[0]+h[1]+h[1]+h[2]+h[2])
          : h, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
      };
      const buildData = (t: any) => {
        const info = this.adaptiveTargeting!.getTargetDisplayInfo?.(t);
        if (!info || !info.screenPosition) return null;
        const typeLabel = ((): string => {
          try { return String(info.type || t.getTargetType?.() || 'unknown'); } catch { return 'unknown'; }
        })();
        const healthPct = (() => {
          try {
            const h = info.details?.health;
            if (h && typeof h.current === 'number' && typeof h.max === 'number' && h.max > 0) {
              return (h.current / h.max) * 100;
            }
          } catch {}
          return undefined;
        })();
        const distanceRaw = this.getDisplayDistanceToTarget(t);
        const distanceDisplay = Number.isFinite(distanceRaw) ? distanceRaw : 0;
        return {
          x: info.screenPosition.x * dpr,
          y: info.screenPosition.y * dpr,
          // Prefer live target name to avoid 1-frame stale snapshots
          name: (t.getDisplayName?.() || info.name || t.id),
          typeLabel,
          distanceDisplay,
          color: info.accentColor || '#60a5fa',
          healthPct
        } as any;
      };

      // Render hovered (slightly brighter than before) if present and different from selected
      if (!blockOverlays && hovered && (!selected || hovered.id !== selected.id)) {
        const hData = buildData(hovered);
        if (hData) {
          // Use full color and control perceived brightness via intensity + thickness
          hData.color = toRGBA(hData.color, 1.0);
          (hData as any).intensity = 0.85; // was ~0.6; brighter hover
          (hData as any).thickness = 1.1;   // slightly thicker
          this.targetOutline2D.render('hover', hData.x, hData.y, hData);
        }
      }

      // Render selected (intense) on top
      if (!blockOverlays && selected) {
        const sData = buildData(selected);
        if (sData) {
          // Slightly bolder selected
          sData.color = toRGBA(sData.color, 1.0);
          (sData as any).intensity = 1.0; // fully opaque
          (sData as any).thickness = 1.2; // subtle emphasis
          this.targetOutline2D.render('selected', sData.x, sData.y, sData);
        }
      }
    } catch (e) {
      // No romper frame por errores visuales
    }
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
    const snapshot = this.buildInventorySnapshot();
    if (snapshot) {
      this.inventoryPanel.update(snapshot);
    }
  }

  private buildInventorySnapshot(): InventorySnapshot | null {
    if (!this.gameState) {
      return null;
    }

    const equipment = {} as Record<EquipmentSlot, InventorySnapshot['equipment'][EquipmentSlot]>;
    for (const slotKey of Object.values(EquipmentSlot)) {
      const slot = slotKey as EquipmentSlot;
      const state = this.gameState.equipmentLoadout[slot] || null;
      equipment[slot] = state ? { ...state } : null;
    }

    const ship = this.spaceship || null;
    const current = ship ? ship.cargoCapacityCurrent : 0;
    const max = ship ? ship.cargoCapacityMax : 0;
    const pct = max > 0 ? (current / max) * 100 : 0;
    const shipStats = ship
      ? {
          acceleration: ship.acceleration,
          topSpeed: ship.maxSpeed,
          health: {
            current: Math.max(0, Math.round(ship.healthCurrent)),
            max: Math.max(1, Math.round(ship.healthMax))
          }
        }
      : undefined;

    return {
      character: { ...this.gameState.characterProfile },
      equipment,
      personalGear: this.gameState.personalGear.map(item => ({ ...item })),
      cargo: this.gameState.cargoManifest.map(entry => ({ ...entry })),
      cargoCapacity: {
        current,
        max,
        pct: Math.max(0, Math.min(200, pct))
      },
      shipStats,
      sanityLimits: {
        base: this.gameState.getSanityBaseMax(),
        reserved: this.gameState.getSanityReservedFromSpells(),
        effective: this.gameState.getSanityCap()
      }
    };
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
      on3DClick: (event) => this.handle3DClick(event)
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
        this.gameState.inventoryReopenAllowedAtMs = now + 1000;
        this.updateInventoryPointerBinding();
        this.updateCanvasCursor();
      }
    } else {
      // Map closed
      try { this.audio?.play('ui_map_close'); } catch {}
      this.gameState.mapReopenAllowedAtMs = now + 1000;
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
        this.gameState.inventoryReopenAllowedAtMs = now + 1000;
        this.updateInventoryPointerBinding();
        this.updateCanvasCursor();
      }
    } else {
      // Grimoire closed
      try { this.audio?.play('ui_grimoire_close'); } catch {}
      this.gameState.grimoireReopenAllowedAtMs = now + 1000;
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
      }
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
        this.gameState.mapReopenAllowedAtMs = now + 1000;
        this.updateMapClickBinding();
      }
      if (this.grimoirePanel?.isEnabled()) {
        this.grimoirePanel.setEnabled(false);
        this.gameState.grimoireReopenAllowedAtMs = now + 1000;
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
      this.gameState.inventoryReopenAllowedAtMs = now + 1000;
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
      this.gameState.inventoryReopenAllowedAtMs = performance.now() + 1000;
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
    try { this.lesserBeingController?.registerBeing(being as any); } catch {}
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
    const snap = snapshot ?? this.currentSnapshot;
    if (!snap) {
      return null;
    }
    if (snap.id && snap.id.trim().length) {
      return snap.id;
    }
    if (snap.sun?.id) {
      return `sun:${snap.sun.id}`;
    }
    return null;
  }

  private snapshotActiveLesserBeings(): LesserBeingInstanceSnapshot[] {
    const result: LesserBeingInstanceSnapshot[] = [];
    for (const being of this.lesserBeings) {
      if (!being || !being.active) {
        continue;
      }
      result.push({
        id: being.id,
        type: being.beingType,
        position: { ...being.position },
        velocity: { ...being.velocity },
        forward: { ...being.forwardDirection },
        hasLanded: being.hasLanded,
        landedPlanetId: being.landedPlanetId,
        health: { current: being.healthCurrent, max: being.healthMax }
      });
    }
    return result;
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
    const systemId = this.resolveSystemId();
    if (!systemId) {
      return;
    }
    const snapshots = this.snapshotActiveLesserBeings().filter(snap => !snap.hasLanded && !snap.landedPlanetId);
    this.gameState.saveLesserBeingSnapshots(systemId, snapshots);
    if (snapshots.length) {
      this.logger.log(LogLevel.DEBUG, LogCategory.LESSER_BEINGS, 'Persisted roaming lesser beings for system', {
        systemId,
        count: snapshots.length
      });
    }
    this.clearActiveLesserBeings();
  }

  private restorePersistedLesserBeings(snapshot: SolarSystemSnapshot): void {
    const systemId = this.resolveSystemId(snapshot);
    if (!systemId) {
      return;
    }
    const stored = this.gameState.getLesserBeingSnapshots(systemId);
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
    this.gameState.clearLesserBeingSnapshots(systemId);
    if (revived.length) {
      this.logger.log(LogLevel.INFO, LogCategory.LESSER_BEINGS, 'Restored persistent lesser beings for system', {
        systemId,
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

  public handleVoidJumpCompleted(): void {
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
}


