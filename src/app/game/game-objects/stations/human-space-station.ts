import { Vector3 } from '../../../types/game.types';
import { SpaceStation, DockPortPlacement, StationEmissivePoints } from './space-station';
import { MeshData, createMesh, pushBox, pushTorus, toTypedMesh } from './station-geometry';

/** Id canónico de la estación humana (landmark fijo; el daño/puertos se regeneran idénticos por semilla). */
export const HUMAN_STATION_ID = 'human-station';

// --- Parámetros de diseño en ESPACIO UNIDAD (radio exterior = 1.0; se escala por size en el constructor) ---
const RING_RADIUS = 0.80;     // radio del anillo central del toroide
const TUBE_RADIUS = 0.13;     // grosor del tubo (hábitats/almacenes/mantenimiento)
const RING_SEG = 48;          // segmentos del anillo
const TUBE_SEG = 14;
const SPOKE_INNER = 0.17;     // arranque de los radios junto al núcleo
const SPOKE_OUTER = RING_RADIUS - TUBE_RADIUS; // llegan al borde interior del toroide
const SPOKE_HALF = 0.05;      // semi-grosor de los radios (pasadizos)
const CORE_HALF = 0.16;       // semi-lado del núcleo central (motores)
// Brazos de acople (clamps) que salen del lado del radio; la tile del puerto los tapa.
const CLAMP_OUT = 0.04;       // protrusión (media) hacia el lado del radio
const CLAMP_W = 0.022;        // media anchura a lo largo del radio
const CLAMP_H = 0.05;         // media altura (Y)
const HULL: [number, number, number] = [0.62, 0.68, 0.78];       // gris azulado metálico (casco)
const HULL_DARK: [number, number, number] = [0.42, 0.47, 0.56];  // metálico más oscuro (estructura / brazos)
const CORE_COL: [number, number, number] = [0.50, 0.55, 0.64];   // núcleo metálico

interface HumanStationBuild {
  geo: ReturnType<typeof toTypedMesh>;
  ports: DockPortPlacement[];
  emissive: StationEmissivePoints;
}

// Punto de fuego SOBRE la superficie del tubo (por encima, para que las partículas NO queden ocultas dentro).
function firePoint(seg: number): [number, number, number] {
  const u = (seg / RING_SEG) * Math.PI * 2;
  return [Math.cos(u) * RING_RADIUS, TUBE_RADIUS * 1.5, Math.sin(u) * RING_RADIUS];
}

