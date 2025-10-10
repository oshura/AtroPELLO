/**
 * Detector de Targets - Sistema de Raycast 3D→2D
 * FASE 1: Core Targeting System
 */

import { Injectable } from '@angular/core';
import { ITargetable } from '../../types/targeting.types';
import { 
  ITargetDetector, 
  RaycastHit, 
  ScreenPosition,
  TargetingSystemConfig 
} from '../types/reticle.types';
import { Camera } from '../../Camera';
import { WebGLService } from '../../../services/webgl.service';

@Injectable({
  providedIn: 'root'
})
export class TargetDetector implements ITargetDetector {
  private camera: Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private availableTargets: ITargetable[] = [];
  private config: TargetingSystemConfig['detection'];
  
  constructor(private webglService: WebGLService) {
    this.config = {
      maxDistance: 1000,
      raycastPrecision: 0.1,
      targetTypes: ['asteroid', 'spaceship', 'planet', 'portal']
    };
  }

  /**
   * Inicializa el detector con cámara y canvas
   */
  public initialize(camera: Camera): void {
    this.camera = camera;
    this.canvas = this.webglService.getCanvas() || null;
    
    console.log('🎯 TargetDetector inicializado', {
      camera: !!this.camera,
      canvas: !!this.canvas
    });
  }

  /**
   * Actualiza la lista de targets disponibles
   */
  public updateAvailableTargets(targets: ITargetable[]): void {
    this.availableTargets = targets.filter(target => 
      this.config.targetTypes.includes(target.getTargetType())
    );
  }

  /**
   * Detecta targets en una posición de pantalla usando raycast
   */
  public detectTargetAt(screenPos: ScreenPosition): RaycastHit | null {
    if (!this.camera || !this.canvas) {
      console.warn('❌ TargetDetector: Camera o Canvas no inicializados');
      return null;
    }

    // Convertir coordenadas de pantalla a mundo
    const worldRay = this.screenToWorldRay(screenPos);
    if (!worldRay) return null;

    let closestHit: RaycastHit | null = null;
    let minDistance = Infinity;

    // Probar intersección con cada target visible
    for (const target of this.availableTargets) {
      if (!this.isInViewFrustum(target)) continue;

      const hit = this.raycastToTarget(worldRay, target);
      if (hit && hit.distance < minDistance && hit.distance <= this.config.maxDistance) {
        minDistance = hit.distance;
        closestHit = hit;
      }
    }

    return closestHit;
  }

  /**
   * Obtiene todos los targets visibles en pantalla
   */
  public getVisibleTargets(): ITargetable[] {
    return this.availableTargets.filter(target => this.isInViewFrustum(target));
  }

  /**
   * Verifica si un target está en el frustum de la cámara
   */
  public isInViewFrustum(target: ITargetable): boolean {
    if (!this.camera || !this.canvas) return false;

    const screenPos = this.worldToScreen(target.position);
    if (!screenPos) return false;

    // Verificar que está dentro de los límites de pantalla
    return (
      screenPos.x >= 0 && 
      screenPos.x <= this.canvas.width &&
      screenPos.y >= 0 && 
      screenPos.y <= this.canvas.height
    );
  }

  /**
   * Convierte coordenadas de pantalla a rayo en espacio mundial
   */
  private screenToWorldRay(screenPos: ScreenPosition): { origin: any; direction: any } | null {
    if (!this.camera || !this.canvas) return null;

    // Normalizar coordenadas de pantalla a NDC (-1 a 1)
    const x = (2.0 * screenPos.x) / this.canvas.width - 1.0;
    const y = 1.0 - (2.0 * screenPos.y) / this.canvas.height;

    // Crear matrices de transformación
    const projMatrix = this.camera.projectionMatrix;
    const viewMatrix = this.camera.viewMatrix;
    
    // Calcular matriz inversa view-projection
    const vpMatrix = this.multiplyMatrices(projMatrix, viewMatrix);
    const invVpMatrix = this.invertMatrix(vpMatrix);

    if (!invVpMatrix) return null;

    // Puntos en near y far plane
    const nearPoint = this.transformVector(invVpMatrix, [x, y, -1.0, 1.0]);
    const farPoint = this.transformVector(invVpMatrix, [x, y, 1.0, 1.0]);

    // Dividir por w para obtener coordenadas homogéneas
    nearPoint[0] /= nearPoint[3];
    nearPoint[1] /= nearPoint[3];
    nearPoint[2] /= nearPoint[3];
    
    farPoint[0] /= farPoint[3];
    farPoint[1] /= farPoint[3];
    farPoint[2] /= farPoint[3];

    // Calcular dirección del rayo
    const direction = {
      x: farPoint[0] - nearPoint[0],
      y: farPoint[1] - nearPoint[1],
      z: farPoint[2] - nearPoint[2]
    };

    // Normalizar dirección
    const length = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    direction.x /= length;
    direction.y /= length;
    direction.z /= length;

    return {
      origin: { x: nearPoint[0], y: nearPoint[1], z: nearPoint[2] },
      direction
    };
  }

