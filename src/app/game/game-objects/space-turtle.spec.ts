import { SpaceTurtleObject } from './space-turtle';

describe('SpaceTurtleObject', () => {
  it('construye con geometría por partes y se identifica', () => {
    const t = new SpaceTurtleObject('turtle', { x: 0, y: 0, z: 0 });
    expect(t.isSpaceTurtle).toBe(true);
    expect(t.getDisplayName()).toBe('Tortuga Estelar');
    expect(t.vertices.length).toBeGreaterThan(0);
    expect(t.vertices.length).toBe(t.colors.length);
    expect(t.vertices.length).toBe(t.normals.length);
  });

  it('applyPose mueve las partes animadas (aletas/cabeza/cola) respecto al reposo', () => {
    const t = new SpaceTurtleObject('turtle', { x: 0, y: 0, z: 0 });
    t.applyPose(0); // fase 0 = pose de reposo
    const rest = Float32Array.from(t.vertices);
    t.applyPose(Math.PI / 2); // seno máximo → partes desplazadas
    let moved = 0;
    for (let i = 0; i < rest.length; i++) {
      if (Math.abs(rest[i] - t.vertices[i]) > 1e-4) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('faceDirection orienta el yaw hacia la dirección de avance', () => {
    const t = new SpaceTurtleObject('turtle', { x: 0, y: 0, z: 0 });
    t.faceDirection({ x: 1, y: 0, z: 0 }); // +X ⇒ yaw 90°
    expect(t.rotation.y).toBeCloseTo(Math.PI / 2, 3);
  });
});
