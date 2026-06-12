import { Planet, PlanetColorName } from '../../game-objects/Planet';
import { Sun } from '../../game-objects/Sun';
import { PlanetSnapshot, OrbitParams } from '../../types/solar-system.types';
import { PlanetInhabitants, LesserBeing } from '../../types/cosmic-life.types';
import { PlanetIntelStatus } from '../../types/planet-intel.types';
import { Vector3 } from '../../../types/game.types';

/**
 * FUENTE ÚNICA DE VERDAD de los campos persistentes de un planeta
 * (ver docs/ARQUITECTURA.md §4.3 y Fase 2).
 *
 * Todo el código que serializa o restaura planetas pasa por aquí:
 *  - captura runtime → snapshot:            capturePlanetSnapshot()
 *  - snapshot → objeto vivo:                applyPlanetSnapshotFields()
 *  - puente con el `custom` del savegame:   planetCustomMetaFromSnapshot() /
 *                                           planetSnapshotFromCustomMeta()
 *
 * REGLA DURA: para añadir un campo persistente nuevo se toca el tipo PlanetSnapshot
 * y ESTE fichero. Si necesitas copiar el campo en otro sitio, la arquitectura ha
 * regresado: ver "la prueba del campo nuevo" en docs/ARQUITECTURA.md §6.5.
 */

/** Clases de planeta canónicas que entienden los generadores y applySolarSystemSnapshot. */
export type CanonicalPlanetKind =
  | 'sun'
  | 'terrestrial'
  | 'rocky'
  | 'ringed'
  | 'gaseous'
  | 'giant'
  | 'dwarf'
  | 'protoplanet';

/**
 * Normaliza cualquier variante histórica de tipo de planeta (`PlanetType` enum,
 * strings legacy 'Tierra'/'Planetoid', valores ya canónicos) a la forma canónica.
 * Mantiene el fallback histórico: color 'azul_marino' sugiere mundo terrestre.
 */
export function normalizePlanetKind(
  raw: string | null | undefined,
  baseColorName?: string | null
): string | undefined {
  const x = String(raw ?? '').toLowerCase();
  if (!x) {
    return baseColorName === 'azul_marino' ? 'terrestrial' : undefined;
  }
  switch (x) {
    case 'tierra': return 'terrestrial';
    case 'planetoid': return 'rocky';
    case 'sun':
    case 'terrestrial':
    case 'rocky':
    case 'ringed':
    case 'gaseous':
    case 'giant':
    case 'dwarf':
    case 'protoplanet':
      return x;
    default:
      if (baseColorName === 'azul_marino') {
        return 'terrestrial';
      }
      return x; // valor desconocido: se conserva para no perder información
  }
}

/** Color por defecto cuando el snapshot no trae `baseColorName` (legacy de applySolarSystemSnapshot). */
export function defaultColorForKind(kind: string | null | undefined): PlanetColorName {
  switch (String(kind ?? '').toLowerCase()) {
    case 'ringed': return 'gris';
    case 'gaseous': return 'azul_hielo';
    case 'giant': return 'marron';
    case 'dwarf': return 'gris';
    case 'protoplanet': return 'gris';
    case 'terrestrial':
    case 'rocky':
      return 'azul_marino';
    default: return 'marron';
  }
}

