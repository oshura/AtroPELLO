import { Vector3 } from '../types/game.types';
import { Spaceship } from './Spaceship';

/**
 * Cámara que sigue a la nave del jugador
 * - FOV de 120 grados
 * - Posición detrás de la nave, inclinada 30 grados hacia arriba
 * - Siempre mira hacia adelante en la dirección de la nave
 */
export class Camera {
  // Matrices de la cámara
  public viewMatrix: Float32Array = new Float32Array(16);
  public projectionMatrix: Float32Array = new Float32Array(16);
  
  // Configuración de la cámara
  public fov: number = 120 * (Math.PI / 180); // 120 grados en radianes
  public aspect: number = 1.0; // Se actualiza dinámicamente
  public near: number = 0.1;
  public far: number = 1000.0;
  
  // Configuración de seguimiento
  private followDistance: number = 3.0; // Distancia detrás de la nave
  private heightOffset: number = 1.0; // Altura sobre la nave
  private pitchAngle: number = 30 * (Math.PI / 180); // 30 grados hacia abajo
  
  // Configuración de zoom dinámico con rueda del mouse
  private zoomDistance: number = 2.0; // Distancia base restaurada
  private minZoom: number = 0.8; // Distancia mínima (más cerca)
  private maxZoom: number = 8.0; // Distancia máxima
  private zoomSensitivity: number = 0.2; // Sensibilidad normal
  
  // Posición y orientación actuales
  public position: Vector3 = { x: 0, y: 0, z: 0 };
  public target: Vector3 = { x: 0, y: 0, z: 0 };
  public up: Vector3 = { x: 0, y: 1, z: 0 };
  
  // Suavizado de movimiento
  private smoothingFactor: number = 8.0; // Mayor = más rígido, menor = más suave
  

  
  constructor(aspect: number = 1.0) {
    this.aspect = aspect;
    this.updateProjectionMatrix();
    this.initializeViewMatrix();
  }

  /**
   * Actualiza la cámara en modo cockpit fijo (único modo)
   */
  public update(spaceship: Spaceship, deltaTime: number): void {
    this.updateCockpitMode(spaceship, deltaTime);
    this.updateViewMatrix();
  }

  /**
   * Modo COCKPIT: Cámara completamente soldada a la nave
   * La nave permanece visualmente inmóvil, el universo rota alrededor
   */
  private updateCockpitMode(spaceship: Spaceship, deltaTime: number): void {
    // Posición dinámica respecto a la nave (cambia con zoom)
    const DYNAMIC_OFFSET = { x: 0, y: 1.0, z: -this.zoomDistance }; // Y duplicado: era 0.5, ahora 1.0
    
    // Posición absoluta de la cámara
    this.position = {
      x: spaceship.position.x + DYNAMIC_OFFSET.x,
      y: spaceship.position.y + DYNAMIC_OFFSET.y,
      z: spaceship.position.z + DYNAMIC_OFFSET.z
    };
    
    // Target FIJO: siempre mira 3 unidades hacia adelante en Z local
    this.target = {
      x: this.position.x + 0,     // Sin movimiento en X
      y: this.position.y + 0,     // Sin movimiento en Y  
      z: this.position.z + 3.0    // Siempre 3 unidades adelante en Z
    };
    
    // Vector up FIJO
    this.up = { x: 0, y: 1, z: 0 };
    
    // Debug
    if (Math.abs(spaceship.rotation.y) > 0.01) {
      console.log('🏠 COCKPIT MODE:');
      console.log('  Ship rotation.y:', spaceship.rotation.y.toFixed(4));
      console.log('  Camera pos (FIXED):', this.position);
      console.log('  Camera target (FIXED):', this.target);
      console.log('  Expected result: Ship stays put, space rotates');
    }
  }





