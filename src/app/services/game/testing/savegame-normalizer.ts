import { SaveGamePayload, SaveGameGameStateSection, SaveGamePlayerSection } from '../../../game/types/save-game.types';

/**
 * Creates a deterministic clone of a SaveGame payload so tests can compare snapshots without
 * being affected by timestamps, build labels, or ordering differences introduced by maps/sets.
 */
export function normalizeSaveGamePayload(payload: SaveGamePayload): SaveGamePayload {
  const clone = deepClone(payload);
  normalizeMetadata(clone);
  normalizePlayerSection(clone.player);
  normalizeGameStateSection(clone.gameState);
  normalizeUniverseSection(clone);
  clone.ui = clone.ui ?? null;
  clone.audio = clone.audio ?? null;
  return clone;
}

function normalizeMetadata(payload: SaveGamePayload): void {
  const metadata = payload.metadata;
  metadata.savedAt = 0;
  metadata.elapsedPlayTimeMs = 0;
  metadata.buildLabel = 'NORMALIZED';
  metadata.systemName = metadata.systemName ?? null;
  metadata.anchorLabel = metadata.anchorLabel ?? null;
  metadata.anchorPlanetId = metadata.anchorPlanetId ?? null;
  metadata.anchorPlanetName = metadata.anchorPlanetName ?? null;
  metadata.respawnAnchorId = metadata.respawnAnchorId ?? null;
  metadata.userId = metadata.userId ?? null;
  metadata.backendSlot = metadata.backendSlot ?? null;
}

function normalizePlayerSection(section: SaveGamePlayerSection): void {
  if (!section.inventory) {
    section.inventory = { personalGear: [], equipmentLoadout: {} as any, cargoManifest: [], knownSpells: [], grimoireLayout: {} };
  }
  section.inventory.personalGear = sortBy(section.inventory.personalGear ?? [], entry => entry.slot ?? entry.label ?? '');
  section.inventory.cargoManifest = sortBy(section.inventory.cargoManifest ?? [], entry => `${entry.id ?? ''}:${entry.type ?? ''}`);
  section.inventory.knownSpells = sortBy(section.inventory.knownSpells ?? [], spell => spell ?? '');
  section.inventory.grimoireLayout = rebuildSortedRecord(section.inventory.grimoireLayout ?? {});

  const loadout = (section.inventory.equipmentLoadout ?? {}) as Record<string, any>;
  section.inventory.equipmentLoadout = rebuildSortedRecord(loadout) as typeof section.inventory.equipmentLoadout;

  if (section.respawn) {
    section.respawn.activeAnchor = normalizeAnchor(section.respawn.activeAnchor ?? null);
    section.respawn.defaultAnchor = normalizeAnchor(section.respawn.defaultAnchor ?? null);
    section.respawn.lastAnchorLabel = section.respawn.lastAnchorLabel ?? null;
  }
}

function normalizeAnchor(anchor: SaveGamePlayerSection['respawn']['activeAnchor'] | null): SaveGamePlayerSection['respawn']['activeAnchor'] | null {
  if (!anchor) {
    return null;
  }
  return {
    ...anchor,
    snapshotId: anchor.snapshotId ?? null,
    snapshotLabel: anchor.snapshotLabel ?? null,
    planetId: anchor.planetId ?? null,
    planetName: anchor.planetName ?? null,
    shipForward: anchor.shipForward ?? null,
    shipVelocity: anchor.shipVelocity ?? null,
    shipOrientation: anchor.shipOrientation ?? null,
    landingSite: anchor.landingSite ?? undefined
  };
}

function normalizeGameStateSection(section: SaveGameGameStateSection): void {
  section.missions = sortBy(
    section.missions ?? [],
    mission => mission?.targetLocation?.planetId ?? mission?.id ?? JSON.stringify(mission ?? {})
  );
  section.planetIntel = sortBy(section.planetIntel ?? [], intel => intel?.planetId ?? JSON.stringify(intel ?? {}));
  section.proceduralArchive = sortBy(section.proceduralArchive ?? [], snapshot => snapshot?.id ?? snapshot?.meta?.['proceduralSystemId'] ?? '');
  section.cooldowns = section.cooldowns ?? { collisionCooldowns: [] } as SaveGameGameStateSection['cooldowns'];
  section.cooldowns.collisionCooldowns = sortBy(section.cooldowns.collisionCooldowns ?? [], entry => entry?.objectId ?? '');
  section.cooldowns.dopplerCues = rebuildSortedRecord(section.cooldowns.dopplerCues ?? {});
  section.lesserBeingMemory = rebuildSortedRecord(section.lesserBeingMemory ?? {}, value => sortBy(value ?? [], entry => entry?.id ?? ''));

  section.timers = section.timers ?? { mapReopenAllowedAtMs: 0, grimoireReopenAllowedAtMs: 0, inventoryReopenAllowedAtMs: 0 };
  section.runtime = section.runtime ?? { frameCount: 0, lastFrameTime: 0, gameRunning: false };
}

function normalizeUniverseSection(payload: SaveGamePayload): void {
  const universe = payload.universe ?? { objects: [] };
  universe.objects = sortSerialized(universe.objects ?? []);
  universe.portals = sortSerialized(universe.portals ?? []);
  universe.lesserBeings = sortSerialized(universe.lesserBeings ?? []);
  universe.custom = rebuildSortedRecord(universe.custom ?? {});
  payload.universe = universe;
}

function sortSerialized<T extends { id?: string | null }>(entries: T[]): T[] {
  return sortBy(entries, entry => entry?.id ?? JSON.stringify(entry ?? {}));
}

function rebuildSortedRecord<T>(record: Record<string, T>, valueTransform?: (value: T) => T): Record<string, T> {
  const result: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    result[key] = valueTransform ? valueTransform(value) : value;
  }
  return result;
}

function sortBy<T>(items: T[], projector: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const left = projector(a);
    const right = projector(b);
    return left.localeCompare(right);
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
