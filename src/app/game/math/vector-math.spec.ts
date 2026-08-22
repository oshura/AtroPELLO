import {
  clamp,
  lerpScalar,
  smoothStep01,
  vec3Length,
  vec3Dot,
  vec3Cross,
  vec3Normalize,
  randomPerpendicularVector,
  sweptSphereHit,
  raySphereHit,
} from './vector-math';

describe('vector-math', () => {
  it('clamp acota al rango', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });

  it('lerpScalar interpola y satura en los extremos', () => {
    expect(lerpScalar(0, 10, 0.5)).toBe(5);
    expect(lerpScalar(0, 10, -1)).toBe(0);
    expect(lerpScalar(0, 10, 2)).toBe(10);
  });

  it('smoothStep01 es suave y acotado [0,1]', () => {
    expect(smoothStep01(0)).toBe(0);
    expect(smoothStep01(1)).toBe(1);
    expect(smoothStep01(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothStep01(-3)).toBe(0);
  });

  it('vec3Length maneja null y vectores', () => {
    expect(vec3Length(null)).toBe(0);
    expect(vec3Length({ x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('vec3Dot y vec3Cross', () => {
    expect(vec3Dot({ x: 1, y: 2, z: 3 }, { x: 4, y: -5, z: 6 })).toBe(1 * 4 + 2 * -5 + 3 * 6);
    expect(vec3Cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('vec3Normalize trata longitud 0 como 1 (sin NaN)', () => {
    const n = vec3Normalize({ x: 0, y: 0, z: 0 });
    expect(n).toEqual({ x: 0, y: 0, z: 0 });
    const u = vec3Normalize({ x: 0, y: 10, z: 0 });
    expect(u).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('randomPerpendicularVector devuelve un unitario perpendicular', () => {
    const normal = vec3Normalize({ x: 0.3, y: 0.8, z: -0.5 });
    for (let i = 0; i < 20; i++) {
      const p = randomPerpendicularVector(normal);
      expect(vec3Length(p)).toBeCloseTo(1, 5);
      expect(Math.abs(vec3Dot(p, normal))).toBeLessThan(1e-5);
    }
  });

  describe('sweptSphereHit', () => {
    it('detecta el objetivo atravesado a media zancada (sin tunneling)', () => {
      // Un gauss a 1200 u/s recorre ~19 u por frame: el test por posición final fallaría.
      const from = { x: -20, y: 0, z: 0 };
      const to = { x: 20, y: 0, z: 0 };
      expect(sweptSphereHit(from, to, { x: 0, y: 0, z: 0 }, 3, 1.2)).toBe(true);
    });

    it('ignora un objetivo fuera del tramo recorrido', () => {
      const from = { x: -20, y: 0, z: 0 };
      const to = { x: -10, y: 0, z: 0 };
      expect(sweptSphereHit(from, to, { x: 40, y: 0, z: 0 }, 3, 1.2)).toBe(false);
    });

    it('ignora un objetivo alejado lateralmente del segmento', () => {
      const from = { x: -20, y: 0, z: 0 };
      const to = { x: 20, y: 0, z: 0 };
      expect(sweptSphereHit(from, to, { x: 0, y: 50, z: 0 }, 3, 1.2)).toBe(false);
    });

    it('suma los radios de proyectil y objetivo', () => {
      const from = { x: -10, y: 6, z: 0 };
      const to = { x: 10, y: 6, z: 0 };
      expect(sweptSphereHit(from, to, { x: 0, y: 0, z: 0 }, 4, 1)).toBe(false);
      expect(sweptSphereHit(from, to, { x: 0, y: 0, z: 0 }, 4, 2.5)).toBe(true);
    });

    it('con segmento degenerado se comporta como esfera contra esfera', () => {
      const p = { x: 1, y: 0, z: 0 };
      expect(sweptSphereHit(p, p, { x: 0, y: 0, z: 0 }, 2, 0)).toBe(true);
      expect(sweptSphereHit(p, p, { x: 0, y: 0, z: 0 }, 0.5, 0)).toBe(false);
    });
  });

  describe('raySphereHit', () => {
    it('devuelve la distancia al primer corte', () => {
      const d = raySphereHit({ x: -10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2);
      expect(d).toBeCloseTo(8, 5);
    });

    it('devuelve null si la esfera queda a la espalda', () => {
      expect(raySphereHit({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2)).toBeNull();
    });

    it('devuelve null si el rayo pasa de largo', () => {
      expect(raySphereHit({ x: -10, y: 50, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 2)).toBeNull();
    });

    it('devuelve 0 si el origen está dentro de la esfera', () => {
      expect(raySphereHit({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5)).toBe(0);
    });
  });
});
