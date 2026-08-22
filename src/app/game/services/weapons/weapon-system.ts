import { Vector3 } from '../../../types/game.types';
import { getWeaponDefinition } from '../../config/weapon-catalog.config';
import {
  InstalledWeaponState,
  ShipOutfitState,
  WeaponAimMode,
  WeaponDefinition,
  WeaponId,
  WeaponKind,
  WeaponsHudSnapshot,
  createDefaultShipOutfit,
} from '../../types/weapon.types';
import { ProjectileSpawnRequest } from './projectile-system';

/**
 * WeaponSystem — armamento del jugador (Fase 12 — docs/ARMAS.md).
 *
 * Posee el outfit de la nave (slots, armas instaladas, arma seleccionada), la cadencia y el
 * despacho de disparo según el modo de apuntado. No sabe dibujar ni de colisiones: entrega
 * peticiones al pool de proyectiles a través del host.
 *
 * Patrón: clase plana sin DI (docs/ARQUITECTURA.md §5.3).
 */

/** Boca de cañón resuelta en coordenadas de mundo. */
export interface MuzzleTransform {
  position: Vector3;
  direction: Vector3;
}

export interface WeaponSystemHost {
  /** Rellena `out` con la boca del hardpoint indicado. false si la nave no está disponible. */
  getMuzzle(slotIndex: number, out: MuzzleTransform): boolean;
  /** Target seleccionado por el jugador (armas TARGET_LOCKED). */
  getSelectedTargetId(): string | null;
  getSelectedTargetPosition(): Vector3 | null;
  /** Descuenta energía del vacío; false si no hay suficiente. */
  consumeVoidEnergy(amount: number): boolean;
  spawnProjectile(request: ProjectileSpawnRequest): void;
  /** Enciende (o mantiene) el haz continuo del arma. false si no se pudo. */
  startBeam(definition: WeaponDefinition, slotIndex: number): boolean;
  /** Apaga el haz continuo, si lo hubiera. */
  stopBeam(): void;
  /** Proyectiles guiados vivos, para el indicador del HUD. */
  getGuidedProjectileCount(): number;
  /** Aviso breve al piloto ("SIN MUNICIÓN", "SIN TARGET"…). */
  emitWarning(message: string): void;
  playSfx(clip: string): void;
  logInfo(message: string, data?: unknown): void;
}

/** Id de la nave como fuente de los proyectiles del jugador. */
export const PLAYER_PROJECTILE_SOURCE_ID = 'player-ship';
/** Silencio entre avisos repetidos con el gatillo mantenido. */
const WARNING_THROTTLE_MS = 1500;

export class WeaponSystem {
  private outfit: ShipOutfitState = createDefaultShipOutfit();
  private readonly cooldownUntilBySlot = new Map<number, number>();
  private triggerHeld = false;
  /** −∞ para que el PRIMER aviso nunca lo coma el silenciador. */
  private lastWarningAtMs = Number.NEGATIVE_INFINITY;
  private readonly scratchMuzzle: MuzzleTransform = {
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
  };

  public get installedCount(): number {
    return this.outfit.weapons.length;
  }

  public get slotsMax(): number {
    return this.outfit.weaponSlots;
  }

  public get engineTier(): number {
    return this.outfit.engineTier;
  }

  /** Copia del estado persistente. */
  public getState(): ShipOutfitState {
    return {
      engineTier: this.outfit.engineTier,
      weaponSlots: this.outfit.weaponSlots,
      weapons: this.outfit.weapons.map(w => ({ ...w })),
      selectedWeaponIndex: this.outfit.selectedWeaponIndex,
    };
  }

  /** Reemplaza el outfit (carga de partida, respawn, mejoras). */
  public applyState(state: ShipOutfitState | null | undefined): void {
    const next = state ? { ...state } : createDefaultShipOutfit();
    const weapons = (next.weapons ?? [])
      .filter(w => !!getWeaponDefinition(w.weaponId))
      .map(w => ({ ...w }));
    this.outfit = {
      engineTier: Number.isFinite(next.engineTier) ? next.engineTier : 0,
      weaponSlots: Math.max(Number.isFinite(next.weaponSlots) ? next.weaponSlots : 0, weapons.length),
      weapons,
      selectedWeaponIndex: this.clampSelection(next.selectedWeaponIndex, weapons.length),
    };
    this.cooldownUntilBySlot.clear();
    this.triggerHeld = false;
  }

  public setWeaponSlots(slots: number): void {
    this.outfit.weaponSlots = Math.max(0, Math.floor(slots));
  }

  public setEngineTier(tier: number): void {
    this.outfit.engineTier = Math.max(0, Math.floor(tier));
  }

