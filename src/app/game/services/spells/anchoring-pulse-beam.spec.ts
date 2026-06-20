import { AnchoringPulseBeam, AnchoringPulseBeamHost } from './anchoring-pulse-beam';
import { Spaceship } from '../../game-objects/Spaceship';
import { Asteroid } from '../../game-objects/Asteroid';

function makeShip(pos = { x: 0, y: 0, z: 0 }) {
  return { position: { ...pos } } as unknown as Spaceship;
}

function makeAsteroid(pos: { x: number; y: number; z: number }) {
  return {
    id: 'ast-1',
    position: { ...pos },
    velocity: { x: 5, y: 5, z: 5 },
    angularVelocity: { x: 1, y: 1, z: 1 },
    boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 1 },
    isActive: () => true,
    updateModelMatrix: jasmine.createSpy('updateModelMatrix'),
  };
}

type FakeAsteroid = ReturnType<typeof makeAsteroid>;

function makeHost(ship: Spaceship | null, asteroid: FakeAsteroid | null, opts: { converts?: boolean } = {}) {
  const spies = {
    makeIndependent: jasmine.createSpy('makeAsteroidIndependent'),
    convert: jasmine.createSpy('convertAsteroidToCargo').and.returnValue(opts.converts ?? true),
  };
  const host: AnchoringPulseBeamHost = {
    getSpaceship: () => ship,
    getTargetPosition: (t) => ({ ...(t as unknown as FakeAsteroid).position }),
    makeAsteroidIndependent: spies.makeIndependent,
    isAsteroidTarget: (t): t is Asteroid => !!t,
    convertAsteroidToCargo: spies.convert,
    logInfo: () => {},
  };
  return { host, spies, asteroid };
}

describe('AnchoringPulseBeam', () => {
  it('start activa el haz y marca el asteroide independiente', () => {
    const ast = makeAsteroid({ x: 10, y: 0, z: 0 });
    const { host, spies } = makeHost(makeShip(), ast);
    const beam = new AnchoringPulseBeam();
    beam.start(host, ast as unknown as Asteroid);

    expect(beam.isActive).toBe(true);
    expect(beam.renderState).not.toBeNull();
    expect(spies.makeIndependent).toHaveBeenCalled();
  });

  it('update arrastra el asteroide hacia la nave', () => {
    const ast = makeAsteroid({ x: 10, y: 0, z: 0 });
    const { host } = makeHost(makeShip(), ast);
    const beam = new AnchoringPulseBeam();
    beam.start(host, ast as unknown as Asteroid);
    beam.update(host, 1.0); // pullSpeed 2.0 · dt 1 = step 2; dist 10 ⇒ ratio 0.2 ⇒ −2 en x

    expect(ast.position.x).toBeCloseTo(8, 5);
    expect(ast.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(ast.updateModelMatrix).toHaveBeenCalled();
  });

  it('update captura y convierte cuando entra en captureRadius', () => {
    const ast = makeAsteroid({ x: 3, y: 0, z: 0 }); // dist 3 < captureRadius 4.5
    const { host, spies } = makeHost(makeShip(), ast, { converts: true });
    const beam = new AnchoringPulseBeam();
    beam.start(host, ast as unknown as Asteroid);
    beam.update(host, 0.016);

    expect(spies.convert).toHaveBeenCalled();
    expect(beam.isActive).toBe(false);
  });

  it('update cancela si el objetivo deja de estar activo', () => {
    const ast = makeAsteroid({ x: 10, y: 0, z: 0 });
    ast.isActive = () => false;
    const { host } = makeHost(makeShip(), ast);
    const beam = new AnchoringPulseBeam();
    beam.start(host, ast as unknown as Asteroid);
    beam.update(host, 0.016);

    expect(beam.isActive).toBe(false);
  });
});
