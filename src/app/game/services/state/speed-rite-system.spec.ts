import {
  SpeedRiteSystem,
  SpeedRiteHost,
  SpeedRiteShipLike,
  SpeedRiteBaseline,
  SPEED_RITE_MULTIPLIER,
} from './speed-rite-system';

/** Arnés mínimo: una nave con dinámica y un host que anota la base publicada. */
function makeHarness(initial: SpeedRiteBaseline = { maxSpeed: 20, acceleration: 2, deceleration: 2.5 }) {
  const ship: SpeedRiteShipLike = {
    maxSpeed: initial.maxSpeed,
    acceleration: initial.acceleration,
    deceleration: initial.deceleration,
    targetSpeed: 0,
    currentSpeed: 0,
  };
  const published: SpeedRiteBaseline[] = [];
  let dynamicsFrozen = false;
  const host: SpeedRiteHost = {
    getShip: () => ship,
    isDynamicsFrozen: () => dynamicsFrozen,
    onBaselinePublished: (baseline) => published.push({ ...baseline }),
    logInfo: () => undefined,
  };
  return {
    ship,
    host,
    published,
    /** Simula una cinemática que interviene la dinámica de la nave. */
    setDynamicsFrozen(value: boolean) {
      dynamicsFrozen = value;
    },
    get lastPublished(): SpeedRiteBaseline | null {
      return published.length ? published[published.length - 1] : null;
    },
  };
}

