import { Injectable } from '@angular/core';
import { CollisionPhysicsService, Vector3D } from './collision-physics.service';
import { CollisionResponseService, CollisionResponse } from './collision-response.service';
import { GameObject } from '../../GameObject';
import { GameObjectSize } from '../../types/game-object.types';
import { LoggingService, LogLevel, LogCategory } from '../../../services/logging.service';

/**
 * Resultado completo de una colisión gestionada
 */
export interface ManagedCollisionResult {
  /** Nueva posición del objeto móvil (nave) */
  newPosition: Vector3D;
  /** Nueva velocidad del objeto móvil (nave) */
  newVelocity: Vector3D;
  /** Nueva velocidad del objetivo (si aplica) */
  targetNewVelocity?: Vector3D;
  /** Si el objetivo debe ser eyectado de su cluster */
  shouldEject: boolean;
  /** Magnitud del impulso aplicado */
  impulseMagnitude: number;
  /** Tipo de colisión procesada */
  collisionType: 'small-movable' | 'large-immovable' | 'massive-slide' | 'ethereal';
}

/**
 * CollisionManager - Servicio coordinador de colisiones
 * 
 * Responsabilidades:
 * - Detectar tipo de colisión basado en tamaño de objetos
 * - Calcular velocidad efectiva para asteroides de cluster
 * - Coordinar servicios de física y respuesta
 * - Determinar eyección de clusters
 * - Logging unificado de colisiones
 * 
 * Principios Clean Code:
 * - Single Responsibility: Solo coordina colisiones
 * - Dependency Injection: Usa servicios especializados
 * - Open/Closed: Fácil añadir nuevos tipos de colisión
 */
@Injectable({
  providedIn: 'root'
})
export class CollisionManagerService {
  
  constructor(
    private collisionPhysics: CollisionPhysicsService,
    private collisionResponse: CollisionResponseService,
    private logger: LoggingService
  ) {}
  
