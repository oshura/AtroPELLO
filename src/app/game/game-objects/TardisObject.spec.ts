import { TardisObject, createTardisCompanion, isWithinVanishRange, TARDIS_VANISH_RADIUS } from './TardisObject';
import { Planet } from './Planet';

describe('isWithinVanishRange', () => {
  const origin = { x: 0, y: 0, z: 0 };

  it('true dentro del radio', () => {
    expect(isWithinVanishRange(origin, { x: 30, y: 0, z: 0 }, 50)).toBe(true);
  });

  it('true justo en el radio (<=)', () => {
    expect(isWithinVanishRange(origin, { x: 50, y: 0, z: 0 }, 50)).toBe(true);
  });

  it('false fuera del radio', () => {
    expect(isWithinVanishRange(origin, { x: 51, y: 0, z: 0 }, 50)).toBe(false);
  });

  it('usa distancia 3D', () => {
    // 30-40-50 triángulo: distancia exacta 50
    expect(isWithinVanishRange(origin, { x: 30, y: 40, z: 0 }, 50)).toBe(true);
    expect(isWithinVanishRange(origin, { x: 30, y: 40, z: 1 }, 50)).toBe(false);
  });
});

describe('TardisObject', () => {
  it('es identificable y se llama TARDIS', () => {
    const t = new TardisObject('t1', { x: 0, y: 0, z: 0 });
    expect(t.isTardis).toBe(true);
    expect(t.getDisplayName()).toBe('TARDIS');
  });

  it('geometría de cabina (multi-caja): vértices/índices/colores consistentes y cuerpo azul', () => {
    const t = new TardisObject('t1', { x: 0, y: 0, z: 0 });
    const boxCount = 9; // cuerpo + 4 ventanas + alero + 2 gradas de tejado + farol
    expect(t.vertices.length).toBe(boxCount * 24 * 3);
    expect(t.indices.length).toBe(boxCount * 36);
    expect(t.colors.length).toBe(t.vertices.length);
    // La mayoría del modelo (cuerpo + tejado) es azul dominante (B > R); el farol no.
    let blueish = 0;
    for (let i = 0; i < t.colors.length; i += 3) {
      if (t.colors[i + 2] > t.colors[i]) blueish++;
    }
    expect(blueish).toBeGreaterThan(t.colors.length / 3 / 2); // > mitad de los vértices
  });
});

describe('createTardisCompanion', () => {
  it('coloca la TARDIS con offset orbital relativo al planeta y la marca', () => {
    const planet = { position: { x: 100, y: 0, z: 0 }, scale: { x: 10, y: 10, z: 10 } } as unknown as Planet;
    const { obj, local } = createTardisCompanion(planet);
    expect(obj.isTardis).toBe(true);
    // Offset no nulo (órbita a ~2.3 R)
    expect(Math.hypot(local.x, local.z)).toBeGreaterThan(10);
    // La posición mundial = planeta + local
    expect(obj.position.x).toBeCloseTo(planet.position.x + local.x, 5);
    expect(TARDIS_VANISH_RADIUS).toBe(50);
  });
});
