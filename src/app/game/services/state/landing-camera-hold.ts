import { CameraMode } from '../../Camera';
import { LandingApproachContext } from '../../types/landing.types';

interface HoldCameraLike {
  setCameraMode(mode: CameraMode): void;
}

export interface LandingCameraHoldHost {
  getCamera(): HoldCameraLike | null;
  isPanelAwaitingUser(): boolean;
  clearAutoLandingPending(): void;
  takeAutoLandingPending(): LandingApproachContext | null;
  startAutoLandingCamera(context: LandingApproachContext): void;
}

/**
 * "Hold" de cámara durante cinemáticas de aterrizaje: congela el modo de cámara mientras el panel espera
 * decisión del jugador, y al liberar restaura el modo previo (y re-dispara la cámara de auto-aterrizaje
 * que quedó diferida). Lógica FRÍA (eventos). docs/ARQUITECTURA.md Fase 5.2 (sub-rebanada 3).
 */
export class LandingCameraHold {
  private hold: { prevMode: CameraMode | null } | null = null;
  private deferredForTakeoff = false;

  get isActive(): boolean {
    return this.hold !== null;
  }

  get isDeferredForTakeoff(): boolean {
    return this.deferredForTakeoff;
  }

  setDeferredForTakeoff(value: boolean): void {
    this.deferredForTakeoff = value;
  }

  acquire(host: LandingCameraHoldHost, prevMode: CameraMode | null): void {
    const camera = host.getCamera();
    if (!camera) {
      return;
    }
    if (!host.isPanelAwaitingUser()) {
      if (prevMode !== null) {
        try { camera.setCameraMode(prevMode); } catch { /* ignore */ }
      }
      return;
    }
    if (this.hold) {
      this.hold.prevMode = prevMode ?? null;
      return;
    }
    this.hold = { prevMode: prevMode ?? null };
  }

  release(host: LandingCameraHoldHost, options?: { restoreCamera?: boolean }): void {
    if (!this.hold) {
      host.clearAutoLandingPending();
      return;
    }
    const prevMode = this.hold.prevMode;
    this.hold = null;
    this.deferredForTakeoff = false;
    const camera = host.getCamera();
    const shouldRestoreCamera = options?.restoreCamera !== false;
    if (shouldRestoreCamera && camera && prevMode !== null) {
      try { camera.setCameraMode(prevMode); } catch { /* ignore */ }
    }
    const pending = host.takeAutoLandingPending();
    if (pending) {
      host.startAutoLandingCamera(pending);
    }
  }
}
