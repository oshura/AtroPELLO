import { Injectable } from '@angular/core';
import { SolarSystemSnapshot, SunSnapshot, PlanetSnapshot, ClusterSnapshot } from '../../types/solar-system.types';
import { Vector3 } from '../../../types/game.types';

/**
 * HumanSolarSystemService
 * Provides the static, handcrafted "human" solar system snapshot that was previously
 * instantiated directly inside GameEngine.createPlanets().
 * This preserves layout, planet ordering, orbit parameters and special Earth/Saturn debris belts.
 * Dynamic elements (Earth split debris; Saturn ring debris) are not stored as clusters here,
 * since those are managed as planetDebris in the engine; we just provide planet positions + orbits.
 */
@Injectable({ providedIn: 'root' })
export class HumanSolarSystemService {
  /** Create the canonical handcrafted system snapshot. */
  public createSnapshot(): SolarSystemSnapshot {
    const center: Vector3 = { x: 0, y: 0, z: 0 };
    const sun: SunSnapshot = { id: 'sol-primario', name: 'Sol', position: { ...center }, radius: 1800 };

    // Reproduce 9 elliptical orbits with deterministic parameters (no Math.random)
    const count = 9;
    const minA = 50000;
    const maxA = 100000;
    const planets: PlanetSnapshot[] = [];
    const baseOrbits: Array<{ a: number; b: number; orient: number; angle0: number }> = [];
    const eccs = [0.3,0.28,0.26,0.25,0.32,0.29,0.27,0.31,0.33];
    const orientsDeg = [10,45,90,135,180,225,270,315,30];
    const anglesDeg = [5,25,60,120,200,260,300,20,80];
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const aBase = Math.round(minA + t * (maxA - minA));
      const e = eccs[i];
      const bBase = Math.round(aBase * Math.sqrt(1 - e * e));
      baseOrbits.push({ a: aBase, b: bBase, orient: (orientsDeg[i] * Math.PI/180), angle0: (anglesDeg[i] * Math.PI/180) });
    }

    // Planet indices mapping (to keep names/types consistent)
    const mercuryIdx = 0;
    const venusIdx = 1;
    const earthIdx = 2;
    const marsIdx = 3;
    const jupiterIdx = 4;
    const saturnIdx = 5;
    const uranusIdx = 6;
    const neptuneIdx = 7;
    const plutoIdx = 8;

