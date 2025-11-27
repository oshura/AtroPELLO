import { GameObjectType } from './game-object.types';

/** Slots asociados al piloto (inventario personal). */
export enum PersonalGearSlot {
  SUIT = 'SUIT',
  BOOTS = 'BOOTS',
  ACCESSORY = 'ACCESSORY'
}

/** Slots estructurales de la nave para módulos equipados. */
export enum EquipmentSlot {
  CORE = 'CORE',
  REACTOR = 'REACTOR',
  WINGS = 'WINGS',
  HULL = 'HULL',
  SHIELD = 'SHIELD',
  DRONE_BAY = 'DRONE_BAY',
  AUXILIARY = 'AUXILIARY'
}

/** Clasificación de rareza visual/sonora para ítems. */
export enum RarityTier {
  COMMON = 'COMMON',
  UNCOMMON = 'UNCOMMON',
  RARE = 'RARE',
  UNIQUE = 'UNIQUE'
}

/** Tipos de carga que puede transportar la nave. */
export enum CargoItemType {
  RAW_MATERIAL = 'RAW_MATERIAL',
  ARTIFACT = 'ARTIFACT',
  ORGANIC_SAMPLE = 'ORGANIC_SAMPLE',
  ENERGY_CORE = 'ENERGY_CORE',
  CONTRABAND = 'CONTRABAND',
  UNKNOWN = 'UNKNOWN'
}

/** Perfil del piloto mostrado en el panel. */
export interface CharacterAge {
  years: number;
  days: number;
  totalDays: number;
}

export interface CharacterProfile {
  name: string;
  sanity: number; // 0-100
  health: number; // 0-100
  memory: number; // 0-100
  level: number;
  experience: number;
  experienceMax: number;
  age: CharacterAge;
  survivability: number; // 0-100
}

/** Estado de un slot de equipo de la nave. */
export interface EquipmentSlotState {
  slot: EquipmentSlot;
  label: string;
  rarity: RarityTier;
  description?: string;
  capabilities?: string[];
}

/** Elementos del inventario personal (incluye traje/botas dedicados). */
export interface PersonalGearItem {
  slot: PersonalGearSlot;
  label: string;
  description?: string;
  rarity: RarityTier;
  /** Número de ranuras de accesorio habilitadas por este ítem (solo para trajes). */
  accessorySlots?: number;
}

/** Entrada de manifiesto de carga. */
export interface CargoManifestEntry {
  id: string;
  type: CargoItemType;
  label: string;
  massTons: number;
  units: number;
  source?: GameObjectType | 'FABRICATED';
  rarity: RarityTier;
  notes?: string;
}

/** Snapshot completo para alimentar el InventoryPanel. */
export interface InventorySnapshot {
  character: CharacterProfile;
  equipment: Record<EquipmentSlot, EquipmentSlotState | null>;
  personalGear: PersonalGearItem[];
  cargo: CargoManifestEntry[];
  cargoCapacity: { current: number; max: number; pct: number };
  shipStats?: {
    acceleration: number;
    topSpeed: number;
    health: { current: number; max: number };
  };
  sanityLimits?: {
    base: number;
    reserved: number;
    effective: number;
  };
}

/** Acción disponible desde el panel de inventario. */
export enum InventoryActionType {
  JETTISON = 'JETTISON'
}

/** Coordenadas rectangulares dentro del canvas del panel. */
export interface InventoryRegionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Área interactiva del panel (slots, filas de carga, botones). */
export type InventoryPanelRegion =
  | { kind: 'cargo'; entryId: string; bounds: InventoryRegionBounds }
  | { kind: 'equipment'; slot: EquipmentSlot; bounds: InventoryRegionBounds }
  | { kind: 'personal'; index: number; slot: PersonalGearSlot; bounds: InventoryRegionBounds }
  | { kind: 'action'; action: InventoryActionType; enabled: boolean; bounds: InventoryRegionBounds };

/** Selección actual dentro del panel. */
export type InventorySelection =
  | { kind: 'cargo'; entryId: string }
  | { kind: 'equipment'; slot: EquipmentSlot }
  | { kind: 'personal'; index: number };
