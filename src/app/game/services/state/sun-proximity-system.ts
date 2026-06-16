import { Sun } from '../../game-objects/Sun';
import { Spaceship } from '../../game-objects/Spaceship';
import { GameObject } from '../../GameObject';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';

/**
 * El engine ejecuta los efectos colaterales (daño a la nave, marquee, vignette); este sistema
 * solo calcula la exposición solar y orquesta los ticks de daño.
 */
export interface SunDamageHost {
  getPlayerShip(): Spaceship | null;
  isLandingDamageSuppressed(): boolean;
  collectActiveSuns(): Sun[];
  applyShipDamage(
    amount: number,
    sourceId: string,
    reason: string,
    options?: { suppressHud?: boolean; customHudMessage?: string; sourceObject?: GameObject | null }
  ): number;
  emitHazardMarquee(message: string): void;
  addImpactVignette(boost: number): void;
}

/**
 * Daño por proximidad a estrellas, extraído de GameEngine (docs/ARQUITECTURA.md Fase 5).
 * Clase plana instanciada por el engine (lazy, sin DI). Lógica movida verbatim.
 */
export class SunProximitySystem {
  private readonly INTERVAL_MS = 5000;
  private readonly THRESHOLD = 3000;
  private readonly STEP_DISTANCE = 100;
  private exposureTimerMs = 0;

  constructor(private readonly logger: LoggingService) {}

  /** Acumula exposición con el delta del frame y aplica ticks de daño mientras la nave siga cerca. */
  public tick(deltaTime: number, host: SunDamageHost): void {
    const ship = host.getPlayerShip();
    if (!ship || host.isLandingDamageSuppressed()) {
      this.exposureTimerMs = 0;
      return;
    }
    const nearby = this.sunsWithinDistance(host, this.THRESHOLD);
    if (!nearby.length) {
      this.exposureTimerMs = 0;
      return;
    }

    this.exposureTimerMs += deltaTime * 1000;
    while (this.exposureTimerMs >= this.INTERVAL_MS) {
      this.exposureTimerMs -= this.INTERVAL_MS;
      this.applyDamageTick(host);
      const current = host.getPlayerShip();
      if (!current || current.healthCurrent <= 0) {
        break;
      }
      const stillNear = this.sunsWithinDistance(host, this.THRESHOLD);
      if (!stillNear.length) {
        this.exposureTimerMs = 0;
        break;
      }
    }
  }

  private sunRadius(sun: Sun): number {
    const scaleRadius = Number.isFinite((sun as any)?.scale?.x) ? (sun as any).scale.x : null;
    const explicitRadius = Number.isFinite((sun as any)?.radius) ? (sun as any).radius : null;
    const radius = scaleRadius ?? explicitRadius ?? 0;
    return Math.max(0, radius);
  }

  private sunsWithinDistance(
    host: SunDamageHost,
    maxDistance: number
  ): Array<{ sun: Sun; distanceToCenter: number; surfaceDistance: number }> {
    const ship = host.getPlayerShip();
    if (!ship) {
      return [];
    }
    const shipPos = ship.position;
    const damaging: Array<{ sun: Sun; distanceToCenter: number; surfaceDistance: number }> = [];
    for (const sun of host.collectActiveSuns()) {
      const dx = sun.position.x - shipPos.x;
      const dy = sun.position.y - shipPos.y;
      const dz = sun.position.z - shipPos.z;
      const distanceToCenter = Math.hypot(dx, dy, dz);
      const surfaceDistance = Math.max(0, distanceToCenter - this.sunRadius(sun));
      if (surfaceDistance <= maxDistance) {
        damaging.push({ sun, distanceToCenter, surfaceDistance });
      }
    }
    return damaging.sort((a, b) => a.surfaceDistance - b.surfaceDistance);
  }

  private applyDamageTick(host: SunDamageHost): void {
    const damaging = this.sunsWithinDistance(host, this.THRESHOLD);
    if (!damaging.length) {
      return;
    }

    let totalDamage = 0;
    for (const entry of damaging) {
      const closeness = Math.max(0, this.THRESHOLD - entry.surfaceDistance);
      const bonus = Math.floor(closeness / this.STEP_DISTANCE);
      totalDamage += 1 + Math.max(0, bonus);
    }

    if (totalDamage <= 0) {
      return;
    }

    const applied = host.applyShipDamage(totalDamage, 'sun-core', 'sun-radiation', {
      suppressHud: true,
      sourceObject: damaging[0]?.sun ?? null
    });

    if (applied <= 0) {
      return;
    }

    const ship = host.getPlayerShip();
    this.logger.log(LogLevel.INFO, LogCategory.GAME_LOOP, 'Sun proximity damage applied', {
      totalDamage: applied,
      damagingSuns: damaging.length,
      surfaceDistances: damaging.map(d => Math.round(d.surfaceDistance)),
      centerDistances: damaging.map(d => Math.round(d.distanceToCenter)),
      healthAfter: ship?.healthCurrent ?? 0,
    });

    host.emitHazardMarquee(`Radiación solar: -${applied}u (${ship?.healthCurrent ?? 0}/${ship?.healthMax ?? 0})`);
    host.addImpactVignette(Math.min(0.4, applied / 25));
  }
}
