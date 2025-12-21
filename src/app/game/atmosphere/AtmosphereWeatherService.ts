import { AtmosphereSceneState } from './AtmosphereSceneManager';
import { LandingApproachContext } from '../types/landing.types';
import { Vector3 } from '../../types/game.types';
import { PlanetType } from '../game-objects';

export type PrecipitationType = 'none' | 'rain' | 'dust' | 'meteor';

export type AtmosphereWeatherEventType =
  | 'clear'
  | 'light_fog'
  | 'dense_fog'
  | 'rain'
  | 'thunderstorm'
  | 'dust_storm'
  | 'meteor_shower';

interface AtmosphereWeatherEventDefinition {
  type: AtmosphereWeatherEventType;
  weight: number;
  minDurationMs: number;
  maxDurationMs: number;
  visibilityMultiplier: number;
  turbulenceStrength: number;
  driftStrength: number;
  impactVolumeMultiplier: number;
  audioCue?: string;
  precipitation?: PrecipitationType;
  lightningChance?: number;
}

interface AtmosphereWeatherEventState {
  definition: AtmosphereWeatherEventDefinition;
  durationMs: number;
  startedAtMs: number;
  driftVector: Vector3;
}

interface AtmosphereLayerDefinition {
  id: string;
  label: string;
  minAltitude: number;
  maxAltitude: number;
  durationRangeMs: [number, number];
}

interface LayerRuntimeState {
  definition: AtmosphereLayerDefinition;
  currentEvent: AtmosphereWeatherEventState | null;
  snapshot: AtmosphereWeatherSnapshot;
  nextEventArmMs: number;
}

const DEFAULT_LAYER_DEFINITIONS: AtmosphereLayerDefinition[] = [
  {
    id: 'surface',
    label: 'Capa superficial',
    minAltitude: -Infinity,
    maxAltitude: 420,
    durationRangeMs: [80000, 120000],
  },
  {
    id: 'low',
    label: 'Capa baja',
    minAltitude: 420,
    maxAltitude: 1500,
    durationRangeMs: [90000, 130000],
  },
  {
    id: 'mid',
    label: 'Capa media',
    minAltitude: 1500,
    maxAltitude: 2600,
    durationRangeMs: [100000, 140000],
  },
  {
    id: 'upper',
    label: 'Capa superior',
    minAltitude: 2600,
    maxAltitude: Infinity,
    durationRangeMs: [90000, 140000],
  },
];

export interface AtmosphereWeatherSnapshot {
  eventType: AtmosphereWeatherEventType;
  intensity: number;
  visibilityMultiplier: number;
  turbulenceStrength: number;
  driftVector: Vector3;
  impactVolumeMultiplier: number;
  audioCue: string | null;
  precipitation: PrecipitationType;
  lightningChance: number;
  startedAtMs: number;
  etaMs: number;
  layerId: string;
  layerLabel: string;
  layerBounds: { min: number; max: number };
}

export class AtmosphereWeatherService {
  private snapshot: AtmosphereWeatherSnapshot | null = null;
  private rngSeed: number = 1;
  private sceneContext: AtmosphereSceneState | null = null;
  private marsSevereMode: boolean = false;
  private layerStates: Map<string, LayerRuntimeState> = new Map();
  private activeLayerId: string | null = null;
  private readonly layerDefinitions: AtmosphereLayerDefinition[] = DEFAULT_LAYER_DEFINITIONS;

  public configureForScene(scene: AtmosphereSceneState, nowMs: number = this.getTime()): void {
    this.sceneContext = scene;
    this.marsSevereMode = this.isMarsContext(scene.context);
    this.rngSeed = this.computeSeed(scene.context);
    this.snapshot = null;
    this.activeLayerId = null;
    this.initializeLayerStates(nowMs);
  }

  public reset(): void {
    this.sceneContext = null;
    this.snapshot = null;
    this.marsSevereMode = false;
    this.layerStates.clear();
    this.activeLayerId = null;
  }

