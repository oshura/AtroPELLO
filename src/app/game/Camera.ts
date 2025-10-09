import { Vector3 } from '../types/game.types';
import { Spaceship } from './Spaceship';

export enum CameraMode {
  REAR_EXTERNAL = 0,    // Modo por defecto (tecla 0) - Cámara externa trasera fija
  EXTERNAL = 9          // Modo futuro (tecla 9) - por implementar
}

/**
 * Sistema de cámara simplificado con múltiples modos
 * - Modo 0 (REAR_EXTERNAL): Cámara externa trasera fija con zoom
 * - Modo 9 (EXTERNAL): Reservado para implementación futura
 */
export class Camera {
  // Matrices de la cámara
  public viewMatrix: Float32Array = new Float32Array(16);
  public projectionMatrix: Float32Array = new Float32Array(16);
  
  // Configuración de proyección
  public fov: number = 120 * (Math.PI / 180); // 120 grados en radianes
  public aspect: number = 1.0;
  public near: number = 0.1;
  public far: number = 1000.0;
  
  // Sistema de modos de cámara
  private currentMode: CameraMode = CameraMode.REAR_EXTERNAL;
  
  // Configuración de zoom dinámico con rueda del mouse
  private zoomDistance: number = 2.0;
  private minZoom: number = 0.8;
  private maxZoom: number = 8.0;
  private zoomSensitivity: number = 0.2;
  
  // Posición y orientación actuales
  public position: Vector3 = { x: 0, y: 0, z: 0 };
  public target: Vector3 = { x: 0, y: 0, z: 0 };
  public up: Vector3 = { x: 0, y: 1, z: 0 };
  
  constructor(aspect: number = 1.0) {
    this.aspect = aspect;
    this.updateProjectionMatrix();
    this.initializeViewMatrix();
  }

  /**
   * Actualiza la cámara según el modo actual
   */
  public update(spaceship: Spaceship, deltaTime: number): void {
    switch (this.currentMode) {
      case CameraMode.REAR_EXTERNAL:
        this.updateRearExternalMode(spaceship);
        break;
      case CameraMode.EXTERNAL:
        // TODO: Implementar modo externo en el futuro
        console.warn('🎥 Modo EXTERNAL no implementado aún - usando REAR_EXTERNAL');
        this.updateRearExternalMode(spaceship);
        break;
    }
    this.updateViewMatrix();
  }

  /**
   * Cambia el modo de cámara
   */
  public setCameraMode(mode: CameraMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    console.log(`🎥 Cambio de cámara: ${CameraMode[previousMode]} → ${CameraMode[mode]}`);
    
    if (mode === CameraMode.EXTERNAL) {
      console.log('⚠️  Modo EXTERNAL preparado pero no implementado');
    }
  }

  /**
   * Obtiene el modo actual de cámara
   */
  public getCurrentMode(): CameraMode {
    return this.currentMode;
  }

  /**
   * MODO REAR EXTERNAL (0): Cámara externa trasera fija
   * La cámara está ubicada detrás de la nave a distancia fija
   */
  private updateRearExternalMode(spaceship: Spaceship): void {
    // Posición dinámica respecto a la nave (cambia con zoom)
    const REAR_EXTERNAL_OFFSET = { x: 0, y: 1.0, z: -this.zoomDistance };
    
    // Posición absoluta de la cámara
    this.position = {
      x: spaceship.position.x + REAR_EXTERNAL_OFFSET.x,
      y: spaceship.position.y + REAR_EXTERNAL_OFFSET.y,
      z: spaceship.position.z + REAR_EXTERNAL_OFFSET.z
    };
    
    // Target fijo: siempre mira hacia adelante
    this.target = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z + 3.0
    };
    
    // Vector up fijo
    this.up = { x: 0, y: 1, z: 0 };
  }

  /**
   * Maneja el zoom con la rueda del mouse
   */
  public handleZoom(delta: number): void {
    this.zoomDistance -= delta * this.zoomSensitivity;
    this.zoomDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomDistance));
  }

  /**
   * Obtiene la distancia de zoom actual
   */
  public getZoomDistance(): number {
    return this.zoomDistance;
  }

  /**
   * Actualiza la matriz de proyección
   */
  public updateProjectionMatrix(): void {
    this.perspective(this.projectionMatrix, this.fov, this.aspect, this.near, this.far);
  }

  /**
   * Actualiza el aspect ratio
   */
  public setAspectRatio(aspect: number): void {
    this.aspect = aspect;
    this.updateProjectionMatrix();
  }

  /**
   * Obtiene información de depuración
   */
  public getDebugInfo() {
    return {
      mode: `${CameraMode[this.currentMode]} (${this.currentMode})`,
      position: { ...this.position },
      target: { ...this.target },
      zoomDistance: this.zoomDistance,
      fov: this.fov * (180 / Math.PI)
    };
  }

  // ===== FUNCIONES AUXILIARES PARA MATRICES =====
  
  private initializeViewMatrix(): void {
    this.identityMatrix(this.viewMatrix);
  }

  private updateViewMatrix(): void {
    this.lookAt(this.viewMatrix, this.position, this.target, this.up);
  }

  private identityMatrix(matrix: Float32Array): void {
    matrix.fill(0);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  }

  private perspective(matrix: Float32Array, fov: number, aspect: number, near: number, far: number): void {
    const f = 1.0 / Math.tan(fov * 0.5);
    const nf = 1.0 / (near - far);

    matrix.fill(0);
    matrix[0] = f / aspect;
    matrix[5] = f;
    matrix[10] = (far + near) * nf;
    matrix[11] = -1;
    matrix[14] = 2 * far * near * nf;
  }

  private lookAt(matrix: Float32Array, eye: Vector3, target: Vector3, up: Vector3): void {
    const forward = {
      x: target.x - eye.x,
      y: target.y - eye.y,
      z: target.z - eye.z
    };

    // Normalizar forward
    let length = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
    if (length > 0) {
      forward.x /= length;
      forward.y /= length;
      forward.z /= length;
    }

    // Right = forward × up
    const right = {
      x: forward.y * up.z - forward.z * up.y,
      y: forward.z * up.x - forward.x * up.z,
      z: forward.x * up.y - forward.y * up.x
    };

    // Normalizar right
    length = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.y /= length;
      right.z /= length;
    }

    // Up = right × forward
    const newUp = {
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x
    };

    // Construir matriz
    matrix[0] = right.x;
    matrix[1] = newUp.x;
    matrix[2] = -forward.x;
    matrix[3] = 0;

    matrix[4] = right.y;
    matrix[5] = newUp.y;
    matrix[6] = -forward.y;
    matrix[7] = 0;

    matrix[8] = right.z;
    matrix[9] = newUp.z;
    matrix[10] = -forward.z;
    matrix[11] = 0;

    matrix[12] = -(right.x * eye.x + right.y * eye.y + right.z * eye.z);
    matrix[13] = -(newUp.x * eye.x + newUp.y * eye.y + newUp.z * eye.z);
    matrix[14] = (forward.x * eye.x + forward.y * eye.y + forward.z * eye.z);
    matrix[15] = 1;
  }
}