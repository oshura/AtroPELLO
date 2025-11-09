import { Injectable } from '@angular/core';
import { AudioEngineService } from '../services/audio/audio-engine.service';
import { MusicDirectorService } from '../services/audio/music-director.service';
import { WebGLService } from '../services/webgl.service';
import { ParticleEffectsService } from '../services/particle-effects.service';
import { GameObject } from './GameObject';
import { Spaceship, ThrusterState } from './Spaceship';
import { Asteroid } from './Asteroid';
import { Camera, CameraMode } from './Camera';
import { ShaderManager } from './ShaderManager';
import { SolarSystemService } from './services/game/solar-system.service';
import { HumanSolarSystemService } from './services/game/human-solar-system.service';
import { PortalPersistenceService } from './services/game/portal-persistence.service';
import { TextureManager } from './TextureManager';
import { HUDManager } from './hud/HUDManager';
import { SuperAsteroid } from './SuperAsteroid';
import { ClusterObject } from './Cluster';
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
import { ScreenOverlayRenderer } from './rendering/ScreenOverlayRenderer';
import { InstancedAsteroidRenderer } from './rendering/InstancedAsteroidRenderer';
import { BillboardRenderer } from './rendering/BillboardRenderer';
import { LandingOverlay } from './hud/LandingOverlay';
import { TargetOutline2DRenderer } from './hud/TargetOutline2DRenderer';
import { Planet, PlanetColorName, PlanetType, DwarfPlanet, Protoplanet } from './Planet';
import { GaseousPlanet } from './GaseousPlanet';
import { GiantPlanet } from './GiantPlanet';
import { RingedPlanet } from './RingedPlanet';
import { Sun } from './Sun';
import { EarthSplitPlanet } from './EarthSplitPlanet';
import { MegaAsteroid } from './MegaAsteroid';
import { Portal } from './Portal';
import { LoggingService, LogCategory, LogLevel } from '../services/logging.service';
// Snapshot types for system swapping
import { SolarSystemSnapshot, PortalSnapshot } from './types/solar-system.types';
import { TargetType, ITargetable } from './types/targeting.types';

/**
 * Motor principal del juego que coordina todos los sistemas
 */
@Injectable({
  providedIn: 'root'
})
export class GameEngine {
  private gl: WebGL2RenderingContext | null = null;
  private isRunning: boolean = false;
  private lastFrameTime: number = 0;
  
  // Sistemas principales
  private camera!: Camera;
  private shaderManager!: ShaderManager;
  private textureManager!: TextureManager;
  private particleEffects!: ParticleEffectsService;
  private hudManager!: HUDManager;
  private reticleManager!: ReticleManager;
  private adaptiveTargeting!: AdaptiveTargetingIntegrator;
  private asteroidClusterService!: AsteroidClusterService;
  private targetCatalog!: TargetCatalogService;
  private targetDetails!: TargetDetailService;
  private targetPreview!: TargetPreviewRenderer;
  private systemPanel: SolarSystemPanel | null = null;
  private grimoirePanel: GrimoirePanel | null = null;
  private overlayRenderer: ScreenOverlayRenderer | null = null;
  private targetOutline2D: TargetOutline2DRenderer | null = null;
  // Runtime toggle to enable/disable the 2D outliner overlay for performance testing
  private outlinerEnabled: boolean = true;
  private landingOverlay: LandingOverlay | null = null;
  private domCanvas: HTMLCanvasElement | null = null;
  private mapIdToTarget: Map<string, ITargetable> = new Map();
  // Defers a map selection when the user clicks immediately after opening the map
  // before the id->target mapping has been rebuilt in the first render pass.
  private pendingMapSelectId: string | null = null;
  // Central logger
  public readonly logger: LoggingService;
  
  // Audio
  private audio: AudioEngineService | null = null;
  private music: MusicDirectorService | null = null;
  private thrusterCtl: ReturnType<AudioEngineService['createThrusterController']> | null = null;
  private audioUnlocked: boolean = false;
  // Doppler cues (near fly-bys)
  private dopplerEnabled: boolean = true;
  private dopplerCues: Map<string, { cue: ReturnType<AudioEngineService['createDopplerCue']>; started: number }>
    = new Map();
  private lastObjPos: Map<string, { x: number; y: number; z: number }> = new Map();
  private lastCamPos: { x: number; y: number; z: number } | null = null;
  private camVel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  private dopplerSkip: boolean = false; // throttle doppler updates (every other frame)
  
  // Objetos del juego
  private spaceship!: Spaceship;
  private asteroids: Asteroid[] = [];
  private superAsteroids: SuperAsteroid[] = [];
  private planets: Planet[] = [];
  // Persistent portals (created by Gate Rite); survive system transitions
  private portals: Portal[] = [];
  private primarySun: Sun | null = null;
  // Debris asociados a un planeta (e.g., anillo de mega-asteroides de la Tierra dividida)
  private planetDebris: Map<string, Array<{ obj: MegaAsteroid; local: { x: number; y: number; z: number } }>> = new Map();
  // Track last applied snapshot id (debug)
  private lastAppliedSnapshotId: string | null = null;

