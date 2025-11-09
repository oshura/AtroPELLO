import { Injectable } from '@angular/core';
import { SolarSystemSnapshot, PortalSnapshot } from '../../types/solar-system.types';
import { GameEngine } from '../../GameEngine';
import { GameLogger } from '../../utils/GameLogger';
import { LogCategory } from '../../../services/logging.service';

/**
 * PortalPersistenceService
 * Stores labeled SolarSystemSnapshots (e.g., 'human', 'generated-1') and provides
 * helpers to apply them and manage portal linkage history.
 */
@Injectable({ providedIn: 'root' })
export class PortalPersistenceService {
  private snapshots = new Map<string, SolarSystemSnapshot>();
  private sequence = 0;

  save(label: string, snapshot: SolarSystemSnapshot): void {
    this.snapshots.set(label, snapshot);
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot saved', { label, id: snapshot.id });
  }

  autoLabelAndSave(prefix: string, snapshot: SolarSystemSnapshot): string {
    const label = `${prefix}-${++this.sequence}`;
    this.save(label, snapshot);
    return label;
  }

  get(label: string): SolarSystemSnapshot | undefined { return this.snapshots.get(label); }
  list(): Array<{ label: string; id?: string; planetCount: number; portalCount: number }> {
    return Array.from(this.snapshots.entries()).map(([label, snap]) => ({
      label,
      id: snap.id,
      planetCount: snap.planets.length,
      portalCount: snap.portals?.length || 0
    }));
  }

  apply(label: string, engine: GameEngine): boolean {
    const snap = this.get(label);
    if (!snap) return false;
    try {
      engine.applySolarSystemSnapshot(snap);
      GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot applied from persistence', { label, id: snap.id });
      return true;
    } catch (e) {
      GameLogger.error(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot apply failed', { label, e });
      return false;
    }
  }

  /** Update linkage between two portals (origin->dest and back if origin snapshot stored). */
  linkPortals(originPortalId: string, destPortalId: string): void {
    for (const snap of this.snapshots.values()) {
      if (!snap.portals) continue;
      const origin = snap.portals.find(p => p.id === originPortalId);
      if (origin) origin.linkedPortalId = destPortalId;
    }
  }
}
