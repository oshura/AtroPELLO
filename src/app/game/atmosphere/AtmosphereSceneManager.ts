import { Camera } from '../Camera';
import { ShaderManager } from '../ShaderManager';
import { LandingApproachContext } from '../types/landing.types';
import { Vector3 } from '../../types/game.types';
import { AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';
import { AtmosphereTextureFactory, AtmosphereTexturePattern } from './AtmosphereTextureFactory';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';
import {
  ATMOSPHERE_TERRAIN_LAT_SEGMENTS,
  ATMOSPHERE_TERRAIN_LON_SEGMENTS,
  TerrainField,
  computeAtmosphereDetailFactor,
  computeDetailMultiplier,
  computeVertexUnitRadius,
  getTerrainField,
  sampleTerrainVertex,
} from './terrain-sampler';

interface SphereMesh {
  vbo: WebGLBuffer;
  cbo: WebGLBuffer;
  ibo: WebGLBuffer;
  edgeIbo?: WebGLBuffer;
  indexCount: number;
  edgeIndexCount?: number;
  vertexCount: number;
  lastColorKey: string | null;
  hasRelief?: boolean;
  reliefNoise?: Float32Array;
  bandNoise?: Float32Array;
  latitudeMask?: Float32Array;
  basePositions?: Float32Array;
  detailNoise?: Float32Array;
  detailScratch?: Float32Array;
  lastDetailFactor?: number;
  ridgeMask?: Float32Array;
  uv?: Float32Array;
  /** Semilla con la que se generó el relieve (solo mallas con relieve). */
  terrainSeed?: number;
}

interface SurfaceReadabilityOptions {
  ridgeIntensity: number;
  ridgeHeightGate: number;
  textureInfluence: number;
}

interface TextureDebugStats {
  vertexSamples: number;
  texturedSamples: number;
  craterSamples: number;
  rockSamples: number;
  sandSamples: number;
  zeroInfluenceSamples: number;
  mixSum: number;
  mixMin: number;
  mixMax: number;
  contrastSum: number;
  contrastMin: number;
  contrastMax: number;
  tileFrequencySum: number;
  tileFrequencyMin: number;
  tileFrequencyMax: number;
  lowHeightSamples: number;
  midHeightSamples: number;
  highHeightSamples: number;
  disabledByRidge: number;
  disabledByFactory: number;
}

export interface SurfaceReadabilityState {
  readonly emphasis: number;
  readonly overlaySoftCap: number;
  readonly highlightColor: Float32Array;
}

export interface AtmosphereGroundPalette {
  lowlands: Float32Array;
  highlands: Float32Array;
  dunes: Float32Array;
  polar: Float32Array;
  strata: Float32Array;
  valleys: Float32Array;
  plains: Float32Array;
  midlands: Float32Array;
  peaks: Float32Array;
}

export interface AtmosphereSceneState {
  active: boolean;
  context: LandingApproachContext | null;
  center: Vector3;
  groundRadius: number;
  skyRadius: number;
  groundCollisionRadius: number;
  groundColor: Float32Array;
  skyColor: Float32Array;
  groundPalette: AtmosphereGroundPalette;
  groundPaletteKey: string;
  entryAltitude: number;
  lastUpdatedMs: number;
  /** Semilla del terreno del planeta activo (0 = legacy). Cambiarla reconstruye la malla. */
  terrainSeed: number;
}

export interface AtmosphereRenderOptions {
  timeMs?: number;
  fogEnabled?: boolean;
  cloudsEnabled?: boolean;
}

interface WeatherLayerParams {
  topColor: Float32Array;
  bottomColor: Float32Array;
  opacity: number;
  intensity: number;
  noiseScale: number;
  verticalFalloff: number;
}

export interface AtmosphereSceneActivationOptions {
  entryAltitude?: number;
  groundRadius?: number;
  skyRadius?: number;
  skyPadding?: number;
  groundCollisionRadius?: number;
  groundCollisionPadding?: number;
}

export class AtmosphereSceneManager {
  private groundMesh: SphereMesh | null = null;
  private skyMesh: SphereMesh | null = null;
  private fogMesh: SphereMesh | null = null;
  private lowCloudMesh: SphereMesh | null = null;
  private highCloudMesh: SphereMesh | null = null;
  private readonly WEATHER_LAYERS_ENABLED = false;
  private readonly SKY_FADE_START_ALTITUDE = 300;
  private readonly skyBlendTarget = new Float32Array([0.78, 0.88, 1.0]);
  private readonly FOG_ALTITUDE_MAX = 900;
  private readonly FOG_SHELL_OFFSET = 120;
  private readonly LOW_CLOUD_OFFSET = 420;
  private readonly HIGH_CLOUD_INSET = 160;
  private readonly WEATHER_LIGHT_MIN = 0.55;
  private readonly WEATHER_LIGHT_MAX = 1.05;
  private readonly dustTint = new Float32Array([0.78, 0.58, 0.32]);
  private readonly stormTint = new Float32Array([0.28, 0.32, 0.45]);
  private readonly meteorTint = new Float32Array([0.98, 0.66, 0.45]);
  private readonly ridgeHighlightTarget = new Float32Array([0.98, 0.97, 0.92]);
  private wireframeEnabled = true;
  private readonly wireframeRadiusScale = 1.0004;
  private readonly wireframeColor = new Float32Array([0, 0, 0]);
  private skyColorScratch: Float32Array | null = null;
  private groundLightingScratch = new Float32Array(3);
  private fogTopScratch = new Float32Array(3);
  private fogBottomScratch = new Float32Array(3);
  private cloudHighScratch = new Float32Array(3);
  private cloudLowScratch = new Float32Array(3);
  private ridgeHighlightScratch = new Float32Array(3);
  private patternTintScratch = new Float32Array(3);
  private surfaceOptions: SurfaceReadabilityOptions = {
    ridgeIntensity: 0.95,
    ridgeHeightGate: 0.5,
    textureInfluence: 1.15,
  };
  private textureDebugEnabled = false;
  private textureDebugStats: TextureDebugStats | null = null;
  private exteriorDetailLocked = false;

  constructor(
    private readonly gl: WebGL2RenderingContext | null,
    private readonly shaderManager: ShaderManager,
    private readonly textureFactory?: AtmosphereTextureFactory,
  ) {}

  public updateSurfaceReadabilityOptions(options: Partial<SurfaceReadabilityOptions>): void {
    this.surfaceOptions = {
      ...this.surfaceOptions,
      ...options,
    };
    if (this.groundMesh) {
      this.groundMesh.lastColorKey = null;
    }
  }

  public getSurfaceReadabilityState(): SurfaceReadabilityState {
    const emphasis = this.getSurfaceReadabilityEmphasis();
    return {
      emphasis,
      overlaySoftCap: 0.65 + (1 - emphasis) * 0.2,
      highlightColor: this.ridgeHighlightTarget,
    };
  }

  public setTextureDebugLogging(enabled: boolean): void {
    this.textureDebugEnabled = !!enabled;
    this.textureDebugStats = null;
    GameLogger.info(LogCategory.TEXTURE, 'Atmosphere texture debug logging toggled', {
      enabled: this.textureDebugEnabled,
    });
  }

  public setWireframeEnabled(enabled: boolean): void {
    this.wireframeEnabled = !!enabled;
    GameLogger.info(LogCategory.DEBUG, 'Atmosphere wireframe overlay', {
      enabled: this.wireframeEnabled,
    });
  }

  public isWireframeEnabled(): boolean {
    return this.wireframeEnabled;
  }

  public setExteriorDetailLocked(enabled: boolean): void {
    this.exteriorDetailLocked = !!enabled;
    if (this.groundMesh) {
      this.groundMesh.lastDetailFactor = undefined;
      this.groundMesh.lastColorKey = null;
    }
    GameLogger.info(LogCategory.DEBUG, 'Atmosphere exterior detail lock', {
      enabled: this.exteriorDetailLocked,
    });
  }

  public dispose(): void {
    this.destroyMesh(this.groundMesh);
    this.destroyMesh(this.skyMesh);
    this.destroyMesh(this.fogMesh);
    this.destroyMesh(this.lowCloudMesh);
    this.destroyMesh(this.highCloudMesh);
    this.groundMesh = null;
    this.skyMesh = null;
    this.fogMesh = null;
    this.lowCloudMesh = null;
    this.highCloudMesh = null;
  }

  private destroyMesh(mesh: SphereMesh | null): void {
    if (!mesh || !this.gl) {
      return;
    }
    if (mesh.vbo) this.gl.deleteBuffer(mesh.vbo);
    if (mesh.cbo) this.gl.deleteBuffer(mesh.cbo);
    if (mesh.ibo) this.gl.deleteBuffer(mesh.ibo);
    if (mesh.edgeIbo) this.gl.deleteBuffer(mesh.edgeIbo);
  }

  public render(
    state: AtmosphereSceneState,
    camera: Camera | null,
    weather?: AtmosphereWeatherSnapshot | null,
    options?: AtmosphereRenderOptions,
  ): void {
    if (!this.gl || !this.shaderManager || !camera || !state?.active || !state.context) {
      return;
    }
    if (!this.ensureMeshes(state.terrainSeed ?? 0)) {
      return;
    }

    const previousDepthMask = !!this.gl.getParameter(this.gl.DEPTH_WRITEMASK);
    const depthTestWasEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    if (!depthTestWasEnabled) {
      this.gl.enable(this.gl.DEPTH_TEST);
    }

    this.shaderManager.useBasicProgram();

    const altitude = this.computeCameraAltitude(state, camera);
    const detailFactor = this.computeDetailFactor(altitude);
    const lightingFactor = this.computeLightingFactor(weather ?? null);
    this.applyGroundDetail(this.groundMesh!, detailFactor);

    // Draw ground sphere (solid surface)
    const groundCullWasEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    const previousCullFaceMode = this.gl.getParameter(this.gl.CULL_FACE_MODE);
    const previousFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
    if (!groundCullWasEnabled) {
      this.gl.enable(this.gl.CULL_FACE);
    }
    this.gl.cullFace(this.gl.BACK);
    this.gl.frontFace(this.gl.CW);
    this.gl.depthMask(true);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.groundMesh!.ibo);
    this.uploadGroundMaterial(this.groundMesh!, state, detailFactor, lightingFactor);
    this.drawSphere(this.groundMesh!, state.center, state.groundRadius, camera);

    // Wireframe overlay (edge lines over the textured surface)
    if (this.wireframeEnabled) {
      const edgeBuffer = this.groundMesh!.edgeIbo ?? this.groundMesh!.ibo;
      const edgeCount = this.groundMesh!.edgeIndexCount ?? this.groundMesh!.indexCount;
      if (edgeBuffer && edgeCount) {
        this.drawWireframe(this.groundMesh!, edgeBuffer, edgeCount, state.center, state.groundRadius * this.wireframeRadiusScale, camera);
      }
    }
    if (!groundCullWasEnabled) {
      this.gl.disable(this.gl.CULL_FACE);
    } else {
      this.gl.cullFace(previousCullFaceMode);
      this.gl.frontFace(previousFrontFace);
    }

    // Draw sky dome (backface visible, no depth writes so ship renders on top)
    const wasCullEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.depthMask(false);
    const skyColor = this.computeSkyTint(state.skyColor, altitude, lightingFactor);
    this.uploadColorIfNeeded(this.skyMesh!, skyColor);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.skyMesh!.ibo);
    this.drawSphere(this.skyMesh!, state.center, state.skyRadius, camera);

    // Restore state
    this.gl.depthMask(previousDepthMask);
    if (wasCullEnabled) {
      this.gl.enable(this.gl.CULL_FACE);
    }
    if (!depthTestWasEnabled) {
      this.gl.disable(this.gl.DEPTH_TEST);
    }

    if (this.WEATHER_LAYERS_ENABLED) {
      this.renderWeatherLayers(state, camera, weather ?? null, options, altitude);
    }
  }

  private ensureMeshes(terrainSeed: number): boolean {
    if (!this.gl) {
      return false;
    }
    // El relieve depende de la semilla del planeta: si cambió, la malla del suelo se reconstruye.
    if (this.groundMesh && (this.groundMesh.terrainSeed ?? 0) !== (terrainSeed ?? 0)) {
      this.destroyMesh(this.groundMesh);
      this.groundMesh = null;
    }
    if (!this.groundMesh) {
      this.groundMesh = this.buildSphere(true, terrainSeed);
    }
    if (!this.skyMesh) {
      this.skyMesh = this.buildSphere(false);
    }
    if (this.WEATHER_LAYERS_ENABLED) {
      if (!this.fogMesh) {
        this.fogMesh = this.buildSphere(false);
      }
      if (!this.lowCloudMesh) {
        this.lowCloudMesh = this.buildSphere(false);
      }
      if (!this.highCloudMesh) {
        this.highCloudMesh = this.buildSphere(false);
      }
    }
    return !!(this.groundMesh && this.skyMesh);
  }

  private uploadGroundMaterial(
    mesh: SphereMesh,
    state: AtmosphereSceneState,
    detailFactor: number,
    lightingFactor: number,
  ): void {
    if (!this.gl || !mesh) {
      return;
    }
    if (!mesh.reliefNoise || !state.groundPalette) {
      const tinted = this.groundLightingScratch;
      tinted[0] = this.clamp01(state.groundColor[0] * lightingFactor);
      tinted[1] = this.clamp01(state.groundColor[1] * lightingFactor);
      tinted[2] = this.clamp01(state.groundColor[2] * lightingFactor);
      this.uploadColorIfNeeded(mesh, tinted);
      return;
    }
    const key = state.groundPaletteKey ?? 'atmo-ground-default';
    if (mesh.lastColorKey === key && !this.textureDebugEnabled) {
      return;
    }
    if (this.textureDebugEnabled) {
      this.textureDebugStats = this.createTextureDebugStats();
    } else {
      this.textureDebugStats = null;
    }
    const colors = new Float32Array(mesh.vertexCount * 3);
    const bandData = mesh.bandNoise;
    const latitudeData = mesh.latitudeMask;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const relief = mesh.reliefNoise[i] ?? 0.5;
      const band = bandData ? bandData[i] ?? 0.5 : 0.5;
      const latitude = latitudeData ? latitudeData[i] ?? 0 : 0;
      const micro = mesh.detailNoise ? mesh.detailNoise[i] ?? 0.5 : 0.5;
      const ridge = mesh.ridgeMask ? mesh.ridgeMask[i] ?? 0 : 0;
      const u = mesh.uv ? mesh.uv[i * 2] ?? 0 : 0;
      const v = mesh.uv ? mesh.uv[i * 2 + 1] ?? 0 : 0;
      const sampled = this.sampleGroundColor(relief, band, latitude, micro, ridge, u, v, detailFactor, state.groundPalette);
      colors[i * 3] = this.clamp01(sampled.x * lightingFactor);
      colors[i * 3 + 1] = this.clamp01(sampled.y * lightingFactor);
      colors[i * 3 + 2] = this.clamp01(sampled.z * lightingFactor);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    mesh.lastColorKey = key;
    if (this.textureDebugEnabled) {
      this.emitTextureDebugStats(state);
    }
  }

  private sampleGroundColor(
    relief: number,
    band: number,
    latitude: number,
    micro: number,
    ridge: number,
    u: number,
    v: number,
    detailFactor: number,
    palette: AtmosphereGroundPalette
  ): Vector3 {
    const height = this.clamp01(relief);
    const valley = this.zoneWeight(height, 0.0, 0.24);
    const plains = this.zoneWeight(height, 0.18, 0.52);
    const mid = this.zoneWeight(height, 0.48, 0.78);
    const peaks = this.zoneWeight(height, 0.72, 1.0);
    const total = valley + plains + mid + peaks || 1;

    let r = (
      palette.valleys[0] * valley +
      palette.plains[0] * plains +
      palette.midlands[0] * mid +
      palette.peaks[0] * peaks
    ) / total;
    let g = (
      palette.valleys[1] * valley +
      palette.plains[1] * plains +
      palette.midlands[1] * mid +
      palette.peaks[1] * peaks
    ) / total;
    let b = (
      palette.valleys[2] * valley +
      palette.plains[2] * plains +
      palette.midlands[2] * mid +
      palette.peaks[2] * peaks
    ) / total;

    const duneWeight = this.smoothstep(0.35, 0.75, band) * (1 - peaks);
    r = this.lerp(r, palette.dunes[0], duneWeight * 0.5);
    g = this.lerp(g, palette.dunes[1], duneWeight * 0.5);
    b = this.lerp(b, palette.dunes[2], duneWeight * 0.5);

    const polarWeight = this.smoothstep(0.6, 0.95, Math.abs(latitude));
    r = this.lerp(r, palette.polar[0], polarWeight * 0.8);
    g = this.lerp(g, palette.polar[1], polarWeight * 0.8);
    b = this.lerp(b, palette.polar[2], polarWeight * 0.8);

    const strataSeed = Math.abs(band - 0.5);
    const strataWeight = this.smoothstep(0.2, 0.85, strataSeed) * (0.25 + 0.45 * peaks);
    r = this.lerp(r, palette.strata[0], strataWeight);
    g = this.lerp(g, palette.strata[1], strataWeight);
    b = this.lerp(b, palette.strata[2], strataWeight);

    const microCentered = (micro - 0.5) * 2;
    const microInfluence = detailFactor * Math.abs(microCentered);
    const microTarget = microCentered >= 0 ? palette.highlands : palette.lowlands;
    r = this.lerp(r, microTarget[0], microInfluence * 0.6);
    g = this.lerp(g, microTarget[1], microInfluence * 0.6);
    b = this.lerp(b, microTarget[2], microInfluence * 0.6);

    const shade = 1 + microCentered * 0.2 * detailFactor;
    r *= shade;
    g *= shade;
    b *= shade;

    const lowlandShadow = 1 - this.smoothstep(0.08, 0.32, height);
    if (lowlandShadow > 1e-3) {
      const darkFactor = 0.55 + lowlandShadow * 0.35;
      r *= darkFactor;
      g *= darkFactor * 0.96;
      b *= darkFactor * 0.9;
    }
    const plateauTone = this.smoothstep(0.32, 0.6, height) * (1 - this.smoothstep(0.6, 0.82, height));
    if (plateauTone > 1e-3) {
      const tint = 0.92 - plateauTone * 0.12;
      r *= this.lerp(1, tint, plateauTone * 0.7);
      g *= this.lerp(1, tint * 0.98, plateauTone * 0.5);
      b *= this.lerp(1, 1.08, plateauTone * 0.6);
    }
    const peakGlow = this.smoothstep(0.6, 0.95, height);
    if (peakGlow > 1e-3) {
      const brightFactor = 1 + peakGlow * 0.45;
      r = this.clamp01(r * brightFactor + 0.05 * peakGlow);
      g = this.clamp01(g * (1 + peakGlow * 0.35) + 0.04 * peakGlow);
      b = this.clamp01(b * (1 + peakGlow * 0.25) + 0.03 * peakGlow);
    }

    const baseR = r;
    const baseG = g;
    const baseB = b;
    const textureInfluence = this.computeTextureInfluence(height, detailFactor, ridge) * this.surfaceOptions.textureInfluence;
    let appliedPattern: AtmosphereTexturePattern | null = null;
    let appliedMix = 0;
    let appliedContrast = 0;
    let appliedTileFrequency = 0;
    if (textureInfluence > 0 && this.textureFactory) {
      const pattern = this.resolveSurfacePattern(height, band);
      const tileFrequency = this.resolvePatternTileFrequency(pattern, detailFactor, height);
      const textureValue = this.textureFactory.sample(pattern, u * tileFrequency, v * tileFrequency);
      const tint = this.resolvePatternTint(pattern, palette, height);
      const patternEnergy = 0.55 + Math.abs(textureValue - 0.5) * 0.95;
      const mixStrength = this.clamp01(textureInfluence * patternEnergy * this.resolvePatternMixBoost(pattern, height));
      r = this.lerp(r, tint[0], mixStrength);
      g = this.lerp(g, tint[1], mixStrength);
      b = this.lerp(b, tint[2], mixStrength);
      const contrastBase = (0.45 + 0.3 * detailFactor + 0.2 * (1 - height)) * textureInfluence;
      const contrast = (textureValue - 0.5) * contrastBase * this.resolvePatternContrast(pattern, height);
      r = this.clamp01(r + contrast);
      g = this.clamp01(g + contrast * 0.9);
      b = this.clamp01(b + contrast * 0.8);
      appliedPattern = pattern;
      appliedMix = mixStrength;
      appliedContrast = Math.abs(contrast);
      appliedTileFrequency = tileFrequency;
    }
    const palettePreserve = this.computePalettePreserve(height, ridge);
    if (palettePreserve > 1e-3) {
      r = this.lerp(r, baseR, palettePreserve);
      g = this.lerp(g, baseG, palettePreserve * 0.98);
      b = this.lerp(b, baseB, palettePreserve * 0.95);
    }
    this.recordTextureDebugSample(
      appliedPattern,
      textureInfluence,
      appliedMix,
      appliedContrast,
      appliedTileFrequency,
      height,
      ridge,
      !!this.textureFactory,
    );

    const ridgeHighlight = this.computeRidgeHighlightIntensity(height, ridge);
    if (ridgeHighlight > 0) {
      const highlight = this.ridgeHighlightScratch;
      highlight[0] = this.lerp(palette.highlands[0], this.ridgeHighlightTarget[0], 0.7);
      highlight[1] = this.lerp(palette.highlands[1], this.ridgeHighlightTarget[1], 0.7);
      highlight[2] = this.lerp(palette.highlands[2], this.ridgeHighlightTarget[2], 0.7);
      const mix = Math.min(1, ridgeHighlight * (this.surfaceOptions.ridgeIntensity * 1.15));
      r = this.lerp(r, highlight[0], mix);
      g = this.lerp(g, highlight[1], mix);
      b = this.lerp(b, highlight[2], mix);
    }

    return {
      x: this.clamp01(r),
      y: this.clamp01(g),
      z: this.clamp01(b),
    };
  }

  private computeRidgeHighlightIntensity(height: number, ridge: number): number {
    const heightGate = this.smoothstep(this.surfaceOptions.ridgeHeightGate, 0.92, height);
    const crestSupport = this.smoothstep(0.55, 0.9, height);
    const ridgeGate = Math.pow(this.clamp01(ridge), 0.85);
    return this.clamp01((heightGate * 0.65 + crestSupport * 0.35) * ridgeGate);
  }

  private createTextureDebugStats(): TextureDebugStats {
    return {
      vertexSamples: 0,
      texturedSamples: 0,
      craterSamples: 0,
      rockSamples: 0,
      sandSamples: 0,
      zeroInfluenceSamples: 0,
      mixSum: 0,
      mixMin: Number.POSITIVE_INFINITY,
      mixMax: Number.NEGATIVE_INFINITY,
      contrastSum: 0,
      contrastMin: Number.POSITIVE_INFINITY,
      contrastMax: Number.NEGATIVE_INFINITY,
      tileFrequencySum: 0,
      tileFrequencyMin: Number.POSITIVE_INFINITY,
      tileFrequencyMax: Number.NEGATIVE_INFINITY,
      lowHeightSamples: 0,
      midHeightSamples: 0,
      highHeightSamples: 0,
      disabledByRidge: 0,
      disabledByFactory: 0,
    };
  }

  private recordTextureDebugSample(
    pattern: AtmosphereTexturePattern | null,
    textureInfluence: number,
    mixStrength: number,
    contrast: number,
    tileFrequency: number,
    height: number,
    ridge: number,
    hasFactory: boolean,
  ): void {
    if (!this.textureDebugEnabled || !this.textureDebugStats) {
      return;
    }
    const stats = this.textureDebugStats;
    stats.vertexSamples++;
    if (height < 0.33) {
      stats.lowHeightSamples++;
    } else if (height > 0.66) {
      stats.highHeightSamples++;
    } else {
      stats.midHeightSamples++;
    }
    if (!hasFactory) {
      stats.disabledByFactory++;
    }
    if (!pattern || textureInfluence <= 1e-3 || !hasFactory) {
      stats.zeroInfluenceSamples++;
      if (textureInfluence <= 1e-3 && ridge > 0.6) {
        stats.disabledByRidge++;
      }
      return;
    }
    stats.texturedSamples++;
    if (pattern === 'crater') {
      stats.craterSamples++;
    } else if (pattern === 'rock') {
      stats.rockSamples++;
    } else if (pattern === 'sand') {
      stats.sandSamples++;
    }
    stats.mixSum += mixStrength;
    stats.mixMin = Math.min(stats.mixMin, mixStrength);
    stats.mixMax = Math.max(stats.mixMax, mixStrength);
    stats.contrastSum += contrast;
    stats.contrastMin = Math.min(stats.contrastMin, contrast);
    stats.contrastMax = Math.max(stats.contrastMax, contrast);
    if (tileFrequency > 0) {
      stats.tileFrequencySum += tileFrequency;
      stats.tileFrequencyMin = Math.min(stats.tileFrequencyMin, tileFrequency);
      stats.tileFrequencyMax = Math.max(stats.tileFrequencyMax, tileFrequency);
    }
  }

  private emitTextureDebugStats(state: AtmosphereSceneState): void {
    if (!this.textureDebugStats) {
      return;
    }
    const stats = this.textureDebugStats;
    const texturedRatio = stats.vertexSamples > 0 ? stats.texturedSamples / stats.vertexSamples : 0;
    const craterRatio = stats.texturedSamples > 0 ? stats.craterSamples / stats.texturedSamples : 0;
    const rockRatio = stats.texturedSamples > 0 ? stats.rockSamples / stats.texturedSamples : 0;
    const sandRatio = stats.texturedSamples > 0 ? stats.sandSamples / stats.texturedSamples : 0;
    const avgMix = stats.texturedSamples > 0 ? stats.mixSum / stats.texturedSamples : 0;
    const avgContrast = stats.texturedSamples > 0 ? stats.contrastSum / stats.texturedSamples : 0;
    const avgTile = stats.texturedSamples > 0 ? stats.tileFrequencySum / stats.texturedSamples : 0;
    GameLogger.debug(LogCategory.TEXTURE, 'Atmosphere surface texture stats', {
      paletteKey: state.groundPaletteKey,
      planetId: state.context?.planetId ?? state.context?.planetType ?? 'unknown',
      vertexSamples: stats.vertexSamples,
      texturedSamples: stats.texturedSamples,
      texturedRatio,
      craterRatio,
      rockRatio,
      sandRatio,
      avgMix,
      mixRange: [
        Number.isFinite(stats.mixMin) ? stats.mixMin : 0,
        Number.isFinite(stats.mixMax) ? stats.mixMax : 0,
      ],
      avgContrast,
      contrastRange: [
        Number.isFinite(stats.contrastMin) ? stats.contrastMin : 0,
        Number.isFinite(stats.contrastMax) ? stats.contrastMax : 0,
      ],
      avgTileFrequency: avgTile,
      tileFrequencyRange: [
        Number.isFinite(stats.tileFrequencyMin) ? stats.tileFrequencyMin : 0,
        Number.isFinite(stats.tileFrequencyMax) ? stats.tileFrequencyMax : 0,
      ],
      zeroInfluence: stats.zeroInfluenceSamples,
      disabledByFactory: stats.disabledByFactory,
      disabledByHeightGate: stats.disabledByRidge,
      heights: {
        low: stats.lowHeightSamples,
        mid: stats.midHeightSamples,
        high: stats.highHeightSamples,
      },
    });
    this.textureDebugStats = null;
  }

  private getSurfaceReadabilityEmphasis(): number {
    const ridge = this.clamp01(this.surfaceOptions.ridgeIntensity);
    const texture = this.clamp01(this.surfaceOptions.textureInfluence);
    const gate = this.clamp01(1 - this.surfaceOptions.ridgeHeightGate);
    return this.clamp01(0.35 + ridge * 0.4 + texture * 0.2 + gate * 0.15);
  }

  private resolveSurfacePattern(height: number, band: number): AtmosphereTexturePattern {
    if (height < 0.28) {
      return 'crater';
    }
    if (height > 0.82) {
      return 'sand';
    }
    if (band > 0.68 || (height > 0.6 && band > 0.55)) {
      return 'sand';
    }
    if (band < 0.22) {
      return 'rock';
    }
    return 'rock';
  }

  private computeTextureInfluence(height: number, detailFactor: number, ridge: number): number {
    const lowlandBias = height < 0.3 ? this.lerp(0.18, 0.32, 1 - height / 0.3) : 0;
    const highlandDamp = height > 0.7 ? this.lerp(0.15, 0.35, (height - 0.7) / 0.3) : 0;
    let influence = 0.22 + detailFactor * 0.45 + lowlandBias - highlandDamp;
    influence += (1 - height) * 0.04;
    const ridgeSuppression = 1 - this.clamp01(ridge * 0.55);
    influence *= ridgeSuppression;
    const altitudeCap = this.lerp(0.58, 0.42, this.clamp01(height));
    const detailCap = this.lerp(0.62, 0.52, this.clamp01(detailFactor));
    const dynamicCap = Math.min(altitudeCap, detailCap);
    return this.clamp01(Math.min(influence, dynamicCap));
  }

  private resolvePatternTint(
    pattern: AtmosphereTexturePattern,
    palette: AtmosphereGroundPalette,
    height: number,
  ): Float32Array {
    const tint = this.patternTintScratch;
    switch (pattern) {
      case 'crater':
        tint[0] = this.lerp(palette.valleys[0], palette.plains[0], this.smoothstep(0.08, 0.22, height));
        tint[1] = this.lerp(palette.valleys[1], palette.plains[1], this.smoothstep(0.08, 0.22, height));
        tint[2] = this.lerp(palette.valleys[2], palette.plains[2], this.smoothstep(0.08, 0.22, height));
        break;
      case 'sand':
        tint[0] = this.lerp(palette.dunes[0], palette.peaks[0], this.smoothstep(0.5, 0.85, height));
        tint[1] = this.lerp(palette.dunes[1], palette.peaks[1], this.smoothstep(0.5, 0.85, height));
        tint[2] = this.lerp(palette.dunes[2], palette.peaks[2], this.smoothstep(0.5, 0.85, height));
        break;
      case 'rock':
      default:
        tint[0] = this.lerp(palette.midlands[0], palette.highlands[0], this.smoothstep(0.35, 0.6, height));
        tint[1] = this.lerp(palette.midlands[1], palette.highlands[1], this.smoothstep(0.35, 0.6, height));
        tint[2] = this.lerp(palette.midlands[2], palette.highlands[2], this.smoothstep(0.35, 0.6, height));
        break;
    }
    return tint;
  }

  private resolvePatternTileFrequency(
    pattern: AtmosphereTexturePattern,
    detailFactor: number,
    height: number,
  ): number {
    switch (pattern) {
      case 'crater':
        return 4 + detailFactor * 6 + (1 - height) * 3;
      case 'sand':
        return 3 + detailFactor * 3 + this.smoothstep(0.4, 0.85, height) * 4;
      case 'rock':
      default:
        return 5 + detailFactor * 4;
    }
  }

  private resolvePatternMixBoost(pattern: AtmosphereTexturePattern, height: number): number {
    switch (pattern) {
      case 'crater':
        return 1.08 - this.clamp01(height) * 0.18;
      case 'sand':
        return 0.95 + this.smoothstep(0.45, 0.85, height) * 0.25;
      case 'rock':
      default:
        return 1.0;
    }
  }

  private resolvePatternContrast(pattern: AtmosphereTexturePattern, height: number): number {
    switch (pattern) {
      case 'crater':
        return 2.05 - this.clamp01(height) * 0.55;
      case 'sand':
        return 1.2 + this.smoothstep(0.5, 0.9, height) * 0.3;
      case 'rock':
      default:
        return 1.3;
    }
  }

  private computePalettePreserve(height: number, ridge: number): number {
    const ridgeBias = this.smoothstep(0.35, 0.85, ridge) * 0.35;
    const heightBias = this.smoothstep(0.45, 0.9, height) * 0.4;
    return this.clamp01(0.08 + ridgeBias + heightBias);
  }

  private smoothstep(min: number, max: number, value: number): number {
    const t = this.clamp01((value - min) / Math.max(1e-6, max - min));
    return t * t * (3 - 2 * t);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private zoneWeight(value: number, min: number, max: number): number {
    const enter = this.smoothstep(min - 0.08, min + 0.02, value);
    const exit = 1 - this.smoothstep(max - 0.02, max + 0.08, value);
    return this.clamp01(enter * exit);
  }

  private uploadColorIfNeeded(mesh: SphereMesh, color: Float32Array): void {
    if (!this.gl || !mesh || !color || color.length < 3) {
      return;
    }
    const key = `${color[0].toFixed(3)}|${color[1].toFixed(3)}|${color[2].toFixed(3)}`;
    if (mesh.lastColorKey === key) {
      return;
    }
    const colors = new Float32Array(mesh.vertexCount * 3);
    for (let i = 0; i < mesh.vertexCount; i++) {
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    mesh.lastColorKey = key;
  }

  private applyGroundDetail(mesh: SphereMesh | null, detailFactor: number): void {
    if (!this.gl || !mesh || !mesh.basePositions || !mesh.detailNoise || !mesh.detailScratch) {
      return;
    }
    const clamped = this.clamp01(detailFactor);
    const last = mesh.lastDetailFactor;
    if (last !== undefined && last >= 0 && Math.abs(clamped - last) < 0.01) {
      return;
    }
    const scratch = mesh.detailScratch;
    const base = mesh.basePositions;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const extrusion = computeDetailMultiplier(mesh.detailNoise[i] ?? 0.5, clamped);
      const idx = i * 3;
      scratch[idx] = base[idx] * extrusion;
      scratch[idx + 1] = base[idx + 1] * extrusion;
      scratch[idx + 2] = base[idx + 2] * extrusion;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, scratch, this.gl.DYNAMIC_DRAW);
    mesh.lastDetailFactor = clamped;
  }

  /**
   * Detail factor realmente aplicado a la malla del suelo (la física debe usar este valor
   * para coincidir con la geometría dibujada). null si aún no se ha renderizado.
   */
  public getAppliedGroundDetailFactor(): number | null {
    const value = this.groundMesh?.lastDetailFactor;
    return typeof value === 'number' && value >= 0 ? value : null;
  }

  private computeCameraAltitude(state: AtmosphereSceneState, camera: Camera): number {
    const pos = camera.position;
    const dx = pos.x - state.center.x;
    const dy = pos.y - state.center.y;
    const dz = pos.z - state.center.z;
    const dist = Math.hypot(dx, dy, dz);
    return Math.max(0, dist - state.groundRadius);
  }

  private computeDetailFactor(altitude: number): number {
    if (this.exteriorDetailLocked) {
      return 1;
    }
    return computeAtmosphereDetailFactor(altitude);
  }

  private computeLightingFactor(weather: AtmosphereWeatherSnapshot | null): number {
    if (!weather) {
      return 1;
    }
    const visibility = this.clamp01(weather.visibilityMultiplier ?? 1);
    const intensity = this.clamp01(weather.intensity ?? 0);
    let factor = this.lerp(this.WEATHER_LIGHT_MAX, this.WEATHER_LIGHT_MIN, 1 - visibility);
    switch (weather.eventType) {
      case 'dust_storm':
        factor -= 0.18 * intensity;
        break;
      case 'thunderstorm':
        factor -= 0.22 * intensity;
        break;
      case 'dense_fog':
      case 'rain':
      case 'light_fog':
        factor -= 0.14 * intensity;
        break;
      case 'meteor_shower':
        factor += 0.06 * intensity;
        break;
      default:
        factor -= 0.08 * intensity;
        break;
    }
    return Math.max(this.WEATHER_LIGHT_MIN, Math.min(this.WEATHER_LIGHT_MAX, factor));
  }

  private computeSkyTint(baseColor: Float32Array, altitude: number, lightingFactor: number = 1): Float32Array {
    const scratch = this.skyColorScratch ?? new Float32Array(3);
    this.skyColorScratch = scratch;
    const linearFactor = altitude >= this.SKY_FADE_START_ALTITUDE
      ? 0
      : this.clamp01(1 - altitude / this.SKY_FADE_START_ALTITUDE);
    const eased = this.smoothstep(0, 1, linearFactor);
    scratch[0] = this.clamp01(this.lerp(baseColor[0], this.skyBlendTarget[0], eased) * lightingFactor);
    scratch[1] = this.clamp01(this.lerp(baseColor[1], this.skyBlendTarget[1], eased) * lightingFactor);
    scratch[2] = this.clamp01(this.lerp(baseColor[2], this.skyBlendTarget[2], eased) * lightingFactor);
    return scratch;
  }

  private drawSphere(mesh: SphereMesh, center: Vector3, radius: number, camera: Camera): void {
    if (!this.gl || !mesh) {
      return;
    }
    const positionLoc = this.shaderManager.basicAttributes['position'];
    const colorLoc = this.shaderManager.basicAttributes['color'];
    if (positionLoc === undefined || colorLoc === undefined) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.enableVertexAttribArray(colorLoc);
    this.gl.vertexAttribPointer(colorLoc, 3, this.gl.FLOAT, false, 0, 0);

    this.shaderManager.setBasicMatrices(
      this.buildModelMatrix(center, radius),
      camera.viewMatrix,
      camera.projectionMatrix,
    );
    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);

    this.gl.disableVertexAttribArray(positionLoc);
    this.gl.disableVertexAttribArray(colorLoc);
  }

  private drawWireframe(
    mesh: SphereMesh,
    elementBuffer: WebGLBuffer,
    elementCount: number,
    center: Vector3,
    radius: number,
    camera: Camera,
  ): void {
    if (!this.gl || !mesh) {
      return;
    }
    const positionLoc = this.shaderManager.basicAttributes['position'];
    const colorLoc = this.shaderManager.basicAttributes['color'];
    if (positionLoc === undefined || colorLoc === undefined) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);
    // Use constant color for wireframe to avoid re-uploading buffers
    this.gl.disableVertexAttribArray(colorLoc);
    this.gl.vertexAttrib3fv(colorLoc, this.wireframeColor);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, elementBuffer);

    this.shaderManager.setBasicMatrices(
      this.buildModelMatrix(center, radius),
      camera.viewMatrix,
      camera.projectionMatrix,
    );

    this.gl.drawElements(this.gl.LINES, elementCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.enableVertexAttribArray(colorLoc);
  }

  private buildModelMatrix(center: Vector3, radius: number): Float32Array {
    const matrix = new Float32Array(16);
    matrix[0] = radius;
    matrix[5] = radius;
    matrix[10] = radius;
    matrix[15] = 1;
    matrix[12] = center.x;
    matrix[13] = center.y;
    matrix[14] = center.z;
    return matrix;
  }

  private renderWeatherLayers(
    state: AtmosphereSceneState,
    camera: Camera,
    weather: AtmosphereWeatherSnapshot | null,
    options: AtmosphereRenderOptions | undefined,
    altitude: number,
  ): void {
    if (!this.gl || !this.shaderManager?.weatherLayerProgram || !camera) {
      return;
    }
    const fogEnabled = options?.fogEnabled ?? true;
    const cloudsEnabled = options?.cloudsEnabled ?? true;
    if (!fogEnabled && !cloudsEnabled) {
      return;
    }
    const gl = this.gl;
    const positionLoc = this.shaderManager.weatherLayerAttributes['position'];
    if (positionLoc === undefined || positionLoc < 0) {
      return;
    }
    const blendWasEnabled = gl.isEnabled(gl.BLEND);
    const cullWasEnabled = gl.isEnabled(gl.CULL_FACE);
    const prevDepthMask = !!gl.getParameter(gl.DEPTH_WRITEMASK);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    const timeSeconds = ((options?.timeMs ?? (performance?.now?.() ?? Date.now())) % 600000) / 1000;

    this.shaderManager.useWeatherLayerProgram();

    if (fogEnabled && this.fogMesh) {
      const params = this.buildFogParams(state, weather, altitude);
      this.drawWeatherLayer(
        this.fogMesh,
        positionLoc,
        state.center,
        state.groundRadius + this.FOG_SHELL_OFFSET,
        camera,
        params,
        timeSeconds,
      );
    }

    if (cloudsEnabled) {
      if (this.lowCloudMesh) {
        const params = this.buildLowCloudParams(state, weather);
        this.drawWeatherLayer(
          this.lowCloudMesh,
          positionLoc,
          state.center,
          state.groundRadius + this.LOW_CLOUD_OFFSET,
          camera,
          params,
          timeSeconds * 0.92,
        );
      }
      if (this.highCloudMesh) {
        const params = this.buildHighCloudParams(state, weather);
        const radius = Math.max(state.groundRadius + this.LOW_CLOUD_OFFSET + 40, state.skyRadius - this.HIGH_CLOUD_INSET);
        this.drawWeatherLayer(
          this.highCloudMesh,
          positionLoc,
          state.center,
          radius,
          camera,
          params,
          timeSeconds * 0.78,
        );
      }
    }

    gl.depthMask(prevDepthMask);
    if (!blendWasEnabled) {
      gl.disable(gl.BLEND);
    }
    if (cullWasEnabled) {
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.CULL_FACE);
    }
  }

  private drawWeatherLayer(
    mesh: SphereMesh,
    positionLoc: number,
    center: Vector3,
    radius: number,
    camera: Camera,
    params: WeatherLayerParams,
    timeSeconds: number,
  ): void {
    if (!this.gl || !mesh) {
      return;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);

    this.shaderManager.setWeatherLayerMatrices(
      this.buildModelMatrix(center, radius),
      camera.viewMatrix,
      camera.projectionMatrix,
    );
    this.shaderManager.setWeatherLayerParams({
      time: timeSeconds,
      topColor: params.topColor,
      bottomColor: params.bottomColor,
      opacity: params.opacity,
      intensity: params.intensity,
      noiseScale: params.noiseScale,
      verticalFalloff: params.verticalFalloff,
    });

    this.gl.drawElements(this.gl.TRIANGLES, mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.disableVertexAttribArray(positionLoc);
  }

  private buildFogParams(
    state: AtmosphereSceneState,
    weather: AtmosphereWeatherSnapshot | null,
    altitude: number,
  ): WeatherLayerParams {
    const top = this.fogTopScratch;
    const bottom = this.fogBottomScratch;
    const intensity = this.clamp01(weather?.intensity ?? 0);
    const visibility = this.clamp01(weather?.visibilityMultiplier ?? 1);
    const altitudeFactor = this.clamp01(1 - altitude / this.FOG_ALTITUDE_MAX);
    const tint = this.resolveWeatherTint(weather);
    const readability = this.getSurfaceReadabilityEmphasis();
    const densityBase = (1 - visibility) * 0.7 + intensity * 0.4;
    const density = densityBase * (1 - readability * 0.35);
    const highlightMix = readability * 0.4;
    for (let i = 0; i < 3; i++) {
      const ground = state.groundColor[i] ?? 0.4;
      const sky = state.skyColor[i] ?? 0.4;
      const target = tint[i] ?? sky;
      const lift = this.ridgeHighlightTarget[i];
      const liftedTarget = this.lerp(target, lift, highlightMix);
      const bottomMix = density * (0.55 + 0.1 * readability);
      const topMix = density * (0.45 + 0.1 * readability);
      bottom[i] = this.lerp(ground, liftedTarget, bottomMix);
      top[i] = this.lerp(sky, liftedTarget, topMix);
    }
    const opacityBase = 0.2 + altitudeFactor * 0.4;
    const opacity = this.clamp01(opacityBase + density * (0.35 + 0.1 * readability));
    return {
      topColor: top,
      bottomColor: bottom,
      opacity,
      intensity: this.clamp01(0.45 + density),
      noiseScale: 3 + density * 3.5,
      verticalFalloff: 1.1 + density * (1.8 - 0.4 * readability),
    };
  }

  private buildLowCloudParams(state: AtmosphereSceneState, weather: AtmosphereWeatherSnapshot | null): WeatherLayerParams {
    const top = this.cloudHighScratch;
    const bottom = this.cloudLowScratch;
    const intensity = this.clamp01(weather?.intensity ?? 0);
    const visibility = this.clamp01(weather?.visibilityMultiplier ?? 1);
    const tint = this.resolveWeatherTint(weather);
    const readability = this.getSurfaceReadabilityEmphasis();
    const densityBase = 0.25 + (1 - visibility) * 0.5 + intensity * 0.35;
    const density = densityBase * (1 - readability * 0.28);
    const highlightMix = readability * 0.3;
    for (let i = 0; i < 3; i++) {
      const ground = state.groundColor[i] ?? 0.4;
      const sky = state.skyColor[i] ?? 0.5;
      const target = tint[i] ?? sky;
      const lift = this.ridgeHighlightTarget[i];
      const liftedTarget = this.lerp(target, lift, highlightMix);
      bottom[i] = this.lerp(ground, liftedTarget, density * (0.35 + 0.15 * readability));
      top[i] = this.lerp(sky, liftedTarget, density * (0.5 + 0.15 * readability));
    }
    return {
      topColor: top,
      bottomColor: bottom,
      opacity: this.clamp01(0.3 + density * (0.6 + 0.2 * readability)),
      intensity: this.clamp01(0.5 + density * 0.5),
      noiseScale: 5 + density * 3,
      verticalFalloff: 0.9 + density * (0.8 - 0.2 * readability),
    };
  }

  private buildHighCloudParams(state: AtmosphereSceneState, weather: AtmosphereWeatherSnapshot | null): WeatherLayerParams {
    const top = this.cloudHighScratch;
    const bottom = this.cloudLowScratch;
    const intensity = this.clamp01(weather?.intensity ?? 0);
    const visibility = this.clamp01(weather?.visibilityMultiplier ?? 1);
    const tint = this.resolveWeatherTint(weather);
    const readability = this.getSurfaceReadabilityEmphasis();
    const densityBase = 0.15 + (1 - visibility) * 0.4 + intensity * 0.25;
    const density = densityBase * (1 - readability * 0.25);
    const highlightMix = readability * 0.25;
    for (let i = 0; i < 3; i++) {
      const sky = state.skyColor[i] ?? 0.5;
      const mid = this.skyBlendTarget[i] ?? sky;
      const target = tint[i] ?? sky;
      const lift = this.ridgeHighlightTarget[i];
      const liftedTarget = this.lerp(target, lift, highlightMix);
      bottom[i] = this.lerp(sky, liftedTarget, density * (0.3 + 0.1 * readability));
      top[i] = this.lerp(mid, liftedTarget, density * (0.2 + 0.1 * readability));
    }
    return {
      topColor: top,
      bottomColor: bottom,
      opacity: this.clamp01(0.2 + density * (0.45 + 0.1 * readability)),
      intensity: this.clamp01(0.35 + density * 0.45),
      noiseScale: 7 + density * 4,
      verticalFalloff: 0.6 + density * (0.5 - 0.15 * readability),
    };
  }

  private resolveWeatherTint(weather: AtmosphereWeatherSnapshot | null): Float32Array {
    if (!weather) {
      return this.skyBlendTarget;
    }
    switch (weather.eventType) {
      case 'dust_storm':
        return this.dustTint;
      case 'thunderstorm':
      case 'rain':
      case 'dense_fog':
        return this.stormTint;
      case 'meteor_shower':
        return this.meteorTint;
      default:
        return this.skyBlendTarget;
    }
  }

  private computeRidgeMask(relief: Float32Array, latSegments: number, lonSegments: number): Float32Array {
    const stride = lonSegments + 1;
    const mask = new Float32Array(relief.length);
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (let lat = 0; lat <= latSegments; lat++) {
      for (let lon = 0; lon <= lonSegments; lon++) {
        const idx = lat * stride + lon;
        const center = relief[idx];
        let neighborSum = 0;
        let neighborCount = 0;
        for (const [dLat, dLon] of offsets) {
          const nLat = lat + dLat;
          if (nLat < 0 || nLat > latSegments) {
            continue;
          }
          const nLon = this.wrapLongitudeIndex(lon + dLon, lonSegments);
          const neighborIdx = nLat * stride + nLon;
          neighborSum += relief[neighborIdx];
          neighborCount++;
        }
        const avg = neighborCount > 0 ? neighborSum / neighborCount : center;
        const curvature = Math.max(0, center - avg);
        mask[idx] = Math.pow(this.clamp01(curvature * 6), 0.85);
      }
    }
    return mask;
  }

  private wrapLongitudeIndex(index: number, lonSegments: number): number {
    if (index === lonSegments) {
      return lonSegments;
    }
    const span = lonSegments;
    if (index < 0) {
      let wrapped = index % span;
      if (wrapped < 0) {
        wrapped += span;
      }
      return wrapped;
    }
    if (index > lonSegments) {
      return index % span;
    }
    return index;
  }

  private addEdge(edgeSet: Set<string>, edgeIndices: number[], a: number, b: number): void {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) {
      return;
    }
    edgeSet.add(key);
    edgeIndices.push(a, b);
  }

  private buildSphere(withRelief: boolean, terrainSeed: number = 0): SphereMesh | null {
    const gl = this.gl;
    if (!gl) {
      return null;
    }
    // El relieve por vértice proviene de terrain-sampler (la MISMA función que usa la
    // colisión del GameEngine): prohibido reintroducir ruido local aquí.
    const latSegments = ATMOSPHERE_TERRAIN_LAT_SEGMENTS;
    const lonSegments = ATMOSPHERE_TERRAIN_LON_SEGMENTS;
    const field: TerrainField = getTerrainField(terrainSeed);
    const positions: number[] = [];
    const reliefSamples: number[] = [];
    const bandSamples: number[] = [];
    const latitudeSamples: number[] = [];
    const detailSamples: number[] = [];
    const uvSamples: number[] = [];
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat / latSegments) * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon / lonSegments) * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        let radius = 1.0;
        if (withRelief) {
          const sample = sampleTerrainVertex(field, theta, phi);
          radius = computeVertexUnitRadius(sample.relief);
          reliefSamples.push(this.clamp01((sample.relief + 1) * 0.5));
          bandSamples.push(sample.band01);
          latitudeSamples.push(cosTheta);
          detailSamples.push(sample.micro01);
        }
        const x = cosPhi * sinTheta * radius;
        const y = cosTheta * radius;
        const z = sinPhi * sinTheta * radius;
        positions.push(x, y, z);
        uvSamples.push(lon / lonSegments, 1 - lat / latSegments);
      }
    }
    const stride = lonSegments + 1;
    const indices: number[] = [];
    const edgeIndices: number[] = [];
    const edgeSet = new Set<string>();
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * stride + lon;
        const second = first + stride;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
        this.addEdge(edgeSet, edgeIndices, first, second);
        this.addEdge(edgeSet, edgeIndices, second, first + 1);
        this.addEdge(edgeSet, edgeIndices, first + 1, first);
        this.addEdge(edgeSet, edgeIndices, second + 1, second);
        this.addEdge(edgeSet, edgeIndices, second + 1, first + 1);
        this.addEdge(edgeSet, edgeIndices, first + 1, second);
      }
    }
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    const ebo = gl.createBuffer();
    if (!vbo || !cbo || !ibo || !ebo) {
      if (vbo) gl.deleteBuffer(vbo);
      if (cbo) gl.deleteBuffer(cbo);
      if (ibo) gl.deleteBuffer(ibo);
      if (ebo) gl.deleteBuffer(ebo);
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions.length), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edgeIndices), gl.STATIC_DRAW);
    const reliefFloat = withRelief ? new Float32Array(reliefSamples) : undefined;
    const ridgeMask = withRelief && reliefFloat
      ? this.computeRidgeMask(reliefFloat, latSegments, lonSegments)
      : undefined;
    return {
      vbo,
      cbo,
      ibo,
      edgeIbo: ebo,
      indexCount: indices.length,
      edgeIndexCount: edgeIndices.length,
      vertexCount: positions.length / 3,
      lastColorKey: null,
      hasRelief: withRelief,
      reliefNoise: reliefFloat,
      bandNoise: withRelief ? new Float32Array(bandSamples) : undefined,
      latitudeMask: withRelief ? new Float32Array(latitudeSamples) : undefined,
      basePositions: withRelief ? new Float32Array(positions) : undefined,
      detailNoise: withRelief ? new Float32Array(detailSamples) : undefined,
      detailScratch: withRelief ? new Float32Array(positions.length) : undefined,
      lastDetailFactor: withRelief ? -1 : undefined,
      ridgeMask,
      uv: withRelief ? new Float32Array(uvSamples) : undefined,
      terrainSeed: withRelief ? ((terrainSeed ?? 0) >>> 0) : undefined,
    };
  }
}
