import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';

/**
 * Estados del thruster para diferentes efectos visuales
 */
export enum ThrusterState {
  IDLE = 'idle',          // Rojo - parado
  ACCELERATING = 'accelerating', // Amarillo/naranja - acelerando (+)
  CRUISING = 'cruising',  // Azul - con velocidad pero sin input
  BRAKING = 'braking'     // Rojo intenso - frenando (-)
}

/**
 * Clase para la nave del jugador
 */
export class Spaceship extends GameObject {
  // Propiedades específicas de la nave
  public maxSpeed: number = 5.0;
  public acceleration: number = 2.0;
  public deceleration: number = 2.5;
  public rotationSpeed: number = Math.PI / 2.5; // 72 grados por segundo (180 grados en 2.5 segundos)
  public minRotationSpeed: number = Math.PI / 5; // 36 grados por segundo
  
  // Matriz de orientación para rotaciones locales verdaderas
  private orientationMatrix: Float32Array = new Float32Array(16);
  
  public currentSpeed: number = 0.0;
  public targetSpeed: number = 0.0;
  public forwardDirection: Vector3 = { x: 0, y: 0, z: 1 }; // Dirección hacia adelante
  
  // Estado del motor para efectos visuales
  public isThrusting: boolean = false;
  public thrusterIntensity: number = 0.0;
  public thrusterState: ThrusterState = ThrusterState.IDLE;
  
