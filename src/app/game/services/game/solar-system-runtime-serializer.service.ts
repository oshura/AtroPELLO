import { Injectable } from '@angular/core';
import { EyeState, PlanetSnapshot, SolarSystemSnapshot } from '../../types/solar-system.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { PortalPersistenceService } from './portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { GameEngine } from '../../GameEngine';
import { SolarSystemSerializer } from './solar-system-serializer';
import { capturePlanetSnapshot, isSunInstance } from './planet-state.codec';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';

interface RuntimeSunState {
  id: string;
  name?: string;
  position: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  radius?: number;
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
        planets: [],
        // Capturados por el códec (fuente única de campos persistentes de planeta).
        planetSnapshots: this.capturePlanets(),
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

  private capturePlanets(): PlanetSnapshot[] {
    // El sol vive dentro de gameState.planets (deuda F4): se excluye aquí porque ya se
    // captura por separado en captureSun(); de lo contrario se duplicaría al re-aplicar.
    return this.gameState.planets
      .filter(planet => !isSunInstance(planet))
      .map(planet => capturePlanetSnapshot(planet));
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
