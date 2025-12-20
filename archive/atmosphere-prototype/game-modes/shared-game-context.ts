import { GameStateStore } from '../../services/game/game-state.store';
import { PanelEventCoordinator } from '../services/ui/panel-event-coordinator.service';
import { SpellIOCoordinator } from '../services/spells/spell-io-coordinator.service';
import { KeyBindingsService } from '../../services/key-bindings.service';
import { WebGLService } from '../../services/webgl.service';
import { ParticleEffectsService } from '../../services/particle-effects.service';
import { LoggingService } from '../../services/logging.service';
import { AudioEngineService } from '../../services/audio/audio-engine.service';
import { MusicDirectorService } from '../../services/audio/music-director.service';
import { HUDManager } from '../hud/HUDManager';
import { ShaderManager } from '../ShaderManager';
import { TextureManager } from '../TextureManager';
import { PlanetType } from '../game-objects/Planet';
import { LandingApproachContext } from '../types/landing.types';
import { PlanetTerrainSnapshot } from './terrain/planet-terrain.types';
import { AtmosphereFlightModelService } from './physics/atmosphere-flight-model.service';
import { CollisionManagerService } from '../services/physics/collision-manager.service';
import { GameEngine } from '../GameEngine';
import { Vector3 } from '../../types/game.types';
import { GameModeEvent } from './game-mode-engine.interface';

export type AtmosphereColorVector = [number, number, number];

export interface AtmospherePaletteSnapshot {
  readonly horizon: AtmosphereColorVector;
  readonly zenith: AtmosphereColorVector;
  readonly haze: AtmosphereColorVector;
}

export interface AtmosphereLightSnapshot {
  readonly direction: AtmosphereColorVector;
  readonly color: AtmosphereColorVector;
  readonly intensity: number;
}

export interface AtmosphereSceneSnapshot {
  readonly planetId: string | null;
  readonly planetName: string;
  readonly palette: AtmospherePaletteSnapshot;
  readonly primaryLight: AtmosphereLightSnapshot;
  readonly updatedAt: number;
  readonly source: 'planet' | 'default';
}

export interface AtmospherePhysicsSnapshot {
  readonly timestamp: number;
  readonly planetId: string | null;
  readonly planetName: string | null;
  readonly shipPosition: Vector3 | null;
  readonly shipVelocity: Vector3 | null;
  readonly shipSpeed: number | null;
  readonly projectedAltitude: number | null;
  readonly verticalSpeed: number | null;
  readonly surfaceNormal: Vector3 | null;
  readonly impactAngle: number | null;
  readonly stallWarning: boolean;
  readonly stallActive: boolean;
}

export type AtmosphereBoundaryEvent = 'near-ground' | 'above-dome' | null;

export interface AtmosphereBoundaryDetection {
  readonly shipDistance: number | null;
  readonly shipAltitude: number | null;
  readonly relativeAltitude: number | null;
  readonly projectedAltitude: number | null;
  readonly nearGround: boolean;
  readonly aboveDome: boolean;
  readonly surfaceNormal: Vector3 | null;
  readonly impactAngle: number | null;
  readonly lastEvent: AtmosphereBoundaryEvent;
  readonly lastEventAt: number | null;
  readonly timestamp: number;
}

export interface AtmosphereBoundarySnapshot {
  readonly planetId: string | null;
  readonly planetName: string | null;
  readonly planetType: PlanetType | null;
  readonly landingEnabled: boolean;
  readonly basePlanetRadius: number;
  readonly groundRadius: number | null;
  readonly domeRadius: number;
  readonly minSeparation: number;
  readonly nearGroundThreshold: number;
  readonly updatedAt: number;
  readonly detection: AtmosphereBoundaryDetection;
}

export interface SharedGameContext {
  readonly gameState: GameStateStore;
  readonly panelCoordinator: PanelEventCoordinator;
  readonly spellIO: SpellIOCoordinator;
  readonly keyBindings: KeyBindingsService;
  readonly webgl: WebGLService;
  readonly particles: ParticleEffectsService;
  readonly logger: LoggingService;
  readonly audio: AudioEngineService;
  readonly music: MusicDirectorService;
  hudManager?: HUDManager | null;
  shaderManager?: ShaderManager | null;
  textureManager?: TextureManager | null;
  atmosphereScene?: AtmosphereSceneSnapshot | null;
  atmosphereBoundaries?: AtmosphereBoundarySnapshot | null;
  atmosphereTerrain?: PlanetTerrainSnapshot | null;
  atmospherePhysicsSnapshot?: AtmospherePhysicsSnapshot | null;
  collisionManager?: CollisionManagerService | null;
  gameEngine?: GameEngine | null;
  activeMode?: string | null;
  readonly atmospherePhysics: AtmosphereFlightModelService;
  emitModeEvent?: (event: GameModeEvent) => void;
}

export interface AtmosphereCameraPosePayload {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  mode?: string | null;
}

export interface AtmosphereLandingFadePayload {
  planetId: string | null;
  planetName: string | null;
  landingContext: LandingApproachContext | null;
  cameraPose?: AtmosphereCameraPosePayload | null;
  anchor?: Vector3 | null;
}