function cloneVec(vec: Vector3 | null | undefined): Vector3 | undefined {
  if (!vec) {
    return undefined;
  }
  return { x: Number(vec.x) || 0, y: Number(vec.y) || 0, z: Number(vec.z) || 0 };
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function captureOrbit(planet: Planet): OrbitParams | undefined {
  if (!planet.semiMajor || !planet.semiMinor) {
    return undefined;
  }
  return {
    center: cloneVec(planet.orbitCenter) ?? { x: 0, y: 0, z: 0 },
    semiMajor: planet.semiMajor,
    semiMinor: planet.semiMinor,
    orientation: planet.orbitOrientation ?? 0,
    angle: planet.orbitAngle ?? 0,
    angularSpeed: planet.orbitAngularSpeed ?? 0,
    normal: cloneVec(planet.orbitNormal),
    u: cloneVec(planet.orbitU),
  };
}

function normalizeOrbit(raw: any): OrbitParams | undefined {
  if (!raw) {
    return undefined;
  }
  const center = cloneVec(raw.center);
  const semiMajor = finiteOrUndefined(raw.semiMajor);
  const semiMinor = finiteOrUndefined(raw.semiMinor) ?? semiMajor;
  if (!center || semiMajor === undefined || semiMinor === undefined) {
    return undefined;
  }
  const orbit: OrbitParams = {
    center,
    semiMajor,
    semiMinor,
    orientation: finiteOrUndefined(raw.orientation) ?? 0,
  };
  const angle = finiteOrUndefined(raw.angle);
  if (angle !== undefined) orbit.angle = angle;
  const angularSpeed = finiteOrUndefined(raw.angularSpeed);
  if (angularSpeed !== undefined) orbit.angularSpeed = angularSpeed;
  const normal = cloneVec(raw.normal);
  if (normal) orbit.normal = normal;
  const u = cloneVec(raw.u);
  if (u) orbit.u = u;
  return orbit;
}

/** Captura TODOS los campos persistentes de un planeta vivo en forma de PlanetSnapshot. */
export function capturePlanetSnapshot(planet: Planet): PlanetSnapshot {
  const anyPlanet = planet as any;
  const radius = finiteOrUndefined(anyPlanet.radius)
    ?? finiteOrUndefined(planet.scale?.x)
    ?? finiteOrUndefined(planet.initialRadius)
    ?? 1000;
  const snapshot: PlanetSnapshot = {
    id: planet.id,
    name: planet.customName,
    kind: normalizePlanetKind(planet.planetType, planet.baseColorName),
    position: cloneVec(planet.position) ?? { x: 0, y: 0, z: 0 },
    radius,
    baseColorName: planet.baseColorName,
    probabilityOfLifePct: finiteOrUndefined(planet.probabilityOfLifePct),
    inhabitants: planet.inhabitants,
    lesserBeing: planet.lesserBeing ?? null,
    visited: planet.visited,
    lifeScanned: planet.lifeScanned,
    creatureScanned: planet.creatureScanned,
    hasArtifact: planet.hasArtifact,
    artifactIntelStatus: planet.artifactIntelStatus,
    hasVoidMass: planet.hasVoidMass,
    voidMassCapacity: finiteOrUndefined(planet.voidMassCapacity),
    voidMassRemaining: finiteOrUndefined(planet.voidMassRemaining),
    voidMassIntelStatus: planet.voidMassIntelStatus,
    civilizationIntelStatus: planet.civilizationIntelStatus,
    lesserBeingIntelStatus: planet.lesserBeingIntelStatus,
    pendingMission: planet.pendingMission ? cloneJson(planet.pendingMission) : null,
    resourceStock: planet.resourceStock ? cloneJson(planet.resourceStock) : undefined,
    animosity: planet.animosity,
    axialTiltRad: finiteOrUndefined(planet.axialTiltRad),
    initialRadius: finiteOrUndefined(planet.initialRadius),
  };
  const orbit = captureOrbit(planet);
  if (orbit) {
    snapshot.orbit = orbit;
  }
  return snapshot;
}

/**
 * Aplica los campos persistentes de un snapshot a un planeta YA construido.
 * No construye la subclase ni toca color/escala base: eso es responsabilidad de la
 * factory que llama (applySolarSystemSnapshot conserva los casos especiales).
 * Replica el orden histórico: probabilidad → roll de habitantes → override explícito.
 */
export function applyPlanetSnapshotFields(planet: Planet, p: PlanetSnapshot): void {
  if (p.name) {
    planet.customName = p.name;
  }
  if (typeof p.probabilityOfLifePct === 'number') {
    planet.probabilityOfLifePct = p.probabilityOfLifePct;
  }
  planet.assignInhabitantsFromProbability();
  if (typeof p.inhabitants === 'string') {
    planet.inhabitants = p.inhabitants as PlanetInhabitants;
  }
  if (typeof p.lesserBeing !== 'undefined') {
    planet.lesserBeing = (p.lesserBeing as LesserBeing | null) ?? null;
  }
  if (typeof p.hasArtifact === 'boolean') {
    planet.hasArtifact = p.hasArtifact;
  }
  if (typeof p.artifactIntelStatus === 'string') {
    planet.artifactIntelStatus = p.artifactIntelStatus as PlanetIntelStatus;
  }
  if (typeof p.civilizationIntelStatus === 'string') {
    planet.civilizationIntelStatus = p.civilizationIntelStatus as PlanetIntelStatus;
  }
  if (typeof p.lesserBeingIntelStatus === 'string') {
    planet.lesserBeingIntelStatus = p.lesserBeingIntelStatus as PlanetIntelStatus;
  }
  if (typeof p.pendingMission !== 'undefined') {
    planet.pendingMission = (p.pendingMission as Planet['pendingMission']) ?? null;
  }
  if (p.resourceStock) {
    planet.resourceStock = { ...planet.resourceStock, ...p.resourceStock };
  }
  if (typeof p.visited === 'boolean') {
    planet.visited = p.visited;
  }
  if (typeof p.lifeScanned === 'boolean') {
    planet.lifeScanned = p.lifeScanned;
  }
  if (typeof p.creatureScanned === 'boolean') {
    planet.creatureScanned = p.creatureScanned;
  }
  if (typeof p.animosity === 'string' && typeof (planet as any).setAnimosity === 'function') {
    try { (planet as any).setAnimosity(p.animosity); } catch { /* animosidad inválida: se ignora */ }
  }
  if (p.orbit) {
    planet.orbitCenter = { ...(p.orbit.center ?? { x: 0, y: 0, z: 0 }) };
    planet.semiMajor = p.orbit.semiMajor;
    planet.semiMinor = p.orbit.semiMinor;
    planet.orbitOrientation = p.orbit.orientation ?? 0;
    planet.orbitAngle = p.orbit.angle ?? 0;
    planet.orbitAngularSpeed = p.orbit.angularSpeed ?? planet.orbitAngularSpeed;
    planet.orbitNormal = { ...(p.orbit.normal ?? { x: 0, y: 1, z: 0 }) };
    planet.orbitU = { ...(p.orbit.u ?? { x: 1, y: 0, z: 0 }) };
  }
  // Void mass: preservar capacidad/restante; fallback histórico cuando solo viene el flag.
  const hasVoidMassFields = typeof p.voidMassCapacity === 'number' || typeof p.voidMassRemaining === 'number';
  if (hasVoidMassFields) {
    const capacity = Number.isFinite(p.voidMassCapacity)
      ? Math.max(0, p.voidMassCapacity!)
      : Math.max(0, Number.isFinite(p.voidMassRemaining) ? p.voidMassRemaining! : 0);
    const remaining = Number.isFinite(p.voidMassRemaining) ? Math.max(0, p.voidMassRemaining!) : undefined;
    planet.setVoidMassLevels(capacity, remaining);
  } else if (typeof p.hasVoidMass === 'boolean' && p.hasVoidMass) {
    const fallbackCapacity = Math.max(1, Math.round((planet.initialRadius || 100) * 0.25));
    planet.setVoidMassLevels(fallbackCapacity, fallbackCapacity);
  }
  if (typeof p.voidMassIntelStatus !== 'undefined') {
    planet.voidMassIntelStatus = p.voidMassIntelStatus;
  }
  if (typeof p.axialTiltRad === 'number' && Number.isFinite(p.axialTiltRad)) {
    planet.axialTiltRad = p.axialTiltRad;
  }
}

/**
 * Metadatos `custom` que el pipeline de savegame (SerializedGameObjectState) guarda
 * para un planeta. Escribe los campos canónicos del snapshot y conserva alias legacy
 * (`planetType`, `name`) para que los saves schema 1 sigan siendo legibles.
 */
export function planetCustomMetaFromSnapshot(snapshot: PlanetSnapshot): Record<string, any> {
  const meta: Record<string, any> = {
    name: snapshot.name ?? snapshot.id,
    customName: snapshot.name,
    kind: snapshot.kind,
    planetType: snapshot.kind, // alias legacy (lectores antiguos esperan esta clave)
    baseColorName: snapshot.baseColorName,
    probabilityOfLifePct: snapshot.probabilityOfLifePct,
    inhabitants: snapshot.inhabitants,
    lesserBeing: snapshot.lesserBeing ?? null,
    visited: snapshot.visited,
    lifeScanned: snapshot.lifeScanned,
    creatureScanned: snapshot.creatureScanned,
    hasArtifact: snapshot.hasArtifact,
    artifactIntelStatus: snapshot.artifactIntelStatus,
    hasVoidMass: snapshot.hasVoidMass,
    voidMassCapacity: snapshot.voidMassCapacity,
    voidMassRemaining: snapshot.voidMassRemaining,
    voidMassIntelStatus: snapshot.voidMassIntelStatus,
    civilizationIntelStatus: snapshot.civilizationIntelStatus,
    lesserBeingIntelStatus: snapshot.lesserBeingIntelStatus,
    pendingMission: snapshot.pendingMission ? cloneJson(snapshot.pendingMission) : undefined,
    resourceStock: snapshot.resourceStock ? cloneJson(snapshot.resourceStock) : undefined,
    orbit: snapshot.orbit ? cloneJson(snapshot.orbit) : undefined,
    axialTiltRad: snapshot.axialTiltRad,
    initialRadius: snapshot.initialRadius,
    animosity: snapshot.animosity,
  };
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined) {
      delete meta[key];
    }
  }
  return meta;
}

