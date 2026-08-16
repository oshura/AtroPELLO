import { Vector3 } from '../../../types/game.types';
import { SpaceStation, DockPortPlacement, StationEmissivePoints } from './space-station';
import { MeshData, createMesh, pushBox, pushTorus, toTypedMesh, applyDamageStains, seededRng } from './station-geometry';
import { StationCapAccents, pushStationCaps } from './station-caps';
import type { StructuredShape } from '../../services/physics/collision/collision-shape.types';
import type { StationWindowMeshes } from './station-windows';

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
// Radio de SELECCIÓN del cuerpo (targeting, "aim al núcleo"): núcleo + margen. NO es colisión ni el radio
// exterior: con el toroide entero (1.0) el dominant-gate del targeting vetaría el cuerpo a menos de ~2ku.
const SELECT_RADIUS_FACTOR = CORE_HALF + 0.04;
// Brazos de acople (clamps) que salen del lado del radio; la tile del puerto los tapa.
const CLAMP_OUT = 0.04;       // protrusión (media) hacia el lado del radio
const CLAMP_W = 0.022;        // media anchura a lo largo del radio
const CLAMP_H = 0.05;         // media altura (Y)
// Segmentos del toroide destruidos por el Incidente: corte grande {6..9} + pequeño {30,31}.
// Compartidos por la MALLA y los COLLIDERS (por el boquete se puede volar; el spec de conformidad lo blinda).
const DESTROYED_SEGMENTS: readonly number[] = [6, 7, 8, 9, 30, 31];
const HULL: [number, number, number] = [0.62, 0.68, 0.78];       // gris azulado metálico (casco)
const HULL_DARK: [number, number, number] = [0.42, 0.47, 0.56];  // metálico más oscuro (estructura / brazos)
const CORE_COL: [number, number, number] = [0.50, 0.55, 0.64];   // núcleo metálico

interface HumanStationBuild {
  geo: ReturnType<typeof toTypedMesh>;
  ports: DockPortPlacement[];
  emissive: StationEmissivePoints;
  /** Acentos emissive de las tapas-sección (§7 I0b), a fusionar con las capas de ventanas. */
  capAccents: StationCapAccents;
}

/** Construye la estación humana (toroide + 4 radios + núcleo + brazos de acople) y sus puertos. */
function buildHumanStation(): HumanStationBuild {
  const mesh: MeshData = createMesh();

  // Toroide con SOLO un corte grande + uno pequeño (el resto intacto). Ver feedback del usuario.
  const destroyedSeg = new Set<number>(DESTROYED_SEGMENTS);
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

  // Núcleo central + UNA tobera de motor (el resplandor rojo/naranja "apagado" lo aporta una bola emissive
  // hundida en la tobera, estilo Ulises 31). Solo un motor (feedback del usuario).
  pushBox(mesh, [0, 0, 0], [CORE_HALF, CORE_HALF, CORE_HALF], CORE_COL, 1);
  pushBox(mesh, [0, -CORE_HALF - 0.05, 0], [0.07, 0.06, 0.07], HULL_DARK, 1); // tobera (bajo el núcleo)

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
    fire: [],                                       // sin fuego (feedback del usuario)
    motor: [0, -(CORE_HALF + 0.04), 0],            // tobera bajo el núcleo (referencia; el motor es una bola emissive)
  };

  // Manchas de daño: ~18 regiones rusty con núcleo quemado, repartidas por toroide/pasadizos/núcleo
  // (deterministas por semilla; el landmark se regenera idéntico). Ver feedback del usuario.
  applyDamageStains(mesh, `${HUMAN_STATION_ID}-damage`, 18, 0.14, 0.05);

  // Tapas-sección en los cortes del toroide (§7 I0b): arquitectura interior a la vista. Se añaden TRAS
  // las manchas (el muestreo de manchas del casco no cambia y las tapas conservan sus colores propios).
  const capAccents: StationCapAccents = { steady: createMesh(), flicker: createMesh() };
  pushStationCaps(mesh, capAccents, {
    ringRadius: RING_RADIUS,
    tubeRadius: TUBE_RADIUS,
    ringSeg: RING_SEG,
    destroyed: DESTROYED_SEGMENTS,
    seed: HUMAN_STATION_ID,
  });

  return { geo: toTypedMesh(mesh), ports, emissive, capAccents };
}

/**
 * Colliders estructurados (Fase 11 R4): mismas constantes de diseño que la malla, en el MISMO fichero.
 * El spec de conformidad malla↔collider (station-collider-conformance.spec) revienta si alguien toca la
 * geometría sin tocar esto. Excluidos deliberadamente: tiles de puerto (DockPort, trigger ETHEREAL),
 * bola de motor (FX emisivo) y pecios (decorativos).
 */
