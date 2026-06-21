import { SpaceTurtleSystem, SpaceTurtleHost } from './space-turtle-system';
import { Vector3 } from '../../../types/game.types';

function makeHost(opts: { sun?: Vector3 | null; radius?: number; ready?: boolean; dir?: Vector3; roll?: number } = {}) {
  const calls = { dust: 0, logs: [] as string[], cargo: [] as Array<{ id: string; label: string }> };
  const host: SpaceTurtleHost = {
    getSunPosition: () => (opts.sun === null ? null : (opts.sun ?? { x: 0, y: 0, z: 0 })),
    getSystemRadius: () => opts.radius ?? 1000,
    isReadyForSpawn: () => opts.ready ?? true,
    randomUnitDirection: () => opts.dir ?? { x: 0, y: 0, z: 1 },
    spawnDust: () => { calls.dust++; },
    announce: () => {},
    addCargoEntry: (e) => { calls.cargo.push(e); },
    rollD100: () => opts.roll ?? 1, // por defecto saca 1 (<=10 ⇒ aparece)
    logInfo: (m) => { calls.logs.push(m); },
  };
  return { host, calls };
}

// La tirada es cada 5 min (300s): avanzamos en pasos grandes hasta que aparezca (o agotamos el margen).
function stepUntilSpawn(system: SpaceTurtleSystem, host: SpaceTurtleHost): boolean {
  for (let i = 0; i < 80 && !system.getRenderable(); i++) system.update(host, 10);
  return !!system.getRenderable();
}

describe('SpaceTurtleSystem', () => {
  it('sin sol no aparece tortuga', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost({ sun: null });
    for (let i = 0; i < 80; i++) system.update(host, 10);
    expect(system.getRenderable()).toBeNull();
  });

  it('aparece tras una tirada exitosa, en la linde (radio del sistema)', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost({ radius: 1000, dir: { x: 0, y: 0, z: 1 }, roll: 1 });
    expect(stepUntilSpawn(system, host)).toBe(true);
    const t = system.getRenderable()!;
    expect(Math.hypot(t.position.x, t.position.y, t.position.z)).toBeCloseTo(1000, 0);
  });

  it('una tirada > 10 (D100) NO la hace aparecer', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost({ roll: 11 }); // 11 > 10 ⇒ no aparece
    expect(stepUntilSpawn(system, host)).toBe(false);
  });

  it('no aparece si no está listo (sistema humano / cinemática)', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost({ ready: false });
    expect(stepUntilSpawn(system, host)).toBe(false);
  });

  it('viaja, suelta polvo, cruza el sol acelerando y desaparece en la linde', () => {
    const system = new SpaceTurtleSystem();
    const { host, calls } = makeHost({ radius: 1000, dir: { x: 0, y: 0, z: 1 } });
    expect(stepUntilSpawn(system, host)).toBe(true);
    for (let i = 0; i < 600 && system.getRenderable(); i++) system.update(host, 0.05);
    expect(calls.dust).toBeGreaterThan(0);
    expect(calls.logs).toContain('Space turtle crossed the sun');
    expect(calls.logs).toContain('Space turtle left the system');
    expect(system.getRenderable()).toBeNull();
  });

  it('notifyDestroyed otorga el "Caparazón de Tortuga espacial" y la retira', () => {
    const system = new SpaceTurtleSystem();
    const { host, calls } = makeHost();
    expect(stepUntilSpawn(system, host)).toBe(true);
    system.notifyDestroyed(host);
    expect(calls.cargo.length).toBe(1);
    expect(calls.cargo[0].label).toBe('Caparazón de Tortuga espacial');
    expect(system.getRenderable()).toBeNull();
  });

  it('refresca el boundingSphere al moverse (para que la selección la siga, no se quede en el origen)', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost({ radius: 1000, dir: { x: 0, y: 0, z: 1 } });
    expect(stepUntilSpawn(system, host)).toBe(true);
    const t = system.getRenderable()!;
    system.update(host, 0.2); // avanza hacia el sol
    expect(t.boundingSphere).not.toBeNull();
    expect(t.boundingSphere!.center.z).toBeCloseTo(t.position.z, 3);
    expect(t.position.z).toBeLessThan(1000); // se ha movido desde el origen
  });

  it('clear elimina la tortuga y reinicia', () => {
    const system = new SpaceTurtleSystem();
    const { host } = makeHost();
    expect(stepUntilSpawn(system, host)).toBe(true);
    system.clear();
    expect(system.getRenderable()).toBeNull();
  });
});
