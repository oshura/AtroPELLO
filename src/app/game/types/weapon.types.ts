import { Vector3 } from '../../types/game.types';

/**
 * Tipos del armamento del jugador (Fase 12 — docs/ARMAS.md).
 *
 * Un arma se DEFINE por datos (`WeaponDefinition` en weapon-catalog.config.ts) y se INSTALA en un
 * slot de la nave (`InstalledWeaponState`). Añadir un arma nueva no debe tocar el motor: basta una
 * entrada de catálogo, su sonido y su icono.
 */

/** Familia del arma: proyectil discreto o haz continuo. */
export enum WeaponKind {
  /** Dispara proyectiles con vida propia (balas, gauss, misiles, minas…). */
  PROJECTILE = 'PROJECTILE',
  /** Haz continuo mientras se mantiene el gatillo (láser, rayo de vacío, tractor…). */
  BEAM = 'BEAM',
}

/** Cómo decide el arma hacia dónde dispara. */
export enum WeaponAimMode {
  /** Fijo al morro: sigue la retícula de vector de vuelo dibujada en el HUD. */
  FIXED = 'FIXED',
  /** El proyectil persigue el punto que marca el cursor (minas-drone guiadas). */
  MOUSE_GUIDED = 'MOUSE_GUIDED',
  /** Requiere target seleccionado y lo persigue (misiles). */
  TARGET_LOCKED = 'TARGET_LOCKED',
}

/** Identificadores del catálogo. Ampliar aquí al diseñar un arma nueva. */
export type WeaponId =
  | 'GAUSS_ICE'
  | 'VULCAN'
  | 'LASER'
  | 'PHASER'
  | 'PLASMA'
  | 'MISSILE'
  | 'DRONE_MINE'
  | 'VOID_RAY'
  | 'TRACTOR_RAY';

/** Parámetros del proyectil disparado (solo `WeaponKind.PROJECTILE`). */
export interface WeaponProjectileSpec {
  /** Unidades por segundo. */
  speed: number;
  /** Radio de colisión del proyectil. */
  radius: number;
  /** Vida máxima en segundos (define el alcance efectivo junto con `speed`). */
  lifeSec: number;
  /** Giro máximo por segundo para proyectiles guiados (rad/s). */
  homingTurnRateRad?: number;
  /** Segundos de guiado por cursor antes de quedar a la deriva (MOUSE_GUIDED). */
  guidanceSec?: number;
  /** Radio de enganche automático a un hostil cercano (MOUSE_GUIDED). */
  lockRadius?: number;
  /** Radio de detonación con caída de daño. Sin valor: impacto directo. */
  blastRadius?: number;
}

/** Parámetros del haz continuo (solo `WeaponKind.BEAM`). */
export interface WeaponBeamSpec {
  /** Daño por segundo mientras el haz toca al objetivo. */
  dps: number;
  /** Corte automático del haz. Sin valor: dura mientras haya gatillo y energía. */
  maxDurationMs?: number;
  /** Grosor del haz en unidades de mundo. */
  widthU: number;
  /** Color RGB 0..1. */
  color: [number, number, number];
}

/** Munición propia del arma. Sin munición (`null`) el arma consume energía del vacío. */
export interface WeaponAmmoSpec {
  max: number;
  perShot: number;
}

/** Definición inmutable de un arma. Vive en el catálogo, nunca en el motor. */
export interface WeaponDefinition {
  id: WeaponId;
  label: string;
  kind: WeaponKind;
  aimMode: WeaponAimMode;
  /** Alcance máximo en unidades de mundo. */
  rangeU: number;
  /** Tiempo mínimo entre disparos. */
  cooldownMs: number;
  /** Daño por impacto (PROJECTILE). Los haces usan `beam.dps`. */
  damage: number;
  projectile?: WeaponProjectileSpec;
  beam?: WeaponBeamSpec;
  ammo?: WeaponAmmoSpec | null;
  /** Coste de energía del vacío por disparo (o por segundo, en haces). */
  voidEnergyCostPerShot?: number;
  visual: {
    color: [number, number, number];
    trail: boolean;
    glowScale: number;
  };
  /** Pieza que se dibuja en el hardpoint de la nave. */
  hardpointStyle: 'gun' | 'pod' | 'emitter';
  /** Clip del manifiesto de audio que suena al disparar. */
  sfx?: string;
}

/** Arma montada en un slot concreto de la nave. */
export interface InstalledWeaponState {
  weaponId: WeaponId;
  slotIndex: number;
  /** Munición restante. Ausente en armas alimentadas por energía del vacío. */
  ammoCurrent?: number;
}

/** Configuración persistente de la nave: motor y armamento instalado. */
export interface ShipOutfitState {
  /** Nivel de motor: dirige la geometría (toberas) y las ofertas de mejora. 0 = nave inicial. */
  engineTier: number;
  /** Número de hardpoints disponibles (se compran a las razas). */
  weaponSlots: number;
  weapons: InstalledWeaponState[];
  /** Índice dentro de `weapons` del arma seleccionada. -1 si no hay ninguna. */
  selectedWeaponIndex: number;
}

/** Outfit de la nave recién estrenada: sin armas ni mejoras. */
export function createDefaultShipOutfit(): ShipOutfitState {
  return { engineTier: 0, weaponSlots: 0, weapons: [], selectedWeaponIndex: -1 };
}

/** Petición de disparo que el sistema de armas entrega al pool de proyectiles. */
export interface ProjectileSpawnSpec {
  weaponId: WeaponId;
  kind: WeaponKind;
  position: Vector3;
  direction: Vector3;
  spec: WeaponProjectileSpec;
  damage: number;
  rangeU: number;
  aimMode: WeaponAimMode;
  color: [number, number, number];
  trail: boolean;
  glowScale: number;
  /** Target enganchado desde el disparo (TARGET_LOCKED). */
  targetId?: string;
}

/** Fila del panel de armas del HUD. */
export interface WeaponsHudEntry {
  label: string;
  kind: WeaponKind;
  selected: boolean;
  /** 0 = listo para disparar, 1 = recién disparado. */
  cooldownPct: number;
  /** "12/40", "∞" o null si el arma no muestra munición. */
  ammoLabel: string | null;
}

/** Estado del panel de armas del HUD. */
export interface WeaponsHudSnapshot {
  entries: WeaponsHudEntry[];
  slotsMax: number;
  /** Proyectiles guiados por cursor todavía vivos (MOUSE_GUIDED). */
  guidedCount: number;
}
