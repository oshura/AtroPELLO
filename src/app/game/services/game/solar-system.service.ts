import { Injectable } from '@angular/core';
import { SystemGeneratorService } from './system-generator.service';
import { SolarSystemSerializer } from './solar-system-serializer';
import { GenerationOptions, RNGSeed, SolarSystemSnapshot, PortalSnapshot } from '../../types/solar-system.types';
import { GameEngine } from '../../GameEngine';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';
import { Vector3 } from '../../../types/game.types';
import {
  Sun, Planet, DwarfPlanet, Protoplanet,
  RingedPlanet, GaseousPlanet, GiantPlanet, Portal
} from '../../game-objects';
import { TargetType } from '../../types/targeting.types';

/**
 * SolarSystemService: orchestrates snapshot capture, application, and procedural generation,
 * including portal pairing metadata. This is a skeleton; actual object instantiation and
 * cleanup logic must be wired to the GameEngine / factories.
 */
@Injectable({ providedIn: 'root' })
export class SolarSystemService {
  constructor(private generator: SystemGeneratorService) {}

  /** Capture current system into a snapshot via serializer. */
  snapshot(state: Parameters<typeof SolarSystemSerializer.fromState>[0]): SolarSystemSnapshot {
    try {
      const snap = SolarSystemSerializer.fromState(state);
      GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'SolarSystem snapshot captured', { id: snap.id, planetCount: snap.planets.length, clusterCount: snap.clusters?.length || 0 });
      return snap;
    } catch (err) {
      GameLogger.error(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot failed', { err });
      throw err;
    }
  }

  /** Generate a new procedural system snapshot using the generator with optional seed/options. */
  generate(seed?: RNGSeed, options?: GenerationOptions): SolarSystemSnapshot {
    const resolvedSeed = seed ?? Date.now();
    const snap = this.generator.generate(resolvedSeed, options);
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Procedural system generated', { seed: snap.seed, planets: snap.planets.length });
    return snap;
  }

  /** Proxy unique planet name generator for engine run-time usage. */
  public generateUniquePlanetName(): string {
    try { return this.generator.generateUniquePlanetName(); } catch { return 'Unnamed'; }
  }

