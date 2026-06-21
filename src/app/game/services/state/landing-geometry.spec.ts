import {
  getSolarSystemPlanetCenter,
  resolvePlanetCenterFromContext,
  deriveLandingNormalFromContext,
  resolveLandingContactPoint,
  sampleLandingSurfaceContext,
} from './landing-geometry';
import { Planet } from '../../game-objects/Planet';
import { LandingApproachContext } from '../../types/landing.types';

function planetsWith(...entries: Array<{ id: string; position: { x: number; y: number; z: number } }>): Planet[] {
  return entries as unknown as Planet[];
}

describe('landing-geometry', () => {
  describe('getSolarSystemPlanetCenter', () => {
    it('devuelve la posición del planeta encontrado', () => {
      const planets = planetsWith({ id: 'p1', position: { x: 1, y: 2, z: 3 } });
      expect(getSolarSystemPlanetCenter(planets, 'p1')).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('null sin id o si no existe', () => {
      const planets = planetsWith({ id: 'p1', position: { x: 1, y: 2, z: 3 } });
      expect(getSolarSystemPlanetCenter(planets, null)).toBeNull();
      expect(getSolarSystemPlanetCenter(planets, 'nope')).toBeNull();
    });
  });

  describe('resolvePlanetCenterFromContext', () => {
    it('prioriza planetCenter del contexto (copia)', () => {
      const center = { x: 5, y: 5, z: 5 };
      const ctx = { planetCenter: center } as unknown as LandingApproachContext;
      const out = resolvePlanetCenterFromContext([], ctx);
      expect(out).toEqual({ x: 5, y: 5, z: 5 });
      expect(out).not.toBe(center);
    });

    it('cae al centro del planeta por id', () => {
      const planets = planetsWith({ id: 'p1', position: { x: 7, y: 0, z: 0 } });
      const ctx = { planetId: 'p1' } as unknown as LandingApproachContext;
      expect(resolvePlanetCenterFromContext(planets, ctx)).toEqual({ x: 7, y: 0, z: 0 });
    });

    it('deriva el centro desde surfacePoint - normal*radius', () => {
      const ctx = {
        surfacePoint: { x: 0, y: 10, z: 0 },
        surfaceNormal: { x: 0, y: 1, z: 0 },
        radius: 4,
      } as unknown as LandingApproachContext;
      expect(resolvePlanetCenterFromContext([], ctx)).toEqual({ x: 0, y: 6, z: 0 });
    });

    it('null si no hay datos suficientes', () => {
      const ctx = {} as unknown as LandingApproachContext;
      expect(resolvePlanetCenterFromContext([], ctx)).toBeNull();
    });
  });

  describe('deriveLandingNormalFromContext', () => {
    it('normaliza la normal del contexto si existe', () => {
      const ctx = { surfaceNormal: { x: 0, y: 5, z: 0 } } as unknown as LandingApproachContext;
      expect(deriveLandingNormalFromContext([], ctx)).toEqual({ x: 0, y: 1, z: 0 });
    });

    it('deriva la normal desde (surfacePoint − centro del planeta)', () => {
      const planets = planetsWith({ id: 'p1', position: { x: 0, y: 0, z: 0 } });
      const ctx = { planetId: 'p1', surfacePoint: { x: 0, y: 8, z: 0 } } as unknown as LandingApproachContext;
      expect(deriveLandingNormalFromContext(planets, ctx)).toEqual({ x: 0, y: 1, z: 0 });
    });

    it('fallback {0,1,0} sin datos', () => {
      const ctx = {} as unknown as LandingApproachContext;
      expect(deriveLandingNormalFromContext([], ctx)).toEqual({ x: 0, y: 1, z: 0 });
    });
  });

  describe('resolveLandingContactPoint', () => {
    it('usa el surfacePoint del contexto (copia)', () => {
      const surfacePoint = { x: 1, y: 2, z: 3 };
      const ctx = { surfacePoint } as unknown as LandingApproachContext;
      const out = resolveLandingContactPoint([], ctx);
      expect(out).toEqual({ x: 1, y: 2, z: 3 });
      expect(out).not.toBe(surfacePoint);
    });

    it('deriva el contacto como centro + normal·radio', () => {
      const planets = planetsWith({ id: 'p1', position: { x: 0, y: 0, z: 0 } });
      const ctx = { planetId: 'p1', surfaceNormal: { x: 0, y: 1, z: 0 }, radius: 6 } as unknown as LandingApproachContext;
      expect(resolveLandingContactPoint(planets, ctx)).toEqual({ x: 0, y: 6, z: 0 });
    });
  });

  describe('sampleLandingSurfaceContext', () => {
    it('surfacePoint = centro + normal·radio (radio ≥ baseSurfaceRadius)', () => {
      const ctx = { radius: 100 } as unknown as LandingApproachContext;
      const out = sampleLandingSurfaceContext(ctx, {
        normal: { x: 0, y: 1, z: 0 },
        planetCenter: { x: 0, y: 0, z: 0 },
        stateGroundRadius: 600,
        stateCollisionRadius: 0,
        terrainSeed: 1234,
        detailFactor: 1,
      });
      const radius = out.radius as number;
      expect(radius).toBeGreaterThanOrEqual(600); // base = max(1,600,0,100)
      expect(out.surfaceNormal).toEqual({ x: 0, y: 1, z: 0 });
      expect((out.surfacePoint as { y: number }).y).toBeCloseTo(radius, 5); // centro.y(0) + normal.y(1)·radio
      expect((out.surfacePoint as { x: number }).x).toBeCloseTo(0, 5);
      expect(out.planetCenter).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('sin centro lo deriva desde surfacePoint y mantiene la normal', () => {
      const ctx = { radius: 50, surfacePoint: { x: 0, y: 100, z: 0 } } as unknown as LandingApproachContext;
      const out = sampleLandingSurfaceContext(ctx, {
        normal: { x: 0, y: 1, z: 0 },
        planetCenter: null,
        stateGroundRadius: 0,
        stateCollisionRadius: 0,
        terrainSeed: 0,
        detailFactor: 1,
      });
      expect(out.planetCenter).toBeTruthy();
      expect(out.surfaceNormal).toEqual({ x: 0, y: 1, z: 0 });
    });
  });
});
