import { GameObject } from './GameObject';
import { Vector3 } from '../types/game.types';

/**
 * Clase para los asteroides del juego
 */
export class Asteroid extends GameObject {
  // Propiedades específicas del asteroide
  public size: number;
  public baseSpeed: number = 5.0;
  public rotationRate: Vector3;
  
  // Variación en el movimiento
  public direction: Vector3;
  public driftSpeed: number;

  constructor(
    id: string,
    position: Vector3,
    size: number = 1.0,
    direction?: Vector3
  ) {
    super(id, position, 
      // Rotación inicial aleatoria
      { 
        x: Math.random() * Math.PI * 2,
        y: Math.random() * Math.PI * 2,
        z: Math.random() * Math.PI * 2
      },
      // Escala basada en el tamaño
      { x: size, y: size, z: size }
    );

    this.size = size;
    this.color = { r: 0.6, g: 0.5, b: 0.4, a: 1.0 }; // Color gris-marrón rocoso

    // Dirección de movimiento (si no se especifica, aleatoria)
    this.direction = direction || this.getRandomDirection();
    
    // Velocidad de deriva ligeramente aleatoria
    this.driftSpeed = this.baseSpeed * (0.8 + Math.random() * 0.4); // Entre 80% y 120%
    
    // Rotación continua aleatoria
    this.rotationRate = {
      x: (Math.random() - 0.5) * 2.0, // Entre -1 y 1 rad/s
      y: (Math.random() - 0.5) * 2.0,
      z: (Math.random() - 0.5) * 2.0
    };

    // Aplicar velocidad inicial
    this.velocity.x = this.direction.x * this.driftSpeed;
    this.velocity.y = this.direction.y * this.driftSpeed;
    this.velocity.z = this.direction.z * this.driftSpeed;

    // Aplicar rotación continua
    this.angularVelocity = { ...this.rotationRate };
  }

  /**
   * Genera una dirección aleatoria normalizada
   */
  private getRandomDirection(): Vector3 {
    const direction = {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2
    };

    // Normalizar
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
    }

