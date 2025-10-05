import { Injectable } from '@angular/core';
import { WebGLService } from '../services/webgl.service';
import { GameObject } from './GameObject';
import { Spaceship } from './Spaceship';
import { Asteroid } from './Asteroid';
import { Camera } from './Camera';
import { ShaderManager } from './ShaderManager';

/**
 * Motor principal del juego que coordina todos los sistemas
 */
@Injectable({
  providedIn: 'root'
})
export class GameEngine {
  private gl: WebGL2RenderingContext | null = null;
  private isRunning: boolean = false;
  private lastFrameTime: number = 0;
  
  // Sistemas principales
  private camera!: Camera;
  private shaderManager!: ShaderManager;
  
  // Objetos del juego
  private spaceship!: Spaceship;
  private asteroids: Asteroid[] = [];
  
  // Configuración del mundo
  private readonly WORLD_SIZE = 50;
  private readonly ASTEROID_COUNT = 15;
  
  // Configuración de iluminación
  private lightDirection = new Float32Array([0.5, -0.8, 0.3]); // Luz desde arriba-derecha
  private lightColor = new Float32Array([1.0, 1.0, 0.9]);      // Luz blanca-amarillenta
  private ambientColor = new Float32Array([0.3, 0.3, 0.4]);   // Ambiente azulado tenue
  private ambientStrength = 0.4;
  
  // Matrices auxiliares
  private normalMatrix = new Float32Array(16);

  constructor(private webglService: WebGLService) {}

  /**
   * Inicializa el motor del juego
   */
  public async initialize(canvasRef: any): Promise<boolean> {
    try {
      // Inicializar WebGL
      if (!this.webglService.initialize(canvasRef)) {
        console.error('No se pudo inicializar WebGL');
        return false;
      }

      this.gl = this.webglService.getContext() as WebGL2RenderingContext;
      if (!this.gl) {
        console.error('No se pudo obtener el contexto WebGL');
        return false;
      }

      // Configurar WebGL
      this.setupWebGL();

      // Inicializar sistemas
      this.shaderManager = new ShaderManager(this.webglService);
      if (!this.shaderManager.isReady()) {
        console.error('No se pudieron inicializar los shaders');
        return false;
      }

      // Crear cámara
      const canvas = canvasRef.nativeElement;
      const aspect = canvas.width / canvas.height;
      this.camera = new Camera(aspect);

      // Crear objetos del juego
      this.createGameObjects();

      console.log('GameEngine inicializado correctamente');
      return true;

    } catch (error) {
      console.error('Error al inicializar GameEngine:', error);
      return false;
    }
  }

  /**
   * Configura el estado inicial de WebGL
   */
  private setupWebGL(): void {
    if (!this.gl) return;

    // Habilitar depth testing
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);

    // Configurar culling (opcional)
    // this.gl.enable(this.gl.CULL_FACE);
    // this.gl.cullFace(this.gl.BACK);

    // Color de fondo (espacio negro)
    this.gl.clearColor(0.05, 0.05, 0.15, 1.0);

