import { Injectable } from '@angular/core';
import { ITargetable, TargetType } from '../types/targeting.types';

export interface AsteroidInfo {
  composition: 'iron' | 'silicate' | 'carbonaceous' | 'nickel' | 'mixed';
  massTons?: number;
  albedo?: number;
}

export interface ShipInfo {
  faction?: string;
  className?: string;
  hullIntegrity?: number;
}

export interface PlanetInfo {
  biome?: string;
  atmosphere?: 'none' | 'thin' | 'standard' | 'dense';
  populationMillions?: number;
}

export type TargetDetails =
  | { type: TargetType.ASTEROID; data: AsteroidInfo }
  | { type: TargetType.SPACESHIP; data: ShipInfo }
  | { type: TargetType.PLANET; data: PlanetInfo }
  | { type: TargetType.UNKNOWN; data: Record<string, unknown> };

@Injectable({ providedIn: 'root' })
export class TargetDetailService {
  async getDetails(target: ITargetable): Promise<TargetDetails> {
    switch (target.getTargetType()) {
      case TargetType.ASTEROID:
        return {
          type: TargetType.ASTEROID,
          data: {
            composition: 'mixed'
          }
        };
      case TargetType.SPACESHIP:
        return {
          type: TargetType.SPACESHIP,
          data: {}
        };
      case TargetType.PLANET:
        return {
          type: TargetType.PLANET,
          data: {}
        };
      default:
        return { type: TargetType.UNKNOWN, data: {} };
    }
  }
}
