import { resolveSnapshotId, resolveSystemId, resolveSystemKey, getSystemMeta } from './system-identity';
import { SolarSystemSnapshot } from '../../types/solar-system.types';

function snap(partial: Partial<SolarSystemSnapshot>): SolarSystemSnapshot {
  return {
    sun: { id: 'sun-x', position: { x: 0, y: 0, z: 0 }, radius: 1000 },
    planets: [],
    ...partial,
  } as SolarSystemSnapshot;
}

describe('system-identity', () => {
  it('resolveSystemId prefiere proceduralSystemId, luego systemId, luego id, luego sun', () => {
    expect(resolveSystemId(snap({ id: 'i', meta: { proceduralSystemId: 'p', systemId: 's' } }))).toBe('p');
    expect(resolveSystemId(snap({ id: 'i', meta: { systemId: 's' } }))).toBe('s');
    expect(resolveSystemId(snap({ id: 'i' }))).toBe('i');
    expect(resolveSystemId(snap({ sun: { id: 'sol', position: { x: 0, y: 0, z: 0 }, radius: 1 } }))).toBe('sun:sol');
    expect(resolveSystemId(null)).toBeNull();
  });

  it('resolveSnapshotId prefiere el id explícito del snapshot', () => {
    expect(resolveSnapshotId(snap({ id: 'i', meta: { proceduralSystemId: 'p' } }))).toBe('i');
    expect(resolveSnapshotId(snap({ meta: { proceduralSystemId: 'p' } }))).toBe('p');
    expect(resolveSnapshotId(snap({ meta: { systemId: 's' } }))).toBe('s');
    expect(resolveSnapshotId(null)).toBeNull();
  });

  it('resolveSystemKey pone snapshot.id ANTES que las etiquetas (estabilidad de dedup)', () => {
    // Mismo sistema guardado bajo dos labels distintos ⇒ MISMA clave (no se duplica).
    const a = snap({ id: 'human-system', meta: { snapshotLabel: 'human-default-system' } });
    const b = snap({ id: 'human-system', meta: { snapshotLabel: 'respawn-anchor-latest' } });
    expect(resolveSystemKey(a)).toBe('human-system');
    expect(resolveSystemKey(b)).toBe('human-system');
    expect(resolveSystemKey(a)).toBe(resolveSystemKey(b));
  });

  it('resolveSystemKey prefiere persistentSystemId/proceduralSystemId sobre todo', () => {
    expect(resolveSystemKey(snap({ id: 'i', meta: { persistentSystemId: 'k', proceduralSystemId: 'p' } }))).toBe('k');
    expect(resolveSystemKey(snap({ id: 'i', meta: { proceduralSystemId: 'p', snapshotLabel: 'L' } }))).toBe('p');
  });

  it('resolveSystemKey usa el fallbackLabel solo cuando no hay id', () => {
    expect(resolveSystemKey(snap({ sun: { id: 'sol', position: { x: 0, y: 0, z: 0 }, radius: 1 } }), { fallbackLabel: 'L' })).toBe('L');
    // Con id presente, el fallbackLabel se ignora.
    expect(resolveSystemKey(snap({ id: 'i' }), { fallbackLabel: 'L' })).toBe('i');
  });

  it('ignora cadenas vacías o en blanco', () => {
    expect(resolveSystemId(snap({ id: '   ', meta: { proceduralSystemId: '' } }))).toBe('sun:sun-x');
    expect(resolveSystemKey(snap({ id: '', meta: { snapshotLabel: '  label  ' } }))).toBe('label');
  });

  it('getSystemMeta nunca devuelve null', () => {
    expect(getSystemMeta(null)).toEqual({});
    expect(getSystemMeta(snap({ meta: { elderGod: 'Cthulhu' } })).elderGod).toBe('Cthulhu');
  });
});
