import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { toTypedMesh } from './station-geometry';

/** Malla tipada de ventanas (quads en espacio UNIDAD de la estación). */
export type StationWindowMeshData = ReturnType<typeof toTypedMesh>;

/** Las dos capas de ventanas: fijas (muertas+encendidas, colores horneados) y parpadeantes (emissive variable). */
export interface StationWindowMeshes {
  steady: StationWindowMeshData;
  flicker: StationWindowMeshData;
}

/**
 * Capa de VENTANAS de una estación (docs/ESTACIONES.md §7, rebanada I0): un único mesh con todos los
 * quads en espacio unidad — se dibuja con el modelMatrix de la PROPIA estación (giro/inclinación gratis,
 * cero CPU por frame). NO es seleccionable ni colisiona; la renderiza StationRenderer en el pase emissive.
 */
export class StationWindowMesh extends GameObject {
  public readonly isStationWindows = true;

  constructor(id: string, position: Vector3, mesh: StationWindowMeshData) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    this.setType(GameObjectType.SPACE_STATION);
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.boundingSphere = null; // sin selección/colisión
    // Geometría en el cuerpo del constructor (tras super): initGeometry corre antes de tener `mesh`.
    this.vertices = mesh.vertices;
    this.normals = mesh.normals;
    this.uvs = mesh.uvs;
    this.colors = mesh.colors;
    this.indices = mesh.indices;
  }

  protected override initGeometry(): void {
    this.vertices = new Float32Array(0);
    this.indices = new Uint16Array(0);
    this.normals = new Float32Array(0);
    this.uvs = new Float32Array(0);
  }

  protected override generateVertexColors(): void {
    // Los colores vienen horneados en el mesh inyectado (estado muerta/encendida por semilla).
  }

  /** true si esta capa no tiene ningún quad (p.ej. la semilla no produjo parpadeantes). */
  public isEmpty(): boolean {
    return this.indices.length === 0;
  }
}

/**
 * Intensidad de parpadeo de las ventanas inestables (energía dañada): mayormente encendida con un
 * zumbido sutil y CAÍDAS bruscas irregulares. Determinista (función pura del tiempo, sin estado) —
 * cumple la regla de `Math.random()` solo para FX sin estado, aquí ni eso.
 */
export function windowFlickerIntensity(tSec: number): number {
  // Tres senos incomensurables → patrón aperiódico; por encima del umbral la luz "se va".
  const s = Math.sin(tSec * 13.7) * Math.sin(tSec * 7.3 + 1.7) * Math.sin(tSec * 3.1 + 0.4);
  if (s > 0.45) return 0.05; // apagón breve
  const hum = 0.78 + 0.22 * Math.sin(tSec * 29.0); // zumbido de tubo fluorescente
  return Math.min(1, Math.max(0.05, hum));
}