function buildHumanStationColliders(): StructuredShape[] {
  const shapes: StructuredShape[] = [
    { kind: 'torus', center: [0, 0, 0], ringRadius: RING_RADIUS, tubeRadius: TUBE_RADIUS, segments: RING_SEG, gapSegments: DESTROYED_SEGMENTS },
    { kind: 'box', center: [0, 0, 0], half: [CORE_HALF, CORE_HALF, CORE_HALF] },                 // núcleo
    { kind: 'box', center: [0, -CORE_HALF - 0.05, 0], half: [0.07, 0.06, 0.07] },                // tobera
  ];
  const mid = (SPOKE_INNER + SPOKE_OUTER) / 2;
  const halfLen = (SPOKE_OUTER - SPOKE_INNER) / 2;
  for (const s of [{ axis: 'x', sign: 1 }, { axis: 'x', sign: -1 }, { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 }] as const) {
    // Radios (pasadizos), idénticos a buildHumanStation.
    shapes.push(s.axis === 'x'
      ? { kind: 'box', center: [s.sign * mid, 0, 0], half: [halfLen, SPOKE_HALF, SPOKE_HALF] }
      : { kind: 'box', center: [0, 0, s.sign * mid], half: [SPOKE_HALF, SPOKE_HALF, halfLen] });
    // Brazos de acople (clamps), a cada lado este/oeste del radio.
    const perp: [number, number, number] = s.axis === 'x' ? [0, 0, 1] : [1, 0, 0];
    const center: [number, number, number] = s.axis === 'x' ? [s.sign * mid, 0, 0] : [0, 0, s.sign * mid];
    for (const ps of [1, -1]) {
      shapes.push({
        kind: 'box',
        center: [
          center[0] + perp[0] * ps * (SPOKE_HALF + CLAMP_OUT),
          0,
          center[2] + perp[2] * ps * (SPOKE_HALF + CLAMP_OUT),
        ],
        half: s.axis === 'x' ? [CLAMP_W, CLAMP_H, CLAMP_OUT] : [CLAMP_OUT, CLAMP_H, CLAMP_W],
      });
    }
  }
  return shapes;
}

// --- Ventanas exteriores (docs/ESTACIONES.md §7, rebanada I0) ---
// 3 filas a las alturas de las 3 CUBIERTAS (pisos) del tubo, solo en segmentos vivos y en la cara
// exterior. Energía inestable: mayoría muertas, algunas encendidas, unas pocas parpadeando.
const WINDOW_DECKS = 3;
const WINDOWS_PER_SEGMENT = 3;
const WINDOW_HALF_U = 0.006;    // media anchura (dirección del anillo) → ~4.8 u de mundo
const WINDOW_HALF_V = 0.0045;   // media altura (meridiano del tubo) → ~3.6 u
const WINDOW_LIFT = 0.003;      // despegue de la superficie (anti z-fighting) → ~2.4 u
const WINDOW_FLICKER_RATIO = 0.05;
const WINDOW_LIT_RATIO = 0.15;
const WINDOW_DEAD: [number, number, number] = [0.030, 0.034, 0.050]; // cristal muerto (casi negro azulado)
const WINDOW_LIT: [number, number, number] = [1.0, 0.72, 0.35];      // cálido tenue (habitado... una vez)
const WINDOW_FLICKER: [number, number, number] = [1.0, 0.55, 0.25];  // más rojizo (circuito sufriendo)

/** Añade un quad de ventana: centro + tangentes (anillo/meridiano) + normal saliente + color. */
function pushWindowQuad(
  mesh: MeshData,
  c: [number, number, number],
  tu: [number, number, number],
  tv: [number, number, number],
  n: [number, number, number],
  col: [number, number, number],
): void {
  const base = mesh.vertices.length / 3;
  for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    mesh.vertices.push(
      c[0] + tu[0] * su * WINDOW_HALF_U + tv[0] * sv * WINDOW_HALF_V,
      c[1] + tu[1] * su * WINDOW_HALF_U + tv[1] * sv * WINDOW_HALF_V,
      c[2] + tu[2] * su * WINDOW_HALF_U + tv[2] * sv * WINDOW_HALF_V,
    );
    mesh.normals.push(n[0], n[1], n[2]);
    mesh.uvs.push(0, 0);
    mesh.colors.push(col[0], col[1], col[2]);
  }
  mesh.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
}