  /** Monta un arma. Devuelve false si no hay hardpoint libre o el id no está en el catálogo. */
  public installWeapon(weaponId: WeaponId, slotIndex?: number): boolean {
    const definition = getWeaponDefinition(weaponId);
    if (!definition) {
      return false;
    }
    const slot = slotIndex ?? this.findFreeSlot();
    if (slot < 0 || slot >= this.outfit.weaponSlots) {
      return false;
    }
    const installed: InstalledWeaponState = {
      weaponId,
      slotIndex: slot,
      ammoCurrent: definition.ammo ? definition.ammo.max : undefined,
    };
    const existing = this.outfit.weapons.findIndex(w => w.slotIndex === slot);
    if (existing >= 0) {
      this.outfit.weapons[existing] = installed;
    } else {
      this.outfit.weapons.push(installed);
      this.outfit.weapons.sort((a, b) => a.slotIndex - b.slotIndex);
    }
    if (this.outfit.selectedWeaponIndex < 0) {
      this.outfit.selectedWeaponIndex = this.outfit.weapons.findIndex(w => w.slotIndex === slot);
    }
    this.cooldownUntilBySlot.delete(slot);
    return true;
  }

  public uninstallWeapon(slotIndex: number): boolean {
    const index = this.outfit.weapons.findIndex(w => w.slotIndex === slotIndex);
    if (index < 0) {
      return false;
    }
    this.outfit.weapons.splice(index, 1);
    this.outfit.selectedWeaponIndex = this.clampSelection(
      this.outfit.selectedWeaponIndex,
      this.outfit.weapons.length
    );
    this.cooldownUntilBySlot.delete(slotIndex);
    return true;
  }

  /** Rota el arma seleccionada. Devuelve la definición activa tras rotar. */
  public cycle(previous: boolean): WeaponDefinition | null {
    const total = this.outfit.weapons.length;
    if (total <= 0) {
      this.outfit.selectedWeaponIndex = -1;
      return null;
    }
    const current = this.outfit.selectedWeaponIndex < 0 ? 0 : this.outfit.selectedWeaponIndex;
    const step = previous ? -1 : 1;
    this.outfit.selectedWeaponIndex = (current + step + total) % total;
    return this.getSelectedDefinition();
  }

  public getSelectedDefinition(): WeaponDefinition | null {
    const installed = this.getSelectedInstalled();
    return installed ? getWeaponDefinition(installed.weaponId) : null;
  }

  public getSelectedInstalled(): InstalledWeaponState | null {
    const index = this.outfit.selectedWeaponIndex;
    if (index < 0 || index >= this.outfit.weapons.length) {
      return null;
    }
    return this.outfit.weapons[index];
  }

  public setTriggerHeld(held: boolean): void {
    this.triggerHeld = held && this.installedCount > 0;
  }

  /** El haz sólo debe seguir vivo con el gatillo sostenido y el arma de haz seleccionada. */
  public shouldBeamStayActive(): boolean {
    return this.triggerHeld && this.getSelectedDefinition()?.kind === WeaponKind.BEAM;
  }

  public isTriggerHeld(): boolean {
    return this.triggerHeld;
  }

  /** Bucle de disparo. Sin armas instaladas cuesta una comparación. */
  public update(host: WeaponSystemHost, now: number = performance.now()): void {
    if (!this.triggerHeld || this.outfit.weapons.length === 0) {
      return;
    }
    const installed = this.getSelectedInstalled();
    const definition = installed ? getWeaponDefinition(installed.weaponId) : null;
    if (!installed || !definition) {
      return;
    }
    const readyAt = this.cooldownUntilBySlot.get(installed.slotIndex) ?? 0;
    if (now < readyAt) {
      return;
    }
    if (definition.kind === WeaponKind.BEAM) {
      // El haz se sostiene mientras haya gatillo: no hay cadencia, sólo encendido y apagado.
      if (!host.startBeam(definition, installed.slotIndex)) {
        this.warn(host, 'ARMA NO OPERATIVA', now);
        this.cooldownUntilBySlot.set(installed.slotIndex, now + Math.max(500, definition.cooldownMs));
      }
      return;
    }
    if (!this.fireProjectile(host, installed, definition, now)) {
      return;
    }
    this.cooldownUntilBySlot.set(installed.slotIndex, now + Math.max(0, definition.cooldownMs));
  }

  public buildHudSnapshot(host: WeaponSystemHost | null, now: number = performance.now()): WeaponsHudSnapshot {
    const entries = this.outfit.weapons.map((installed, index) => {
      const definition = getWeaponDefinition(installed.weaponId);
      const readyAt = this.cooldownUntilBySlot.get(installed.slotIndex) ?? 0;
      const cooldownMs = definition?.cooldownMs ?? 0;
      const remaining = Math.max(0, readyAt - now);
      return {
        label: definition?.label ?? installed.weaponId,
        kind: definition?.kind ?? WeaponKind.PROJECTILE,
        selected: index === this.outfit.selectedWeaponIndex,
        cooldownPct: cooldownMs > 0 ? Math.min(1, remaining / cooldownMs) : 0,
        ammoLabel: this.buildAmmoLabel(installed, definition),
      };
    });
    return {
      entries,
      slotsMax: this.outfit.weaponSlots,
      guidedCount: host?.getGuidedProjectileCount() ?? 0,
    };
  }