  public update(nowMs: number, deltaSeconds: number, altitude: number): void {
    if (!this.sceneContext) {
      this.snapshot = null;
      return;
    }
    if (!this.layerStates.size) {
      this.initializeLayerStates(nowMs);
    }
    const activeLayer = this.resolveLayerForAltitude(altitude);
    this.activeLayerId = activeLayer.id;
    for (const state of this.layerStates.values()) {
      const sampleAltitude = state.definition.id === activeLayer.id
        ? altitude
        : this.resolveLayerSampleAltitude(state.definition);
      this.updateLayerState(state, nowMs, sampleAltitude);
    }
    const activeState = this.layerStates.get(activeLayer.id);
    this.snapshot = activeState?.snapshot ?? this.buildBaselineSnapshot(nowMs, activeLayer);
  }

  public getSnapshot(): AtmosphereWeatherSnapshot | null {
    return this.snapshot;
  }

  private initializeLayerStates(nowMs: number): void {
    this.layerStates.clear();
    for (const definition of this.layerDefinitions) {
      this.layerStates.set(definition.id, {
        definition,
        currentEvent: null,
        snapshot: this.buildBaselineSnapshot(nowMs, definition),
        nextEventArmMs: nowMs,
      });
    }
  }

  private updateLayerState(state: LayerRuntimeState, nowMs: number, altitude: number): void {
    const expired = !state.currentEvent || nowMs >= state.currentEvent.startedAtMs + state.currentEvent.durationMs;
    if (expired && nowMs >= state.nextEventArmMs) {
      state.currentEvent = this.pickNextLayerEvent(state.definition, nowMs);
      const [cooldownMin, cooldownMax] = this.getEventCooldownRange();
      const cooldown = this.randomRange(cooldownMin, cooldownMax);
      state.nextEventArmMs = state.currentEvent
        ? state.currentEvent.startedAtMs + state.currentEvent.durationMs + cooldown
        : nowMs + cooldown;
    }
    if (!state.currentEvent) {
      state.snapshot = this.buildBaselineSnapshot(nowMs, state.definition);
      return;
    }
    state.snapshot = this.buildSnapshotFromEvent(state.currentEvent, nowMs, altitude, state.definition);
  }

  private pickNextLayerEvent(layer: AtmosphereLayerDefinition, nowMs: number): AtmosphereWeatherEventState | null {
    const pool = this.buildEventPool(this.sceneContext?.context ?? null, layer);
    if (!pool.length) {
      return null;
    }
    const selected = this.selectEventDefinition(pool);
    if (!selected) {
      return null;
    }
    const [layerMin, layerMax] = layer.durationRangeMs;
    const duration = this.randomRange(layerMin, layerMax);
    const drift = this.buildDriftVector(selected.driftStrength);
    return {
      definition: selected,
      durationMs: duration,
      startedAtMs: nowMs,
      driftVector: drift,
    };
  }

  private selectEventDefinition(pool: AtmosphereWeatherEventDefinition[]): AtmosphereWeatherEventDefinition | null {
    const totalWeight = pool.reduce((acc, def) => acc + Math.max(def.weight, 0), 0);
    if (totalWeight <= 0) {
      return null;
    }
    const roll = this.seededRandom() * totalWeight;
    let accum = 0;
    for (const def of pool) {
      accum += Math.max(def.weight, 0);
      if (roll <= accum) {
        return def;
      }
    }
    return pool[pool.length - 1] ?? null;
  }

  private resolveLayerForAltitude(altitude: number): AtmosphereLayerDefinition {
    const value = Number.isFinite(altitude) ? altitude : 0;
    for (const def of this.layerDefinitions) {
      const min = Number.isFinite(def.minAltitude) ? def.minAltitude : -Infinity;
      const max = Number.isFinite(def.maxAltitude) ? def.maxAltitude : Infinity;
      if (value >= min && value < max) {
        return def;
      }
    }
    return this.layerDefinitions[this.layerDefinitions.length - 1];
  }

