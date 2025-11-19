import { Injectable } from '@angular/core';
import { CollisionPhysicsService, CollisionInput, Vector3D } from './collision-physics.service';
import { GameLogger } from '../../utils/GameLogger';
import { LogLevel, LogCategory } from '../../../services/logging.service';

/**
 * Configuración de colisión para diferentes tipos de objetos
 */
export interface CollisionConfig {
  /** Coeficiente de restitución (0 = inelástico, 1 = elástico) */
  restitution: number;
  /** Masa efectiva del objeto */
  mass: number;
  /** Si true, el objeto es inamovible (masa infinita) */
  immovable?: boolean;
}

/**
 * Resultado de aplicar una respuesta de colisión
 */
export interface CollisionResponse {
  /** Nueva posición del objeto móvil (después de separación) */
  newPosition: Vector3D;
  /** Nueva velocidad del objeto móvil */
  newVelocity: Vector3D;
  /** Nueva velocidad del objeto impactado (si es móvil) */
  targetNewVelocity?: Vector3D;
  /** Magnitud del impulso transferido */
  impulseMagnitude: number;
  /** Si el objeto objetivo fue eyectado de su cluster */
  targetEjected: boolean;
}

/**
 * Servicio de respuesta a colisiones
 * 
 * Responsabilidades:
 * - Determinar configuración física según tipo de objeto
 * - Aplicar física de colisión usando CollisionPhysicsService
 * - Gestionar casos especiales (objetos inmóviles, clusters, etc.)
 * - Logging de eventos de colisión
 * 
 * Principios de Clean Code:
 * - Single Responsibility: solo gestiona respuestas a colisiones
 * - Dependency Injection: usa CollisionPhysicsService para cálculos
 * - Open/Closed: fácil añadir nuevos tipos sin modificar lógica core
 */
@Injectable({
  providedIn: 'root'
})
export class CollisionResponseService {
  
  constructor(
    private collisionPhysics: CollisionPhysicsService
  ) {}
  
  /**
   * Calcula y aplica la respuesta física a una colisión entre nave y objeto
   * 
   * @param ship Datos de la nave (posición, velocidad, bounding sphere)
   * @param target Objeto objetivo (posición, velocidad, bounding sphere, tipo)
   * @param objectType Tipo de objeto ('Asteroid', 'SuperAsteroid', 'Planet', etc.)
   * @returns Respuesta con nuevas posiciones y velocidades
   */
  calculateShipCollisionResponse(
    ship: { position: Vector3D; velocity: Vector3D; boundingSphere: { radius: number } },
    target: { 
      position: Vector3D; 
      velocity?: Vector3D; 
      boundingSphere?: { radius: number };
      id?: string;
    },
    objectType: string
  ): CollisionResponse {
    
    const config = this.getCollisionConfig(objectType);
    const shipMass = 100; // Masa estándar de la nave
    const targetRadius = target.boundingSphere?.radius ?? 10;
    
    // Preparar input para física de colisión
    const input: CollisionInput = {
      position1: { ...ship.position },
      velocity1: { ...ship.velocity },
      mass1: shipMass,
      radius1: ship.boundingSphere.radius,
      
      position2: { ...target.position },
      velocity2: target.velocity ? { ...target.velocity } : { x: 0, y: 0, z: 0 },
      mass2: config.immovable ? 1e10 : config.mass, // Masa "infinita" para objetos inmóviles
      radius2: targetRadius,
      
      restitution: config.restitution
    };
    
    // Calcular física de colisión
    const result = this.collisionPhysics.calculateInelasticCollision(input);
    
    // Aplicar separación a la nave
    const newPosition = {
      x: ship.position.x + result.separationVector.x,
      y: ship.position.y + result.separationVector.y,
      z: ship.position.z + result.separationVector.z
    };
    
    // Logging detallado
    GameLogger.log(LogLevel.DEBUG, LogCategory.GAME_LOOP, 'Collision response calculated', {
      objectType,
      objectId: target.id || 'unknown',
      impulseMagnitude: result.impulseMagnitude.toFixed(2),
      restitution: config.restitution,
      shipOldVel: `(${ship.velocity.x.toFixed(1)}, ${ship.velocity.y.toFixed(1)}, ${ship.velocity.z.toFixed(1)})`,
      shipNewVel: `(${result.velocity1.x.toFixed(1)}, ${result.velocity1.y.toFixed(1)}, ${result.velocity1.z.toFixed(1)})`,
      targetOldVel: target.velocity ? `(${target.velocity.x.toFixed(1)}, ${target.velocity.y.toFixed(1)}, ${target.velocity.z.toFixed(1)})` : 'static',
      targetNewVel: `(${result.velocity2.x.toFixed(1)}, ${result.velocity2.y.toFixed(1)}, ${result.velocity2.z.toFixed(1)})`,
      collisionNormal: `(${result.collisionNormal.x.toFixed(2)}, ${result.collisionNormal.y.toFixed(2)}, ${result.collisionNormal.z.toFixed(2)})`
    });
    
    // Determinar si el objetivo debe ser eyectado de su cluster (asteroides pequeños)
    const shouldEject = this.shouldEjectFromCluster(objectType, result.impulseMagnitude);
    
    return {
      newPosition,
      newVelocity: result.velocity1,
      targetNewVelocity: config.immovable ? undefined : result.velocity2,
      impulseMagnitude: result.impulseMagnitude,
      targetEjected: shouldEject
    };
  }
  