describe('SpeedRiteSystem', () => {
  it('duplica la dinámica al aplicarse y la restaura al expirar', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    expect(ship.maxSpeed).toBe(20 * SPEED_RITE_MULTIPLIER);
    expect(ship.acceleration).toBe(2 * SPEED_RITE_MULTIPLIER);
    expect(ship.deceleration).toBe(2.5 * SPEED_RITE_MULTIPLIER);
    expect(system.isActive(500)).toBe(true);

    expect(system.updateExpiry(host, 500)).toBe(false);
    expect(system.updateExpiry(host, 1000)).toBe(true);
    expect(ship.maxSpeed).toBe(20);
    expect(ship.acceleration).toBe(2);
    expect(ship.deceleration).toBe(2.5);
    expect(system.isActive(1001)).toBe(false);
  });

  it('clampa velocidad objetivo y actual al restaurar', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    ship.targetSpeed = 40;
    ship.currentSpeed = 38;
    system.updateExpiry(host, 1000);

    expect(ship.targetSpeed).toBe(20);
    expect(ship.currentSpeed).toBe(20);
  });

  it('sanitize revierte el buff resucitado por el restore de una cinemática', () => {
    const harness = makeHarness();
    const { ship, host } = harness;
    const system = new SpeedRiteSystem();

    // Rito activo y cinemática que captura la dinámica DUPLICADA.
    system.apply(host, 1000, 0);
    const captured = {
      maxSpeed: ship.maxSpeed,
      acceleration: ship.acceleration,
      deceleration: ship.deceleration,
    };

    // El rito caduca durante la cinemática.
    expect(system.updateExpiry(host, 1500)).toBe(true);
    expect(ship.maxSpeed).toBe(20);

    // La cinemática termina y restaura lo que capturó: el buff resucita.
    ship.maxSpeed = captured.maxSpeed;
    ship.acceleration = captured.acceleration;
    ship.deceleration = captured.deceleration;

    expect(system.sanitize(host, 1600)).toBe(true);
    expect(ship.maxSpeed).toBe(20);
    expect(ship.acceleration).toBe(2);
    expect(ship.deceleration).toBe(2.5);
  });

  it('sanitize no toca la nave con el rito activo ni cuando la dinámica es legítima', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    expect(system.sanitize(host, 500)).toBe(false);
    expect(ship.maxSpeed).toBe(40);

    system.updateExpiry(host, 1000);
    expect(system.sanitize(host, 1100)).toBe(false);
    expect(ship.maxSpeed).toBe(20);
  });

  it('sanitize respeta una mejora permanente de motor (no es el doble de la base)', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    system.updateExpiry(host, 1000);

    // Mejora de los Grises: 20 → 100. No es 20×2, así que sanitize debe ignorarla.
    ship.maxSpeed = 100;
    ship.acceleration = 10;
    ship.deceleration = 12.5;

    expect(system.sanitize(host, 1100)).toBe(false);
    expect(ship.maxSpeed).toBe(100);
  });

  it('tras una mejora de motor, el siguiente rito dobla la dinámica NUEVA', () => {
    const harness = makeHarness();
    const { ship, host } = harness;
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    system.updateExpiry(host, 1000);

    ship.maxSpeed = 100;
    ship.acceleration = 10;
    ship.deceleration = 12.5;
    system.refreshBaseline(host, false, 1100);

    system.apply(host, 1000, 2000);
    expect(ship.maxSpeed).toBe(200);
    expect(ship.acceleration).toBe(20);
    expect(system.getBaseMaxSpeed(ship.maxSpeed)).toBe(100);
  });

  it('la baseline no se recaptura con el rito activo ni durante una cinemática', () => {
    const harness = makeHarness();
    const { ship, host } = harness;
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    system.refreshBaseline(host, false, 500);
    // Con el rito activo la nave lleva 40: adoptarlo como base es justo el bug.
    expect(harness.lastPublished?.maxSpeed).not.toBe(40);

    system.updateExpiry(host, 1000);
    harness.setDynamicsFrozen(true);
    ship.maxSpeed = 999;
    system.refreshBaseline(host, false, 1100);
    expect(harness.lastPublished?.maxSpeed).not.toBe(999);
  });

  it('tick caduca, sanea y publica la base en el orden correcto', () => {
    const harness = makeHarness();
    const { ship, host } = harness;
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    const captured = ship.maxSpeed;

    // El rito caduca y una cinemática devuelve la dinámica duplicada que había capturado.
    system.tick(host, 1500);
    ship.maxSpeed = captured;
    system.tick(host, 1600);

    expect(ship.maxSpeed).toBe(20);
    expect(harness.lastPublished?.maxSpeed).toBe(20);
  });

  it('re-lanzar el rito estando activo extiende la duración sin encadenar el doble', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    system.apply(host, 1000, 500);

    expect(ship.maxSpeed).toBe(40);
    expect(system.isActive(1400)).toBe(true);
    expect(system.expiresAtMs).toBe(1500);
  });

  it('getBaseMaxSpeed devuelve la base pre-rito para audio/HUD/persistencia', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    expect(system.getBaseMaxSpeed(ship.maxSpeed)).toBe(20);
    system.apply(host, 1000, 0);
    expect(ship.maxSpeed).toBe(40);
    expect(system.getBaseMaxSpeed(ship.maxSpeed)).toBe(20);
  });

  it('remainingSec usa floor y se apaga al caducar', () => {
    const { host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 5000, 0);
    expect(system.remainingSec(0)).toBe(5);
    expect(system.remainingSec(1500)).toBe(3);
    expect(system.remainingSec(5000)).toBeNull();
  });

  it('reset olvida el rito y la base (respawn / carga de partida)', () => {
    const { ship, host } = makeHarness();
    const system = new SpeedRiteSystem();

    system.apply(host, 1000, 0);
    system.reset();

    expect(system.isActive(0)).toBe(false);
    expect(system.getBaseline()).toBeNull();
    // Sin base conocida, sanitize no puede (ni debe) tocar la nave.
    expect(system.sanitize(host, 10)).toBe(false);
    expect(ship.maxSpeed).toBe(40);
  });

  it('sin nave, apply es no-op seguro', () => {
    const system = new SpeedRiteSystem();
    const host: SpeedRiteHost = {
      getShip: () => null,
      isDynamicsFrozen: () => false,
      onBaselinePublished: () => undefined,
      logInfo: () => undefined,
    };

    system.apply(host, 1000, 0);
    expect(system.isActive(0)).toBe(false);
  });
});
