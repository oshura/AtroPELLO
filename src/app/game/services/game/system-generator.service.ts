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
  /** Registry of all celestial names generated so far (stars + planets) to avoid reuse. */
  private usedCelestialNames: Set<string> = new Set<string>();

  /** Public: register names from any external snapshot so the generator avoids reusing them. */
  public registerUsedNamesFromSnapshot(snap: SolarSystemSnapshot | null | undefined): void {
    if (!snap) return;
    if (snap.sun?.name) this.usedCelestialNames.add(String(snap.sun.name));
    for (const p of (snap.planets || [])) {
      if (p?.name) this.usedCelestialNames.add(String(p.name));
    }
  }

  /** Generate a unique planet name at runtime, avoiding any previously used names.
   *  Respects global uniqueness and optionally forbids canonical names if allowCanonicalNames=false
   *  in later generation calls. Runtime version (non-deterministic) intentionally uses Math.random.
   */
  public generateUniquePlanetName(opts?: { allowCanonicalNames?: boolean }): string {
    const rnd = Math.random;
    const allowCanonical = opts?.allowCanonicalNames !== false; // default true
    const canonical = allowCanonical ? ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Ceres','Haumea','Eris','Makemake'] : [];
    const syllA = ['Ka','Lo','Xe','Ra','Vor','Tal','Zen','Iri','Gha','Qua','Bel','Or','Sy','Ty','Lun'];
    const syllB = ['rin','dus','mos','th','li','nar','xus','phi','gor','lon','tris','vak','mer','dri'];
    let base: string;
    const attemptCanonical = allowCanonical && rnd() < 0.45 && canonical.length > 0;
    if (attemptCanonical) {
      const unusedCanonical = canonical.filter(n => !this.usedCelestialNames.has(n));
      base = unusedCanonical.length ? unusedCanonical[Math.floor(rnd()*unusedCanonical.length)] : canonical[Math.floor(rnd()*canonical.length)];
      if (rnd() < 0.25) base += ` ${Math.floor(1 + rnd()*5)}`;
    } else {
      const a = syllA[Math.floor(rnd()*syllA.length)] || 'Ka';
      const b = syllB[Math.floor(rnd()*syllB.length)] || 'rin';
      const suffix = rnd()<0.3 ? String.fromCharCode(97+Math.floor(rnd()*6)) : '';
      base = a + b + suffix;
    }
    if (!this.usedCelestialNames.has(base)) { this.usedCelestialNames.add(base); return base; }
    let idx = 2;
    while (idx < 1000) {
      const c = `${base} ${idx}`;
      if (!this.usedCelestialNames.has(c)) { this.usedCelestialNames.add(c); return c; }
      idx++;
    }
    let fallback = base + '-' + Math.floor(Math.random()*1e6).toString(36);
    while (this.usedCelestialNames.has(fallback)) fallback = base + '-' + Math.floor(Math.random()*1e6).toString(36);
    this.usedCelestialNames.add(fallback);
    return fallback;
  }
  /**
   * Generate a deterministic solar system snapshot from a seed.
   * Current model: 1 sun + 9 planets on elliptical orbits similar to engine defaults.
   */
  generate(seed: RNGSeed = Date.now(), options?: GenerationOptions): SolarSystemSnapshot {
    const rnd = mulberry32(hashSeed(seed));

    // Sun(s): random chance of binary if allowed
    const allowBinary = options?.sunCount === 2 || (options?.sunCount === undefined && rnd() < 0.25);
    const sunCount = allowBinary ? 2 : 1;
    let sun: SunSnapshot;
    const pickUniqueName = (candidates: string[], fallbackPrefix: string): string => {
      // Filter out already used names
      const available = candidates.filter(n => !this.usedCelestialNames.has(n));
      let chosen = available.length ? (available[Math.floor(rnd()*available.length)] || available[0]) : (candidates[Math.floor(rnd()*candidates.length)] || candidates[0]);
      // If chosen already used, derive a suffix until unique
      if (this.usedCelestialNames.has(chosen)) {
        let idx = 2;
        while (this.usedCelestialNames.has(`${chosen} ${idx}`) && idx < 1000) idx++;
        chosen = `${chosen} ${idx}`;
      }
      this.usedCelestialNames.add(chosen);
      return chosen;
    };
    if (sunCount === 1) {
      const starNames = ['Aether','Helion','Solis','Orion','Nyxar','Ilyos','Zeph','Dracon','Lumen'];
      const sName = pickUniqueName(starNames, 'Helion');
      sun = { id: `star-primary-${seed}`, name: sName, position: vec(0, 0, 0), radius: 1400 + Math.round(rnd()*900) };
    } else {
      const binSep = 2200 + rnd()*1200;
      const starNames = ['Dualis','Gemini','Janus','Castor','Pollux','Helios','Lya','Pyra'];
      const base = pickUniqueName(starNames, 'Dualis');
      // Represent first star; secondary will implicitly share base name with B suffix but kept unique too
      let secondary = base + ' B';
      if (this.usedCelestialNames.has(secondary)) {
        let idx = 2;
        while (this.usedCelestialNames.has(`${secondary}-${idx}`) && idx < 1000) idx++;
        secondary = `${secondary}-${idx}`;
      }
      this.usedCelestialNames.add(secondary);
      sun = { id: `star-binary-a-${seed}`, name: `${base} A`, position: vec(-binSep*0.5, 0, 0), radius: 1300 + Math.round(rnd()*600) };
    }

  const planetCountRange = options?.planetCountRange || [5, 13];
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

  // Random name syllable generator for variety beyond canonical list
  const allowCanonical = options?.allowCanonicalNames !== false;
  const canonical = allowCanonical ? ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Ceres','Haumea','Eris','Makemake'] : [];
  const syllA = ['Ka','Lo','Xe','Ra','Vor','Tal','Zen','Iri','Gha','Qua','Bel','Or','Sy','Ty','Lun'];
  const syllB = ['rin','dus','mos','th','li','nar','xus','phi','gor','lon','tris','vak','mer','dri'];
  const randUniquePlanetName = () => {
    let base: string;
  const attemptCanonical = allowCanonical && rnd() < 0.45 && canonical.length;
    if (attemptCanonical) {
      // choose unused canonical first
      const unusedCanonical = canonical.filter(n => !this.usedCelestialNames.has(n));
      base = unusedCanonical.length ? unusedCanonical[Math.floor(rnd()*unusedCanonical.length)] : canonical[Math.floor(rnd()*canonical.length)];
      if (rnd() < 0.25) base += ` ${Math.floor(1 + rnd()*5)}`;
    } else {
      const a = syllA[Math.floor(rnd()*syllA.length)] || 'Ka';
      const b = syllB[Math.floor(rnd()*syllB.length)] || 'rin';
      const suffix = rnd()<0.3 ? String.fromCharCode(97+Math.floor(rnd()*6)) : '';
      base = a + b + suffix;
    }
    let candidate = base;
    if (!this.usedCelestialNames.has(candidate)) {
      this.usedCelestialNames.add(candidate);
      return candidate;
    }
    // Resolve collision: append numeric or Roman suffix until unique
    let idx = 2;
    while (idx < 1000) {
      const withIdx = `${base} ${idx}`;
      if (!this.usedCelestialNames.has(withIdx)) {
        this.usedCelestialNames.add(withIdx);
        return withIdx;
      }
      idx++;
    }
    // Fallback truly unique hash-based name
    let fallback = base + '-' + Math.floor(rnd()*1e6).toString(36);
    while (this.usedCelestialNames.has(fallback)) fallback = base + '-' + Math.floor(rnd()*1e6).toString(36);
    this.usedCelestialNames.add(fallback);
    return fallback;
  };
  const kindPool = ['Rocky','Terrestrial','Rocky','Giant','Ringed','Gaseous','Dwarf','Protoplanet'];
  const pickKind = (i:number) => kindPool[Math.floor(rnd()*kindPool.length)] || 'Rocky';
  const radiiBase = [900,1100,1250,1400,1600,1900,2200,2600,3000,3400];
  const maxGiantCap = options?.maxGiantRadius && options.maxGiantRadius > 0 ? options.maxGiantRadius : undefined;
  const radiusForKind = (kind: string) => {
    let r: number;
    switch (kind) {
      case 'Giant': r = 2800 + Math.round(rnd()*1800); break; // 2800..4600
      case 'Ringed': r = 2000 + Math.round(rnd()*1400); break; // 2000..3400
      case 'Gaseous': r = 1800 + Math.round(rnd()*1500); break; // 1800..3300
      case 'Dwarf': r = 400 + Math.round(rnd()*600); break; // 400..1000
      case 'Protoplanet': r = 250 + Math.round(rnd()*350); break; // 250..600
      case 'Terrestrial': r = 900 + Math.round(rnd()*900); break; // 900..1800
      default: r = radiiBase[Math.floor(rnd()*radiiBase.length)] || 1200; break;
    }
    if (maxGiantCap && (kind === 'Giant' || kind === 'Ringed' || kind === 'Gaseous')) {
      r = Math.min(r, maxGiantCap);
    }
    return r;
  };

  const lifeChance = typeof options?.lifeChancePct === 'number' ? Math.max(0, Math.min(100, options.lifeChancePct)) : 8;
  // Optional palette override for baseColorName variety/unification
  const palette = (options?.colorPaletteOverride && options.colorPaletteOverride.length) ? options.colorPaletteOverride : undefined;
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
    const kind = pickKind(i);
    const name = randUniquePlanetName();
    const radius = radiusForKind(kind);
  // Probability of life picks exceptional planets based on lifeChancePct
  const exceptional = rnd() * 100 < lifeChance;
  const life = exceptional ? Math.round(30 + rnd() * 50) : (kind === 'Terrestrial' ? Math.round(rnd() * 10) : (kind === 'Gaseous' ? 0 : Math.round(rnd() * 4)));
      const angSpeed = 0.00002 + rnd() * 0.00008; // rad/s small
  // Map kind to internal baseColor hint set (reuse existing color keys)
  let baseColorName = kind === 'Ringed' ? 'gris' : (kind === 'Gaseous' ? 'azul_hielo' : (kind === 'Giant' ? 'marron' : (kind === 'Dwarf' ? 'gris' : (kind === 'Protoplanet' ? 'gris' : 'azul_marino'))));
      if (palette) {
        // deterministic pick from palette using planet index & seed-based rnd
        const idx = Math.floor(rnd() * palette.length);
        baseColorName = palette[idx] || baseColorName;
      }
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

  // Asteroid clusters: choose a random anchor planet index (avoid last few small ones when possible)
  const clusters: ClusterSnapshot[] = [];
    // Optional TRAIL (disabled if disableTrail=true)
    if (!options?.disableTrail) {
      const trailAnchor = Math.min(count-1, Math.floor(rnd()*Math.max(3, count-3))); // bias early orbits
      const rows = 4 + Math.floor(rnd()*4); // 4..7
      const cols = 25 + Math.floor(rnd()*40); // 25..64
      const ROW_SPACING = 75;
      const COL_SPACING = 300;
      const START_OFFSET = 10000;
      const anchorOrbit = baseOrbits[trailAnchor];
      const a = anchorOrbit.a, b = anchorOrbit.b, orient = anchorOrbit.orient, phiEarth = anchorOrbit.angle0;
      // Build Earth analog basis with multi-plane support
      const nE = baseOrbits[Math.min(2, baseOrbits.length-1)].normal, uE = baseOrbits[Math.min(2, baseOrbits.length-1)].u;
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
          clusters.push({ id: `trail-${trailAnchor}-${r}-${c}`, center, direction: t, speed: 1.2 + rnd()*1.2, count: 6 + Math.floor(rnd()*6), includeSuper: rnd() < 0.5, radius: 10 + Math.floor(rnd()*10), centerSpeedFactor: 0.4 + rnd()*0.3 });
        }
      }
    }

    // Additional asteroid "cloud" clusters between orbits to differentiate systems.
    // Clouds: free-floating groups not constrained to the trail; placed at random orbital radii and slight vertical offsets.
    // CLOUD GROUPS: each 'cloud' is a group of 10-20 standard clusters plus 1-3 mega-asteroids
    // Cloud group count scaled by cloudGroupScale (e.g., 0.1 => one tenth the previous random count)
    const baseCloudCount = 8 + Math.floor(rnd() * 12); // 8..19
    const scale = (typeof options?.cloudGroupScale === 'number' && options.cloudGroupScale >= 0) ? options.cloudGroupScale : 1;
    let cloudGroupCount = Math.max(1, Math.floor(baseCloudCount * scale));
    // If minClouds is specified, interpret it as minimum total clusters if scale not provided; otherwise ignore here
    for (let gi = 0; gi < cloudGroupCount; gi++) {
      // Choose a random orbital band for the group's center
      const bandT = rnd();
      const aBand = minA + bandT * (maxA - minA);
      const eBand = 0.1 + rnd() * 0.6;
      const bBand = aBand * Math.sqrt(1 - eBand * eBand);
      const phi0 = rnd() * Math.PI * 2;
      // Plane orientation for the group
      const nx = (rnd()*2 - 1) * 0.4;
      const ny = 0.25 + rnd()*0.8;
      const nz = (rnd()*2 - 1) * 0.4;
      const nLen = Math.hypot(nx, ny, nz) || 1; const n = { x: nx/nLen, y: ny/nLen, z: nz/nLen };
      // Orthonormal basis (u,v) in plane
      let rx = rnd()*2-1, ry = rnd()*2-1, rz = rnd()*2-1; let rl = Math.hypot(rx,ry,rz)||1; rx/=rl; ry/=rl; rz/=rl;
      const dotRN = rx*n.x + ry*n.y + rz*n.z;
      let ux = rx - dotRN*n.x, uy = ry - dotRN*n.y, uz = rz - dotRN*n.z;
      const ul = Math.hypot(ux,uy,uz)||1; ux/=ul; uy/=ul; uz/=ul;
      const vx = n.y * uz - n.z * uy;
      const vy = n.z * ux - n.x * uz;
      const vz = n.x * uy - n.y * ux;
      const vl = Math.hypot(vx,vy,vz)||1; const v = { x: vx/vl, y: vy/vl, z: vz/vl };
      // Group center position on its orbital ellipse
      const groupCenter = vec(
        ux * (aBand * Math.cos(phi0)) + v.x * (bBand * Math.sin(phi0)),
        uy * (aBand * Math.cos(phi0)) + v.y * (bBand * Math.sin(phi0)),
        uz * (aBand * Math.cos(phi0)) + v.z * (bBand * Math.sin(phi0))
      );
      // Ellipse axes for the local cloud area (semi-axes): 500 (major) and 300 (minor)
      const elA = 500, elB = 300;
      // Cluster counts
      const normalClusters = 10 + Math.floor(rnd() * 11); // 10..20
      const megaClusters = 1 + Math.floor(rnd() * 3); // 1..3
      const makeOffset = () => {
        // Sample inside ellipse with near-uniform distribution
        const theta = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()); // radial distribution
        const ox = elA * r * Math.cos(theta);
        const oy = elB * r * Math.sin(theta);
        return vec(
          ux * ox + v.x * oy,
          uy * ox + v.y * oy,
          uz * ox + v.z * oy
        );
      };
      const dir = options?.staticClouds ? { x: 0, y: 0, z: 0 } : (() => { let dx=rnd()*2-1,dy=rnd()*2-1,dz=rnd()*2-1; const dl=Math.hypot(dx,dy,dz)||1; return { x: dx/dl, y: dy/dl, z: dz/dl }; })();
      // Normal asteroid clusters
      for (let ci = 0; ci < normalClusters; ci++) {
        const off = makeOffset();
        const center = vec(groupCenter.x + off.x, groupCenter.y + off.y, groupCenter.z + off.z);
        clusters.push({
          id: `cloudG-${gi}-c-${ci}`,
          center,
          direction: dir,
          speed: options?.staticClouds ? 0 : (0.25 + rnd()*0.5),
          count: 8 + Math.floor(rnd()*10),
          includeSuper: false,
          radius: 18 + Math.floor(rnd()*40),
          centerSpeedFactor: options?.staticClouds ? 0 : (0.1 + rnd()*0.2)
        });
      }
      // Mega asteroids (represented as tiny clusters with 1 member and includeSuper)
      for (let mi = 0; mi < megaClusters; mi++) {
        const off = makeOffset();
        const center = vec(groupCenter.x + off.x, groupCenter.y + off.y, groupCenter.z + off.z);
        clusters.push({
          id: `cloudG-${gi}-m-${mi}`,
          center,
          direction: dir,
          speed: options?.staticClouds ? 0 : (0.2 + rnd()*0.3),
          count: 1,
          includeSuper: true,
          radius: 6 + Math.floor(rnd()*12),
          centerSpeedFactor: options?.staticClouds ? 0 : (0.05 + rnd()*0.1)
        });
      }
    }

    const snapshot: SolarSystemSnapshot = { 
      id: `sys-${(seed as any)}`, 
      seed, 
      timestamp: Date.now(), 
      sun, 
      planets, 
      clusters, 
      meta: { optionsUsed: options || null, sunCount, trailDisabled: !!options?.disableTrail },
      // Configuración de debris efímero con varianza sobre valores base
      // Base (sistema humano): checkInterval=10000ms, probability=0.05, count=1-3
      // Varianza: tiempo ±25%, probabilidad ±10%, cantidad ±50%
      ephemeralDebris: {
        checkIntervalMs: Math.round(10000 * (1 + (rnd() - 0.5) * 0.5)), // ±25%
        spawnProbability: Math.max(0.01, Math.min(0.15, 0.05 * (1 + (rnd() - 0.5) * 0.2))), // ±10%, clamp 1-15%
        spawnCountMin: Math.max(1, Math.round(1 * (1 + (rnd() - 0.5) * 1.0))), // ±50%, min 1
        spawnCountMax: Math.max(2, Math.round(3 * (1 + (rnd() - 0.5) * 1.0)))  // ±50%, min 2
      }
    };
    return snapshot;
  }
}
