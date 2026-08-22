import { Vector3 } from '../../../types/game.types';
import { SpaceStation, DockPortPlacement } from './space-station';
import { MeshData, createMesh, pushBox, pushSphere, pushTorus, toTypedMesh, seededRng } from './station-geometry';
import type { StructuredShape } from '../../services/physics/collision/collision-shape.types';

/**
 * Estación telaraña de los tejedores arácnidos (Fase 15 — docs/RAZAS.md).
 *
 * Concepto: una TELA DE ARAÑA orbital. Tres anillos concéntricos de hilo tensado unidos por ocho
 * radios, con un saco central bulboso (el telar) y capullos de presa pegados a los cruces. Sin
 * puertos: no se atraca en una telaraña, se la esquiva… o se la revienta.
 *
 * A diferencia de la estación humana (landmark indestructible), las telarañas son OBJETIVOS: 1000
 * HP y las destruye el armamento del jugador. Su muerte la gestiona el AracnidWarSystem (storyFlag,
 * progreso de misión, hostilidad y XP).
 */

// --- Diseño en ESPACIO UNIDAD (radio exterior = 1.0; se escala por size en el constructor) ---
const RING_RADII = [0.95, 0.62, 0.32] as const; // anillos concéntricos del hilo
const THREAD_RADIUS = 0.022;                    // grosor del hilo
const RING_SEG = 40;
const THREAD_SEG = 6;
const SPOKE_COUNT = 8;
const SPOKE_HALF = 0.016;                       // semi-grosor de los radios
const SAC_RADIUS = 0.15;                        // saco central (el telar)
const COCOON_RADIUS = 0.05;                     // capullos de presa
const COCOON_COUNT = 6;
// Selección (targeting): apuntar al saco central, no a toda la tela.
const SELECT_RADIUS_FACTOR = SAC_RADIUS + 0.05;

const THREAD_COL: [number, number, number] = [0.38, 0.35, 0.46];  // seda gris violácea
const THREAD_DARK: [number, number, number] = [0.26, 0.23, 0.34];
const SAC_COL: [number, number, number] = [0.30, 0.22, 0.40];     // quitina del telar
const COCOON_COL: [number, number, number] = [0.58, 0.56, 0.52];  // seda pálida (presas)

interface AracnidStationBuild {
  geo: ReturnType<typeof toTypedMesh>;
}

/** Construye la telaraña (anillos + radios + saco + capullos), determinista. */
function buildAracnidStation(): AracnidStationBuild {
  const mesh: MeshData = createMesh();

  // Anillos concéntricos de hilo (toroides finos en el plano XZ).
  for (let i = 0; i < RING_RADII.length; i++) {
    pushTorus(mesh, RING_RADII[i], THREAD_RADIUS, RING_SEG, THREAD_SEG, i % 2 ? THREAD_DARK : THREAD_COL, 1);
  }

  // 8 radios: cajas finas del saco al anillo exterior, giradas por pares de ejes. Las cajas del
  // primitivo van alineadas a ejes, así que cada radio se aproxima con SEGMENTOS cortos siguiendo
  // su dirección (5 tramos): a distancia de juego lee como hilo recto.
  const inner = SAC_RADIUS * 0.8;
  const outer = RING_RADII[0];
  const tramos = 5;
  for (let s = 0; s < SPOKE_COUNT; s++) {
    const angle = (s / SPOKE_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    for (let t = 0; t < tramos; t++) {
      const r0 = inner + ((outer - inner) * t) / tramos;
      const r1 = inner + ((outer - inner) * (t + 1)) / tramos;
      const mid = (r0 + r1) / 2;
      const half = (r1 - r0) / 2;
      pushBox(
        mesh,
        [dx * mid, 0, dz * mid],
        [Math.max(SPOKE_HALF, Math.abs(dx) * half), SPOKE_HALF, Math.max(SPOKE_HALF, Math.abs(dz) * half)],
        s % 2 ? THREAD_COL : THREAD_DARK,
        1
      );
    }
  }

  // Saco central: el telar (ligeramente aplastado en Y, como un abdomen).
  pushSphere(mesh, [0, 0, 0], SAC_RADIUS, SAC_COL, 14, 18);
  pushSphere(mesh, [0, SAC_RADIUS * 0.55, 0], SAC_RADIUS * 0.55, SAC_COL, 10, 14);

  // Capullos de presa en cruces radio×anillo, deterministas por semilla.
  const rng = seededRng('aracnid-web-cocoons');
  for (let c = 0; c < COCOON_COUNT; c++) {
    const spoke = Math.floor(rng() * SPOKE_COUNT);
    const ring = RING_RADII[Math.floor(rng() * RING_RADII.length)];
    const angle = (spoke / SPOKE_COUNT) * Math.PI * 2;
    pushSphere(mesh, [Math.cos(angle) * ring, 0.02, Math.sin(angle) * ring], COCOON_RADIUS * (0.7 + rng() * 0.6), COCOON_COL, 8, 10);
  }

  return { geo: toTypedMesh(mesh) };
}

/**
 * Colliders estructurados: el saco central y el anillo exterior. Los hilos finos no colisionan
 * (volar entre ellos es parte del encanto… y del peligro de los capullos).
 */
function buildAracnidStationColliders(): StructuredShape[] {
  return [
    { kind: 'sphere', center: [0, 0, 0], radius: SAC_RADIUS },
    { kind: 'torus', center: [0, 0, 0], ringRadius: RING_RADII[0], tubeRadius: THREAD_RADIUS * 2, segments: RING_SEG },
  ];
}

/** Malla y colliders compartidos: se construyen UNA vez al cargar el módulo (patrón estación humana). */
const ARACNID = buildAracnidStation();
const ARACNID_COLLIDERS = buildAracnidStationColliders();

export const ARACNID_STATION_HEALTH = 1000;

export class AracnidWebStation extends SpaceStation {
  public readonly isAracnidStation = true;

  constructor(id: string, position: Vector3, outerRadius = 220, name = 'Telar orbital arácnido') {
    super(id, position, outerRadius, name);
    this.radius = outerRadius * SELECT_RADIUS_FACTOR;
    // Objetivo destruible (a diferencia del landmark humano).
    this.healthMax = ARACNID_STATION_HEALTH;
    this.healthCurrent = ARACNID_STATION_HEALTH;
  }

  protected override initGeometry(): void {
    this.vertices = ARACNID.geo.vertices.slice();
    this.normals = ARACNID.geo.normals.slice();
    this.uvs = ARACNID.geo.uvs.slice();
    this.indices = ARACNID.geo.indices;
  }

  protected override generateVertexColors(): void {
    this.colors = ARACNID.geo.colors.slice();
  }

  /** Una telaraña no tiene puertos: no se atraca en ella. */
  public override getPortPlacements(): DockPortPlacement[] {
    return [];
  }

  public override getMotorGlowsLocal(): Array<{ center: [number, number, number]; radius: number; flattenY?: number }> {
    // Saco central latiendo en violeta: el "corazón" del telar.
    return [{ center: [0, 0.04, 0], radius: 26, flattenY: 0.75 }];
  }

  public override getStructuredShapesLocal(): readonly StructuredShape[] {
    return ARACNID_COLLIDERS;
  }
}