/** Emite las 3 filas de ventanas de UNA cara del tubo (+1 exterior, −1 interior, que mira al núcleo). */
function pushWindowFace(
  steady: MeshData,
  flicker: MeshData,
  face: 1 | -1,
  rng: () => number,
): void {
  const destroyed = new Set<number>(DESTROYED_SEGMENTS);
  for (let i = 0; i < RING_SEG; i++) {
    if (destroyed.has(i)) continue;
    for (let d = 0; d < WINDOW_DECKS; d++) {
      // Alturas de piso: tubo Ø 2r partido en 3 cubiertas → centros en -2r/3, 0, +2r/3.
      const deckY = (d - 1) * ((2 * TUBE_RADIUS) / WINDOW_DECKS);
      const v = Math.asin(deckY / TUBE_RADIUS);
      const cv = face * Math.cos(v), sv = Math.sin(v); // cara interior = meridiano π−v (cos invertido)
      for (let w = 0; w < WINDOWS_PER_SEGMENT; w++) {
        const u = ((i + (w + 0.5) / WINDOWS_PER_SEGMENT) / RING_SEG) * Math.PI * 2;
        const cu = Math.cos(u), su = Math.sin(u);
        const n: [number, number, number] = [cv * cu, sv, cv * su];
        const rx = RING_RADIUS + TUBE_RADIUS * cv;
        const c: [number, number, number] = [
          rx * cu + n[0] * WINDOW_LIFT,
          TUBE_RADIUS * sv + n[1] * WINDOW_LIFT,
          rx * su + n[2] * WINDOW_LIFT,
        ];
        const tu: [number, number, number] = [-su, 0, cu];
        const tv: [number, number, number] = [-sv * cu, cv, -sv * su];
        const roll = rng();
        if (roll < WINDOW_FLICKER_RATIO) {
          pushWindowQuad(flicker, c, tu, tv, n, WINDOW_FLICKER);
        } else if (roll < WINDOW_FLICKER_RATIO + WINDOW_LIT_RATIO) {
          pushWindowQuad(steady, c, tu, tv, n, WINDOW_LIT);
        } else {
          pushWindowQuad(steady, c, tu, tv, n, WINDOW_DEAD);
        }
      }
    }
  }
}

/**
 * Construye las dos capas de ventanas (fijas + parpadeantes), en AMBAS caras del tubo. Exportado para
 * el spec (que las construye puras); en runtime se le pasan mallas ya sembradas con los acentos de las
 * tapas para fusionarlos. La cara interior usa semilla propia: añadirla no reordena el patrón exterior.
 */
export function buildHumanStationWindows(
  steady: MeshData = createMesh(),
  flicker: MeshData = createMesh(),
): StationWindowMeshes {
  pushWindowFace(steady, flicker, 1, seededRng(`${HUMAN_STATION_ID}-windows`));
  pushWindowFace(steady, flicker, -1, seededRng(`${HUMAN_STATION_ID}-windows-inner`));
  return { steady: toTypedMesh(steady), flicker: toTypedMesh(flicker) };
}

/** Malla + puertos + puntos emissive compartidos (deterministas) — se construyen UNA vez al cargar el módulo. */
const HUMAN = buildHumanStation();
/** Colliders compartidos (inmutables) — una vez por módulo, como la malla. */
const HUMAN_COLLIDERS = buildHumanStationColliders();
/** Capas de luces compartidas: acentos de las tapas + ventanas, fusionados (deterministas por semilla). */
const HUMAN_WINDOWS = buildHumanStationWindows(HUMAN.capAccents.steady, HUMAN.capAccents.flicker);

/**
 * Estación espacial humana: toroide de hábitats/almacenes/mantenimiento unido por 4 radios a un núcleo de
 * motores, con brazos de acople laterales (este/oeste) en cada radio, parcialmente destruida por el Incidente
 * (docs/HISTORIA.md §5). Texturizada con casco metálico. Fuego en 2 puntos del toroide + motor "apagado"
 * (rojo/naranja) en el núcleo, vía partículas que emite el SpaceStationSystem. docs/ESTACIONES.md Fase 9.
 */
export class HumanSpaceStation extends SpaceStation {
  constructor(position: Vector3, outerRadius = 800, id: string = HUMAN_STATION_ID) {
    super(id, position, outerRadius, 'Estación Humana');
    this.radius = outerRadius * SELECT_RADIUS_FACTOR; // selección apuntando al núcleo (ver const)
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

  public override getMotorGlowsLocal(): Array<{ center: [number, number, number]; radius: number; flattenY?: number }> {
    // Un solo motor: bola saliendo de la boca de la tobera (posición de antes), tamaño 58, aplastada por el
    // eje Y de la estación (M&M).
    return [
      { center: [0, -(CORE_HALF + 0.12), 0], radius: 58, flattenY: 0.45 },
    ];
  }

  public override getStructuredShapesLocal(): readonly StructuredShape[] {
    return HUMAN_COLLIDERS;
  }

  public override getWindowMeshesLocal(): StationWindowMeshes | null {
    return HUMAN_WINDOWS;
  }
}