    // Deterministic set of orbit normals to distribute planes (mimics previous multi-plane layout)
    const orbitNormals: Vector3[] = [
      { x: 0,    y: 1,    z: 0 },      // Mercury (reference plane)
      { x: 0.05, y: 0.998, z: 0.02 },  // Venus slight tilt
      { x: -0.1, y: 0.995, z: 0.04 },  // Earth
      { x: 0.12, y: 0.99,  z: -0.08 }, // Mars
      { x: -0.2, y: 0.97,  z: 0.15 },  // Jupiter
      { x: 0.15, y: 0.96,  z: -0.22 }, // Saturn
      { x: -0.25,y: 0.94,  z: 0.25 },  // Uranus
      { x: 0.32, y: 0.93,  z: -0.18 }, // Neptune
      { x: -0.35,y: 0.92,  z: 0.05 },  // Pluto
    ].map(v => {
      const L = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / L, y: v.y / L, z: v.z / L };
    });
    // Reference in-plane vector per planet (deterministic, ensures not parallel to normal)
    const orbitUs: Vector3[] = orbitNormals.map((n, idx) => {
      // Pick a seed vector then project to plane
      const seeds: Vector3[] = [ { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 } ];
      const s = seeds[idx % seeds.length];
      const dot = s.x*n.x + s.y*n.y + s.z*n.z;
      let u = { x: s.x - dot * n.x, y: s.y - dot * n.y, z: s.z - dot * n.z };
      const L = Math.hypot(u.x, u.y, u.z) || 1; u = { x: u.x / L, y: u.y / L, z: u.z / L };
      return u;
    });

    for (let i = 0; i < count; i++) {
      let { a, b, orient, angle0 } = baseOrbits[i];
      if (i === jupiterIdx) { a = Math.round(a * 1.15); b = Math.round(b * 1.15); }
      // Build rotated ellipse in its inclined orbital plane: position = center + uR*(a*cos) + vR*(b*sin)
      const n = orbitNormals[i];
      const u0 = orbitUs[i];
      // v0 = n x u0
      let v0 = { x: n.y * u0.z - n.z * u0.y, y: n.z * u0.x - n.x * u0.z, z: n.x * u0.y - n.y * u0.x };
      const Lv = Math.hypot(v0.x, v0.y, v0.z) || 1; v0 = { x: v0.x / Lv, y: v0.y / Lv, z: v0.z / Lv };
      const co = Math.cos(orient), so = Math.sin(orient);
      const uR = { x: u0.x * co + v0.x * so, y: u0.y * co + v0.y * so, z: u0.z * co + v0.z * so };
      const vR = { x: -u0.x * so + v0.x * co, y: -u0.y * so + v0.y * co, z: -u0.z * so + v0.z * co };
      const ct = Math.cos(angle0), st = Math.sin(angle0);
      const pos: Vector3 = {
        x: center.x + uR.x * (a * ct) + vR.x * (b * st),
        y: center.y + uR.y * (a * ct) + vR.y * (b * st),
        z: center.z + uR.z * (a * ct) + vR.z * (b * st),
      };
      let kind = 'Rocky';
      let radius = 400; // default Earth-like baseline
      let name: string | undefined;
      let baseColorName: string | undefined;
      if (i === mercuryIdx) { kind = 'Dwarf'; radius = 200; name = 'Mercurio'; baseColorName = 'rojo_carmesi'; }
      else if (i === venusIdx) { kind = 'Rocky'; radius = 360; name = 'Venus'; baseColorName = 'marron'; }
      else if (i === earthIdx) { kind = 'Terrestrial'; radius = 400; name = 'Earth'; baseColorName = 'azul_marino'; }
      else if (i === marsIdx) { kind = 'Rocky'; radius = 300; name = 'Marte'; baseColorName = 'marron'; }
      else if (i === jupiterIdx) { kind = 'Giant'; radius = 400; name = 'Júpiter'; baseColorName = 'marron'; }
      else if (i === saturnIdx) { kind = 'Ringed'; radius = 1800; name = 'Saturn'; baseColorName = 'gris'; }
      else if (i === uranusIdx) { kind = 'Gaseous'; radius = 1200; name = 'Urano'; baseColorName = 'azul_hielo'; }
      else if (i === neptuneIdx) { kind = 'Rocky'; radius = 1000; name = 'Neptuno'; baseColorName = 'azul_marino'; }
      else if (i === plutoIdx) { kind = 'Protoplanet'; radius = 80; name = 'Plutón'; baseColorName = 'gris'; }

      planets.push({
        id: `planet-${i === earthIdx ? 'earth' : i === mercuryIdx ? 'mercury' : i === venusIdx ? 'venus' : i === marsIdx ? 'mars' : i === jupiterIdx ? 'jupiter' : i === saturnIdx ? 'saturn' : i === uranusIdx ? 'uranus' : i === neptuneIdx ? 'neptune' : 'pluto'}`,
        name,
        kind,
        position: pos,
        radius,
        baseColorName,
        probabilityOfLifePct: (i === earthIdx ? 100 : (kind === 'Terrestrial' ? 20 : (kind === 'Gaseous' ? 0 : 5))),
        orbit: { center: { ...center }, semiMajor: a, semiMinor: b, orientation: orient, angle: angle0, angularSpeed: 0.00003 * Math.pow(50000 / a, 1.5), normal: { ...n }, u: { ...u0 } }
      });
    }

    const snapshot: SolarSystemSnapshot = {
      id: 'human-system',
      sun,
      planets,
      clusters: [],
      meta: { handcrafted: true },
      // Configuración de debris efímero (valores actuales por defecto)
      ephemeralDebris: {
        checkIntervalMs: 10000,   // Evaluar cada 10 segundos
        spawnProbability: 0.05,   // 5% de probabilidad
        spawnCountMin: 1,         // Mínimo 1 asteroide
        spawnCountMax: 3          // Máximo 3 asteroides
      }
    };
    return snapshot;
  }
}
