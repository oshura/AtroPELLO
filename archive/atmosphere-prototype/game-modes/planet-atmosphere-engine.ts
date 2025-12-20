import { ElementRef } from '@angular/core';
import { PanelEventCallbacks } from '../services/ui/panel-event-coordinator.service';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { CanvasResizeMetrics } from '../GameEngine';
import { CameraMode } from '../Camera';
import { IGameModeEngine, GameModeEvent } from './game-mode-engine.interface';
import {
  SharedGameContext,
  AtmosphereSceneSnapshot,
  AtmospherePaletteSnapshot,
  AtmosphereLightSnapshot,
  AtmosphereColorVector,
  AtmosphereBoundarySnapshot,
  AtmosphereBoundaryDetection,
  AtmosphereBoundaryEvent,
  AtmospherePhysicsSnapshot,
  AtmosphereLandingFadePayload,
  AtmosphereCameraPosePayload,
} from './shared-game-context';
import { Planet, PlanetColorName, PlanetType } from '../game-objects/Planet';
import { AtmosphereLightNode } from './lighting/atmosphere-light-node';
import { PlayingHandle } from '../../services/audio/audio-engine.service';
import { PlanetTerrainGenerator } from './terrain/planet-terrain-generator';
import { PlanetTerrainSnapshot, PlanetTerrainMaterialProfile } from './terrain/planet-terrain.types';
import { AtmosphereTerrainRenderer } from './rendering/atmosphere-terrain-renderer';
import { LandingStatus } from '../types/landing.types';
import { HudMarqueeEventType } from '../types/hud.types';
import { computePlanetTerrainContact } from './terrain/planet-terrain-contact';
import { Vector3 } from '../../types/game.types';
import {
  computeBoundaryMetrics,
  DEFAULT_NEAR_GROUND_THRESHOLD,
  MIN_BOUNDARY_SEPARATION,
} from './utils/atmosphere-boundary.utils';

interface AtmosphereFlightStatePayload {
  stallWarning?: boolean;
  stallActive?: boolean;
  stallRatio?: number;
  grounded?: boolean;
  speed?: number;
}

type AtmosphereFloatPalette = {
  horizon: Float32Array;
  zenith: Float32Array;
  haze: Float32Array;
};

const PLANET_COLOR_SWATCHES: Record<PlanetColorName, AtmosphereColorVector> = {
  verde: [0.20, 0.65, 0.35],
  azul_hielo: [0.70, 0.85, 1.00],
  marron: [0.45, 0.30, 0.20],
  gris: [0.55, 0.55, 0.58],
  azul_marino: [0.05, 0.10, 0.30],
  rojo_carmesi: [0.70, 0.04, 0.18],
  violeta_oscuro: [0.25, 0.05, 0.35],
};

const DEFAULT_PALETTE_BASE: AtmospherePaletteSnapshot = {
  horizon: [0.92, 0.62, 0.44],
  zenith: [0.08, 0.10, 0.22],
  haze: [0.96, 0.86, 0.72],
};

const DEFAULT_LIGHT_DIRECTION: AtmosphereColorVector = [-0.18, 0.86, 0.38];
const DEFAULT_LIGHT_COLOR: AtmosphereColorVector = [1.0, 0.94, 0.82];

const DEFAULT_LIGHT_BASE: AtmosphereLightSnapshot = {
  direction: DEFAULT_LIGHT_DIRECTION,
  color: DEFAULT_LIGHT_COLOR,
  intensity: 0.95,
};
const REF_HORIZON: AtmosphereColorVector = DEFAULT_PALETTE_BASE.horizon;
const REF_ZENITH: AtmosphereColorVector = DEFAULT_PALETTE_BASE.zenith;
const REF_HAZE: AtmosphereColorVector = DEFAULT_PALETTE_BASE.haze;
const REF_LIGHT_COLOR: AtmosphereColorVector = DEFAULT_LIGHT_COLOR;

const RAD_TO_DEG = 180 / Math.PI;
const MIN_STALL_DELTA_SECONDS = 1 / 120;
const MAX_STALL_DELTA_SECONDS = 0.25;
const GROUND_CONTACT_THRESHOLD = 8;
const GROUND_IMPACT_COOLDOWN_MS = 1200;
const AUTOLAND_COOLDOWN_MS = 3000;
const STALL_WARNING_DELAY_MS = 1500;
const PILOT_WARNING_COOLDOWN_MS = 5000;

function cloneColorVector(source: AtmosphereColorVector | null | undefined): AtmosphereColorVector {
  if (!source) {
    return [0, 0, 0];
  }
  return [source[0], source[1], source[2]];
}

function clonePaletteSnapshot(snapshot: AtmospherePaletteSnapshot): AtmospherePaletteSnapshot {
  return {
    horizon: cloneColorVector(snapshot.horizon),
    zenith: cloneColorVector(snapshot.zenith),
    haze: cloneColorVector(snapshot.haze),
  };
}

