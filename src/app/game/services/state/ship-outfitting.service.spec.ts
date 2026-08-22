import {
  ShipOutfittingService,
  ShipOutfittingHost,
  OutfittableShip,
  GREYS_ENGINE_TIER,
  MIGO_ROTATION_SPEED,
  MIGO_TURN_TIER,
} from './ship-outfitting.service';
import { ShipOutfitState, createDefaultShipOutfit } from '../../types/weapon.types';

function makeHarness() {
  const ship: OutfittableShip = {
    maxSpeed: 20,
    acceleration: 2,
    deceleration: 2.5,
    rotationSpeed: Math.PI / 2.5,
    voidEnergyMax: 100,
    voidEnergyCurrent: 40,
    cargoCapacityMax: 10,
  };
  let outfit: ShipOutfitState = createDefaultShipOutfit();
  const notices: string[] = [];
  let dynamicsChanges = 0;
  const host: ShipOutfittingHost = {
    getShip: () => ship,
    getOutfit: () => ({ ...outfit, weapons: outfit.weapons.map(w => ({ ...w })) }),
    applyOutfit: (next) => {
      outfit = { ...next, weapons: next.weapons.map(w => ({ ...w })) };
    },
    installWeapon: (weaponId) => {
      if (outfit.weapons.length >= outfit.weaponSlots) return false;
      outfit.weapons.push({ weaponId, slotIndex: outfit.weapons.length });
      return true;
    },
    onDynamicsChanged: () => {
      dynamicsChanges++;
    },
    emitNotice: (message) => notices.push(message),
    logInfo: () => undefined,
  };
  return {
    ship,
    host,
    notices,
    get outfit() {
      return outfit;
    },
    get dynamicsChanges() {
      return dynamicsChanges;
    },
  };
}

describe('ShipOutfittingService', () => {
  it('el paquete de los Grises sube velocidad, vacío y monta el gauss', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    expect(service.applyGreysUpgrade(harness.host)).toBe(true);

    expect(harness.ship.maxSpeed).toBe(100);
    expect(harness.ship.acceleration).toBe(10);
    expect(harness.ship.deceleration).toBe(12.5);
    // Módulo de vacío ×10 y depósito lleno para el viaje.
    expect(harness.ship.voidEnergyMax).toBe(1000);
    expect(harness.ship.voidEnergyCurrent).toBe(1000);
    expect(harness.outfit.engineTier).toBe(GREYS_ENGINE_TIER);
    expect(harness.outfit.weapons.map(w => w.weaponId)).toEqual(['GAUSS_ICE']);
    expect(harness.dynamicsChanges).toBe(1);
    expect(harness.notices.length).toBe(1);
  });

  it('repetir el paquete de los Grises no acumula nada', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    service.applyGreysUpgrade(harness.host);
    expect(service.applyGreysUpgrade(harness.host)).toBe(false);

    expect(harness.ship.maxSpeed).toBe(100);
    expect(harness.outfit.weapons.length).toBe(1);
  });

  it('nunca rebaja una nave que ya era mejor', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();
    harness.ship.maxSpeed = 250;
    harness.ship.voidEnergyMax = 5000;

    service.applyGreysUpgrade(harness.host);

    expect(harness.ship.maxSpeed).toBe(250);
    expect(harness.ship.voidEnergyMax).toBe(5000);
  });

  it('ampliar el motor sube el nivel y la dinámica', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    service.applyGreysUpgrade(harness.host);
    service.upgradeEngine(harness.host);

    expect(harness.outfit.engineTier).toBe(GREYS_ENGINE_TIER + 1);
    expect(harness.ship.maxSpeed).toBeGreaterThan(100);
  });

  it('un anclaje nuevo permite montar otra arma', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    service.applyGreysUpgrade(harness.host);
    // Con un solo anclaje ocupado, la compra debe rechazarse.
    expect(service.grantWeapon(harness.host, 'VULCAN')).toBe(false);
    expect(harness.notices).toContain('SIN ANCLAJES LIBRES');

    service.addWeaponSlot(harness.host);
    expect(service.grantWeapon(harness.host, 'VULCAN')).toBe(true);
    expect(harness.outfit.weapons.map(w => w.weaponId)).toEqual(['GAUSS_ICE', 'VULCAN']);
  });

  it('el injerto de los Mi-Go instala maniobrador y retensa los giroscopios', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    expect(service.applyMiGoUpgrade(harness.host)).toBe(true);

    expect(harness.outfit.mouseFlight).toBe(true);
    expect(harness.outfit.turnTier).toBe(MIGO_TURN_TIER);
    expect(harness.ship.rotationSpeed).toBe(MIGO_ROTATION_SPEED);
    expect(harness.dynamicsChanges).toBe(1);
  });

  it('repetir el injerto de los Mi-Go no acumula nada', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();

    service.applyMiGoUpgrade(harness.host);
    expect(service.applyMiGoUpgrade(harness.host)).toBe(false);
    expect(harness.notices.length).toBe(1);
  });

  it('el injerto Mi-Go nunca rebaja un giro que ya era mejor', () => {
    const service = new ShipOutfittingService();
    const harness = makeHarness();
    harness.ship.rotationSpeed = Math.PI; // giroscopios ya superiores

    service.applyMiGoUpgrade(harness.host);

    expect(harness.ship.rotationSpeed).toBe(Math.PI);
  });

  it('sin nave, las mejoras no explotan', () => {
    const service = new ShipOutfittingService();
    const host: ShipOutfittingHost = {
      getShip: () => null,
      getOutfit: () => createDefaultShipOutfit(),
      applyOutfit: () => undefined,
      installWeapon: () => false,
      onDynamicsChanged: () => undefined,
      emitNotice: () => undefined,
      logInfo: () => undefined,
    };

    expect(service.applyGreysUpgrade(host)).toBe(false);
    expect(service.upgradeEngine(host)).toBe(false);
  });
});
