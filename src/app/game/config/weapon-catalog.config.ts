import {
  WeaponAimMode,
  WeaponDefinition,
  WeaponId,
  WeaponKind,
} from '../types/weapon.types';

/**
 * Catálogo de armas (Fase 12 — docs/ARMAS.md).
 *
 * FUENTE ÚNICA DE VERDAD del armamento: alcance, daño, cadencia, munición y aspecto.
 * Añadir un arma nueva = una entrada aquí + su clip en `_manifest.json` + su icono.
 * NADA de esto vive en el motor: si te ves escribiendo `if (weaponId === …)` fuera de este
 * fichero, es que falta un campo en `WeaponDefinition`.
 */
export const WEAPON_CATALOG: Partial<Record<WeaponId, WeaponDefinition>> = {
  /**
   * Cañón gauss de hielo — regalo de los Grises y primera arma del juego.
   * Proyectil rapidísimo y de largo alcance: es la única forma de abatir al vampiro de fuego,
   * que es incorpóreo (no admite embestida) y radia daño a 1000 u.
   * 34 de daño ⇒ tres impactos limpios sobre sus 100 puntos de vida.
   */
  GAUSS_ICE: {
    id: 'GAUSS_ICE',
    label: 'Gauss de hielo',
    kind: WeaponKind.PROJECTILE,
    aimMode: WeaponAimMode.FIXED,
    rangeU: 3000,
    cooldownMs: 450,
    damage: 34,
    projectile: {
      // La nave mide ~2 unidades: el proyectil debe ser una fracción de eso o parece un platillo.
      speed: 900,
      radius: 0.35,
      lifeSec: 3.4,
    },
    ammo: null,
    voidEnergyCostPerShot: 1,
    visual: {
      color: [0.72, 0.9, 1.0],
      trail: true,
      glowScale: 1.0,
    },
    hardpointStyle: 'gun',
    sfx: 'sfx_weapon_gauss',
  },

  /**
   * Ametralladora Vulcan: cadencia alta, poco daño y alcance corto. El arma de acompañamiento
   * barata que las razas venden pronto.
   */
  VULCAN: {
    id: 'VULCAN',
    label: 'Vulcan',
    kind: WeaponKind.PROJECTILE,
    aimMode: WeaponAimMode.FIXED,
    rangeU: 900,
    cooldownMs: 110,
    damage: 7,
    projectile: { speed: 600, radius: 0.22, lifeSec: 1.6 },
    ammo: { max: 600, perShot: 1 },
    visual: { color: [1.0, 0.82, 0.45], trail: true, glowScale: 0.7 },
    hardpointStyle: 'gun',
    sfx: 'sfx_weapon_gauss',
  },

  /** Rayo de vacío: haz continuo que desgasta al objetivo mientras se mantiene el gatillo. */
  VOID_RAY: {
    id: 'VOID_RAY',
    label: 'Rayo de vacío',
    kind: WeaponKind.BEAM,
    aimMode: WeaponAimMode.FIXED,
    rangeU: 700,
    cooldownMs: 250,
    damage: 0,
    beam: { dps: 55, widthU: 0.45, color: [0.55, 0.35, 1.0] },
    ammo: null,
    voidEnergyCostPerShot: 4, // por segundo mientras el haz está vivo
    visual: { color: [0.55, 0.35, 1.0], trail: false, glowScale: 1 },
    hardpointStyle: 'emitter',
  },

  /** Misil de racimo: exige target seleccionado y lo persigue hasta detonar. */
  MISSILE: {
    id: 'MISSILE',
    label: 'Misil buscador',
    kind: WeaponKind.PROJECTILE,
    aimMode: WeaponAimMode.TARGET_LOCKED,
    rangeU: 2200,
    cooldownMs: 1800,
    damage: 120,
    projectile: {
      speed: 260,
      radius: 0.5,
      lifeSec: 12,
      homingTurnRateRad: 2.2,
      blastRadius: 45,
    },
    ammo: { max: 12, perShot: 1 },
    visual: { color: [1.0, 0.55, 0.3], trail: true, glowScale: 1.2 },
    hardpointStyle: 'pod',
    sfx: 'sfx_weapon_gauss',
  },

  /**
   * Mina-dron: lenta y dirigida con el cursor. Si un hostil entra en su radio de enganche, lo
   * persigue sola hasta detonar.
   */
  DRONE_MINE: {
    id: 'DRONE_MINE',
    label: 'Mina-dron',
    kind: WeaponKind.PROJECTILE,
    aimMode: WeaponAimMode.MOUSE_GUIDED,
    rangeU: 1400,
    cooldownMs: 2600,
    damage: 90,
    projectile: {
      speed: 70,
      radius: 0.6,
      lifeSec: 16,
      homingTurnRateRad: 3.2,
      guidanceSec: 9,
      lockRadius: 60,
      blastRadius: 55,
    },
    ammo: { max: 6, perShot: 1 },
    visual: { color: [0.5, 1.0, 0.75], trail: false, glowScale: 1.4 },
    hardpointStyle: 'pod',
  },
};

/** Definición de un arma del catálogo, o null si el id no está poblado todavía. */
export function getWeaponDefinition(id: WeaponId): WeaponDefinition | null {
  return WEAPON_CATALOG[id] ?? null;
}

/** Ids con definición disponible (para tiendas de razas y herramientas de depuración). */
export function getAvailableWeaponIds(): WeaponId[] {
  return Object.keys(WEAPON_CATALOG) as WeaponId[];
}
