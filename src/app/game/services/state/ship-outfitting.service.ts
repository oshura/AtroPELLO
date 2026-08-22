import { ShipOutfitState, WeaponId } from '../../types/weapon.types';

/**
 * ShipOutfittingService — mejoras permanentes de la nave (Fase 13 — docs/RAZAS.md).
 *
 * Las razas no te dan objetos: te reconstruyen la nave. Aquí viven esas transformaciones, para que
 * ni el motor ni los diálogos tengan que saber qué tornillo se toca.
 *
 * Patrón: clase plana sin DI. El motor la instancia y le pasa un host.
 */

/** Dinámica y depósitos que una mejora puede tocar. */
export interface OutfittableShip {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  voidEnergyMax: number;
  voidEnergyCurrent: number;
  cargoCapacityMax: number;
}

export interface ShipOutfittingHost {
  getShip(): OutfittableShip | null;
  getOutfit(): ShipOutfitState;
  applyOutfit(outfit: ShipOutfitState): void;
  installWeapon(weaponId: WeaponId): boolean;
  /** La dinámica base cambió: el motor debe reobservarla (y olvidar buffs viejos). */
  onDynamicsChanged(): void;
  emitNotice(message: string): void;
  logInfo(message: string, data?: unknown): void;
}

/** Motor mejorado por los Grises: el salto de la nave de fuga a una nave capaz de cazar. */
export const GREYS_ENGINE_TIER = 1;
const GREYS_MAX_SPEED = 100;
const GREYS_ACCELERATION = 10;
const GREYS_DECELERATION = 12.5;
const GREYS_VOID_ENERGY_MAX = 1000;

export class ShipOutfittingService {
  /**
   * Paquete completo de los Grises: anillo de toberas, cañón gauss y módulo de vacío ampliado.
   * Idempotente: repetirlo no acumula nada.
   */
  public applyGreysUpgrade(host: ShipOutfittingHost): boolean {
    const ship = host.getShip();
    if (!ship) {
      return false;
    }
    const outfit = host.getOutfit();
    if (outfit.engineTier >= GREYS_ENGINE_TIER && outfit.weapons.some(w => w.weaponId === 'GAUSS_ICE')) {
      return false;
    }

    ship.maxSpeed = Math.max(ship.maxSpeed, GREYS_MAX_SPEED);
    ship.acceleration = Math.max(ship.acceleration, GREYS_ACCELERATION);
    ship.deceleration = Math.max(ship.deceleration, GREYS_DECELERATION);
    // Módulo de vacío ×10: sin él no se llega a los dominios lejanos.
    ship.voidEnergyMax = Math.max(ship.voidEnergyMax, GREYS_VOID_ENERGY_MAX);
    ship.voidEnergyCurrent = ship.voidEnergyMax;

    host.applyOutfit({
      ...outfit,
      engineTier: Math.max(outfit.engineTier, GREYS_ENGINE_TIER),
      weaponSlots: Math.max(1, outfit.weaponSlots),
    });
    host.installWeapon('GAUSS_ICE');
    host.onDynamicsChanged();
    host.emitNotice('NAVE REACONDICIONADA: GAUSS DE HIELO');
    host.logInfo('Mejora de los Grises aplicada', {
      maxSpeed: ship.maxSpeed,
      voidEnergyMax: ship.voidEnergyMax,
      engineTier: GREYS_ENGINE_TIER,
    });
    return true;
  }

  /** Sube el motor un escalón: más toberas y más empuje. */
  public upgradeEngine(host: ShipOutfittingHost): boolean {
    const ship = host.getShip();
    if (!ship) {
      return false;
    }
    const outfit = host.getOutfit();
    const nextTier = outfit.engineTier + 1;
    ship.maxSpeed = Math.round(ship.maxSpeed * 1.35);
    ship.acceleration = Math.round(ship.acceleration * 1.3 * 10) / 10;
    ship.deceleration = Math.round(ship.deceleration * 1.3 * 10) / 10;
    host.applyOutfit({ ...outfit, engineTier: nextTier });
    host.onDynamicsChanged();
    host.emitNotice(`MOTOR AMPLIADO · NIVEL ${nextTier}`);
    return true;
  }

  /** Abre un anclaje de arma más en el ala. */
  public addWeaponSlot(host: ShipOutfittingHost): boolean {
    const outfit = host.getOutfit();
    host.applyOutfit({ ...outfit, weaponSlots: outfit.weaponSlots + 1 });
    host.emitNotice('NUEVO ANCLAJE DE ARMA');
    return true;
  }

  /** Monta un arma comprada a una raza. */
  public grantWeapon(host: ShipOutfittingHost, weaponId: WeaponId): boolean {
    const outfit = host.getOutfit();
    if (outfit.weapons.length >= outfit.weaponSlots) {
      host.emitNotice('SIN ANCLAJES LIBRES');
      return false;
    }
    const installed = host.installWeapon(weaponId);
    if (installed) {
      host.emitNotice(`ARMA INSTALADA: ${weaponId}`);
    }
    return installed;
  }
}
