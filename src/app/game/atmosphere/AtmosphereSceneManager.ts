import { Camera } from '../Camera';
import { ShaderManager } from '../ShaderManager';
import { LandingApproachContext } from '../types/landing.types';
import { Vector3 } from '../../types/game.types';
import { AtmosphereWeatherSnapshot } from './AtmosphereWeatherService';

interface SphereMesh {
  vbo: WebGLBuffer;
  cbo: WebGLBuffer;
  ibo: WebGLBuffer;
  indexCount: number;
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
  private readonly DETAIL_START_ALTITUDE = 600;
  private readonly DETAIL_FULL_ALTITUDE = 80;
  private readonly DETAIL_EXTRUSION_SCALE = 0.08;
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
  private skyColorScratch: Float32Array | null = null;
  private groundLightingScratch = new Float32Array(3);
  private fogTopScratch = new Float32Array(3);
  private fogBottomScratch = new Float32Array(3);
  private cloudHighScratch = new Float32Array(3);
  private cloudLowScratch = new Float32Array(3);

  constructor(
    private readonly gl: WebGL2RenderingContext | null,
    private readonly shaderManager: ShaderManager,
  ) {}

  public dispose(): void {
    if (!this.gl) {
      this.groundMesh = null;
      this.skyMesh = null;
      return;
    }
    const destroy = (mesh: SphereMesh | null) => {
      if (!mesh) return;
      if (mesh.vbo) this.gl!.deleteBuffer(mesh.vbo);
      if (mesh.cbo) this.gl!.deleteBuffer(mesh.cbo);
      if (mesh.ibo) this.gl!.deleteBuffer(mesh.ibo);
    };
    destroy(this.groundMesh);
    destroy(this.skyMesh);
    destroy(this.fogMesh);
    destroy(this.lowCloudMesh);
    destroy(this.highCloudMesh);
    this.groundMesh = null;
    this.skyMesh = null;
    this.fogMesh = null;
    this.lowCloudMesh = null;
    this.highCloudMesh = null;
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
    if (!this.ensureMeshes()) {
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
    this.gl.depthMask(true);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.groundMesh!.ibo);
    this.uploadGroundMaterial(this.groundMesh!, state, detailFactor, lightingFactor);
    this.drawSphere(this.groundMesh!, state.center, state.groundRadius, camera);

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

    this.renderWeatherLayers(state, camera, weather ?? null, options, altitude);
  }

  private ensureMeshes(): boolean {
    if (!this.gl) {
      return false;
    }
    if (!this.groundMesh) {
      this.groundMesh = this.buildSphere(true);
    }
    if (!this.skyMesh) {
      this.skyMesh = this.buildSphere(false);
    }
    if (!this.fogMesh) {
      this.fogMesh = this.buildSphere(false);
    }
    if (!this.lowCloudMesh) {
      this.lowCloudMesh = this.buildSphere(false);
    }
    if (!this.highCloudMesh) {
      this.highCloudMesh = this.buildSphere(false);
    }
    return !!(this.groundMesh && this.skyMesh);
  }

