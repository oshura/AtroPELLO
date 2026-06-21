import { buildInventorySnapshot, InventorySnapshotSource, InventorySnapshotShip } from './inventory-snapshot-builder';
import { EquipmentSlot } from '../../types/inventory.types';

const characterProfile = { name: 'Tester', sanity: 50 };
const gear = { id: 'g1' };
const cargo = { id: 'c1', qty: 2 };

function makeSource(): InventorySnapshotSource {
  return {
    equipmentLoadout: {},
    characterProfile,
    personalGear: [gear],
    cargoManifest: [cargo],
    getSanityBaseMax: () => 100,
    getSanityReservedFromSpells: () => 10,
    getSanityCap: () => 90,
  } as unknown as InventorySnapshotSource;
}

const ship: InventorySnapshotShip = {
  cargoCapacityCurrent: 30,
  cargoCapacityMax: 60,
  acceleration: 5,
  maxSpeed: 200,
  healthCurrent: 80.4,
  healthMax: 100.6,
};

describe('buildInventorySnapshot', () => {
  it('devuelve null si no hay estado', () => {
    expect(buildInventorySnapshot(null, ship)).toBeNull();
  });

  it('clona character/gear/cargo (no comparte referencias)', () => {
    const source = makeSource();
    const snap = buildInventorySnapshot(source, ship)!;
    expect(snap.character).not.toBe(source.characterProfile);
    expect(snap.personalGear[0]).not.toBe(source.personalGear[0]);
    expect(snap.cargo[0]).not.toBe(source.cargoManifest[0]);
  });

  it('rellena todos los slots de equipo (vacío ⇒ null)', () => {
    const snap = buildInventorySnapshot(makeSource(), ship)!;
    expect(Object.keys(snap.equipment).length).toBe(Object.values(EquipmentSlot).length);
    expect(Object.values(snap.equipment).every(v => v === null)).toBe(true);
  });

  it('calcula capacidad de carga (pct) y stats de nave redondeadas', () => {
    const snap = buildInventorySnapshot(makeSource(), ship)!;
    expect(snap.cargoCapacity).toEqual({ current: 30, max: 60, pct: 50 });
    expect(snap.shipStats).toEqual({
      acceleration: 5,
      topSpeed: 200,
      health: { current: 80, max: 101 },
    });
  });

  it('sin nave: capacidad 0 y shipStats undefined', () => {
    const snap = buildInventorySnapshot(makeSource(), null)!;
    expect(snap.cargoCapacity).toEqual({ current: 0, max: 0, pct: 0 });
    expect(snap.shipStats).toBeUndefined();
  });

  it('propaga los límites de cordura', () => {
    const snap = buildInventorySnapshot(makeSource(), ship)!;
    expect(snap.sanityLimits).toEqual({ base: 100, reserved: 10, effective: 90 });
  });
});
