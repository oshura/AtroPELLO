import { WeaponSystem, WeaponSystemHost, MuzzleTransform, PLAYER_PROJECTILE_SOURCE_ID } from './weapon-system';
import { ProjectileSpawnRequest } from './projectile-system';
import { WeaponAimMode, WeaponKind } from '../../types/weapon.types';
import { getWeaponDefinition } from '../../config/weapon-catalog.config';

function makeHost(overrides: Partial<WeaponSystemHost> = {}) {
  const spawned: ProjectileSpawnRequest[] = [];
  const warnings: string[] = [];
  const sfx: string[] = [];
  const beams: string[] = [];
  let voidEnergy = 100;
  const host: WeaponSystemHost = {
    getMuzzle: (_slot: number, out: MuzzleTransform) => {
      out.position.x = 0;
      out.position.y = 0;
      out.position.z = 0;
      out.direction.x = 0;
      out.direction.y = 0;
      out.direction.z = 1;
      return true;
    },
    getSelectedTargetId: () => null,
    getSelectedTargetPosition: () => null,
    consumeVoidEnergy: (amount: number) => {
      if (voidEnergy < amount) return false;
      voidEnergy -= amount;
      return true;
    },
    spawnProjectile: (request: ProjectileSpawnRequest) => spawned.push(request),
    startBeam: (definition) => {
      beams.push(definition.id);
      return true;
    },
    stopBeam: () => beams.push('stop'),
    getGuidedProjectileCount: () => 0,
    emitWarning: (message: string) => warnings.push(message),
    playSfx: (clip: string) => sfx.push(clip),
    logInfo: () => undefined,
    ...overrides,
  };
  return {
    host,
    spawned,
    warnings,
    sfx,
    beams,
    get voidEnergy() {
      return voidEnergy;
    },
    setVoidEnergy(value: number) {
      voidEnergy = value;
    },
  };
}

function makeSystemWithGauss(slots = 1): WeaponSystem {
  const system = new WeaponSystem();
  system.applyState({ engineTier: 1, weaponSlots: slots, weapons: [], selectedWeaponIndex: -1 });
  system.installWeapon('GAUSS_ICE');
  return system;
}

