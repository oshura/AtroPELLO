import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { TargetType } from '../../types/targeting.types';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

// Quad unidad en el plano XY mirando a +Z (se escala por el tamaño del puerto y se orienta al normal).
const QUAD_V = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const QUAD_N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
const QUAD_I = [0, 1, 2, 0, 2, 3];
const PORT_BLUE: [number, number, number] = [0.25, 0.58, 1.0]; // azul brillante (canal B=1 ⇒ luce emissive)

/**
 * "Tile" de acople: polígono azul luminoso, seleccionable como cualquier objeto del espacio. Reutilizable
 * en cualquier objeto (no solo estaciones): el nombre es del PUNTO ("Puerto espacial") pero las
 * características que muestra el panel de detalle son las del OBJETO PADRE (`parentStationId`).
 * docs/ESTACIONES.md §1.4. Lo posiciona/orienta en mundo el SpaceStationSystem.
 */
export class DockPort extends GameObject {
  public readonly isDockPort = true;
  public size!: number;
  public parentStationId!: string;
  public intact!: boolean;     // false = destruido (no acoplable)
  public occupied = false;     // true mientras una nave está acoplada
  /** Normal de acople en MUNDO (dirección de aproximación de la nave). La fija el SpaceStationSystem. */
  public approachNormal: Vector3 = { x: 0, y: 1, z: 0 };

  constructor(id: string, position: Vector3, parentStationId: string, size = 40, intact = true) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: size, y: size, z: size });
    this.setType(GameObjectType.DOCK_PORT);
    this.objectType = TargetType.DOCK_PORT;
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.size = size;
    this.parentStationId = parentStationId;
    this.intact = intact;
    this.voidMassUnits = 0;
    this.healthMax = 1000;
    this.healthCurrent = this.healthMax;
  }

  protected override initGeometry(): void {
    this.vertices = new Float32Array(QUAD_V);
    this.normals = new Float32Array(QUAD_N);
    this.uvs = new Float32Array(QUAD_UV);
    this.indices = new Uint16Array(QUAD_I);
  }

  protected override generateVertexColors(): void {
    this.colors = new Float32Array([
      ...PORT_BLUE, ...PORT_BLUE, ...PORT_BLUE, ...PORT_BLUE,
    ]);
  }

  public getDisplayName(): string {
    return 'Puerto espacial';
  }

  public getTargetType(): TargetType {
    return this.objectType;
  }

  /** Orienta el tile para que su cara (+Z local) mire en la dirección `dir` (normal de acople en mundo). */
  public faceNormal(dir: Vector3): void {
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const x = dir.x / len, y = dir.y / len, z = dir.z / len;
    this.rotation.y = Math.atan2(x, z);
    this.rotation.x = -Math.asin(Math.max(-1, Math.min(1, y)));
    this.rotation.z = 0;
  }

  /** ¿El puerto admite acople ahora mismo? (intacto y libre). */
  public isDockable(): boolean {
    return this.active && this.intact && !this.occupied;
  }
}
