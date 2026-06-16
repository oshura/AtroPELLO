import { SolarSystemMeta, SolarSystemSnapshot } from '../../types/solar-system.types';

/**
 * FUENTE ÚNICA DE VERDAD de la identidad de un sistema solar
 * (docs/ARQUITECTURA.md §4.3, Fase 3).
 *
 * Antes de este módulo había 4+ resolvedores con precedencias divergentes
 * (GameEngine, PortalPersistence, UniverseStateSnapshot, RuntimeSerializer), lo que
 * provocaba que el mismo sistema se identificara distinto según el camino y se
 * duplicara/perdiera al guardar, cargar o saltar por portal.
 *
 * Tres conceptos, una precedencia cada uno:
 *  - systemId:    id LÓGICO del sistema (display, targetSystemId del restart).
 *  - snapshotId:  id de ESTA captura concreta (metadata del savegame).
 *  - systemKey:   clave PERSISTENTE para dedup/evicción/memoria de lesser beings.
 *
 * REGLA DURA: nadie resuelve identidad de sistema fuera de este módulo.
 */

export function getSystemMeta(snapshot: SolarSystemSnapshot | null | undefined): SolarSystemMeta {
  return (snapshot?.meta ?? {}) as SolarSystemMeta;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
}

function firstNonEmpty(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    const value = nonEmpty(candidate);
    if (value) {
      return value;
    }
  }
  return null;
}

function sunFallback(snapshot: SolarSystemSnapshot | null | undefined): string | null {
  const sunId = snapshot?.sun?.id;
  return sunId ? `sun:${sunId}` : null;
}

/** Id lógico del sistema (usado como targetSystemId y para display). */
export function resolveSystemId(snapshot: SolarSystemSnapshot | null | undefined): string | null {
  if (!snapshot) {
    return null;
  }
  const meta = getSystemMeta(snapshot);
  return firstNonEmpty(meta.proceduralSystemId, meta.systemId, snapshot.id, sunFallback(snapshot));
}

/** Id de la captura concreta (prefiere el id explícito del snapshot). */
export function resolveSnapshotId(snapshot: SolarSystemSnapshot | null | undefined): string | null {
  if (!snapshot) {
    return null;
  }
  const meta = getSystemMeta(snapshot);
  return firstNonEmpty(snapshot.id, meta.proceduralSystemId, meta.systemId);
}

/**
 * Clave persistente del sistema: dedup en PortalPersistence, evicción por sistema y
 * almacén de memoria de lesser beings. Acepta una etiqueta de fallback (p.ej. la
 * etiqueta de snapshot activa del engine) para sistemas aún sin id estable.
 */
export function resolveSystemKey(
  snapshot: SolarSystemSnapshot | null | undefined,
  opts?: { fallbackLabel?: string | null }
): string | null {
  if (!snapshot) {
    return null;
  }
  const meta = getSystemMeta(snapshot);
  // `snapshot.id` va ANTES que las etiquetas: la etiqueta es por slot de almacenamiento
  // (un mismo sistema puede guardarse bajo varias), así que usarla como clave rompería
  // el dedup. Las etiquetas solo entran como último recurso para snapshots sin id estable.
  return firstNonEmpty(
    meta.persistentSystemId,
    meta.proceduralSystemId,
    meta.sourceSystemId,
    snapshot.id,
    meta.snapshotLabel,
    opts?.fallbackLabel,
    sunFallback(snapshot)
  );
}
