import { Injectable } from '@angular/core';
import { UniverseStateSnapshotService } from '../../../game/services/state/universe-state-snapshot.service';
import { RuntimeSolarSystemState, SerializedUniversePayload } from '../../../game/types/universe-state.types';

@Injectable({ providedIn: 'root' })
export class UniverseStateSnapshotAdapter {
  constructor(private readonly universeState: UniverseStateSnapshotService) {}

  capture(): RuntimeSolarSystemState {
    const systemId = this.universeState.getActiveSystemId() ?? 'unknown-system';
    return this.universeState.captureRuntimeState(systemId);
  }

  restoreFromPayload(params: { systemId: string; payload: SerializedUniversePayload | null | undefined; snapshotId?: string | null; reason?: string }): RuntimeSolarSystemState {
    if (!params.payload) {
      throw new Error('Cannot restore universe state because payload.universe is missing.');
    }
    return this.universeState.buildRuntimeStateFromPayload(
      params.systemId,
      params.payload,
      params.snapshotId ?? null,
      params.reason
    );
  }
}
