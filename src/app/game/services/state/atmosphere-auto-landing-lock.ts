export interface AtmosphereAutoLandingLockHost {
  isAtmosphereSceneActive(): boolean;
  hasSpaceship(): boolean;
  isTakeoffSequenceActive(): boolean;
  computeAltitudeAboveGround(): number;
  logDebug(message: string, data?: unknown): void;
}

/**
 * Cerrojo del auto-aterrizaje en atmósfera: una vez activo (tras tocar suelo en auto), se mantiene hasta que
 * la escena atmosférica se desactiva, empieza el despegue, o la nave sube por encima del umbral de altitud.
 * Antes vivía en GameEngine. Primera pieza (segura, autocontenida) de la espina del flujo de aterrizaje.
 * docs/ARQUITECTURA.md Fase 5.2 (sub-rebanada 5, incremental).
 */
export class AtmosphereAutoLandingLock {
  private active = false;
  private reason: string | null = null;
  private readonly RELEASE_ALTITUDE = 120;

  enable(host: AtmosphereAutoLandingLockHost, reason: string): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.reason = reason;
    host.logDebug('Atmosphere auto-landing lock engaged', { reason });
  }

  clear(host: AtmosphereAutoLandingLockHost, reason?: string): void {
    if (!this.active) {
      this.reason = null;
      return;
    }
    this.active = false;
    this.reason = null;
    host.logDebug('Atmosphere auto-landing lock released', { reason });
  }

  /** Comprueba el cerrojo y lo libera si las condiciones ya no se cumplen (escena/takeoff/altitud). */
  isLocked(host: AtmosphereAutoLandingLockHost): boolean {
    if (!this.active) {
      return false;
    }
    if (!host.isAtmosphereSceneActive() || !host.hasSpaceship()) {
      this.clear(host, 'scene-inactive');
      return false;
    }
    if (host.isTakeoffSequenceActive()) {
      this.clear(host, 'takeoff-sequence');
      return false;
    }
    const altitude = host.computeAltitudeAboveGround();
    if (Number.isFinite(altitude) && altitude >= this.RELEASE_ALTITUDE) {
      this.clear(host, 'altitude-threshold');
      return false;
    }
    return true;
  }
}
