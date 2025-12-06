import { Injectable } from '@angular/core';
import { EyeState, SolarSystemSnapshot } from '../../types/solar-system.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { PortalPersistenceService } from './portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameEngine } from '../../GameEngine';
import { SolarSystemSerializer } from './solar-system-serializer';
import { PlanetIntelStatus, PlanetMissionState, PlanetResourceStock } from '../../types/planet-intel.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';

interface RuntimeSunState {
  id: string;
  name?: string;
  position: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  radius?: number;
}

interface RuntimePlanetState {
  id: string;
  customName?: string;
  position: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  radius?: number;
  planetType?: string;
  baseColorName?: string;
  probabilityOfLifePct?: number;
  orbitCenter?: { x: number; y: number; z: number };
  semiMajor?: number;
  semiMinor?: number;
  orbitOrientation?: number;
  orbitAngle?: number;
  orbitAngularSpeed?: number;
  orbitNormal?: { x: number; y: number; z: number };
  orbitU?: { x: number; y: number; z: number };
  inhabitants?: string;
  lesserBeing?: string | null;
  visited?: boolean;
  lifeScanned?: boolean;
  creatureScanned?: boolean;
  hasArtifact?: boolean;
  artifactIntelStatus?: PlanetIntelStatus;
  hasVoidMass?: boolean;
  voidMassCapacity?: number;
  voidMassRemaining?: number;
  voidMassIntelStatus?: PlanetIntelStatus;
  civilizationIntelStatus?: PlanetIntelStatus;
  lesserBeingIntelStatus?: PlanetIntelStatus;
  pendingMission?: PlanetMissionState | null;
  resourceStock?: PlanetResourceStock;
  animosity?: string;
}

interface RuntimeClusterState {
  id: string;
  center: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  speed: number;
  count: number;
  includeSuper?: boolean;
  radius?: number;
  centerSpeedFactor?: number;
}

interface RuntimePortalState {
  id: string;
  position: { x: number; y: number; z: number };
  radius: number;
  linkedPortalId?: string;
  eyeState?: EyeState;
  animosity?: GameObjectAnimosity;
  concordSealActive?: boolean;
  concordSealActivatedAt?: number;
  preventsLesserIncursions?: boolean;
}

interface RuntimeDebrisState {
  id: string;
  planetId: string;
  localOffset: { x: number; y: number; z: number };
  size?: number;
  type?: string;
}

/**
 * Captures the live solar system (sun, planets, clusters, portals, debris) into snapshot form
 * and provides helpers to persist the result inside PortalPersistenceService.
 */
@Injectable({ providedIn: 'root' })
export class SolarSystemRuntimeSerializerService {
  constructor(
    private readonly gameInitializer: GameInitializer,
    private readonly portalPersistence: PortalPersistenceService,
    private readonly gameState: GameStateStore,
    private readonly logger: LoggingService
  ) {}

