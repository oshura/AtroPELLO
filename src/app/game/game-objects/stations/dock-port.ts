import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { TargetType } from '../../types/targeting.types';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { composeBasisMatrix } from './station-geometry';

// Quad unidad en el plano XY mirando a +Z (se escala por el tamaño del puerto y se orienta al normal).
const QUAD_V = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const QUAD_N = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
const QUAD_I = [0, 1, 2, 0, 2, 3];
const PORT_BLUE: [number, number, number] = [0.25, 0.58, 1.0]; // azul brillante (canal B=1 ⇒ luce emissive)
const PORT_BLUE_DARK: [number, number, number] = [0.08, 0.14, 0.32]; // azul oscuro: puerto NO acoplable
// Radio de PUNTERÍA sobre `size`: la tile (8u) era difícil de clicar; 2.5 ⇒ 20u de radio de selección.
const TARGETING_RADIUS_FACTOR = 2.5;

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
  /** Nombre legible de la estación padre (para el panel de detalle). Lo fija el SpaceStationSystem. */
  public parentStationName: string | null = null;
  public intact!: boolean;     // false = destruido (no acoplable)
  public occupied = false;     // true mientras una nave está acoplada
  /** Normal de acople en MUNDO (dirección de aproximación de la nave). La fija el SpaceStationSystem. */
  public approachNormal: Vector3 = { x: 0, y: 1, z: 0 };
  /** Right/up de la cara del tile en MUNDO (completan la base del corredor de marcos neón, §8). */
  public approachRight: Vector3 = { x: 1, y: 0, z: 0 };
  public approachUp: Vector3 = { x: 0, y: 0, z: 1 };

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

  /** Radio de PUNTERÍA agrandado (targeting, NO colisión): lo prefiere el AdaptiveTargetingSystem. */
  public getTargetingRadius(): number {
    return this.size * TARGETING_RADIUS_FACTOR;
  }

  /**
   * Fija posición + orientación EXACTAS del tile desde una base ortonormal en mundo (+Z local = `normal`),
   * de modo que quede perfectamente PLANO sobre la cara del brazo de acople aunque la estación (inclinada)
   * gire — sin el bamboleo de los ángulos de Euler. La calcula el SpaceStationSystem desde el modelMatrix.
   */
  public setWorldBasis(pos: Vector3, right: Vector3, up: Vector3, normal: Vector3): void {
    this.position.x = pos.x; this.position.y = pos.y; this.position.z = pos.z;
    this.approachNormal = { x: normal.x, y: normal.y, z: normal.z };
    this.approachRight = { x: right.x, y: right.y, z: right.z };
    this.approachUp = { x: up.x, y: up.y, z: up.z };
    composeBasisMatrix(this.modelMatrix, pos, right, up, normal, this.scale);
  }

  /** Tinte azul OSCURO para puertos permanentemente no acoplables (ocupados/destruidos). Antes de initBuffers. */
  public setInactiveTint(): void {
    this.colors = new Float32Array([
      ...PORT_BLUE_DARK, ...PORT_BLUE_DARK, ...PORT_BLUE_DARK, ...PORT_BLUE_DARK,
    ]);
  }

  /** ¿El puerto admite acople ahora mismo? (intacto y libre). */
  public isDockable(): boolean {
    return this.active && this.intact && !this.occupied;
  }
}
