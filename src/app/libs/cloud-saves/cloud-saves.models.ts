export interface CloudSaveSlotRef {
  index: number;
  key: string;
  savedAt: string;
}

export interface CloudSaveSlotData extends CloudSaveSlotRef {
  savegame: unknown;
}

export interface CloudSaveMasterFile {
  gameId: string;
  userId: string;
  saves: CloudSaveSlotRef[];
}