  private resolveLayerSampleAltitude(definition: AtmosphereLayerDefinition): number {
    const min = Number.isFinite(definition.minAltitude) ? definition.minAltitude : 0;
    const max = Number.isFinite(definition.maxAltitude) ? definition.maxAltitude : min + 200;
    if (!Number.isFinite(definition.minAltitude)) {
      return Math.min(max - 50, max);
    }
    if (!Number.isFinite(definition.maxAltitude)) {
      return min + 200;
    }
    return (min + max) / 2;
  }

  private buildSnapshotFromEvent(
    state: AtmosphereWeatherEventState,
    nowMs: number,
    altitude: number,
    layer: AtmosphereLayerDefinition,
  ): AtmosphereWeatherSnapshot {
    const elapsed = nowMs - state.startedAtMs;
    const life = state.durationMs > 0 ? this.clamp(elapsed / state.durationMs, 0, 1) : 1;
    const fadeIn = this.clamp(elapsed / 2000, 0, 1);
    const fadeOutStart = 0.9;
    const fadeOut = life > fadeOutStart ? 1 - this.clamp((life - fadeOutStart) / (1 - fadeOutStart), 0, 1) : 1;
    const altitudeFactor = this.computeLayerPresenceFactor(layer, altitude);
    const intensity = this.clamp(fadeIn * fadeOut * altitudeFactor, 0, 1);
    const def = state.definition;
    const visibility = this.lerp(1, def.visibilityMultiplier, intensity);
    const turbulence = def.turbulenceStrength * intensity;
    const driftVector: Vector3 = {
      x: state.driftVector.x * intensity,
      y: state.driftVector.y * intensity,
      z: state.driftVector.z * intensity,
    };
    const impactVolume = this.lerp(1, def.impactVolumeMultiplier, intensity);
    return {
      eventType: def.type,
      intensity,
      visibilityMultiplier: visibility,
      turbulenceStrength: turbulence,
      driftVector,
      impactVolumeMultiplier: impactVolume,
      audioCue: def.audioCue ?? null,
      precipitation: def.precipitation ?? 'none',
      lightningChance: (def.lightningChance ?? 0) * intensity,
      startedAtMs: state.startedAtMs,
      etaMs: Math.max(0, state.startedAtMs + state.durationMs - nowMs),
      layerId: layer.id,
      layerLabel: layer.label,
      layerBounds: { min: layer.minAltitude, max: layer.maxAltitude },
    };
  }

  private computeLayerPresenceFactor(layer: AtmosphereLayerDefinition, altitude: number): number {
    if (!Number.isFinite(altitude)) {
      return 1;
    }
    const min = Number.isFinite(layer.minAltitude) ? layer.minAltitude : -Infinity;
    const max = Number.isFinite(layer.maxAltitude) ? layer.maxAltitude : Infinity;
    if (altitude < min) {
      return this.clamp(1 - (min - altitude) / 400, 0.2, 1);
    }
    if (altitude > max) {
      return this.clamp(1 - (altitude - max) / 600, 0.2, 1);
    }
    return 1;
  }

