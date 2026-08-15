import { buildHumanStationWindows } from './human-space-station';
import { windowFlickerIntensity } from './station-windows';
import { TorusShape } from '../../services/physics/collision/collision-shape.types';
import { sdfTorus } from '../../services/physics/collision/collider-sdf';

/** Toro del casco (sin gaps, para medir distancia de las ventanas a la superficie). */
const HULL_TORUS: TorusShape = { kind: 'torus', center: [0, 0, 0], ringRadius: 0.8, tubeRadius: 0.13 };
const DESTROYED = new Set([6, 7, 8, 9, 30, 31]);
const LIVE_SEGMENTS = 48 - DESTROYED.size;
const PER_SEGMENT = 3 * 3; // 3 cubiertas × 3 ventanas

function quadCenters(vertices: Float32Array): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let q = 0; q < vertices.length / 12; q++) {
    let x = 0, y = 0, z = 0;
    for (let v = 0; v < 4; v++) {
      x += vertices[q * 12 + v * 3];
      y += vertices[q * 12 + v * 3 + 1];
      z += vertices[q * 12 + v * 3 + 2];
    }
    out.push([x / 4, y / 4, z / 4]);
  }
  return out;
}

describe('Ventanas de la estación humana (§7 I0)', () => {
  const built = buildHumanStationWindows();
  const centers = [...quadCenters(built.steady.vertices), ...quadCenters(built.flicker.vertices)];

  it('hay 3 ventanas × 3 cubiertas por segmento VIVO y por CARA (ninguna en los boquetes)', () => {
    expect(centers.length).toBe(LIVE_SEGMENTS * PER_SEGMENT * 2); // caras exterior + interior
    for (const [x, , z] of centers) {
      let angle = Math.atan2(z, x);
      if (angle < 0) angle += Math.PI * 2;
      const seg = Math.min(Math.floor((angle / (Math.PI * 2)) * 48), 47);
      expect(DESTROYED.has(seg)).withContext(`ventana en segmento destruido ${seg}`).toBeFalse();
    }
  });

  it('todas pegadas a la superficie del casco, mitad en cada cara del tubo', () => {
    let outer = 0;
    for (const [x, y, z] of centers) {
      const d = sdfTorus(HULL_TORUS, x, y, z);
      expect(Math.abs(d - 0.003)).toBeLessThan(1e-6); // WINDOW_LIFT
      if (Math.hypot(x, z) > 0.8) outer++;            // radio > ringRadius = cara exterior
    }
    expect(outer).toBe(LIVE_SEGMENTS * PER_SEGMENT);
    expect(centers.length - outer).toBe(LIVE_SEGMENTS * PER_SEGMENT); // cara interior (mira al núcleo)
  });

  it('la mayoría muertas, algunas encendidas y unas pocas parpadeantes (determinista)', () => {
    const flickerCount = built.flicker.vertices.length / 12;
    const steadyCount = built.steady.vertices.length / 12;
    expect(flickerCount).toBeGreaterThan(0);
    expect(flickerCount).toBeLessThan(centers.length * 0.15);
    // En la capa fija conviven encendidas (cálidas, r=1.0) y muertas (casi negras).
    let lit = 0;
    for (let q = 0; q < steadyCount; q++) {
      if (built.steady.colors[q * 12] > 0.9) lit++;
    }
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(steadyCount * 0.5);
    // Determinismo: mismo resultado en una segunda construcción.
    const again = buildHumanStationWindows();
    expect(Array.from(again.steady.colors)).toEqual(Array.from(built.steady.colors));
    expect(again.flicker.vertices.length).toBe(built.flicker.vertices.length);
  });

  it('el parpadeo es determinista, acotado y variable (energía inestable)', () => {
    expect(windowFlickerIntensity(12.34)).toBe(windowFlickerIntensity(12.34));
    let min = Infinity, max = -Infinity;
    for (let t = 0; t < 30; t += 0.05) {
      const f = windowFlickerIntensity(t);
      expect(f).toBeGreaterThanOrEqual(0.05);
      expect(f).toBeLessThanOrEqual(1);
      min = Math.min(min, f);
      max = Math.max(max, f);
    }
    expect(min).toBeLessThan(0.2);   // hay apagones
    expect(max).toBeGreaterThan(0.7); // y momentos de luz plena
  });
});
