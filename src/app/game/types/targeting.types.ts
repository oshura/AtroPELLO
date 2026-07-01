import { Vector3 } from '../../types/game.types';
import { OrientationBasis, calculateRelativeBearing } from '../targeting/compass-direction.util';

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
  SUN = 'sun',
  PORTAL = 'portal',
  SPACE_STATION = 'space_station',
  DOCK_PORT = 'dock_port',
  WAYPOINT = 'waypoint',
  UNKNOWN = 'unknown'
}

/**
 * Información de targeting para la brújula
 */
export interface TargetInfo {
  target: ITargetable;
  distance: number;
  bearing: number; // Ángulo relativo al morro (0=frente, 90=derecha, 270=izquierda)
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

  public getTargetInfo(playerPosition: Vector3, playerOrientation?: OrientationBasis | null): TargetInfo | null {
    if (!this.currentTarget) return null;

    const targetPos = this.currentTarget.position;
    const projection = calculateRelativeBearing(playerPosition, targetPos, playerOrientation);

    return {
      target: this.currentTarget,
      distance: projection.distance,
      bearing: projection.bearing,
      elevation: projection.elevation
    };
  }
}
