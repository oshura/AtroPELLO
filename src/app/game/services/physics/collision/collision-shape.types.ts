import { GameObject } from '../../../GameObject';
import { GameObjectType } from '../../../game-objects';

/**
 * Catálogo de formas para colliders ESTRUCTURADOS (Fase 11, docs/COLISIONES.md §3.3).
 * Las formas se definen en el espacio LOCAL/unidad del objeto (pre-escala): la narrow phase
 * transforma la posición de la nave por la inversa de `modelMatrix` y evalúa SDFs analíticas
 * aquí descritas. Unidades: las del espacio objeto (la estación humana usa esfera unidad ×800).
 */

/** Tupla posicional en espacio local del objeto. */
export type LocalVec3 = readonly [number, number, number];

export interface SphereShape {
  kind: 'sphere';
  center: LocalVec3;
  radius: number;
  /** Colisiona solo si true (default). Permite apagar secciones destruidas en runtime. */
  enabled?: boolean;
}

/** Caja alineada a los ejes LOCALES del objeto (la orientación mundo la aporta modelMatrix). */
export interface BoxShape {
  kind: 'box';
  center: LocalVec3;
  /** Semiejes (mitad del lado) por eje local. */
  half: LocalVec3;
  enabled?: boolean;
}

/**
 * Toroide en el plano local XZ (eje del agujero = Y local), como `pushTorus` de
 * station-geometry: el segmento i cubre el arco [i, i+1)·2π/segments medido con
 * atan2(z, x) desde +X. `gapSegments` = índices SIN material (secciones destruidas):
 * un punto cuyo ángulo cae en un gap no colisiona con el toro (se puede volar por el boquete).
 * Nota: las caras de corte de los extremos del tubo no están tapadas (refinamiento opcional R5).
 */
export interface TorusShape {
  kind: 'torus';
  center: LocalVec3;
  /** Radio del anillo (centro del tubo). */
  ringRadius: number;
  /** Radio del tubo. */
  tubeRadius: number;
  /** Nº de segmentos angulares del anillo (necesario si hay gapSegments). */
  segments?: number;
  gapSegments?: readonly number[];
  enabled?: boolean;
}

export type StructuredShape = SphereShape | BoxShape | TorusShape;

/** Contacto resultante de la narrow phase, en espacio LOCAL del objeto. */
export interface SdfContact {
  /** Distancia con signo a la superficie más cercana (negativa = dentro del material). */
  distance: number;
  /** Normal unitaria saliente de la superficie en el punto evaluado. */
  nx: number;
  ny: number;
  nz: number;
  /** Índice (en `shapesLocal`) de la forma ganadora. */
  shapeIndex: number;
}

/**
 * Registro de un objeto con collider estructurado (contrato genérico para objetos futuros).
 * El radio de activación (broad phase) NO se declara: se autocalcula de las formas
 * (`computeShapesBoundRadius`) × escala uniforme del objeto. Ver docs/COLISIONES.md §3.4.
 */
export interface StructuredColliderDef {
  id: string;
  /** Aporta el transform vivo (modelMatrix/position/escala). */
  source: GameObject;
  shapesLocal: readonly StructuredShape[];
  /** Clave en la tabla de daño (collision-damage.ts). */
  objectType: GameObjectType;
  /** Hook opcional al producirse contacto (partes destructibles, misiones…). */
  onContact?: (contact: SdfContact) => void;
}