  /**
   * Convierte posición mundial a coordenadas de pantalla
   */
  private worldToScreen(worldPos: { x: number; y: number; z: number }): ScreenPosition | null {
    if (!this.camera || !this.canvas) return null;

    const projMatrix = this.camera.projectionMatrix;
    const viewMatrix = this.camera.viewMatrix;
    const vpMatrix = this.multiplyMatrices(projMatrix, viewMatrix);

    // Transformar posición mundial a clip space
    const clipPos = this.transformVector(vpMatrix, [worldPos.x, worldPos.y, worldPos.z, 1.0]);
    
    // Verificar que está delante de la cámara
    if (clipPos[3] <= 0) return null;

    // Dividir por w
    const ndcX = clipPos[0] / clipPos[3];
    const ndcY = clipPos[1] / clipPos[3];
    
    // Convertir de NDC a coordenadas de pantalla
    const screenX = (ndcX + 1.0) * this.canvas.width * 0.5;
    const screenY = (1.0 - ndcY) * this.canvas.height * 0.5;

    return { x: screenX, y: screenY };
  }

  /**
   * Calcula intersección rayo-esfera para un target
   */
  private raycastToTarget(ray: any, target: ITargetable): RaycastHit | null {
    // Asumir que todos los targets son esferas por simplicidad
    const radius = (target as any).radius || 10; // Default radius

    // Vector del origen del rayo al centro de la esfera
    const oc = {
      x: ray.origin.x - target.position.x,
      y: ray.origin.y - target.position.y,
      z: ray.origin.z - target.position.z
    };

    // Coeficientes de la ecuación cuadrática
    const a = ray.direction.x ** 2 + ray.direction.y ** 2 + ray.direction.z ** 2;
    const b = 2.0 * (oc.x * ray.direction.x + oc.y * ray.direction.y + oc.z * ray.direction.z);
    const c = oc.x ** 2 + oc.y ** 2 + oc.z ** 2 - radius ** 2;

    // Discriminante
    const discriminant = b ** 2 - 4 * a * c;
    
    if (discriminant < 0) return null; // No hay intersección

    // Distancia al punto de intersección más cercano
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    
    if (t < 0) return null; // Intersección detrás del origen

    // Punto de intersección
    const hitPoint = {
      x: ray.origin.x + t * ray.direction.x,
      y: ray.origin.y + t * ray.direction.y,
      z: ray.origin.z + t * ray.direction.z
    };

    // Normal en el punto de intersección
    const normal = {
      x: (hitPoint.x - target.position.x) / radius,
      y: (hitPoint.y - target.position.y) / radius,
      z: (hitPoint.z - target.position.z) / radius
    };

    // Convertir punto de hit a coordenadas de pantalla
    const screenPosition = this.worldToScreen(hitPoint);
    if (!screenPosition) return null;

    return {
      target,
      distance: t,
      screenPosition,
      worldPosition: hitPoint,
      normal
    };
  }

  // ===============================
  // UTILIDADES MATEMÁTICAS
  // ===============================

  private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
    const result = new Float32Array(16);
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    
    return result;
  }

  private invertMatrix(mat: Float32Array): Float32Array | null {
    const inv = new Float32Array(16);
    const m = mat;

    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + 
             m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    
    // ... (implementación completa de inversión de matriz 4x4)
    // Por simplicidad, usar aproximación o biblioteca matemática
    
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    
    if (det === 0) return null;
    
    det = 1.0 / det;
    
    for (let i = 0; i < 16; i++) {
      inv[i] = inv[i] * det;
    }
    
    return inv;
  }

  private transformVector(matrix: Float32Array, vector: number[]): number[] {
    return [
      matrix[0] * vector[0] + matrix[4] * vector[1] + matrix[8] * vector[2] + matrix[12] * vector[3],
      matrix[1] * vector[0] + matrix[5] * vector[1] + matrix[9] * vector[2] + matrix[13] * vector[3],
      matrix[2] * vector[0] + matrix[6] * vector[1] + matrix[10] * vector[2] + matrix[14] * vector[3],
      matrix[3] * vector[0] + matrix[7] * vector[1] + matrix[11] * vector[2] + matrix[15] * vector[3]
    ];
  }

  /**
   * Actualiza configuración del detector
   */
  public updateConfig(newConfig: Partial<TargetingSystemConfig['detection']>): void {
    this.config = { ...this.config, ...newConfig };
  }
}