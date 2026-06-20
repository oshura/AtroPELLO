import { LandingEvaluator, LandingEvaluatorHost } from './landing-evaluator';
import { Spaceship } from '../../game-objects/Spaceship';
import { Planet } from '../../game-objects/Planet';
import { ITargetable } from '../../types/targeting.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

function makeShip(position: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number }, speed: number) {
  return { position, forwardDirection: forward, currentSpeed: speed } as unknown as Spaceship;
}

function makePlanet(id: string, position: { x: number; y: number; z: number }, radius: number) {
  return {
    id,
    position,
    scale: { x: radius, y: radius, z: radius },
    planetType: undefined,
    getDisplayName: () => `Planeta ${id}`,
  } as unknown as Planet;
}

function makeHost(ship: Spaceship | null, planets: Planet[]): LandingEvaluatorHost {
  return {
    getSpaceship: () => ship,
    getPlanets: () => planets,
    isAtmosphereSceneActive: () => false,
    getAtmosphereContext: () => null,
    getAtmosphereGroundRadius: () => 0,
    computeAltitudeAboveGround: () => 0,
    deriveLandingNormalFromContext: () => ({ x: 0, y: 1, z: 0 }),
    resolvePlanetCenterFromContext: () => null,
    resolveLandingContactPoint: () => ({ x: 0, y: 0, z: 0 }),
    onThreatCheckFailed: () => {},
  };
}

describe('LandingEvaluator', () => {
  describe('computeStatus', () => {
    it('sin nave o sin planetas no está listo', () => {
      const evalr = new LandingEvaluator();
      expect(evalr.computeStatus(makeHost(null, [makePlanet('a', { x: 0, y: 0, z: 0 }, 100)])).ready).toBe(false);
      expect(evalr.computeStatus(makeHost(makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0), [])).ready).toBe(false);
    });

    it('planeta lejano: no listo pero con contexto del más cercano', () => {
      const evalr = new LandingEvaluator();
      const ship = makeShip({ x: 0, y: 0, z: 1000 }, { x: 1, y: 0, z: 0 }, 0);
      const status = evalr.computeStatus(makeHost(ship, [makePlanet('a', { x: 0, y: 0, z: 0 }, 100)]));
      expect(status.ready).toBe(false);
      expect(status.context?.planetId).toBe('a');
    });

    it('cumpliendo umbrales: listo solo tras mantener el hold de 3s', () => {
      const evalr = new LandingEvaluator();
      // nave perpendicular a la superficie, a 10u, sin velocidad
      const ship = makeShip({ x: 0, y: 0, z: 110 }, { x: 1, y: 0, z: 0 }, 1);
      const planet = makePlanet('a', { x: 0, y: 0, z: 0 }, 100);
      const host = makeHost(ship, [planet]);

      spyOn(performance, 'now').and.returnValues(1000, 5000);

      const first = evalr.computeStatus(host); // t=1000: arranca el candidato
      expect(first.ready).toBe(false);
      expect(first.context?.distanceToSurface).toBeCloseTo(10, 6);

      const second = evalr.computeStatus(host); // t=5000: 4s >= 3s ⇒ listo
      expect(second.ready).toBe(true);
    });

    it('si deja de cumplir, el candidato se reinicia', () => {
      const evalr = new LandingEvaluator();
      const planet = makePlanet('a', { x: 0, y: 0, z: 0 }, 100);
      spyOn(performance, 'now').and.returnValues(1000, 5000);

      evalr.computeStatus(makeHost(makeShip({ x: 0, y: 0, z: 110 }, { x: 1, y: 0, z: 0 }, 1), [planet]));
      // ahora demasiado rápido ⇒ no cumple velocidad ⇒ no listo aunque haya pasado el tiempo
      const status = evalr.computeStatus(makeHost(makeShip({ x: 0, y: 0, z: 110 }, { x: 1, y: 0, z: 0 }, 50), [planet]));
      expect(status.ready).toBe(false);
    });
  });

  describe('computeThreat', () => {
    function enemy(pos: { x: number; y: number; z: number }, name: string): ITargetable {
      return { position: pos, animosity: GameObjectAnimosity.ENEMY, getDisplayName: () => name } as unknown as ITargetable;
    }
    function neutral(pos: { x: number; y: number; z: number }): ITargetable {
      return { position: pos, animosity: GameObjectAnimosity.NEUTRAL } as unknown as ITargetable;
    }

    it('enemigo cercano activa la amenaza con etiqueta y distancia', () => {
      const evalr = new LandingEvaluator();
      const host = makeHost(makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0), []);
      const threat = evalr.computeThreat([enemy({ x: 0, y: 0, z: 100 }, 'Bicho')], host);
      expect(threat.active).toBe(true);
      expect(threat.reasons[0]).toBe('Bicho a 100u');
    });

    it('enemigo lejano o no-enemigo no activan amenaza', () => {
      const evalr = new LandingEvaluator();
      const host = makeHost(makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0), []);
      expect(evalr.computeThreat([enemy({ x: 0, y: 0, z: 600 }, 'Lejos')], host).active).toBe(false);
      expect(evalr.computeThreat([neutral({ x: 0, y: 0, z: 10 })], host).active).toBe(false);
    });
  });
});