  // Landing minigame state
  private _prevSurfaceDistance: Map<string, number> = new Map();
  private _landingTargetId: string | null = null;
  private _isInsidePlanetId: string | null = null;
  
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
  private solarSystemService?: SolarSystemService,
  private humanSolarSystemService?: HumanSolarSystemService,
  private portalPersistenceService?: PortalPersistenceService,
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
  try { (this.targetOutline2D as any).setMinUploadInterval?.(120); } catch {}
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'Error inicializando TargetOutline2DRenderer', e);
        this.targetOutline2D = null;
      }

  // Inicializar panel de mapa del sistema (overlay top-down, opaco)
  this.systemPanel = new SolarSystemPanel(this.gl, 1024, 1024);
  this.systemPanel.setEnabled(false); // desactivado por defecto
  // Initialize Grimoire panel (ancient book overlay)
  try {
    this.grimoirePanel = new GrimoirePanel(this.gl, 1024, 1024);
    this.grimoirePanel.setEnabled(false);
  } catch (e) {
    this.logger.log(LogLevel.WARN, LogCategory.HUD, 'GrimoirePanel initialization failed', e);
    this.grimoirePanel = null;
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
  // Background full-view HUD layer for landing windows
  try {
    const c: HTMLCanvasElement = (this.webglService.getContext() as any).canvas as HTMLCanvasElement;
    this.landingOverlay = new LandingOverlay(this.gl, c?.width || 1024, c?.height || 768);
  } catch (e) {
    this.logger.log(LogLevel.WARN, LogCategory.HUD, 'LandingOverlay could not be initialized', e);
    this.landingOverlay = null;
  }
      // Fullscreen landing overlay (background HUD)
      try {
        this.landingOverlay = new LandingOverlay(this.gl, canvas.width, canvas.height);
      } catch (e) {
        this.logger.log(LogLevel.WARN, LogCategory.HUD, 'LandingOverlay initialization failed', e);
        this.landingOverlay = null;
      }

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

      // Setup mouse click handling for adaptive targeting
      this.setupAdaptiveTargetingEvents(canvasRef);

  // Registro de targets se realiza al crear los clusters (initializeAllBuffers)

      // Integration tests removed

  this.logger.log(LogLevel.INFO, LogCategory.GAME_INITIALIZATION, 'GameEngine inicializado correctamente');
      // Expose a simple console hook to toggle the 2D outliner at runtime for FPS testing
      try {
        const w = (globalThis as any);
        w.Debug = w.Debug || {};
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
          try { (this.adaptiveTargeting as any)?.setUseRaycastHover?.(!!v); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'useRaycastHover', { value: !!v }); } catch {}
        };
        w.Debug.Targeting.dominantGate = (v: boolean) => {
          try { (this.adaptiveTargeting as any)?.setDominantGateEnabled?.(!!v); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'dominantGateEnabled', { value: !!v }); } catch {}
        };
        w.Debug.Targeting.setDominantFraction = (f: number) => {
          try { (this.adaptiveTargeting as any)?.setDominantRadiusFraction?.(Number(f)); this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'dominantRadiusFraction', { value: f }); } catch {}
        };
        // Panels: Map and Grimoire (ancient book)
        w.Debug.Panels = w.Debug.Panels || {};
        w.Debug.Panels.setMapEnabled = (v: boolean) => {
          try { this.systemPanel?.setEnabled(!!v); } catch {}
          if (v) { try { this.grimoirePanel?.setEnabled(false); } catch {} }
          this.updateMapClickBinding();
          this.updateGrimoirePointerBinding();
          this.updateCanvasCursor();
          this.logger.log(LogLevel.INFO, LogCategory.HUD, 'Map panel enabled', { value: !!v });
        };
        w.Debug.Panels.setGrimoireEnabled = (v: boolean) => {
          try { this.grimoirePanel?.setEnabled(!!v); } catch {}
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
    const existingPortals = this.portals.slice();
    // Clear planets & debris
    this.planets = [];
    this.primarySun = null;
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
        this.planets.push(sun as any);
        this.primarySun = sun;
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
        this.planets.push(planetObj);
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
    try { this.targetCatalog.register(TargetType.PLANET, this.planets as any); } catch {}

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
          const name = (o as any)?.constructor?.name;
            if (name === 'SuperAsteroid') supers.push(o as any); else normals.push(o as any);
        }
      }
      this.targetCatalog.register(TargetType.ASTEROID, normals);
      this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
      this.targetCatalog.register(TargetType.CLUSTER, []);
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Cluster instantiation error', e); }

    // Portals (preserve existing + add new)
    const createdPortals: PortalSnapshot[] = [];
    try {
      if (existingPortals.length) {
        this.targetCatalog.register(TargetType.PORTAL, existingPortals as any);
      }
      for (const p of (snapshot.portals || [])) {
        if (this.portals.some(ep => ep.id === p.id)) { createdPortals.push(p); continue; }
        const portal = new Portal(p.id, { ...p.position }, p.radius, this.logger);
        portal.linkedPortalId = p.linkedPortalId;
        portal.applyEyeState(p.eyeState);
        if (gl && !portal.vertexBuffer) portal.initBuffers(gl as WebGL2RenderingContext);
        this.portals.push(portal);
        this.targetCatalog.add(TargetType.PORTAL, portal as any);
        createdPortals.push(p);
      }
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.PORTAL, 'Portal instantiation error', e); }

    this.lastAppliedSnapshotId = snapshot.id || null;
    // Restore debris from snapshot (generic) if provided
    try {
      if (snapshot.planetDebris && snapshot.planetDebris.length) {
        for (const d of snapshot.planetDebris) {
          const parent = this.planets.find(pl => pl.id === d.planetId);
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
          try { this.targetCatalog.add(TargetType.MEGA_ASTEROID, obj as any); } catch {}
        }
      }
    } catch (e) { this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Debris restore failed', e); }
    this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot applied', { id: snapshot.id, planetCount: this.planets.length, portalCount: this.portals.length });
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
    if (this.portals.length) {
      this.portals.forEach(p => p.initBuffers(this.gl!));
      this.targetCatalog.add(TargetType.PORTAL, this.portals[0] as any); // simple add; multiple handled later
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
    this.planets.forEach(p => p.initBuffers(this.gl!));
    this.targetCatalog.register(TargetType.PLANET, this.planets as unknown as ITargetable[]);

    // 2) Construir un rastro de clusters a lo largo de la elipse orbital de la Tierra
    const earth = this.planets.find(p => p.id === 'planet-earth');
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
        if ((o as any) instanceof SuperAsteroid) supers.push(o as unknown as ITargetable);
        else smalls.push(o as unknown as ITargetable);
      });
    });
    this.targetCatalog.register(TargetType.ASTEROID, smalls);
    this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
    // Inicializar buffers y registrar debris asociados a planetas como MEGA_ASTEROID
    for (const arr of this.planetDebris.values()) {
      for (const d of arr) {
        if (!d.obj.vertexBuffer) d.obj.initBuffers(this.gl!);
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
      if (ok && this.music) {
        // Start exploration by default
        await this.music.setScene('exploration', 900);
      }
      // Start always-on ambience loop (logdark) once unlocked
      try { if (ok) this.audio.startAmbientLoop('sfx_logdark'); } catch {}
      // Pre-start thruster loop at silence for smooth fade when first needed
      if (ok && this.thrusterCtl) {
        this.thrusterCtl.start(0.0);
      }
      this.logger.log(LogLevel.INFO, LogCategory.AUDIO, 'Audio enabled', { ok });
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.AUDIO, 'Audio enable failed', e);
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
    if (!this.primarySun) return;
    const sunCenter = this.primarySun.position;
    const sunRadius = this.primarySun.scale.x; // radio en this.scale
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
    // DEBUG CRÍTICO - Verificar que update se ejecuta
    if (performance.now() % 1500 < 50) { // Cada 1.5 segundos
      this.logger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'GameEngine.update() executed', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        spaceship: !!this.spaceship,
        asteroids: this.asteroids.length
      });
    }
    
    // Actualizar nave si existe
    if (!this.spaceship) {
      this.logger.log(LogLevel.ERROR, LogCategory.GAME_LOOP, 'Spaceship is undefined in update method');
      return;
    }
    
    this.spaceship.update(deltaTime);

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
      if (this.audioUnlocked && this.thrusterCtl && this.spaceship) {
        const state = this.spaceship.thrusterState;
        const speed = this.spaceship.currentSpeed;
        // Use base max (pre-rite) to allow audio to continue 100%→200% during the rite
        const baseMax = (this.speedRiteOriginalMax && isFinite(this.speedRiteOriginalMax)) ? this.speedRiteOriginalMax : this.spaceship.maxSpeed;
        const speedOverBase = Math.max(0, Math.min(2, speed / Math.max(1e-6, baseMax))); // 0..2 when rite doubles
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
        if (this.audioUnlocked && this.audio && this.dopplerEnabled && this.camera) {
          this.dopplerSkip = !this.dopplerSkip;
          const processThisFrame = !this.dopplerSkip; // skip every other frame to save CPU
          if (processThisFrame) {
            const listenerPos = { ...this.camera.position };
            const dt = Math.max(1e-6, deltaTime);
            const NEAR_IN = 30;  // enter radius with hysteresis (reduced for tight fly-by)
            const FAR_OUT = 36;  // exit radius slightly larger to prevent flicker
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
                const dx = o.position.x - listenerPos.x;
                const dy = o.position.y - listenerPos.y;
                const dz = o.position.z - listenerPos.z;
                const dist = Math.hypot(dx, dy, dz);
                if (dist > NEAR_IN) continue;
                const prev = this.lastObjPos.get(o.id) || { x: o.position.x, y: o.position.y, z: o.position.z };
                const ev = { x: (o.position.x - prev.x) / dt, y: (o.position.y - prev.y) / dt, z: (o.position.z - prev.z) / dt };
                const relV = { x: ev.x - this.camVel.x, y: ev.y - this.camVel.y, z: ev.z - this.camVel.z };
                const relSpeed = Math.hypot(relV.x, relV.y, relV.z);
                if (relSpeed < MIN_SPEED) { this.lastObjPos.set(o.id, { x: o.position.x, y: o.position.y, z: o.position.z }); continue; }
                if (dist < closestDist) {
                  closestDist = dist; closestId = o.id; closestPos = { x:o.position.x, y:o.position.y, z:o.position.z }; closestVel = ev;
                }
              }
            }

            // Stickiness: if we already have an active cue, keep it until it truly exits or a much closer object appears
            const activeEntry = Array.from(this.dopplerCues.entries())[0]; // at most one after we enforce below
            if (activeEntry) {
              const [activeId, entry] = activeEntry;
              // Locate active object to measure distance
              let objPos: { x:number;y:number;z:number } | null = null;
              for (const c of this.asteroidClusterService.getClusters()) {
                const cand = c.objects.find((o: any) => o.id === activeId);
                if (cand) { objPos = { x: cand.position.x, y: cand.position.y, z: cand.position.z }; break; }
              }
              if (objPos) {
                const dx = objPos.x - listenerPos.x, dy = objPos.y - listenerPos.y, dz = objPos.z - listenerPos.z;
                const dist = Math.hypot(dx, dy, dz);
                // If still within FAR_OUT, prefer to keep active unless a new target is significantly closer (15%).
                // Also: if no new candidate found, keep the active one while inside FAR_OUT (hysteresis hold).
                if (dist <= FAR_OUT && (!closestId || closestDist > dist * 0.85)) {
                  closestId = activeId; closestPos = objPos;
                  const prev = this.lastObjPos.get(activeId) || objPos;
                  closestVel = { x: (objPos.x - prev.x) / dt, y: (objPos.y - prev.y) / dt, z: (objPos.z - prev.z) / dt };
                }
              }
            }

            // Update existing cue (and stop any extra entries)
            for (const [id, entry] of Array.from(this.dopplerCues.entries())) {
              if (id !== closestId) {
                try { entry.cue.stop(80); } catch {}
                this.dopplerCues.delete(id);
                continue;
              }
              if (!closestPos) { try { entry.cue.stop(80); } catch {}; this.dopplerCues.delete(id); continue; }
              const prev = this.lastObjPos.get(id) || closestPos;
              const ev = closestVel || { x: (closestPos.x - prev.x) / dt, y: (closestPos.y - prev.y) / dt, z: (closestPos.z - prev.z) / dt };
              entry.cue.update(closestPos, listenerPos, ev, this.camVel);
              this.lastObjPos.set(id, closestPos);
            }

            // Create cue if we have a selected target and none is active
            if (closestId && !this.dopplerCues.has(closestId)) {
              const SOUND_NAME = this.audio.has(PREFERRED) ? PREFERRED : (this.audio.has(ALT1) ? ALT1 : ALT2);
              const p = closestPos!;
              const cue = this.audio.createDopplerCue({ name: SOUND_NAME, initialPos: { x: p.x, y: p.y, z: p.z }, baseVolume: 0.75, audibleRadius: 30, cUnits: 300, bus: 'sfx', loop: true });
              this.dopplerCues.set(closestId, { cue, started: performance.now() });
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
    }
    
  // Actualizar efectos de partículas
  this.particleEffects.updateAmbientDust(this.spaceship, deltaTime);
    this.particleEffects.updateThrusterEffect(this.spaceship, deltaTime);

    // Actualizar cámara con nueva posición
    this.camera.update(this.spaceship, deltaTime);
  // Update portals (spin)
  try { this.portals.forEach(p => p.update(deltaTime)); } catch {}

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
          if ((o as any) instanceof SuperAsteroid) supers.push(o as unknown as ITargetable);
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
        asteroidCount: this.asteroids.length,
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
    
    // Update adaptive targeting system (performs detection and maintains mouse velocity)
    if (this.adaptiveTargeting) {
      this.adaptiveTargeting.update(deltaTime, availableTargets, mousePos);
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
      if (!(typeof p.voidMassUnits === 'number' && isFinite(p.voidMassUnits) && p.voidMassUnits > 0)) {
        p.voidMassUnits = 2000 + Math.floor(Math.random() * 3001);
      }
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
      // Distance
      const dx = selected.position.x - this.camera.position.x;
      const dy = selected.position.y - this.camera.position.y;
      const dz = selected.position.z - this.camera.position.z;
      const distance = Math.hypot(dx, dy, dz);

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

  const baseDetails = (this as any)._targetDetailsCache?.[selected.id] || this.getFallbackDetails(selected);
  // Añadir propiedades visibles comunes: masa del vacío del objeto si existe
  const voidMass = (selected as any).voidMassUnits ?? 0;
  // Mostrar etiqueta explícita según tipo concreto: MegaAsteroid sobreescribe SuperAsteroid
  const isMega = ((selected as any)?.constructor?.name === 'MegaAsteroid') || (selType === TargetType.MEGA_ASTEROID);
  const isSuper = !isMega && (selected instanceof SuperAsteroid);
  const pTypeSel = String((selected as any)?.planetType || '').toLowerCase();
  const specialSel = pTypeSel === 'ringed' ? 'Ringed' : (pTypeSel === 'dwarf' ? 'Dwarf' : (pTypeSel === 'protoplanet' ? 'Protoplanet' : null));
  const typeLabel = isMega ? 'MegaAsteroid' : (isSuper ? 'SuperAsteroid' : (specialSel ?? this.typeToLabel(selType)));
      // Include planet-specific hints when selected is a planet
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
          }
        : {};
      const details = { ...baseDetails, ...planetHints, type: typeLabel, previewStatus: (this.targetPreview as any).getStatus?.(), voidMassUnits: voidMass } as any;

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

    // Landing windows and entry validation (HUD-only)
    try {
      this.updateLandingSystem(deltaTime);
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Landing system update error', e);
    }
  }

  /**
   * Update landing windows visualization and handle entry checks.
   * Two windows: current trajectory impact and ideal window 30° ahead along tangent.
   * Activate only when ship is within 250u of the planet surface.
   */
  private updateLandingSystem(deltaTime: number): void {
    if (!this.spaceship || !this.hudManager) return;
    // Pick target planet via forward ray intersection (nearest hit)
    const shipPos = this.spaceship.position;
    const fwd = this.normalize({ ...this.spaceship.forwardDirection });
    let best: { p: Planet; t: number; hit: { x: number; y: number; z: number } } | null = null;
    for (const obj of this.planets) {
      const p = obj as Planet;
      if (!p || (p as any).planetType === 'Sun') continue;
      const hit = this.raySphere(shipPos, fwd, p.position, p.scale.x);
      if (hit && hit.t > 0) {
        if (!best || hit.t < best.t) best = { p, t: hit.t, hit: hit.point };
      }
    }

    if (!best) {
      try { this.landingOverlay?.setWindows(null); } catch {}
      this._landingTargetId = null;
    } else {
      const planet = best.p;
      this._landingTargetId = planet.id;
      // Gate activation by distance to surface
      const Rgate = Math.max(1, planet.scale.x);
      const dCenterGate = Math.hypot(
        this.spaceship.position.x - planet.position.x,
        this.spaceship.position.y - planet.position.y,
        this.spaceship.position.z - planet.position.z
      );
      const surfDistGate = dCenterGate - Rgate;
      if (surfDistGate > 250) {
        try { this.landingOverlay?.setWindows(null); } catch {}
        this._landingTargetId = null;
        return;
      }

      // Compute window quads
      const R = Math.max(1, planet.scale.x);
      const center = planet.position;
      const impact = best.hit;
      const n = this.normalize({ x: impact.x - center.x, y: impact.y - center.y, z: impact.z - center.z });
      const fwdProj = this.normalize(this.projectOntoPlane(fwd, n));
      const t1 = fwdProj;
      let t2 = this.normalize({ x: n.y * t1.z - n.z * t1.y, y: n.z * t1.x - n.x * t1.z, z: n.x * t1.y - n.y * t1.x });
      if (!isFinite(t2.x) || !isFinite(t2.y) || !isFinite(t2.z) || Math.hypot(t2.x, t2.y, t2.z) < 1e-6) {
        t2 = this.normalize(this.projectOntoPlane({ x: 0, y: 1, z: 0 }, n));
      }
      const theta = 30 * Math.PI / 180;
      const nIdeal = this.normalize({ x: n.x * Math.cos(theta) + t1.x * Math.sin(theta), y: n.y * Math.cos(theta) + t1.y * Math.sin(theta), z: n.z * Math.cos(theta) + t1.z * Math.sin(theta) });
      const ideal = { x: center.x + nIdeal.x * R, y: center.y + nIdeal.y * R, z: center.z + nIdeal.z * R };
  // Smaller windows; landing larger than impact
  const sideLanding = Math.max(60, Math.min(R * 0.03, 320));
  const sideImpact = Math.max(40, Math.min(sideLanding * 0.7, 220));
  const halfLanding = sideLanding / 2;
  const halfImpact = sideImpact / 2;
      const toCorner = (C: { x: number; y: number; z: number }, ux: number, uy: number) => ({
        x: C.x + t1.x * ux + t2.x * uy,
        y: C.y + t1.y * ux + t2.y * uy,
        z: C.z + t1.z * ux + t2.z * uy,
      });
      const currentQuadW = [
        toCorner(impact, -halfImpact, -halfImpact),
        toCorner(impact, +halfImpact, -halfImpact),
        toCorner(impact, +halfImpact, +halfImpact),
        toCorner(impact, -halfImpact, +halfImpact)
      ];
      const idealQuadW = [
        toCorner(ideal, -halfLanding, -halfLanding),
        toCorner(ideal, +halfLanding, -halfLanding),
        toCorner(ideal, +halfLanding, +halfLanding),
        toCorner(ideal, -halfLanding, +halfLanding)
      ];
      const currentQuadNDC = currentQuadW.map(p => this.worldToNDC(p));
      const idealQuadNDC = idealQuadW.map(p => this.worldToNDC(p));
      const relSpeed = Math.hypot(this.spaceship.velocity.x, this.spaceship.velocity.y, this.spaceship.velocity.z);
      const idealColor = relSpeed > 5 ? 'rgba(255,0,0,0.95)' : 'rgba(0,255,0,0.95)';
      try {
        this.landingOverlay?.setWindows({
          current: { pointsNDC: currentQuadNDC, color: 'rgba(255,255,0,0.9)' },
          ideal: { pointsNDC: idealQuadNDC, color: idealColor }
        });
      } catch {}
    }

    // Entry mechanic: detect crossing into planet and validate against ideal window and speed
    for (const obj of this.planets) {
      const p = obj as Planet;
      if (!p || (p as any).planetType === 'Sun') continue;
      const R = Math.max(1, p.scale.x);
      const dCenter = Math.hypot(this.spaceship.position.x - p.position.x, this.spaceship.position.y - p.position.y, this.spaceship.position.z - p.position.z);
      const surfDist = dCenter - R; // positive outside
      const prev = this._prevSurfaceDistance.get(p.id) ?? Infinity;
      if (prev > 0 && surfDist <= 0) {
        const matchesTarget = (this._landingTargetId && this._landingTargetId === p.id);
        let ok = false;
        if (matchesTarget) {
          const fwd = this.normalize({ ...this.spaceship.forwardDirection });
          const hit = this.raySphere(this.spaceship.position, fwd, p.position, R);
          if (hit) {
            const impact = hit.point;
            const n = this.normalize({ x: impact.x - p.position.x, y: impact.y - p.position.y, z: impact.z - p.position.z });
            const t1 = this.normalize(this.projectOntoPlane(fwd, n));
            let t2 = this.normalize({ x: n.y * t1.z - n.z * t1.y, y: n.z * t1.x - n.x * t1.z, z: n.x * t1.y - n.y * t1.x });
            if (!isFinite(t2.x) || !isFinite(t2.y) || !isFinite(t2.z) || Math.hypot(t2.x, t2.y, t2.z) < 1e-6) {
              t2 = this.normalize(this.projectOntoPlane({ x: 0, y: 1, z: 0 }, n));
            }
            const theta = 30 * Math.PI / 180;
            const nIdeal = this.normalize({ x: n.x * Math.cos(theta) + t1.x * Math.sin(theta), y: n.y * Math.cos(theta) + t1.y * Math.sin(theta), z: n.z * Math.cos(theta) + t1.z * Math.sin(theta) });
            const ideal = { x: p.position.x + nIdeal.x * R, y: p.position.y + nIdeal.y * R, z: p.position.z + nIdeal.z * R };
            // Use landing window size for validation
            const sideLanding = Math.max(60, Math.min(R * 0.03, 320));
            const half = sideLanding / 2;
            const nAtShip = this.normalize({ x: this.spaceship.position.x - p.position.x, y: this.spaceship.position.y - p.position.y, z: this.spaceship.position.z - p.position.z });
            const entryProj = { x: p.position.x + nAtShip.x * R, y: p.position.y + nAtShip.y * R, z: p.position.z + nAtShip.z * R };
            // Project offset at ideal center into tangent basis
            const t1Ideal = this.normalize(this.projectOntoPlane(t1, nIdeal));
            let t2Ideal = this.normalize({ x: nIdeal.y * t1Ideal.z - nIdeal.z * t1Ideal.y, y: nIdeal.z * t1Ideal.x - nIdeal.x * t1Ideal.z, z: nIdeal.x * t1Ideal.y - nIdeal.y * t1Ideal.x });
            if (!isFinite(t2Ideal.x) || !isFinite(t2Ideal.y) || !isFinite(t2Ideal.z) || Math.hypot(t2Ideal.x, t2Ideal.y, t2Ideal.z) < 1e-6) {
              t2Ideal = this.normalize(this.projectOntoPlane({ x: 0, y: 1, z: 0 }, nIdeal));
            }
            const off = { x: entryProj.x - ideal.x, y: entryProj.y - ideal.y, z: entryProj.z - ideal.z };
            const u = off.x * t1Ideal.x + off.y * t1Ideal.y + off.z * t1Ideal.z;
            const v = off.x * t2Ideal.x + off.y * t2Ideal.y + off.z * t2Ideal.z;
            const inside = Math.abs(u) <= half && Math.abs(v) <= half;
            const relSpeed = Math.hypot(this.spaceship.velocity.x, this.spaceship.velocity.y, this.spaceship.velocity.z);
            ok = inside && relSpeed <= 5;
          }
        }
        if (ok) {
          this._isInsidePlanetId = p.id;
          this.logger.log(LogLevel.INFO, LogCategory.LANDING, 'Landing entry succeeded', { planet: p.customName || p.id });
        } else {
          this.logger.log(LogLevel.WARN, LogCategory.LANDING, 'Crash on planet - restarting', { planet: p.customName || p.id });
          this.resetAfterCrash();
        }
      }
      this._prevSurfaceDistance.set(p.id, surfDist);
    }
  }

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
    this._isInsidePlanetId = null;
    this._landingTargetId = null;
    this._prevSurfaceDistance.clear();
    try { this.hudManager?.setLandingWindows(null); } catch {}
    try { this.landingOverlay?.setWindows(null); } catch {}
  }

  private async fetchAndCacheTargetDetails(target: ITargetable) {
    const cache = ((this as any)._targetDetailsCache ||= {});
    if (cache[target.id]) return; // Already have details
    try {
  const res = await this.targetDetails.getDetails(target);
      // Decorate asteroid details with fantastical metals when applicable
      if (res.type === TargetType.ASTEROID) {
        // No sobreescribir composición/albedo/mass si ya vienen fijados por la factoría
        const data: any = res.data as any;
        data.composition = data.composition ?? (target as any).composition ?? 'mixed';
        data.albedo = data.albedo ?? (target as any).albedo ?? Number((0.4 + Math.random() * 0.2).toFixed(2));
        data.massTons = data.massTons ?? (target as any).massTons ?? (50 + Math.floor(Math.random() * 101));
        // Incluir masa del vacío si el target la expone
        data.voidMassUnits = (target as any).voidMassUnits ?? 0;
      }
      // Enrich planets with requested details if missing
      if (res.type === TargetType.PLANET) {
        const data: any = res.data as any;
        // Planet type: prefer Planet.planetType enum, fallback to baseColorName
        if (!('planetType' in data)) {
          const p: any = target as any;
          data.planetType = p?.planetType ?? (p?.baseColorName ? String(p.baseColorName) : 'unknown');
        }
        // Probability of Life: default to 0 if missing
        if (typeof (data as any).probabilityOfLifePct !== 'number' || !isFinite((data as any).probabilityOfLifePct)) {
          (data as any).probabilityOfLifePct = 0;
        }
        // Void mass between 2000 and 5000 units if not provided
        if (typeof data.voidMassUnits !== 'number' || !isFinite(data.voidMassUnits)) {
          data.voidMassUnits = 2000 + Math.floor(Math.random() * 3001);
        }
        // If an older service returns volumeGu, convert to Mu
        if (typeof (data as any).volumeMu !== 'number' && typeof (data as any).volumeGu === 'number') {
          (data as any).volumeMu = Number(((data as any).volumeGu * 1000).toFixed(2));
        }
        // Volume in Mu (Mega units) ≈ (4/3 π r^3) / 1e6 (compute if still missing)
        if (typeof (data as any).volumeMu !== 'number' || !isFinite((data as any).volumeMu)) {
          const p: any = target as any;
          const r = Number(p?.scale?.x ?? p?.radius ?? 0);
          const vol = (4.0 / 3.0) * Math.PI * Math.pow(Math.max(0, r), 3);
          (data as any).volumeMu = Number.isFinite(vol) ? Number((vol / 1e6).toFixed(2)) : 0;
        }
        // Random planet-like name if none provided
        const pl = target as any;
        if (!pl.customName) {
          pl.customName = this.generatePlanetName();
        }
        if (!('name' in data) || !data.name) {
          data.name = pl.customName;
        }
      }
      cache[target.id] = res.data;
    } catch (e) {
      this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'Target details fetch failed', e);
    }
  }

  private getFallbackDetails(target: ITargetable) {
    if (target.getTargetType() === TargetType.ASTEROID) {
      return { composition: 'basalt', albedo: 0.3, massTons: 1200 };
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
  const voidMassUnits = 2000 + Math.floor(Math.random() * 3001);
  const planetType = p?.planetType ?? (p?.baseColorName ? String(p.baseColorName) : 'unknown');
  const probabilityOfLifePct = 0;
  return { name, planetType, volumeMu, voidMassUnits, probabilityOfLifePct };
    }
    return {};
  }

  // Generate a random planet name inspired by discovered exoplanets and classical naming
  private generatePlanetName(): string {
    const catalogPrefixes = ['Kepler', 'TRAPPIST', 'Gliese', 'Proxima', 'HD', 'K2', 'Tau', 'LHS', 'WASP', 'HIP'];
    const separators = ['-', ' ', ' '];
    const suffixAlpha = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const num = () => Math.floor(10 + Math.random() * 8900); // 10..8909 approx
    const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];
    const style = Math.random();
    if (style < 0.5) {
      // Catalog style: Kepler-452 b, TRAPPIST-1 e
      return `${pick(catalogPrefixes)}${pick(separators)}${num()}${Math.random() < 0.5 ? '' : ' '}${pick(suffixAlpha)}`.trim();
    } else {
      // Mythical/Latin + Roman numerals
      const myth = ['Aether', 'Chronos', 'Erebus', 'Gaia', 'Nyx', 'Hera', 'Hyperion', 'Icarus', 'Janus', 'Tethys', 'Rhea', 'Atlas'];
      const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
      return `${pick(myth)} ${pick(romans)}`;
    }
  }

  private typeToLabel(t: TargetType): string {
    switch (t) {
      case TargetType.CLUSTER: return 'Cluster';
      case TargetType.MEGA_ASTEROID: return 'MegaAsteroid';
      case TargetType.SUPER_ASTEROID: return 'SuperAsteroid';
      case TargetType.ASTEROID: return 'Asteroid';
      case TargetType.SPACESHIP: return 'Spaceship';
      case TargetType.SUN: return 'Sun';
      case TargetType.PLANET: return 'Planet';
      case TargetType.PORTAL: return 'Portal';
      case TargetType.WAYPOINT: return 'Waypoint';
      default: return 'Unknown';
    }
  }

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
    // Colisiones nave-asteroides
    this.asteroids.forEach((asteroid, index) => {
      if (this.spaceship.checkCollision(asteroid)) {
        this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Collision detected');
        // Por ahora solo registrar la colisión
        // TODO: Implementar lógica de daño/reinicio
      }
    });
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
      this.logger.log(LogLevel.DEBUG, LogCategory.RENDER, 'Rendering frame', { ship: this.spaceship?.position, asteroids: this.asteroids.length });
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

    // Renderizar nave con shader texturizado
  this.renderSpaceship();
    
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
            if ((rep as any) instanceof SuperAsteroid) supers.push(rep);
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
            if ((o as any) instanceof SuperAsteroid) supers.push(o);
            else smalls.push(o);
          }
        }
      });
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
    }

  // Renderizar planetas después de asteroides
  this.renderPlanets();
  // Render portals (blank portal: just halo disk)
  try {
    if (this.portals.length) {
    const gl = this.gl as WebGL2RenderingContext;
    // State for blending and depth (draw symbol/eye/flame as overlay)
      const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const wasBlend = gl.isEnabled(gl.BLEND);
    const wasDepth = gl.isEnabled(gl.DEPTH_TEST);
    const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean;
    gl.enable(gl.BLEND);
    // Use additive blend to intensify arcane glow
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    // Disable depth test/writes to avoid self-occlusion with disk
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
      for (const p of this.portals) {
        if (!p.vertexBuffer || !p.indexBuffer) continue;
        this.shaderManager.usePortalProgram();
        this.shaderManager.setPortalMatrices(p.modelMatrix, this.camera.viewMatrix, this.camera.projectionMatrix);
        const t = (performance.now() || 0) / 1000;
        const outer = new Float32Array([0.25, 0.9, 1.15]);
        const inner = new Float32Array([0.06, 0.14, 0.25]);
        const ringInner = 0.58;
        const ringOuter = 0.995;
        const pent = new Float32Array([0.0, 0.0, 0.0]);
        const eyeDir = new Float32Array([0.0, 0.0, 1.0]);
        const eyeRadius = 0.0;
        this.shaderManager.setPortalParams(t, outer, inner, ringInner, ringOuter, pent, eyeDir, eyeRadius);
        const aPos = (this.shaderManager as any).portalAttributes['position'];
        gl.bindBuffer(gl.ARRAY_BUFFER, p.vertexBuffer);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.indexBuffer);
        gl.drawElements(gl.TRIANGLES, p.indices.length, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(aPos);
      }
  if (!wasBlend) gl.disable(gl.BLEND);
  if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(prevDepthMask);
      if (prevProg) gl.useProgram(prevProg as any);
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
      const center = this.primarySun ? { ...this.primarySun.position } : { x: 0, y: 0, z: 0 } as any;
      // Rebuild id->target mapping each frame for map selection
      this.mapIdToTarget.clear();
      // Map the 'center' synthetic id to the actual primary sun target so clicks select it reliably
      if (this.primarySun) {
        this.mapIdToTarget.set('center', this.primarySun as unknown as ITargetable);
      }
  const planets = this.planets.map(p => {
        // Prefer Planet.getDisplayName() which already returns customName if present
        const label = (p.getDisplayName?.() || (p as any).customName || p.id);
        this.mapIdToTarget.set(p.id, p as unknown as ITargetable);
        return {
          id: p.id,
          label,
          pos: { x: p.position.x, y: p.position.y, z: p.position.z },
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
        if (rep) this.mapIdToTarget.set(c.id, rep);
        return { id: c.id, label: c.id, center: { x: c.center.x, y: c.center.y, z: c.center.z } };
      });
      const debris: Array<{ id: string; pos: { x: number; y: number; z: number }; label?: string }> = [];
      for (const arr of this.planetDebris.values()) {
        for (const d of arr) {
          debris.push({ id: d.obj.id, pos: { x: d.obj.position.x, y: d.obj.position.y, z: d.obj.position.z }, label: d.obj.getDisplayName?.() || d.obj.id });
          this.mapIdToTarget.set(d.obj.id, d.obj as unknown as ITargetable);
        }
      }
      const ship = this.spaceship ? { pos: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z }, label: 'Ship' } : undefined;
      if (this.spaceship) {
        // Allow selecting the player's ship as an ally from the map
        this.mapIdToTarget.set('ship', this.spaceship as unknown as ITargetable);
      }
        // If there is a deferred map selection (click happened before mapping), resolve it now
        if (this.pendingMapSelectId) {
          const pendingTgt = this.mapIdToTarget.get(this.pendingMapSelectId);
          if (pendingTgt && this.adaptiveTargeting) {
            try { this.adaptiveTargeting.selectTarget(pendingTgt); } catch {}
            try { this.systemPanel.setSelectedId(this.pendingMapSelectId); } catch {}
          }
          this.pendingMapSelectId = null;
        }
      // Prepare details for active item (selected or hovered)
      let details: Record<string, any> | undefined = undefined;
      try {
        const activeId = (this.systemPanel as any).getSelectedId?.() || (this.systemPanel as any).getHoveredId?.() || null;
        if (activeId) {
          const tgt = this.mapIdToTarget.get(activeId);
          if (tgt) {
            // Ensure details are fetched (async); use cached or fallback immediately
            this.fetchAndCacheTargetDetails(tgt as ITargetable);
            const base = (this as any)._targetDetailsCache?.[tgt.id] || this.getFallbackDetails(tgt as ITargetable);
            const tt = (tgt as ITargetable).getTargetType?.();
            const isMega = ((tgt as any)?.constructor?.name === 'MegaAsteroid') || ((tt as any) === TargetType.MEGA_ASTEROID);
            const isSuper = !isMega && ((tgt as any)?.constructor?.name === 'SuperAsteroid');
            const pTypeMap = String((tgt as any)?.planetType || '').toLowerCase();
            const specialMap = pTypeMap === 'ringed' ? 'Ringed' : (pTypeMap === 'dwarf' ? 'Dwarf' : (pTypeMap === 'protoplanet' ? 'Protoplanet' : null));
            const typeLabel = isMega ? 'MegaAsteroid' : (isSuper ? 'SuperAsteroid' : (specialMap ?? this.typeToLabel(tt)));
            const planetHints = (tt === TargetType.PLANET) ? {
              planetType: (tgt as any).planetType || (base as any)?.planetType || (tgt as any).baseColorName,
              probabilityOfLifePct: (tgt as any).probabilityOfLifePct ?? (base as any)?.probabilityOfLifePct ?? 0,
              volumeMu:
                (tgt as any).volumeMu
                ?? (base as any)?.volumeMu
                ?? (typeof (base as any)?.volumeGu === 'number'
                      ? Number(((base as any).volumeGu * 1000).toFixed(2))
                      : undefined),
            } : {};
            const voidMass = (tgt as any).voidMassUnits ?? 0;
            details = { ...(base || {}), ...planetHints, type: typeLabel, voidMassUnits: voidMass } as any;
          }
        }
      } catch {}

      this.systemPanel.updateMap({ center, planets, clusters, debris, ship, marginPx: 48, details });
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
  } else {
    // Draw background landing overlay behind the cockpit HUD (full camera view)
    try {
      if (this.overlayRenderer && this.landingOverlay && this.gl) {
        const c = this.gl.canvas as HTMLCanvasElement;
        this.landingOverlay.resize(c.width, c.height);
        this.landingOverlay.render(this.overlayRenderer);
      }
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
    if (this.planets.length > 0) return;

    const center = { x: 0, y: 0, z: 0 };
    // Crear Sol en el centro (inmóvil)
    const sunRadius = 1800; // radio grande
    const sun = new Sun('sol-primario', sunRadius, { ...center });
    sun.orbitCenter = { ...center };
    sun.semiMajor = 0; sun.semiMinor = 0; sun.orbitAngularSpeed = 0; sun.orbitAngle = 0;
    sun.angularVelocity.y = 0.0005; // leve rotación visual
    sun.customName = 'Sol';
    this.planets.push(sun);
    this.primarySun = sun;
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
        planetObj.probabilityOfLifePct = 100;
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
        // Tamaño entre planetoide y giant, más cerca de giant
        radius = 1800; // significativamente mayor que planetoide, menor que giant
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

  // Assign canonical catalog-like name at construction only if not already named
  try {
    if (!(planetObj as any).customName) {
      (planetObj as any).customName = this.generatePlanetName();
    }
  } catch {}
  this.planets.push(planetObj);
  // Actualizar separación: el siguiente anillo debe respetar b_next >= lastOuterA + spacing
  lastOuterA = a;
    }
  }

  /** Actualiza la posición/orientación de planetas según su órbita */
  private updatePlanets(dt: number): void {
    for (const p of this.planets) {
      // Skip orbital translation for anchored primary sun
      if (this.primarySun && p.id === this.primarySun.id) {
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
    for (const p of this.planets) {
      const isSun = (p as any).planetType === 'Sun';
      // Calcular iluminación basada en Sol si existe (direccional desde el sol al objeto)
      let lightDir = this.lightDirection;
      let ambientStrengthLocal = this.ambientStrength;
      let lightColorLocal = this.lightColor;
      if (this.primarySun) {
        const lx = p.position.x - this.primarySun.position.x;
        const ly = p.position.y - this.primarySun.position.y;
        const lz = p.position.z - this.primarySun.position.z;
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
        const tex = isEarthSplit
          ? this.billboardRenderer.getEarthSplitTexture()
          : this.billboardRenderer.getCircleTexture(this.rgbToHex(p.color.r, p.color.g, p.color.b));
        const tint: [number,number,number,number] = [1,1,1,1];
        // Compute camera basis (forward from target-position; right = forward x up; up re-orthonormalized)
        const fwdU = this.normalize({ x: cam.target.x - cam.position.x, y: cam.target.y - cam.position.y, z: cam.target.z - cam.position.z });
        const upW = cam.up;
        const right = this.normalize({ x: fwdU.y*upW.z - fwdU.z*upW.y, y: fwdU.z*upW.x - fwdU.x*upW.z, z: fwdU.x*upW.y - fwdU.y*upW.x });
        const upB = { x: right.y*fwdU.z - right.z*fwdU.y, y: right.z*fwdU.x - right.x*fwdU.z, z: right.x*fwdU.y - right.y*fwdU.x };
        // If planet is Ringed (e.g., Saturn), draw a static ring annulus behind the sphere.
        const isRinged = ((p as any)?.planetType === PlanetType.Ringed || String((p as any)?.planetType||'').toLowerCase()==='ringed');
        if (isRinged) {
          const ringTex = this.billboardRenderer.getRingTexture('ring-saturn');
          const ringDiameterPx = Math.min(384, diameterPx * 2.2);
          // Render ring first (behind), then sphere on top
          this.billboardRenderer.render(
            p.position,
            ringDiameterPx,
            cam.viewMatrix,
            cam.projectionMatrix,
            cam.position,
            upB,
            right,
            [1,1,1,0.98],
            ringTex
          );
        }
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
        // Saltar render geométrico y pases especiales (caps/glow) en modo sprite
        continue;
      }

      // Render normal; caps emisivas se pintan en un segundo pase después

      if (isSun) {
        // Distancia cámara-Sol para decidir magma
        const magma = this.textureManager.getTexture('magma');
        if (distCam < 20000 && magma && this.shaderManager.unlitTexProgram) {
          // Sun core con textura de magma (self-lit, sin iluminación)
          this.shaderManager.useUnlitTexProgram();
          this.calculateNormalMatrix(p.modelMatrix);
          this.shaderManager.setUnlitTexMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix);
          this.shaderManager.setUnlitDiffuseTexture(magma);
          p.render(this.gl, this.shaderManager.unlitTexProgram!, cam.viewMatrix, cam.projectionMatrix);
        } else {
          // Sun core: self-lit, flat color
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
      if ((p as any).renderGlow) {
        try {
          (p as any).renderGlow(this.gl as any, this.shaderManager, this.camera);
        } catch (e) {
          this.logger.log(LogLevel.WARN, LogCategory.RENDER, 'renderGlow(sun) failed', e);
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
    const earth = this.planets.find(p => p.id === 'planet-earth');
    const saturn = this.planets.find(p => p.id === 'planet-saturn');
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
    if (this.primarySun) {
      const lx = this.spaceship.position.x - this.primarySun.position.x;
      const ly = this.spaceship.position.y - this.primarySun.position.y;
      const lz = this.spaceship.position.z - this.primarySun.position.z;
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

  /**
   * Maneja eventos de teclado
   */
  public handleKeyDown(key: string): void {
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

    // Manejo de controles de nave
    if (this.spaceship && !this.animationManager.isBlockingInputs()) {
      this.updateShipControls(key, true);
    }
    // Toggle panel de mapa del sistema con tecla 'M'
    if (key.toLowerCase() === 'm') {
      if (this.systemPanel) {
        const next = !this.systemPanel.isEnabled();
        this.systemPanel.setEnabled(next);
        // Ensure mutual exclusivity with Grimoire
        if (next && this.grimoirePanel) {
          try { this.grimoirePanel.setEnabled(false); } catch {}
        }
        if (next) {
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
      return;
    }
    // Toggle Grimoire (ancient book) with 'L'
    if (key.toLowerCase() === 'l') {
      if (this.grimoirePanel) {
        const next = !this.grimoirePanel.isEnabled();
        this.grimoirePanel.setEnabled(next);
        // Ensure map is closed when grimoire opens
        if (next && this.systemPanel) {
          try { this.systemPanel.setEnabled(false); } catch {}
        }
        if (!next) {
          // Closing grimoire: clear selection
          this.clearTargetSelection();
        }
      }
      try { this.updateMapClickBinding(); } catch {}
      try { this.updateGrimoirePointerBinding(); } catch {}
      try { this.updateCanvasCursor(); } catch {}
      return;
    }
    // Escape: cerrar mapa/grimorio si están activos; si no, limpiar target actual
    if (key.toLowerCase() === 'escape') {
      if (this.systemPanel && this.systemPanel.isEnabled()) {
        this.systemPanel.setEnabled(false);
        try { this.updateMapClickBinding(); } catch {}
        try { this.updateCanvasCursor(); } catch {}
        // Mantener selección actual al cerrar mapa con Escape
        return;
      }
      if (this.grimoirePanel && this.grimoirePanel.isEnabled()) {
        this.grimoirePanel.setEnabled(false);
        try { this.updateGrimoirePointerBinding(); } catch {}
        try { this.updateCanvasCursor(); } catch {}
        // Mantener selección actual al cerrar grimorio con Escape
        return;
      }
      // No panels open: treat Escape as clear-target
      this.clearTargetSelection();
      return;
    }
    // Fase 2: lanzar hechizo con 'h' (desde el grimorio o recordando el seleccionado)
    if (key.toLowerCase() === 'h') {
      if (this.grimoirePanel && this.grimoirePanel.isEnabled()) {
        const selected = (this.grimoirePanel as any).getSelectedSpellType?.() as 'speed'|'longjump'|'gaterite'|null;
        const hovered = (this.grimoirePanel as any).getHoveredSpellType?.() as 'speed'|'longjump'|'gaterite'|null;
        const spell = selected || hovered;
        if (!spell) {
          // Nada seleccionado: no hacer nada
          return;
        }
        // Capturar target actual/hovered en el momento del casteo (si aplica al hechizo)
        const target = this.adaptiveTargeting?.getCurrentTarget?.() || this.adaptiveTargeting?.getHoveredTarget?.();
        // Cerrar el grimorio y volver a la escena 3D con cámara '0'
        try { this.grimoirePanel.setEnabled(false); } catch {}
        try { this.updateGrimoirePointerBinding(); } catch {}
        try { this.updateCanvasCursor(); } catch {}
  // Ir a cámara 0 si no lo está ya
  if (this.camera.getCurrentMode() !== CameraMode.INMOVILE_EXTERNAL) {
    this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
  }
  // Bloquear controles 2s de casteo
  this.animationManager.startBlockingDelay(2000);
  // Esperar 2 segundos y luego disparar animación/efecto
        setTimeout(() => {
          if (spell === 'longjump') {
            // Verificar energía del vacío antes de intentar el salto
            if (!this.spaceship || this.spaceship.voidEnergyCurrent < 50) {
              this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
              return;
            }
            if (target) {
              const center = (() => {
                const anyT: any = target as any;
                if (anyT.boundingSphere?.center) return { ...anyT.boundingSphere.center };
                if (anyT.position) return { x: anyT.position.x, y: anyT.position.y, z: anyT.position.z };
                return { x: 0, y: 0, z: 0 };
              })();
              const dx = center.x - this.spaceship.position.x;
              const dy = center.y - this.spaceship.position.y;
              const dz = center.z - this.spaceship.position.z;
              const dist = Math.hypot(dx, dy, dz);
              if (dist > 4000) {
                // Consumir 50u y lanzar animación de salto
                this.spaceship.voidEnergyCurrent = Math.max(0, this.spaceship.voidEnergyCurrent - 50);
                this.animationManager.startVoidJump(this, target);
              } else {
                this.logger.log(LogLevel.INFO, LogCategory.TARGETING, '[VoidJump] Target demasiado cerca (<4000u)', { distance: Math.round(dist) });
                this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
              }
            } else {
              // Sin target válido: placeholder
              this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
            }
          } else if (spell === 'speed') {
            // Mostrar mock de animación y aplicar buff al instante
            this.showPlaceholderText('ANIMATION NUMBER 1.', 1200);
            // Apply 2-minute max speed buff (Double Phased Time Rite)
            this.applySpeedRite(120000);
          } else if (spell === 'gaterite') {
            // Gate Rite: requiere planeta seleccionado y distancia ≤ 50u a la superficie
            const t = target as any;
            const isPlanet = typeof t?.getTargetType === 'function' && String(t.getTargetType?.()) === 'planet';
            if (!isPlanet) { this.showPlaceholderText('GATE RITE REQUIERE PLANETA', 2000); return; }
            const center = t.position as {x:number;y:number;z:number};
            const R = Math.max(1, (t.scale?.x ?? t.radius ?? 0));
            const dx = center.x - this.spaceship.position.x;
            const dy = center.y - this.spaceship.position.y;
            const dz = center.z - this.spaceship.position.z;
            const dCenter = Math.hypot(dx, dy, dz);
            const surf = dCenter - R;
            if (surf > 50) { this.showPlaceholderText('DEMASIADO LEJOS DEL PLANETA (>50u)', 2000); return; }
            // Iniciar Gate Rite tras el pre-focus ya hecho (2s bloqueados)
            try { this.animationManager.startGateRite(this, t); } catch (e) { this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'GateRite start error', e); }
          }
        }, 2000);
        return;
      }
      // Si el grimorio no está abierto: usar el hechizo seleccionado persistente (si existe)
      if (this.grimoirePanel) {
        const selected = (this.grimoirePanel as any).getSelectedSpellType?.() as 'speed'|'longjump'|'gaterite'|null;
        if (!selected) return;
        const target = this.adaptiveTargeting?.getCurrentTarget?.() || this.adaptiveTargeting?.getHoveredTarget?.();
        // Cambiar cámara y ejecutar tras 2s, igual que cuando se castea desde el grimorio
        if (this.camera.getCurrentMode() !== CameraMode.INMOVILE_EXTERNAL) {
          this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
        }
        this.animationManager.startBlockingDelay(2000);
        setTimeout(() => {
          if (selected === 'longjump') {
            if (!this.spaceship || this.spaceship.voidEnergyCurrent < 50) {
              this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
              return;
            }
            if (target) {
              const anyT: any = target as any;
              const center = anyT.boundingSphere?.center ? { ...anyT.boundingSphere.center } : (anyT.position ? { x: anyT.position.x, y: anyT.position.y, z: anyT.position.z } : { x: 0, y: 0, z: 0 });
              const dx = center.x - this.spaceship.position.x;
              const dy = center.y - this.spaceship.position.y;
              const dz = center.z - this.spaceship.position.z;
              const dist = Math.hypot(dx, dy, dz);
              if (dist > 4000) {
                this.spaceship.voidEnergyCurrent = Math.max(0, this.spaceship.voidEnergyCurrent - 50);
                this.animationManager.startVoidJump(this, target);
              } else {
                this.logger.log(LogLevel.INFO, LogCategory.TARGETING, '[VoidJump] Target demasiado cerca (<4000u)', { distance: Math.round(dist) });
                this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
              }
            } else {
              this.showPlaceholderText('ANIMATION NUMBER 2.', 2000);
            }
          } else if (selected === 'speed') {
            this.showPlaceholderText('ANIMATION NUMBER 1.', 1200);
            this.applySpeedRite(120000);
          } else if (selected === 'gaterite') {
            const t = target as any;
            const isPlanet = typeof t?.getTargetType === 'function' && String(t.getTargetType?.()) === 'planet';
            if (!isPlanet) { this.showPlaceholderText('GATE RITE REQUIERE PLANETA', 2000); return; }
            const center = t.position as {x:number;y:number;z:number};
            const R = Math.max(1, (t.scale?.x ?? t.radius ?? 0));
            const dx = center.x - this.spaceship.position.x;
            const dy = center.y - this.spaceship.position.y;
            const dz = center.z - this.spaceship.position.z;
            const dCenter = Math.hypot(dx, dy, dz);
            const surf = dCenter - R;
            if (surf > 50) { this.showPlaceholderText('DEMASIADO LEJOS DEL PLANETA (>50u)', 2000); return; }
            try { this.animationManager.startGateRite(this, t); } catch (e) { this.logger.log(LogLevel.ERROR, LogCategory.ANIMATION, 'GateRite start error', e); }
          }
        }, 2000);
        return;
      }
      return;
    }
  }
  public handleKeyUp(key: string): void {
    if (this.spaceship && !this.animationManager.isBlockingInputs()) {
      this.updateShipControls(key, false);
    }
  }

  /** Apply the Double Phased Time Rite: doubles maxSpeed for a duration (default 2 minutes) */
  private applySpeedRite(durationMs: number = 120000): void {
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

  /** Minimal full-screen text overlay helper for placeholder animations */
  private showPlaceholderText(msg: string, durationMs: number = 2000): void {
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
      objectCount: this.asteroids.length + 1,
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
  private createThrusterMatrix(scaleFactor: number): Float32Array {
    const matrix = new Float32Array(16);
    
    // 1. Inicializar matriz identidad
    this.identityMatrix(matrix);
    
    // 2. PRIMERO: Aplicar escalado (en espacio local del objeto)
    this.scaleMatrixUniform(matrix, scaleFactor);
    
    // 3. SEGUNDO: Aplicar rotaciones (en el mismo orden que la spaceship)
    this.rotateXMatrix(matrix, this.spaceship.rotation.x);
    this.rotateYMatrix(matrix, this.spaceship.rotation.y); 
    this.rotateZMatrix(matrix, this.spaceship.rotation.z);
    
    // 4. ÚLTIMO: Aplicar traslación (mover al mundo)
    this.translateMatrix(matrix, this.spaceship.position.x, this.spaceship.position.y, this.spaceship.position.z);
    
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

    const baseMax = (this.speedRiteOriginalMax && isFinite(this.speedRiteOriginalMax)) ? this.speedRiteOriginalMax : this.spaceship.maxSpeed;
    const speedPctExtended = (this.spaceship.currentSpeed / Math.max(1e-6, baseMax)) * 100; // 0..200 when rite active
    const riteActive = !!(this.speedRiteUntilMs && isFinite(this.speedRiteUntilMs) && performance.now() < this.speedRiteUntilMs);
    const gameData = {
      velocity: velocityMagnitude,
      heading: this.spaceship.rotation.y * (180 / Math.PI), // Convertir a grados
      pitch: this.spaceship.rotation.x * (180 / Math.PI),
      roll: this.spaceship.rotation.z * (180 / Math.PI),
      altitude: this.spaceship.position.y,
  speed: Math.max(0, Math.min(200, speedPctExtended)),
      maxSpeed: this.spaceship.maxSpeed,
      baseMaxSpeed: baseMax,
      voidEnergy: {
        current: this.spaceship.voidEnergyCurrent,
        max: this.spaceship.voidEnergyMax,
        pct: (this.spaceship.voidEnergyCurrent / this.spaceship.voidEnergyMax) * 100
      },
      weapons: this.spaceship.weapons,
      // Pasar posición de la nave para cálculo de bearing/elevación en brújula
      position: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z },
      speedRiteRemainingSec: riteActive ? Math.max(0, Math.floor((this.speedRiteUntilMs! - performance.now()) / 1000)) : null
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
      const earth = this.planets.find(p => p.id === 'planet-earth');
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
        return {
          x: info.screenPosition.x * dpr,
          y: info.screenPosition.y * dpr,
          name: info.name || (t.getDisplayName?.() || t.id),
          typeLabel,
          distanceEdge: info.distanceToEdge ?? 0,
          color: info.accentColor || '#60a5fa',
          healthPct
        } as any;
      };

      // Render hovered (slightly brighter than before) if present and different from selected
      if (hovered && (!selected || hovered.id !== selected.id)) {
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
      if (selected) {
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
  private updateMapClickBinding(): void {
    if (!this.domCanvas || !this.systemPanel) return;
    const el = this.domCanvas;
    const handler = (this as any)._mapClickHandler as ((e: MouseEvent) => void) | undefined;
    const moveHandler = (this as any)._mapMoveHandler as ((e: MouseEvent) => void) | undefined;
    const wheelHandler = (this as any)._mapWheelHandler as ((e: WheelEvent) => void) | undefined;
    const enabled = this.systemPanel.isEnabled();
    if (enabled) {
      if (!handler) {
        const h = (e: MouseEvent) => {
          if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl) return;
          const rect = el.getBoundingClientRect();
          const id = this.systemPanel!.hitTestViewport(
            e.clientX,
            e.clientY,
            rect,
            (this.gl!.canvas as HTMLCanvasElement).width,
            (this.gl!.canvas as HTMLCanvasElement).height
          );
          if (id) {
            // No permitir selección de la nave en el mapa (solo hover outline)
            if (id === 'ship') {
              return;
            }
            const target = this.mapIdToTarget.get(id);
            if (target && this.adaptiveTargeting) {
              try { this.adaptiveTargeting.selectTarget(target); } catch {}
              try { this.systemPanel!.setSelectedId(id); } catch {}
            } else {
              // Defer selection until id->target mapping is rebuilt in the first render pass
              this.pendingMapSelectId = id;
            }
          }
        };
        (this as any)._mapClickHandler = h;
        el.addEventListener('click', h);
      }
      if (!moveHandler) {
        const mh = (e: MouseEvent) => {
          if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl) return;
          const rect = el.getBoundingClientRect();
          // Update cursor position on the map
          try { this.systemPanel!.setCursorFromViewport(
            e.clientX,
            e.clientY,
            rect,
            (this.gl!.canvas as HTMLCanvasElement).width,
            (this.gl!.canvas as HTMLCanvasElement).height
          ); } catch {}
          const id = this.systemPanel!.hitTestViewport(
            e.clientX,
            e.clientY,
            rect,
            (this.gl!.canvas as HTMLCanvasElement).width,
            (this.gl!.canvas as HTMLCanvasElement).height
          );
          try { this.systemPanel!.setHoveredId(id); } catch {}
        };
        (this as any)._mapMoveHandler = mh;
        el.addEventListener('mousemove', mh);
      }
      if (!wheelHandler) {
        const wh = (e: WheelEvent) => {
          if (!this.systemPanel || !this.systemPanel.isEnabled() || !this.gl) return;
          const rect = el.getBoundingClientRect();
          try {
            this.systemPanel.handleWheelFromViewport(
              e.deltaY,
              e.clientX,
              e.clientY,
              rect,
              (this.gl!.canvas as HTMLCanvasElement).width,
              (this.gl!.canvas as HTMLCanvasElement).height
            );
          } catch {}
          // Prevent page scroll when zooming the map
          try {
            e.preventDefault();
            // Also stop propagation so other handlers (e.g., camera zoom) don't receive it
            e.stopPropagation();
            // Some handlers may be registered in the same phase; be extra safe
            (e as any).cancelBubble = true;
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          } catch {}
        };
        (this as any)._mapWheelHandler = wh;
        // Use non-passive to allow preventDefault
        el.addEventListener('wheel', wh, { passive: false } as any);
      }
    } else {
      if (handler) {
        el.removeEventListener('click', handler);
        (this as any)._mapClickHandler = undefined;
      }
      if (moveHandler) {
        el.removeEventListener('mousemove', moveHandler);
        (this as any)._mapMoveHandler = undefined;
      }
      if (wheelHandler) {
        el.removeEventListener('wheel', wheelHandler as any);
        (this as any)._mapWheelHandler = undefined;
      }
      try { this.systemPanel.setSelectedId(null); } catch {}
      try { this.systemPanel.setHoveredId(null); } catch {}
    }
  }

  /** Attach/detach pointer tracking for GrimoirePanel (cursor only) */
  private updateGrimoirePointerBinding(): void {
    if (!this.domCanvas || !this.grimoirePanel) return;
    const el = this.domCanvas;
    const moveHandler = (this as any)._grimoireMoveHandler as ((e: MouseEvent) => void) | undefined;
    const clickHandler = (this as any)._grimoireClickHandler as ((e: MouseEvent) => void) | undefined;
    const enabled = this.grimoirePanel.isEnabled();
    if (enabled) {
      if (!moveHandler) {
        const mh = (e: MouseEvent) => {
          if (!this.grimoirePanel || !this.grimoirePanel.isEnabled() || !this.gl) return;
          const rect = el.getBoundingClientRect();
          try { this.grimoirePanel!.setCursorFromViewport(
            e.clientX,
            e.clientY,
            rect,
            (this.gl!.canvas as HTMLCanvasElement).width,
            (this.gl!.canvas as HTMLCanvasElement).height
          ); } catch {}
        };
        (this as any)._grimoireMoveHandler = mh;
        el.addEventListener('mousemove', mh);
      }
      if (!clickHandler) {
        const ch = (e: MouseEvent) => {
          if (!this.grimoirePanel || !this.grimoirePanel.isEnabled()) return;
          // Prefer UI: set selected spell from hover
          const t = (this.grimoirePanel as any).getHoveredSpellType?.() as 'speed'|'longjump'|null;
          if (t) {
            try { (this.grimoirePanel as any).setSelectedSpellType?.(t); } catch {}
          }
          // Swallow click so it doesn't affect 3D
          try {
            e.preventDefault();
            e.stopPropagation();
            (e as any).cancelBubble = true;
            if ((e as any).stopImmediatePropagation) (e as any).stopImmediatePropagation();
          } catch {}
        };
        (this as any)._grimoireClickHandler = ch;
        // Use capture to ensure the grimoire click runs before other canvas listeners (e.g., adaptive targeting)
        el.addEventListener('click', ch, { capture: true });
      }
    } else {
      if (moveHandler) {
        el.removeEventListener('mousemove', moveHandler);
        (this as any)._grimoireMoveHandler = undefined;
      }
      if (clickHandler) {
        // Must pass the same capture flag used during addEventListener to successfully remove
        el.removeEventListener('click', clickHandler, { capture: true as any });
        (this as any)._grimoireClickHandler = undefined;
      }
    }
  }

  /** Hide OS cursor when Grimoire is enabled; restore otherwise */
  private updateCanvasCursor(): void {
    try {
      if (!this.domCanvas) return;
      const gOn = !!(this.grimoirePanel && this.grimoirePanel.isEnabled());
      this.domCanvas.style.cursor = gOn ? 'none' : '';
    } catch {}
  }

  /**
   * Configura eventos del mouse para el sistema de targeting adaptativo
   */
  private setupAdaptiveTargetingEvents(canvasRef: any): void {
    // Obtener canvas desde WebGLService que ya está inicializado
    const canvas = this.webglService.getCanvas();
    
    if (!canvas) {
  this.logger.log(LogLevel.WARN, LogCategory.TARGETING, 'No se pudo obtener canvas desde WebGLService para eventos de targeting');
      return;
    }

  this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'Canvas obtenido desde WebGLService para eventos de targeting');

    // Setup click handler for adaptive targeting
    const handleClick = (event: MouseEvent) => {
      // If an opaque panel is open, do NOT handle 3D selection here; let the panel's own handler receive the event
      const mapOpen = !!(this.systemPanel && this.systemPanel.isEnabled?.());
      const grimoireOpen = !!(this.grimoirePanel && this.grimoirePanel.isEnabled?.());
      if (mapOpen || grimoireOpen) {
        // Important: don't stop propagation here so SolarSystemPanel/Grimoire listeners can process the click
        // Swallow legacy ReticleManager click consumption by marking a flag; ReticleManager will skip for mapOpen
        (globalThis as any).GameEngineInstance = (globalThis as any).GameEngineInstance || this;
        return; // no adaptive click selection
      }
      if (!this.adaptiveTargeting) return;
      this.adaptiveTargeting.handleClick();
    };

    canvas.addEventListener('click', handleClick);
  this.logger.log(LogLevel.INFO, LogCategory.TARGETING, 'AdaptiveTargeting mouse events configured successfully');
  }

  /** Map ID resolver for a given world target: returns the map item id to select/highlight */
  private resolveMapIdForTarget(target: ITargetable): string | null {
    try {
      // Primary Sun maps to 'center'
      if (this.primarySun && (target as any).id === (this.primarySun as any).id) return 'center';
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
}
