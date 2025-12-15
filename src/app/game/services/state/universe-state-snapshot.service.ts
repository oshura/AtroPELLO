import { Injectable } from '@angular/core';
import type { GameEngine } from '../../../game/GameEngine';
import { PortalPersistenceService } from '../game/portal-persistence.service';
import { GameStateStore } from '../../../services/game/game-state.store';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { ClusterSnapshot, PortalSnapshot, SolarSystemSnapshot, SunSnapshot, PlanetSnapshot, OrbitParams, EyeState } from '../../types/solar-system.types';
import {
  GameStartContext,
  HealthSnapshot,
  PlayerResetState,
  RuntimeSolarSystemState,
  RuntimeStateSource,
  SerializedGameObjectState,
  SerializedLesserBeingState,
  SerializedPortalState,
  SerializedUniversePayload
} from '../../types/universe-state.types';
import { RespawnAnchorMetadata, OrientationSnapshot } from '../../types/respawn.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { Vector3 } from '../../../types/game.types';
import { LesserBeing, LesserBeingInstanceSnapshot } from '../../types/cosmic-life.types';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { Planet } from '../../game-objects/Planet';
import { Sun } from '../../game-objects/Sun';
import { Portal } from '../../game-objects/Portal';

const PLANET_TYPES = new Set<GameObjectType>([
  GameObjectType.PLANET,
  GameObjectType.DWARF_PLANET,
  GameObjectType.PROTOPLANET,
  GameObjectType.GIANT_PLANET,
  GameObjectType.GASEOUS_PLANET,
  GameObjectType.RINGED_PLANET,
  GameObjectType.EARTH_SPLIT_PLANET
]);

export interface EnsureSystemStateOptions {
  snapshot?: SolarSystemSnapshot | null;
  snapshotId?: string | null;
  snapshotLabel?: string | null;
  reason?: string;
}

export interface ReplaceRuntimePayloadOptions {
  systemId: string;
  payload: SerializedUniversePayload;
  snapshotId?: string | null;
  snapshotLabel?: string | null;
  reason?: string;
}

@Injectable({ providedIn: 'root' })
export class UniverseStateSnapshotService {
  constructor(
    private readonly gameInitializer: GameInitializer,
    private readonly gameState: GameStateStore,
    private readonly portalPersistence: PortalPersistenceService,
    private readonly logger: LoggingService
  ) {}

  private get engine(): GameEngine {
    const engine = this.gameInitializer.getGameEngine();
    if (!engine) {
      throw new Error('GameEngine not initialized');
    }
    return engine;
  }

  /** Returns a RuntimeSolarSystemState describing the system currently loaded in memory. */
  public captureRuntimeState(systemId?: string): RuntimeSolarSystemState {
    const resolvedSystemId = systemId ?? this.getCurrentSystemId() ?? 'unknown-system';
    const payload = this.captureLivePayload(resolvedSystemId);
    return {
      systemId: resolvedSystemId,
      snapshotId: this.getCurrentSnapshotId(),
      source: RuntimeStateSource.LIVE,
      capturedAt: Date.now(),
      payload
    };
  }