/**
 * Reconstruye un PlanetSnapshot desde los metadatos `custom` de un savegame.
 * Lee claves canónicas y legacy (saves schema 1 guardaban `planetType` sin normalizar).
 */
export function planetSnapshotFromCustomMeta(
  base: { id: string; position: Vector3; radius: number },
  custom: Record<string, any> | null | undefined
): PlanetSnapshot {
  const meta = custom ?? {};
  const snapshot: PlanetSnapshot = {
    id: base.id,
    name: typeof meta['name'] === 'string' ? meta['name'] : base.id,
    kind: normalizePlanetKind(meta['kind'] ?? meta['planetType'], meta['baseColorName']),
    position: cloneVec(base.position) ?? { x: 0, y: 0, z: 0 },
    radius: base.radius,
  };
  if (typeof meta['baseColorName'] === 'string') snapshot.baseColorName = meta['baseColorName'];
  const probLife = finiteOrUndefined(meta['probabilityOfLifePct']);
  if (probLife !== undefined) snapshot.probabilityOfLifePct = probLife;
  if (meta['inhabitants']) snapshot.inhabitants = meta['inhabitants'];
  if (meta['lesserBeing'] !== undefined) snapshot.lesserBeing = meta['lesserBeing'];
  const visited = boolOrUndefined(meta['visited']);
  if (visited !== undefined) snapshot.visited = visited;
  const lifeScanned = boolOrUndefined(meta['lifeScanned']);
  if (lifeScanned !== undefined) snapshot.lifeScanned = lifeScanned;
  const creatureScanned = boolOrUndefined(meta['creatureScanned']);
  if (creatureScanned !== undefined) snapshot.creatureScanned = creatureScanned;
  const hasArtifact = boolOrUndefined(meta['hasArtifact']);
  if (hasArtifact !== undefined) snapshot.hasArtifact = hasArtifact;
  if (meta['artifactIntelStatus']) snapshot.artifactIntelStatus = meta['artifactIntelStatus'];
  const hasVoidMass = boolOrUndefined(meta['hasVoidMass']);
  if (hasVoidMass !== undefined) snapshot.hasVoidMass = hasVoidMass;
  const voidCapacity = finiteOrUndefined(meta['voidMassCapacity']);
  if (voidCapacity !== undefined) snapshot.voidMassCapacity = voidCapacity;
  const voidRemaining = finiteOrUndefined(meta['voidMassRemaining']);
  if (voidRemaining !== undefined) snapshot.voidMassRemaining = voidRemaining;
  if (meta['voidMassIntelStatus']) snapshot.voidMassIntelStatus = meta['voidMassIntelStatus'];
  if (meta['civilizationIntelStatus']) snapshot.civilizationIntelStatus = meta['civilizationIntelStatus'];
  if (meta['lesserBeingIntelStatus']) snapshot.lesserBeingIntelStatus = meta['lesserBeingIntelStatus'];
  if (meta['pendingMission'] !== undefined) snapshot.pendingMission = cloneJson(meta['pendingMission']);
  if (meta['resourceStock']) snapshot.resourceStock = cloneJson(meta['resourceStock']);
  if (meta['animosity']) snapshot.animosity = meta['animosity'];
  const axialTilt = finiteOrUndefined(meta['axialTiltRad']);
  if (axialTilt !== undefined) snapshot.axialTiltRad = axialTilt;
  const initialRadius = finiteOrUndefined(meta['initialRadius']);
  if (initialRadius !== undefined) snapshot.initialRadius = initialRadius;
  const orbit = normalizeOrbit(meta['orbit']);
  if (orbit) snapshot.orbit = orbit;
  return snapshot;
}

/** true si el objeto es el sol (vive dentro de gameState.planets — ver F4 del análisis). */
export function isSunInstance(planet: Planet): boolean {
  return planet instanceof Sun;
}
