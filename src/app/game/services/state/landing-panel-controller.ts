import { LandingApproachContext } from '../../types/landing.types';

/**
 * Controlador del flujo del PANEL de aterrizaje (timer de apertura diferida + foco de audio + abrir/cerrar
 * + flag "esperando al usuario"). Antes vivía disperso en GameEngine. Es lógica FRÍA (dirigida por eventos,
 * no por frame). El motor delega y satisface el host con un adaptador cacheado. docs/ARQUITECTURA.md Fase 5.2
 * (sub-rebanada 1). `awaitingUser` lo LEEN atmósfera/cinematics → se expone por getter.
 */
export interface LandingPanelAirHandle {
  stop(fadeMs?: number): void;
}

export interface LandingPanelHost {
  /** Abre el panel (componente Angular global). true si se abrió. */
  openPanelUI(context: LandingApproachContext): boolean;
  /** Fuerza el cierre del panel (componente Angular global). */
  forceClosePanelUI(reason?: string): void;
  /** Arranca el loop de "air rush" del panel (ready+stopAtmosphere+has+play); null si no procede. */
  playLandingPanelAir(): LandingPanelAirHandle | null;
  releaseLandingCinematicCameraHold(reason: string): void;
  isLandingCameraHoldDeferredForTakeoff(): boolean;
  logWarn(message: string, data?: unknown): void;
}

export class LandingPanelController {
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private awaiting = false;
  private audioFocusArmed = false;
  private audioFocusActive = false;
  private airHandle: LandingPanelAirHandle | null = null;

  /** ¿El panel está abierto esperando decisión del jugador? (lo leen atmósfera/cinematics). */
  get isAwaitingUser(): boolean {
    return this.awaiting;
  }

  setAwaitingUser(value: boolean): void {
    this.awaiting = value;
  }

  setAudioFocusArmed(value: boolean): void {
    this.audioFocusArmed = value;
  }

  tryOpen(host: LandingPanelHost, context: LandingApproachContext): boolean {
    try {
      if (host.openPanelUI(context)) {
        if (this.audioFocusArmed) {
          this.applyAudioFocus(host);
          this.audioFocusArmed = false;
        }
        return true;
      }
    } catch (error) {
      host.logWarn('Landing panel open failed', error);
    }
    this.awaiting = false;
    host.releaseLandingCinematicCameraHold('landing-panel-open-failed');
    return false;
  }

  openWithDelay(host: LandingPanelHost, context: LandingApproachContext, delayMs: number): boolean {
    if (delayMs <= 0) {
      return this.tryOpen(host, context);
    }
    const timer = setTimeout(() => {
      this.pendingTimer = null;
      this.tryOpen(host, context);
    }, delayMs);
    this.pendingTimer = timer;
    return true;
  }

  clearPendingTimer(host: LandingPanelHost): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.awaiting = false;
      host.releaseLandingCinematicCameraHold('landing-panel-timer-cleared');
    }
  }

  notifyClosed(host: LandingPanelHost): void {
    this.stopAudioFocus();
    this.audioFocusArmed = false;
    this.awaiting = false;
    if (host.isLandingCameraHoldDeferredForTakeoff()) {
      return;
    }
    host.releaseLandingCinematicCameraHold('landing-panel-closed');
  }

  closeUI(host: LandingPanelHost, reason?: string): void {
    this.notifyClosed(host);
    host.forceClosePanelUI(reason);
  }

  applyAudioFocus(host: LandingPanelHost): void {
    if (this.audioFocusActive) {
      return;
    }
    this.stopAudioFocus();
    const handle = host.playLandingPanelAir();
    if (handle) {
      this.airHandle = handle;
      this.audioFocusActive = true;
    }
  }

  stopAudioFocus(): void {
    if (this.airHandle) {
      try { this.airHandle.stop(160); } catch { /* ignore */ }
      this.airHandle = null;
    }
    this.audioFocusActive = false;
  }

  /** Detiene el foco de audio y desarma (lo que hacen takeoff/exit). */
  cancelAudioFocus(): void {
    this.stopAudioFocus();
    this.audioFocusArmed = false;
  }
}
