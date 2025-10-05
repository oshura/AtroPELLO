import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';

/**
 * Clase para la nave del jugador
 */
export class Spaceship extends GameObject {
  // Propiedades específicas de la nave
  public maxSpeed: number = 50.0;
  public acceleration: number = 20.0;
  public deceleration: number = 15.0;
  public rotationSpeed: number = Math.PI / 2.5; // 72 grados por segundo (180 grados en 2.5 segundos)
  public minRotationSpeed: number = Math.PI / 5; // 36 grados por segundo
  
  public currentSpeed: number = 0.0;
  public targetSpeed: number = 0.0;
  public forwardDirection: Vector3 = { x: 0, y: 0, z: 1 }; // Dirección hacia adelante
  
  // Control de entrada
  public controls = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    speedUp: false,
    speedDown: false
  };

  constructor(position: Vector3 = { x: 100, y: 100, z: 100 }) {
    super('player-ship', position);
    this.color = { r: 0.2, g: 0.8, b: 1.0, a: 1.0 }; // Azul cian
  }

  /**
   * Inicializa la geometría de la nave (forma de triángulo/flecha 3D)
   */
  protected initGeometry(): void {
    // Nave en forma de triángulo alargado (apuntando hacia +Z)
    this.vertices = new Float32Array([
      // Frente (punta de la nave)
      0.0, 0.0, 1.5,   // Vértice frontal superior
      0.0, -0.2, 1.5,  // Vértice frontal inferior
      
      // Cuerpo principal
      -0.5, 0.0, -0.5,  // Izquierda superior
      0.5, 0.0, -0.5,   // Derecha superior
      -0.5, -0.3, -0.5, // Izquierda inferior
      0.5, -0.3, -0.5,  // Derecha inferior
      
      // Cola
      -0.3, 0.0, -1.0,  // Cola izquierda superior
      0.3, 0.0, -1.0,   // Cola derecha superior
      -0.3, -0.2, -1.0, // Cola izquierda inferior
      0.3, -0.2, -1.0,  // Cola derecha inferior
      
      // Alas
      -1.0, 0.0, 0.0,   // Ala izquierda
      1.0, 0.0, 0.0,    // Ala derecha
    ]);

    // Índices para formar triángulos
    this.indices = new Uint16Array([
      // Frente superior
      0, 2, 3, 0, 3, 1,
      // Frente inferior
      1, 4, 5, 1, 5, 0,
      // Lados superiores
      0, 3, 7, 0, 7, 6,
      0, 6, 2, 2, 6, 10,
      3, 11, 7, 3, 2, 11,
      // Lados inferiores
      1, 5, 9, 1, 9, 8,
      4, 8, 6, 4, 6, 2,
      5, 7, 11, 5, 11, 9,
      // Cola
      6, 7, 9, 6, 9, 8,
      // Alas
      2, 10, 4, 10, 8, 4,
      3, 5, 11, 5, 9, 11,
    ]);

    // Normales (calculadas aproximadamente)
    this.normals = new Float32Array([
      0, 1, 0,   // 0: Superior frontal
      0, -1, 0,  // 1: Inferior frontal
      -1, 0, 0,  // 2: Lateral izquierdo
      1, 0, 0,   // 3: Lateral derecho
      -1, 0, 0,  // 4: Lateral izquierdo inferior
      1, 0, 0,   // 5: Lateral derecho inferior
      -1, 0, 0,  // 6: Cola izquierda
      1, 0, 0,   // 7: Cola derecha
      -1, 0, 0,  // 8: Cola izquierda inferior
      1, 0, 0,   // 9: Cola derecha inferior
      -1, 0, 0,  // 10: Ala izquierda
      1, 0, 0,   // 11: Ala derecha
    ]);

    // Coordenadas UV (mapeo básico)
    this.uvs = new Float32Array([
      0.5, 1.0,  // 0
      0.5, 0.0,  // 1
      0.0, 0.7,  // 2
      1.0, 0.7,  // 3
      0.0, 0.3,  // 4
      1.0, 0.3,  // 5
      0.2, 0.0,  // 6
      0.8, 0.0,  // 7
      0.2, 0.1,  // 8
      0.8, 0.1,  // 9
      0.0, 0.5,  // 10
      1.0, 0.5,  // 11
    ]);
  }

  /**
   * Actualiza la nave con entrada del jugador
   */
  public override update(deltaTime: number): void {
    this.handleInput(deltaTime);
    this.updateMovement(deltaTime);
    super.update(deltaTime);
  }

  /**
   * Maneja la entrada del jugador
   */
  private handleInput(deltaTime: number): void {
    // Calcular velocidad de rotación basada en la velocidad actual
    const speedFactor = this.currentSpeed / this.maxSpeed;
    const rotationMultiplier = 1.0 - (speedFactor * 0.58); // Reduce a 42% a velocidad máxima
    const currentRotationSpeed = this.rotationSpeed * rotationMultiplier;

    // Rotación con WASD
    if (this.controls.left) {
      this.angularVelocity.y = currentRotationSpeed;
    } else if (this.controls.right) {
      this.angularVelocity.y = -currentRotationSpeed;
    } else {
      this.angularVelocity.y = 0;
    }

    if (this.controls.up) {
      this.angularVelocity.x = -currentRotationSpeed;
    } else if (this.controls.down) {
      this.angularVelocity.x = currentRotationSpeed;
    } else {
      this.angularVelocity.x = 0;
    }

    // Control de velocidad con +/-
    if (this.controls.speedUp) {
      this.targetSpeed = Math.min(this.targetSpeed + this.acceleration * deltaTime, this.maxSpeed);
    } else if (this.controls.speedDown) {
      this.targetSpeed = Math.max(this.targetSpeed - this.acceleration * deltaTime, 0);
    }
  }

  /**
   * Actualiza el movimiento de la nave
   */
  private updateMovement(deltaTime: number): void {
    // Suavizar transición de velocidad
    if (this.currentSpeed < this.targetSpeed) {
      this.currentSpeed = Math.min(this.currentSpeed + this.acceleration * deltaTime, this.targetSpeed);
    } else if (this.currentSpeed > this.targetSpeed) {
      this.currentSpeed = Math.max(this.currentSpeed - this.deceleration * deltaTime, this.targetSpeed);
    }

    // Calcular dirección hacia adelante basada en la rotación
    this.updateForwardDirection();

    // Aplicar velocidad en la dirección hacia adelante
    this.velocity.x = this.forwardDirection.x * this.currentSpeed;
    this.velocity.y = this.forwardDirection.y * this.currentSpeed;
    this.velocity.z = this.forwardDirection.z * this.currentSpeed;
  }

  /**
   * Actualiza la dirección hacia adelante basada en la rotación actual
   */
  private updateForwardDirection(): void {
    // Dirección inicial: +Z (hacia adelante)
    const forward = { x: 0, y: 0, z: 1 };

    // Aplicar rotaciones en orden: Y (yaw), X (pitch), Z (roll)
    const cosY = Math.cos(this.rotation.y);
    const sinY = Math.sin(this.rotation.y);
    const cosX = Math.cos(this.rotation.x);
    const sinX = Math.sin(this.rotation.x);

    // Rotación combinada
    this.forwardDirection.x = sinY * cosX;
    this.forwardDirection.y = -sinX;
    this.forwardDirection.z = cosY * cosX;

    // Normalizar (asegurar que sea un vector unitario)
    const length = Math.sqrt(
      this.forwardDirection.x * this.forwardDirection.x +
      this.forwardDirection.y * this.forwardDirection.y +
      this.forwardDirection.z * this.forwardDirection.z
    );

    if (length > 0) {
      this.forwardDirection.x /= length;
      this.forwardDirection.y /= length;
      this.forwardDirection.z /= length;
    }
  }

  /**
   * Establece el estado de un control
   */
  public setControl(control: keyof typeof this.controls, state: boolean): void {
    this.controls[control] = state;
  }

  /**
   * Obtiene la velocidad actual como porcentaje
   */
  public getSpeedPercentage(): number {
    return (this.currentSpeed / this.maxSpeed) * 100;
  }

  /**
   * Obtiene información de estado de la nave
   */
  public getStatus() {
    return {
      speed: this.currentSpeed,
      maxSpeed: this.maxSpeed,
      speedPercentage: this.getSpeedPercentage(),
      position: { ...this.position },
      rotation: { ...this.rotation },
      forwardDirection: { ...this.forwardDirection }
    };
  }

  /**
   * Resetea la nave a su estado inicial
   */
  public reset(): void {
    this.position = { x: 100, y: 100, z: 100 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.currentSpeed = 0;
    this.targetSpeed = 0;
    this.forwardDirection = { x: 0, y: 0, z: 1 };
    
    // Reset controls
    Object.keys(this.controls).forEach(key => {
      (this.controls as any)[key] = false;
    });
  }
}