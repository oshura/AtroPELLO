import {
  DOCK_CORRIDOR_GRACE,
  DOCK_CORRIDOR_LENGTH,
  DOCK_FRAME_DISTANCES,
  buildDockFrameMeshes,
  corridorHalfAt,
  dockFrameIntensity,
  isInsideDockCorridor,
} from './station-dock-frames';

describe('station-dock-frames (§8 corredor de acople)', () => {
  it('construye 3 marcos en los planos de sus distancias, en escala local del tile', () => {
    const scale = 8;
    const meshes = buildDockFrameMeshes(scale);
    expect(meshes.length).toBe(3);
    for (let k = 0; k < meshes.length; k++) {
      const m = meshes[k];
      expect(m.indices.length).toBeGreaterThan(0);
      const zExpected = DOCK_FRAME_DISTANCES[k] / scale;
      const halfMax = (corridorHalfAt(DOCK_FRAME_DISTANCES[k]) + 1) / scale; // + grosor de sobra
      for (let i = 0; i < m.vertices.length; i += 3) {
        expect(Math.abs(m.vertices[i + 2] - zExpected)).toBeLessThan(0.1); // plano del marco
        expect(Math.abs(m.vertices[i])).toBeLessThanOrEqual(halfMax);
        expect(Math.abs(m.vertices[i + 1])).toBeLessThanOrEqual(halfMax);
      }
    }
    // Embudo: el marco lejano es mayor que el cercano.
    const maxX = (m: { vertices: Float32Array }) => {
      let v = 0;
      for (let i = 0; i < m.vertices.length; i += 3) v = Math.max(v, Math.abs(m.vertices[i]));
      return v;
    };
    expect(maxX(meshes[2])).toBeGreaterThan(maxX(meshes[0]));
  });

  it('secuencia de fuera hacia dentro: lejano→medio→cercano encendiendo, y apagando en el mismo orden', () => {
    // Paso 1 (t=0.45): el lejano ya luce, el cercano aún no.
    expect(dockFrameIntensity(0.45, 2)).toBeGreaterThan(0.9);
    expect(dockFrameIntensity(0.45, 0)).toBeLessThan(0.25);
    // Paso 2 (t=0.75): los tres encendidos.
    for (const k of [0, 1, 2]) {
      expect(dockFrameIntensity(0.75, k)).toBeGreaterThan(0.9);
    }
    // Paso 5 (t=1.65): los tres apagados (solo brillo residual).
    for (const k of [0, 1, 2]) {
      expect(dockFrameIntensity(1.65, k)).toBeLessThan(0.25);
    }
    // Cíclico: un ciclo completo son 6 pasos de 0.3 s.
    expect(dockFrameIntensity(0.45 + 1.8, 2)).toBeCloseTo(dockFrameIntensity(0.45, 2), 5);
  });

  it('test de zona: dentro del embudo sí; fuera lateral, por detrás o más allá del último marco, no', () => {
    const port = {
      position: { x: 0, y: 0, z: 0 },
      approachNormal: { x: 0, y: 0, z: 1 },
      approachRight: { x: 1, y: 0, z: 0 },
      approachUp: { x: 0, y: 1, z: 0 },
    };
    expect(isInsideDockCorridor(port, { x: 5, y: 3, z: 25 })).toBeTrue();
    expect(isInsideDockCorridor(port, { x: 30, y: 0, z: 25 })).toBeFalse();     // fuera lateral
    expect(isInsideDockCorridor(port, { x: 0, y: 0, z: -2 })).toBeFalse();      // por detrás del tile
    // Gracia: flotar justo "en"/tras el marco lejano sigue contando dentro; mucho más allá, no.
    expect(isInsideDockCorridor(port, { x: 0, y: 0, z: DOCK_CORRIDOR_LENGTH + 5 })).toBeTrue();
    expect(isInsideDockCorridor(port, { x: 0, y: 0, z: DOCK_CORRIDOR_LENGTH + DOCK_CORRIDOR_GRACE + 5 })).toBeFalse();
    // El embudo se ensancha con la distancia: 12u laterales caben lejos pero no cerca del tile.
    expect(isInsideDockCorridor(port, { x: 12, y: 0, z: 5 })).toBeFalse();
    expect(isInsideDockCorridor(port, { x: 12, y: 0, z: 45 })).toBeTrue();
  });
});