  /**
   * Obtiene la configuración de colisión según el tipo de objeto
   */
  private getCollisionConfig(objectType: string): CollisionConfig {
    switch (objectType) {
      // Asteroides pequeños: muy ligeros, algo elásticos, móviles
      case 'Asteroid':
      case 'ClusterObject':
        return {
          restitution: 0.3, // Colisión semi-inelástica
          mass: 1,          // Muy ligeros
          immovable: false
        };
      
      // Super asteroides: más pesados, menos elásticos, móviles
      case 'SuperAsteroid':
        return {
          restitution: 0.2,
          mass: 10,
          immovable: false
        };
      
      // Mega asteroides: muy pesados, casi inelásticos, móviles pero difíciles de mover
      case 'MegaAsteroid':
        return {
          restitution: 0.1,
          mass: 100,
          immovable: false
        };
      
      // Planetas y objetos masivos: prácticamente inmóviles
      case 'Planet':
      case 'RingedPlanet':
      case 'GaseousPlanet':
      case 'GiantPlanet':
      case 'DwarfPlanet':
      case 'Protoplanet':
      case 'EarthSplitPlanet':
        return {
          restitution: 0.05, // Muy inelástico
          mass: 1e6,         // Masa enorme
          immovable: true    // No se mueven
        };
      
      // Sol: completamente inmóvil
      case 'Sun':
        return {
          restitution: 0.0,
          mass: 1e10,
          immovable: true
        };
      
      // Portales: sin física (etéreos)
      case 'Portal':
        return {
          restitution: 0.0,
          mass: 1,
          immovable: true
        };
      
      // Default: comportamiento conservador
      default:
        GameLogger.log(LogLevel.WARN, LogCategory.GAME_LOOP, 'Unknown object type in collision', { objectType });
        return {
          restitution: 0.2,
          mass: 10,
          immovable: false
        };
    }
  }
  
  /**
   * Determina si un objeto debe ser eyectado de su cluster tras la colisión
   * Solo aplica a asteroides pequeños que reciben impulsos significativos
   */
  private shouldEjectFromCluster(objectType: string, impulseMagnitude: number): boolean {
    const isSmallAsteroid = objectType === 'Asteroid' || objectType === 'ClusterObject';
    const significantImpulse = impulseMagnitude > 2; // Umbral reducido para facilitar eyección
    
    if (isSmallAsteroid) {
      console.log(`[COLLISION_PHYSICS] 📦 Ejection check: impulse=${impulseMagnitude.toFixed(2)}, threshold=2, eject=${significantImpulse}`);
    }
    
    return isSmallAsteroid && significantImpulse;
  }
  
  /**
   * Calcula la respuesta para objetos inmóviles masivos (planetas, sol)
   * La nave rebota pero el objeto no se mueve
   */
  calculateImmovableObjectResponse(
    ship: { position: Vector3D; velocity: Vector3D; boundingSphere: { radius: number } },
    target: { position: Vector3D; boundingSphere?: { radius: number } }
  ): { newPosition: Vector3D; newVelocity: Vector3D; tangentDirection: Vector3D } {
    
    const targetRadius = target.boundingSphere?.radius ?? 200;
    
    // Calcular normal de colisión
    const normal = this.collisionPhysics.normalize({
      x: ship.position.x - target.position.x,
      y: ship.position.y - target.position.y,
      z: ship.position.z - target.position.z
    });
    
    // Separar nave fuera del objeto
    const separationDistance = targetRadius + ship.boundingSphere.radius + 5; // +5 margen
    const newPosition = {
      x: target.position.x + normal.x * separationDistance,
      y: target.position.y + normal.y * separationDistance,
      z: target.position.z + normal.z * separationDistance
    };
    
    // Eliminar componente de velocidad hacia el objeto
    const vDotN = ship.velocity.x * normal.x + ship.velocity.y * normal.y + ship.velocity.z * normal.z;
    const newVelocity = vDotN < 0 ? {
      x: ship.velocity.x - vDotN * normal.x,
      y: ship.velocity.y - vDotN * normal.y,
      z: ship.velocity.z - vDotN * normal.z
    } : { ...ship.velocity };
    
    // Calcular dirección tangente para slide suave (opcional)
    const tangentDirection = {
      x: ship.velocity.x - vDotN * normal.x,
      y: ship.velocity.y - vDotN * normal.y,
      z: ship.velocity.z - vDotN * normal.z
    };
    
    return { newPosition, newVelocity, tangentDirection };
  }
}
