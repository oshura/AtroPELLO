import { buildVastago, ShipPart } from './ship-geometry';

describe('ship-geometry buildVastago', () => {
  let parts: ShipPart[];
  beforeAll(() => { parts = buildVastago(); });

  it('produce partes con geometría triangular válida', () => {
    expect(parts.length).toBeGreaterThan(4);
    for (const p of parts) {
      expect(p.positions.length).toBeGreaterThan(0);
      expect(p.positions.length % 9).toBe(0);            // triángulos (3 verts × 3 coords)
      expect(p.normals.length).toBe(p.positions.length);
      for (let i = 0; i < p.positions.length; i++) {
        expect(Number.isFinite(p.positions[i])).toBe(true);
        expect(Number.isFinite(p.normals[i])).toBe(true);
      }
    }
  });

  it('normales unitarias', () => {
    for (const p of parts) {
      for (let i = 0; i < p.normals.length; i += 3) {
        const l = Math.hypot(p.normals[i], p.normals[i + 1], p.normals[i + 2]);
        expect(l).toBeGreaterThan(0.99);
        expect(l).toBeLessThan(1.01);
      }
    }
  });

  it('incluye las partes dinámicas con sus bisagras', () => {
    const dyn = new Set(parts.map(p => p.dyn));
    expect(dyn.has('nose')).toBe(true);
    expect(dyn.has('wingL')).toBe(true);
    expect(dyn.has('wingR')).toBe(true);
    expect(dyn.has('exhaust')).toBe(true);
    for (const p of parts) {
      if (p.dyn === 'wingL' || p.dyn === 'wingR' || p.dyn === 'exhaust') {
        expect(p.hinge).toBeDefined();
        expect(p.hinge!.length).toBe(3);
      }
    }
  });

  it('tiene casco con paneles y acentos emisivos', () => {
    expect(parts.some(p => p.material.panels === 1)).toBe(true);
    expect(parts.some(p => p.material.emissive > 0)).toBe(true);
    expect(parts.some(p => p.hideInCockpit)).toBe(true);  // morro/canopy se ocultan en cabina
  });
});
