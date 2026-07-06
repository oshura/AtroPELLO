import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { MeshData, createMesh, pushSphere, toTypedMesh, composeBasisMatrix } from './station-geometry';

/** Esfera unidad compartida (blanca) — se construye UNA vez; el color se tiñe por instancia. */
function buildBallMesh(): ReturnType<typeof toTypedMesh> {
  const mesh: MeshData = createMesh();
  pushSphere(mesh, [0, 0, 0], 1, [1, 1, 1], 14, 18);
  return toTypedMesh(mesh);
}
const BALL_GEO = buildBallMesh();

/**
 * "Bola" luminosa reutilizable de la estación: núcleo emissive de color por instancia. La usa tanto el
 * MOTOR del núcleo (rojo/naranja "apagado", como la tobera trasera de la nave) como el FUEGO del toroide
 * (naranja/amarillo). NO es seleccionable; la renderiza el engine en el pase emissive. docs/ESTACIONES.md §1.3.
 */
export class StationEmissiveBall extends GameObject {
  public readonly isStationEmissiveBall = true;

  constructor(id: string, position: Vector3, radius: number, color: [number, number, number], flattenY = 1) {
    // `flattenY` < 1 aplasta la esfera por su eje Y local (M&M) — la orienta luego setWorldBasis con el eje Y de la estación.
    super(id, position, { x: 0, y: 0, z: 0 }, { x: radius, y: radius * flattenY, z: radius });
    this.setType(GameObjectType.SPACE_STATION);
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.boundingSphere = null; // no participa en colisión/selección
    // Tras super() (y tras el [[Define]] de los campos de subclase): teñir a color de instancia.
    const n = this.vertices.length / 3;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      c[i * 3] = color[0];
      c[i * 3 + 1] = color[1];
      c[i * 3 + 2] = color[2];
    }
    this.colors = c;
  }

  protected override initGeometry(): void {
    this.vertices = BALL_GEO.vertices.slice();
    this.normals = BALL_GEO.normals.slice();
    this.uvs = BALL_GEO.uvs;
    this.indices = BALL_GEO.indices;
  }

  protected override generateVertexColors(): void {
    this.colors = BALL_GEO.colors.slice(); // placeholder; el constructor lo sustituye por el color de instancia
  }

  /**
   * Orienta la bola con la base de la estación (right/up/fwd en mundo) aplicando su escala POR EJE — así el
   * aplastado (scale.y) sigue el eje Y de la estación aunque esté inclinada y girando. La calcula el system.
   */
  public setWorldBasis(pos: Vector3, right: Vector3, up: Vector3, fwd: Vector3): void {
    this.position.x = pos.x; this.position.y = pos.y; this.position.z = pos.z;
    composeBasisMatrix(this.modelMatrix, pos, right, up, fwd, this.scale);
  }
}
