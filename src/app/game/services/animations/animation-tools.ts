import { CameraMode } from '../../Camera';

/**
 * Herramientas reutilizables del subsistema de animaciones (docs/ARQUITECTURA.md Fase 8). Cada animación
 * cinemática reimplementaba estas mismas piezas (bloqueo de teclado, toma/restauración de cámara, guardado
 * de la dinámica de la nave) con copias casi idénticas y banderas divergentes. Estas clases unifican el
 * comportamiento y se liberan SIEMPRE por el mismo camino (start ↔ finish/cleanup), evitando divergencias.
 */

/**
 * Bloquea TODO el teclado a nivel documento (captura) mientras una animación es dueña de la entrada.
 * Antes era el bloque `installKeyBlockers()` copiado verbatim en void-jump/landing-sequence/etc.
 */
export class InputLockGuard {
  private removers: Array<() => void> = [];
  private readonly events: ReadonlyArray<keyof DocumentEventMap> = ['keydown', 'keyup', 'keypress'];

  lock(): void {
    if (this.removers.length) {
      return; // ya bloqueado: idempotente
    }
    const block: EventListener = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    this.events.forEach((evt) => {
      document.addEventListener(evt, block, { capture: true });
      this.removers.push(() => document.removeEventListener(evt, block, { capture: true }));
    });
  }

  release(): void {
    try {
      this.removers.forEach((fn) => fn());
    } catch {
      // best-effort
    }
    this.removers = [];
  }

  get isLocked(): boolean {
    return this.removers.length > 0;
  }
}

/** Mínimo de la cámara que las animaciones necesitan tomar/restaurar. */
export interface CameraLike {
  getCurrentMode?: () => CameraMode;
  setCameraMode?: (mode: CameraMode) => void;
}

/**
 * Toma la cámara para una animación: guarda el modo previo, fija uno nuevo y lo restaura al terminar.
 * Soporta "relatchear" a un modo final distinto (p.ej. void-jump acaba en COCKPIT en vez de restaurar).
 */
export class CameraTakeover {
  private previousMode: CameraMode | null = null;
  private active = false;
  private finalMode: CameraMode | null = null;

  /** Guarda el modo actual y aplica `mode`. */
  take(camera: CameraLike | null | undefined, mode: CameraMode): void {
    if (!camera || this.active) {
      return;
    }
    this.previousMode = camera.getCurrentMode?.() ?? null;
    this.active = true;
    this.finalMode = null;
    try { camera.setCameraMode?.(mode); } catch { /* best-effort */ }
  }

  /** Cambia el modo en vivo y, si `asFinal`, lo deja como modo al que NO se restaura el previo. */
  setMode(camera: CameraLike | null | undefined, mode: CameraMode, asFinal = false): void {
    if (!camera) {
      return;
    }
    if (asFinal) {
      this.finalMode = mode;
    }
    try { camera.setCameraMode?.(mode); } catch { /* best-effort */ }
  }

  /** Restaura el modo previo (o aplica el modo final si se fijó uno). Idempotente. */
  restore(camera: CameraLike | null | undefined): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    if (!camera) {
      this.previousMode = null;
      this.finalMode = null;
      return;
    }
    const target = this.finalMode ?? this.previousMode;
    if (target !== null) {
      try { camera.setCameraMode?.(target); } catch { /* best-effort */ }
    }
    this.previousMode = null;
    this.finalMode = null;
  }
}

/** Mínimo de la nave para el guardado/restaurado de su dinámica durante una cinemática. */
export interface ShipDynamicsLike {
  acceleration: number;
  deceleration: number;
  maxSpeed: number;
  voidEnergyPaused?: boolean;
  voidEnergyCurrent?: number;
}

interface ShipDynamicsSnapshot {
  acceleration: number;
  deceleration: number;
  maxSpeed: number;
  voidEnergyCurrent?: number;
}

/**
 * Guarda la dinámica de la nave (aceleración/deceleración/maxSpeed y, opcionalmente, energía del vacío)
 * y la restaura al terminar — el patrón save/restore que void-jump y landing-sequence copiaban a mano.
 */
export class ShipDynamicsScope {
  private snapshot: ShipDynamicsSnapshot | null = null;

  /** Guarda la dinámica actual. Si `pauseVoidEnergy`, guarda la energía y la pausa. */
  capture(ship: ShipDynamicsLike | null | undefined, pauseVoidEnergy = false): void {
    if (!ship || this.snapshot) {
      return;
    }
    this.snapshot = {
      acceleration: ship.acceleration,
      deceleration: ship.deceleration,
      maxSpeed: ship.maxSpeed,
      voidEnergyCurrent: pauseVoidEnergy ? ship.voidEnergyCurrent : undefined,
    };
    if (pauseVoidEnergy) {
      ship.voidEnergyPaused = true;
    }
  }

  /** Restaura la dinámica guardada (y reanuda la energía del vacío si se pausó). Idempotente. */
  restore(ship: ShipDynamicsLike | null | undefined): void {
    const snap = this.snapshot;
    this.snapshot = null;
    if (!ship || !snap) {
      return;
    }
    ship.acceleration = snap.acceleration;
    ship.deceleration = snap.deceleration;
    ship.maxSpeed = snap.maxSpeed;
    if (snap.voidEnergyCurrent !== undefined) {
      ship.voidEnergyCurrent = snap.voidEnergyCurrent;
    }
    ship.voidEnergyPaused = false;
  }

  get hasSnapshot(): boolean {
    return this.snapshot !== null;
  }
}
