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
  metadata.characterId = metadata.characterId ? 'NORMALIZED-CHAR' : null;
}

function normalizePlayerSection(section: SaveGamePlayerSection): void {
  if (section.character) {
    // Hitos de historia: opcionales y sin orden significativo (Fase 13).
    section.character.storyFlags = sortBy(section.character.storyFlags ?? [], flag => flag ?? '');
    // Sintonía del rito: opcional (Fase 15); null explícito para comparar round-trips.
    section.character.gateTuning = section.character.gateTuning ?? null;
  }
  if (section.ship) {
    // El outfit es opcional (savegames anteriores a la Fase 12): sin él, nave sin armamento.
    section.ship.outfit = section.ship.outfit ?? null;
    if (section.ship.outfit) {
      section.ship.outfit.weapons = sortBy(section.ship.outfit.weapons ?? [], w => `${w.slotIndex}:${w.weaponId}`);
    }
  }
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
  const universe = payload.universe;
  if (!universe) {
    return;
  }
  // Campos volátiles (timestamps/ids generados con Date.now) se neutralizan para comparar.
  universe.id = 'NORMALIZED';
  universe.timestamp = 0;
  universe.planets = sortSerialized(universe.planets ?? []);
  if (universe.clusters) {
    universe.clusters = sortSerialized(universe.clusters);
  }
  if (universe.portals) {
    universe.portals = sortSerialized(universe.portals);
  }
  if (universe.planetDebris) {
    universe.planetDebris = sortSerialized(universe.planetDebris);
  }
  if (universe.meta) {
    universe.meta = rebuildSortedRecord(universe.meta);
    universe.meta['lastRuntimeCaptureAt'] = 0;
    universe.meta['archivedAt'] = 0;
  }
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