  /** Build a SolarSystemSnapshot from the current runtime state. */
  captureCurrentSnapshot(engine?: GameEngine | null): SolarSystemSnapshot | null {
    const resolvedEngine = engine ?? this.gameInitializer.getGameEngine();
    if (!resolvedEngine) {
      this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime serializer requires an active GameEngine instance');
      return null;
    }

    try {
      const snapshot = SolarSystemSerializer.fromState({
        sun: this.captureSun(),
        planets: this.capturePlanets(),
        clusters: this.captureClusters(resolvedEngine),
        portals: this.capturePortals(),
        planetDebris: this.capturePlanetDebris(resolvedEngine)
      });
      const meta = this.buildMeta(resolvedEngine, snapshot);
      if (meta) {
        snapshot.meta = { ...(snapshot.meta || {}), ...meta };
      }
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime snapshot captured', {
        planets: snapshot.planets.length,
        portals: snapshot.portals?.length || 0,
        clusters: snapshot.clusters?.length || 0
      });
      return snapshot;
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime snapshot capture failed', { error });
      return null;
    }
  }

  /** Capture and persist the current system under the provided label. */
  saveWithLabel(label: string, engine?: GameEngine | null): SolarSystemSnapshot | null {
    const trimmedLabel = label?.trim();
    if (!trimmedLabel) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime snapshot save skipped: empty label');
      return null;
    }
    const snapshot = this.captureCurrentSnapshot(engine);
    if (!snapshot) {
      return null;
    }
    const cloned = JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
    cloned.meta = { ...(cloned.meta || {}), snapshotLabel: trimmedLabel };
    this.portalPersistence.save(trimmedLabel, cloned);
    this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Runtime snapshot saved', {
      label: trimmedLabel,
      id: cloned.id,
      planets: cloned.planets.length,
      portals: cloned.portals?.length || 0
    });
    return cloned;
  }

  private captureSun(): RuntimeSunState | null {
    const sun = this.gameState.sun;
    if (!sun) {
      return null;
    }
    return {
      id: sun.id,
      name: (sun as any).customName,
      position: this.cloneVec(sun.position) ?? { x: 0, y: 0, z: 0 },
      scale: this.cloneVec((sun as any).scale),
      radius: typeof (sun as any).radius === 'number' ? (sun as any).radius : undefined
    };
  }

  private capturePlanets(): RuntimePlanetState[] {
    return this.gameState.planets.map((planet: any) => ({
      id: planet.id,
      customName: planet.customName,
      position: this.cloneVec(planet.position) ?? { x: 0, y: 0, z: 0 },
      scale: this.cloneVec(planet.scale),
      radius: typeof planet.radius === 'number' ? planet.radius : (planet.scale?.x ?? undefined),
      planetType: planet.planetType,
      baseColorName: planet.baseColorName,
      probabilityOfLifePct: planet.probabilityOfLifePct,
      orbitCenter: this.cloneVec(planet.orbitCenter),
      semiMajor: planet.semiMajor,
      semiMinor: planet.semiMinor,
      orbitOrientation: planet.orbitOrientation,
      orbitAngle: planet.orbitAngle,
      orbitAngularSpeed: planet.orbitAngularSpeed,
      orbitNormal: this.cloneVec(planet.orbitNormal),
      orbitU: this.cloneVec(planet.orbitU),
      inhabitants: planet.inhabitants,
      lesserBeing: planet.lesserBeing,
      visited: planet.visited,
      lifeScanned: planet.lifeScanned,
      creatureScanned: planet.creatureScanned,
      hasArtifact: planet.hasArtifact,
      artifactIntelStatus: planet.artifactIntelStatus,
      hasVoidMass: planet.hasVoidMass,
      voidMassCapacity: planet.voidMassCapacity,
      voidMassRemaining: planet.voidMassRemaining,
      voidMassIntelStatus: planet.voidMassIntelStatus,
      civilizationIntelStatus: planet.civilizationIntelStatus,
      lesserBeingIntelStatus: planet.lesserBeingIntelStatus,
      pendingMission: planet.pendingMission ? { ...planet.pendingMission } : null,
      resourceStock: planet.resourceStock ? { ...planet.resourceStock } : undefined,
      animosity: planet.animosity
    }));
  }

  private captureClusters(engine: GameEngine): RuntimeClusterState[] {
    const svc: any = (engine as any).asteroidClusterService;
    if (!svc?.getClusters) {
      return [];
    }
    const clusters = svc.getClusters();
    if (!Array.isArray(clusters)) {
      return [];
    }
    return clusters.map((cluster: any) => ({
      id: cluster.id,
      center: this.cloneVec(cluster.center) ?? { x: 0, y: 0, z: 0 },
      direction: this.cloneVec(cluster.direction) ?? { x: 0, y: 0, z: 1 },
      speed: typeof cluster.speed === 'number' ? cluster.speed : 0,
      count: Array.isArray(cluster.objects) ? cluster.objects.length : (cluster.count ?? 0),
      includeSuper: cluster.includeSuper,
      radius: cluster.radius,
      centerSpeedFactor: cluster.centerSpeedFactor
    }));
  }

  private capturePortals(): RuntimePortalState[] {
    return this.gameState.portals.map((portal: any) => ({
      id: portal.id,
      position: this.cloneVec(portal.position) ?? { x: 0, y: 0, z: 0 },
      radius: typeof portal.radius === 'number' ? portal.radius : 100,
      linkedPortalId: portal.linkedPortalId,
      eyeState: this.cloneEyeState(portal.eyeState),
      animosity: portal.animosity,
      concordSealActive: portal.concordSealActive,
      concordSealActivatedAt: portal.concordSealActivatedAt,
      preventsLesserIncursions: portal.preventsLesserIncursions
    }));
  }

  private capturePlanetDebris(engine: GameEngine): RuntimeDebrisState[] {
    const debrisMap: Map<string, Array<{ obj: any; local: { x: number; y: number; z: number } }>> | undefined = (engine as any).planetDebris;
    if (!debrisMap || typeof debrisMap.entries !== 'function') {
      return [];
    }
    const debris: RuntimeDebrisState[] = [];
    for (const [planetId, items] of debrisMap.entries()) {
      if (!Array.isArray(items)) {
        continue;
      }
      for (const item of items) {
        if (!item?.obj) {
          continue;
        }
        debris.push({
          id: item.obj.id,
          planetId,
          localOffset: this.cloneVec(item.local) ?? { x: 0, y: 0, z: 0 },
          size: item.obj.scale?.x,
          type: (item.obj as any).type ?? 'mega'
        });
      }
    }
    return debris;
  }

  private buildMeta(engine: GameEngine, snapshot: SolarSystemSnapshot): Record<string, any> | undefined {
    const engineAny: any = engine as any;
    const currentSnapshot = engineAny?.currentSnapshot ?? null;
    const meta: Record<string, any> = currentSnapshot?.meta ? { ...currentSnapshot.meta } : {};
    const sourceId = currentSnapshot?.id ?? snapshot.id ?? null;
    const persistentKey = typeof engineAny?.getPersistentSystemKey === 'function'
      ? engineAny.getPersistentSystemKey(currentSnapshot)
      : currentSnapshot?.meta?.proceduralSystemId
        ?? currentSnapshot?.meta?.sourceSystemId
        ?? currentSnapshot?.meta?.snapshotLabel
        ?? currentSnapshot?.id
        ?? snapshot.id
        ?? null;

    if (typeof currentSnapshot?.meta?.handcrafted === 'boolean') {
      meta['handcrafted'] = currentSnapshot.meta.handcrafted;
    }
    if (persistentKey) {
      meta['proceduralSystemId'] = persistentKey;
      meta['persistentSystemId'] = persistentKey;
    } else if (sourceId) {
      meta['proceduralSystemId'] = sourceId;
    }

    meta['lastRuntimeCaptureAt'] = Date.now();
    if (sourceId) {
      meta['sourceSystemId'] = sourceId;
    }
    const lesserKey = persistentKey ?? sourceId;
    if (lesserKey) {
      const lesser = this.gameState.getLesserBeingSnapshots(lesserKey);
      if (lesser.length) {
        meta['lesserBeingMemory'] = lesser;
      } else if (meta['lesserBeingMemory']) {
        delete meta['lesserBeingMemory'];
      }
    }

    if (typeof engine.getCurrentSystemElderGod === 'function') {
      meta['elderGod'] = engine.getCurrentSystemElderGod();
    }

    return Object.keys(meta).length ? meta : undefined;
  }

  private cloneVec(vec: { x: number; y: number; z: number } | null | undefined): { x: number; y: number; z: number } | undefined {
    if (!vec) {
      return undefined;
    }
    return { x: Number(vec.x) || 0, y: Number(vec.y) || 0, z: Number(vec.z) || 0 };
  }

  private cloneEyeState(eyeState: any): RuntimePortalState['eyeState'] {
    if (!eyeState) {
      return undefined;
    }
    const gazeTarget = typeof eyeState.gazeTarget === 'string'
      ? eyeState.gazeTarget
      : this.cloneVec(eyeState.gazeTarget) ?? undefined;
    return {
      gazeTarget,
      eyelidOpen: eyeState.eyelidOpen,
      intensity: eyeState.intensity
    };
  }
}
