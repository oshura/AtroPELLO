import { Injectable } from '@angular/core';
import { MIN_SUPPORTED_SAVEGAME_SCHEMA, SAVEGAME_SCHEMA_VERSION, SaveGamePayload } from '../../../game/types/save-game.types';
import { SaveGamePayloadInvalidError, SaveGameSchemaVersionMismatchError } from './save-game.errors';

@Injectable({ providedIn: 'root' })
export class SaveGameMigrationService {
  migrate(payload: SaveGamePayload | null | undefined): SaveGamePayload {
    if (!payload || typeof payload !== 'object') {
      throw new SaveGamePayloadInvalidError('SaveGame payload is empty or not an object.');
    }
    this.ensureSchemaSupported(payload.schemaVersion);
    return payload;
  }

  private ensureSchemaSupported(schemaVersion: unknown): void {
    if (!Number.isFinite(schemaVersion)) {
      throw new SaveGamePayloadInvalidError('SaveGame payload is missing a numeric schemaVersion.');
    }
    const version = Number(schemaVersion);
    if (version < MIN_SUPPORTED_SAVEGAME_SCHEMA || version > SAVEGAME_SCHEMA_VERSION) {
      throw new SaveGameSchemaVersionMismatchError(SAVEGAME_SCHEMA_VERSION, version);
    }
  }
}