  /**
   * Calcula la posición objetivo de la cámara detrás de la nave
   */
  private calculateTargetPosition(spaceship: Spaceship): void {
    // Obtener la dirección hacia atrás de la nave (opuesta a forwardDirection)
    const backward = {
      x: -spaceship.forwardDirection.x,
      y: -spaceship.forwardDirection.y,
      z: -spaceship.forwardDirection.z
    };

    // Calcular el vector hacia arriba relativo a la nave
    // Usamos el vector up mundial rotado por la orientación de la nave
    const shipUp = this.calculateShipUpVector(spaceship);

    // Posición base detrás de la nave
    const basePosition = {
      x: spaceship.position.x + backward.x * this.followDistance,
      y: spaceship.position.y + backward.y * this.followDistance,
      z: spaceship.position.z + backward.z * this.followDistance
    };

    // Aplicar offset de altura (30 grados hacia arriba)
    const heightOffset = {
      x: shipUp.x * this.heightOffset,
      y: shipUp.y * this.heightOffset,
      z: shipUp.z * this.heightOffset
    };

    // Posición final de la cámara
    this.position = {
      x: basePosition.x + heightOffset.x,
      y: basePosition.y + heightOffset.y,
      z: basePosition.z + heightOffset.z
    };
  }

  /**
   * Calcula hacia dónde debe mirar la cámara
   */
  private calculateTargetLookAt(spaceship: Spaceship): void {
    // La cámara mira hacia adelante en la dirección de la nave
    // Pero con una ligera inclinación hacia abajo (30 grados)
    
    // Punto adelante de la nave
    const lookDistance = 10.0;
    const forwardPoint = {
      x: spaceship.position.x + spaceship.forwardDirection.x * lookDistance,
      y: spaceship.position.y + spaceship.forwardDirection.y * lookDistance,
      z: spaceship.position.z + spaceship.forwardDirection.z * lookDistance
    };

    // Aplicar inclinación hacia abajo
    const shipUp = this.calculateShipUpVector(spaceship);
    const downwardOffset = {
      x: -shipUp.x * Math.sin(this.pitchAngle) * lookDistance * 0.3,
      y: -shipUp.y * Math.sin(this.pitchAngle) * lookDistance * 0.3,
      z: -shipUp.z * Math.sin(this.pitchAngle) * lookDistance * 0.3
    };

    this.target = {
      x: forwardPoint.x + downwardOffset.x,
      y: forwardPoint.y + downwardOffset.y,
      z: forwardPoint.z + downwardOffset.z
    };
  }

  /**
   * Calcula el vector "arriba" de la nave basado en su rotación
   */
  private calculateShipUpVector(spaceship: Spaceship): Vector3 {
    // Vector up inicial (0, 1, 0)
    const up = { x: 0, y: 1, z: 0 };

    // Aplicar las rotaciones de la nave al vector up
    const cosY = Math.cos(spaceship.rotation.y);
    const sinY = Math.sin(spaceship.rotation.y);
    const cosX = Math.cos(spaceship.rotation.x);
    const sinX = Math.sin(spaceship.rotation.x);
    const cosZ = Math.cos(spaceship.rotation.z);
    const sinZ = Math.sin(spaceship.rotation.z);

    // Matriz de rotación aplicada al vector up
    // Orden: Z * X * Y (roll * pitch * yaw)
    const rotatedUp = {
      x: up.x * (cosY * cosZ - sinX * sinY * sinZ) + 
         up.y * (-cosX * sinZ) + 
         up.z * (sinY * cosZ + sinX * cosY * sinZ),
         
      y: up.x * (cosY * sinZ + sinX * sinY * cosZ) + 
         up.y * (cosX * cosZ) + 
         up.z * (sinY * sinZ - sinX * cosY * cosZ),
         
      z: up.x * (-cosX * sinY) + 
         up.y * (sinX) + 
         up.z * (cosX * cosY)
    };

    // Normalizar
    const length = Math.sqrt(rotatedUp.x * rotatedUp.x + rotatedUp.y * rotatedUp.y + rotatedUp.z * rotatedUp.z);
    if (length > 0) {
      rotatedUp.x /= length;
      rotatedUp.y /= length;
      rotatedUp.z /= length;
    }

    return rotatedUp;
  }