  /** Apply a snapshot: clears current system objects and instantiates new ones; returns portal info created. */
  apply(snapshot: SolarSystemSnapshot, engine: GameEngine): { portalsCreated: PortalSnapshot[] } {
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Applying solar system snapshot', { id: snapshot.id, planets: snapshot.planets.length, clusters: snapshot.clusters?.length || 0 });

    // Register names present in this snapshot so future generated systems don't reuse them
    try { this.generator.registerUsedNamesFromSnapshot?.(snapshot); } catch {}

    const gl: WebGL2RenderingContext | null = engine.gl || null;
    const logger = engine.logger;
    const targetCatalog = engine.targetCatalog;
    const clustersSvc = engine.asteroidClusterService;

    // --- Phase 1: Cleanup existing world objects (preserve existing persistent portals) ---
    try {
      // Clear clusters
      clustersSvc?.clearAll?.();
      // Clear planet debris map
      engine.planetDebris?.clear?.();
      // Reset planets and sun
      engine.gameState.planets.length = 0;
      engine.gameState.sun = null;
      // Reset target catalog buckets
      targetCatalog?.register?.(TargetType.ASTEROID, []);
      targetCatalog?.register?.(TargetType.SUPER_ASTEROID, []);
      targetCatalog?.register?.(TargetType.CLUSTER, []);
      targetCatalog?.register?.(TargetType.PLANET, []);
      // Do not clear PORTAL bucket; portals are persistent between systems
    } catch {}

    // --- Phase 2: Instantiate Sun & Planets ---
    const planetsArr: Planet[] = [];
    try {
      const s = snapshot.sun;
      const sun = new Sun(s.id, s.radius, { ...s.position });
      sun.customName = s.name || sun.customName;
      if (gl && !sun.vertexBuffer) sun.initBuffers(gl);
      planetsArr.push(sun as unknown as Planet);
      engine.gameState.sun = sun;
    } catch (e) {
      GameLogger.error(LogCategory.SOLAR_SYSTEM_GENERATION, 'Sun instantiation failed', { e });
    }

    const pickColor = (kind?: string): any => {
      const k = String(kind || '').toLowerCase();
      if (k === 'ringed') return 'gris';
      if (k === 'gaseous') return 'azul_hielo';
      if (k === 'giant') return 'marron';
      if (k === 'dwarf') return 'gris';
      if (k === 'protoplanet') return 'marron';
      return 'marron';
    };
    for (const p of snapshot.planets) {
      try {
        const kind = String(p.kind || '').toLowerCase();
        const color: any = p.baseColorName || pickColor(kind);
        const pos = { ...p.position };
        const radius = p.radius;
        let obj: Planet;
        switch (kind) {
          case 'ringed': obj = new RingedPlanet(p.id, color, radius, pos); break;
          case 'gaseous': obj = new GaseousPlanet(p.id, color, radius, pos); break;
          case 'giant': obj = new GiantPlanet(p.id, color, radius, pos); break;
          case 'dwarf': obj = new DwarfPlanet(p.id, color, radius, pos); break;
          case 'protoplanet': obj = new Protoplanet(p.id, color, radius, pos); break;
          default: obj = new Planet(p.id, color, radius, pos); break;
        }
        // Naming and life hints
        if (p.name) (obj as any).customName = p.name;
        if (typeof p.probabilityOfLifePct === 'number') (obj as any).probabilityOfLifePct = p.probabilityOfLifePct;
        // Orbit setup
        if (p.orbit) {
          obj.orbitCenter = { ...(p.orbit.center || { x: 0, y: 0, z: 0 }) } as any;
          obj.semiMajor = p.orbit.semiMajor;
          obj.semiMinor = p.orbit.semiMinor;
          obj.orbitOrientation = p.orbit.orientation || 0;
          obj.orbitAngle = p.orbit.angle || 0;
          obj.orbitAngularSpeed = p.orbit.angularSpeed || obj.orbitAngularSpeed;
          // Provide defaults for general 3D orbit plane if missing
          (obj as any).orbitNormal = { ...(p.orbit.normal || { x: 0, y: 1, z: 0 }) };
          (obj as any).orbitU = { ...(p.orbit.u || { x: 1, y: 0, z: 0 }) };
        }
        // Init GL buffers
        if (gl && !obj.vertexBuffer) obj.initBuffers(gl);
        planetsArr.push(obj);
      } catch (e) {
        GameLogger.error(LogCategory.SOLAR_SYSTEM_GENERATION, 'Planet instantiation failed', { id: p.id, e });
      }
    }
    // Attach to engine and register planets in target catalog
    engine.gameState.planets.length = 0;
    engine.gameState.planets.push(...planetsArr);
    try { targetCatalog?.register?.(TargetType.PLANET, planetsArr as any); } catch {}

    // --- Phase 3: Clusters ---
    const createdClusters: any[] = [];
    const normals: any[] = [];
    const supers: any[] = [];
    try {
      for (const c of (snapshot.clusters || [])) {
        const inst = clustersSvc?.createCluster?.({
          id: c.id,
          center: { ...c.center },
          direction: { ...c.direction },
          speed: c.speed,
          count: c.count,
          includeSuper: c.includeSuper,
          radius: c.radius,
          centerSpeedFactor: c.centerSpeedFactor,
        });
        if (!inst) continue;
        createdClusters.push(inst);
        // Init buffers for cluster objects
        if (gl) {
          for (const o of inst.objects) { if (!o.vertexBuffer) o.initBuffers(gl); }
        }
        // Bucketize for target catalog
        for (const o of inst.objects) {
          const name = (o as any)?.constructor?.name;
          if (name === 'SuperAsteroid') supers.push(o as any); else normals.push(o as any);
        }
      }
      // Register buckets
      targetCatalog?.register?.(TargetType.ASTEROID, normals);
      targetCatalog?.register?.(TargetType.SUPER_ASTEROID, supers);
      targetCatalog?.register?.(TargetType.CLUSTER, []);
    } catch (e) {
      GameLogger.warn(LogCategory.SOLAR_SYSTEM_GENERATION, 'Cluster instantiation issues', { e });
    }

    // --- Phase 4: Portals ---
    const createdPortals: PortalSnapshot[] = [];
    try {
      const portalsArr: Portal[] = engine.gameState.portals || [];
      for (const p of (snapshot.portals || [])) {
        const portal = new Portal(p.id, { ...p.position }, p.radius, logger);
        portal.linkedPortalId = p.linkedPortalId;
        portal.applyEyeState(p.eyeState);
        if (gl && !portal.vertexBuffer) portal.initBuffers(gl);
        portalsArr.push(portal);
        targetCatalog?.add?.(TargetType.PORTAL, portal as any);
        createdPortals.push(p);
        GameLogger.info(LogCategory.PORTAL, 'Portal instantiated', { id: p.id, linked: p.linkedPortalId });
      }
      engine.gameState.portals.length = 0;
      engine.gameState.portals.push(...portalsArr);
    } catch (e) {
      GameLogger.warn(LogCategory.PORTAL, 'Portal instantiation issues', { e });
    }

    // --- Phase 5: Finalization ---
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'System apply complete', { planets: planetsArr.length, clusters: createdClusters.length, portals: createdPortals.length });
    return { portalsCreated: createdPortals };
  }

  /** Utility to create a paired destination portal snapshot given an origin portal. */
  createPairedPortal(origin: PortalSnapshot, offset: Vector3): PortalSnapshot {
    const dest: PortalSnapshot = {
      id: `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      position: { x: origin.position.x + offset.x, y: origin.position.y + offset.y, z: origin.position.z + offset.z },
      radius: origin.radius,
      linkedPortalId: origin.id,
      eyeState: { gazeTarget: 'ship', eyelidOpen: 1, intensity: 1 }
    };
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Created paired portal snapshot', { origin: origin.id, dest: dest.id });
    return dest;
  }

  /** Convenience: generate a system and append a destination portal snapshot linked to origin. */
  generateWithLinkedPortal(originPortal: PortalSnapshot, seed?: RNGSeed, options?: GenerationOptions): SolarSystemSnapshot {
    const snap = this.generate(seed, options);
    const portalOffset: Vector3 = { x: 0, y: 0, z: 1000 }; // spawn ~1000u away along +Z (placeholder)
    const destPortal = this.createPairedPortal(originPortal, portalOffset);
    snap.portals = (snap.portals || []).concat(destPortal);
    GameLogger.debug(LogCategory.SOLAR_SYSTEM_GENERATION, 'Appended destination portal to snapshot', { portalId: destPortal.id });
    return snap;
  }
}
