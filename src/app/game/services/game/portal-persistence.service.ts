import { Injectable } from '@angular/core';
import { SolarSystemSnapshot, PortalSnapshot } from '../../types/solar-system.types';
import { resolveSystemKey } from './system-identity';
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
  private portalIndex = new Map<string, string>();
  private systemIndex = new Map<string, string>();
  private pinnedSnapshots = new Map<string, number>();

  private cloneSnapshot(snapshot: SolarSystemSnapshot): SolarSystemSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as SolarSystemSnapshot;
  }
  private sequence = 0;

  save(label: string, snapshot: SolarSystemSnapshot): void {
    const prepared = this.cloneSnapshot(snapshot);
    prepared.meta = { ...(prepared.meta || {}), snapshotLabel: label };

    // Remove any previous snapshot stored under the same label
    this.removeSnapshot(label, { force: true });

    const systemKey = this.resolveSystemKey(prepared) ?? label;
    if (systemKey) {
      this.evictSystemSnapshots(systemKey, label);
      this.systemIndex.set(systemKey, label);
    }

    this.snapshots.set(label, prepared);
    this.indexPortals(label, prepared);

    GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Snapshot saved', { label, id: snapshot.id, systemKey });
  }

  autoLabelAndSave(prefix: string, snapshot: SolarSystemSnapshot): string {
    const label = `${prefix}-${++this.sequence}`;
    this.save(label, snapshot);
    return label;
  }

  pin(label: string | null | undefined): void {
    const normalized = typeof label === 'string' ? label.trim() : '';
    if (!normalized) {
      return;
    }
    const next = (this.pinnedSnapshots.get(normalized) ?? 0) + 1;
    this.pinnedSnapshots.set(normalized, next);
  }

  unpin(label: string | null | undefined): void {
    const normalized = typeof label === 'string' ? label.trim() : '';
    if (!normalized) {
      return;
    }
    const current = this.pinnedSnapshots.get(normalized);
    if (!current) {
      return;
    }
    if (current <= 1) {
      this.pinnedSnapshots.delete(normalized);
      return;
    }
    this.pinnedSnapshots.set(normalized, current - 1);
  }

  private isPinned(label: string | null | undefined): boolean {
    const normalized = typeof label === 'string' ? label.trim() : '';
    if (!normalized) {
      return false;
    }
    return (this.pinnedSnapshots.get(normalized) ?? 0) > 0;
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
  list(): Array<{ label: string; id?: string; planetCount: number; portalCount: number; systemId: string | null }> {
    return Array.from(this.snapshots.entries()).map(([label, snap]) => ({
      label,
      id: snap.id,
      planetCount: snap.planets.length,
      portalCount: snap.portals?.length || 0,
      systemId: this.resolveSystemKey(snap)
    }));
  }

  /** Apply a partial update to every stored snapshot that references the given portal. */
  updatePortalSnapshot(portalId: string, patch: Partial<PortalSnapshot>): boolean {
    const targetLabel = this.portalIndex.get(portalId);
    if (targetLabel) {
      const snap = this.snapshots.get(targetLabel);
      if (snap?.portals) {
        const portal = snap.portals.find(p => p.id === portalId);
        if (portal) {
          Object.assign(portal, patch);
          return true;
        }
      }
    }

    let updated = false;
    for (const [label, snap] of this.snapshots.entries()) {
      if (!snap.portals || !snap.portals.length) continue;
      const portal = snap.portals.find(p => p.id === portalId);
      if (portal) {
        Object.assign(portal, patch);
        this.portalIndex.set(portalId, label);
        updated = true;
      }
    }
    return updated;
  }

  /** Find the first stored snapshot containing a portal with the given id. */
  findByPortalId(portalId: string): { label: string; snapshot: SolarSystemSnapshot } | undefined {
    const indexedLabel = this.portalIndex.get(portalId);
    if (indexedLabel) {
      const snapshot = this.snapshots.get(indexedLabel);
      if (snapshot) {
        return { label: indexedLabel, snapshot };
      }
      this.portalIndex.delete(portalId);
    }

    for (const [label, snap] of this.snapshots.entries()) {
      if (snap.portals && snap.portals.some(p => p.id === portalId)) {
        this.portalIndex.set(portalId, label);
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
    for (const [label, snap] of this.snapshots.entries()) {
      if (!snap.portals) continue;
      const origin = snap.portals.find(p => p.id === originPortalId);
      if (origin) {
        origin.linkedPortalId = destPortalId;
        if (!this.portalIndex.has(originPortalId)) {
          this.portalIndex.set(originPortalId, label);
        }
      }
    }
  }

  private resolveSystemKey(snapshot?: SolarSystemSnapshot | null): string | null {
    return resolveSystemKey(snapshot);
  }

  private evictSystemSnapshots(systemKey: string, exceptLabel?: string): void {
    const currentLabel = this.systemIndex.get(systemKey);
    if (currentLabel && currentLabel !== exceptLabel) {
      if (this.isPinned(currentLabel)) {
        GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Skip eviction for pinned snapshot', { label: currentLabel, systemKey });
      } else {
        this.removeSnapshot(currentLabel);
      }
      return;
    }

    if (!currentLabel) {
      for (const [label, snap] of this.snapshots.entries()) {
        if (label === exceptLabel) {
          continue;
        }
        if (this.resolveSystemKey(snap) === systemKey) {
          if (this.isPinned(label)) {
            GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Skip eviction for pinned snapshot', { label, systemKey });
            continue;
          }
          this.removeSnapshot(label);
          break;
        }
      }
    }
  }

  private removeSnapshot(label: string, options?: { force?: boolean }): void {
    const existing = this.snapshots.get(label);
    if (!existing) {
      return;
    }

    if (!options?.force && this.isPinned(label)) {
      GameLogger.info(LogCategory.SOLAR_SYSTEM_GENERATION, 'Removal skipped for pinned snapshot', { label });
      return;
    }

    const systemKey = this.resolveSystemKey(existing);
    if (systemKey && this.systemIndex.get(systemKey) === label) {
      this.systemIndex.delete(systemKey);
    }

    if (Array.isArray(existing.portals)) {
      for (const portal of existing.portals) {
        if (this.portalIndex.get(portal.id) === label) {
          this.portalIndex.delete(portal.id);
        }
      }
    }

    this.snapshots.delete(label);
  }

  private indexPortals(label: string, snapshot: SolarSystemSnapshot): void {
    if (!snapshot.portals || !snapshot.portals.length) {
      return;
    }
    for (const portal of snapshot.portals) {
      this.portalIndex.set(portal.id, label);
    }
  }
}
