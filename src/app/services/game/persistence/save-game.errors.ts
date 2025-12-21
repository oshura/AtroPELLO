export class SaveGameInProgressError extends Error {
  constructor() {
    super('A save capture is already running. Wait until it finishes before triggering another one.');
    this.name = 'SaveGameInProgressError';
  }
}

export class SaveGameEngineUnavailableError extends Error {
  constructor() {
    super('Game engine is not initialized; cannot capture or load the current game state.');
    this.name = 'SaveGameEngineUnavailableError';
  }
}

export class SaveGameCaptureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SaveGameCaptureError';
    if (options?.cause !== undefined) {
      (this as any).cause = options.cause;
    }
  }
}

export class SaveGamePayloadInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveGamePayloadInvalidError';
  }
}

export class SaveGameSchemaVersionMismatchError extends Error {
  constructor(expected: number, received: number) {
    super(`SaveGame schema mismatch. Expected version ${expected} but received ${received}.`);
    this.name = 'SaveGameSchemaVersionMismatchError';
  }
}

export class LoadGameInProgressError extends Error {
  constructor() {
    super('A load operation is already running. Wait until it finishes before triggering another one.');
    this.name = 'LoadGameInProgressError';
  }
}

export class SaveGameAtmosphereRestrictedError extends SaveGameCaptureError {
  constructor() {
    super('Save capture blocked while the ship remains within an atmosphere.');
    this.name = 'SaveGameAtmosphereRestrictedError';
  }
}
