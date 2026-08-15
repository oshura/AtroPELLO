import { HumanSpaceStation } from './human-space-station';
import { StructuredShape } from '../../services/physics/collision/collision-shape.types';
import { computeShapesBoundRadius, sdfShape } from '../../services/physics/collision/collider-sdf';

/**
 * "La malla es la verdad física" (Fase 11 R4, docs/COLISIONES.md §7.2): los colliders estructurados de la
 * estación se verifican contra los vértices REALES de su malla. Si alguien retoca la geometría sin tocar
 * las formas (o viceversa), este spec revienta.
 */
describe('Conformidad malla↔collider de la estación humana', () => {
  function stationWithMesh(): { shapes: readonly StructuredShape[]; vertices: number[] } {
    const st = new HumanSpaceStation({ x: 0, y: 0, z: 0 });
    const vertices = (st as unknown as { vertices: number[] }).vertices;
    return { shapes: st.getStructuredShapesLocal(), vertices };
  }

  it('todo vértice de la malla está sobre/dentro de alguna forma (sdf ≤ ε)', () => {
    const { shapes, vertices } = stationWithMesh();
    expect(shapes.length).toBeGreaterThan(0);
    expect(vertices.length).toBeGreaterThan(300);
    // Ajuste de MATERIAL: se ignoran los gaps del toro (la malla no tiene vértices en los boquetes salvo
    // los bordes de corte, que pertenecen a segmentos vivos; el comportamiento de los boquetes se testea
    // en collider-sdf.spec).
    const material: StructuredShape[] = shapes.map(s =>
      s.kind === 'torus' ? { ...s, gapSegments: undefined } : s,
    );
    let worst = -Infinity;
    let worstAt: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < vertices.length; i += 3) {
      let best = Infinity;
      for (const s of material) {
        const d = sdfShape(s, vertices[i], vertices[i + 1], vertices[i + 2]);
        if (d < best) best = d;
      }
      if (best > worst) {
        worst = best;
        worstAt = [vertices[i], vertices[i + 1], vertices[i + 2]];
      }
    }
    expect(worst)
      .withContext(`peor vértice en (${worstAt.map(n => n.toFixed(3)).join(', ')})`)
      .toBeLessThanOrEqual(1e-3);
  });

  it('la esfera de activación autocalculada cubre el vértice más lejano', () => {
    const { shapes, vertices } = stationWithMesh();
    const bound = computeShapesBoundRadius(shapes);
    let maxLen = 0;
    for (let i = 0; i < vertices.length; i += 3) {
      maxLen = Math.max(maxLen, Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]));
    }
    expect(bound).toBeGreaterThanOrEqual(maxLen - 1e-3);
    // Y coincide con el radio exterior real del toroide (0.93 unidad = 744 u de mundo con escala 800).
    expect(bound).toBeCloseTo(0.93, 6);
  });
});
