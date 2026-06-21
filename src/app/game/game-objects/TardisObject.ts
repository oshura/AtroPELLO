import { Vector3 } from '../../types/game.types';
import { MegaAsteroid } from './MegaAsteroid';
import { Planet } from './Planet';

/** Radio (u) por debajo del cual la nave hace desaparecer a la TARDIS con un destello. */
export const TARDIS_VANISH_RADIUS = 50;

/**
 * ¿Está `ship` a <= `radius` de `target`? Distancia al CUADRADO (sin sqrt) — se evalúa una vez por frame.
 * PURA y trivialmente testeable.
 */
export function isWithinVanishRange(ship: Vector3, target: Vector3, radius: number): boolean {
  const dx = ship.x - target.x;
  const dy = ship.y - target.y;
  const dz = ship.z - target.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/**
 * La cabina de policía del Doctor (TARDIS). Orbita la Tierra como un megaasteroide más: HEREDA toda su
 * mecánica (tipo MEGA_ASTEROID, salud, colisión, targeting, órbita en `planetDebris`), pero se DIBUJA como
 * una caja azul y, al acercarse la nave a <{@link TARDIS_VANISH_RADIUS}u, se desvanece con un destello (lo
 * gestiona GameEngine). Es TRANSITORIA: no se serializa (se excluye en `capturePlanetDebris`), reaparece
 * cada sesión sin tocar códecs. docs/ARQUITECTURA.md Fase 6.4 (companions data-driven por `kind`).
 */
export class TardisObject extends MegaAsteroid {
  public readonly isTardis = true;

  constructor(id: string, position: Vector3, baseSize: number = 0.8) {
    super(id, position, baseSize);
    // Azul "cabina de policía" (lo usa el color de partículas de destrucción).
    this.color = { r: 0.12, g: 0.3, b: 0.66, a: 1.0 };
  }

  public override getDisplayName(): string {
    return 'TARDIS';
  }

  /**
   * Cabina de policía procedural (no un simple cubo): cuerpo alto + tejado escalonado (alero + 2 gradas) +
   * farol superior. Cada "caja" añade 24 vértices con normales por cara. El motor usa geometría procedural
   * (initGeometry), no un cargador de modelos, así que la silueta se compone con cajas apiladas.
   */
  protected override initGeometry(): void {
    // 6 caras CCW vistas desde fuera (unidad), con su normal de cara (flat shading).
    const faces: Array<{ n: [number, number, number]; v: Array<[number, number, number]> }> = [
      { n: [0, 0, 1],  v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
      { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
      { n: [1, 0, 0],  v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
      { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
      { n: [0, 1, 0],  v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
      { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
    ];
    const faceUV: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const addBox = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void => {
      for (const face of faces) {
        const base = vertices.length / 3;
        for (let i = 0; i < 4; i++) {
          const v = face.v[i];
          vertices.push(cx + v[0] * hx, cy + v[1] * hy, cz + v[2] * hz);
          normals.push(face.n[0], face.n[1], face.n[2]);
          uvs.push(faceUV[i][0], faceUV[i][1]);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    addBox(0, -0.05, 0, 0.40, 0.60, 0.40); // cuerpo (cabina)
    // Ventanas: un panel por cara, sobresale un pelín del cuerpo. Se colorean con vidrio cálido (abajo).
    addBox( 0.415, 0.42, 0, 0.02, 0.10, 0.24); // ventana +X
    addBox(-0.415, 0.42, 0, 0.02, 0.10, 0.24); // ventana -X
    addBox(0, 0.42,  0.415, 0.24, 0.10, 0.02); // ventana +Z
    addBox(0, 0.42, -0.415, 0.24, 0.10, 0.02); // ventana -Z
    addBox(0,  0.60, 0, 0.45, 0.05, 0.45); // alero del tejado (sobresale)
    addBox(0,  0.70, 0, 0.36, 0.06, 0.36); // tejado, grada 2
    addBox(0,  0.80, 0, 0.28, 0.05, 0.28); // tejado, grada 3
    addBox(0,  0.93, 0, 0.06, 0.09, 0.06); // farol superior
    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
  }

  /**
   * Colorea por posición: farol encendido, tejado azul oscuro, ventanas con vidrio CÁLIDO (los paneles que
   * sobresalen del cuerpo) y cuerpo azul. El vidrio cálido va muy brillante para que lea como "encendido
   * desde dentro" pese a que el shader iluminado no tiene término emissive real (glow puro = cambio de shader).
   */
  protected override generateVertexColors(): void {
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      const x = this.vertices[i * 3 + 0];
      const y = this.vertices[i * 3 + 1];
      const z = this.vertices[i * 3 + 2];
      let r: number, g: number, b: number;
      const isWindow = (Math.abs(x) > 0.41 || Math.abs(z) > 0.41) && y >= 0.30 && y <= 0.54;
      if (y >= 0.84) {
        r = 1.0; g = 0.92; b = 0.65;        // farol encendido
      } else if (y >= 0.55) {
        r = 0.07; g = 0.16; b = 0.40;       // tejado azul oscuro
      } else if (isWindow) {
        r = 1.0; g = 0.80; b = 0.42;        // vidrio cálido (luz desde dentro)
      } else {
        r = 0.12; g = 0.30; b = 0.62;       // cuerpo azul cabina
      }
      this.colors[i * 3 + 0] = r;
      this.colors[i * 3 + 1] = g;
      this.colors[i * 3 + 2] = b;
    }
  }
}

/**
 * Crea la TARDIS compañera de un planeta (la Tierra) en una posición orbital fija dentro de su debris.
 * Devuelve la entrada `{ obj, local }` lista para insertar en `planetDebris`.
 */
export function createTardisCompanion(
  planet: Planet,
): { obj: TardisObject; local: { x: number; y: number; z: number } } {
  const R = Math.max(1, planet.scale.x);
  const angle = Math.PI * 0.35;
  const r = R * 2.3;
  const local = { x: Math.cos(angle) * r, y: R * 0.12, z: Math.sin(angle) * r };
  const obj = new TardisObject(`${planet.id}-tardis`, {
    x: planet.position.x + local.x,
    y: planet.position.y + local.y,
    z: planet.position.z + local.z,
  });
  return { obj, local };
}
