import { Injectable } from '@angular/core';

/**
 * Vector3D simple para cálculos físicos
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Resultado de una colisión inelástica entre dos esferas
 */
export interface InelasticCollisionResult {
  /** Nueva velocidad del objeto 1 después de la colisión */
  velocity1: Vector3D;
  /** Nueva velocidad del objeto 2 después de la colisión */
  velocity2: Vector3D;
  /** Vector de separación para evitar interpenetración */
  separationVector: Vector3D;
  /** Magnitud del impulso transferido */
  impulseMagnitude: number;
  /** Normal de colisión (de 1 hacia 2) */
  collisionNormal: Vector3D;
}

/**
 * Parámetros de entrada para cálculo de colisión
 */
export interface CollisionInput {
  /** Posición del centro de la esfera 1 */
  position1: Vector3D;
  /** Velocidad de la esfera 1 */
  velocity1: Vector3D;
  /** Masa de la esfera 1 */
  mass1: number;
  /** Radio de la esfera 1 */
  radius1: number;
  
  /** Posición del centro de la esfera 2 */
  position2: Vector3D;
  /** Velocidad de la esfera 2 */
  velocity2: Vector3D;
  /** Masa de la esfera 2 */
  mass2: number;
  /** Radio de la esfera 2 */
  radius2: number;
  
  /** Coeficiente de restitución (0 = totalmente inelástico, 1 = elástico perfecto) */
  restitution?: number;
}

/**
 * Servicio de física de colisiones
 * 
 * Implementa colisiones realistas entre esferas en 3D usando:
 * - Conservación de momento lineal
 * - Impulsos según normal de colisión
 * - Coeficiente de restitución configurable
 * 
 * Física implementada:
 * 1. Normal de colisión: n = (p2 - p1) / |p2 - p1|
 * 2. Velocidad relativa: v_rel = v1 - v2
 * 3. Velocidad relativa normal: v_rel_n = v_rel · n
 * 4. Si v_rel_n > 0, no hay colisión (alejándose)
 * 5. Impulso: j = -(1 + e) * v_rel_n / (1/m1 + 1/m2)
 * 6. Cambio velocidad: Δv1 = -j*n/m1, Δv2 = j*n/m2
 */
@Injectable({
  providedIn: 'root'
})
export class CollisionPhysicsService {
  private _collisionLogCount = 0; // Throttle logs
  
