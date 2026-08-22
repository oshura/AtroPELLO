import {
  collectProjectileTargets,
  collectNearbyClusterTargets,
  isDamageable,
  resolveCollisionRadius,
  DamageableLike,
} from './weapon-targets';
import { ProjectileTargetLike } from './projectile-system';

function makeTarget(overrides: Partial<DamageableLike> = {}): DamageableLike {
  return {
    id: 'target',
    position: { x: 0, y: 0, z: 0 },
    healthCurrent: 100,
    healthMax: 100,
    ...overrides,
  };
}

describe('weapon-targets', () => {
  it('usa el radio de la esfera envolvente y cae al valor por defecto si no hay', () => {
    const withSphere = makeTarget({ boundingSphere: { center: { x: 0, y: 0, z: 0 }, radius: 42 } });
    expect(resolveCollisionRadius(withSphere)).toBe(42);
    expect(resolveCollisionRadius(makeTarget())).toBe(10);
    expect(resolveCollisionRadius(makeTarget({ boundingSphere: null }), 7)).toBe(7);
  });

  it('descarta lo que ya no está en juego', () => {
    expect(isDamageable(null)).toBe(false);
    expect(isDamageable(makeTarget({ healthCurrent: 0 }))).toBe(false);
    expect(isDamageable(makeTarget({ active: false }))).toBe(false);
    expect(isDamageable(makeTarget({ isActive: () => false }))).toBe(false);
    expect(isDamageable(makeTarget({ isActive: () => true }))).toBe(true);
  });

  it('reúne varias fuentes sin duplicar y reutilizando los buffers', () => {
    const out: ProjectileTargetLike[] = [];
    const byId = new Map<string, DamageableLike>();
    const being = makeTarget({ id: 'being-1' });
    const turtle = makeTarget({ id: 'turtle' });

    const count = collectProjectileTargets([[being], [turtle, being], null], out, byId);

    expect(count).toBe(2);
    expect(out.map(t => t.id)).toEqual(['being-1', 'turtle']);
    expect(byId.get('being-1')).toBe(being);
  });

  it('una recolección posterior vacía la anterior (buffers reutilizados)', () => {
    const out: ProjectileTargetLike[] = [];
    const byId = new Map<string, DamageableLike>();

    collectProjectileTargets([[makeTarget({ id: 'a' })]], out, byId);
    const count = collectProjectileTargets([[makeTarget({ id: 'b' })]], out, byId);

    expect(count).toBe(1);
    expect(out.map(t => t.id)).toEqual(['b']);
    expect(byId.has('a')).toBe(false);
  });

  describe('collectNearbyClusterTargets', () => {
    const origin = { x: 0, y: 0, z: 0 };

    it('acepta los miembros al alcance de un disparo', () => {
      const out: DamageableLike[] = [];
      const cluster = {
        center: { x: 100, y: 0, z: 0 },
        objects: [makeTarget({ id: 'cerca', position: { x: 120, y: 0, z: 0 } })],
      };

      collectNearbyClusterTargets([cluster], origin, 3500, out);

      expect(out.map(t => t.id)).toEqual(['cerca']);
    });

    it('descarta el cúmulo entero cuando su centro está lejísimos', () => {
      const out: DamageableLike[] = [];
      const cluster = {
        center: { x: 500000, y: 0, z: 0 },
        objects: [makeTarget({ id: 'lejano', position: { x: 500000, y: 0, z: 0 } })],
      };

      collectNearbyClusterTargets([cluster], origin, 3500, out);

      expect(out.length).toBe(0);
    });

    it('descarta miembros fuera de alcance aunque el cúmulo pase el filtro', () => {
      const out: DamageableLike[] = [];
      const cluster = {
        center: { x: 4000, y: 0, z: 0 },
        objects: [
          makeTarget({ id: 'dentro', position: { x: 1000, y: 0, z: 0 } }),
          makeTarget({ id: 'fuera', position: { x: 6000, y: 0, z: 0 } }),
        ],
      };

      collectNearbyClusterTargets([cluster], origin, 3500, out);

      expect(out.map(t => t.id)).toEqual(['dentro']);
    });

    it('ignora muertos y reutiliza el buffer entre llamadas', () => {
      const out: DamageableLike[] = [];
      const cluster = {
        center: origin,
        objects: [makeTarget({ id: 'vivo' }), makeTarget({ id: 'roto', healthCurrent: 0 })],
      };

      collectNearbyClusterTargets([cluster], origin, 3500, out);
      expect(out.map(t => t.id)).toEqual(['vivo']);

      collectNearbyClusterTargets([], origin, 3500, out);
      expect(out.length).toBe(0);
    });
  });

  it('excluye a los muertos al recolectar', () => {
    const out: ProjectileTargetLike[] = [];
    const byId = new Map<string, DamageableLike>();

    collectProjectileTargets([[makeTarget({ id: 'vivo' }), makeTarget({ id: 'muerto', healthCurrent: 0 })]], out, byId);

    expect(out.map(t => t.id)).toEqual(['vivo']);
  });
});
