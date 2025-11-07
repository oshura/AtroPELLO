import { Injectable } from '@angular/core';
import { RNGSeed, SolarSystemSnapshot, SunSnapshot, PlanetSnapshot, ClusterSnapshot } from '../../types/solar-system.types';
import { Vector3 } from '../../../types/game.types';

function hashSeed(seed: number | string): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randIn(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function vec(x: number, y: number, z: number): Vector3 { return { x, y, z }; }

@Injectable({ providedIn: 'root' })
export class SystemGeneratorService {
  /**
   * Generate a deterministic solar system snapshot from a seed.
   * Current model: 1 sun + 9 planets on elliptical orbits similar to engine defaults.
   */
  generate(seed: RNGSeed = Date.now()): SolarSystemSnapshot {
    const rnd = mulberry32(hashSeed(seed));

    // Sun in origin for now
    const sun: SunSnapshot = {
      id: 'sol-primario',
      name: 'Sol',
      position: vec(0, 0, 0),
      radius: 1800,
    };

    const count = 9;
    const minA = 50000;
    const maxA = 100000;

    type Orbit = { a: number; b: number; orient: number; angle0: number };
    const baseOrbits: Orbit[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const a = Math.round(minA + t * (maxA - minA));
      const e = 0.25 + rnd() * 0.25; // 0.25..0.5
      const b = Math.round(a * Math.sqrt(1 - e * e));
      baseOrbits.push({ a, b, orient: rnd() * Math.PI * 2, angle0: rnd() * Math.PI * 2 });
    }

    const names = ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
    const kinds = ['Rocky','Rocky','Terrestrial','Rocky','Giant','Ringed','Gaseous','Gaseous','Dwarf'];
    const radii = [1200,1400,1500,1300,3200,2900,2400,2300,900].map(r => Math.round(r * (0.8 + 0.4 * rnd())));

    const planets: PlanetSnapshot[] = baseOrbits.map((o, i) => {
      const a = o.a, b = o.b, orient = o.orient;
      const phi = o.angle0;
      const center = vec(0,0,0);
      // Simple in-plane axes (X,Z) rotated by orient
      const co = Math.cos(orient), so = Math.sin(orient);
      const U = vec(co, 0, -so);
      const V = vec(so, 0, co);
      const pos = vec(center.x + U.x * (a * Math.cos(phi)) + V.x * (b * Math.sin(phi)),
                      center.y + U.y * (a * Math.cos(phi)) + V.y * (b * Math.sin(phi)),
                      center.z + U.z * (a * Math.cos(phi)) + V.z * (b * Math.sin(phi)));
      const kind = kinds[i] || 'Rocky';
      const name = names[i] || `P-${i+1}`;
      const radius = radii[i] || Math.round(1000 + 1800 * rnd());
      const life = (kind === 'Terrestrial') ? Math.round(2 + rnd() * 8) : (kind === 'Gaseous' ? 0 : Math.round(rnd() * 3));
      const angSpeed = 0.00002 + rnd() * 0.00008; // rad/s small
      const baseColorName = kind === 'Ringed' ? 'ringed' : (kind === 'Gaseous' ? 'gaseous' : (kind === 'Giant' ? 'giant' : undefined));
      return {
        id: `planet-${i}`,
        name,
        kind,
        position: pos,
        radius,
        baseColorName,
        probabilityOfLifePct: life,
        orbit: {
          center,
          semiMajor: a,
          semiMinor: b,
          orientation: orient,
          angle: phi,
          angularSpeed: angSpeed,
        }
      } as PlanetSnapshot;
    });

    // Simple asteroid clusters ring behind Earth analog (i=2)
    const clusters: ClusterSnapshot[] = [];
    const rows = 6;
    const cols = 40;
    const ROW_SPACING = 75;
    const COL_SPACING = 300;
    const START_OFFSET = 10000;
    const a = baseOrbits[2].a, b = baseOrbits[2].b, orient = baseOrbits[2].orient, phiEarth = baseOrbits[2].angle0;
    const co = Math.cos(orient), so = Math.sin(orient);
    const U = vec(co, 0, -so), V = vec(so,0,co);
    const posAt = (phi: number) => vec(U.x * (a * Math.cos(phi)) + V.x * (b * Math.sin(phi)), U.y * (a * Math.cos(phi)) + V.y * (b * Math.sin(phi)), U.z * (a * Math.cos(phi)) + V.z * (b * Math.sin(phi)));
    const tanAt = (phi: number) => {
      const tx = U.x * (-a * Math.sin(phi)) + V.x * (b * Math.cos(phi));
      const ty = U.y * (-a * Math.sin(phi)) + V.y * (b * Math.cos(phi));
      const tz = U.z * (-a * Math.sin(phi)) + V.z * (b * Math.cos(phi));
      const l = Math.hypot(tx,ty,tz) || 1; return vec(tx/l,ty/l,tz/l);
    };
    const speedAt = (phi: number) => Math.hypot(a * Math.sin(phi), b * Math.cos(phi));
    const phiBehindBy = (ds: number) => {
      let acc = 0; let phi = phiEarth; const maxIter = 10000;
      for (let i=0;i<maxIter && acc < ds;i++) { const s = speedAt(phi); const dphi = Math.min(0.01, (ds-acc) / Math.max(1e-6, s)); acc += s * dphi; phi -= dphi; }
      return phi;
    };
    const phiCols: number[] = []; for (let c=0;c<cols;c++){ const ds = START_OFFSET + c * COL_SPACING; phiCols.push(phiBehindBy(ds)); }
    for (let r=0;r<rows;r++) {
      for (let c=0;c<cols;c++) {
        const phi = phiCols[c];
        const base = posAt(phi);
        const t = tanAt(phi);
        const s = vec( -t.z, 0, t.x ); // crude lateral in XZ
        const lateral = (r - (rows-1)/2) * ROW_SPACING * (1 + 1.2 * (c/(cols-1)));
        const center = vec(base.x + s.x * lateral, base.y + s.y * lateral, base.z + s.z * lateral);
        clusters.push({ id: `trail-${r}-${c}`, center, direction: t, speed: 1.5, count: 8, includeSuper: true, radius: 12, centerSpeedFactor: 0.5 });
      }
    }

    const snapshot: SolarSystemSnapshot = { id: `sys-${(seed as any)}`, seed, timestamp: Date.now(), sun, planets, clusters };
    return snapshot;
  }
}
