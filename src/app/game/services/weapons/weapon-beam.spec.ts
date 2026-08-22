import { WeaponBeam, WeaponBeamHost } from './weapon-beam';
import { ProjectileTargetLike } from './projectile-system';
import { getWeaponDefinition } from '../../config/weapon-catalog.config';
import { WeaponDefinition } from '../../types/weapon.types';

function makeHost(targets: ProjectileTargetLike[] = [], energy = 100) {
  const damages: Array<{ targetId: string; damage: number }> = [];
  const warnings: string[] = [];
  let voidEnergy = energy;
  const host: WeaponBeamHost = {
    getTargets: () => targets,
    applyBeamDamage: (targetId, damage) => {
      damages.push({ targetId, damage });
      return damage;
    },
    consumeVoidEnergy: (amount) => {
      if (voidEnergy < amount) return false;
      voidEnergy -= amount;
      return true;
    },
    emitWarning: (message) => warnings.push(message),
    logInfo: () => undefined,
  };
  return { host, damages, warnings, get voidEnergy() { return voidEnergy; } };
}

const ORIGIN = { x: 0, y: 0, z: 0 };
const FORWARD = { x: 0, y: 0, z: 1 };

function voidRay(): WeaponDefinition {
  return getWeaponDefinition('VOID_RAY')!;
}

describe('WeaponBeam', () => {
  it('no arranca con un arma que no es de haz', () => {
    const beam = new WeaponBeam();
    expect(beam.start(getWeaponDefinition('GAUSS_ICE')!)).toBe(false);
    expect(beam.isActive).toBe(false);
    expect(beam.renderState).toBeNull();
  });

  it('arranca, alcanza su rango completo sin blanco y no hace daño', () => {
    const beam = new WeaponBeam();
    const { host, damages } = makeHost();
    const definition = voidRay();

    expect(beam.start(definition)).toBe(true);
    expect(beam.update(host, ORIGIN, FORWARD, 0.1)).toBe(true);

    const state = beam.renderState!;
    expect(state.endPos.z).toBeCloseTo(definition.rangeU, 3);
    expect(state.intensity).toBeLessThan(1);
    expect(damages.length).toBe(0);
  });

  it('se corta en el primer blanco y le aplica daño por segundo', () => {
    const beam = new WeaponBeam();
    const cerca: ProjectileTargetLike = { id: 'cerca', position: { x: 0, y: 0, z: 100 }, radius: 10 };
    const lejos: ProjectileTargetLike = { id: 'lejos', position: { x: 0, y: 0, z: 300 }, radius: 10 };
    const { host, damages } = makeHost([lejos, cerca]);
    const definition = voidRay();

    beam.start(definition);
    beam.update(host, ORIGIN, FORWARD, 0.5);

    expect(damages.length).toBe(1);
    expect(damages[0].targetId).toBe('cerca');
    expect(damages[0].damage).toBeCloseTo(definition.beam!.dps * 0.5, 3);
    expect(beam.renderState!.endPos.z).toBeCloseTo(90, 3); // corta en la superficie, no en el centro
    expect(beam.renderState!.intensity).toBe(1);
  });

  it('ignora los blancos fuera de alcance', () => {
    const beam = new WeaponBeam();
    const definition = voidRay();
    const fuera: ProjectileTargetLike = { id: 'fuera', position: { x: 0, y: 0, z: definition.rangeU + 500 }, radius: 10 };
    const { host, damages } = makeHost([fuera]);

    beam.start(definition);
    beam.update(host, ORIGIN, FORWARD, 0.2);

    expect(damages.length).toBe(0);
    expect(beam.renderState!.endPos.z).toBeCloseTo(definition.rangeU, 3);
  });

  it('se apaga y avisa al agotarse la energía del vacío', () => {
    const beam = new WeaponBeam();
    const { host, warnings } = makeHost([], 0.1);

    beam.start(voidRay());
    expect(beam.update(host, ORIGIN, FORWARD, 1)).toBe(false);
    expect(beam.isActive).toBe(false);
    expect(warnings).toContain('SIN ENERGÍA DEL VACÍO');
  });

  it('stop apaga el haz y borra su estado de dibujo', () => {
    const beam = new WeaponBeam();
    const { host } = makeHost();

    beam.start(voidRay());
    beam.update(host, ORIGIN, FORWARD, 0.1);
    beam.stop();

    expect(beam.isActive).toBe(false);
    expect(beam.renderState).toBeNull();
    expect(beam.update(host, ORIGIN, FORWARD, 0.1)).toBe(false);
  });
});