  private terrainNoise(theta: number, phi: number): number {
    const freq1 = 4.2;
    const freq2 = 11.7;
    const freq3 = 23.5;
    const octave1 = Math.sin(theta * freq1) * Math.cos(phi * freq1);
    const octave2 = Math.sin(theta * freq2 + 1.3) * Math.cos(phi * freq2 - 0.7) * 0.5;
    const octave3 = Math.sin(theta * freq3 + 2.1) * Math.cos(phi * freq3 + 1.9) * 0.25;
    const raw = octave1 + octave2 + octave3;
    return Math.max(-0.5, Math.min(1.0, raw));
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
    if (mesh.lastColorKey === key) {
      return;
    }
    const colors = new Float32Array(mesh.vertexCount * 3);
    const bandData = mesh.bandNoise;
    const latitudeData = mesh.latitudeMask;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const relief = mesh.reliefNoise[i] ?? 0.5;
      const band = bandData ? bandData[i] ?? 0.5 : 0.5;
      const latitude = latitudeData ? latitudeData[i] ?? 0 : 0;
      const micro = mesh.detailNoise ? mesh.detailNoise[i] ?? 0.5 : 0.5;
      const sampled = this.sampleGroundColor(relief, band, latitude, micro, detailFactor, state.groundPalette);
      colors[i * 3] = this.clamp01(sampled.x * lightingFactor);
      colors[i * 3 + 1] = this.clamp01(sampled.y * lightingFactor);
      colors[i * 3 + 2] = this.clamp01(sampled.z * lightingFactor);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.cbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, colors, this.gl.DYNAMIC_DRAW);
    mesh.lastColorKey = key;
  }

  private sampleGroundColor(
    relief: number,
    band: number,
    latitude: number,
    micro: number,
    detailFactor: number,
    palette: AtmosphereGroundPalette
  ): Vector3 {
    const height = this.clamp01(relief);
    const valley = this.zoneWeight(height, 0.0, 0.28);
    const plains = this.zoneWeight(height, 0.18, 0.5);
    const mid = this.zoneWeight(height, 0.45, 0.78);
    const peaks = this.zoneWeight(height, 0.7, 1.0);
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
    r = this.lerp(r, microTarget[0], microInfluence * 0.45);
    g = this.lerp(g, microTarget[1], microInfluence * 0.45);
    b = this.lerp(b, microTarget[2], microInfluence * 0.45);

    const shade = 1 + microCentered * 0.2 * detailFactor;
    r *= shade;
    g *= shade;
    b *= shade;

    return {
      x: this.clamp01(r),
      y: this.clamp01(g),
      z: this.clamp01(b),
    };
  }

  private strataNoise(theta: number, phi: number): number {
    const bands = Math.sin(theta * 3.2 + Math.cos(phi * 1.5));
    const streaks = Math.sin(phi * 14.0 + Math.sin(theta * 2.4));
    return bands * 0.65 + streaks * 0.35;
  }

  private microDetailNoise(theta: number, phi: number): number {
    const highFreq = Math.sin(theta * 27.0 + phi * 13.0);
    const cross = Math.cos(theta * 9.0 - phi * 21.0);
    return highFreq * 0.7 + cross * 0.3;
  }

  private normalizeNoise(value: number): number {
    return Math.max(0, Math.min(1, (value + 1) * 0.5));
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
    if (last !== undefined && Math.abs(clamped - last) < 0.01) {
      return;
    }
    const scratch = mesh.detailScratch;
    const base = mesh.basePositions;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const noise = (mesh.detailNoise[i] ?? 0.5) - 0.5;
      const extrusion = 1 + noise * this.DETAIL_EXTRUSION_SCALE * clamped;
      const idx = i * 3;
      scratch[idx] = base[idx] * extrusion;
      scratch[idx + 1] = base[idx + 1] * extrusion;
      scratch[idx + 2] = base[idx + 2] * extrusion;
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, mesh.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, scratch, this.gl.DYNAMIC_DRAW);
    mesh.lastDetailFactor = clamped;
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
    if (altitude >= this.DETAIL_START_ALTITUDE) {
      return 0;
    }
    if (altitude <= this.DETAIL_FULL_ALTITUDE) {
      return 1;
    }
    const range = this.DETAIL_START_ALTITUDE - this.DETAIL_FULL_ALTITUDE;
    return this.clamp01(1 - (altitude - this.DETAIL_FULL_ALTITUDE) / range);
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
    const density = (1 - visibility) * 0.7 + intensity * 0.4;
    for (let i = 0; i < 3; i++) {
      const ground = state.groundColor[i] ?? 0.4;
      const sky = state.skyColor[i] ?? 0.4;
      const target = tint[i] ?? sky;
      bottom[i] = this.lerp(ground, target, density * 0.65);
      top[i] = this.lerp(sky, target, density * 0.5);
    }
    const opacityBase = 0.2 + altitudeFactor * 0.4;
    const opacity = this.clamp01(opacityBase + density * 0.35);
    return {
      topColor: top,
      bottomColor: bottom,
      opacity,
      intensity: this.clamp01(0.45 + density),
      noiseScale: 3 + density * 3.5,
      verticalFalloff: 1.1 + density * 1.8,
    };
  }

  private buildLowCloudParams(state: AtmosphereSceneState, weather: AtmosphereWeatherSnapshot | null): WeatherLayerParams {
    const top = this.cloudHighScratch;
    const bottom = this.cloudLowScratch;
    const intensity = this.clamp01(weather?.intensity ?? 0);
    const visibility = this.clamp01(weather?.visibilityMultiplier ?? 1);
    const tint = this.resolveWeatherTint(weather);
    const density = 0.25 + (1 - visibility) * 0.5 + intensity * 0.35;
    for (let i = 0; i < 3; i++) {
      const ground = state.groundColor[i] ?? 0.4;
      const sky = state.skyColor[i] ?? 0.5;
      const target = tint[i] ?? sky;
      bottom[i] = this.lerp(ground, target, density * 0.4);
      top[i] = this.lerp(sky, target, density * 0.55);
    }
    return {
      topColor: top,
      bottomColor: bottom,
      opacity: this.clamp01(0.3 + density * 0.6),
      intensity: this.clamp01(0.5 + density * 0.5),
      noiseScale: 5 + density * 3,
      verticalFalloff: 0.9 + density * 0.8,
    };
  }

  private buildHighCloudParams(state: AtmosphereSceneState, weather: AtmosphereWeatherSnapshot | null): WeatherLayerParams {
    const top = this.cloudHighScratch;
    const bottom = this.cloudLowScratch;
    const intensity = this.clamp01(weather?.intensity ?? 0);
    const visibility = this.clamp01(weather?.visibilityMultiplier ?? 1);
    const tint = this.resolveWeatherTint(weather);
    const density = 0.15 + (1 - visibility) * 0.4 + intensity * 0.25;
    for (let i = 0; i < 3; i++) {
      const sky = state.skyColor[i] ?? 0.5;
      const mid = this.skyBlendTarget[i] ?? sky;
      const target = tint[i] ?? sky;
      bottom[i] = this.lerp(sky, target, density * 0.35);
      top[i] = this.lerp(mid, target, density * 0.25);
    }
    return {
      topColor: top,
      bottomColor: bottom,
      opacity: this.clamp01(0.2 + density * 0.45),
      intensity: this.clamp01(0.35 + density * 0.45),
      noiseScale: 7 + density * 4,
      verticalFalloff: 0.6 + density * 0.5,
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

  private buildSphere(withRelief: boolean): SphereMesh | null {
    const gl = this.gl;
    if (!gl) {
      return null;
    }
    const latSegments = 32;
    const lonSegments = 64;
    const positions: number[] = [];
    const reliefSamples: number[] = [];
    const bandSamples: number[] = [];
    const latitudeSamples: number[] = [];
    const detailSamples: number[] = [];
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
          const reliefNoise = this.terrainNoise(theta, phi);
          radius = 1.0 + reliefNoise * 0.08;
          reliefSamples.push(this.normalizeNoise(reliefNoise));
          bandSamples.push(this.normalizeNoise(this.strataNoise(theta, phi)));
          latitudeSamples.push(cosTheta);
          detailSamples.push(this.normalizeNoise(this.microDetailNoise(theta, phi)));
        }
        const x = cosPhi * sinTheta * radius;
        const y = cosTheta * radius;
        const z = sinPhi * sinTheta * radius;
        positions.push(x, y, z);
      }
    }
    const stride = lonSegments + 1;
    const indices: number[] = [];
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const first = lat * stride + lon;
        const second = first + stride;
        indices.push(first, second, first + 1);
        indices.push(second, second + 1, first + 1);
      }
    }
    const vbo = gl.createBuffer();
    const cbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    if (!vbo || !cbo || !ibo) {
      if (vbo) gl.deleteBuffer(vbo);
      if (cbo) gl.deleteBuffer(cbo);
      if (ibo) gl.deleteBuffer(ibo);
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions.length), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return {
      vbo,
      cbo,
      ibo,
      indexCount: indices.length,
      vertexCount: positions.length / 3,
      lastColorKey: null,
      hasRelief: withRelief,
      reliefNoise: withRelief ? new Float32Array(reliefSamples) : undefined,
      bandNoise: withRelief ? new Float32Array(bandSamples) : undefined,
      latitudeMask: withRelief ? new Float32Array(latitudeSamples) : undefined,
      basePositions: withRelief ? new Float32Array(positions) : undefined,
      detailNoise: withRelief ? new Float32Array(detailSamples) : undefined,
      detailScratch: withRelief ? new Float32Array(positions.length) : undefined,
      lastDetailFactor: withRelief ? -1 : undefined,
    };
  }
}
