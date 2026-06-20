import {
  capturePlanetSnapshot,
  applyPlanetSnapshotFields,
  planetCustomMetaFromSnapshot,
  planetSnapshotFromCustomMeta,
  normalizePlanetKind,
} from './planet-state.codec';
import { Planet, PlanetType } from '../../game-objects/Planet';
import { PlanetInhabitants, LesserBeing } from '../../types/cosmic-life.types';
import { PLANET_INTEL_STATUS } from '../../types/planet-intel.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

/**
 * "La prueba del campo nuevo" (docs/ARQUITECTURA.md §6.5):
 * capturar → aplicar → capturar debe ser idéntico. Si añades un campo persistente al
 * códec y este test sigue en verde sin tocar nada más, la arquitectura está sana.
 */
describe('planet-state.codec', () => {
  function buildFullyPopulatedPlanet(): Planet {
    const planet = new Planet('planet-spec-1', 'verde', 400, { x: 1200, y: -300, z: 9000 });
    planet.customName = 'Korinth b';
    planet.planetType = PlanetType.Ringed;
    planet.probabilityOfLifePct = 64;
    const inhabitants = Object.values(PlanetInhabitants).find(v => v !== PlanetInhabitants.NONE);
    if (inhabitants) {
      planet.inhabitants = inhabitants;
    }
    const being = Object.values(LesserBeing).find(v => v !== LesserBeing.NONE);
    planet.lesserBeing = being ?? null;
    planet.visited = true;
    planet.lifeScanned = true;
    planet.creatureScanned = false;
    planet.hasArtifact = true;
    const statuses = Object.values(PLANET_INTEL_STATUS);
    const knownStatus = statuses[statuses.length - 1];
    planet.artifactIntelStatus = knownStatus;
    planet.voidMassIntelStatus = knownStatus;
    planet.civilizationIntelStatus = knownStatus;
    planet.lesserBeingIntelStatus = knownStatus;
    planet.pendingMission = { id: 'mission-spec-1', title: 'Spec mission' } as any;
    const rsKeys = Object.keys(planet.resourceStock);
    if (rsKeys.length) {
      (planet.resourceStock as any)[rsKeys[0]] = 7;
    }
    (planet as any).setAnimosity?.(GameObjectAnimosity.ENEMY);
    planet.axialTiltRad = 0.42;
    planet.orbitCenter = { x: 10, y: 20, z: 30 };
    planet.semiMajor = 50000;
    planet.semiMinor = 42000;
    planet.orbitOrientation = 0.3;
    planet.orbitAngle = 1.7;
    planet.orbitAngularSpeed = 0.00004;
    planet.orbitNormal = { x: 0, y: 0.8, z: 0.6 };
    planet.orbitU = { x: 0.6, y: 0, z: 0.8 };
    // Void mass parcialmente cosechada: encoge el radio visible (caso del doble-encogimiento).
    planet.setVoidMassLevels(500, 320);
    return planet;
  }

  /** Reconstrucción equivalente a la factory de applySolarSystemSnapshot. */
  function rebuildFromSnapshot(snap: ReturnType<typeof capturePlanetSnapshot>): Planet {
    const constructionRadius = snap.initialRadius ?? snap.radius;
    const rebuilt = new Planet(snap.id, (snap.baseColorName as any) ?? 'marron', constructionRadius, { ...snap.position });
    rebuilt.planetType = PlanetType.Ringed; // la subclase la decide la factory según `kind`
    applyPlanetSnapshotFields(rebuilt, snap);
    return rebuilt;
  }

  it('round-trip capturar → aplicar → capturar es idéntico (prueba del campo nuevo)', () => {
    const original = buildFullyPopulatedPlanet();
    const snap1 = capturePlanetSnapshot(original);
    const rebuilt = rebuildFromSnapshot(snap1);
    const snap2 = capturePlanetSnapshot(rebuilt);
    expect(snap2).toEqual(snap1);
  });

  it('el radio visible no se encoge dos veces al re-aplicar void mass cosechada', () => {
    const original = buildFullyPopulatedPlanet();
    expect(original.scale.x).toBeCloseTo(400 * (320 / 500), 6);
    const snap = capturePlanetSnapshot(original);
    expect(snap.initialRadius).toBe(400);
    const rebuilt = rebuildFromSnapshot(snap);
    expect(rebuilt.scale.x).toBeCloseTo(original.scale.x, 6);
  });

  it('round-trip por metadatos custom del savegame conserva todos los campos', () => {
    const original = buildFullyPopulatedPlanet();
    const snap1 = capturePlanetSnapshot(original);
    const custom = planetCustomMetaFromSnapshot(snap1);
    const snap2 = planetSnapshotFromCustomMeta(
      { id: snap1.id, position: { ...snap1.position }, radius: snap1.radius },
      custom
    );
    expect(snap2).toEqual(snap1);
  });

  it('lee metadatos legacy (clave planetType sin normalizar, saves schema 1)', () => {
    const snap = planetSnapshotFromCustomMeta(
      { id: 'p-legacy', position: { x: 0, y: 0, z: 0 }, radius: 250 },
      { planetType: 'Tierra', baseColorName: 'azul_marino', visited: true }
    );
    // 'Tierra' (planetType de EarthSplitPlanet) ⇒ kind 'earth_split' data-driven (Fase 6.4): los saves
    // schema 1 que conservaron el planetType sin normalizar reconstruyen la Tierra partida por el kind.
    expect(snap.kind).toBe('earth_split');
    expect(snap.visited).toBeTrue();
  });

  it('migra la Tierra canónica histórica (id) a kind earth_split aunque venga como terrestrial', () => {
    const snap = planetSnapshotFromCustomMeta(
      { id: 'planet-earth', position: { x: 0, y: 0, z: 0 }, radius: 400 },
      { kind: 'terrestrial', planetType: 'terrestrial', baseColorName: 'azul_marino' }
    );
    expect(snap.kind).toBe('earth_split');
  });

  it('normaliza todas las variantes históricas de kind', () => {
    // 'Tierra' es el planetType de EarthSplitPlanet ⇒ kind data-driven 'earth_split' (Fase 6.4).
    expect(normalizePlanetKind('Tierra')).toBe('earth_split');
    expect(normalizePlanetKind('earth_split')).toBe('earth_split');
    expect(normalizePlanetKind('Planetoid')).toBe('rocky');
    expect(normalizePlanetKind('Ringed')).toBe('ringed');
    expect(normalizePlanetKind('SUN')).toBe('sun');
    expect(normalizePlanetKind('', 'azul_marino')).toBe('terrestrial');
    expect(normalizePlanetKind(undefined)).toBeUndefined();
  });
});
