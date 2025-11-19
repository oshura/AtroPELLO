import { Injectable } from '@angular/core';
import { Vector3 } from '../../../types/game.types';
import { Asteroid } from '../../game-objects/Asteroid';
import { SuperAsteroid } from '../../game-objects/SuperAsteroid';

@Injectable({ providedIn: 'root' })
export class AsteroidFactoryService {
  /** Crea un asteroide con dirección/velocidad comunes del cluster y rotación lenta */
  createAsteroid(
    id: string,
    position: Vector3,
    direction: Vector3,
    speed: number,
    opts?: { size?: number; massTons?: number; rotationScale?: number; composition?: string }
  ): Asteroid {
  // Duplicar el tamaño base de los asteroides
  const size = (opts?.size ?? (0.5 + Math.random() * 1.5)) * 2;
  const a = new Asteroid(id, position, size, { ...direction });
    // Dirección/velocidad del cluster
    a.direction = { ...direction };
    a.driftSpeed = speed;
    a.velocity = { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed };
    // Rotación más lenta
  // Acelerar ligeramente la rotación para que sea más perceptible en pantalla
  const rotScale = opts?.rotationScale ?? 0.4;
    a.rotationRate = {
      x: a.rotationRate.x * rotScale,
      y: a.rotationRate.y * rotScale,
      z: a.rotationRate.z * rotScale
    };
    a.angularVelocity = { ...a.rotationRate };
    // Composición y propiedades físicas visibles
  (a as any).composition = opts?.composition ?? 'mixed';
    // Masa (50..150 tons)
    (a as any).massTons = opts?.massTons ?? (50 + Math.floor(Math.random() * 101));
    // Void mass 2..5u para asteroide normal
    (a as any).voidMassUnits = 2 + Math.floor(Math.random() * 4);
    // Albedo eliminado
    return a;
  }

  /** Crea un superasteroide 4..6x tamaño con misma física del cluster */
  createSuperAsteroid(
    id: string,
    position: Vector3,
    direction: Vector3,
    speed: number,
    opts?: { baseSize?: number; sizeMultiplierRange?: [number, number]; massMultiplierRange?: [number, number]; rotationScale?: number; composition?: string }
  ): SuperAsteroid {
  // Duplicar el tamaño base del superasteroide antes de aplicar multiplicador
  const baseSize = (opts?.baseSize ?? (0.5 + Math.random() * 1.5)) * 2;
  const [minMul, maxMul] = opts?.sizeMultiplierRange ?? [4, 6];
    const sizeMul = minMul + Math.random() * (maxMul - minMul);
  const sa = new SuperAsteroid(id, position, baseSize * sizeMul, { ...direction });
    sa.direction = { ...direction };
    sa.driftSpeed = speed;
    sa.velocity = { x: direction.x * speed, y: direction.y * speed, z: direction.z * speed };
  // Super-asteroides: rotación también visible pero algo más lenta que los normales
  const rotScale = opts?.rotationScale ?? 0.35; // antes 0.1
    sa.rotationRate = {
      x: sa.rotationRate.x * rotScale,
      y: sa.rotationRate.y * rotScale,
      z: sa.rotationRate.z * rotScale
    };
    sa.angularVelocity = { ...sa.rotationRate };
    // Composición y propiedades físicas visibles
  (sa as any).composition = opts?.composition ?? 'mixed';
    // Masa super (500..1000 tons)
    (sa as any).massTons = 500 + Math.floor(Math.random() * 501);
    // Void mass 10..20u para super (doble del rango anterior 5..10)
    (sa as any).voidMassUnits = 10 + Math.floor(Math.random() * 11);
    // Albedo eliminado
    return sa;
  }
}