  private buildEventPool(
    context: LandingApproachContext | null,
    layer?: AtmosphereLayerDefinition,
  ): AtmosphereWeatherEventDefinition[] {
    const base: AtmosphereWeatherEventDefinition[] = [
      {
        type: 'clear',
        weight: 3,
        minDurationMs: 20000,
        maxDurationMs: 32000,
        visibilityMultiplier: 1,
        turbulenceStrength: 0,
        driftStrength: 0,
        impactVolumeMultiplier: 1,
      },
      {
        type: 'light_fog',
        weight: 1.4,
        minDurationMs: 12000,
        maxDurationMs: 22000,
        visibilityMultiplier: 0.85,
        turbulenceStrength: 0.15,
        driftStrength: 0.05,
        impactVolumeMultiplier: 0.9,
      },
      {
        type: 'dense_fog',
        weight: 0.9,
        minDurationMs: 9000,
        maxDurationMs: 18000,
        visibilityMultiplier: 0.55,
        turbulenceStrength: 0.25,
        driftStrength: 0.08,
        impactVolumeMultiplier: 0.7,
        audioCue: 'sfx_weather_fog',
      },
      {
        type: 'rain',
        weight: 1.6,
        minDurationMs: 15000,
        maxDurationMs: 26000,
        visibilityMultiplier: 0.7,
        turbulenceStrength: 0.3,
        driftStrength: 0.1,
        impactVolumeMultiplier: 0.55,
        audioCue: 'sfx_weather_rain',
        precipitation: 'rain',
      },
      {
        type: 'thunderstorm',
        weight: 0.8,
        minDurationMs: 12000,
        maxDurationMs: 20000,
        visibilityMultiplier: 0.65,
        turbulenceStrength: 0.55,
        driftStrength: 0.18,
        impactVolumeMultiplier: 0.25,
        audioCue: 'sfx_weather_thunder',
        precipitation: 'rain',
        lightningChance: 0.35,
      },
      {
        type: 'dust_storm',
        weight: 1.1,
        minDurationMs: 11000,
        maxDurationMs: 23000,
        visibilityMultiplier: 0.5,
        turbulenceStrength: 0.45,
        driftStrength: 0.22,
        impactVolumeMultiplier: 0.4,
        audioCue: 'sfx_weather_dust',
        precipitation: 'dust',
      },
      {
        type: 'meteor_shower',
        weight: 0.5,
        minDurationMs: 8000,
        maxDurationMs: 14000,
        visibilityMultiplier: 0.9,
        turbulenceStrength: 0.35,
        driftStrength: 0.12,
        impactVolumeMultiplier: 0.55,
        audioCue: 'sfx_weather_meteor',
        precipitation: 'meteor',
      },
    ];
    const type = context?.planetType;
    if (type === PlanetType.Gaseous || type === PlanetType.Giant) {
      base.push({
        type: 'thunderstorm',
        weight: 1.2,
        minDurationMs: 14000,
        maxDurationMs: 26000,
        visibilityMultiplier: 0.6,
        turbulenceStrength: 0.65,
        driftStrength: 0.24,
        impactVolumeMultiplier: 0.55,
        audioCue: 'sfx_weather_thunder',
        precipitation: 'rain',
        lightningChance: 0.55,
      });
    }
    if (type === PlanetType.Dwarf || type === PlanetType.Ringed) {
      base.push({
        type: 'dust_storm',
        weight: 1.6,
        minDurationMs: 14000,
        maxDurationMs: 26000,
        visibilityMultiplier: 0.45,
        turbulenceStrength: 0.5,
        driftStrength: 0.25,
        impactVolumeMultiplier: 0.65,
        audioCue: 'sfx_weather_dust',
        precipitation: 'dust',
      });
    }

    if (this.isMarsContext(context)) {
      const severePool = base.filter((def) => this.isSevereWeatherEvent(def)).map((def) => {
        if (def.type === 'dust_storm' || def.type === 'thunderstorm') {
          return { ...def, weight: def.weight + 1.2 };
        }
        if (def.type === 'rain') {
          return { ...def, weight: def.weight + 0.8 };
        }
        return def;
      });
      const weightedSevere = this.applyLayerWeighting(severePool.length ? severePool : base, layer);
      return weightedSevere;
    }
    return this.applyLayerWeighting(base, layer);
  }

  private applyLayerWeighting(
    pool: AtmosphereWeatherEventDefinition[],
    layer?: AtmosphereLayerDefinition,
  ): AtmosphereWeatherEventDefinition[] {
    if (!layer) {
      return pool.map(def => ({ ...def }));
    }
    return pool.map(def => ({
      ...def,
      weight: def.weight * this.getLayerWeightMultiplier(def.type, layer),
    }));
  }

