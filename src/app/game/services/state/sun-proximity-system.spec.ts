import { SunProximitySystem, SunDamageHost } from './sun-proximity-system';
import { Sun } from '../../game-objects/Sun';
import { Spaceship } from '../../game-objects/Spaceship';
import { GameObject } from '../../GameObject';
import { LoggingService } from '../../../services/logging.service';

function fakeSun(id: string, x: number, radius = 0): Sun {
  return { id, position: { x, y: 0, z: 0 }, radius } as unknown as Sun;
}

function fakeShip(): Spaceship {
  return { position: { x: 0, y: 0, z: 0 }, healthCurrent: 100, healthMax: 100 } as unknown as Spaceship;
}

class SunHostFake implements SunDamageHost {
  ship: Spaceship | null = fakeShip();
  suppressed = false;
  suns: Sun[] = [];
  damageCalls: number[] = [];
  hazards: string[] = [];
  vignettes: number[] = [];

  getPlayerShip(): Spaceship | null {
    return this.ship;
  }
  isLandingDamageSuppressed(): boolean {
    return this.suppressed;
  }
  collectActiveSuns(): Sun[] {
    return this.suns;
  }
  applyShipDamage(amount: number, _s: string, _r: string, _o?: { sourceObject?: GameObject | null }): number {
    this.damageCalls.push(amount);
    if (this.ship) {
      this.ship.healthCurrent = Math.max(0, this.ship.healthCurrent - amount);
    }
    return amount;
  }
  emitHazardMarquee(message: string): void {
    this.hazards.push(message);
  }
  addImpactVignette(boost: number): void {
    this.vignettes.push(boost);
  }
}

describe('SunProximitySystem', () => {
  let logger: LoggingService;
  let system: SunProximitySystem;

  beforeEach(() => {
    logger = new LoggingService();
    spyOn(logger, 'log').and.stub();
    system = new SunProximitySystem(logger);
  });

  it('no aplica daño si no hay nave', () => {
    const host = new SunHostFake();
    host.ship = null;
    host.suns = [fakeSun('s', 500)];
    system.tick(10, host);
    expect(host.damageCalls.length).toBe(0);
  });

  it('no aplica daño durante supresión de aterrizaje', () => {
    const host = new SunHostFake();
    host.suppressed = true;
    host.suns = [fakeSun('s', 500)];
    system.tick(10, host);
    expect(host.damageCalls.length).toBe(0);
  });

  it('no aplica daño si la estrella está fuera del umbral', () => {
    const host = new SunHostFake();
    host.suns = [fakeSun('s', 5000)]; // surfaceDistance 5000 > 3000
    system.tick(10, host);
    expect(host.damageCalls.length).toBe(0);
  });

  it('aplica daño escalado por cercanía al superar el intervalo', () => {
    const host = new SunHostFake();
    host.suns = [fakeSun('s', 1000)]; // surfaceDistance 1000 ⇒ closeness 2000 ⇒ bonus 20 ⇒ daño 21
    system.tick(5, host); // 5s = 5000ms = un intervalo exacto

    expect(host.damageCalls).toEqual([21]);
    expect(host.hazards.length).toBe(1);
    expect(host.vignettes).toEqual([Math.min(0.4, 21 / 25)]);
  });

  it('no daña por debajo de un intervalo completo (acumula)', () => {
    const host = new SunHostFake();
    host.suns = [fakeSun('s', 1000)];
    system.tick(3, host); // 3000ms < 5000ms
    expect(host.damageCalls.length).toBe(0);
    system.tick(3, host); // acumulado 6000ms ⇒ un tick
    expect(host.damageCalls.length).toBe(1);
  });
});