function cloneLightSnapshot(snapshot: AtmosphereLightSnapshot): AtmosphereLightSnapshot {
  return {
    direction: cloneColorVector(snapshot.direction),
    color: cloneColorVector(snapshot.color),
    intensity: snapshot.intensity,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mixColor(a: AtmosphereColorVector, b: AtmosphereColorVector, factor: number): AtmosphereColorVector {
  const f = clamp01(factor);
  return [
    clamp01(a[0] + (b[0] - a[0]) * f),
    clamp01(a[1] + (b[1] - a[1]) * f),
    clamp01(a[2] + (b[2] - a[2]) * f),
  ];
}

function computeLuma(color: AtmosphereColorVector): number {
  return clamp01(0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]);
}

function currentTimestamp(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function createDefaultSceneSnapshot(): AtmosphereSceneSnapshot {
  return {
    planetId: null,
    planetName: 'Atmosphere Standby',
    palette: clonePaletteSnapshot(DEFAULT_PALETTE_BASE),
    primaryLight: cloneLightSnapshot(DEFAULT_LIGHT_BASE),
    updatedAt: currentTimestamp(),
    source: 'default',
  };
}

function floatPaletteFromSnapshot(snapshot: AtmospherePaletteSnapshot): AtmosphereFloatPalette {
  return {
    horizon: new Float32Array(snapshot.horizon),
    zenith: new Float32Array(snapshot.zenith),
    haze: new Float32Array(snapshot.haze),
  };
}

function resolvePaletteSnapshot(baseColor: AtmosphereColorVector): AtmospherePaletteSnapshot {
  return {
    horizon: mixColor(REF_HORIZON, baseColor, 0.55),
    zenith: mixColor(REF_ZENITH, baseColor, 0.35),
    haze: mixColor(REF_HAZE, baseColor, 0.65),
  };
}

function resolvePrimaryLightSnapshot(baseColor: AtmosphereColorVector): AtmosphereLightSnapshot {
  const lightColor = mixColor(REF_LIGHT_COLOR, baseColor, 0.3);
  const luma = computeLuma(baseColor);
  const intensity = clamp(0.75 + luma * 0.45, 0.65, 1.25);
  return {
    direction: cloneColorVector(DEFAULT_LIGHT_DIRECTION),
    color: lightColor,
    intensity,
  };
}

function normalizeVector3(x: number, y: number, z: number): Vector3 {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 1e-3) {
    return { x: 0, y: 1, z: 0 };
  }
  const inv = 1 / length;
  return { x: x * inv, y: y * inv, z: z * inv };
}

function subtractVector3(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function dotVector3(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVector3(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function cloneVector3(source: Vector3 | null | undefined): Vector3 | null {
  if (!source) {
    return null;
  }
  const { x, y, z } = source;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function computeVector3Magnitude(vec: Vector3 | null): number | null {
  if (!vec) {
    return null;
  }
  const mag = Math.hypot(vec.x, vec.y, vec.z);
  return Number.isFinite(mag) ? mag : null;
}

function computeImpactAngleDegrees(velocity: Vector3 | null, surfaceNormal: Vector3 | null): number | null {
  if (!velocity || !surfaceNormal) {
    return null;
  }
  const speed = computeVector3Magnitude(velocity);
  if (!speed || speed <= 1e-3) {
    return null;
  }
  const invSpeed = 1 / speed;
  const vx = velocity.x * invSpeed;
  const vy = velocity.y * invSpeed;
  const vz = velocity.z * invSpeed;
  const dot = clamp(-(vx * surfaceNormal.x + vy * surfaceNormal.y + vz * surfaceNormal.z), -1, 1);
  return Math.acos(dot) * RAD_TO_DEG;
}

function createBoundaryDetectionDefaults(): AtmosphereBoundaryDetection {
  return {
    shipDistance: null,
    shipAltitude: null,
    relativeAltitude: null,
    projectedAltitude: null,
    nearGround: false,
    aboveDome: false,
    surfaceNormal: null,
    impactAngle: null,
    lastEvent: null,
    lastEventAt: null,
    timestamp: currentTimestamp(),
  };
}

function createDefaultBoundarySnapshot(): AtmosphereBoundarySnapshot {
  return {
    planetId: null,
    planetName: null,
    planetType: null,
    landingEnabled: false,
    basePlanetRadius: 200,
    groundRadius: null,
    domeRadius: 320,
    minSeparation: MIN_BOUNDARY_SEPARATION,
    nearGroundThreshold: DEFAULT_NEAR_GROUND_THRESHOLD,
    updatedAt: currentTimestamp(),
    detection: createBoundaryDetectionDefaults(),
  };
}

export function buildBoundarySnapshotFromPlanet(planet: Planet | null): AtmosphereBoundarySnapshot {
  if (!planet) {
    return createDefaultBoundarySnapshot();
  }
  const metrics = computeBoundaryMetrics(planet);
  const detection = createBoundaryDetectionDefaults();
  return {
    planetId: planet.id,
    planetName: planet.getDisplayName?.() ?? planet.customName ?? planet.baseColorName ?? 'Planet',
    planetType: planet.planetType ?? null,
    landingEnabled: metrics.landingEnabled,
    basePlanetRadius: metrics.basePlanetRadius,
    groundRadius: metrics.groundRadius,
    domeRadius: metrics.domeRadius,
    minSeparation: metrics.minSeparation,
    nearGroundThreshold: metrics.nearGroundThreshold,
    updatedAt: currentTimestamp(),
    detection,
  };
}

export class PlanetAtmosphereEngine implements IGameModeEngine {
  public readonly name = 'atmosphere';

  private initialized = false;
  private sharedContext: SharedGameContext | null = null;
  private canvas: ElementRef<HTMLCanvasElement> | null = null;
  private gl: WebGLRenderingContext | null = null;
  private skyProgram: WebGLProgram | null = null;
  private skyBuffer: WebGLBuffer | null = null;
  private attribPosition = -1;
  private uniformHorizon: WebGLUniformLocation | null = null;
  private uniformZenith: WebGLUniformLocation | null = null;
  private uniformHaze: WebGLUniformLocation | null = null;
  private uniformTime: WebGLUniformLocation | null = null;
  private uniformLightColor: WebGLUniformLocation | null = null;
  private uniformLightDirection: WebGLUniformLocation | null = null;
  private uniformLightIntensity: WebGLUniformLocation | null = null;
  private uniformCloudTintLow: WebGLUniformLocation | null = null;
  private uniformCloudTintHigh: WebGLUniformLocation | null = null;
  private uniformCloudCoverage: WebGLUniformLocation | null = null;
  private uniformCloudOpacity: WebGLUniformLocation | null = null;
  private rafHandle: number | null = null;
  private viewportDirty = true;
  private lastTimestamp = 0;
  private stallWarningHandle: PlayingHandle | null = null;
  private stallAlarmHandle: PlayingHandle | null = null;
  private stallWarningActive = false;
  private stallActive = false;
  private stallAlarmStartedAt = 0;
  private stallAccelerationActive = false;
  private lastPilotWarningAt = 0;
  private readonly lightNode = new AtmosphereLightNode(DEFAULT_LIGHT_BASE);
  private readonly sceneRefreshIntervalMs = 900;
  private lastSceneRefreshAt = 0;
  private sceneSnapshot: AtmosphereSceneSnapshot = createDefaultSceneSnapshot();
  private palette: AtmosphereFloatPalette = floatPaletteFromSnapshot(this.sceneSnapshot.palette);
  private boundarySnapshot: AtmosphereBoundarySnapshot = createDefaultBoundarySnapshot();
  private readonly terrainGenerator = new PlanetTerrainGenerator();
  private terrainSnapshot: PlanetTerrainSnapshot | null = null;
  private terrainRenderer: AtmosphereTerrainRenderer | null = null;
  private lastTerrainSkipReason: string | null = null;
  private lastNearGroundState = false;
  private lastAboveDomeState = false;
  private lastGroundImpactAt = 0;
  private lastAutoLandingAt = 0;
  private lastLandingCameraPose: AtmosphereCameraPosePayload | null = null;
  private lastLandingAnchor: Vector3 | null = null;
  private readonly fallbackMatrix = (() => {
    const matrix = new Float32Array(16);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
    return matrix;
  })();
  private freePointerUnsub: (() => void) | null = null;
  private lookYaw = 0;
  private lookPitch = -0.25;
  private readonly defaultOrbitDistance = 26;
  private cameraForwardFallbackLogged = false;
  private readonly forwardDownTilt = 0.14;

  constructor(private readonly logger: LoggingService) {}

  async initialize(canvasRef: ElementRef<HTMLCanvasElement>, shared: SharedGameContext): Promise<void> {
    this.sharedContext = shared;
    this.canvas = canvasRef;
    this.gl = shared.webgl.getContext() ?? null;

    if (!this.gl) {
      this.logger.warn(LogCategory.RENDER, 'PlanetAtmosphereEngine: WebGL context not available');
      return;
    }

    this.setupSkyDome();
    this.terrainRenderer = new AtmosphereTerrainRenderer(this.gl, this.logger);
    this.refreshSceneSnapshot('initialize');
    this.attachBaseInputHandlers();
    this.resetCameraLookFromPose(this.lastLandingCameraPose);
    this.applyCameraOrbit('initialize');
    this.initialized = true;
    this.sharedContext?.hudManager?.startFadeIn?.(0.3);
  }

  startLoop(): void {
    if (!this.initialized || this.rafHandle !== null) {
      return;
    }
    this.logger.info(LogCategory.GAME_LOOP, 'PlanetAtmosphereEngine loop start');
    this.lastTimestamp = performance.now();
    this.rafHandle = requestAnimationFrame(this.renderFrame);
  }

  stop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.detachBaseInputHandlers();
    this.resetStallState();
    this.logger.info(LogCategory.GAME_LOOP, 'PlanetAtmosphereEngine loop stopped');
  }

  applyCanvasResize(_: CanvasResizeMetrics): void {
    this.viewportDirty = true;
  }

  setInputHandlers(_: PanelEventCallbacks): void {
    this.attachBaseInputHandlers();
  }

  handleGameEvent(event: GameModeEvent): void {
    if (!event) {
      return;
    }

    switch (event.type) {
      case 'landing:fade-in':
        this.captureLandingPayload(event.payload as AtmosphereLandingFadePayload | undefined);
        this.refreshSceneSnapshot('landing:fade-in');
        this.sharedContext?.hudManager?.startFadeIn?.(0.3);
        this.resetStallState();
        this.logLandingFadeInTelemetry(event);
        break;
      case 'landing:touchdown':
      case 'landing:complete':
        this.resetStallState();
        break;
      case 'atmosphere:flight-state':
        this.applyFlightState(event.payload as AtmosphereFlightStatePayload | undefined);
        break;
      default:
        this.logger.debug(LogCategory.GAME_LOOP, 'PlanetAtmosphereEngine event', event);
        break;
    }
  }

  private logLandingFadeInTelemetry(event?: GameModeEvent | null): void {
    const gameState = this.sharedContext?.gameState ?? null;
    const spaceship = gameState?.spaceship ?? null;
    const planet = gameState?.getActiveLandingPlanet?.() ?? null;
    const camera = gameState?.camera ?? null;
    const payload = event?.payload as AtmosphereLandingFadePayload | undefined;
    const landingContext = payload?.landingContext ?? null;
    const anchor = payload?.anchor ?? null;
    const cameraPose = payload?.cameraPose ?? null;

    let shipDistance: number | null = null;
    let distanceMinusGround: number | null = null;
    if (spaceship && planet) {
      const dx = spaceship.position.x - planet.position.x;
      const dy = spaceship.position.y - planet.position.y;
      const dz = spaceship.position.z - planet.position.z;
      const distance = Math.hypot(dx, dy, dz);
      shipDistance = Number.isFinite(distance) ? distance : null;
      const groundRadius = this.boundarySnapshot.groundRadius ?? this.boundarySnapshot.basePlanetRadius;
      if (shipDistance !== null && Number.isFinite(groundRadius)) {
        distanceMinusGround = shipDistance - groundRadius;
      }
    }

    let anchorDistance: number | null = null;
    let anchorAltitude: number | null = null;
    if (anchor && planet) {
      const adx = anchor.x - planet.position.x;
      const ady = anchor.y - planet.position.y;
      const adz = anchor.z - planet.position.z;
      const distance = Math.hypot(adx, ady, adz);
      anchorDistance = Number.isFinite(distance) ? distance : null;
      const groundRadius = this.boundarySnapshot.groundRadius ?? this.boundarySnapshot.basePlanetRadius;
      if (anchorDistance !== null) {
        anchorAltitude = anchorDistance - groundRadius;
      }
    }

    const hudPose = camera
      ? {
          mode: camera.getCurrentMode?.() ?? null,
          hasViewMatrix: Boolean(camera.viewMatrix),
          hasProjectionMatrix: Boolean(camera.projectionMatrix),
          position: camera.position ? {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          } : null,
        }
      : null;

    this.logAtmosphereDebug('Landing fade-in telemetry', {
      reason: event?.type ?? null,
      planetId: planet?.id ?? null,
      shipDistance,
      distanceMinusGround,
      groundRadius: this.boundarySnapshot.groundRadius,
      domeRadius: this.boundarySnapshot.domeRadius,
      hudPose,
      payloadHasSurfacePoint: Boolean(landingContext?.surfacePoint),
      payloadHasSurfaceNormal: Boolean(landingContext?.surfaceNormal),
      payloadRadius: landingContext?.radius ?? null,
      payloadHasAnchor: Boolean(anchor),
      payloadAnchorAltitude: anchorAltitude,
      payloadHasCameraPose: Boolean(cameraPose),
    });
  }

  private captureLandingPayload(payload?: AtmosphereLandingFadePayload | null): void {
    this.lastLandingCameraPose = payload?.cameraPose ?? null;
    this.lastLandingAnchor = payload?.anchor ?? null;
    this.resetCameraLookFromPose(this.lastLandingCameraPose);
    this.applyCameraOrbit('landing-payload');
  }

  private refreshSceneSnapshot(reason: string = 'init'): void {
    const snapshot = this.buildSceneSnapshotFromPlanet();
    this.sceneSnapshot = snapshot;
    this.palette = floatPaletteFromSnapshot(snapshot.palette);
    this.lightNode.update(snapshot.primaryLight);
    if (this.sharedContext) {
      this.sharedContext.atmosphereScene = snapshot;
    }
    try {
      this.sharedContext?.hudManager?.setSceneContext?.(snapshot);
    } catch (error) {
      this.logger.warn(LogCategory.HUD, 'HUD scene context hook failed', { error });
    }
    this.logger.debug(LogCategory.RENDER, 'Atmosphere scene snapshot refreshed', {
      reason,
      planetId: snapshot.planetId,
      source: snapshot.source,
    });
    this.logAtmosphereDebug('Scene snapshot refreshed', {
      reason,
      planetId: snapshot.planetId,
      paletteHorizon: snapshot.palette.horizon,
    });
    this.refreshBoundarySnapshot(reason);
  }

  private refreshBoundarySnapshot(reason: string = 'init'): void {
    const planet = this.sharedContext?.gameState?.getActiveLandingPlanet?.() ?? null;
    try {
      this.sharedContext?.gameState?.setActiveLandingPlanet?.(planet ?? null);
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Failed to sync active landing planet while refreshing boundaries', {
        error,
        planetId: planet?.id ?? null,
      });
    }
    this.logAtmosphereDebug('Active landing planet sync requested', {
      source: 'boundary-refresh',
      planetId: planet?.id ?? null,
      hasPlanet: Boolean(planet),
    });
    this.boundarySnapshot = buildBoundarySnapshotFromPlanet(planet);
    this.publishBoundarySnapshot();
    this.publishPhysicsSnapshot(null);
    this.logger.debug(LogCategory.RENDER, 'Atmosphere boundary snapshot refreshed', {
      reason,
      planetId: planet?.id ?? null,
      landingEnabled: this.boundarySnapshot.landingEnabled,
      groundRadius: this.boundarySnapshot.groundRadius,
      domeRadius: this.boundarySnapshot.domeRadius,
    });
    this.logAtmosphereDebug('Boundary snapshot refreshed', {
      reason,
      planetId: planet?.id ?? null,
      landingEnabled: this.boundarySnapshot.landingEnabled,
      groundRadius: this.boundarySnapshot.groundRadius,
      domeRadius: this.boundarySnapshot.domeRadius,
    });
    this.lastNearGroundState = false;
    this.lastAboveDomeState = false;
    this.regenerateTerrain(planet, reason);
  }

  private publishBoundarySnapshot(): void {
    if (this.sharedContext) {
      this.sharedContext.atmosphereBoundaries = this.boundarySnapshot;
    }
  }

  private publishPhysicsSnapshot(snapshot: AtmospherePhysicsSnapshot | null): void {
    if (this.sharedContext) {
      this.sharedContext.atmospherePhysicsSnapshot = snapshot;
    }
  }

  private regenerateTerrain(planet: Planet | null, reason: string = 'init'): void {
    this.terrainSnapshot = this.terrainGenerator.generate(planet, this.boundarySnapshot);
    if (this.sharedContext) {
      this.sharedContext.atmosphereTerrain = this.terrainSnapshot;
    }
    this.terrainRenderer?.syncTerrainSnapshot(this.terrainSnapshot);
    this.logger.debug(LogCategory.RENDER, 'Atmosphere terrain regenerated', {
      reason,
      planetId: planet?.id ?? null,
      lodMeshes: this.terrainSnapshot?.lodMeshes.length ?? 0,
      landingEnabled: this.terrainSnapshot?.landingEnabled ?? false,
    });
    this.logAtmosphereDebug('Terrain regenerated', {
      reason,
      planetId: planet?.id ?? null,
      landingEnabled: this.terrainSnapshot?.landingEnabled ?? false,
      lodMeshes: this.terrainSnapshot?.lodMeshes.length ?? 0,
      groundRadius: this.terrainSnapshot?.groundRadius,
    });
  }

  private maybeRefreshSceneSnapshot(timestamp: number): void {
    if (!this.sharedContext?.gameState?.getActiveLandingPlanet) {
      return;
    }
    if (timestamp - this.lastSceneRefreshAt < this.sceneRefreshIntervalMs) {
      return;
    }
    this.lastSceneRefreshAt = timestamp;
    const activePlanet = this.sharedContext.gameState.getActiveLandingPlanet();
    const activeId = activePlanet?.id ?? null;
    const snapshotId = this.sceneSnapshot.planetId;
    if (activeId !== snapshotId) {
      this.logAtmosphereDebug('Detected landing planet mismatch', {
        snapshotPlanetId: snapshotId,
        activePlanetId: activeId,
      });
      this.refreshSceneSnapshot('planet-changed');
    }
  }

  private buildSceneSnapshotFromPlanet(): AtmosphereSceneSnapshot {
    const planet = this.sharedContext?.gameState?.getActiveLandingPlanet?.() ?? null;
    if (!planet) {
      return createDefaultSceneSnapshot();
    }

    const baseColor = this.resolvePlanetBaseColor(planet);
    return {
      planetId: planet.id,
      planetName: planet.getDisplayName?.() ?? planet.customName ?? planet.baseColorName ?? 'Planet',
      palette: resolvePaletteSnapshot(baseColor),
      primaryLight: resolvePrimaryLightSnapshot(baseColor),
      updatedAt: currentTimestamp(),
      source: 'planet',
    };
  }

  private resolvePlanetBaseColor(planet: Planet | null): AtmosphereColorVector {
    if (!planet) {
      return cloneColorVector(DEFAULT_PALETTE_BASE.horizon);
    }
    const preset = planet.baseColorName ? PLANET_COLOR_SWATCHES[planet.baseColorName] : null;
    if (preset) {
      return cloneColorVector(preset);
    }
    const color = (planet as any)?.color ?? null;
    const fallback = DEFAULT_PALETTE_BASE.horizon;
    const r = typeof color?.r === 'number' ? color.r : fallback[0];
    const g = typeof color?.g === 'number' ? color.g : fallback[1];
    const b = typeof color?.b === 'number' ? color.b : fallback[2];
    return [clamp01(r), clamp01(g), clamp01(b)];
  }

  private applyFlightState(payload?: AtmosphereFlightStatePayload | undefined): void {
    if (!payload) {
      return;
    }

    const grounded = !!payload.grounded;
    const stallActive = !!payload.stallActive;
    const stallWarning = stallActive
      ? true
      : !!(payload.stallWarning ?? (typeof payload.stallRatio === 'number' && payload.stallRatio >= 0.75));

    if (grounded) {
      this.resetStallState();
      return;
    }

    if (stallActive) {
      this.activateStallAlarm();
      return;
    }

    if (stallWarning) {
      this.activateStallWarning();
    } else {
      this.resetStallState();
    }
  }

  private activateStallWarning(): void {
    if (this.stallWarningActive && this.stallWarningHandle?.isPlaying()) {
      return;
    }

    this.stallWarningActive = true;
    this.stallActive = false;
    this.stopStallAlarm(80);

    const audio = this.sharedContext?.audio;
    if (!audio) {
      return;
    }
    this.stallWarningHandle = audio.play('sfx_passby_air', {
      loop: true,
      volume: 0.4,
      bus: 'sfx',
      fadeInMs: 120,
    });
  }

  private activateStallAlarm(): void {
    if (this.stallActive && this.stallAlarmHandle?.isPlaying()) {
      this.applyCompassAlert(true);
      return;
    }

    this.stallActive = true;
    this.stallWarningActive = false;
    this.stopStallWarning(80);
    this.stallAlarmStartedAt = currentTimestamp();

    const audio = this.sharedContext?.audio;
    if (audio) {
      this.stallAlarmHandle = audio.play('sfx_stall', {
        loop: true,
        volume: 0.55,
        bus: 'sfx',
        fadeInMs: 80,
      });
    }

    this.applyCompassAlert(true);
  }

  private stopStallWarning(fadeOutMs = 150): void {
    if (this.stallWarningHandle) {
      try { this.stallWarningHandle.stop(fadeOutMs); } catch {}
    }
    this.stallWarningHandle = null;
    this.stallWarningActive = false;
  }

  private stopStallAlarm(fadeOutMs = 150): void {
    if (this.stallAlarmHandle) {
      try { this.stallAlarmHandle.stop(fadeOutMs); } catch {}
    }
    this.stallAlarmHandle = null;
    this.stallActive = false;
    this.stallAlarmStartedAt = 0;
    this.teardownStallAcceleration('alarm-stopped', {
      timestamp: currentTimestamp(),
      planetId: this.boundarySnapshot.planetId,
    });
  }

  private resetStallState(): void {
    this.stopStallWarning();
    this.stopStallAlarm();
    this.applyCompassAlert(false);
    this.teardownStallAcceleration('stall-reset', {
      timestamp: currentTimestamp(),
      planetId: this.boundarySnapshot.planetId,
    });
  }

  private applyCompassAlert(active: boolean): void {
    const hud = this.sharedContext?.hudManager;
    if (!hud || typeof hud.setCompassAlertState !== 'function') {
      return;
    }
    hud.setCompassAlertState(active ? { type: 'stall' } : null);
  }

  private setupSkyDome(): void {
    if (!this.gl) {
      return;
    }

    const vertexSource = `
      attribute vec2 a_position;
      varying vec2 v_position;
      void main() {
        v_position = a_position;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision mediump float;
      varying vec2 v_position;
      uniform vec3 u_horizonColor;
      uniform vec3 u_zenithColor;
      uniform vec3 u_hazeColor;
      uniform vec3 u_cloudTintLow;
      uniform vec3 u_cloudTintHigh;
      uniform float u_cloudCoverage;
      uniform float u_cloudOpacity;
      uniform float u_time;
      uniform vec3 u_lightColor;
      uniform vec3 u_lightDirection;
      uniform float u_lightIntensity;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 1.9;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float t = clamp((v_position.y + 1.0) * 0.5, 0.0, 1.0);
        float wave = sin((v_position.x + u_time * 0.02) * 6.2831) * 0.03;
        t = clamp(t + wave, 0.0, 1.0);
        vec3 base = mix(u_horizonColor, u_zenithColor, pow(t, 1.4));
        float haze = smoothstep(0.0, 0.6, 1.0 - t);
        vec3 color = mix(base, u_hazeColor, haze * 0.35);
        vec2 cloudUv = vec2(v_position.x * 0.8, t * 0.9);
        vec2 drift = vec2(u_time * 0.01, u_time * 0.008);
        float cloudNoise = fbm(cloudUv + drift);
        float cloudMask = smoothstep(u_cloudCoverage - 0.1, u_cloudCoverage + 0.05, cloudNoise);
        vec3 cloudColor = mix(u_cloudTintLow, u_cloudTintHigh, clamp(t + cloudMask * 0.25, 0.0, 1.0));
        color = mix(color, cloudColor, cloudMask * u_cloudOpacity);
        vec3 fakeNormal = normalize(vec3(v_position.x, v_position.y, 0.5));
        float lightDot = clamp(dot(fakeNormal, normalize(u_lightDirection)) * 0.65 + 0.35, 0.0, 1.0);
        float glow = pow(lightDot, 1.4) * clamp(u_lightIntensity, 0.2, 2.0);
        vec3 litColor = mix(color, color + u_lightColor * 0.25, glow);
        gl_FragColor = vec4(litColor, 1.0);
      }
    `;

    const program = this.createProgram(vertexSource, fragmentSource);
    if (!program) {
      return;
    }

    this.skyProgram = program;
    this.attribPosition = this.gl.getAttribLocation(program, 'a_position');
    this.uniformHorizon = this.gl.getUniformLocation(program, 'u_horizonColor');
    this.uniformZenith = this.gl.getUniformLocation(program, 'u_zenithColor');
    this.uniformHaze = this.gl.getUniformLocation(program, 'u_hazeColor');
    this.uniformTime = this.gl.getUniformLocation(program, 'u_time');
    this.uniformLightColor = this.gl.getUniformLocation(program, 'u_lightColor');
    this.uniformLightDirection = this.gl.getUniformLocation(program, 'u_lightDirection');
    this.uniformLightIntensity = this.gl.getUniformLocation(program, 'u_lightIntensity');
    this.uniformCloudTintLow = this.gl.getUniformLocation(program, 'u_cloudTintLow');
    this.uniformCloudTintHigh = this.gl.getUniformLocation(program, 'u_cloudTintHigh');
    this.uniformCloudCoverage = this.gl.getUniformLocation(program, 'u_cloudCoverage');
    this.uniformCloudOpacity = this.gl.getUniformLocation(program, 'u_cloudOpacity');

    this.skyBuffer = this.gl.createBuffer();
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.skyBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }

  private renderFrame = (timestamp: number) => {
    if (!this.gl || !this.skyProgram || !this.skyBuffer) {
      this.rafHandle = null;
      return;
    }

    this.maybeRefreshSceneSnapshot(timestamp);

    if (this.viewportDirty) {
      this.viewportDirty = false;
      this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }

    this.updateCameraFollow(timestamp);
    this.drawSky(timestamp * 0.001);
    this.renderTerrainFrame(timestamp * 0.001);
    this.renderSharedHudOverlay();
    this.monitorBoundaryState(timestamp);
    this.lastTimestamp = timestamp;
    this.rafHandle = requestAnimationFrame(this.renderFrame);
  };

  private drawSky(timeSeconds: number): void {
    if (!this.gl || !this.skyProgram || !this.skyBuffer) {
      return;
    }

    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.depthMask(false);
    this.gl.clearColor(0.02, 0.02, 0.05, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.skyProgram);
    if (this.attribPosition < 0) {
      return;
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.skyBuffer);
    this.gl.enableVertexAttribArray(this.attribPosition);
    this.gl.vertexAttribPointer(this.attribPosition, 2, this.gl.FLOAT, false, 0, 0);

    if (this.uniformHorizon) {
      this.gl.uniform3fv(this.uniformHorizon, this.palette.horizon);
    }
    if (this.uniformZenith) {
      this.gl.uniform3fv(this.uniformZenith, this.palette.zenith);
    }
    if (this.uniformHaze) {
      this.gl.uniform3fv(this.uniformHaze, this.palette.haze);
    }
    if (this.uniformTime) {
      this.gl.uniform1f(this.uniformTime, timeSeconds);
    }
    const cloudUniforms = this.resolveCloudUniforms();
    if (this.uniformCloudTintLow) {
      this.gl.uniform3fv(this.uniformCloudTintLow, cloudUniforms.low);
    }
    if (this.uniformCloudTintHigh) {
      this.gl.uniform3fv(this.uniformCloudTintHigh, cloudUniforms.high);
    }
    if (this.uniformCloudCoverage) {
      this.gl.uniform1f(this.uniformCloudCoverage, cloudUniforms.coverage);
    }
    if (this.uniformCloudOpacity) {
      this.gl.uniform1f(this.uniformCloudOpacity, cloudUniforms.opacity);
    }
    const lightUniforms = this.lightNode.getUniformPayload();
    if (this.uniformLightColor) {
      this.gl.uniform3fv(this.uniformLightColor, lightUniforms.color);
    }
    if (this.uniformLightDirection) {
      this.gl.uniform3fv(this.uniformLightDirection, lightUniforms.direction);
    }
    if (this.uniformLightIntensity) {
      this.gl.uniform1f(this.uniformLightIntensity, lightUniforms.intensity);
    }

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.disableVertexAttribArray(this.attribPosition);
  }

  private resolveCloudUniforms(): {
    low: Float32Array;
    high: Float32Array;
    coverage: number;
    opacity: number;
  } {
    const haze = this.palette.haze;
    const horizon = this.palette.horizon;
    const zenith = this.palette.zenith;
    const detection = this.boundarySnapshot.detection;
    const groundRadius = this.boundarySnapshot.groundRadius ?? this.boundarySnapshot.basePlanetRadius;
    const altitude = detection.shipAltitude ?? 0;
    const range = Math.max(1, this.boundarySnapshot.domeRadius - groundRadius);
    const normalizedAltitude = clamp(altitude / range, -0.5, 1.0);
    const baseCoverage = this.boundarySnapshot.landingEnabled ? 0.45 : 0.32;
    const coverage = clamp(
      baseCoverage + (detection.nearGround ? 0.08 : -0.03) - normalizedAltitude * 0.05,
      0.18,
      0.82,
    );
    const opacity = this.boundarySnapshot.landingEnabled ? 0.48 : 0.32;
    const low = new Float32Array([
      clamp01(horizon[0] * 0.88 + haze[0] * 0.12),
      clamp01(horizon[1] * 0.88 + haze[1] * 0.12),
      clamp01(horizon[2] * 0.88 + haze[2] * 0.12),
    ]);
    const high = new Float32Array([
      clamp01(zenith[0] * 0.45 + haze[0] * 0.55),
      clamp01(zenith[1] * 0.45 + haze[1] * 0.55),
      clamp01(zenith[2] * 0.45 + haze[2] * 0.55),
    ]);
    return { low, high, coverage, opacity };
  }

  private renderTerrainFrame(timeSeconds: number): void {
    if (!this.gl || !this.terrainRenderer) {
      this.logTerrainSkip('renderer-unavailable', {
        hasGL: Boolean(this.gl),
        hasRenderer: Boolean(this.terrainRenderer),
      });
      return;
    }
    if (!this.terrainSnapshot) {
      this.logTerrainSkip('missing-terrain-snapshot', {
        hasSnapshot: false,
      });
      return;
    }
    if (!this.terrainSnapshot.landingEnabled) {
      this.logTerrainSkip('landing-disabled', {
        planetId: this.terrainSnapshot.planetId,
      });
      return;
    }
    const context = this.sharedContext;
    const camera = context?.gameState?.camera;
    const planet = context?.gameState?.getActiveLandingPlanet?.() ?? null;
    if (!camera || !planet) {
      this.logTerrainSkip('missing-camera-or-planet', {
        hasCamera: Boolean(camera),
        hasPlanet: Boolean(planet),
        terrainPlanetId: this.terrainSnapshot.planetId,
      });
      return;
    }

    const viewMatrix = camera.viewMatrix ?? this.fallbackMatrix;
    const projectionMatrix = camera.projectionMatrix ?? this.fallbackMatrix;
    const cameraPosition = camera.position ?? { x: 0, y: 0, z: 0 };
    const planetCenter = planet.position ?? { x: 0, y: 0, z: 0 };
    const groundRadius = this.boundarySnapshot.groundRadius ?? this.boundarySnapshot.basePlanetRadius;
    const heightRange = Math.max(25, this.boundarySnapshot.domeRadius - groundRadius);
    const effectMode = this.resolveTerrainEffectMode(planet.planetType ?? null, this.terrainSnapshot.materialProfile);
    const shipDistance = this.boundarySnapshot.detection?.shipDistance ?? null;

    this.terrainRenderer.render({
      viewMatrix,
      projectionMatrix,
      cameraPosition,
      planetCenter,
      palette: this.palette,
      groundRadius,
      heightRange,
      materialProfile: this.terrainSnapshot.materialProfile,
      light: this.lightNode.getUniformPayload(),
      time: timeSeconds,
      effectMode,
      shipDistance,
    });
    this.lastTerrainSkipReason = null;
  }

  private renderSharedHudOverlay(): void {
    const engine = this.sharedContext?.gameEngine ?? null;
    const camera = this.sharedContext?.gameState?.camera ?? null;
    if (!engine || !camera) {
      return;
    }

    const snapshot = {
      viewMatrix: camera.viewMatrix ?? this.fallbackMatrix,
      projectionMatrix: camera.projectionMatrix ?? this.fallbackMatrix,
      position: camera.position ?? { x: 0, y: 0, z: 0 },
      mode: camera.getCurrentMode?.(),
    };

    try {
      engine.renderHudOverlay(snapshot);
    } catch (error) {
      this.logger.warn(LogCategory.HUD, 'Failed to render HUD overlay from atmosphere mode', { error });
    }
  }

  private attachBaseInputHandlers(): void {
    if (this.freePointerUnsub || !this.sharedContext?.panelCoordinator) {
      return;
    }
    this.freePointerUnsub = this.sharedContext.panelCoordinator.registerFreePointerListener({
      onClick: () => this.focusCanvas(),
    });
  }

  private detachBaseInputHandlers(): void {
    if (!this.freePointerUnsub) {
      return;
    }
    try {
      this.freePointerUnsub();
    } catch {}
    this.freePointerUnsub = null;
  }

  private focusCanvas(): void {
    const canvasEl = this.canvas?.nativeElement ?? null;
    if (!canvasEl || typeof canvasEl.focus !== 'function') {
      return;
    }
    try {
      canvasEl.focus();
    } catch {}
  }

  private updateCameraFollow(_timestamp: number): void {
    this.applyCameraOrbit('frame');
  }

  private isAtmosphereActive(): boolean {
    return (this.sharedContext?.activeMode ?? null) === 'atmosphere';
  }

  private resetCameraLookFromPose(pose: AtmosphereCameraPosePayload | null): void {
    if (!pose) {
      this.lookYaw = 0;
      this.lookPitch = -0.25;
      return;
    }
    const forward = normalizeVector3(
      pose.target.x - pose.position.x,
      pose.target.y - pose.position.y,
      pose.target.z - pose.position.z,
    );
    const planet = this.sharedContext?.gameState?.getActiveLandingPlanet?.() ?? null;
    const ship = this.sharedContext?.gameState?.spaceship ?? null;
    const pivot = ship?.position ?? pose.target;
    const up = this.resolveCameraUpVector(pivot, planet?.position ?? null);
    const tangent = this.buildCameraTangent(up);
    const bitangent = this.buildCameraBitangent(up, tangent);
    const dotUp = clamp(dotVector3(forward, up), -0.99, 0.99);
    this.lookPitch = Math.asin(dotUp);
    const horizontal = normalizeVector3(
      forward.x - up.x * dotUp,
      forward.y - up.y * dotUp,
      forward.z - up.z * dotUp,
    );
    const projT = dotVector3(horizontal, tangent);
    const projB = dotVector3(horizontal, bitangent);
    this.lookYaw = Math.atan2(projB, projT);
  }

  private applyCameraOrbit(reason: string): void {
    if (!this.isAtmosphereActive()) {
      return;
    }
    const gameState = this.sharedContext?.gameState;
    const camera = gameState?.camera ?? null;
    const ship = gameState?.spaceship ?? null;
    const planet = gameState?.getActiveLandingPlanet?.() ?? null;
    const pivot = ship?.position ?? this.lastLandingAnchor;
    if (!camera || !pivot) {
      return;
    }
    const planetCenter = planet?.position ?? null;
    const up = this.resolveCameraUpVector(pivot, planetCenter);
    const tangent = this.buildCameraTangent(up);
    const bitangent = this.buildCameraBitangent(up, tangent);
    const forward = this.resolveCameraForwardVector(up, tangent, bitangent);
    const orbitDistance = this.resolveCameraOrbitDistance();
    const lookAhead = Math.max(6, orbitDistance * 0.2);
    const cameraPosition = {
      x: pivot.x - forward.x * orbitDistance,
      y: pivot.y - forward.y * orbitDistance,
      z: pivot.z - forward.z * orbitDistance,
    };
    const target = {
      x: pivot.x + forward.x * lookAhead,
      y: pivot.y + forward.y * lookAhead,
      z: pivot.z + forward.z * lookAhead,
    };
    try {
      if (camera.getCurrentMode?.() !== CameraMode.MANUAL) {
        camera.setCameraMode(CameraMode.MANUAL);
      }
      camera.seedManualTransform(cameraPosition, target, up);
      camera.markDirty();
    } catch (error) {
      if (reason !== 'frame') {
        this.logger.warn(LogCategory.GAME_LOOP, 'Atmosphere camera update failed', { error, reason });
      }
    }
  }

  private resolveCameraUpVector(anchor: Vector3, planetCenter: Vector3 | null): Vector3 {
    if (planetCenter) {
      return normalizeVector3(
        anchor.x - planetCenter.x,
        anchor.y - planetCenter.y,
        anchor.z - planetCenter.z,
      );
    }
    const detectionNormal = this.boundarySnapshot.detection.surfaceNormal;
    if (detectionNormal) {
      return normalizeVector3(detectionNormal.x, detectionNormal.y, detectionNormal.z);
    }
    return { x: 0, y: 1, z: 0 };
  }

  private buildCameraTangent(normal: Vector3): Vector3 {
    const reference = Math.abs(normal.y) > 0.85 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const tangent = crossVector3(reference, normal);
    const normalized = normalizeVector3(tangent.x, tangent.y, tangent.z);
    if (!Number.isFinite(normalized.x)) {
      return { x: 1, y: 0, z: 0 };
    }
    return normalized;
  }

  private buildCameraBitangent(normal: Vector3, tangent: Vector3): Vector3 {
    const bitangent = crossVector3(normal, tangent);
    return normalizeVector3(bitangent.x, bitangent.y, bitangent.z);
  }

  private resolveCameraForwardVector(up: Vector3, tangent: Vector3, bitangent: Vector3): Vector3 {
    const ship = this.sharedContext?.gameState?.spaceship ?? null;
    const shipForward = ship?.forwardDirection ?? null;
    if (!shipForward) {
      this.logCameraForwardFallback('missing-forward');
      return this.buildForwardFromAngles(tangent, bitangent, up);
    }

    const normalized = normalizeVector3(shipForward.x, shipForward.y, shipForward.z);
    if (!Number.isFinite(normalized.x) || !Number.isFinite(normalized.y) || !Number.isFinite(normalized.z)) {
      this.logCameraForwardFallback('invalid-forward');
      return this.buildForwardFromAngles(tangent, bitangent, up);
    }

    this.cameraForwardFallbackLogged = false;
    const tilted = normalizeVector3(
      normalized.x - up.x * this.forwardDownTilt,
      normalized.y - up.y * this.forwardDownTilt,
      normalized.z - up.z * this.forwardDownTilt,
    );
    this.syncLookAnglesFromForward(tilted, up, tangent, bitangent);
    return tilted;
  }

  private buildForwardFromAngles(tangent: Vector3, bitangent: Vector3, up: Vector3): Vector3 {
    const cosPitch = Math.cos(this.lookPitch);
    const sinPitch = Math.sin(this.lookPitch);
    const cosYaw = Math.cos(this.lookYaw);
    const sinYaw = Math.sin(this.lookYaw);
    return normalizeVector3(
      tangent.x * (cosPitch * cosYaw) + bitangent.x * (cosPitch * sinYaw) + up.x * sinPitch,
      tangent.y * (cosPitch * cosYaw) + bitangent.y * (cosPitch * sinYaw) + up.y * sinPitch,
      tangent.z * (cosPitch * cosYaw) + bitangent.z * (cosPitch * sinYaw) + up.z * sinPitch,
    );
  }

  private syncLookAnglesFromForward(forward: Vector3, up: Vector3, tangent: Vector3, bitangent: Vector3): void {
    const dotUp = clamp(dotVector3(forward, up), -0.99, 0.99);
    this.lookPitch = Math.asin(dotUp);
    const horizontal = normalizeVector3(
      forward.x - up.x * dotUp,
      forward.y - up.y * dotUp,
      forward.z - up.z * dotUp,
    );
    if (!Number.isFinite(horizontal.x) || !Number.isFinite(horizontal.y) || !Number.isFinite(horizontal.z)) {
      return;
    }
    const projT = dotVector3(horizontal, tangent);
    const projB = dotVector3(horizontal, bitangent);
    if (Number.isFinite(projT) && Number.isFinite(projB)) {
      this.lookYaw = Math.atan2(projB, projT);
    }
  }

  private logCameraForwardFallback(reason: string): void {
    if (this.cameraForwardFallbackLogged) {
      return;
    }
    this.cameraForwardFallbackLogged = true;
    this.logger.debug(LogCategory.GAME_LOOP, 'Atmosphere camera forward fallback', { reason });
  }

  private resolveCameraOrbitDistance(): number {
    const altitude = this.boundarySnapshot?.detection?.shipAltitude ?? null;
    if (altitude === null || !Number.isFinite(altitude)) {
      return this.defaultOrbitDistance;
    }
    return clamp(this.defaultOrbitDistance + altitude * 0.25, 18, 42);
  }

  private logAtmosphereDebug(message: string, context?: Record<string, unknown>): void {
    try {
      this.logger.debug(LogCategory.ATMOSPHERE_DIAGNOSTICS, message, context);
    } catch {
      // Logging should never throw inside the render loop
    }
  }

  private logTerrainSkip(reason: string, detail: Record<string, unknown>): void {
    if (this.lastTerrainSkipReason === reason) {
      return;
    }
    this.lastTerrainSkipReason = reason;
    this.logAtmosphereDebug('Terrain frame skipped', { reason, ...detail });
  }

  private computeFrameDeltaSeconds(timestamp: number): number {
    const previous = this.lastTimestamp || (timestamp - 16);
    const deltaMs = Number.isFinite(timestamp - previous) ? timestamp - previous : 16;
    const clampedMs = clamp(deltaMs, MIN_STALL_DELTA_SECONDS * 1000, MAX_STALL_DELTA_SECONDS * 1000);
    return clampedMs / 1000;
  }

  private resolveTerrainEffectMode(
    planetType: PlanetType | null,
    materialProfile: PlanetTerrainMaterialProfile | null,
  ): number {
    const profileId = materialProfile?.id ?? null;
    if (planetType === ('Dune' as PlanetType) || profileId === 'dune-fields') {
      return 1;
    }
    if (
      planetType === ('Ice' as PlanetType) ||
      planetType === PlanetType.Dwarf ||
      profileId === 'polar-ice'
    ) {
      return 2;
    }
    return 0;
  }

  private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram | null {
    if (!this.gl) {
      return null;
    }

    const vs = this.compileShader(vertexSrc, this.gl.VERTEX_SHADER);
    const fs = this.compileShader(fragmentSrc, this.gl.FRAGMENT_SHADER);
    if (!vs || !fs) {
      return null;
    }

    const program = this.gl.createProgram();
    if (!program) {
      return null;
    }

    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      this.logger.error(LogCategory.RENDER, 'Failed to link atmosphere sky program', {
        log: this.gl.getProgramInfoLog(program)
      });
      this.gl.deleteProgram(program);
      return null;
    }

    this.gl.deleteShader(vs);
    this.gl.deleteShader(fs);
    return program;
  }

  private compileShader(source: string, type: number): WebGLShader | null {
    if (!this.gl) {
      return null;
    }
    const shader = this.gl.createShader(type);
    if (!shader) {
      return null;
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.logger.error(LogCategory.RENDER, 'Atmosphere shader compile error', {
        type,
        log: this.gl.getShaderInfoLog(shader)
      });
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private monitorBoundaryState(timestamp: number): void {
    if (!this.sharedContext?.gameState) {
      return;
    }
    const gameState = this.sharedContext.gameState;
    const spaceship = gameState.spaceship;
    const planet = gameState.getActiveLandingPlanet?.() ?? null;
    if (!planet || !spaceship) {
      const resetDetection = { ...createBoundaryDetectionDefaults(), timestamp };
      this.boundarySnapshot = {
        ...this.boundarySnapshot,
        detection: resetDetection,
      };
      this.publishBoundarySnapshot();
      this.publishPhysicsSnapshot(null);
      this.lastNearGroundState = false;
      this.lastAboveDomeState = false;
      this.logAtmosphereDebug('Boundary detection reset (missing planet or ship)', {
        hasPlanet: Boolean(planet),
        hasSpaceship: Boolean(spaceship),
      });
      return;
    }

    if (planet.id !== this.boundarySnapshot.planetId) {
      this.logAtmosphereDebug('Boundary snapshot planet mismatch detected', {
        snapshotPlanetId: this.boundarySnapshot.planetId,
        actualPlanetId: planet.id,
      });
      this.refreshBoundarySnapshot('planet-sync');
    }

    const shipPos = spaceship.position;
    const center = planet.position;
    const dx = shipPos.x - center.x;
    const dy = shipPos.y - center.y;
    const dz = shipPos.z - center.z;
    const distance = Math.hypot(dx, dy, dz);
    const groundReference = this.boundarySnapshot.groundRadius ?? this.boundarySnapshot.basePlanetRadius;
    const minSeparation = Math.max(this.boundarySnapshot.minSeparation, MIN_BOUNDARY_SEPARATION);
    const domeRadius = Math.max(groundReference + minSeparation, this.boundarySnapshot.domeRadius);
    const contact = computePlanetTerrainContact(this.terrainSnapshot, shipPos, center);
    const contactAltitude = contact.altitude;
    const fallbackAltitude = Number.isFinite(distance) ? distance - groundReference : null;
    const altitude = contactAltitude ?? fallbackAltitude ?? null;
    const relative = this.boundarySnapshot.groundRadius !== null
      ? clamp((distance - groundReference) / Math.max(1, domeRadius - groundReference), 0, 1.25)
      : clamp(distance / Math.max(1, domeRadius), 0, 1.25);
    const projectedAltitude = altitude !== null && Number.isFinite(altitude) ? altitude : null;
    const surfaceNormal = contact.surfaceNormal ?? (Number.isFinite(distance) ? normalizeVector3(dx, dy, dz) : null);
    const shipPosition = cloneVector3(shipPos);
    let shipVelocity = cloneVector3(spaceship.velocity);
    let shipSpeed = computeVector3Magnitude(shipVelocity);
    let verticalSpeed = shipVelocity && surfaceNormal
      ? shipVelocity.x * surfaceNormal.x + shipVelocity.y * surfaceNormal.y + shipVelocity.z * surfaceNormal.z
      : null;
    let resolvedVerticalSpeed = verticalSpeed !== null && Number.isFinite(verticalSpeed) ? verticalSpeed : null;
    let impactAngle = computeImpactAngleDegrees(shipVelocity, surfaceNormal);

    const deltaSeconds = this.computeFrameDeltaSeconds(timestamp);
    const stallAdjusted = this.applyStallAcceleration({
      timestamp,
      deltaSeconds,
      ship: spaceship,
      surfaceNormal,
      shipSpeed,
      planet,
    });

    if (stallAdjusted) {
      shipVelocity = cloneVector3(spaceship.velocity);
      shipSpeed = computeVector3Magnitude(shipVelocity);
      verticalSpeed = shipVelocity && surfaceNormal
        ? shipVelocity.x * surfaceNormal.x + shipVelocity.y * surfaceNormal.y + shipVelocity.z * surfaceNormal.z
        : null;
      resolvedVerticalSpeed = verticalSpeed !== null && Number.isFinite(verticalSpeed) ? verticalSpeed : null;
      impactAngle = computeImpactAngleDegrees(shipVelocity, surfaceNormal);
    }

    const nearGround =
      this.boundarySnapshot.landingEnabled &&
      this.boundarySnapshot.groundRadius !== null &&
      altitude !== null &&
      Math.abs(altitude) <= this.boundarySnapshot.nearGroundThreshold;

    const aboveDome = Number.isFinite(distance) && distance >= domeRadius - 1;

    let lastEvent: AtmosphereBoundaryEvent = this.boundarySnapshot.detection.lastEvent ?? null;
    let lastEventAt: number | null = this.boundarySnapshot.detection.lastEventAt ?? null;

    if (nearGround && !this.lastNearGroundState) {
      lastEvent = 'near-ground';
      lastEventAt = timestamp;
      this.logger.info(LogCategory.GAME_LOOP, 'Atmosphere near-ground window entered', {
        planetId: planet.id,
        altitude,
        threshold: this.boundarySnapshot.nearGroundThreshold,
      });
    }

    if (aboveDome && !this.lastAboveDomeState) {
      lastEvent = 'above-dome';
      lastEventAt = timestamp;
      this.logger.info(LogCategory.GAME_LOOP, 'Atmosphere dome crossed', {
        planetId: planet.id,
        distance,
        domeRadius,
      });
    }

    this.lastNearGroundState = nearGround;
    this.lastAboveDomeState = aboveDome;

    const detection: AtmosphereBoundaryDetection = {
      shipDistance: Number.isFinite(distance) ? distance : null,
      shipAltitude: altitude !== null && Number.isFinite(altitude) ? altitude : null,
      relativeAltitude: Number.isFinite(relative) ? relative : null,
      projectedAltitude,
      nearGround,
      aboveDome,
      surfaceNormal,
      impactAngle,
      lastEvent,
      lastEventAt,
      timestamp,
    };

    this.boundarySnapshot = {
      ...this.boundarySnapshot,
      domeRadius,
      detection,
      updatedAt: timestamp,
    };
    this.publishBoundarySnapshot();

    const physicsSnapshot: AtmospherePhysicsSnapshot = {
      timestamp,
      planetId: planet.id ?? null,
      planetName: this.boundarySnapshot.planetName ?? planet.getDisplayName?.() ?? planet.customName ?? planet.baseColorName ?? null,
      shipPosition,
      shipVelocity,
      shipSpeed,
      projectedAltitude,
      verticalSpeed: resolvedVerticalSpeed,
      surfaceNormal,
      impactAngle,
      stallWarning: this.stallWarningActive,
      stallActive: this.stallActive,
    };
    this.publishPhysicsSnapshot(physicsSnapshot);

    this.handleGroundInteraction({
      timestamp,
      planet,
      altitude,
      shipVelocity,
      shipSpeed,
      surfaceNormal,
      impactAngle,
    });
  }

  private handleGroundInteraction(args: {
    timestamp: number;
    planet: Planet | null;
    altitude: number | null;
    shipVelocity: Vector3 | null;
    shipSpeed: number | null;
    surfaceNormal: Vector3 | null;
    impactAngle: number | null;
  }): void {
    if (!this.sharedContext?.gameState || !this.boundarySnapshot.landingEnabled) {
      return;
    }

    const ship = this.sharedContext.gameState.spaceship;
    if (!ship || !args.planet) {
      return;
    }

    const altitude = args.altitude;
    if (altitude === null || altitude > GROUND_CONTACT_THRESHOLD) {
      return;
    }

    const touchingGround = altitude <= 0;
    const landingStatus = this.sharedContext.gameState.landingStatus ?? null;
    const landingPilotGreen = Boolean(this.sharedContext.gameState.landingPilotGreen);

    if (touchingGround) {
      const autoLanded = this.tryAutoLandingOnContact(
        landingStatus,
        landingPilotGreen,
        args.shipVelocity,
        args.timestamp,
        args.planet,
      );
      if (autoLanded) {
        this.lastGroundImpactAt = args.timestamp;
        return;
      }
    }

    if (!touchingGround) {
      return;
    }

    if (args.timestamp - this.lastGroundImpactAt < GROUND_IMPACT_COOLDOWN_MS) {
      return;
    }

    const impactSpeed = Math.max(0, args.shipSpeed ?? 0);
    const maxSpeed = Math.max(1, ship.maxSpeed ?? ship.currentSpeed ?? 1);
    const impactAngle = args.impactAngle ?? 90;
    const damage = this.sharedContext.atmospherePhysics.calculateGroundImpactDamage({
      speed: impactSpeed,
      maxSpeed,
      impactAngleDeg: impactAngle,
    });

    if (damage <= 0) {
      this.lastGroundImpactAt = args.timestamp;
      return;
    }

    this.emitLandingPilotWarning('impact', {
      planetId: args.planet?.id ?? null,
      planetName: this.resolvePlanetLabel(args.planet),
      damage,
      impactAngle,
    }, args.timestamp);

    this.applyGroundImpactDamage(damage, args.planet, impactAngle);
    this.applyTerrainCollisionResponse(ship, args.planet, args.surfaceNormal);
    this.lastGroundImpactAt = args.timestamp;
  }

  private tryAutoLandingOnContact(
    landingStatus: LandingStatus | null,
    landingPilotGreen: boolean,
    shipVelocity: Vector3 | null,
    timestamp: number,
    planet: Planet | null,
  ): boolean {
    if (!landingPilotGreen || !landingStatus?.context || !shipVelocity || !planet) {
      return false;
    }
    if (landingStatus.context.planetId && landingStatus.context.planetId !== planet.id) {
      return false;
    }
    if (timestamp - this.lastAutoLandingAt < AUTOLAND_COOLDOWN_MS) {
      return false;
    }
    const shouldAutoLand = this.sharedContext?.atmospherePhysics.shouldAutoLand({
      landingStatus,
      landingPilotGreen,
      shipVelocity,
    });
    if (!shouldAutoLand) {
      return false;
    }
    this.dispatchAutoLanding(landingStatus.context, planet);
    this.emitAutoLandingFinalize(planet, timestamp, landingStatus.context);
    this.lastAutoLandingAt = timestamp;
    this.logger.info(LogCategory.GAME_LOOP, 'Atmosphere auto-landing triggered', {
      planetId: planet.id,
      planetName: planet.getDisplayName?.() ?? planet.customName ?? planet.baseColorName,
    });
    return true;
  }

  private dispatchAutoLanding(context: LandingStatus['context'], planet: Planet | null): void {
    if (!context) {
      return;
    }
    const engine = this.sharedContext?.gameEngine ?? null;
    if (!engine) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Auto landing skipped, game engine unavailable', {
        planetId: context.planetId,
      });
      return;
    }
    try {
      engine.notifyLandingSequenceStarted(context);
      engine.notifyLandingSequenceFinished('landed', context);
    } catch (error) {
      this.logger.error(LogCategory.GAME_LOOP, 'Auto landing dispatch failed', {
        planetId: context.planetId,
        error,
      });
    }
    this.resetStallState();
  }

  private applyGroundImpactDamage(amount: number, planet: Planet | null, impactAngle: number): void {
    const engine = this.sharedContext?.gameEngine ?? null;
    const planetId = planet?.id ?? 'atmosphere-ground';
    const planetName = planet?.getDisplayName?.() ?? planet?.customName ?? 'Terreno';
    if (engine) {
      try {
        engine.applyShipDamage(amount, planetId, 'ground-impact', {
          customHudMessage: `Impacto en ${planetName} (∠${Math.round(impactAngle)}°): -${Math.round(amount)}u`,
        });
        return;
      } catch (error) {
        this.logger.warn(LogCategory.GAME_LOOP, 'applyShipDamage from atmosphere failed', {
          planetId,
          amount,
          error,
        });
      }
    }
    const ship = this.sharedContext?.gameState?.spaceship;
    if (ship) {
      ship.healthCurrent = Math.max(0, ship.healthCurrent - amount);
    }
  }

  private applyTerrainCollisionResponse(ship: any, planet: Planet, surfaceNormal: Vector3 | null): void {
    const collisionManager = this.sharedContext?.collisionManager;
    if (!collisionManager) {
      this.applySimpleBounce(ship, surfaceNormal);
      return;
    }
    try {
      const result = collisionManager.handleCollision(ship, planet, false);
      if (result.collisionType === 'small-movable') {
        ship.position = result.newPosition;
      }
      ship.velocity = result.newVelocity;
      ship.updateModelMatrix?.();
      if (ship.boundingSphere) {
        ship.boundingSphere.center = { ...ship.position };
      }
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'CollisionManager response failed in atmosphere', {
        planetId: planet.id,
        error,
      });
      this.applySimpleBounce(ship, surfaceNormal);
    }
  }

  private applyStallAcceleration(params: {
    timestamp: number;
    deltaSeconds: number;
    ship: any;
    surfaceNormal: Vector3 | null;
    shipSpeed: number | null;
    planet: Planet | null;
  }): boolean {
    const { timestamp, deltaSeconds, ship, surfaceNormal, shipSpeed, planet } = params;
    if (!this.sharedContext?.atmospherePhysics || !this.stallActive) {
      this.teardownStallAcceleration('inactive', { timestamp, planetId: planet?.id ?? null });
      return false;
    }

    if (!ship || !surfaceNormal || deltaSeconds <= 0) {
      this.teardownStallAcceleration('missing-data', { timestamp, planetId: planet?.id ?? null });
      return false;
    }

    const speed = shipSpeed ?? computeVector3Magnitude(cloneVector3(ship.velocity)) ?? 0;
    const baseAcceleration = this.sharedContext.atmospherePhysics.computeStallAcceleration(speed);
    if (baseAcceleration <= 0) {
      this.teardownStallAcceleration('zero-accel', { timestamp, planetId: planet?.id ?? null });
      return false;
    }

    const scaledAcceleration = baseAcceleration * deltaSeconds;
    if (!Number.isFinite(scaledAcceleration) || scaledAcceleration <= 0) {
      this.teardownStallAcceleration('invalid-scale', { timestamp, planetId: planet?.id ?? null });
      return false;
    }

    if (!ship.velocity) {
      ship.velocity = { x: 0, y: 0, z: 0 };
    }

    ship.velocity.x -= surfaceNormal.x * scaledAcceleration;
    ship.velocity.y -= surfaceNormal.y * scaledAcceleration;
    ship.velocity.z -= surfaceNormal.z * scaledAcceleration;

    if (!this.stallAccelerationActive) {
      this.stallAccelerationActive = true;
      this.logger.info(LogCategory.GAME_LOOP, 'Atmosphere stall acceleration engaged', {
        planetId: planet?.id ?? null,
        acceleration: baseAcceleration,
      });
    }

    const stallDuration = this.stallAlarmStartedAt ? timestamp - this.stallAlarmStartedAt : 0;
    if (stallDuration >= STALL_WARNING_DELAY_MS) {
      this.emitLandingPilotWarning('stall', {
        planetId: planet?.id ?? null,
        planetName: this.resolvePlanetLabel(planet),
        stallDurationMs: stallDuration,
        appliedAcceleration: baseAcceleration,
      }, timestamp);
    }

    return true;
  }

  private teardownStallAcceleration(
    reason: string,
    context: { timestamp: number; planetId: string | null } | null = null,
  ): void {
    if (!this.stallAccelerationActive) {
      return;
    }
    this.stallAccelerationActive = false;
    this.logger.info(LogCategory.GAME_LOOP, 'Atmosphere stall acceleration released', {
      reason,
      planetId: context?.planetId ?? null,
      timestamp: context?.timestamp ?? currentTimestamp(),
    });
  }

  private emitLandingPilotWarning(
    source: 'impact' | 'stall',
    detail: {
      planetId: string | null;
      planetName: string;
      damage?: number;
      impactAngle?: number;
      stallDurationMs?: number;
      appliedAcceleration?: number;
    },
    timestamp: number,
  ): void {
    if (timestamp - this.lastPilotWarningAt < PILOT_WARNING_COOLDOWN_MS) {
      return;
    }
    this.lastPilotWarningAt = timestamp;
    const message = source === 'impact'
      ? `Impacto crítico en ${detail.planetName}`
      : `STALL prolongado sobre ${detail.planetName}`;
    this.logger.warn(LogCategory.GAME_LOOP, 'Landing pilot warning emitted', {
      source,
      ...detail,
    });
    this.sharedContext?.hudManager?.emitMarqueeEvent?.(HudMarqueeEventType.WARNING, message, {
      dedupeKey: `landing-warning-${source}-${detail.planetId ?? detail.planetName}`,
      priorityOverride: 1,
    });
    this.emitModeEvent({
      type: 'landing:pilot-warning',
      payload: {
        source,
        ...detail,
        timestamp,
      },
    });
  }

  private emitAutoLandingFinalize(
    planet: Planet | null,
    timestamp: number,
    context: LandingStatus['context'] | null,
  ): void {
    const planetId = planet?.id ?? context?.planetId ?? null;
    const planetName = this.resolvePlanetLabel(planet);
    this.sharedContext?.gameState?.setLandingPilotGreen(true);
    this.sharedContext?.hudManager?.emitMarqueeEvent?.(
      HudMarqueeEventType.LANDING_SEQUENCE,
      `Auto-landing completado en ${planetName}`,
      {
        dedupeKey: `landing-auto-${planetId ?? 'unknown'}`,
        priorityOverride: 0,
      },
    );
    this.emitModeEvent({
      type: 'landing:auto-finalize',
      payload: {
        planetId,
        planetName,
        timestamp,
      },
    });
  }

  private emitModeEvent(event: GameModeEvent): void {
    try {
      this.sharedContext?.emitModeEvent?.(event);
    } catch (error) {
      this.logger.warn(LogCategory.GAME_LOOP, 'Mode event emission failed', { event, error });
    }
  }

  private resolvePlanetLabel(planet: Planet | null): string {
    return planet?.getDisplayName?.() ?? planet?.customName ?? planet?.baseColorName ?? this.boundarySnapshot.planetName ?? 'Planeta';
  }

  private applySimpleBounce(ship: any, surfaceNormal: Vector3 | null): void {
    if (!surfaceNormal || !ship?.velocity) {
      return;
    }
    const vx = ship.velocity.x ?? 0;
    const vy = ship.velocity.y ?? 0;
    const vz = ship.velocity.z ?? 0;
    const dot = vx * surfaceNormal.x + vy * surfaceNormal.y + vz * surfaceNormal.z;
    ship.velocity.x = vx - 2 * dot * surfaceNormal.x;
    ship.velocity.y = vy - 2 * dot * surfaceNormal.y;
    ship.velocity.z = vz - 2 * dot * surfaceNormal.z;
  }
}
