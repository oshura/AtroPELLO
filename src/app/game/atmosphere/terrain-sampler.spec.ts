import {
  ATMOSPHERE_TERRAIN_LAT_SEGMENTS,
  ATMOSPHERE_TERRAIN_LON_SEGMENTS,
  computeDetailMultiplier,
  computeVertexUnitRadius,
  getTerrainField,
  sampleAtmosphereSurfaceRadius,
  sampleTerrainVertex,
  terrainSeedFromPlanetId,
} from './terrain-sampler';

describe('terrain-sampler', () => {
  const GROUND_RADIUS = 4500;

  it('es determinista: misma semilla y dirección dan el mismo radio', () => {
    const seed = terrainSeedFromPlanetId('planet-spec-99');
    const offset = { x: 0.3, y: 0.85, z: -0.42 };
    const a = sampleAtmosphereSurfaceRadius({ offset, groundRadius: GROUND_RADIUS, detailFactor: 1, seed });
    const b = sampleAtmosphereSurfaceRadius({ offset, groundRadius: GROUND_RADIUS, detailFactor: 1, seed });
    expect(a).toBe(b);
    expect(Number.isFinite(a)).toBeTrue();
  });

  it('semillas distintas producen terrenos distintos', () => {
    const offset = { x: 0.3, y: 0.4, z: 0.86 };
    const a = sampleAtmosphereSurfaceRadius({
      offset, groundRadius: GROUND_RADIUS, detailFactor: 1,
      seed: terrainSeedFromPlanetId('planet-a'),
    });
    const b = sampleAtmosphereSurfaceRadius({
      offset, groundRadius: GROUND_RADIUS, detailFactor: 1,
      seed: terrainSeedFromPlanetId('planet-b'),
    });
    expect(a).not.toBe(b);
  });

  it('la colisión coincide EXACTAMENTE con los vértices de la malla renderizada', () => {
    // Misma fórmula de vértice que AtmosphereSceneManager.buildSphere: en la dirección
    // exacta de un vértice, el rayo debe devolver el radio de ese vértice.
    const seed = terrainSeedFromPlanetId('planet-mesh-check');
    const field = getTerrainField(seed);
    const detailFactor = 0.65;
    for (const [lat, lon] of [[5, 3], [12, 20], [20, 47], [27, 60]] as Array<[number, number]>) {
      const theta = (lat / ATMOSPHERE_TERRAIN_LAT_SEGMENTS) * Math.PI;
      const phi = (lon / ATMOSPHERE_TERRAIN_LON_SEGMENTS) * Math.PI * 2;
      const dir = {
        x: Math.cos(phi) * Math.sin(theta),
        y: Math.cos(theta),
        z: Math.sin(phi) * Math.sin(theta),
      };
      const vertex = sampleTerrainVertex(field, theta, phi);
      const expected = GROUND_RADIUS
        * computeVertexUnitRadius(vertex.relief)
        * computeDetailMultiplier(vertex.micro01, detailFactor);
      const sampled = sampleAtmosphereSurfaceRadius({
        offset: { x: dir.x * 123, y: dir.y * 123, z: dir.z * 123 }, // la magnitud no importa
        groundRadius: GROUND_RADIUS,
        detailFactor,
        seed,
      });
      expect(Math.abs(sampled - expected) / expected).toBeLessThan(1e-6);
    }
  });

  it('el relieve queda acotado por la escala configurada (sin picos imposibles)', () => {
    const seed = terrainSeedFromPlanetId('planet-bounds');
    for (let i = 0; i < 200; i++) {
      const u = (i * 0.137) % 1;
      const v = (i * 0.311) % 1;
      const theta = u * Math.PI;
      const phi = v * Math.PI * 2;
      const offset = {
        x: Math.cos(phi) * Math.sin(theta),
        y: Math.cos(theta),
        z: Math.sin(phi) * Math.sin(theta),
      };
      const r = sampleAtmosphereSurfaceRadius({ offset, groundRadius: GROUND_RADIUS, detailFactor: 1, seed });
      // relieve ±8% y micro-detalle ±4% ⇒ holgura del 13% es imposible de superar
      expect(r).toBeGreaterThan(GROUND_RADIUS * 0.87);
      expect(r).toBeLessThan(GROUND_RADIUS * 1.13);
    }
  });

  it('semilla 0 reproduce el terreno legacy (fases históricas)', () => {
    const field = getTerrainField(0);
    expect(field.o2t).toBe(1.3);
    expect(field.o2p).toBe(-0.7);
    expect(field.o3t).toBe(2.1);
    expect(field.o3p).toBe(1.9);
  });

  it('terrainSeedFromPlanetId es estable y maneja nulos', () => {
    expect(terrainSeedFromPlanetId('planet-earth')).toBe(terrainSeedFromPlanetId('planet-earth'));
    expect(terrainSeedFromPlanetId(null)).toBe(0);
    expect(terrainSeedFromPlanetId(undefined)).toBe(0);
    expect(terrainSeedFromPlanetId('')).toBe(0);
  });
});