  /** Builds a runtime descriptor directly from an embedded serialized payload (fallback path). */
  public buildRuntimeStateFromPayload(
    systemId: string,
    payload: SerializedUniversePayload,
    snapshotId?: string | null,
    reason?: string
  ): RuntimeSolarSystemState {
    if (!payload) {
      throw new Error('Serialized universe payload is empty.');
    }
    this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Using embedded universe payload for runtime state', {
      systemId,
      snapshotId: snapshotId ?? null,
      reason
    });
    return {
      systemId,
      snapshotId: snapshotId ?? null,
      source: RuntimeStateSource.SNAPSHOT,
      capturedAt: Date.now(),
      payload
    };
  }

  /** Replaces the active runtime by synthesizing a snapshot from a serialized payload. */
  public replaceRuntimeWithPayload(options: ReplaceRuntimePayloadOptions): RuntimeSolarSystemState {
    if (!options.payload || !Array.isArray(options.payload.objects)) {
      throw new Error('Cannot rehydrate runtime because the payload is empty.');
    }
    const snapshotId = options.snapshotId?.trim() || `${options.systemId}-rehydrated-${Date.now()}`;
    const snapshotLabel = this.normalizeSnapshotLabel(options.snapshotLabel, options.systemId);
    const syntheticSnapshot = this.buildSnapshotFromPayload({
      systemId: options.systemId,
      payload: options.payload,
      snapshotId,
      snapshotLabel
    });
    this.portalPersistence.save(snapshotLabel, syntheticSnapshot);
    this.portalPersistence.pin(snapshotLabel);
    const applied = this.applySnapshot(syntheticSnapshot, options.reason ?? 'payload-rehydrate');
    if (applied) {
      return applied;
    }
    return this.buildRuntimeStateFromPayload(
      options.systemId,
      options.payload,
      snapshotId,
      `${options.reason ?? 'payload-rehydrate'}:fallback`
    );
  }

  public pinSnapshotLabel(label: string | null | undefined): void {
    this.portalPersistence.pin(label);
  }

  public unpinSnapshotLabel(label: string | null | undefined): void {
    this.portalPersistence.unpin(label);
  }

  /** Ensure that the requested systemId is loaded; reuse live state when already active. */
  public ensureSystemState(systemId: string, options?: EnsureSystemStateOptions): RuntimeSolarSystemState {
    const requestedSnapshot = this.resolveSnapshotFromOptions(options);
    if (requestedSnapshot) {
      const appliedState = this.applySnapshot(requestedSnapshot, options?.reason ?? 'ensureSystemState');
      if (appliedState) {
        return appliedState;
      }
      return {
        systemId,
        snapshotId: requestedSnapshot.id ?? requestedSnapshot.meta?.['proceduralSystemId'] ?? null,
        source: RuntimeStateSource.SNAPSHOT,
        capturedAt: Date.now(),
        payload: null
      };
    }

    const currentId = this.getCurrentSystemId();
    if (currentId && currentId === systemId) {
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Universe state reused live store', { systemId });
      return {
        systemId,
        snapshotId: this.getCurrentSnapshotId(),
        source: RuntimeStateSource.LIVE,
        capturedAt: Date.now(),
        payload: null
      };
    }

    this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Unable to resolve snapshot for system', {
      requestedSystemId: systemId,
      snapshotId: options?.snapshotId,
      label: options?.snapshotLabel,
      reason: options?.reason
    });
    return {
      systemId,
      snapshotId: null,
      source: RuntimeStateSource.LIVE,
      capturedAt: Date.now(),
      payload: null
    };
  }

  /** Expose current system id for services needing fallback anchors. */
  public getActiveSystemId(): string | null {
    return this.getCurrentSystemId();
  }

  /** Expose current snapshot id when available. */
  public getActiveSnapshotId(): string | null {
    return this.getCurrentSnapshotId();
  }

  /** Builds a restart context combining runtime state and player reset data. */
  public buildRestartContext(params: {
    targetSystemId: string;
    playerState: PlayerResetState;
    respawnAnchor?: RespawnAnchorMetadata | null;
    reason: GameStartContext['restartReason'];
    snapshotOptions?: EnsureSystemStateOptions;
  }): GameStartContext {
    const runtimeState = this.ensureSystemState(params.targetSystemId, params.snapshotOptions);
    return {
      targetSystemId: params.targetSystemId,
      runtimeState,
      playerState: params.playerState,
      respawnAnchor: params.respawnAnchor ?? null,
      restartReason: params.reason
    };
  }

  private captureLivePayload(systemId: string): SerializedUniversePayload {
    return {
      objects: this.captureGameObjects(),
      portals: this.capturePortals(),
      lesserBeings: this.captureLesserBeings(systemId),
      environment: { ambientScene: (this.engine as any)?.audio?.currentScene ?? null }
    };
  }

  private captureGameObjects(): SerializedGameObjectState[] {
    const objects = this.gameState.getAllObjects();
    return objects.map(obj => this.serializeGameObject(obj));
  }

  private capturePortals(): SerializedPortalState[] {
    return this.gameState.portals.map(portal => ({
      id: portal.id,
      position: { ...portal.position },
      linkedPortalId: portal.linkedPortalId,
      radius: portal.radius,
      custom: this.removeUndefined({
        animosity: portal.animosity,
        concordSealActive: portal.concordSealActive ?? false,
        concordSealActivatedAt: portal.concordSealActivatedAt || undefined,
        preventsLesserIncursions: portal.preventsLesserIncursions || undefined,
        eyeState: this.cloneEyeState(portal.eyeState),
        planetColorRef: portal.planetColorRef ? { ...portal.planetColorRef } : undefined
      })
    }));
  }

  private captureLesserBeings(systemId: string): SerializedLesserBeingState[] {
    const snapshots: LesserBeingInstanceSnapshot[] = this.gameState.getLesserBeingSnapshots(systemId);
    return snapshots.map(s => ({
      id: s.id,
      archetype: s.type,
      position: { ...s.position },
      velocity: s.velocity ? { ...s.velocity } : null,
      custom: this.cloneLesserBeingCustom(s)
    }));
  }

  private cloneLesserBeingCustom(snapshot: LesserBeingInstanceSnapshot): Record<string, any> | null {
    const payload: Record<string, any> = {};
    if (snapshot.forward) {
      payload['forward'] = { ...snapshot.forward };
    }
    if (snapshot.hasLanded !== undefined) {
      payload['hasLanded'] = snapshot.hasLanded;
    }
    if (snapshot.landedPlanetId) {
      payload['landedPlanetId'] = snapshot.landedPlanetId;
    }
    if (snapshot.health) {
      payload['health'] = { ...snapshot.health };
    }
    if (snapshot.metadata) {
      payload['metadata'] = { ...snapshot.metadata };
    }
    return Object.keys(payload).length ? payload : null;
  }

  private serializeGameObject(obj: GameObject): SerializedGameObjectState {
    const position = { ...obj.position };
    const velocity = obj.velocity ? { ...obj.velocity } : undefined;
    const scale = obj.scale ? { ...obj.scale } : undefined;
    const serialized: SerializedGameObjectState = {
      id: obj.id,
      type: typeof obj.getType === 'function' ? obj.getType() : GameObjectType.UNKNOWN,
      position,
      velocity,
      scale,
      orientation: this.captureOrientation(obj),
      health: this.captureHealth(obj),
      custom: undefined
    };

    const custom = this.buildCustomMetadata(obj);
    if (custom) {
      serialized.custom = custom;
    }
    return serialized;
  }

  private buildCustomMetadata(obj: GameObject): Record<string, any> | undefined {
    if (obj instanceof Sun || obj instanceof Planet) {
      return this.buildPlanetMetadata(obj);
    }
    if (obj instanceof Portal) {
      return this.removeUndefined({
        animosity: obj.animosity,
        concordSealActive: obj.concordSealActive ?? false,
        concordSealActivatedAt: obj.concordSealActivatedAt || undefined,
        preventsLesserIncursions: obj.preventsLesserIncursions || undefined,
        eyeState: this.cloneEyeState(obj.eyeState)
      });
    }
    if (obj.animosity) {
      return { animosity: obj.animosity };
    }
    return undefined;
  }

  private buildPlanetMetadata(planet: Planet | Sun): Record<string, any> | undefined {
    const metadata = {
      name: planet.customName ?? planet.getDisplayName?.() ?? planet.id,
      customName: planet.customName ?? undefined,
      planetType: planet.planetType,
      baseColorName: planet.baseColorName,
      probabilityOfLifePct: planet.probabilityOfLifePct,
      inhabitants: planet.inhabitants,
      lesserBeing: planet.lesserBeing ?? null,
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
      pendingMission: planet.pendingMission ? this.cloneJsonValue(planet.pendingMission) : undefined,
      resourceStock: planet.resourceStock ? this.cloneJsonValue(planet.resourceStock) : undefined,
      orbit: this.cloneOrbitParamsFromPlanet(planet),
      axialTiltRad: planet.axialTiltRad,
      initialRadius: planet.initialRadius,
      animosity: planet.animosity
    };
    return this.removeUndefined(metadata);
  }

  private captureOrientation(obj: GameObject): OrientationSnapshot | null {
    const asAny = obj as any;
    if (typeof asAny.getOrientationQuaternion === 'function') {
      const quatValue = asAny.getOrientationQuaternion();
      const matrixValue = asAny.getOrientationMatrix?.();
      return {
        quaternion: Array.isArray(quatValue) ? (quatValue as [number, number, number, number]) : undefined,
        matrix: Array.isArray(matrixValue) ? (matrixValue as number[]) : undefined,
        forward: this.cloneVec(asAny.forwardVector),
        up: this.cloneVec(asAny.upVector)
      };
    }
    return null;
  }

  private captureHealth(obj: GameObject): HealthSnapshot | null {
    const current = (obj as any)?.healthCurrent;
    const max = (obj as any)?.healthMax;
    if (typeof current === 'number' && typeof max === 'number') {
      return { current, max };
    }
    return null;
  }

  private applySnapshot(snapshot: SolarSystemSnapshot, reason: string): RuntimeSolarSystemState | null {
    try {
      const applied = this.engine.applySolarSystemSnapshot(snapshot);
      this.logger.log(LogLevel.INFO, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot applied via universe state service', {
        reason,
        systemId: this.resolveSystemIdFromSnapshot(snapshot),
        portalsCreated: applied?.portalsCreated?.length || 0
      });
      return {
        systemId: this.resolveSystemIdFromSnapshot(snapshot) || 'unknown-system',
        snapshotId: snapshot.id ?? snapshot.meta?.['proceduralSystemId'] ?? null,
        source: RuntimeStateSource.SNAPSHOT,
        capturedAt: Date.now(),
        payload: null
      };
    } catch (error) {
      this.logger.log(LogLevel.ERROR, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot application failed', { error });
      return null;
    }
  }

  private resolveSnapshotByLabel(label?: string | null): SolarSystemSnapshot | null {
    if (!label) return null;
    if (typeof this.portalPersistence.get !== 'function') return null;
    try {
      const snapshot = this.portalPersistence.get(label);
      return snapshot ? this.cloneSnapshot(snapshot) : null;
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to resolve snapshot by label', { label, error });
      return null;
    }
  }

  private resolveSnapshotById(snapshotId?: string | null): SolarSystemSnapshot | null {
    if (!snapshotId) return null;
    try {
      const entries = this.portalPersistence.list();
      for (const entry of entries) {
        const candidate = this.portalPersistence.get(entry.label);
        if (!candidate) continue;
        const idMatches = candidate.id === snapshotId || candidate.meta?.['proceduralSystemId'] === snapshotId;
        if (idMatches) {
          return this.cloneSnapshot(candidate);
        }
      }
    } catch (error) {
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to iterate portal snapshots', { error });
    }
    return null;
  }

  private getCurrentSystemId(): string | null {
    const snapshot = this.getCurrentSnapshot();
    return snapshot ? this.resolveSystemIdFromSnapshot(snapshot) : null;
  }

  private getCurrentSnapshotId(): string | null {
    const snapshot = this.getCurrentSnapshot();
    if (!snapshot) return null;
    return snapshot.id ?? snapshot.meta?.['proceduralSystemId'] ?? snapshot.meta?.['systemId'] ?? null;
  }

  private getCurrentSnapshot(): SolarSystemSnapshot | null {
    const snapshot = (this.engine as any)?.currentSnapshot;
    return snapshot ?? null;
  }

  private resolveSystemIdFromSnapshot(snapshot: SolarSystemSnapshot | null): string | null {
    if (!snapshot) return null;
    return snapshot.meta?.['proceduralSystemId']
      || snapshot.meta?.['systemId']
      || snapshot.id
      || null;
  }

  private cloneSnapshot(snapshot: SolarSystemSnapshot): SolarSystemSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
  }

  private resolveSnapshotFromOptions(options?: EnsureSystemStateOptions): SolarSystemSnapshot | null {
    if (!options) {
      return null;
    }
    if (options.snapshot) {
      return this.cloneSnapshot(options.snapshot);
    }
    if (options.snapshotLabel) {
      const snapshot = this.resolveSnapshotByLabel(options.snapshotLabel);
      if (snapshot) {
        return snapshot;
      }
      // If we're currently inside the requested system, refresh the label before giving up
      const engineSnapshot = this.getCurrentSnapshot();
      if (engineSnapshot && (engineSnapshot.meta?.['snapshotLabel'] === options.snapshotLabel)) {
        try {
          const refreshed = this.gameInitializer.getGameEngine()?.runtimeSerializer?.saveWithLabel(options.snapshotLabel, this.gameInitializer.getGameEngine());
          if (refreshed) {
            return JSON.parse(JSON.stringify(refreshed)) as SolarSystemSnapshot;
          }
        } catch (error) {
          this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Failed to refresh missing snapshot label', {
            label: options.snapshotLabel,
            error
          });
        }
      }
      this.logger.log(LogLevel.WARN, LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot label not found in persistence', {
        label: options.snapshotLabel,
        reason: options.reason
      });
    }
    if (options.snapshotId) {
      return this.resolveSnapshotById(options.snapshotId);
    }
    return null;
  }

  private buildSnapshotFromPayload(params: {
    systemId: string;
    payload: SerializedUniversePayload;
    snapshotId: string;
    snapshotLabel: string;
  }): SolarSystemSnapshot {
    const objects = Array.isArray(params.payload.objects) ? params.payload.objects : [];
    const sun = this.extractSunSnapshot(objects, params.systemId);
    const planets = this.extractPlanetSnapshots(objects);
    const clusters = this.extractClusterSnapshots(objects);
    const portals = this.extractPortalSnapshots(params.payload.portals);
    const lesserBeings = this.extractLesserBeings(params.payload.lesserBeings);
    const meta: Record<string, any> = {
      ...(params.payload.custom ? { ...params.payload.custom } : {}),
      proceduralSystemId: params.systemId,
      systemId: params.systemId,
      persistentSystemId: params.snapshotId,
      snapshotLabel: params.snapshotLabel,
      reconstructedFromPayload: true
    };
    if (params.payload.environment) {
      meta['environment'] = { ...params.payload.environment };
    }
    if (lesserBeings.length) {
      meta['lesserBeingMemory'] = lesserBeings;
    }
    return {
      id: params.snapshotId,
      timestamp: Date.now(),
      sun,
      planets,
      clusters: clusters.length ? clusters : undefined,
      portals: portals.length ? portals : undefined,
      meta
    };
  }

  private extractSunSnapshot(objects: SerializedGameObjectState[], systemId: string): SunSnapshot {
    const sunObject = objects.find(obj => obj.type === GameObjectType.SUN);
    if (sunObject) {
      return {
        id: sunObject.id || `${systemId}-sun`,
        name: typeof sunObject.custom?.['name'] === 'string' ? sunObject.custom['name'] : undefined,
        position: this.cloneVec(sunObject.position) ?? { x: 0, y: 0, z: 0 },
        radius: this.deriveRadius(sunObject, 1200)
      };
    }
    return {
      id: `${systemId}-sun`,
      position: { x: 0, y: 0, z: 0 },
      radius: 1200
    };
  }

  private extractPlanetSnapshots(objects: SerializedGameObjectState[]): PlanetSnapshot[] {
    return objects
      .filter(obj => this.isPlanetType(obj.type))
      .map(obj => {
        const custom = obj.custom ?? {};
        const snapshot: PlanetSnapshot = {
          id: obj.id,
          name: typeof custom['name'] === 'string' ? custom['name'] : obj.id,
          kind: custom['planetType'] ?? obj.type,
          position: this.cloneVec(obj.position) ?? { x: 0, y: 0, z: 0 },
          radius: this.deriveRadius(obj, 250)
        };

        const orbit = this.normalizeOrbitMetadata(custom['orbit']);
        if (orbit) snapshot.orbit = orbit;
        if (typeof custom['baseColorName'] === 'string') snapshot.baseColorName = custom['baseColorName'];
        const probLife = this.parseNumber(custom['probabilityOfLifePct']);
        if (probLife !== undefined) snapshot.probabilityOfLifePct = probLife;
        if (custom['inhabitants']) snapshot.inhabitants = custom['inhabitants'];
        if (custom['lesserBeing'] !== undefined) snapshot.lesserBeing = custom['lesserBeing'];
        const visited = this.parseBoolean(custom['visited']);
        if (visited !== undefined) snapshot.visited = visited;
        const lifeScanned = this.parseBoolean(custom['lifeScanned']);
        if (lifeScanned !== undefined) snapshot.lifeScanned = lifeScanned;
        const creatureScanned = this.parseBoolean(custom['creatureScanned']);
        if (creatureScanned !== undefined) snapshot.creatureScanned = creatureScanned;
        const hasArtifact = this.parseBoolean(custom['hasArtifact']);
        if (hasArtifact !== undefined) snapshot.hasArtifact = hasArtifact;
        if (custom['artifactIntelStatus']) snapshot.artifactIntelStatus = custom['artifactIntelStatus'];
        const hasVoidMass = this.parseBoolean(custom['hasVoidMass']);
        if (hasVoidMass !== undefined) snapshot.hasVoidMass = hasVoidMass;
        const voidCapacity = this.parseNumber(custom['voidMassCapacity']);
        if (voidCapacity !== undefined) snapshot.voidMassCapacity = voidCapacity;
        const voidRemaining = this.parseNumber(custom['voidMassRemaining']);
        if (voidRemaining !== undefined) snapshot.voidMassRemaining = voidRemaining;
        if (custom['voidMassIntelStatus']) snapshot.voidMassIntelStatus = custom['voidMassIntelStatus'];
        if (custom['civilizationIntelStatus']) snapshot.civilizationIntelStatus = custom['civilizationIntelStatus'];
        if (custom['lesserBeingIntelStatus']) snapshot.lesserBeingIntelStatus = custom['lesserBeingIntelStatus'];
        if (custom['pendingMission'] !== undefined) snapshot.pendingMission = this.cloneJsonValue(custom['pendingMission']);
        if (custom['resourceStock']) snapshot.resourceStock = this.cloneJsonValue(custom['resourceStock']);
        if (custom['animosity']) snapshot.animosity = custom['animosity'];
        return snapshot;
      });
  }

  private extractClusterSnapshots(objects: SerializedGameObjectState[]): ClusterSnapshot[] {
    return objects
      .filter(obj => obj.type === GameObjectType.CLUSTER)
      .map(obj => ({
        id: obj.id,
        center: this.cloneVec(obj.position) ?? { x: 0, y: 0, z: 0 },
        direction: this.cloneVec(obj.velocity) ?? { x: 0, y: 1, z: 0 },
        speed: this.deriveVectorMagnitude(obj.velocity),
        count: Math.max(5, Number(obj.custom?.['count']) || 12),
        includeSuper: Boolean(obj.custom?.['includeSuper']),
        radius: typeof obj.custom?.['radius'] === 'number' ? obj.custom['radius'] : undefined
      }));
  }

  private extractPortalSnapshots(serialized?: SerializedPortalState[]): PortalSnapshot[] {
    if (!Array.isArray(serialized) || !serialized.length) {
      return [];
    }
    return serialized.map(portal => ({
      id: portal.id,
      position: this.cloneVec(portal.position) ?? { x: 0, y: 0, z: 0 },
      radius: portal.radius ?? 350,
      linkedPortalId: portal.linkedPortalId ?? undefined,
      eyeState: this.cloneEyeState(portal.custom?.['eyeState']),
      animosity: portal.custom?.['animosity'],
      concordSealActive: portal.custom?.['concordSealActive'],
      concordSealActivatedAt: portal.custom?.['concordSealActivatedAt'],
      preventsLesserIncursions: portal.custom?.['preventsLesserIncursions']
    }));
  }

  private extractLesserBeings(serialized?: SerializedLesserBeingState[]): LesserBeingInstanceSnapshot[] {
    if (!Array.isArray(serialized) || !serialized.length) {
      return [];
    }
    return serialized.map(entry => ({
      id: entry.id,
      type: (entry.archetype as LesserBeing) || LesserBeing.NONE,
      position: this.cloneVec(entry.position) ?? { x: 0, y: 0, z: 0 },
      velocity: this.cloneVec(entry.velocity) ?? undefined,
      forward: this.cloneVec(entry.custom?.['forward']) ?? undefined,
      hasLanded: Boolean(entry.custom?.['hasLanded']),
      landedPlanetId: entry.custom?.['landedPlanetId'] ?? null,
      health: entry.custom?.['health'] ? { ...entry.custom['health'] } : undefined,
      metadata: entry.custom?.['metadata'] ? { ...entry.custom['metadata'] } : undefined
    }));
  }

  private deriveRadius(obj: SerializedGameObjectState, fallback: number): number {
    const scale = obj.scale;
    const components = [scale?.x, scale?.y, scale?.z].filter(value => typeof value === 'number') as number[];
    if (components.length) {
      const avg = components.reduce((sum, value) => sum + value, 0) / components.length;
      return Math.max(1, avg);
    }
    return fallback;
  }

  private deriveVectorMagnitude(vec?: Vector3 | null): number {
    if (!vec) {
      return 0;
    }
    return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
  }

  private normalizeSnapshotLabel(label: string | null | undefined, systemId: string): string {
    if (typeof label === 'string' && label.trim().length) {
      return label.trim();
    }
    return `payload-${systemId}`;
  }

  private isPlanetType(type: GameObjectType): boolean {
    return PLANET_TYPES.has(type);
  }

  private cloneOrbitParamsFromPlanet(planet: Planet | Sun): OrbitParams {
    return {
      center: this.cloneVec(planet.orbitCenter) ?? { x: 0, y: 0, z: 0 },
      semiMajor: planet.semiMajor,
      semiMinor: planet.semiMinor,
      orientation: planet.orbitOrientation,
      angle: planet.orbitAngle,
      angularSpeed: planet.orbitAngularSpeed,
      normal: this.cloneVec(planet.orbitNormal) ?? undefined,
      u: this.cloneVec(planet.orbitU) ?? undefined
    };
  }

  private normalizeOrbitMetadata(raw: any): OrbitParams | undefined {
    if (!raw) {
      return undefined;
    }
    const center = this.cloneVec(raw.center) ?? undefined;
    const semiMajor = this.parseNumber(raw.semiMajor);
    const semiMinor = this.parseNumber(raw.semiMinor) ?? semiMajor;
    const orientation = this.parseNumber(raw.orientation) ?? 0;
    if (!center || semiMajor === undefined || semiMinor === undefined) {
      return undefined;
    }
    const orbit: OrbitParams = {
      center,
      semiMajor,
      semiMinor,
      orientation
    };
    const angle = this.parseNumber(raw.angle);
    if (angle !== undefined) orbit.angle = angle;
    const angularSpeed = this.parseNumber(raw.angularSpeed);
    if (angularSpeed !== undefined) orbit.angularSpeed = angularSpeed;
    const normal = this.cloneVec(raw.normal);
    if (normal) orbit.normal = normal;
    const u = this.cloneVec(raw.u);
    if (u) orbit.u = u;
    return orbit;
  }

  private parseNumber(value: any): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    return value;
  }

  private parseBoolean(value: any): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private removeUndefined(metadata: Record<string, any>): Record<string, any> | undefined {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) {
        continue;
      }
      result[key] = value;
    }
    return Object.keys(result).length ? result : undefined;
  }

  private cloneEyeState(state?: EyeState | null): EyeState | undefined {
    if (!state) {
      return undefined;
    }
    const clone: EyeState = { ...state };
    if (typeof state.gazeTarget === 'object' && state.gazeTarget !== null) {
      clone.gazeTarget = { ...(state.gazeTarget as Vector3) };
    }
    return clone;
  }

  private cloneJsonValue<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  private cloneVec(vec?: Vector3 | null): Vector3 | null {
    if (!vec) return null;
    return { x: vec.x, y: vec.y, z: vec.z };
  }
}
