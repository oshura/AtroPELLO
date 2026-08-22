/**
 * SpeedRiteSystem — Rito del Tiempo Doblado (SpellType.SPEED).
 *
 * FUENTE ÚNICA DE VERDAD del buff de velocidad: duplica maxSpeed/aceleración/deceleración
 * durante un tiempo y las restaura al expirar.
 *
 * Por qué existe (bug histórico que arregla): el buff se aplicaba y expiraba dentro del
 * GameEngine, pero las cinemáticas (aterrizaje/despegue/void jump) capturan y restauran la
 * dinámica de la nave con `ShipDynamicsScope`. Si el rito expiraba MIENTRAS una cinemática tenía
 * capturada la dinámica duplicada, el `restore()` posterior re-aplicaba el doble y el motor ya
 * había olvidado la base → la nave se quedaba al doble de velocidad PARA SIEMPRE (y el savegame
 * lo persistía). Por eso este sistema CONSERVA la base incluso después de expirar y expone
 * `sanitize()`, que revierte cualquier reaparición del buff cuando el rito ya no está activo.
 *
 * Patrón: clase plana sin DI (docs/ARQUITECTURA.md §5.3). El motor la instancia, cachea un host
 * y delega.
 */

/** Dinámica de la nave que el rito modifica. */
export interface SpeedRiteShipLike {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  targetSpeed: number;
  currentSpeed: number;
}

/** Dinámica base (sin buff) tal y como la conoce el motor. */
export interface SpeedRiteBaseline {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
}

export interface SpeedRiteHost {
  /** Nave activa, o null si aún no existe. */
  getShip(): SpeedRiteShipLike | null;
  /**
   * true mientras la dinámica de la nave está intervenida por una cinemática (aterrizaje,
   * despegue, salida de atmósfera): en esos tramos la baseline NO debe recapturarse.
   */
  isDynamicsFrozen(): boolean;
  /** La dinámica base cambió: publicarla (la persistencia guarda ESTA, no la instantánea). */
  onBaselinePublished(baseline: SpeedRiteBaseline): void;
  logInfo(message: string, data?: unknown): void;
}

/** Multiplicador del rito: "Double Phased Time Rite". */
export const SPEED_RITE_MULTIPLIER = 2;
/** Duración por defecto del rito (2 minutos). */
export const SPEED_RITE_DEFAULT_DURATION_MS = 120000;

export class SpeedRiteSystem {
  private untilMs: number | null = null;
  /**
   * Dinámica base sin buff. NO se borra al expirar: es lo que permite a `sanitize()` detectar y
   * revertir un buff resucitado por el `restore()` de una cinemática.
   */
  private base: SpeedRiteBaseline | null = null;
  /** Dinámica base observada de la nave: la referencia con la que se calcula el buff. */
  private baseline: SpeedRiteBaseline = { maxSpeed: 20, acceleration: 2, deceleration: 2.5 };
  private baselineInitialized = false;

  /** Instante (performance.now) en el que caduca el rito, o null si no hay rito. */
  public get expiresAtMs(): number | null {
    return this.untilMs;
  }

  public isActive(now: number = performance.now()): boolean {
    return this.untilMs !== null && Number.isFinite(this.untilMs) && now < this.untilMs;
  }

  /** Segundos restantes (floor, para no mostrar un "00:01" fantasma), o null si no hay rito. */
  public remainingSec(now: number = performance.now()): number | null {
    if (!this.isActive(now)) {
      return null;
    }
    return Math.max(0, Math.floor(((this.untilMs as number) - now) / 1000));
  }

  /**
   * Velocidad máxima BASE (pre-rito). Es la que deben usar el audio de thrusters, el HUD extendido
   * (0..200 %) y la persistencia, para que guardar con el rito activo no fosilice el doble.
   */
  public getBaseMaxSpeed(fallback: number): number {
    const base = this.base?.maxSpeed;
    return base !== undefined && Number.isFinite(base) && base > 0 ? base : fallback;
  }

  /** Dinámica base conocida (copia), o null si el rito nunca se ha lanzado. */
  public getBaseline(): SpeedRiteBaseline | null {
    return this.base ? { ...this.base } : null;
  }

  /**
   * Reobserva la dinámica de la nave como base. NO captura mientras el rito está activo ni durante
   * una cinemática: en esos tramos la nave lleva valores prestados y adoptarlos como base es
   * exactamente el bug que este sistema evita.
   */
  public refreshBaseline(host: SpeedRiteHost, force = false, now: number = performance.now()): void {
    const ship = host.getShip();
    if (!ship) {
      return;
    }
    if (!force && (this.isActive(now) || host.isDynamicsFrozen())) {
      return;
    }
    const next: SpeedRiteBaseline = {
      maxSpeed: Number.isFinite(ship.maxSpeed) ? ship.maxSpeed : this.baseline.maxSpeed,
      acceleration: Number.isFinite(ship.acceleration) ? ship.acceleration : this.baseline.acceleration,
      deceleration: Number.isFinite(ship.deceleration) ? ship.deceleration : this.baseline.deceleration,
    };
    const changed =
      !this.baselineInitialized ||
      Math.abs(next.maxSpeed - this.baseline.maxSpeed) > 1e-3 ||
      Math.abs(next.acceleration - this.baseline.acceleration) > 1e-3 ||
      Math.abs(next.deceleration - this.baseline.deceleration) > 1e-3;
    if (force || changed) {
      this.baseline = next;
      this.baselineInitialized = true;
      host.onBaselinePublished({ ...next });
    }
  }

