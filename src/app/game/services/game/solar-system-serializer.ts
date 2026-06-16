import { SolarSystemSnapshot, PlanetSnapshot, PortalSnapshot, SunSnapshot, ClusterSnapshot, PlanetDebrisSnapshot } from '../../types/solar-system.types';
import { Vector3 } from '../../../types/game.types';
import { PlanetIntelStatus, PlanetMissionState, PlanetResourceStock } from '../../types/planet-intel.types';
import { normalizePlanetKind } from './planet-state.codec';

function vec(x:number,y:number,z:number): Vector3 { return { x,y,z }; }

/** Lightweight serializer that builds a snapshot from plain game objects. */
export class SolarSystemSerializer {
  /**
   * Build a snapshot from current world state. Inputs are minimal POJOs exposing the needed fields.
   */
  static fromState(state: {
    sun: { id: string; name?: string; position: Vector3; scale?: Vector3; radius?: number } | null;
    planets: Array<{
      id: string;
      customName?: string;
      position: Vector3;
      scale?: Vector3;
      radius?: number;
      planetType?: string;
      baseColorName?: string;
      probabilityOfLifePct?: number;
      orbitCenter?: Vector3;
      semiMajor?: number;
      semiMinor?: number;
      orbitOrientation?: number;
      orbitAngle?: number;
      orbitAngularSpeed?: number;
      orbitNormal?: Vector3;
      orbitU?: Vector3;
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
    }>;
    clusters?: Array<{
      id: string;
      center: Vector3;
      direction: Vector3;
      speed: number;
      count: number;
      includeSuper?: boolean;
      radius?: number;
      centerSpeedFactor?: number;
    }>;
    portals?: Array<{
      id: string;
      position: Vector3;
      radius: number;
      linkedPortalId?: string;
      eyeState?: any;
      animosity?: string;
      concordSealActive?: boolean;
      concordSealActivatedAt?: number;
      preventsLesserIncursions?: boolean;
    }>;
    /**
     * Snapshots de portal YA construidos por portal-state.codec (ruta preferente).
     * Si se proporciona, `portals` se ignora.
     */
    portalSnapshots?: PortalSnapshot[];
    planetDebris?: Array<{ id: string; planetId: string; localOffset: Vector3; size?: number; type?: string }>;
    /**
     * Snapshots de planeta YA construidos por planet-state.codec (ruta preferente).
     * Si se proporciona, `planets` se ignora; el mapeo POJO de abajo es legacy y
     * desaparecerá cuando SolarSystemService deje de usarlo (Fase 6).
     */
    planetSnapshots?: PlanetSnapshot[];
  }): SolarSystemSnapshot {
    const sun: SunSnapshot = state.sun ? {
      id: state.sun.id,
      name: state.sun.name,
      position: { ...state.sun.position },
      radius: state.sun.radius ?? state.sun.scale?.x ?? 1800
    } : { id: 'sol', position: vec(0,0,0), radius: 1800 };

    const planets: PlanetSnapshot[] = state.planetSnapshots ?? state.planets.map(p => ({
      id: p.id,
      name: p.customName,
      // Normalización canónica delegada al códec (fuente única, ver planet-state.codec.ts).
      kind: normalizePlanetKind(p.planetType, p.baseColorName),
      baseColorName: p.baseColorName,
      position: { ...p.position },
      radius: p.radius ?? p.scale?.x ?? 1000,
      probabilityOfLifePct: p.probabilityOfLifePct,
      inhabitants: p.inhabitants,
      lesserBeing: p.lesserBeing,
      visited: p.visited,
      lifeScanned: p.lifeScanned,
      creatureScanned: p.creatureScanned,
      hasArtifact: p.hasArtifact,
      artifactIntelStatus: p.artifactIntelStatus,
      hasVoidMass: p.hasVoidMass,
      voidMassCapacity: typeof (p as any).voidMassCapacity === 'number' ? (p as any).voidMassCapacity : undefined,
      voidMassRemaining: typeof (p as any).voidMassRemaining === 'number' ? (p as any).voidMassRemaining : undefined,
      voidMassIntelStatus: p.voidMassIntelStatus,
      civilizationIntelStatus: p.civilizationIntelStatus,
      lesserBeingIntelStatus: p.lesserBeingIntelStatus,
      pendingMission: p.pendingMission,
      resourceStock: p.resourceStock ? { ...p.resourceStock } : undefined,
      animosity: p.animosity,
      orbit: (p.semiMajor && p.semiMinor) ? {
        center: p.orbitCenter ?? vec(0,0,0),
        semiMajor: p.semiMajor,
        semiMinor: p.semiMinor,
        orientation: p.orbitOrientation ?? 0,
        angle: p.orbitAngle ?? 0,
        angularSpeed: p.orbitAngularSpeed ?? 0,
        normal: p.orbitNormal,
        u: p.orbitU
      } : undefined
    }));

    const clusters: ClusterSnapshot[] = (state.clusters || []).map(c => ({
      id: c.id,
      center: { ...c.center },
      direction: { ...c.direction },
      speed: c.speed,
      count: c.count,
      includeSuper: c.includeSuper,
      radius: c.radius,
      centerSpeedFactor: c.centerSpeedFactor,
    }));

    const planetDebris: PlanetDebrisSnapshot[] = (state.planetDebris || []).map(d => ({
      id: d.id,
      planetId: d.planetId,
      localOffset: { ...d.localOffset },
      size: d.size,
      type: d.type,
    }));

    const portals: PortalSnapshot[] = state.portalSnapshots ?? (state.portals || []).map(p => ({
      id: p.id,
      position: { ...p.position },
      radius: p.radius,
      linkedPortalId: p.linkedPortalId,
      eyeState: p.eyeState,
      animosity: (p as any).animosity,
      concordSealActive: p.concordSealActive,
      concordSealActivatedAt: p.concordSealActivatedAt,
      preventsLesserIncursions: p.preventsLesserIncursions
    }));

    return { id: `snapshot-${Date.now()}`, timestamp: Date.now(), sun, planets, clusters, portals, planetDebris };
  }
}
