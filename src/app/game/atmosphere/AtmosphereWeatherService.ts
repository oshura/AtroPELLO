import { AtmosphereSceneState } from './AtmosphereSceneManager';
import { LandingApproachContext } from '../types/landing.types';
import { Vector3 } from '../../types/game.types';
import { PlanetType } from '../game-objects';

type PrecipitationType = 'none' | 'rain' | 'dust';

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
}

export class AtmosphereWeatherService {
  private currentEvent: AtmosphereWeatherEventState | null = null;
  private snapshot: AtmosphereWeatherSnapshot | null = null;
  private eventPool: AtmosphereWeatherEventDefinition[] = [];
  private rngSeed: number = 1;
  private nextEventArmMs: number = 0;
  private sceneContext: AtmosphereSceneState | null = null;

  public configureForScene(scene: AtmosphereSceneState, nowMs: number = this.getTime()): void {
    this.sceneContext = scene;
    this.rngSeed = this.computeSeed(scene.context);
    this.eventPool = this.buildEventPool(scene.context);
    this.currentEvent = null;
    this.snapshot = null;
    this.nextEventArmMs = nowMs;
    this.pickNextEvent(nowMs);
  }

  public reset(): void {
    this.sceneContext = null;
    this.currentEvent = null;
    this.snapshot = null;
    this.eventPool = [];
  }

  public update(nowMs: number, deltaSeconds: number, altitude: number): void {
    if (!this.sceneContext) {
      this.snapshot = null;
      return;
    }
    if (!this.currentEvent || nowMs >= this.currentEvent.startedAtMs + this.currentEvent.durationMs) {
      if (nowMs >= this.nextEventArmMs) {
        this.pickNextEvent(nowMs);
      }
    }
    if (!this.currentEvent) {
      this.snapshot = this.buildBaselineSnapshot(nowMs);
      return;
    }
    const elapsed = nowMs - this.currentEvent.startedAtMs;
    const life = this.currentEvent.durationMs > 0 ? this.clamp(elapsed / this.currentEvent.durationMs, 0, 1) : 1;
    const fadeIn = this.clamp(elapsed / 2000, 0, 1);
    const fadeOut = life > 0.85 ? 1 - this.clamp((life - 0.85) / 0.15, 0, 1) : 1;
    const altitudeFactor = altitude <= 0 ? 1 : this.clamp(1 - altitude / 2500, 0.25, 1);
    const intensity = this.clamp(fadeIn * fadeOut * altitudeFactor, 0, 1);

    const def = this.currentEvent.definition;
    const visibility = this.lerp(1, def.visibilityMultiplier, intensity);
    const turbulence = def.turbulenceStrength * intensity;
    const driftVector: Vector3 = {
      x: this.currentEvent.driftVector.x * intensity,
      y: this.currentEvent.driftVector.y * intensity,
      z: this.currentEvent.driftVector.z * intensity,
    };
    const impactVolume = this.lerp(1, def.impactVolumeMultiplier, intensity);
    this.snapshot = {
      eventType: def.type,
      intensity,
      visibilityMultiplier: visibility,
      turbulenceStrength: turbulence,
      driftVector,
      impactVolumeMultiplier: impactVolume,
      audioCue: def.audioCue ?? null,
      precipitation: def.precipitation ?? 'none',
      lightningChance: (def.lightningChance ?? 0) * intensity,
      startedAtMs: this.currentEvent.startedAtMs,
      etaMs: Math.max(0, this.currentEvent.startedAtMs + this.currentEvent.durationMs - nowMs),
    };
  }

  public getSnapshot(): AtmosphereWeatherSnapshot | null {
    return this.snapshot;
  }

  private pickNextEvent(nowMs: number): void {
    if (!this.eventPool.length) {
      this.currentEvent = null;
      this.snapshot = this.buildBaselineSnapshot(nowMs);
      this.nextEventArmMs = nowMs + 15000;
      return;
    }
    const totalWeight = this.eventPool.reduce((acc, def) => acc + Math.max(def.weight, 0), 0);
    const roll = this.seededRandom() * totalWeight;
    let accum = 0;
    let selected = this.eventPool[0];
    for (const def of this.eventPool) {
      accum += Math.max(def.weight, 0);
      if (roll <= accum) {
        selected = def;
        break;
      }
    }
    const duration = this.randomRange(selected.minDurationMs, selected.maxDurationMs);
    const drift = this.buildDriftVector(selected.driftStrength);
    this.currentEvent = {
      definition: selected,
      durationMs: duration,
      startedAtMs: nowMs,
      driftVector: drift,
    };
    this.nextEventArmMs = nowMs + duration + this.randomRange(7000, 18000);
  }

  private buildEventPool(context: LandingApproachContext | null): AtmosphereWeatherEventDefinition[] {
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
        impactVolumeMultiplier: 0.85,
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
        impactVolumeMultiplier: 0.75,
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
        impactVolumeMultiplier: 0.6,
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
        impactVolumeMultiplier: 0.7,
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
        impactVolumeMultiplier: 0.65,
        audioCue: 'sfx_weather_meteor',
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
    return base;
  }

  private buildBaselineSnapshot(nowMs: number): AtmosphereWeatherSnapshot {
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
    };
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
