import { Injectable } from '@angular/core';
import { CloudSaveSlotRef } from './cloud-saves.models';

@Injectable({ providedIn: 'root' })
export class CloudSaveSlotFinderService {
  acquireNewSlot(masterSlots: CloudSaveSlotRef[], reservedIndexes: Array<number | null | undefined>): number {
    const blocked = new Set<number>();
    const normalize = (value: number | null | undefined): number | null => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      return Math.max(0, Math.floor(value));
    };

    for (const slot of masterSlots) {
      const normalized = normalize(slot.index);
      if (normalized !== null) {
        blocked.add(normalized);
      }
      const inherited = slot.metadata?.characterSlotIndexes ?? [];
      for (const idx of inherited) {
        const normalizedIdx = normalize(idx);
        if (normalizedIdx !== null) {
          blocked.add(normalizedIdx);
        }
      }
    }

    for (const entry of reservedIndexes ?? []) {
      const normalized = normalize(entry);
      if (normalized !== null) {
        blocked.add(normalized);
      }
    }

    let candidate = 0;
    while (blocked.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }
}
