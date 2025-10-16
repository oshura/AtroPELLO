import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { Asteroid } from '../../Asteroid';
import { SuperAsteroid } from '../../SuperAsteroid';

@Injectable({ providedIn: 'root' })
export class AsteroidFactoryService {
  /** Crea un asteroide con dirección/velocidad comunes del cluster y rotación lenta */
  createAsteroid(
    id: string,
    position: Vector3,
    direction: Vector3,
    speed: number,
    opts?: { size?: number; massTons?: number; rotationScale?: number }
  ): Asteroid {
    const size = opts?.size ?? (0.5 + Math.random() * 1.5);
    const a = new Asteroid(id, position, size, { ...direction });
    // Dirección/velocidad del cluster
    a.direction = { ...direction };
    a.driftSpeed = speed;
    a.velocity = { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed };
    // Rotación más lenta
    const rotScale = opts?.rotationScale ?? 0.2;
    a.rotationRate = {
      x: a.rotationRate.x * rotScale,
      y: a.rotationRate.y * rotScale,
      z: a.rotationRate.z * rotScale
    };
    a.angularVelocity = { ...a.rotationRate };
    // Masa
    (a as any).massTons = opts?.massTons ?? (10 + Math.floor(Math.random() * 21)); // 10..30
    return a;
  }

  /** Crea un superasteroide 4..6x tamaño con misma física del cluster */
  createSuperAsteroid(
    id: string,
    position: Vector3,
    direction: Vector3,
    speed: number,
    opts?: { baseSize?: number; sizeMultiplierRange?: [number, number]; massMultiplierRange?: [number, number]; rotationScale?: number }
  ): SuperAsteroid {
  const baseSize = opts?.baseSize ?? (0.5 + Math.random() * 1.5);
  const [minMul, maxMul] = opts?.sizeMultiplierRange ?? [4, 6];
    const sizeMul = minMul + Math.random() * (maxMul - minMul);
    const sa = new SuperAsteroid(id, position, baseSize * sizeMul, { ...direction });
    sa.direction = { ...direction };
    sa.driftSpeed = speed;
    sa.velocity = { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed };
    const rotScale = opts?.rotationScale ?? 0.1; // aún más lento en super
    sa.rotationRate = {
      x: sa.rotationRate.x * rotScale,
      y: sa.rotationRate.y * rotScale,
      z: sa.rotationRate.z * rotScale
    };
    sa.angularVelocity = { ...sa.rotationRate };
  // Masa 3..5x de un pequeño
  const [mMin, mMax] = opts?.massMultiplierRange ?? [4, 6];
    const smallMass = 10 + Math.floor(Math.random() * 21);
    (sa as any).massTons = Math.floor(smallMass * (mMin + Math.random() * (mMax - mMin)));
    return sa;
  }
}
