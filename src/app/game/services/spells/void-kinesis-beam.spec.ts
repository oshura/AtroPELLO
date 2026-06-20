import { VoidKinesisBeam, VoidKinesisBeamHost } from './void-kinesis-beam';
import { Spaceship } from '../../game-objects/Spaceship';
import { Asteroid } from '../../game-objects/Asteroid';

function makeShip(pos = { x: 0, y: 0, z: 0 }) {
  return { position: { ...pos } } as unknown as Spaceship;
}

function makeAsteroid() {
  return {
    id: 'ast-1',
    position: { x: 10, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    size: 2,
    isActive: () => true,
    boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 4 },
    updateModelMatrix: jasmine.createSpy('updateModelMatrix'),
  };
}

type FakeAsteroid = ReturnType<typeof makeAsteroid>;

function makeHost(ship: Spaceship | null) {
  const spies = { resolve: jasmine.createSpy('resolveConversion') };
  const host: VoidKinesisBeamHost = {
    getSpaceship: () => ship,
    isAsteroidTarget: () => true,
    resolveConversion: spies.resolve,
    logInfo: () => {},
  };
  return { host, spies };
}

describe('VoidKinesisBeam', () => {
  it('start activa el haz', () => {
    spyOn(performance, 'now').and.returnValue(0);
    const { host } = makeHost(makeShip());
    const beam = new VoidKinesisBeam();
    beam.start(host, { x: 10, y: 0, z: 0 }, makeAsteroid() as unknown as Asteroid);

    expect(beam.isActive).toBe(true);
    expect(beam.renderState).not.toBeNull();
  });

  it('update encoge la escala y el tamaño del asteroide', () => {
    spyOn(performance, 'now').and.returnValues(0, 100); // start@0, update@100 (<6000)
    const ast = makeAsteroid();
    const { host, spies } = makeHost(makeShip());
    const beam = new VoidKinesisBeam();
    beam.start(host, { x: 10, y: 0, z: 0 }, ast as unknown as Asteroid);
    beam.update(host, 0.1); // shrinkAmount 0.085 ⇒ scalar 0.915

    expect(ast.scale.x).toBeCloseTo(2 * 0.915, 4);
    expect(ast.size).toBeCloseTo(2 * 0.915, 4);
    expect(ast.updateModelMatrix).toHaveBeenCalled();
    expect(spies.resolve).not.toHaveBeenCalled();
    expect(beam.isActive).toBe(true);
  });

  it('al expirar (6s) convierte y desactiva el haz', () => {
    spyOn(performance, 'now').and.returnValues(0, 7000); // update@7000 > 6000
    const ast = makeAsteroid();
    const { host, spies } = makeHost(makeShip());
    const beam = new VoidKinesisBeam();
    beam.start(host, { x: 10, y: 0, z: 0 }, ast as unknown as Asteroid);
    beam.update(host, 0.016);

    expect(spies.resolve).toHaveBeenCalledWith(ast as unknown as Asteroid);
    expect(beam.isActive).toBe(false);
  });

  it('se cancela si el objetivo deja de estar activo', () => {
    spyOn(performance, 'now').and.returnValues(0, 100);
    const ast = makeAsteroid();
    ast.isActive = () => false;
    const { host, spies } = makeHost(makeShip());
    const beam = new VoidKinesisBeam();
    beam.start(host, { x: 10, y: 0, z: 0 }, ast as unknown as Asteroid);
    beam.update(host, 0.1);

    expect(beam.isActive).toBe(false);
    expect(spies.resolve).not.toHaveBeenCalled();
  });
});