    // Configurar viewport
    this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
  }

  /**
   * Crea los objetos iniciales del juego
   */
  private createGameObjects(): void {
    if (!this.gl) return;

    // Crear nave del jugador
    this.spaceship = new Spaceship({ x: 0, y: 0, z: 0 });
    console.log('🚀 Spaceship created at position:', this.spaceship.position);

    // Crear asteroides
    this.asteroids = [];
    for (let i = 0; i < this.ASTEROID_COUNT; i++) {
      // Posición inicial aleatoria
      let x, y, z;
      do {
        x = (Math.random() - 0.5) * this.WORLD_SIZE;
        y = (Math.random() - 0.5) * this.WORLD_SIZE;
        z = (Math.random() - 0.5) * this.WORLD_SIZE;
      } while (Math.sqrt(x*x + y*y + z*z) < 5); // No muy cerca de la nave
      
      const asteroid = new Asteroid(`asteroid-${i}`, { x, y, z }, 0.5 + Math.random() * 1.5);
      
      // Velocidad aleatoria
      asteroid.velocity = {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2
      };

      this.asteroids.push(asteroid);
    }
    
    // ¡CRÍTICO! Inicializar buffers WebGL para todos los objetos
    this.initializeAllBuffers();
  }
  
  /**
   * Inicializa los buffers WebGL para todos los objetos del juego
   */
  private initializeAllBuffers(): void {
    if (!this.gl) {
      console.error('❌ Cannot initialize buffers: WebGL context not available');
      return;
    }
    
    // Inicializar buffers de la nave
    this.spaceship.initBuffers(this.gl);
    console.log('🚀 Spaceship buffers initialized');
    
    // Inicializar buffers de todos los asteroides
    this.asteroids.forEach((asteroid, index) => {
      asteroid.initBuffers(this.gl!);
    });
    console.log(`⭐ Initialized buffers for ${this.asteroids.length} asteroids`);
  }

  /**
   * Inicia el bucle principal del juego
   */
  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.gameLoop();
      console.log('GameEngine iniciado');
    }
  }

  /**
   * Detiene el juego
   */
  public stop(): void {
    this.isRunning = false;
    console.log('GameEngine detenido');
  }

  /**
   * Bucle principal del juego
   */
  private gameLoop = (): void => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convertir a segundos
    this.lastFrameTime = currentTime;

    // Actualizar lógica del juego
    this.update(deltaTime);

    // Renderizar frame
    this.render();

    // Programar siguiente frame
    requestAnimationFrame(this.gameLoop);
  };

  /**
   * Actualiza la lógica del juego
   */
  private update(deltaTime: number): void {
    // Actualizar nave
    this.spaceship.update(deltaTime);

    // Actualizar asteroides
    this.asteroids.forEach(asteroid => {
      asteroid.update(deltaTime);
      
      // Mantener asteroides dentro del mundo
      this.wrapPosition(asteroid);
    });

    // Detectar colisiones
    this.checkCollisions();

    // Actualizar cámara
    this.camera.update(this.spaceship, deltaTime);
  }

  /**
   * Mantiene objetos dentro de los límites del mundo
   */
  private wrapPosition(object: GameObject): void {
    const halfWorld = this.WORLD_SIZE / 2;
    
    if (object.position.x > halfWorld) object.position.x = -halfWorld;
    if (object.position.x < -halfWorld) object.position.x = halfWorld;
    
    if (object.position.y > halfWorld) object.position.y = -halfWorld;
    if (object.position.y < -halfWorld) object.position.y = halfWorld;
    
    if (object.position.z > halfWorld) object.position.z = -halfWorld;
    if (object.position.z < -halfWorld) object.position.z = halfWorld;
  }

  /**
   * Detecta colisiones entre objetos
   */
  private checkCollisions(): void {
    // Colisiones nave-asteroides
    this.asteroids.forEach((asteroid, index) => {
      if (this.spaceship.checkCollision(asteroid)) {
        console.log('¡Colisión detectada!');
        // Por ahora solo registrar la colisión
        // TODO: Implementar lógica de daño/reinicio
      }
    });
  }

  /**
   * Renderiza el frame actual
   */
  private render(): void {
    if (!this.gl || !this.shaderManager) {
      console.warn('❌ Render skipped: gl or shaderManager not available');
      return;
    }

    // Limpiar buffers
    this.webglService.clear();

    // Usar programa con iluminación
    this.shaderManager.useLitProgram();
    console.log('🎨 Rendering frame with', this.asteroids.length, 'asteroids');

    // Configurar iluminación global
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

    // Renderizar nave
    this.renderObject(this.spaceship);

    // Renderizar asteroides
    this.asteroids.forEach(asteroid => {
      this.renderObject(asteroid);
    });
  }

  /**
   * Renderiza un objeto individual
   */
  private renderObject(object: GameObject): void {
    if (!this.gl || !this.shaderManager) {
      console.warn('❌ RenderObject skipped: gl or shaderManager not available');
      return;
    }

    // Calcular matriz normal (para iluminación)
    this.calculateNormalMatrix(object.modelMatrix);
    
    console.log('🎯 Rendering object:', object.id, 'at position:', object.position);

    // Establecer matrices
    this.shaderManager.setLitMatrices(
      object.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Renderizar objeto
    object.render(this.gl, this.shaderManager.litProgram!, this.camera.viewMatrix, this.camera.projectionMatrix);
  }

  /**
   * Calcula la matriz normal para iluminación
   */
  private calculateNormalMatrix(modelMatrix: Float32Array): void {
    // La matriz normal es la inversa transpuesta de la parte superior izquierda 3x3
    // de la matriz modelo. Para transformaciones uniformes, podemos usar la matriz original.
    
    // Copiar la parte 3x3 superior izquierda
    this.normalMatrix[0] = modelMatrix[0];  this.normalMatrix[1] = modelMatrix[1];  this.normalMatrix[2] = modelMatrix[2];   this.normalMatrix[3] = 0;
    this.normalMatrix[4] = modelMatrix[4];  this.normalMatrix[5] = modelMatrix[5];  this.normalMatrix[6] = modelMatrix[6];   this.normalMatrix[7] = 0;
    this.normalMatrix[8] = modelMatrix[8];  this.normalMatrix[9] = modelMatrix[9];  this.normalMatrix[10] = modelMatrix[10]; this.normalMatrix[11] = 0;
    this.normalMatrix[12] = 0;              this.normalMatrix[13] = 0;              this.normalMatrix[14] = 0;               this.normalMatrix[15] = 1;
  }

  /**
   * Maneja eventos de teclado
   */
  public handleKeyDown(key: string): void {
    if (this.spaceship) {
      this.updateShipControls(key, true);
    }
  }

  /**
   * Maneja eventos de tecla liberada
   */
  public handleKeyUp(key: string): void {
    if (this.spaceship) {
      this.updateShipControls(key, false);
    }
  }

  /**
   * Actualiza los controles de la nave
   */
  private updateShipControls(key: string, pressed: boolean): void {
    if (!this.spaceship) return;

    switch (key.toLowerCase()) {
      case 'w':
        this.spaceship.controls.forward = pressed;
        break;
      case 's':
        this.spaceship.controls.backward = pressed;
        break;
      case 'a':
        this.spaceship.controls.left = pressed;
        break;
      case 'd':
        this.spaceship.controls.right = pressed;
        break;
      case 'q':
        this.spaceship.controls.up = pressed;
        break;
      case 'e':
        this.spaceship.controls.down = pressed;
        break;
      case 'r':
        this.spaceship.controls.rollLeft = pressed;
        break;
      case 'f':
        this.spaceship.controls.rollRight = pressed;
        break;
      case 'shift':
        this.spaceship.controls.speedUp = pressed;
        break;
      case 'control':
        this.spaceship.controls.speedDown = pressed;
        break;
    }
  }

  /**
   * Actualiza el aspect ratio cuando cambia el tamaño del canvas
   */
  public updateAspectRatio(width: number, height: number): void {
    if (this.camera) {
      this.camera.setAspectRatio(width / height);
    }
    
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  /**
   * Obtiene información de debug
   */
  public getDebugInfo(): any {
    return {
      isRunning: this.isRunning,
      objectCount: this.asteroids.length + 1,
      cameraInfo: this.camera ? this.camera.getDebugInfo() : null,
      spaceshipPosition: this.spaceship ? { ...this.spaceship.position } : null,
      spaceshipVelocity: this.spaceship ? { ...this.spaceship.velocity } : null
    };
  }

  /**
   * Limpia recursos al destruir el motor
   */
  public cleanup(): void {
    this.stop();
    
    if (this.shaderManager) {
      this.shaderManager.cleanup();
    }
    
    console.log('GameEngine limpiado');
  }
}