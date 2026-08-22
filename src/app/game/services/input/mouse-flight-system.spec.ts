import {
  MouseFlightSystem,
  MouseFlightHost,
  MOUSE_FLIGHT_DEAD_ZONE,
  MOUSE_FLIGHT_SATURATION,
} from './mouse-flight-system';

/**
 * Vuelo por ratón (Fase 14): a más distancia del cursor a la retícula, más demanda de pitch/yaw.
 * El roll no participa: sigue en Q/E.
 */
describe('MouseFlightSystem', () => {
  interface HarnessState {
    installed: boolean;
    enabled: boolean;
    locked: boolean;
    pointer: { x: number; y: number } | null;
    size: { width: number; height: number };
    applied: Array<{ pitch: number; yaw: number }>;
  }

  function makeHost(overrides: Partial<HarnessState> = {}): { host: MouseFlightHost; state: HarnessState } {
    const state: HarnessState = {
      installed: true,
      enabled: true,
      locked: false,
      pointer: { x: 400, y: 300 },
      size: { width: 800, height: 600 },
      applied: [],
      ...overrides,
    };
    const host: MouseFlightHost = {
      isDeviceInstalled: () => state.installed,
      isUserEnabled: () => state.enabled,
      areFlightInputsLocked: () => state.locked,
      getPointer: () => state.pointer,
      getCanvasSize: () => state.size,
      applyAnalog: (pitch, yaw) => state.applied.push({ pitch, yaw }),
    };
    return { host, state };
  }

  it('sin el dispositivo instalado, el ratón no vira jamás', () => {
    const { host, state } = makeHost({ installed: false, pointer: { x: 790, y: 10 } });
    new MouseFlightSystem().update(host);
    expect(state.applied).toEqual([]);
  });

  it('el cursor sobre la retícula (zona muerta) no demanda giro', () => {
    const { host, state } = makeHost({ pointer: { x: 402, y: 297 } });
    new MouseFlightSystem().update(host);
    expect(state.applied).toEqual([]);
  });

  it('cursor a la derecha demanda yaw positivo; arriba, pitch positivo', () => {
    const { host, state } = makeHost({ pointer: { x: 700, y: 90 } });
    const system = new MouseFlightSystem();
    system.update(host);

    const applied = state.applied[0];
    expect(applied.yaw).toBeGreaterThan(0);
    expect(applied.pitch).toBeGreaterThan(0);
  });

  it('más lejos de la retícula = más velocidad demandada', () => {
    const system = new MouseFlightSystem();
    const near = makeHost({ pointer: { x: 460, y: 300 } });
    system.update(near.host);
    const far = makeHost({ pointer: { x: 560, y: 300 } });
    system.update(far.host);

    expect(far.state.applied[0].yaw).toBeGreaterThan(near.state.applied[0].yaw);
  });

  it('más allá de la saturación, la demanda se queda clavada en 1', () => {
    const system = new MouseFlightSystem();
    // Semilado menor = 300; saturación al 42 % = 126 px del centro.
    const saturated = makeHost({ pointer: { x: 400 + 130, y: 300 } });
    system.update(saturated.host);
    const extreme = makeHost({ pointer: { x: 799, y: 300 } });
    system.update(extreme.host);

    expect(saturated.state.applied[0].yaw).toBe(1);
    expect(extreme.state.applied[0].yaw).toBe(1);
  });

  it('con los inputs de vuelo bloqueados suelta el mando (vuelca 0,0 una vez)', () => {
    const { host, state } = makeHost({ pointer: { x: 700, y: 300 } });
    const system = new MouseFlightSystem();
    system.update(host);
    expect(system.isSteering()).toBe(true);

    state.locked = true;
    system.update(host);
    system.update(host);

    expect(system.isSteering()).toBe(false);
    // El volcado nulo ocurre UNA vez, no en cada frame parado.
    expect(state.applied.length).toBe(2);
    expect(state.applied[1]).toEqual({ pitch: 0, yaw: 0 });
  });

  it('apagar el toggle también suelta el mando', () => {
    const { host, state } = makeHost({ pointer: { x: 700, y: 300 } });
    const system = new MouseFlightSystem();
    system.update(host);
    state.enabled = false;
    system.update(host);

    expect(state.applied[state.applied.length - 1]).toEqual({ pitch: 0, yaw: 0 });
  });

  it('la sensibilidad usa el semilado MENOR: misma distancia, misma demanda en X y en Y', () => {
    const system = new MouseFlightSystem();
    const px = 90; // por encima de la zona muerta (6 % de 300 = 18 px)
    const horizontal = makeHost({ pointer: { x: 400 + px, y: 300 } });
    system.update(horizontal.host);
    const vertical = makeHost({ pointer: { x: 400, y: 300 - px } });
    system.update(vertical.host);

    expect(vertical.state.applied[0].pitch).toBeCloseTo(horizontal.state.applied[0].yaw, 10);
  });

  it('las constantes de la curva mantienen su relación (muerta < saturación)', () => {
    expect(MOUSE_FLIGHT_DEAD_ZONE).toBeLessThan(MOUSE_FLIGHT_SATURATION);
  });
});
