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

  private cloneSnapshot(snapshot: SolarSystemSnapshot): SolarSystemSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
  }
  private sequence = 0;

  save(label: string, snapshot: SolarSystemSnapshot): void {
    const prepared = this.cloneSnapshot(snapshot);
    prepared.meta = { ...(prepared.meta || {}), snapshotLabel: label };
    this.snapshots.set(label, prepared);
    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot saved', { label, id: snapshot.id });
  }

  autoLabelAndSave(prefix: string, snapshot: SolarSystemSnapshot): string {
    const label = `${prefix}-${++this.sequence}`;
    this.save(label, snapshot);
    return label;
  }

  get(label: string): SolarSystemSnapshot | undefined {
    const snap = this.snapshots.get(label);
    return snap ? this.cloneSnapshot(snap) : undefined;
  }
  has(label: string): boolean { return this.snapshots.has(label); }
  ensure(label: string): SolarSystemSnapshot | undefined {
    const snapshot = this.snapshots.get(label);
    if (!snapshot) {
      GameLogger.error(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot label missing in persistence map', { label });
    }
    return snapshot ? this.cloneSnapshot(snapshot) : undefined;
  }
  list(): Array<{ label: string; id?: string; planetCount: number; portalCount: number }> {
    return Array.from(this.snapshots.entries()).map(([label, snap]) => ({
      label,
      id: snap.id,
      planetCount: snap.planets.length,
      portalCount: snap.portals?.length || 0
    }));
  }

  /** Apply a partial update to every stored snapshot that references the given portal. */
  updatePortalSnapshot(portalId: string, patch: Partial<PortalSnapshot>): boolean {
    let updated = false;
    for (const snap of this.snapshots.values()) {
      if (!snap.portals || !snap.portals.length) continue;
      const portal = snap.portals.find(p => p.id === portalId);
      if (portal) {
        Object.assign(portal, patch);
        updated = true;
      }
    }
    return updated;
  }

  /** Find the first stored snapshot containing a portal with the given id. */
  findByPortalId(portalId: string): { label: string; snapshot: SolarSystemSnapshot } | undefined {
    for (const [label, snap] of this.snapshots.entries()) {
      if (snap.portals && snap.portals.some(p => p.id === portalId)) {
        return { label, snapshot: snap };
      }
    }
    return undefined;
  }

  apply(label: string, engine: GameEngine): boolean {
    const snap = this.get(label);
    if (!snap) return false;
    try {
      engine.applySolarSystemSnapshot(snap);
      engine.setCurrentSnapshotLabel(label, { mutateSnapshot: false });
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