  /**
   * Calcula el resultado de una colisión inelástica entre dos esferas
   * 
   * @param input Parámetros de la colisión
   * @returns Resultado con nuevas velocidades y vector de separación
   */
  calculateInelasticCollision(input: CollisionInput): InelasticCollisionResult {
    const { position1, velocity1, mass1, radius1, position2, velocity2, mass2, radius2 } = input;
    const restitution = input.restitution ?? 0.0; // Por defecto totalmente inelástico
    
    // Log de entrada (solo primeras 10 colisiones)
    if (!this._collisionLogCount) this._collisionLogCount = 0;
    if (this._collisionLogCount < 10) {
      console.log('[COLLISION_PHYSICS] 🔬 calculateInelasticCollision INPUT:', {
        v1: `(${velocity1.x.toFixed(2)}, ${velocity1.y.toFixed(2)}, ${velocity1.z.toFixed(2)})`,
        v2: `(${velocity2.x.toFixed(2)}, ${velocity2.y.toFixed(2)}, ${velocity2.z.toFixed(2)})`,
        mass1,
        mass2,
        restitution
      });
      this._collisionLogCount++;
    }
    
    // 1. Calcular normal de colisión (de objeto 1 hacia objeto 2)
    const normal = this.calculateNormal(position1, position2);
    
    // 2. Calcular velocidad relativa (v1 - v2)
    const relativeVelocity = this.subtract(velocity1, velocity2);
    
    // 3. Componente de velocidad relativa en dirección de la normal
    const relativeVelocityNormal = this.dot(relativeVelocity, normal);
    
    // 4. Si los objetos se están separando (velocidad relativa negativa), no aplicar impulso
    // Normal apunta de obj1 hacia obj2, entonces:
    // - Si v_rel·n < 0: objetos se alejan → no aplicar impulso
    // - Si v_rel·n > 0: objetos se acercan → APLICAR impulso
    if (relativeVelocityNormal < 0) {
      // Ya se están alejando, solo separar posiciones
      if (this._collisionLogCount <= 10) {
        console.log('[COLLISION_PHYSICS] ⚠️ Objects SEPARATING - no impulse applied', {
          relativeVelocityNormal: relativeVelocityNormal.toFixed(4),
          relativeVel: `(${relativeVelocity.x.toFixed(2)}, ${relativeVelocity.y.toFixed(2)}, ${relativeVelocity.z.toFixed(2)})`,
          normal: `(${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`
        });
      }
      const separationVector = this.calculateSeparation(position1, position2, radius1, radius2);
      return {
        velocity1: { ...velocity1 },
        velocity2: { ...velocity2 },
        separationVector,
        impulseMagnitude: 0,
        collisionNormal: normal
      };
    }
    
    // 5. Calcular magnitud del impulso usando conservación de momento
    // j = -(1 + e) * v_rel·n / (1/m1 + 1/m2)
    const impulseMagnitude = -(1 + restitution) * relativeVelocityNormal / (1/mass1 + 1/mass2);
    
    if (this._collisionLogCount <= 10) {
      console.log('[COLLISION_PHYSICS] ✅ IMPULSE CALCULATED', {
        relativeVelocityNormal: relativeVelocityNormal.toFixed(4),
        impulseMagnitude: impulseMagnitude.toFixed(4),
        restitution
      });
    }
    
    // 6. Aplicar impulso a ambos objetos
    // Δv1 = -j*n/m1 (nave recibe impulso opuesto a la normal - retrocede)
    // Δv2 = -j*n/m2 (asteroide recibe impulso en dirección OPUESTA a la normal - sale despedido)
    // Nota: Como j es negativo, -j es positivo, así que el asteroide sale EN dirección de la normal (alejándose)
    const newVelocity1 = {
      x: velocity1.x - (impulseMagnitude * normal.x) / mass1,
      y: velocity1.y - (impulseMagnitude * normal.y) / mass1,
      z: velocity1.z - (impulseMagnitude * normal.z) / mass1
    };
    
    const newVelocity2 = {
      x: velocity2.x - (impulseMagnitude * normal.x) / mass2,  // Cambiado de + a -
      y: velocity2.y - (impulseMagnitude * normal.y) / mass2,  // Cambiado de + a -
      z: velocity2.z - (impulseMagnitude * normal.z) / mass2   // Cambiado de + a -
    };
    
    // 7. Calcular vector de separación para resolver interpenetración
    const separationVector = this.calculateSeparation(position1, position2, radius1, radius2);
    
    return {
      velocity1: newVelocity1,
      velocity2: newVelocity2,
      separationVector,
      impulseMagnitude: Math.abs(impulseMagnitude),
      collisionNormal: normal
    };
  }
  
  /**
   * Calcula la normal de colisión normalizada (de p1 hacia p2)
   */
  private calculateNormal(p1: Vector3D, p2: Vector3D): Vector3D {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dy, dz) || 1; // Evitar división por cero
    
    return {
      x: dx / length,
      y: dy / length,
      z: dz / length
    };
  }
  
  /**
   * Calcula el vector de separación necesario para resolver interpenetración
   * Retorna el vector que debe sumarse a la posición del objeto 1
   */
  private calculateSeparation(p1: Vector3D, p2: Vector3D, r1: number, r2: number): Vector3D {
    const normal = this.calculateNormal(p1, p2);
    const distance = this.distance(p1, p2);
    const overlap = (r1 + r2) - distance;
    
    // Si hay overlap, separar proporcionalmente (objeto 1 retrocede)
    if (overlap > 0) {
      // Añadir margen pequeño para evitar re-colisión inmediata
      const separationMagnitude = overlap + 0.1;
      return {
        x: -normal.x * separationMagnitude,
        y: -normal.y * separationMagnitude,
        z: -normal.z * separationMagnitude
      };
    }
    
    return { x: 0, y: 0, z: 0 };
  }
  
  /**
   * Calcula la distancia euclidiana entre dos puntos
   */
  private distance(p1: Vector3D, p2: Vector3D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.hypot(dx, dy, dz);
  }
  
  /**
   * Producto punto entre dos vectores
   */
  private dot(v1: Vector3D, v2: Vector3D): number {
    return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  }
  
  /**
   * Resta de vectores (v1 - v2)
   */
  private subtract(v1: Vector3D, v2: Vector3D): Vector3D {
    return {
      x: v1.x - v2.x,
      y: v1.y - v2.y,
      z: v1.z - v2.z
    };
  }
  
  /**
   * Magnitud (longitud) de un vector
   */
  magnitude(v: Vector3D): number {
    return Math.hypot(v.x, v.y, v.z);
  }
  
  /**
   * Normaliza un vector (longitud = 1)
   */
  normalize(v: Vector3D): Vector3D {
    const mag = this.magnitude(v) || 1;
    return {
      x: v.x / mag,
      y: v.y / mag,
      z: v.z / mag
    };
  }
}
