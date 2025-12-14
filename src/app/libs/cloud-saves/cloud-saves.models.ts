import { SaveGamePayload } from '../../game/types/save-game.types';

export interface CloudSaveSlotRef {
  index: number;
  key: string;
  savedAt: string;
  metadata?: CloudSaveSlotMetadata | null;
}

export interface CloudSaveSlotMetadata {
  title?: string | null;
  systemId?: string | null;
  systemName?: string | null;
  anchorLabel?: string | null;
  anchorPlanetName?: string | null;
  savedAt?: number | null;
  playTimeMs?: number | null;
  buildLabel?: string | null;
  characterId?: string | null;
  characterSlotIndexes?: number[] | null;
  slotCapacity?: number | null;
  activeSlotIndex?: number | null;
}

export interface CloudSaveSlotData extends CloudSaveSlotRef {
  savegame: SaveGamePayload | unknown;
  metadata?: CloudSaveSlotMetadata | null;
}

export interface CloudSaveMasterFile {
  gameId: string;
  userId: string;
  saves: CloudSaveSlotRef[];
}
