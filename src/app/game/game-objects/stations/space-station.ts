import { Vector3 } from '../../../types/game.types';
import { GameObject } from '../../GameObject';
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
  protected stationName!: string;

  constructor(id: string, position: Vector3, outerRadius: number, name: string) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: outerRadius, y: outerRadius, z: outerRadius });
    // Tras super (y tras el [[Define]] de los campos de la subclase): asignaciones seguras.
    this.setType(GameObjectType.SPACE_STATION);
    this.objectType = TargetType.SPACE_STATION;
    this.animosity = GameObjectAnimosity.NEUTRAL;
    this.size = outerRadius;
    this.stationName = name;
    this.healthMax = 100000;       // estructura colosal (no destruible por armas en este slice)
    this.healthCurrent = this.healthMax;
    this.voidMassUnits = 0;
    // STATIONS sin bounding sphere: nada de esfera gigante que bloquee navegar entre radios/puertos.
    this.boundingSphere = null;
  }

  public getDisplayName(): string {
    return this.stationName;
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
   * `radius` en unidades de MUNDO. Por defecto ninguna; las subclases lo aportan.
   */
  public getMotorGlowsLocal(): Array<{ center: [number, number, number]; radius: number }> {
    return [];
  }
}
