import { TardisCompanionSystem, TardisCompanionHost } from './tardis-companion-system';
import { TardisObject } from '../../game-objects/TardisObject';
import { CargoManifestEntry } from '../../types/inventory.types';
import { Vector3 } from '../../../types/game.types';

interface Calls {
  flash: number; cue: number; destroy: number;
  cargo: CargoManifestEntry[]; marquee: string[];
}

function makeHost(
  shipPos: Vector3 | null,
  opts: { onDestroyReentrant?: TardisCompanionSystem } = {},
): { host: TardisCompanionHost; calls: Calls } {
  const calls: Calls = { flash: 0, cue: 0, destroy: 0, cargo: [], marquee: [] };
  const host: TardisCompanionHost = {
    getShipPosition: () => shipPos,
    spawnVanishFlash: () => { calls.flash++; },
    playVanishCue: () => { calls.cue++; },
    // El motor real llamaría onObjectDestroyed desde su destroyObject: lo simulamos para probar el gateo del premio.
    destroyCompanion: (obj) => { calls.destroy++; opts.onDestroyReentrant?.onObjectDestroyed(obj, host); },
    addCargoEntry: (e) => { calls.cargo.push(e); },
    emitMarquee: (t) => { calls.marquee.push(t); },
    log: () => {},
  };
  return { host, calls };
}

describe('TardisCompanionSystem', () => {
  it('update sin compañera registrada no hace nada', () => {
    const system = new TardisCompanionSystem();
    const { host, calls } = makeHost({ x: 0, y: 0, z: 0 });
    system.update(host);
    expect(calls.destroy).toBe(0);
  });

  it('update fuera de rango NO desvanece', () => {
    const system = new TardisCompanionSystem();
    system.register(new TardisObject('t', { x: 1000, y: 0, z: 0 }));
    const { host, calls } = makeHost({ x: 0, y: 0, z: 0 });
    system.update(host);
    expect(calls.destroy).toBe(0);
    expect(calls.flash).toBe(0);
  });

  it('update dentro de rango desvanece (destello + cue + destrucción)', () => {
    const system = new TardisCompanionSystem();
    system.register(new TardisObject('t', { x: 10, y: 0, z: 0 }));
    const { host, calls } = makeHost({ x: 0, y: 0, z: 0 });
    system.update(host);
    expect(calls.flash).toBe(1);
    expect(calls.cue).toBe(1);
    expect(calls.destroy).toBe(1);
  });

  it('destruir/lotear la TARDIS otorga "Materia oscura de Gallifrey"', () => {
    const system = new TardisCompanionSystem();
    const { host, calls } = makeHost(null);
    system.onObjectDestroyed({ isTardis: true }, host);
    expect(calls.cargo.length).toBe(1);
    expect(calls.cargo[0].label).toBe('Materia oscura de Gallifrey');
    expect(calls.marquee.length).toBe(1);
  });

  it('un objeto que no es la TARDIS no otorga premio', () => {
    const system = new TardisCompanionSystem();
    const { host, calls } = makeHost(null);
    system.onObjectDestroyed({ isTardis: false }, host);
    system.onObjectDestroyed(null, host);
    expect(calls.cargo.length).toBe(0);
  });

  it('la HUIDA por proximidad NO otorga premio (aunque pase por destroyObject)', () => {
    const system = new TardisCompanionSystem();
    system.register(new TardisObject('t', { x: 10, y: 0, z: 0 }));
    const { host, calls } = makeHost({ x: 0, y: 0, z: 0 }, { onDestroyReentrant: system });
    system.update(host);
    expect(calls.destroy).toBe(1);
    expect(calls.cargo.length).toBe(0); // huida ⇒ sin premio
  });
});