  /**
   * Maneja una colisión entre dos objetos
   * 
   * @param ship Objeto móvil (típicamente la nave)
   * @param target Objeto objetivo
   * @param isTargetClusterMember Si el objetivo pertenece a un cluster
   * @returns Resultado completo de la colisión
   */
  handleCollision(
    ship: GameObject,
    target: GameObject,
    isTargetClusterMember: boolean
  ): ManagedCollisionResult {
    
    const targetSize = target.getPhysicsSize();
    
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🎯 Collision detected', {
      shipId: ship.id,
      targetId: target.id,
      targetSize,
      targetType: target.getType(),
      isClusterMember: isTargetClusterMember
    });
    
    // Clasificar tipo de colisión por tamaño
    switch (targetSize) {
      case GameObjectSize.SMALL:
        return this.handleSmallObjectCollision(ship, target, isTargetClusterMember);
      
      case GameObjectSize.MEDIUM:
      case GameObjectSize.LARGE:
        return this.handleLargeObjectCollision(ship, target);
      
      case GameObjectSize.MASSIVE:
        return this.handleMassiveObjectCollision(ship, target);
      
      case GameObjectSize.ETHEREAL:
        return this.handleEtherealCollision(ship, target);
      
      default:
        return this.handleSmallObjectCollision(ship, target, isTargetClusterMember);
    }
  }
  
  /**
   * Maneja colisión con objeto pequeño (asteroides, clusters)
   * Aplica física completa 3D inelástica
   */
  private handleSmallObjectCollision(
    ship: GameObject,
    target: GameObject,
    isClusterMember: boolean
  ): ManagedCollisionResult {
    
    // Calcular velocidad efectiva del target
    const targetVelocity = this.calculateEffectiveVelocity(ship, target, isClusterMember);
    
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '🔧 Velocity calculation', {
      targetId: target.id,
      isClusterMember,
      velocityUsed: `(${targetVelocity.x.toFixed(2)}, ${targetVelocity.y.toFixed(2)}, ${targetVelocity.z.toFixed(2)})`
    });
    
    // Calcular respuesta física
    const response = this.collisionResponse.calculateShipCollisionResponse(
      {
        position: ship.position,
        velocity: ship.velocity,
        boundingSphere: ship.boundingSphere!
      },
      {
        position: target.position,
        velocity: targetVelocity,
        boundingSphere: target.boundingSphere!,
        id: target.id
      },
      target.constructor.name // Legacy: aún necesita class name
    );
    
    this.logger.log(LogLevel.INFO, LogCategory.COLLISION_PHYSICS, '📊 Physics response calculated', {
      targetId: target.id,
      newVelocity: response.targetNewVelocity ? 
        `(${response.targetNewVelocity.x.toFixed(2)}, ${response.targetNewVelocity.y.toFixed(2)}, ${response.targetNewVelocity.z.toFixed(2)})` : 'null',
      shouldEject: response.targetEjected,
      impulseMagnitude: response.impulseMagnitude.toFixed(2)
    });
    
    return {
      newPosition: response.newPosition,
      newVelocity: response.newVelocity,
      targetNewVelocity: response.targetNewVelocity,
      shouldEject: response.targetEjected,
      impulseMagnitude: response.impulseMagnitude,
      collisionType: 'small-movable'
    };
  }
  
  /**
   * Maneja colisión con objeto grande (super/mega asteroides)
   * Aplica slide suave
   */
  private handleLargeObjectCollision(
    ship: GameObject,
    target: GameObject
  ): ManagedCollisionResult {
    
    const response = this.collisionResponse.calculateImmovableObjectResponse(
      {
        position: ship.position,
        velocity: ship.velocity,
        boundingSphere: ship.boundingSphere!
      },
      {
        position: target.position,
        boundingSphere: target.boundingSphere!
      }
    );
    
    return {
      newPosition: ship.position, // Slide se maneja externamente
      newVelocity: response.newVelocity,
      shouldEject: false,
      impulseMagnitude: 0,
      collisionType: 'large-immovable'
    };
  }
  
  /**
   * Maneja colisión con objeto masivo (planetas, sol)
   * Aplica slide suave
   */
  private handleMassiveObjectCollision(
    ship: GameObject,
    target: GameObject
  ): ManagedCollisionResult {
    
    const response = this.collisionResponse.calculateImmovableObjectResponse(
      {
        position: ship.position,
        velocity: ship.velocity,
        boundingSphere: ship.boundingSphere!
      },
      {
        position: target.position,
        boundingSphere: target.boundingSphere!
      }
    );
    
    return {
      newPosition: ship.position, // Slide se maneja externamente
      newVelocity: response.newVelocity,
      shouldEject: false,
      impulseMagnitude: 0,
      collisionType: 'massive-slide'
    };
  }
  
  /**
   * Maneja colisión con objeto etéreo (portales)
   * Sin física
   */
  private handleEtherealCollision(
    ship: GameObject,
    target: GameObject
  ): ManagedCollisionResult {
    
    return {
      newPosition: ship.position,
      newVelocity: ship.velocity,
      shouldEject: false,
      impulseMagnitude: 0,
      collisionType: 'ethereal'
    };
  }
  
  /**
   * Calcula la velocidad efectiva del target para física
   * 
   * Para asteroides de cluster:
   * - Si se acercan a la nave: usa velocidad real del cluster
   * - Si la nave los impacta: usa velocidad cero (estáticos relativos)
   */
  private calculateEffectiveVelocity(
    ship: GameObject,
    target: GameObject,
    isClusterMember: boolean
  ): Vector3D {
    
    if (!isClusterMember) {
      // Asteroides independientes/efímeros: velocidad real
      return { ...target.velocity };
    }
    
    // Calcular approach speed (velocidad de acercamiento del asteroide)
    const dx = ship.position.x - target.position.x;
    const dy = ship.position.y - target.position.y;
    const dz = ship.position.z - target.position.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const normal = { x: dx / dist, y: dy / dist, z: dz / dist };
    
    // Velocidad del asteroide en el cluster
    const asteroidVel = target.velocity;
    
    // Componente de velocidad del asteroide hacia la nave
    const approachSpeed = -(
      asteroidVel.x * normal.x + 
      asteroidVel.y * normal.y + 
      asteroidVel.z * normal.z
    );
    
    // Si se acerca (approachSpeed > threshold), usar velocidad real
    // Si no, usar velocidad cero (nave impactó asteroide estático)
    if (approachSpeed > 0.01) {
      return { ...asteroidVel };
    } else {
      return { x: 0, y: 0, z: 0 };
    }
  }
}
