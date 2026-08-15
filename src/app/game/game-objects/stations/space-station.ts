import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
import type { StructuredShape } from '../../services/physics/collision/collision-shape.types';
import { TargetType } from '../../types/targeting.types';
import { GameObjectType } from '../../types/game-object.types';
import { GameObjectAnimosity } from '../../types/animosity.types';

/**
 * Colocación LOCAL (espacio unidad, pre-escala) de un puerto de atraque. El {@link SpaceStation} la define;
 * el system la transforma a mundo con el modelMatrix de la estación para instanciar los `DockPort`.
 */
export interface DockPortPlacement {
  id: string;                        // sufijo único dentro de la estación
  localCenter: [number, number, number];
  localNormal: [number, number, number]; // dirección de aproximación de la nave (saliente)
  intact: boolean;                   // false = destruido por el Incidente (no acoplable)
}

/** Puntos LOCALES (espacio unidad) donde la estación emite partículas: fuego y motor del núcleo. */
export interface StationEmissivePoints {
  fire: Array<[number, number, number]>;   // focos de fuego (toroide)
  motor: [number, number, number] | null;  // núcleo de motores (resplandor "apagado" rojo/naranja)
}

/**
 * Modelo MASTER de estación espacial (abstracto). Comparten todas las razas: identidad/targeting como
 * categoría STATION, NEUTRAL por defecto, y un conjunto de puertos de atraque. El DISEÑO (geometría) lo
 * aporta cada subclase (`initGeometry`/`generateVertexColors` copiando una malla de módulo, patrón TURTLE_GEO).
 *
 * Regla del usuario (docs/ESTACIONES.md §1.2.1): las STATIONS **NO usan bounding sphere** (ni colisión por
 * ahora). Se anula en el constructor; la detección de colisión "de otra forma" se diseñará más adelante.
 */
export abstract class SpaceStation extends GameObject {
  public readonly isSpaceStation = true;
  public size!: number;        // radio exterior en unidades de mundo (feature común de targeting/detalles)
  /**
   * Radio de SELECCIÓN (targeting) en mundo. Lo lee el TargetDetector para poder seleccionar el cuerpo de la
   * estación (aim al núcleo). NO es colisión: la bounding sphere sigue null (ver constructor). docs/ESTACIONES §1.2.1.
   */
  public radius!: number;
  protected stationName!: string;
  /**
   * Ángulo de giro sobre el PROPIO eje del toroide (rueda; el núcleo es el eje). La inclinación fija de la
   * estación en el espacio va en `rotation.x`/`rotation.z`; el spin va aquí para que sea la rotación MÁS
   * INTERNA y el eje de giro sea el del toroide, sin bamboleo. Ver {@link updateModelMatrix}.
   */
  public spin = 0;

  constructor(id: string, position: Vector3, outerRadius: number, name: string) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: outerRadius, y: outerRadius, z: outerRadius });
    // Tras super (y tras el [[Define]] de los campos de la subclase): asignaciones seguras.
    this.setType(GameObjectType.SPACE_STATION);
    this.objectType = TargetType.SPACE_STATION;
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.size = outerRadius;
    this.radius = outerRadius;     // radio de selección (targeting), NO de colisión
    this.stationName = name;
    this.healthMax = 100000;       // estructura colosal (no destruible por armas en este slice)
    this.healthCurrent = Math.round(this.healthMax * 0.16); // dañada por el Incidente: ~16% de integridad
    this.voidMassUnits = 0;
    // STATIONS sin bounding sphere: nada de esfera gigante que bloquee navegar entre radios/puertos.
    this.boundingSphere = null;
  }

  public getDisplayName(): string {
    return this.stationName;
  }

  /**
   * La estación gira como una RUEDA sobre su propio eje (el toroide alrededor del núcleo). Para que el eje
   * de giro sea el del toroide —y no bambolee alrededor del eje Y del mundo— el spin (Y local) debe ser la
   * rotación MÁS INTERNA, aplicada DESPUÉS de la inclinación fija (rotation.x/z). Orden compuesto:
   * `T · Rx · Rz · Ry(spin) · S`. Así el eje de giro en mundo coincide con el eje del toroide (Rx·Rz·Y).
   */
  public override updateModelMatrix(): void {
    this.identityMatrix(this.modelMatrix);
    this.translate(this.modelMatrix, this.position.x, this.position.y, this.position.z);
    this.rotateX(this.modelMatrix, this.rotation.x); // inclinación fija
    this.rotateZ(this.modelMatrix, this.rotation.z); // inclinación fija
    this.rotateY(this.modelMatrix, this.spin);       // giro sobre el eje del toroide (rueda)
    this.scaleMatrix(this.modelMatrix, this.scale.x, this.scale.y, this.scale.z);
  }

  /** ITargetable: las estaciones se integran en targeting como categoría STATION. */
  public getTargetType(): TargetType {
    return this.objectType;
  }

  /** Posiciones LOCALES (espacio unidad) de los puertos de atraque; el system las lleva a mundo. */
  public abstract getPortPlacements(): DockPortPlacement[];

  /** Puntos LOCALES de emisión de partículas (fuego/motor). Por defecto ninguno; las subclases lo aportan. */
  public getEmissivePointsLocal(): StationEmissivePoints {
    return { fire: [], motor: null };
  }

  /**
   * "Bolas" de motor (geometría emissive). `center` en espacio unidad (lo lleva a mundo el system);
   * `radius` en unidades de MUNDO; `flattenY` (<1) aplasta la bola por el eje Y de la estación (M&M). Por
   * defecto ninguna; las subclases lo aportan.
   */
  public getMotorGlowsLocal(): Array<{ center: [number, number, number]; radius: number; flattenY?: number }> {
    return [];
  }

  /**
   * Colliders ESTRUCTURADOS en espacio LOCAL/unidad (Fase 11, docs/COLISIONES.md): la colisión real de la
   * estación sin resucitar la bounding sphere (que sigue null, regla §1.2.1). Por defecto ninguno (la
   * estación no colisiona); cada subclase aporta formas ajustadas a SU geometría. El system los registra
   * en el ShipCollisionSystem al spawnear.
   */
  public getStructuredShapesLocal(): readonly StructuredShape[] {
    return [];
  }
}