  /** Ciclo por frame: caducar, sanear y reobservar la base. En ESE orden. */
  public tick(host: SpeedRiteHost, now: number = performance.now()): void {
    this.updateExpiry(host, now);
    this.sanitize(host, now);
    this.refreshBaseline(host, false, now);
  }

  /**
   * Activa o extiende el rito. Si no hay rito en curso, re-captura la base desde el motor, de modo
   * que las mejoras permanentes de motor (p. ej. las de los Grises) se respetan sin ceremonia.
   */
  public apply(
    host: SpeedRiteHost,
    durationMs: number = SPEED_RITE_DEFAULT_DURATION_MS,
    now: number = performance.now()
  ): void {
    const ship = host.getShip();
    if (!ship) {
      return;
    }
    if (!this.isActive(now) || !this.base) {
      this.base = this.sanitizeBaseline(this.currentBaseline(ship), ship);
    }
    const base = this.base;
    ship.maxSpeed = base.maxSpeed * SPEED_RITE_MULTIPLIER;
    ship.acceleration = base.acceleration * SPEED_RITE_MULTIPLIER;
    ship.deceleration = base.deceleration * SPEED_RITE_MULTIPLIER;
    this.untilMs = now + Math.max(0, durationMs);
  }

  /**
   * Caduca el rito si toca. Devuelve true SOLO en el frame de la expiración.
   * Debe ejecutarse ANTES de que el motor refresque su baseline: si no, la baseline absorbe el
   * doble justo en ese frame.
   */
  public updateExpiry(host: SpeedRiteHost, now: number = performance.now()): boolean {
    if (this.untilMs === null || !Number.isFinite(this.untilMs) || now < this.untilMs) {
      return false;
    }
    this.untilMs = null;
    const ship = host.getShip();
    if (ship) {
      this.restoreDynamics(ship, this.base ?? this.sanitizeBaseline(this.currentBaseline(ship), ship));
    }
    this.refreshBaseline(host, true, now);
    return true;
  }

  /**
   * Revierte un buff que haya resucitado con el rito ya caducado (el `restore()` de una cinemática
   * que capturó la dinámica duplicada). Sólo actúa si la dinámica es EXACTAMENTE el doble de la
   * base conocida, para no pisar mejoras legítimas de la nave. Devuelve true si corrigió algo.
   */
  public sanitize(host: SpeedRiteHost, now: number = performance.now()): boolean {
    if (this.isActive(now)) {
      return false;
    }
    const base = this.base;
    const ship = host.getShip();
    if (!base || !ship) {
      return false;
    }
    if (
      !this.looksBuffed(ship.maxSpeed, base.maxSpeed) &&
      !this.looksBuffed(ship.acceleration, base.acceleration) &&
      !this.looksBuffed(ship.deceleration, base.deceleration)
    ) {
      return false;
    }
    this.restoreDynamics(ship, base);
    this.refreshBaseline(host, true, now);
    host.logInfo('Speed Rite: dinámica duplicada revertida tras caducar el rito', {
      maxSpeed: base.maxSpeed,
      acceleration: base.acceleration,
      deceleration: base.deceleration,
    });
    return true;
  }

  /**
   * Olvida la base conocida: la próxima activación la re-captura. Lo usan las mejoras permanentes
   * de motor para que `sanitize()` no arrastre valores viejos.
   */
  public resetBase(): void {
    this.base = null;
  }

  /** Corta el rito sin restaurar (respawn/carga de partida: la nave ya trae su dinámica). */
  public reset(): void {
    this.untilMs = null;
    this.base = null;
    this.baselineInitialized = false;
  }

  /** Base observada, inicializándola con la nave si aún no se ha observado ninguna. */
  private currentBaseline(ship: SpeedRiteShipLike): SpeedRiteBaseline {
    if (!this.baselineInitialized) {
      this.baseline = {
        maxSpeed: ship.maxSpeed,
        acceleration: ship.acceleration,
        deceleration: ship.deceleration,
      };
      this.baselineInitialized = true;
    }
    return { ...this.baseline };
  }

  private restoreDynamics(ship: SpeedRiteShipLike, base: SpeedRiteBaseline): void {
    ship.maxSpeed = base.maxSpeed;
    ship.acceleration = base.acceleration;
    ship.deceleration = base.deceleration;
    // Clamp para evitar el overshoot visual de venir de una punta al doble.
    ship.targetSpeed = Math.min(ship.targetSpeed, ship.maxSpeed);
    ship.currentSpeed = Math.min(ship.currentSpeed, ship.maxSpeed);
  }

  private looksBuffed(current: number, base: number): boolean {
    if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) {
      return false;
    }
    const buffed = base * SPEED_RITE_MULTIPLIER;
    return Math.abs(current - buffed) <= Math.max(1e-3, buffed * 1e-3);
  }

  private sanitizeBaseline(baseline: SpeedRiteBaseline, ship: SpeedRiteShipLike): SpeedRiteBaseline {
    return {
      maxSpeed: this.finiteOr(baseline.maxSpeed, ship.maxSpeed),
      acceleration: this.finiteOr(baseline.acceleration, ship.acceleration),
      deceleration: this.finiteOr(baseline.deceleration, ship.deceleration),
    };
  }

  private finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
