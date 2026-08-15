import { createMesh } from './station-geometry';
import { StationCapAccents, StationCapSpec, pushStationCaps } from './station-caps';
import { TorusShape } from '../../services/physics/collision/collision-shape.types';
import { sdfTorus } from '../../services/physics/collision/collider-sdf';

/** Parámetros reales del toroide de la estación humana. */
const SPEC: StationCapSpec = {
  ringRadius: 0.8,
  tubeRadius: 0.13,
  ringSeg: 48,
  destroyed: [6, 7, 8, 9, 30, 31],
  seed: 'human-station',
};
/** Casco sin boquetes, para medir que las tapas viven pegadas a la superficie/planos de corte. */
const HULL: TorusShape = { kind: 'torus', center: [0, 0, 0], ringRadius: 0.8, tubeRadius: 0.13 };
/** Fronteras vivo↔destruido de los boquetes {6..9} y {30,31}: ángulos de los 4 planos de corte. */
const CUT_ANGLES = [6, 10, 30, 32].map(b => (b / 48) * Math.PI * 2);

function build(): { mesh: ReturnType<typeof createMesh>; accents: StationCapAccents } {
  const mesh = createMesh();
  const accents: StationCapAccents = { steady: createMesh(), flicker: createMesh() };
  pushStationCaps(mesh, accents, SPEC);
  return { mesh, accents };
}

describe('Tapas-sección del toroide (§7 I0b)', () => {
  const { mesh, accents } = build();

  it('toda la geometría vive pegada a uno de los 4 planos de corte', () => {
    expect(mesh.vertices.length).toBeGreaterThan(0);
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i];
      const z = mesh.vertices[i + 2];
      const near = CUT_ANGLES.some(a => Math.abs(Math.cos(a) * z - Math.sin(a) * x) < 0.005);
      expect(near).withContext(`vértice ${i / 3} lejos de todo plano de corte`).toBeTrue();
    }
  });

  it('ninguna tapa se sale del casco (dentro del tubo sin boquetes)', () => {
    const check = (verts: number[]): void => {
      for (let i = 0; i < verts.length; i += 3) {
        expect(sdfTorus(HULL, verts[i], verts[i + 1], verts[i + 2])).toBeLessThanOrEqual(1.5e-3);
      }
    };
    check(mesh.vertices);
    check(accents.steady.vertices);
    check(accents.flicker.vertices);
  });

  it('cada tapa aporta una luz de emergencia parpadeante; alguna puerta conserva luz fija', () => {
    expect(accents.flicker.vertices.length / 12).toBe(CUT_ANGLES.length); // 1 por tapa
    const steadyQuads = accents.steady.vertices.length / 12;
    expect(steadyQuads).toBeGreaterThan(0);
    expect(steadyQuads).toBeLessThanOrEqual(CUT_ANGLES.length);
  });

  it('es determinista (misma semilla → misma geometría)', () => {
    const again = build();
    expect(again.mesh.vertices).toEqual(mesh.vertices);
    expect(again.mesh.colors).toEqual(mesh.colors);
    expect(again.accents.steady.vertices).toEqual(accents.steady.vertices);
    expect(again.accents.flicker.vertices).toEqual(accents.flicker.vertices);
  });
});
