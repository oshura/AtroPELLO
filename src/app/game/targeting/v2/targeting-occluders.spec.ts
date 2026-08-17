import { StructuredRayOccluder } from './targeting-occluders';
import { HumanSpaceStation } from '../../game-objects/stations/human-space-station';

/**
 * Oclusor de silueta real (§1.2.2, experimental): sphere tracing del rayo del puntero contra el SDF
 * del collider de la estación. Geometría en espacio unidad (escala 800): toroide ringRadius 0.8 /
 * tubeRadius 0.13 con boquetes {6..9, 30, 31} de 48 segmentos, núcleo half 0.16, radios en ±X/±Z.
 */
describe('StructuredRayOccluder', () => {
  function makeStation(pos = { x: 0, y: 0, z: 2000 }): HumanSpaceStation {
    const st = new HumanSpaceStation(pos, 800);
    st.updateModelMatrix(); // sin inclinación ni spin salvo que el test los ponga
    return st;
  }

  it('el rayo que golpea el tubo del toroide devuelve la distancia MUNDO del impacto', () => {
    const st = makeStation();
    const occ = new StructuredRayOccluder(st.id, st, st.getStructuredShapesLocal());
    // Mirando +Z por el plano del anillo: primer contacto con el tubo en z = 2000 − 0.93·800 = 1256.
    const t = occ.rayHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(1250);
    expect(t!).toBeLessThan(1257);
  });

  it('por el HUECO del toroide (entre núcleo y anillo, lejos de los radios) el rayo pasa limpio', () => {
    const st = makeStation();
    const occ = new StructuredRayOccluder(st.id, st, st.getStructuredShapesLocal());
    // Cayendo en -Y sobre el punto local (0.283, ·, 0.283) (radio 0.4, a 45° de los radios ±X/±Z).
    const t = occ.rayHit({ x: 226.3, y: 1600, z: 2226.3 }, { x: 0, y: -1, z: 0 });
    expect(t).toBeNull();
  });

  it('un BOQUETE del Incidente (segmentos destruidos) también deja pasar el rayo', () => {
    const st = makeStation();
    const occ = new StructuredRayOccluder(st.id, st, st.getStructuredShapesLocal());
    // Cayendo en -Y sobre el anillo a 60° (segmento 8, dentro del corte grande {6..9}).
    const lx = 0.8 * Math.cos(Math.PI / 3) * 800;   // 320
    const lz = 0.8 * Math.sin(Math.PI / 3) * 800;   // ≈554.3
    const t = occ.rayHit({ x: lx, y: 1600, z: 2000 + lz }, { x: 0, y: -1, z: 0 });
    expect(t).toBeNull();
  });

  it('con inclinación y spin arbitrarios, apuntar al centro sigue impactando el núcleo (transform vivo)', () => {
    const st = makeStation();
    st.rotation.x = (25 * Math.PI) / 180;
    st.rotation.z = (25 * Math.PI) / 180;
    st.spin = 1.0;
    st.updateModelMatrix();
    const occ = new StructuredRayOccluder(st.id, st, st.getStructuredShapesLocal());
    const t = occ.rayHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    expect(t).not.toBeNull();
    // Impacto en el núcleo (caja half 128u): entre el centro − diagonal máxima (√3·128) y el centro.
    expect(t!).toBeGreaterThan(2000 - 223);
    expect(t!).toBeLessThan(2000);
  });

  it('un rayo que no mira a la estación devuelve null (recorte por bound, sin marchar)', () => {
    const st = makeStation();
    const occ = new StructuredRayOccluder(st.id, st, st.getStructuredShapesLocal());
    expect(occ.rayHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })).toBeNull();
    expect(occ.rayHit({ x: 5000, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });
});
