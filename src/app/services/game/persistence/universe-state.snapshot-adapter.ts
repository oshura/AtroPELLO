import { Injectable } from '@angular/core';
import { UniverseStateSnapshotService, AdoptSnapshotOptions } from '../../../game/services/state/universe-state-snapshot.service';
import { RuntimeSolarSystemState } from '../../../game/types/universe-state.types';
import { SolarSystemSnapshot } from '../../../game/types/solar-system.types';

/**
 * Fachada del pipeline de persistencia sobre UniverseStateSnapshotService.
 * Tras la Fase 4 el universo se guarda/restaura como SolarSystemSnapshot (una sola
 * representación del mundo, ver docs/ARQUITECTURA.md §4.3).
 */
@Injectable({ providedIn: 'root' })
export class UniverseStateSnapshotAdapter {
  constructor(private readonly universeState: UniverseStateSnapshotService) {}

  /** Captura el sistema activo como snapshot para incrustarlo en la partida guardada. */
  captureSnapshot(): SolarSystemSnapshot {
    return this.universeState.captureCurrentSnapshot();
  }

  /** Aplica el snapshot embebido al cargar (mismo camino que cruzar un portal). */
  adoptSnapshot(options: AdoptSnapshotOptions): RuntimeSolarSystemState {
    return this.universeState.adoptSnapshot(options);
  }
}
