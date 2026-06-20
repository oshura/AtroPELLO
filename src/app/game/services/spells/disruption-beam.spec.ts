import { DisruptionBeam, DisruptionBeamHost } from './disruption-beam';
import { Spaceship } from '../../game-objects/Spaceship';
import { ITargetable } from '../../types/targeting.types';

function makeShip(pos = { x: 0, y: 0, z: 0 }) {
  return { position: { ...pos } } as unknown as Spaceship;
}

function makeHost(ship: Spaceship | null, opts: { isAsteroid?: boolean } = {}) {
  const spies = {
    damage: jasmine.createSpy('applyDamageToObject'),
  };
  const host: DisruptionBeamHost = {
    getSpaceship: () => ship,
    isAsteroidTarget: () => opts.isAsteroid ?? true,
    applyDamageToObject: spies.damage,
    logInfo: () => {},
  };
  return { host, spies };
}

describe('DisruptionBeam', () => {
  it('start activa el haz con duración 1500ms', () => {
    spyOn(performance, 'now').and.returnValue(0);
    const { host } = makeHost(makeShip());
    const beam = new DisruptionBeam();
    beam.start(host, { x: 10, y: 0, z: 0 }, null);

    expect(beam.isActive).toBe(true);
    expect(beam.renderState?.duration).toBe(1500);
  });

  it('update antes de expirar recalcula posiciones y sigue activo', () => {
    spyOn(performance, 'now').and.returnValues(0, 500); // start@0, update@500 (<1500)
    const target = { position: { x: 10, y: 11, z: 12 } } as unknown as ITargetable;
    const { host, spies } = makeHost(makeShip({ x: 1, y: 2, z: 3 }));
    const beam = new DisruptionBeam();
    beam.start(host, { x: 99, y: 99, z: 99 }, target);
    beam.update(host);

    expect(beam.isActive).toBe(true);
    expect(beam.renderState?.startPos).toEqual({ x: 1, y: 2, z: 3 });
    expect(beam.renderState?.endPos).toEqual({ x: 10, y: 11, z: 12 });
    expect(spies.damage).not.toHaveBeenCalled();
  });

  it('al expirar destruye el asteroide y desactiva el haz', () => {
    spyOn(performance, 'now').and.returnValues(0, 2000); // update@2000 > 1500
    const target = { position: { x: 5, y: 0, z: 0 }, healthMax: 250 } as unknown as ITargetable;
    const { host, spies } = makeHost(makeShip(), { isAsteroid: true });
    const beam = new DisruptionBeam();
    beam.start(host, { x: 5, y: 0, z: 0 }, target);
    beam.update(host);

    expect(spies.damage).toHaveBeenCalledWith(target, 250);
    expect(beam.isActive).toBe(false);
  });

  it('al expirar NO daña si el objetivo no es asteroide', () => {
    spyOn(performance, 'now').and.returnValues(0, 2000);
    const target = { position: { x: 5, y: 0, z: 0 } } as unknown as ITargetable;
    const { host, spies } = makeHost(makeShip(), { isAsteroid: false });
    const beam = new DisruptionBeam();
    beam.start(host, { x: 5, y: 0, z: 0 }, target);
    beam.update(host);

    expect(spies.damage).not.toHaveBeenCalled();
    expect(beam.isActive).toBe(false);
  });
});
