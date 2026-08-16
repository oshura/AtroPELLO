import { Vector3 } from '../../../types/game.types';
import { MeshData, createMesh, pushBox, toTypedMesh } from './station-geometry';

/**
 * Corredor de acople con MARCOS NEÓN (docs/ESTACIONES.md §8): tres marcos rectangulares flotando
 * frente a cada puerto ACOPLABLE, a lo largo de la normal de aproximación, formando un embudo
 * (el más lejano es el mayor). Se encienden en secuencia de fuera hacia dentro ("aterriza aquí")
 * y definen la ZONA en la que, a menos de 5 u/s de velocidad relativa a la estación, se enciende
 * el piloto de acople. Geometría en espacio LOCAL del tile (se dibuja con el modelMatrix del
 * DockPort: giro/inclinación de la estación gratis); el test de zona opera en mundo con la base
 * del puerto. Todo determinista (función pura del tiempo, sin estado).
 */

/** Longitud del corredor (u mundo) desde el tile hasta el marco más lejano. */
export const DOCK_CORRIDOR_LENGTH = 50;
/** Semiancho del embudo en el tile (z=0) y en el extremo lejano (u mundo). */
const CORRIDOR_HALF_NEAR = 9;
const CORRIDOR_HALF_FAR = 26;
/** Distancias de los 3 marcos a lo largo de la normal (u mundo), de CERCANO a LEJANO. */
export const DOCK_FRAME_DISTANCES: readonly number[] = [16, 33, 50];
/** Grosor total de la línea de neón (u mundo) — finitas, petición del usuario. */
const FRAME_THICKNESS = 1.0;
const NEON: [number, number, number] = [0.55, 0.92, 1.0]; // cian neón (canales altos ⇒ luce emissive)
/** Duración de cada paso de la secuencia (s); ciclo completo = 6 pasos (3 encender + 3 apagar). */
const STEP_SECONDS = 0.3;
const BASE_GLOW = 0.18; // brillo residual del marco "apagado" (sigue marcando la zona)

/** Semiancho del embudo a profundidad `z` del tile (lineal tile→extremo). */
export function corridorHalfAt(z: number): number {
  return CORRIDOR_HALF_NEAR + (CORRIDOR_HALF_FAR - CORRIDOR_HALF_NEAR) * (z / DOCK_CORRIDOR_LENGTH);
}

/**
 * Mallas de los 3 marcos en espacio LOCAL del tile (escala del DockPort), índice 0=cercano..2=lejano.
 * Barras como cajas finas (leen como tubo de neón desde cualquier ángulo); esquinas sin solape
 * (las barras horizontales cubren las esquinas) para evitar z-fighting.
 */
export function buildDockFrameMeshes(tileScale: number): Array<ReturnType<typeof toTypedMesh>> {
  const s = tileScale;
  const th = FRAME_THICKNESS / 2 / s;       // semigrosor local
  const meshes: Array<ReturnType<typeof toTypedMesh>> = [];
  for (const dist of DOCK_FRAME_DISTANCES) {
    const mesh: MeshData = createMesh();
    const z = dist / s;
    const half = corridorHalfAt(dist) / s;
    const zh = th * 0.7;                     // semigrosor en profundidad (canto del tubo)
    pushBox(mesh, [0, half, z], [half + th, th, zh], NEON, 1);   // barra superior (con esquinas)
    pushBox(mesh, [0, -half, z], [half + th, th, zh], NEON, 1);  // barra inferior (con esquinas)
    pushBox(mesh, [-half, 0, z], [th, half - th, zh], NEON, 1);  // barra izquierda
    pushBox(mesh, [half, 0, z], [th, half - th, zh], NEON, 1);   // barra derecha
    meshes.push(toTypedMesh(mesh));
  }
  return meshes;
}

/**
 * Intensidad emissive del marco `frameIndex` (0=cercano..2=lejano) en el instante `tSec`.
 * Secuencia de 6 pasos: enciende lejano→medio→cercano y apaga en el mismo orden; rampas cortas
 * en los bordes para que el neón no "chasque".
 */
export function dockFrameIntensity(tSec: number, frameIndex: number): number {
  const order = (DOCK_FRAME_DISTANCES.length - 1) - frameIndex; // 0=lejano (enciende primero)
  const p = (((tSec / STEP_SECONDS - order) % 6) + 6) % 6;      // fase propia en [0,6)
  const on = p < 3 ? Math.min(1, Math.min(p, 3 - p) / 0.35) : 0;
  return BASE_GLOW + (1 - BASE_GLOW) * on;
}

/** Base de aproximación de un puerto (la satisface DockPort estructuralmente). */
export interface DockCorridorBasis {
  position: Vector3;
  approachNormal: Vector3;
  approachRight: Vector3;
  approachUp: Vector3;
}

/** ¿Está `p` (mundo) dentro del embudo que definen los marcos de este puerto? */
export function isInsideDockCorridor(port: DockCorridorBasis, p: Vector3): boolean {
  const dx = p.x - port.position.x;
  const dy = p.y - port.position.y;
  const dz = p.z - port.position.z;
  const n = port.approachNormal;
  const z = dx * n.x + dy * n.y + dz * n.z;
  if (z < 0 || z > DOCK_CORRIDOR_LENGTH) {
    return false;
  }
  const half = corridorHalfAt(z);
  const r = port.approachRight;
  const u = port.approachUp;
  const lx = dx * r.x + dy * r.y + dz * r.z;
  const ly = dx * u.x + dy * u.y + dz * u.z;
  return Math.abs(lx) <= half && Math.abs(ly) <= half;
}
