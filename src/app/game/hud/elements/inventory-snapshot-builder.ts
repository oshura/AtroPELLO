import { EquipmentSlot, InventorySnapshot } from '../../types/inventory.types';

type EquipmentState = InventorySnapshot['equipment'][EquipmentSlot];

/** Lo que el builder necesita del estado del juego (slice estructural, sin acoplar a GameStateStore). */
export interface InventorySnapshotSource {
  equipmentLoadout: Record<EquipmentSlot, EquipmentState>;
  characterProfile: InventorySnapshot['character'];
  personalGear: InventorySnapshot['personalGear'];
  cargoManifest: InventorySnapshot['cargo'];
  getSanityBaseMax(): number;
  getSanityReservedFromSpells(): number;
  getSanityCap(): number;
}

/** Lo que el builder necesita de la nave (estructural). */
export interface InventorySnapshotShip {
  cargoCapacityCurrent: number;
  cargoCapacityMax: number;
  acceleration: number;
  maxSpeed: number;
  healthCurrent: number;
  healthMax: number;
}

/**
 * Ensambla el snapshot que consume el panel de inventario. PURO: lee el estado y la nave (clona para no
 * compartir referencias) y devuelve el DTO; sin side-effects. Antes en GameEngine. docs/ARQUITECTURA.md Fase 5.7.
 */
export function buildInventorySnapshot(
  state: InventorySnapshotSource | null,
  ship: InventorySnapshotShip | null,
): InventorySnapshot | null {
  if (!state) {
    return null;
  }

  const equipment = {} as Record<EquipmentSlot, EquipmentState>;
  for (const slotKey of Object.values(EquipmentSlot)) {
    const slot = slotKey as EquipmentSlot;
    const slotState = state.equipmentLoadout[slot] || null;
    equipment[slot] = slotState ? { ...slotState } : null;
  }

  const current = ship ? ship.cargoCapacityCurrent : 0;
  const max = ship ? ship.cargoCapacityMax : 0;
  const pct = max > 0 ? (current / max) * 100 : 0;
  const shipStats = ship
    ? {
        acceleration: ship.acceleration,
        topSpeed: ship.maxSpeed,
        health: {
          current: Math.max(0, Math.round(ship.healthCurrent)),
          max: Math.max(1, Math.round(ship.healthMax)),
        },
      }
    : undefined;

  return {
    character: { ...state.characterProfile },
    equipment,
    personalGear: state.personalGear.map(item => ({ ...item })),
    cargo: state.cargoManifest.map(entry => ({ ...entry })),
    cargoCapacity: {
      current,
      max,
      pct: Math.max(0, Math.min(200, pct)),
    },
    shipStats,
    sanityLimits: {
      base: state.getSanityBaseMax(),
      reserved: state.getSanityReservedFromSpells(),
      effective: state.getSanityCap(),
    },
  };
}