/** Construye la estación humana (toroide + 4 radios + núcleo + brazos de acople) y sus puertos. */
function buildHumanStation(): HumanStationBuild {
  const mesh: MeshData = createMesh();

  // Toroide con SOLO un corte grande + uno pequeño (el resto intacto). Ver feedback del usuario.
  const destroyedSeg = new Set<number>([6, 7, 8, 9]); // corte grande
  destroyedSeg.add(30); destroyedSeg.add(31);          // como mucho 1 más (pequeño)
  pushTorus(mesh, RING_RADIUS, TUBE_RADIUS, RING_SEG, TUBE_SEG, HULL, 1, i => !destroyedSeg.has(i));

  // 4 radios (pasadizos) a lo largo de ±X y ±Z, hacia el núcleo.
  const mid = (SPOKE_INNER + SPOKE_OUTER) / 2;
  const halfLen = (SPOKE_OUTER - SPOKE_INNER) / 2;
  const spokes: Array<{ axis: 'x' | 'z'; sign: number }> = [
    { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 },
    { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
  ];
  for (const s of spokes) {
    const c: [number, number, number] = s.axis === 'x' ? [s.sign * mid, 0, 0] : [0, 0, s.sign * mid];
    const h: [number, number, number] = s.axis === 'x'
      ? [halfLen, SPOKE_HALF, SPOKE_HALF]
      : [SPOKE_HALF, SPOKE_HALF, halfLen];
    pushBox(mesh, c, h, HULL, 2);
  }

  // Núcleo central + toberas de motor (el resplandor rojo/naranja "apagado" lo aportan partículas).
  pushBox(mesh, [0, 0, 0], [CORE_HALF, CORE_HALF, CORE_HALF], CORE_COL, 1);
  pushBox(mesh, [0, CORE_HALF + 0.05, 0], [0.07, 0.05, 0.07], HULL_DARK, 1);
  pushBox(mesh, [0, -CORE_HALF - 0.05, 0], [0.07, 0.05, 0.07], HULL_DARK, 1);

  // Puertos: un brazo de acople (clamp) en cada lado ESTE/OESTE del radio, con la tile como tapa exterior.
  const ports: DockPortPlacement[] = [];
  const portR = (SPOKE_INNER + SPOKE_OUTER) / 2;
  let pi = 0;
  for (const sp of spokes) {
    const perp: [number, number, number] = sp.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
    const center: [number, number, number] = sp.axis === 'x' ? [sp.sign * portR, 0, 0] : [0, 0, sp.sign * portR];
    for (const ps of [1, -1]) {
      // Brazo que sobresale del lado del radio.
      const clampC: [number, number, number] = [
        center[0] + perp[0] * ps * (SPOKE_HALF + CLAMP_OUT),
        0,
        center[2] + perp[2] * ps * (SPOKE_HALF + CLAMP_OUT),
      ];
      const clampH: [number, number, number] = sp.axis === 'x'
        ? [CLAMP_W, CLAMP_H, CLAMP_OUT]
        : [CLAMP_OUT, CLAMP_H, CLAMP_W];
      pushBox(mesh, clampC, clampH, HULL_DARK, 1);
      // Tile (puerto) como tapa exterior del brazo, mirando hacia afuera.
      const tileC: [number, number, number] = [
        center[0] + perp[0] * ps * (SPOKE_HALF + 2 * CLAMP_OUT + 0.004),
        0,
        center[2] + perp[2] * ps * (SPOKE_HALF + 2 * CLAMP_OUT + 0.004),
      ];
      ports.push({
        id: `${sp.axis}${sp.sign > 0 ? 'p' : 'n'}-${ps > 0 ? 'e' : 'w'}`,
        localCenter: tileC,
        localNormal: [perp[0] * ps, 0, perp[2] * ps],
        intact: pi !== 3, // uno inutilizado por el Incidente (determinista); el resto acoplables
      });
      pi++;
    }
  }

  const emissive: StationEmissivePoints = {
    fire: [firePoint(13), firePoint(37)],          // fuego sobre 2 puntos del toroide (segmentos intactos)
    motor: [0, -(CORE_HALF + 0.14), 0],            // tobera bajo el núcleo (motor "apagado", rojo/naranja)
  };

  return { geo: toTypedMesh(mesh), ports, emissive };
}

/** Malla + puertos + puntos emissive compartidos (deterministas) — se construyen UNA vez al cargar el módulo. */
const HUMAN = buildHumanStation();

/**
 * Estación espacial humana: toroide de hábitats/almacenes/mantenimiento unido por 4 radios a un núcleo de
 * motores, con brazos de acople laterales (este/oeste) en cada radio, parcialmente destruida por el Incidente
 * (docs/HISTORIA.md §5). Texturizada con casco metálico. Fuego en 2 puntos del toroide + motor "apagado"
 * (rojo/naranja) en el núcleo, vía partículas que emite el SpaceStationSystem. docs/ESTACIONES.md Fase 9.
 */
export class HumanSpaceStation extends SpaceStation {
  constructor(position: Vector3, outerRadius = 800, id: string = HUMAN_STATION_ID) {
    super(id, position, outerRadius, 'Estación Humana');
  }

  protected override initGeometry(): void {
    this.vertices = HUMAN.geo.vertices.slice();
    this.normals = HUMAN.geo.normals.slice();
    this.uvs = HUMAN.geo.uvs.slice();
    this.indices = HUMAN.geo.indices;
  }

  protected override generateVertexColors(): void {
    this.colors = HUMAN.geo.colors.slice();
  }

  public override getPortPlacements(): DockPortPlacement[] {
    return HUMAN.ports;
  }

  public override getEmissivePointsLocal(): StationEmissivePoints {
    return HUMAN.emissive;
  }

  public override getMotorGlowsLocal(): Array<{ center: [number, number, number]; radius: number }> {
    const y = CORE_HALF + 0.12; // extremo de cada tobera del núcleo
    return [
      { center: [0, y, 0], radius: 72 },
      { center: [0, -y, 0], radius: 72 },
    ];
  }
}