describe('WeaponSystem', () => {
  it('no instala sin hardpoints libres', () => {
    const system = new WeaponSystem();
    expect(system.installWeapon('GAUSS_ICE')).toBe(false);
    expect(system.installedCount).toBe(0);

    system.setWeaponSlots(1);
    expect(system.installWeapon('GAUSS_ICE')).toBe(true);
    expect(system.installedCount).toBe(1);
    expect(system.getSelectedDefinition()?.id).toBe('GAUSS_ICE');
  });

  it('sin gatillo no dispara; con gatillo respeta la cadencia', () => {
    const system = makeSystemWithGauss();
    const { host, spawned } = makeHost();
    const gauss = getWeaponDefinition('GAUSS_ICE')!;

    system.update(host, 0);
    expect(spawned.length).toBe(0);

    system.setTriggerHeld(true);
    system.update(host, 0);
    expect(spawned.length).toBe(1);

    // Dentro del cooldown no sale nada.
    system.update(host, gauss.cooldownMs - 1);
    expect(spawned.length).toBe(1);

    system.update(host, gauss.cooldownMs);
    expect(spawned.length).toBe(2);
  });

  it('el disparo FIXED sale de la boca y sigue el morro de la nave', () => {
    const system = makeSystemWithGauss();
    const { host, spawned, sfx } = makeHost();
    const gauss = getWeaponDefinition('GAUSS_ICE')!;

    system.setTriggerHeld(true);
    system.update(host, 0);

    const shot = spawned[0];
    expect(shot.faction).toBe('player');
    expect(shot.sourceId).toBe(PLAYER_PROJECTILE_SOURCE_ID);
    expect(shot.kind).toBe('GAUSS_ICE');
    expect(shot.velocity.z).toBeCloseTo(gauss.projectile!.speed, 5);
    expect(shot.velocity.x).toBeCloseTo(0, 5);
    expect(shot.damageNear).toBe(gauss.damage);
    expect(shot.guidance).toBeUndefined();
    expect(sfx).toEqual([gauss.sfx!]);
  });

  it('cada disparo consume energía del vacío y avisa al agotarse', () => {
    const system = makeSystemWithGauss();
    const harness = makeHost();
    const gauss = getWeaponDefinition('GAUSS_ICE')!;
    harness.setVoidEnergy(1);

    system.setTriggerHeld(true);
    system.update(harness.host, 0);
    expect(harness.spawned.length).toBe(1);
    expect(harness.voidEnergy).toBe(1 - gauss.voidEnergyCostPerShot!);

    system.update(harness.host, gauss.cooldownMs);
    expect(harness.spawned.length).toBe(1);
    expect(harness.warnings).toContain('SIN ENERGÍA DEL VACÍO');
  });

  it('el aviso repetido con el gatillo mantenido está limitado', () => {
    const system = makeSystemWithGauss();
    const harness = makeHost();
    const gauss = getWeaponDefinition('GAUSS_ICE')!;
    harness.setVoidEnergy(0);

    system.setTriggerHeld(true);
    // Ráfaga de intentos dentro de la ventana de silencio: un único aviso.
    for (let t = 0; t < 1500; t += gauss.cooldownMs) {
      system.update(harness.host, t);
    }
    expect(harness.warnings.length).toBe(1);

    // Pasada la ventana, el piloto vuelve a ser avisado.
    system.update(harness.host, 3000);
    expect(harness.warnings.length).toBe(2);
  });

  it('cycle rota en ambos sentidos y da la vuelta', () => {
    const system = new WeaponSystem();
    system.applyState({ engineTier: 1, weaponSlots: 2, weapons: [], selectedWeaponIndex: -1 });
    system.installWeapon('GAUSS_ICE', 0);
    system.installWeapon('GAUSS_ICE', 1);

    expect(system.getSelectedInstalled()?.slotIndex).toBe(0);
    system.cycle(false);
    expect(system.getSelectedInstalled()?.slotIndex).toBe(1);
    system.cycle(false);
    expect(system.getSelectedInstalled()?.slotIndex).toBe(0);
    system.cycle(true);
    expect(system.getSelectedInstalled()?.slotIndex).toBe(1);
  });

  it('sin armas, cycle y update son inocuos', () => {
    const system = new WeaponSystem();
    const { host, spawned } = makeHost();

    expect(system.cycle(false)).toBeNull();
    system.setTriggerHeld(true);
    system.update(host, 0);
    expect(spawned.length).toBe(0);
    expect(system.installedCount).toBe(0);
  });

  it('el snapshot del HUD marca la seleccionada, el cooldown y el coste', () => {
    const system = makeSystemWithGauss(2);
    const { host } = makeHost();
    const gauss = getWeaponDefinition('GAUSS_ICE')!;

    system.setTriggerHeld(true);
    system.update(host, 0);

    const snapshot = system.buildHudSnapshot(host, 0);
    expect(snapshot.slotsMax).toBe(2);
    expect(snapshot.entries.length).toBe(1);
    expect(snapshot.entries[0].label).toBe(gauss.label);
    expect(snapshot.entries[0].kind).toBe(WeaponKind.PROJECTILE);
    expect(snapshot.entries[0].selected).toBe(true);
    expect(snapshot.entries[0].cooldownPct).toBeCloseTo(1, 5);
    expect(snapshot.entries[0].ammoLabel).toBe('1∅');

    const later = system.buildHudSnapshot(host, gauss.cooldownMs);
    expect(later.entries[0].cooldownPct).toBe(0);
  });

  it('getState/applyState conservan el outfit y descartan armas desconocidas', () => {
    const system = makeSystemWithGauss(2);
    const state = system.getState();
    expect(state.weapons.length).toBe(1);
    expect(state.weaponSlots).toBe(2);

    const restored = new WeaponSystem();
    restored.applyState({
      ...state,
      weapons: [...state.weapons, { weaponId: 'PLASMA', slotIndex: 1 }],
    });
    expect(restored.installedCount).toBe(1);
    expect(restored.getSelectedDefinition()?.id).toBe('GAUSS_ICE');
  });

  it('applyState tolera un outfit ausente', () => {
    const system = makeSystemWithGauss();
    system.applyState(null);
    expect(system.installedCount).toBe(0);
    expect(system.slotsMax).toBe(0);
    expect(system.getSelectedInstalled()).toBeNull();
  });

  it('un arma de haz enciende el haz en vez de lanzar proyectiles', () => {
    const system = new WeaponSystem();
    system.applyState({ engineTier: 1, weaponSlots: 1, weapons: [], selectedWeaponIndex: -1 });
    system.installWeapon('VOID_RAY');
    const harness = makeHost();

    system.setTriggerHeld(true);
    system.update(harness.host, 0);

    expect(harness.spawned.length).toBe(0);
    expect(harness.beams).toEqual(['VOID_RAY']);
    expect(system.shouldBeamStayActive()).toBe(true);

    system.setTriggerHeld(false);
    expect(system.shouldBeamStayActive()).toBe(false);
  });

  it('con un arma de proyectil el haz no debe seguir vivo', () => {
    const system = makeSystemWithGauss();
    system.setTriggerHeld(true);
    expect(system.shouldBeamStayActive()).toBe(false);
  });

  it('un arma TARGET_LOCKED exige target y respeta el alcance', () => {
    // El catálogo aún no trae misiles: se valida el despacho con una definición sintética.
    const system = new WeaponSystem();
    system.setWeaponSlots(1);
    system.installWeapon('GAUSS_ICE');
    const gauss = getWeaponDefinition('GAUSS_ICE')!;
    const originalAim = gauss.aimMode;
    (gauss as { aimMode: WeaponAimMode }).aimMode = WeaponAimMode.TARGET_LOCKED;

    try {
      const noTarget = makeHost();
      system.setTriggerHeld(true);
      system.update(noTarget.host, 0);
      expect(noTarget.spawned.length).toBe(0);
      expect(noTarget.warnings).toContain('SIN TARGET');

      const farAway = makeHost({
        getSelectedTargetId: () => 'target-1',
        getSelectedTargetPosition: () => ({ x: 0, y: 0, z: gauss.rangeU + 100 }),
      });
      system.update(farAway.host, 10000);
      expect(farAway.spawned.length).toBe(0);
      expect(farAway.warnings).toContain('TARGET FUERA DE ALCANCE');

      const inRange = makeHost({
        getSelectedTargetId: () => 'target-1',
        getSelectedTargetPosition: () => ({ x: 100, y: 0, z: 0 }),
      });
      system.update(inRange.host, 20000);
      expect(inRange.spawned.length).toBe(1);
      expect(inRange.spawned[0].velocity.x).toBeCloseTo(gauss.projectile!.speed, 5);
    } finally {
      (gauss as { aimMode: WeaponAimMode }).aimMode = originalAim;
    }
  });
});
