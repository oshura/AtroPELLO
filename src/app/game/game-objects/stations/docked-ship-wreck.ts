import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';
import { WreckMesh } from './ship-wreck-geometry';
import { seededRng, composeBasisMatrix } from './station-geometry';

// Pecio rusty/quemado: base óxido con variación hacia negro requemado por vértice (aspecto corroído).
const RUST: [number, number, number] = [0.40, 0.19, 0.10];
const BURNT: [number, number, number] = [0.07, 0.055, 0.05];

/**
 * Réplica ATRACADA (semidestruida) de la nave del jugador, renderizada como SÓLIDO rusty/quemado — pecios de
 * otras naves que nunca despegaron tras el Incidente. La posiciona/orienta el SpaceStationSystem sobre un
 * puerto con una base exacta (sin gimbal). NO es seleccionable ni colisiona. docs/ESTACIONES.md Fase 9.
 */
export class DockedShipWreck extends GameObject {
  public readonly isDockedWreck = true;

  constructor(id: string, position: Vector3, mesh: WreckMesh, worldScale: number, seed: string) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: worldScale, y: worldScale, z: worldScale });
    this.setType(GameObjectType.SPACE_STATION);
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.boundingSphere = null; // sin selección/colisión
    // Geometría en el cuerpo del constructor (tras super): initGeometry corre antes de tener `mesh`.
    this.vertices = mesh.vertices.slice();
    this.normals = mesh.normals.slice();
    this.indices = mesh.indices;
    const n = this.vertices.length / 3;
    this.uvs = new Float32Array(n * 2);
    this.colors = this.buildRustyColors(n, seed);
  }

  protected override initGeometry(): void {
    this.vertices = new Float32Array(0);
    this.indices = new Uint16Array(0);
    this.normals = new Float32Array(0);
    this.uvs = new Float32Array(0);
  }

  protected override generateVertexColors(): void {
    // Los colores se asignan en el constructor (el pecio necesita `seed`, aún no disponible en super()).
  }

  private buildRustyColors(n: number, seed: string): Float32Array {
    const rng = seededRng(seed);
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = rng() * rng(); // sesgado hacia 0 → mayoría rusty, algunas zonas casi negras (quemado)
      c[i * 3] = RUST[0] + (BURNT[0] - RUST[0]) * t;
      c[i * 3 + 1] = RUST[1] + (BURNT[1] - RUST[1]) * t;
      c[i * 3 + 2] = RUST[2] + (BURNT[2] - RUST[2]) * t;
    }
    return c;
  }

  /**
   * Fija la orientación EXACTA del pecio desde una base ortonormal en mundo (morro +Z = `fwd`), evitando el
   * bamboleo de Euler cuando la estación (inclinada) gira. La calcula el SpaceStationSystem desde el modelMatrix.
   */
  public setWorldBasis(pos: Vector3, right: Vector3, up: Vector3, fwd: Vector3): void {
    this.position.x = pos.x; this.position.y = pos.y; this.position.z = pos.z;
    composeBasisMatrix(this.modelMatrix, pos, right, up, fwd, this.scale);
  }
}
