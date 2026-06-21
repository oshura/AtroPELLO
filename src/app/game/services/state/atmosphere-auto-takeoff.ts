export interface AtmosphereAutoTakeoffHost {
  isAtmosphereSceneActive(): boolean;
  isAtmosphereExitTransitionActive(): boolean;
  isLandingSequenceActive(): boolean;
  isTakeoffSequenceActive(): boolean;
  hasLandingTouchdownContext(): boolean;
  computeAltitudeAboveGround(): number;
  startAtmosphereExitSequence(origin: 'auto' | 'manual'): boolean;
  logInfo(message: string, data?: unknown): void;
  logWarn(message: string, data?: unknown): void;
}

/**
 * Auto-despegue por altitud: una vez armado (tras tocar suelo), si la nave sube por encima del umbral en
 * la escena atmosférica, dispara la salida de atmósfera. Antes vivía en GameEngine. `maybeTrigger` corre en
 * el LOOP (HOT) con early-return barato si no está armado. docs/ARQUITECTURA.md Fase 5.2 (sub-rebanada 5, pieza 2).
 */
export class AtmosphereAutoTakeoff {
  private armed = false;
  private readonly ALTITUDE = 1000;

  get isArmed(): boolean {
    return this.armed;
  }

  arm(): void {
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
  }

  /** HOT: en el loop. Si está armado y la nave supera el umbral de altitud, dispara la salida de atmósfera. */
  maybeTrigger(host: AtmosphereAutoTakeoffHost): void {
    if (!this.armed) {
      return;
    }
    if (!host.isAtmosphereSceneActive()) {
      return;
    }
    if (host.isAtmosphereExitTransitionActive()) {
      return;
    }
    if (host.isLandingSequenceActive() || host.isTakeoffSequenceActive()) {
      return;
    }
    if (!host.hasLandingTouchdownContext()) {
      return;
    }
    const altitude = host.computeAltitudeAboveGround();
    if (!Number.isFinite(altitude) || altitude < this.ALTITUDE) {
      return;
    }
    this.armed = false;
    const started = host.startAtmosphereExitSequence('auto');
    if (started) {
      host.logInfo('Auto takeoff triggered by altitude threshold', { altitude, threshold: this.ALTITUDE });
    } else {
      host.logWarn('Auto takeoff attempt failed', { altitude, threshold: this.ALTITUDE });
    }
  }
}
