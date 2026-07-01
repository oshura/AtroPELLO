import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { MeshData, createMesh, pushSphere, toTypedMesh } from './station-geometry';

const MOTOR_COL: [number, number, number] = [1.0, 0.40, 0.10]; // rojo/naranja "apagado" (luce emissive)

/** Esfera unidad emissive compartida (la "bola" del motor) — se construye UNA vez al cargar el módulo. */
function buildMotorMesh(): ReturnType<typeof toTypedMesh> {
  const mesh: MeshData = createMesh();
  pushSphere(mesh, [0, 0, 0], 1, MOTOR_COL, 14, 18);
  return toTypedMesh(mesh);
}
const MOTOR_GEO = buildMotorMesh();

/**
 * "Bola" luminosa del motor de la estación (rojo/naranja, como la tobera trasera de la nave del jugador).
 * Va en el extremo de cada tobera del núcleo. NO es seleccionable; el motor lo renderiza el engine en el
 * pase emissive junto a los puertos. docs/ESTACIONES.md §1.3.
 */
export class StationMotorGlow extends GameObject {
  public readonly isStationMotor = true;

  constructor(id: string, position: Vector3, radius: number) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: radius, y: radius, z: radius });
    this.setType(GameObjectType.SPACE_STATION);
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.boundingSphere = null; // no participa en colisión/selección
  }

  protected override initGeometry(): void {
    this.vertices = MOTOR_GEO.vertices.slice();
    this.normals = MOTOR_GEO.normals.slice();
    this.uvs = MOTOR_GEO.uvs;
    this.indices = MOTOR_GEO.indices;
  }

  protected override generateVertexColors(): void {
    this.colors = MOTOR_GEO.colors.slice();
  }
}
