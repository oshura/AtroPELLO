/**
 * Definición local de Vector3 para evitar problemas de importación
 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Interfaz para objetos que pueden ser targets del sistema de navegación
 */
export interface ITargetable {
  id: string;
  position: Vector3;
  getDisplayName(): string;
  getTargetType(): TargetType;
  isActive(): boolean;
  // Salud actual y máxima (opcional). Si no existen, se asume full health.
  healthCurrent: number;
  healthMax: number;
}

/**
 * Tipos de targets disponibles
 */
export enum TargetType {
  ASTEROID = 'asteroid',
  MEGA_ASTEROID = 'mega_asteroid',
  SUPER_ASTEROID = 'super_asteroid',
  CLUSTER = 'cluster',
  SPACESHIP = 'spaceship', 
  PLANET = 'planet',
  PORTAL = 'portal',
  WAYPOINT = 'waypoint',
  UNKNOWN = 'unknown'
}

/**
 * Información de targeting para la brújula
 */
export interface TargetInfo {
  target: ITargetable;
  distance: number;
  bearing: number; // Ángulo en grados (0-360)
  elevation: number; // Ángulo vertical
}

/**
 * Sistema de gestión de targets
 */
export class TargetingSystem {
  private currentTarget: ITargetable | null = null;
  private availableTargets: ITargetable[] = [];

  public setTarget(target: ITargetable | null): void {
    this.currentTarget = target;
  }

  public getCurrentTarget(): ITargetable | null {
    return this.currentTarget;
  }

  public addAvailableTarget(target: ITargetable): void {
    if (!this.availableTargets.find(t => t.id === target.id)) {
      this.availableTargets.push(target);
    }
  }

  public removeAvailableTarget(targetId: string): void {
    this.availableTargets = this.availableTargets.filter(t => t.id !== targetId);
    
    // Si se eliminó el target actual, limpiar
    if (this.currentTarget && this.currentTarget.id === targetId) {
      this.currentTarget = null;
    }
  }

  public getAvailableTargets(): ITargetable[] {
    return [...this.availableTargets];
  }

  public getTargetInfo(playerPosition: Vector3): TargetInfo | null {
    if (!this.currentTarget) return null;

    const targetPos = this.currentTarget.position;
    const dx = targetPos.x - playerPosition.x;
    const dy = targetPos.y - playerPosition.y; 
    const dz = targetPos.z - playerPosition.z;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const bearing = (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
    const elevation = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 180 / Math.PI;

    return {
      target: this.currentTarget,
      distance,
      bearing,
      elevation
    };
  }
}