import { GameObject } from '../GameObject';
import { Vector3 } from '../../types/game.types';
import { ITargetable, TargetType } from '../types/targeting.types';
import { GameObjectType } from '../types/game-object.types';

/**
 * Representación del "clúster asteroidal" como un objeto espacial único.
 * - Neutral
 * - Sin masa/void mass
 * - Geometría similar a un asteroide para mantener la misma "distorsión de puntos" visual.
 */
export class ClusterObject extends GameObject implements ITargetable {
  public size: number;
  public direction: Vector3;
  public driftSpeed: number;

  constructor(
    id: string,
    center: Vector3,
    size: number = 4.0,
    direction: Vector3 = { x: 1, y: 0, z: 0 },
    speed: number = 0
  ) {
    super(
      id,
      center,
      { x: 0, y: 0, z: 0 },
      { x: size, y: size, z: size }
    );
    this.size = size;
    this.direction = { ...direction };
    this.driftSpeed = speed;

    // Color tenue y neutral
    this.color = { r: 0.45, g: 0.55, b: 0.9, a: 1.0 };
    this.setType(GameObjectType.CLUSTER); // Establecer tipo de GameObject
    this.voidMassUnits = 0; // sin masa del vacío
    // salud simbólica (no destructible)
    this.healthMax = 1;
    this.healthCurrent = 1;
    this.objectType = TargetType.CLUSTER; // Mantener para compatibilidad
  }

  protected initGeometry(): void {
    // Reutilizar la idea de icosaedro deformado como el Asteroid para coherencia visual
    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const phi = (1 + Math.sqrt(5)) / 2;
    const scale = 0.6; // un poco más "voluminoso" que el asteroide normal
    const baseVertices = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ];

    for (let i = 0; i < baseVertices.length; i++) {
      const v = baseVertices[i];
      const deformation = 0.35 + Math.random() * 0.35;
      const n1 = (Math.random() - 0.5) * 0.28;
      const n2 = (Math.random() - 0.5) * 0.28;
      const n3 = (Math.random() - 0.5) * 0.28;
      vertices.push(
        (v[0] * deformation + n1) * scale,
        (v[1] * deformation + n2) * scale,
        (v[2] * deformation + n3) * scale
      );
      const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
      normals.push(v[0] / len, v[1] / len, v[2] / len);
      uvs.push((v[0] + 1) * 0.5, (v[1] + 1) * 0.5);
    }

    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    for (const f of faces) indices.push(f[0], f[1], f[2]);

    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
  }

  public override update(deltaTime: number): void {
    // Mover igual que el centro del clúster: dirección y velocidad heredadas
    this.velocity.x = this.direction.x * this.driftSpeed;
    this.velocity.y = this.direction.y * this.driftSpeed;
    this.velocity.z = this.direction.z * this.driftSpeed;
    super.update(deltaTime);
  }

  public getDisplayName(): string { return 'Cluster'; }
  public getTargetType(): TargetType { return this.objectType; }
  public override isActive(): boolean { return this.active && this.visible; }
}