  private getLayerWeightMultiplier(type: AtmosphereWeatherEventType, layer: AtmosphereLayerDefinition): number {
    switch (layer.id) {
      case 'surface':
        if (type === 'clear') return 1.45;
        if (type === 'dust_storm') return 1.25;
        if (type === 'rain') return 1.2;
        if (type === 'meteor_shower') return 0.4;
        return 1;
      case 'low':
        if (type === 'thunderstorm') return 1.2;
        if (type === 'rain') return 1.1;
        if (type === 'meteor_shower') return 0.6;
        return 1;
      case 'mid':
        if (type === 'thunderstorm') return 1.4;
        if (type === 'meteor_shower') return 1.35;
        if (type === 'dust_storm') return 0.7;
        if (type === 'clear') return 0.85;
        return 1;
      case 'upper':
        if (type === 'meteor_shower') return 1.8;
        if (type === 'thunderstorm') return 1.3;
        if (type === 'rain') return 0.4;
        if (type === 'dust_storm') return 0.5;
        return 1;
      default:
        return 1;
    }
  }

  private buildBaselineSnapshot(nowMs: number, layer?: AtmosphereLayerDefinition): AtmosphereWeatherSnapshot {
    const resolvedLayer = layer ?? this.layerDefinitions[0];
    if (this.marsSevereMode) {
      return {
        eventType: 'dust_storm',
        intensity: 0.35,
        visibilityMultiplier: 0.65,
        turbulenceStrength: 0.25,
        driftVector: { x: 0, y: 0, z: 0 },
        impactVolumeMultiplier: 0.8,
        audioCue: 'sfx_weather_dust',
        precipitation: 'dust',
        lightningChance: 0,
        startedAtMs: nowMs,
        etaMs: 0,
        layerId: resolvedLayer.id,
        layerLabel: resolvedLayer.label,
        layerBounds: { min: resolvedLayer.minAltitude, max: resolvedLayer.maxAltitude },
      };
    }
    return {
      eventType: 'clear',
      intensity: 0,
      visibilityMultiplier: 1,
      turbulenceStrength: 0,
      driftVector: { x: 0, y: 0, z: 0 },
      impactVolumeMultiplier: 1,
      audioCue: null,
      precipitation: 'none',
      lightningChance: 0,
      startedAtMs: nowMs,
      etaMs: 0,
      layerId: resolvedLayer.id,
      layerLabel: resolvedLayer.label,
      layerBounds: { min: resolvedLayer.minAltitude, max: resolvedLayer.maxAltitude },
    };
  }

  private getEventCooldownRange(): [number, number] {
    return this.marsSevereMode ? [0, 0] : [7000, 18000];
  }

  private isMarsContext(context: LandingApproachContext | null): boolean {
    if (!context) {
      return false;
    }
    const id = context.planetId?.toLowerCase() ?? '';
    const name = context.planetName?.toLowerCase() ?? '';
    return id.includes('mars') || name === 'mars' || name === 'marte';
  }

  private isSevereWeatherEvent(def: AtmosphereWeatherEventDefinition): boolean {
    return (
      def.type !== 'clear' && (
        def.turbulenceStrength >= 0.3 ||
        def.visibilityMultiplier <= 0.7 ||
        def.precipitation === 'rain' ||
        def.precipitation === 'dust' ||
        def.precipitation === 'meteor'
      )
    );
  }

  private buildDriftVector(strength: number): Vector3 {
    if (strength <= 0) {
      return { x: 0, y: 0, z: 0 };
    }
    const angle = this.seededRandom() * Math.PI * 2;
    const magnitude = strength;
    return {
      x: Math.cos(angle) * magnitude,
      y: 0,
      z: Math.sin(angle) * magnitude,
    };
  }

  private computeSeed(context: LandingApproachContext | null): number {
    const id = context?.planetId ?? 'unknown';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return hash || 1;
  }

  private randomRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    const t = this.seededRandom();
    return Math.round(min + (max - min) * t);
  }

  private seededRandom(): number {
    const x = Math.sin(this.rngSeed++) * 10000;
    return x - Math.floor(x);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  private getTime(): number {
    return typeof performance !== 'undefined' && performance?.now ? performance.now() : Date.now();
  }
}
