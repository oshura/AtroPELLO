import { PlanetDrainBeam, PlanetDrainBeamHost, PLANET_DRAIN_DURATION_SEC } from './planet-drain-beam';
import { Planet } from '../../game-objects/Planet';
import { Spaceship } from '../../game-objects/Spaceship';

/**
 * Void Kinesis sobre planetas (Fase 15): el canal encoge el mundo, transfiere su void mass a la
 * nave y al consumarse el host lo retira del sistema.
 */
describe('PlanetDrainBeam', () => {
  function makePlanet(voidMass = 600): Planet {
    const planet = new Planet('drain-target', 'gris', 50, { x: 100, y: 0, z: 0 });
    planet.voidMassUnits = voidMass;
    return planet;
  }

  function makeHost(planet: Planet) {
    const ship = new Spaceship({ x: 0, y: 0, z: 0 });
    const state = {
      alive: true,
      energyAdded: 0,
      consumed: [] as string[],
    };
    const host: PlanetDrainBeamHost = {
      getSpaceship: () => ship,
      isPlanetAlive: () => state.alive,
      addVoidEnergy: amount => {
        state.energyAdded += amount;
        return amount;
      },
      consumePlanet: p => {
        state.consumed.push(p.id);
        state.alive = false;
      },
      logInfo: () => undefined,
    };
    return { host, state, ship };
  }

  it('el canal completo transfiere TODA la void mass y consuma el planeta', () => {
    const planet = makePlanet(600);
    const { host, state } = makeHost(planet);
    const beam = new PlanetDrainBeam();

    expect(beam.start(host, planet)).toBe(true);
    for (let t = 0; t < PLANET_DRAIN_DURATION_SEC + 1; t += 0.25) {
      beam.update(host, 0.25);
    }

    expect(state.consumed).toEqual(['drain-target']);
    expect(state.energyAdded).toBe(600);
    expect(beam.isActive).toBe(false);
  });

  it('el planeta encoge durante el canal (y el encogido se acelera al final)', () => {
    const planet = makePlanet();
    const { host } = makeHost(planet);
    const beam = new PlanetDrainBeam();
    beam.start(host, planet);

    const originalScale = planet.scale.x;
    beam.update(host, PLANET_DRAIN_DURATION_SEC * 0.5);
    const midScale = planet.scale.x;
    beam.update(host, PLANET_DRAIN_DURATION_SEC * 0.4);
    const lateScale = planet.scale.x;

    expect(midScale).toBeLessThan(originalScale);
    expect(lateScale).toBeLessThan(midScale);
    // Curva cuadrática: la primera mitad del canal encoge menos que el 40 % final.
    expect(originalScale - midScale).toBeLessThan(midScale - lateScale);
  });

  it('la transferencia es proporcional al avance, no un pago único al final', () => {
    const planet = makePlanet(1000);
    const { host, state } = makeHost(planet);
    const beam = new PlanetDrainBeam();
    beam.start(host, planet);

    beam.update(host, PLANET_DRAIN_DURATION_SEC * 0.5);
    expect(state.energyAdded).toBe(500);
    expect(state.consumed.length).toBe(0);
  });

  it('si el planeta desaparece a mitad de canal (otro rito), el haz se apaga sin consumar', () => {
    const planet = makePlanet();
    const { host, state } = makeHost(planet);
    const beam = new PlanetDrainBeam();
    beam.start(host, planet);

    beam.update(host, 2);
    state.alive = false;
    beam.update(host, 2);

    expect(beam.isActive).toBe(false);
    expect(state.consumed.length).toBe(0);
  });

  it('no se puede canalizar dos drenajes a la vez', () => {
    const planet = makePlanet();
    const { host } = makeHost(planet);
    const beam = new PlanetDrainBeam();

    expect(beam.start(host, planet)).toBe(true);
    expect(beam.start(host, makePlanet())).toBe(false);
    expect(beam.drainingPlanetId).toBe('drain-target');
  });

  it('cancelar deja el mundo a medio beber, sin consecuencias', () => {
    const planet = makePlanet();
    const { host, state } = makeHost(planet);
    const beam = new PlanetDrainBeam();
    beam.start(host, planet);
    beam.update(host, 5);

    beam.cancel();
    beam.update(host, 30);

    expect(state.consumed.length).toBe(0);
    expect(planet.scale.x).toBeLessThan(50);
  });
});