  // Control de entrada
  public controls = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    speedUp: false,
    speedDown: false,
    rollLeft: false,  // R key - Roll hacia la izquierda
    rollRight: false  // F key - Roll hacia la derecha
  };

  constructor(position: Vector3 = { x: 0, y: 0, z: 0 }) {
    super('player-ship', position);
    this.color = { r: 0.7, g: 0.75, b: 0.8, a: 1.0 }; // Color metálico plateado base
    
    // Inicializar matriz de orientación como identidad
    this.initializeOrientationMatrix();
    
    console.log('🚀 Spaceship created with geometry:', {
      vertices: this.vertices.length,
      indices: this.indices.length,
      position: this.position
    });
  }

  /**
   * Inicializa la matriz de orientación como identidad
   */
  private initializeOrientationMatrix(): void {
    // Matriz identidad 4x4
    this.orientationMatrix.set([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  /**
   * Inicializa la geometría de la nave modular con componentes separados
   */
  protected initGeometry(): void {
    // La nueva nave será renderizada como componentes separados
    // Este método crea una geometría temporal básica que será reemplazada por el renderizado modular
    this.createBasicGeometry();
  }

  /**
   * Crea una geometría básica temporal (será reemplazada por renderizado modular)
   */
  private createBasicGeometry(): void {
    // Geometría simple para el sistema de colisiones
    this.vertices = new Float32Array([
      // Caja simple para colisiones
      -0.5, -0.3, -0.8,  // 0
       0.5, -0.3, -0.8,  // 1
      -0.5,  0.3, -0.8,  // 2
       0.5,  0.3, -0.8,  // 3
      -0.5, -0.3,  1.2,  // 4
       0.5, -0.3,  1.2,  // 5
      -0.5,  0.3,  1.2,  // 6
       0.5,  0.3,  1.2,  // 7
    ]);

    this.indices = new Uint16Array([
      // Cara frontal
      4, 5, 7, 4, 7, 6,
      // Cara trasera
      0, 2, 3, 0, 3, 1,
      // Lados
      0, 4, 6, 0, 6, 2,
      1, 3, 7, 1, 7, 5,
      // Arriba y abajo
      2, 6, 7, 2, 7, 3,
      0, 1, 5, 0, 5, 4
    ]);

    // Normales básicas
    this.normals = new Float32Array([
      -1, 0, 0,  0, 0, 0,  1, 0, 0,  1, 0, 0,
      -1, 0, 0,  1, 0, 0,  -1, 0, 0,  1, 0, 0
    ]);

    // UVs básicas
    this.uvs = new Float32Array([
      0, 0,  1, 0,  0, 1,  1, 1,
      0, 0,  1, 0,  0, 1,  1, 1
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

    // SISTEMA SIMPLIFICADO: usar angularVelocity con mejor orden de rotación
    
    // Yaw (Q/E) - Rotación en Y 
    if (this.controls.left) {
      this.angularVelocity.y = currentRotationSpeed;
      console.log('🚀 Q pressed - YAW LEFT | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else if (this.controls.right) {
      this.angularVelocity.y = -currentRotationSpeed;
      console.log('🚀 E pressed - YAW RIGHT | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else {
      this.angularVelocity.y = 0;
    }

    // Pitch (W/S) - Rotación en X 
    if (this.controls.up) {
      this.angularVelocity.x = -currentRotationSpeed;
      console.log('🚀 W pressed - PITCH UP | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else if (this.controls.down) {
      this.angularVelocity.x = currentRotationSpeed;
      console.log('🚀 S pressed - PITCH DOWN | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else {
      this.angularVelocity.x = 0;
    }

    // Roll (A/D) - Rotación en Z
    if (this.controls.rollLeft) {
      this.angularVelocity.z = currentRotationSpeed;
      console.log('🚀 A pressed - ROLL LEFT | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else if (this.controls.rollRight) {
      this.angularVelocity.z = -currentRotationSpeed;
      console.log('🚀 D pressed - ROLL RIGHT | Current rotation:', {
        x: this.rotation.x.toFixed(3), 
        y: this.rotation.y.toFixed(3), 
        z: this.rotation.z.toFixed(3)
      });
    } else {
      this.angularVelocity.z = 0;
    }

    // Control de velocidad con +/-
    if (this.controls.speedUp) {
      this.targetSpeed = Math.min(this.targetSpeed + this.acceleration * deltaTime, this.maxSpeed);
      this.thrusterState = ThrusterState.ACCELERATING;
      this.isThrusting = true;
    } else if (this.controls.speedDown) {
      this.targetSpeed = Math.max(this.targetSpeed - this.acceleration * deltaTime, 0);
      this.thrusterState = ThrusterState.BRAKING;
      this.isThrusting = this.currentSpeed > 0.1;
    } else {
      // Sin input de aceleración/frenado
      if (this.currentSpeed > 0.1) {
        this.thrusterState = ThrusterState.CRUISING;
        this.isThrusting = true;
      } else {
        this.thrusterState = ThrusterState.IDLE;
        this.isThrusting = false;
      }
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

    // Actualizar intensidad del thruster basado en el estado y actividad
    switch (this.thrusterState) {
      case ThrusterState.IDLE:
        this.thrusterIntensity = 0.0;
        break;
      case ThrusterState.ACCELERATING:
        this.thrusterIntensity = Math.min(this.currentSpeed / this.maxSpeed + 0.5, 1.0);
        break;
      case ThrusterState.BRAKING:
        this.thrusterIntensity = 1.0; // Máxima intensidad para frenado
        break;
      case ThrusterState.CRUISING:
        this.thrusterIntensity = Math.max(0.3, this.currentSpeed / this.maxSpeed * 0.6);
        break;
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
    // Usar EXACTAMENTE el mismo método que usa la cámara
    // Dirección inicial: +Z (hacia adelante)
    const localForward = { x: 0, y: 0, z: 1 };
    
    // Aplicar rotaciones completas Y→X→Z (igual que la cámara)
    this.forwardDirection = this.applyRotationToVector(localForward, this.rotation);
  }

  /**
   * Aplica rotaciones a un vector usando el mismo orden que la cámara: Y→X→Z
   */
  private applyRotationToVector(localVector: Vector3, rotation: Vector3): Vector3 {
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
   * Aplica una rotación incremental en el eje local especificado
   */
  private applyLocalRotation(axis: 'x' | 'y' | 'z', angle: number): void {
    // Crear matriz de rotación para el eje especificado
    const rotationMatrix = new Float32Array(16);
    this.createIdentityMatrix(rotationMatrix);

    switch (axis) {
      case 'x':
        this.applyRotationX(rotationMatrix, angle);
        break;
      case 'y':
        this.applyRotationY(rotationMatrix, angle);
        break;
      case 'z':
        this.applyRotationZ(rotationMatrix, angle);
        break;
    }

    // Multiplicar: nueva_orientación = rotación_incremental * orientación_actual
    // Esto aplica la rotación en coordenadas LOCALES
    const tempMatrix = new Float32Array(16);
    this.multiplyMatrices(rotationMatrix, this.orientationMatrix, tempMatrix);
    this.orientationMatrix.set(tempMatrix);
  }

  /**
   * Extrae ángulos de Euler de la matriz de orientación para compatibilidad
   */
  private extractEulerFromMatrix(): void {
    // Extraer rotación Y (yaw)
    this.rotation.y = Math.atan2(this.orientationMatrix[8], this.orientationMatrix[10]);
    
    // Extraer rotación X (pitch)
    const sy = Math.sqrt(this.orientationMatrix[0] * this.orientationMatrix[0] + this.orientationMatrix[4] * this.orientationMatrix[4]);
    this.rotation.x = Math.atan2(-this.orientationMatrix[9], sy);
    
    // Extraer rotación Z (roll)
    this.rotation.z = Math.atan2(this.orientationMatrix[4], this.orientationMatrix[0]);
  }

  /**
   * Multiplica dos matrices 4x4: result = a * b
   */
  private multiplyMatrices(a: Float32Array, b: Float32Array, result: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[i * 4 + k] * b[k * 4 + j];
        }
        result[i * 4 + j] = sum;
      }
    }
  }

  /**
   * Crea una matriz identidad (versión local para evitar conflictos)
   */
  private createIdentityMatrix(matrix: Float32Array): void {
    matrix.fill(0);
    matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  }

  /**
   * Aplica rotación X a una matriz (versión local)
   */
  private applyRotationX(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    matrix[5] = cos;
    matrix[6] = sin;
    matrix[9] = -sin;
    matrix[10] = cos;
  }

  /**
   * Aplica rotación Y a una matriz (versión local)
   */
  private applyRotationY(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    matrix[0] = cos;
    matrix[2] = -sin;
    matrix[8] = sin;
    matrix[10] = cos;
  }

  /**
   * Aplica rotación Z a una matriz (versión local)
   */
  private applyRotationZ(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    matrix[0] = cos;
    matrix[1] = sin;
    matrix[4] = -sin;
    matrix[5] = cos;
  }

  /**
   * Obtiene información de depuración de la nave
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

  /**
   * Crear geometría para el cono/pirámide de la punta delantera
   */
  createNoseGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Vértice de la punta (frente)
    vertices.push(0, 0, 1.5);
    
    // Base del cono (círculo en z = 0.5)
    const segments = 8;
    const radius = 0.4;
    const baseZ = 0.5;
    
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      vertices.push(x, y, baseZ);
    }
    
    // Índices para las caras laterales del cono
    for (let i = 0; i < segments; i++) {
      const current = i + 1;
      const next = (i + 1) % segments + 1;
      
      // Triángulo desde la punta a los vértices de la base
      indices.push(0, current, next);
    }
    
    // Base del cono (cerrar por abajo)
    const centerBase = vertices.length / 3;
    vertices.push(0, 0, baseZ); // Centro de la base
    
    for (let i = 0; i < segments; i++) {
      const current = i + 1;
      const next = (i + 1) % segments + 1;
      indices.push(centerBase, next, current);
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para el cuerpo esférico principal
   */
  createBodyGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    const latSegments = 12;
    const lonSegments = 16;
    const radius = 0.6;
    
    // Generar vértices de la esfera
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        const x = cosPhi * sinTheta * radius;
        const y = sinPhi * sinTheta * radius;
        const z = cosTheta * radius;
        
        vertices.push(x, y, z);
      }
    }
    
    // Generar índices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const current = lat * (lonSegments + 1) + lon;
        const next = current + lonSegments + 1;
        
        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para las alas laterales
   */
  createWingsGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // Ala izquierda
    const wingLength = 1.2;
    const wingWidth = 0.1;
    const wingThickness = 0.05;
    
    // Vértices del ala izquierda
    vertices.push(
      // Cara superior
      -wingLength, -wingWidth, wingThickness,
      -0.3, -wingWidth, wingThickness,
      -0.3, wingWidth, wingThickness,
      -wingLength, wingWidth, wingThickness,
      
      // Cara inferior
      -wingLength, -wingWidth, -wingThickness,
      -wingLength, wingWidth, -wingThickness,
      -0.3, wingWidth, -wingThickness,
      -0.3, -wingWidth, -wingThickness
    );
    
    // Índices para el ala izquierda
    const leftWingIndices = [
      0, 1, 2,  0, 2, 3,  // top
      4, 5, 6,  4, 6, 7,  // bottom
      0, 4, 7,  0, 7, 1,  // front
      2, 6, 5,  2, 5, 3,  // back
      0, 3, 5,  0, 5, 4,  // left
      1, 7, 6,  1, 6, 2   // right
    ];
    
    indices.push(...leftWingIndices);
    
    // Ala derecha (espejo del ala izquierda)
    const rightWingStartIndex = vertices.length / 3;
    vertices.push(
      // Cara superior
      wingLength, -wingWidth, wingThickness,
      0.3, -wingWidth, wingThickness,
      0.3, wingWidth, wingThickness,
      wingLength, wingWidth, wingThickness,
      
      // Cara inferior
      wingLength, -wingWidth, -wingThickness,
      wingLength, wingWidth, -wingThickness,
      0.3, wingWidth, -wingThickness,
      0.3, -wingWidth, -wingThickness
    );
    
    // Índices para el ala derecha
    for (const index of leftWingIndices) {
      indices.push(index + rightWingStartIndex);
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Crear geometría para la esfera del thruster trasero
   */
  createThrusterGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    const vertices: number[] = [];
    const indices: number[] = [];
    
    const latSegments = 8;
    const lonSegments = 12;
    const radius = 0.15;
    const positionZ = -0.8; // Posición trasera
    
    // Generar vértices de la esfera del thruster
    for (let lat = 0; lat <= latSegments; lat++) {
      const theta = (lat * Math.PI) / latSegments;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let lon = 0; lon <= lonSegments; lon++) {
        const phi = (lon * 2 * Math.PI) / lonSegments;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        const x = cosPhi * sinTheta * radius;
        const y = sinPhi * sinTheta * radius;
        const z = cosTheta * radius + positionZ;
        
        vertices.push(x, y, z);
      }
    }
    
    // Generar índices
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const current = lat * (lonSegments + 1) + lon;
        const next = current + lonSegments + 1;
        
        indices.push(current, next, current + 1);
        indices.push(next, next + 1, current + 1);
      }
    }
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }


}