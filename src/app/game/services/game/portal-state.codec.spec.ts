import {
  capturePortalSnapshot,
  createPortalFromSnapshot,
  portalSnapshotFromSerialized,
  serializedFromPortalSnapshot,
} from './portal-state.codec';
import { Portal } from '../../game-objects/Portal';
import { PortalSnapshot } from '../../types/solar-system.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

/**
 * "La prueba del campo nuevo" para portales (docs/ARQUITECTURA.md §6.5).
 * capturar → aplicar → capturar y snapshot → serialized → snapshot deben ser idénticos.
 */
describe('portal-state.codec', () => {
  function buildFullyPopulatedPortal(): Portal {
    const portal = new Portal('portal-spec-1', { x: 1000, y: -50, z: 7000 }, 420);
    portal.linkedPortalId = 'portal-dest-2';
    portal.applyEyeState({ gazeTarget: 'ship', eyelidOpen: 1, intensity: 0.8 });
    portal.setAnimosity(GameObjectAnimosity.NEUTRAL);
    portal.setConcordSealState(true, true, 123456, { immediateStrength: true });
    portal.planetColorRef = { r: 0.2, g: 0.6, b: 0.9, a: 1 };
    return portal;
  }

  it('round-trip capturar → factory → capturar es idéntico', () => {
    const original = buildFullyPopulatedPortal();
    const snap1 = capturePortalSnapshot(original);
    const rebuilt = createPortalFromSnapshot(snap1);
    const snap2 = capturePortalSnapshot(rebuilt);
    expect(snap2).toEqual(snap1);
  });

  it('round-trip por la forma serializada del savegame conserva todos los campos', () => {
    const original = buildFullyPopulatedPortal();
    const snap1 = capturePortalSnapshot(original);
    const serialized = serializedFromPortalSnapshot(snap1);
    const snap2 = portalSnapshotFromSerialized(serialized);
    expect(snap2).toEqual(snap1);
  });

  it('conserva el sello de concordia y el color del planeta de origen', () => {
    const original = buildFullyPopulatedPortal();
    const rebuilt = createPortalFromSnapshot(capturePortalSnapshot(original));
    expect(rebuilt.concordSealActive).toBeTrue();
    expect(rebuilt.preventsLesserIncursions).toBeTrue();
    expect(rebuilt.concordSealActivatedAt).toBe(123456);
    expect(rebuilt.planetColorRef).toEqual({ r: 0.2, g: 0.6, b: 0.9, a: 1 });
    expect(rebuilt.linkedPortalId).toBe('portal-dest-2');
  });

  it('un portal mínimo (sin sello ni color) hace round-trip sin campos espurios', () => {
    const minimal: PortalSnapshot = { id: 'p-min', position: { x: 0, y: 0, z: 0 }, radius: 100 };
    const rebuilt = createPortalFromSnapshot(minimal);
    const snap = capturePortalSnapshot(rebuilt);
    expect(snap.id).toBe('p-min');
    expect(snap.radius).toBe(100);
    expect(snap.concordSealActive).toBeFalse();
    expect(snap.planetColorRef).toBeUndefined();
  });
});