    return direction;
  }

  /**
   * Inicializa la geometría del asteroide (forma irregular)
   */
  protected initGeometry(): void {
    // Crear un asteroide basado en un icosahedro deformado
    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Generar vértices de un icosahedro básico y deformarlos
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    const scale = 0.5;

    // Vértices base del icosahedro
    const baseVertices = [
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
    ];

    // Deformar vértices para crear forma irregular de asteroide
    for (let i = 0; i < baseVertices.length; i++) {
      const vertex = baseVertices[i];
      
      // Aplicar deformación aleatoria
      const deformation = 0.3 + Math.random() * 0.4; // Entre 0.3 y 0.7
      const noise1 = (Math.random() - 0.5) * 0.3;
      const noise2 = (Math.random() - 0.5) * 0.3;
      const noise3 = (Math.random() - 0.5) * 0.3;
      
      vertices.push(
        (vertex[0] * deformation + noise1) * scale,
        (vertex[1] * deformation + noise2) * scale,
        (vertex[2] * deformation + noise3) * scale
      );

      // Normal aproximada (apunta hacia afuera)
      const length = Math.sqrt(vertex[0] * vertex[0] + vertex[1] * vertex[1] + vertex[2] * vertex[2]);
      normals.push(vertex[0] / length, vertex[1] / length, vertex[2] / length);

      // UVs básicas
      uvs.push(
        (vertex[0] + 1) * 0.5,
        (vertex[1] + 1) * 0.5
      );
    }

    // Caras del icosahedro
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];

    // Convertir caras a índices
    for (const face of faces) {
      indices.push(face[0], face[1], face[2]);
    }

    // Convertir a Float32Array y Uint16Array
    this.vertices = new Float32Array(vertices);
    this.indices = new Uint16Array(indices);
    this.normals = new Float32Array(normals);
    this.uvs = new Float32Array(uvs);
  }

  /**
   * Actualiza el asteroide
   */
  public override update(deltaTime: number): void {
    // Mantener velocidad constante en la dirección
    this.velocity.x = this.direction.x * this.driftSpeed;
    this.velocity.y = this.direction.y * this.driftSpeed;
    this.velocity.z = this.direction.z * this.driftSpeed;

    // Mantener rotación constante
    this.angularVelocity = { ...this.rotationRate };

    // Actualizar usando la lógica base
    super.update(deltaTime);
  }

  /**
   * Verifica si el asteroide está fuera de los límites del mundo
   */
  public isOutOfBounds(worldBounds: { min: Vector3; max: Vector3 }): boolean {
    const margin = 50; // Margen para no desaparecer abruptamente

    return (
      this.position.x < worldBounds.min.x - margin ||
      this.position.x > worldBounds.max.x + margin ||
      this.position.y < worldBounds.min.y - margin ||
      this.position.y > worldBounds.max.y + margin ||
      this.position.z < worldBounds.min.z - margin ||
      this.position.z > worldBounds.max.z + margin
    );
  }

  /**
   * Reposiciona el asteroide en el lado opuesto del mundo
   */
  public wrapAroundWorld(worldBounds: { min: Vector3; max: Vector3 }): void {
    const size = {
      x: worldBounds.max.x - worldBounds.min.x,
      y: worldBounds.max.y - worldBounds.min.y,
      z: worldBounds.max.z - worldBounds.min.z
    };

    // Wrap en X
    if (this.position.x < worldBounds.min.x) {
      this.position.x = worldBounds.max.x;
    } else if (this.position.x > worldBounds.max.x) {
      this.position.x = worldBounds.min.x;
    }

    // Wrap en Y
    if (this.position.y < worldBounds.min.y) {
      this.position.y = worldBounds.max.y;
    } else if (this.position.y > worldBounds.max.y) {
      this.position.y = worldBounds.min.y;
    }

    // Wrap en Z
    if (this.position.z < worldBounds.min.z) {
      this.position.z = worldBounds.max.z;
    } else if (this.position.z > worldBounds.max.z) {
      this.position.z = worldBounds.min.z;
    }
  }

  /**
   * Crea un asteroide en una posición aleatoria en los bordes del mundo
   */
  static createRandomAsteroid(
    id: string,
    worldBounds: { min: Vector3; max: Vector3 },
    centerPosition: Vector3
  ): Asteroid {
    // Generar posición en el borde del mundo
    const edge = Math.floor(Math.random() * 6); // 6 caras del cubo
    const position: Vector3 = { x: 0, y: 0, z: 0 };

    switch (edge) {
      case 0: // Cara -X
        position.x = worldBounds.min.x;
        position.y = worldBounds.min.y + Math.random() * (worldBounds.max.y - worldBounds.min.y);
        position.z = worldBounds.min.z + Math.random() * (worldBounds.max.z - worldBounds.min.z);
        break;
      case 1: // Cara +X
        position.x = worldBounds.max.x;
        position.y = worldBounds.min.y + Math.random() * (worldBounds.max.y - worldBounds.min.y);
        position.z = worldBounds.min.z + Math.random() * (worldBounds.max.z - worldBounds.min.z);
        break;
      case 2: // Cara -Y
        position.x = worldBounds.min.x + Math.random() * (worldBounds.max.x - worldBounds.min.x);
        position.y = worldBounds.min.y;
        position.z = worldBounds.min.z + Math.random() * (worldBounds.max.z - worldBounds.min.z);
        break;
      case 3: // Cara +Y
        position.x = worldBounds.min.x + Math.random() * (worldBounds.max.x - worldBounds.min.x);
        position.y = worldBounds.max.y;
        position.z = worldBounds.min.z + Math.random() * (worldBounds.max.z - worldBounds.min.z);
        break;
      case 4: // Cara -Z
        position.x = worldBounds.min.x + Math.random() * (worldBounds.max.x - worldBounds.min.x);
        position.y = worldBounds.min.y + Math.random() * (worldBounds.max.y - worldBounds.min.y);
        position.z = worldBounds.min.z;
        break;
      case 5: // Cara +Z
        position.x = worldBounds.min.x + Math.random() * (worldBounds.max.x - worldBounds.min.x);
        position.y = worldBounds.min.y + Math.random() * (worldBounds.max.y - worldBounds.min.y);
        position.z = worldBounds.max.z;
        break;
    }

    // Dirección hacia el centro del mundo (con algo de aleatoriedad)
    const direction: Vector3 = {
      x: centerPosition.x - position.x,
      y: centerPosition.y - position.y,
      z: centerPosition.z - position.z
    };

    // Normalizar dirección
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
    }

    // Añadir algo de aleatoriedad a la dirección
    direction.x += (Math.random() - 0.5) * 0.3;
    direction.y += (Math.random() - 0.5) * 0.3;
    direction.z += (Math.random() - 0.5) * 0.3;

    // Renormalizar
    const newLength = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if (newLength > 0) {
      direction.x /= newLength;
      direction.y /= newLength;
      direction.z /= newLength;
    }

    // Tamaño aleatorio
    const size = 0.5 + Math.random() * 1.5; // Entre 0.5 y 2.0

    return new Asteroid(id, position, size, direction);
  }

  /**
   * Genera colores variados gris-marrón para cada vértice del asteroide
   */
  protected override generateVertexColors(): void {
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);
    
    for (let i = 0; i < vertexCount; i++) {
      const colorIndex = i * 3;
      
      // Variaciones aleatorias del color base gris-marrón
      const variation = (Math.random() - 0.5) * 0.3; // ±15% de variación
      
      // Color base gris-marrón con variaciones
      const r = Math.max(0.2, Math.min(1.0, this.color.r + variation));
      const g = Math.max(0.15, Math.min(0.8, this.color.g + variation * 0.8));  
      const b = Math.max(0.1, Math.min(0.6, this.color.b + variation * 0.6));
      
      this.colors[colorIndex] = r;     // R
      this.colors[colorIndex + 1] = g; // G  
      this.colors[colorIndex + 2] = b; // B
    }
  }
}