  /**
   * Aplica suavizado al movimiento de la cámara
   */
  private smoothCameraMovement(deltaTime: number): void {
    // Factor de interpolación basado en deltaTime
    const lerpFactor = Math.min(1.0, this.smoothingFactor * deltaTime);

    // Suavizar posición (no necesario si queremos cámara rígida)
    // Para una cámara más rígida, comentar estas líneas
    /*
    this.position.x = this.lerp(this.position.x, targetPosition.x, lerpFactor);
    this.position.y = this.lerp(this.position.y, targetPosition.y, lerpFactor);
    this.position.z = this.lerp(this.position.z, targetPosition.z, lerpFactor);
    */
  }

  /**
   * Función auxiliar de interpolación lineal
   */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  /**
   * Actualiza la matriz de vista
   */
  private updateViewMatrix(): void {
    this.lookAt(this.viewMatrix, this.position, this.target, this.calculateUpVector());
  }

  /**
   * Calcula el vector up para la matriz de vista
   */
  private calculateUpVector(): Vector3 {
    // El vector up de la cámara es perpendicular al plano formado por
    // la dirección de vista y la dirección derecha
    const forward = {
      x: this.target.x - this.position.x,
      y: this.target.y - this.position.y,
      z: this.target.z - this.position.z
    };

    // Normalizar forward
    let length = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
    if (length > 0) {
      forward.x /= length;
      forward.y /= length;
      forward.z /= length;
    }

    // Vector right (cross product de forward y up mundial)
    const worldUp = { x: 0, y: 1, z: 0 };
    const right = {
      x: forward.y * worldUp.z - forward.z * worldUp.y,
      y: forward.z * worldUp.x - forward.x * worldUp.z,
      z: forward.x * worldUp.y - forward.y * worldUp.x
    };

    // Normalizar right
    length = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
    if (length > 0) {
      right.x /= length;
      right.y /= length;
      right.z /= length;
    }

    // Up es el cross product de right y forward
    const up = {
      x: right.y * forward.z - right.z * forward.y,
      y: right.z * forward.x - right.x * forward.z,
      z: right.x * forward.y - right.y * forward.x
    };

    return up;
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
   * Inicializa la matriz de vista con valores por defecto
   */
  private initializeViewMatrix(): void {
    this.identityMatrix(this.viewMatrix);
  }

  // Funciones auxiliares para matrices
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

  /**
   * Aplica rotación a un vector usando EXACTAMENTE la misma lógica que la nave
   */
  private applyRotationToVector(localVector: Vector3, rotation: Vector3): Vector3 {
    // Usar EXACTAMENTE el mismo orden y cálculo que usa la nave
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const cosZ = Math.cos(rotation.z);
    const sinZ = Math.sin(rotation.z);
    
    // Aplicar rotaciones en el mismo orden: Y, X, Z
    // Primero Y (yaw)
    let x = localVector.x * cosY - localVector.z * sinY;
    let y = localVector.y;
    let z = localVector.x * sinY + localVector.z * cosY;
    
    // Luego X (pitch)
    const tempY = y * cosX - z * sinX;
    z = y * sinX + z * cosX;
    y = tempY;
    
    // Finalmente Z (roll)
    const tempX = x * cosZ - y * sinZ;
    y = x * sinZ + y * cosZ;
    x = tempX;
    
    return { x, y, z };
  }

  /**
   * Maneja el zoom con la rueda del mouse
   * @param delta - Valor del desplazamiento de la rueda (positivo = acercar, negativo = alejar)
   */
  public handleZoom(delta: number): void {
    // Calcular nuevo zoom basado en la dirección de la rueda
    // Delta positivo (rueda hacia arriba) = acercar (menor distancia)
    // Delta negativo (rueda hacia abajo) = alejar (mayor distancia) 
    this.zoomDistance -= delta * this.zoomSensitivity;
    
    // Limitar el zoom entre los valores mínimo y máximo
    this.zoomDistance = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomDistance));
  }

  /**
   * Obtiene la distancia de zoom actual
   */
  public getZoomDistance(): number {
    return this.zoomDistance;
  }

  /**
   * Obtiene información de depuración de la cámara
   */
  public getDebugInfo() {
    return {
      position: { ...this.position },
      target: { ...this.target },
      up: { ...this.up },
      fov: this.fov * (180 / Math.PI),
      aspect: this.aspect,
      near: this.near,
      far: this.far,
      zoomDistance: this.zoomDistance
    };
  }
}