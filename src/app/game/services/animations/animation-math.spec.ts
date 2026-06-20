import { clamp01, lerp, smoothstep, clamp, vec3Normalize } from './animation-math';

describe('animation-math', () => {
  it('clamp01 acota a [0,1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });

  it('lerp interpola igual que a+(b-a)*t en [0,1]', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBeCloseTo(2.5, 6);
    expect(lerp(30, 200, 0.5)).toBeCloseTo(115, 6);
  });

  it('smoothstep = t²(3−2t) acotado', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(-3)).toBe(0);
    expect(smoothstep(3)).toBe(1);
  });

  it('clamp y vec3Normalize re-exportan game/math', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    const n = vec3Normalize({ x: 0, y: 3, z: 4 });
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6);
    expect(n.y).toBeCloseTo(0.6, 6);
  });
});
