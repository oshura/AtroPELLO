import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';
import { ITargetable, TargetType } from './types/targeting.types';

/**
 * Portal: Objeto persistente creado por el Gate Rite.
 * Targeteable, con geometría circular de runas y ojo central (placeholder en esta fase).
 */
export class Portal extends GameObject implements ITargetable {
  public override healthCurrent: number = 1; // no relevante
  public override healthMax: number = 1;
  public radius: number; // radio visual/base para targeting

  constructor(id: string, position: Vector3, radius: number = 100) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: radius, y: radius, z: radius });
    this.objectType = TargetType.PORTAL;
    this.color = { r: 0.2, g: 0.8, b: 1.0, a: 1.0 }; // cian arcano
    this.radius = radius;
    this.voidMassUnits = 0;
    // Ajustar bounding sphere (compute manually usando escala)
    this.boundingSphere = { center: { ...this.position }, radius: radius };
  }

  protected initGeometry(): void {
    // Disco simple (círculo) subdividido + triángulos hacia el centro.
    const segments = 48;
    const verts: number[] = [];
    const indices: number[] = [];

    // Centro
    verts.push(0, 0, 0); // posición
    // Normales Z+ para todo
    const normals: number[] = [0, 0, 1];
    const uvs: number[] = [0.5, 0.5];

    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      verts.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push((x + 1) * 0.5, (y + 1) * 0.5);
    }
    // Triángulos desde centro (0) a cada borde
    for (let i = 1; i <= segments; i++) {
      const next = i === segments ? 1 : i + 1;
      indices.push(0, i, next);
    }

    this.vertices = new Float32Array(verts);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
  }

  public override update(deltaTime: number): void {
    // Rotación lenta para efecto visual
    this.rotation.z += deltaTime * 0.2;
    super.update(deltaTime);
  }

  // ITargetable implementation
  public getDisplayName(): string { return `Portal ${this.id}`; }
  public getTargetType(): TargetType { return TargetType.PORTAL; }
  public isActive(): boolean { return this.active && this.visible; }
}