  private fireProjectile(
    host: WeaponSystemHost,
    installed: InstalledWeaponState,
    definition: WeaponDefinition,
    now: number
  ): boolean {
    const spec = definition.projectile;
    if (!spec) {
      return false;
    }
    if (!host.getMuzzle(installed.slotIndex, this.scratchMuzzle)) {
      return false;
    }
    let targetId: string | null = null;
    let direction = this.scratchMuzzle.direction;
    if (definition.aimMode === WeaponAimMode.TARGET_LOCKED) {
      targetId = host.getSelectedTargetId();
      const targetPosition = host.getSelectedTargetPosition();
      if (!targetId || !targetPosition) {
        this.warn(host, 'SIN TARGET', now);
        return false;
      }
      const toTarget = {
        x: targetPosition.x - this.scratchMuzzle.position.x,
        y: targetPosition.y - this.scratchMuzzle.position.y,
        z: targetPosition.z - this.scratchMuzzle.position.z,
      };
      const distance = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
      if (distance > definition.rangeU) {
        this.warn(host, 'TARGET FUERA DE ALCANCE', now);
        return false;
      }
      if (distance > 1e-6) {
        direction = { x: toTarget.x / distance, y: toTarget.y / distance, z: toTarget.z / distance };
      }
    }
    if (!this.consumeShotCost(host, installed, definition, now)) {
      return false;
    }
    host.spawnProjectile({
      faction: 'player',
      sourceId: PLAYER_PROJECTILE_SOURCE_ID,
      kind: definition.id,
      position: { ...this.scratchMuzzle.position },
      velocity: {
        x: direction.x * spec.speed,
        y: direction.y * spec.speed,
        z: direction.z * spec.speed,
      },
      lifeSec: spec.lifeSec,
      radius: spec.radius,
      damageNear: definition.damage,
      damageFar: definition.damage,
      falloffRange: definition.rangeU,
      blastRadius: spec.blastRadius,
      guidance: this.buildGuidance(definition, spec.homingTurnRateRad, targetId),
      color: definition.visual.color,
      trail: definition.visual.trail,
      glowScale: definition.visual.glowScale,
    });
    if (definition.sfx) {
      host.playSfx(definition.sfx);
    }
    return true;
  }

  private buildGuidance(
    definition: WeaponDefinition,
    turnRateRad: number | undefined,
    targetId: string | null
  ): ProjectileSpawnRequest['guidance'] {
    const spec = definition.projectile;
    if (!spec || !turnRateRad) {
      return undefined;
    }
    if (definition.aimMode === WeaponAimMode.TARGET_LOCKED && targetId) {
      return {
        mode: 'target',
        targetId,
        turnRateRad,
        remainingSec: spec.lifeSec,
      };
    }
    if (definition.aimMode === WeaponAimMode.MOUSE_GUIDED) {
      return {
        mode: 'mouse',
        turnRateRad,
        remainingSec: spec.guidanceSec ?? spec.lifeSec,
        lockRadius: spec.lockRadius,
      };
    }
    return undefined;
  }

  private consumeShotCost(
    host: WeaponSystemHost,
    installed: InstalledWeaponState,
    definition: WeaponDefinition,
    now: number
  ): boolean {
    if (definition.ammo) {
      const available = installed.ammoCurrent ?? 0;
      if (available < definition.ammo.perShot) {
        this.warn(host, 'SIN MUNICIÓN', now);
        return false;
      }
      installed.ammoCurrent = available - definition.ammo.perShot;
      return true;
    }
    const cost = definition.voidEnergyCostPerShot ?? 0;
    if (cost > 0 && !host.consumeVoidEnergy(cost)) {
      this.warn(host, 'SIN ENERGÍA DEL VACÍO', now);
      return false;
    }
    return true;
  }

  private buildAmmoLabel(installed: InstalledWeaponState, definition: WeaponDefinition | null): string | null {
    if (!definition) {
      return null;
    }
    if (definition.ammo) {
      return `${installed.ammoCurrent ?? 0}/${definition.ammo.max}`;
    }
    return definition.voidEnergyCostPerShot ? `${definition.voidEnergyCostPerShot}∅` : '∞';
  }

  private warn(host: WeaponSystemHost, message: string, now: number): void {
    if (now - this.lastWarningAtMs < WARNING_THROTTLE_MS) {
      return;
    }
    this.lastWarningAtMs = now;
    host.emitWarning(message);
  }

  private findFreeSlot(): number {
    for (let slot = 0; slot < this.outfit.weaponSlots; slot++) {
      if (!this.outfit.weapons.some(w => w.slotIndex === slot)) {
        return slot;
      }
    }
    return -1;
  }

  private clampSelection(index: number, total: number): number {
    if (total <= 0) {
      return -1;
    }
    if (!Number.isFinite(index) || index < 0) {
      return 0;
    }
    return Math.min(Math.floor(index), total - 1);
  }
}
