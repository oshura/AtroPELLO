import { SolarSystemSnapshot, PlanetSnapshot, SunSnapshot, ClusterSnapshot, PlanetDebrisSnapshot } from '../../types/solar-system.types';
import { Vector3 } from '../../../types/game.types';

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
    planetDebris?: Array<{ id: string; planetId: string; localOffset: Vector3; size?: number; type?: string }>;
  }): SolarSystemSnapshot {
    const sun: SunSnapshot = state.sun ? {
      id: state.sun.id,
      name: state.sun.name,
      position: { ...state.sun.position },
      radius: state.sun.radius ?? state.sun.scale?.x ?? 1800
    } : { id: 'sol', position: vec(0,0,0), radius: 1800 };

    const planets: PlanetSnapshot[] = state.planets.map(p => ({
      id: p.id,
      name: p.customName,
      // Normalizar 'kind' para consumo de generadores posteriores.
      // El motor procedural espera valores en inglés en minúsculas: 'ringed','gaseous','giant','dwarf','protoplanet','terrestrial','rocky'.
      // Los enum y strings internos pueden venir como 'Tierra','Planetoid','Ringed','Gaseous','Giant','Dwarf','Protoplanet'.
      kind: (() => {
        const raw = (p.planetType || '').toString();
        const x = raw.toLowerCase();
        if (!x) return undefined;
        if (x === 'tierra') return 'terrestrial';
        if (x === 'planetoid') return 'rocky'; // mapeo aproximado
        // Mantener ya compatibles
        if (x === 'ringed') return 'ringed';
        if (x === 'gaseous') return 'gaseous';
        if (x === 'giant') return 'giant';
        if (x === 'dwarf') return 'dwarf';
        if (x === 'protoplanet') return 'protoplanet';
        if (x === 'sun') return 'sun';
        // Fallback: si el color sugiere oceánico usar 'terrestrial'
        if (p.baseColorName === 'azul_marino') return 'terrestrial';
        return x; // dejar valor original si no coincide
      })(),
      baseColorName: p.baseColorName,
      position: { ...p.position },
      radius: p.radius ?? p.scale?.x ?? 1000,
      probabilityOfLifePct: p.probabilityOfLifePct,
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

    return { id: `snapshot-${Date.now()}`, timestamp: Date.now(), sun, planets, clusters, planetDebris };
  }
}
