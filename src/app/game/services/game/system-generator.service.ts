import { Injectable } from '@angular/core';
import { RNGSeed, SolarSystemSnapshot, SunSnapshot, PlanetSnapshot, ClusterSnapshot, GenerationOptions } from '../../types/solar-system.types';
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
  generate(seed: RNGSeed = Date.now(), options?: GenerationOptions): SolarSystemSnapshot {
    const rnd = mulberry32(hashSeed(seed));

    // Sun(s) in origin or slight offset for binary
    const sunCount = options?.sunCount === 2 ? 2 : 1;
    let sun: SunSnapshot;
    if (sunCount === 1) {
      sun = { id: 'sol-primario', name: 'Sol', position: vec(0, 0, 0), radius: 1800 };
    } else {
      // Represent primary; secondary will be encoded via meta until multi-sun render is supported
      sun = { id: 'sol-binario-a', name: 'Sol A', position: vec(-1500, 0, 0), radius: 1600 };
    }

  const planetCountRange = options?.planetCountRange || [9, 9];
  const count = Math.max(1, Math.round(planetCountRange[0] + (planetCountRange[1] - planetCountRange[0]) * rnd()));
  const minA = 50000;
  const maxA = options?.maxOrbitSemiMajor && options.maxOrbitSemiMajor > minA ? options.maxOrbitSemiMajor : 100000;

    type Orbit = { a: number; b: number; orient: number; angle0: number; normal: Vector3; u: Vector3 };
    const baseOrbits: Orbit[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const a = Math.round(minA + t * (maxA - minA));
      const e = 0.25 + rnd() * 0.25; // 0.25..0.5
      const b = Math.round(a * Math.sqrt(1 - e * e));
      // Multi-plane: sample a normal by perturbing Y and Z with small randoms and normalizing
      // Bias normals slightly toward XZ (so systems feel broadly planar but with variety)
      const nx = (rnd() * 2 - 1) * 0.15; // subtle tilt x
      const ny = 0.35 + rnd() * 0.55;   // keep some upward component
      const nz = (rnd() * 2 - 1) * 0.15; // subtle tilt z
      let lenN = Math.hypot(nx, ny, nz) || 1; const normal = { x: nx/lenN, y: ny/lenN, z: nz/lenN };
      // Derive an in-plane major axis u: pick a random vector not parallel to normal and project
      let rx = rnd()*2-1, ry = rnd()*2-1, rz = rnd()*2-1; let rl = Math.hypot(rx,ry,rz)||1; rx/=rl; ry/=rl; rz/=rl;
      // Project r onto plane: r - (r·n) n
      const dotRN = rx*normal.x + ry*normal.y + rz*normal.z;
      let ux = rx - dotRN*normal.x, uy = ry - dotRN*normal.y, uz = rz - dotRN*normal.z;
      const ul = Math.hypot(ux,uy,uz)||1; ux/=ul; uy/=ul; uz/=ul;
      baseOrbits.push({ a, b, orient: rnd() * Math.PI * 2, angle0: rnd() * Math.PI * 2, normal, u: { x: ux, y: uy, z: uz } });
    }

  const names = ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Ceres','Haumea','Eris','Makemake'];
  const kindsBase = ['Rocky','Rocky','Terrestrial','Rocky','Giant','Ringed','Gaseous','Gaseous','Dwarf','Dwarf','Dwarf','Rocky','Rocky'];
  const radiiBase = [1200,1400,1500,1300,3200,2900,2400,2300,900,650,700,1100,1250];
  const radii = radiiBase.map(r => Math.round(r * (0.8 + 0.4 * rnd())));

    const lifeChance = typeof options?.lifeChancePct === 'number' ? Math.max(0, Math.min(100, options.lifeChancePct)) : 5;
    const planets: PlanetSnapshot[] = baseOrbits.map((o, i) => {
      const a = o.a, b = o.b, orient = o.orient; // orient rotates in-plane axes around normal
      const phi = o.angle0;
      const center = vec(0,0,0);
      // Build orthonormal basis (u,v,n) for the orbital plane; u given, n given
      // v = n × u
      const vx = o.normal.y * o.u.z - o.normal.z * o.u.y;
      const vy = o.normal.z * o.u.x - o.normal.x * o.u.z;
      const vz = o.normal.x * o.u.y - o.normal.y * o.u.x;
      let vl = Math.hypot(vx,vy,vz)||1; const v = { x: vx/vl, y: vy/vl, z: vz/vl };
      const u = o.u;
      // Rotate (u,v) around normal by orient → (uR,vR)
      const co = Math.cos(orient), so = Math.sin(orient);
      const uR = { x: u.x*co + v.x*so, y: u.y*co + v.y*so, z: u.z*co + v.z*so };
      const vR = { x: v.x*co - u.x*so, y: v.y*co - u.y*so, z: v.z*co - u.z*so };
      const pos = vec(
        center.x + uR.x * (a * Math.cos(phi)) + vR.x * (b * Math.sin(phi)),
        center.y + uR.y * (a * Math.cos(phi)) + vR.y * (b * Math.sin(phi)),
        center.z + uR.z * (a * Math.cos(phi)) + vR.z * (b * Math.sin(phi))
      );
  const kind = kindsBase[i] || 'Rocky';
      const name = names[i] || `P-${i+1}`;
      const radius = radii[i] || Math.round(1000 + 1800 * rnd());
  // Probability of life picks exceptional planets based on lifeChancePct
  const exceptional = rnd() * 100 < lifeChance;
  const life = exceptional ? Math.round(30 + rnd() * 50) : (kind === 'Terrestrial' ? Math.round(rnd() * 10) : (kind === 'Gaseous' ? 0 : Math.round(rnd() * 4)));
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
          normal: o.normal,
          u: uR,
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
    // Build Earth analog basis with multi-plane support
    const nE = baseOrbits[2].normal, uE = baseOrbits[2].u;
    const vxE = nE.y * uE.z - nE.z * uE.y, vyE = nE.z * uE.x - nE.x * uE.z, vzE = nE.x * uE.y - nE.y * uE.x;
    const vEl = Math.hypot(vxE,vyE,vzE)||1; const vE = { x: vxE/vEl, y: vyE/vEl, z: vzE/vEl };
    const coE = Math.cos(orient), soE = Math.sin(orient);
    const uR = { x: uE.x*coE + vE.x*soE, y: uE.y*coE + vE.y*soE, z: uE.z*coE + vE.z*soE };
    const vR = { x: vE.x*coE - uE.x*soE, y: vE.y*coE - uE.y*soE, z: vE.z*coE - uE.z*soE };
    const posAt = (phi: number) => vec(
      uR.x * (a * Math.cos(phi)) + vR.x * (b * Math.sin(phi)),
      uR.y * (a * Math.cos(phi)) + vR.y * (b * Math.sin(phi)),
      uR.z * (a * Math.cos(phi)) + vR.z * (b * Math.sin(phi))
    );
    const tanAt = (phi: number) => {
      const tx = uR.x * (-a * Math.sin(phi)) + vR.x * (b * Math.cos(phi));
      const ty = uR.y * (-a * Math.sin(phi)) + vR.y * (b * Math.cos(phi));
      const tz = uR.z * (-a * Math.sin(phi)) + vR.z * (b * Math.cos(phi));
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
  // lateral offset perpendicular to tangent and normal (approx planet radial in-plane)
  const s = vec( vR.x, vR.y, vR.z );
        const lateral = (r - (rows-1)/2) * ROW_SPACING * (1 + 1.2 * (c/(cols-1)));
        const center = vec(base.x + s.x * lateral, base.y + s.y * lateral, base.z + s.z * lateral);
        clusters.push({ id: `trail-${r}-${c}`, center, direction: t, speed: 1.5, count: 8, includeSuper: true, radius: 12, centerSpeedFactor: 0.5 });
      }
    }

    const snapshot: SolarSystemSnapshot = { id: `sys-${(seed as any)}`, seed, timestamp: Date.now(), sun, planets, clusters, meta: { optionsUsed: options || null, sunCount } };
    return snapshot;
  }
}
