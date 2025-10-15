import { Injectable } from '@angular/core';
import { WebGLService } from '../services/webgl.service';
import { ParticleEffectsService } from '../services/particle-effects.service';
import { GameObject } from './GameObject';
import { Spaceship, ThrusterState } from './Spaceship';
import { Asteroid } from './Asteroid';
import { Camera, CameraMode } from './Camera';
import { ShaderManager } from './ShaderManager';
import { TextureManager } from './TextureManager';
import { HUDManager } from './hud/HUDManager';
import { ReticleManager } from './targeting';
import { TargetCatalogService } from './services/target-catalog.service';
import { TargetType, ITargetable } from './types/targeting.types';
import { runCameraSpaceshipTests } from './tests/CameraSpaceshipIntegration.test';
import { TargetDetailService } from './services/target-detail.service';
import { TargetPreviewRenderer } from './hud/TargetPreviewRenderer';

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
  private textureManager!: TextureManager;
  private particleEffects!: ParticleEffectsService;
  private hudManager!: HUDManager;
  private reticleManager!: ReticleManager;
  private targetCatalog!: TargetCatalogService;
  private targetDetails!: TargetDetailService;
  private targetPreview!: TargetPreviewRenderer;
  
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
  
  // El efecto de propulsión ahora se maneja en ParticleEffectsService
  
  // Matrices auxiliares
  private normalMatrix = new Float32Array(16);
  // Debug: track potential attribute collisions/state
  private onceLoggedAttribCollision: boolean = false;
  private lastNormalAttribEnabled: boolean | null = null;

  constructor(
    private webglService: WebGLService,
    private particleEffectsService: ParticleEffectsService,
    private reticleManagerService: ReticleManager,
    private targetCatalogService: TargetCatalogService,
    private targetDetailService: TargetDetailService
  ) {
    this.reticleManager = this.reticleManagerService;
    this.targetCatalog = this.targetCatalogService;
    this.targetDetails = this.targetDetailService;
    this.targetPreview = new TargetPreviewRenderer(256, 192);
  }

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

      // Inicializar gestor de texturas
      this.textureManager = new TextureManager(this.gl);
      this.textureManager.createMetallicTexture();
      this.textureManager.createGradientTexture();

      // Inicializar sistema de partículas
      this.particleEffects = this.particleEffectsService;
      this.particleEffects.initialize(this.shaderManager);

      // Inicializar sistema HUD con texturas dinámicas (FASE 3)
      this.hudManager = new HUDManager(this.gl);
      console.log('🎯 HUDManager inicializado con Canvas 2D → WebGL');

      // Crear cámara
      const canvas = canvasRef.nativeElement;
      const aspect = canvas.width / canvas.height;
      this.camera = new Camera(aspect);

      // Inicializar sistema de retícula con renderizado (FASE 2)
      const reticleInit = await this.reticleManager.initialize(this.camera, this.shaderManager);
      if (!reticleInit) {
        console.error('❌ Error inicializando sistema de retícula');
        return false;
      }
      console.log('🎯 ReticleManager inicializado con visual system');

      // Crear objetos del juego
      this.createGameObjects();

  // Registrar targets genéricos (por ahora solo asteroides)
  this.registerTargetsGeneric();

      // Ejecutar tests de integración cámara-nave
      this.runIntegrationTests();

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

    // DESHABILITAR culling temporalmente para depurar las alas
    this.gl.disable(this.gl.CULL_FACE);
    // this.gl.cullFace(this.gl.BACK);
    // this.gl.frontFace(this.gl.CCW);

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

    try {
      // Crear nave del jugador en el origen
      this.spaceship = new Spaceship({ x: 0, y: 0, z: 0 });
      console.log('🚀 Spaceship created successfully at position:', this.spaceship.position);
    } catch (error) {
      console.error('❌ Error creating spaceship:', error);
      throw error;
    }
    console.log('🚀 Spaceship geometry check:', {
      vertices: this.spaceship.vertices.length,
      indices: this.spaceship.indices.length,
      visible: this.spaceship.visible,
      active: this.spaceship.active
    });

    // Crear asteroides
    this.asteroids = [];
    for (let i = 0; i < this.ASTEROID_COUNT; i++) {
      // Posición inicial más cerca para debugging
      let x, y, z;
      if (i < 3) {
        // Los primeros 3 asteroides muy cerca para debug
        x = (i - 1) * 5;  // -5, 0, 5
        y = 0;
        z = 10 + i * 3;   // 10, 13, 16
      } else {
        // Los demás aleatorios pero cerca
        do {
          x = (Math.random() - 0.5) * 20; // Mundo más pequeño
          y = (Math.random() - 0.5) * 20;
          z = (Math.random() - 0.5) * 20;
        } while (Math.sqrt(x*x + y*y + z*z) < 5); // No muy cerca de la nave
      }
      
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

  private registerTargetsGeneric(): void {
    // Adaptar asteroides a ITargetable existente (ya implementan métodos requeridos)
    const asteroidTargets: ITargetable[] = this.asteroids as unknown as ITargetable[];
    this.targetCatalog.register(TargetType.ASTEROID, asteroidTargets);
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
    console.log('🚀 Spaceship buffers initialized:', {
      vertexBuffer: !!this.spaceship.vertexBuffer,
      indexBuffer: !!this.spaceship.indexBuffer,
      vertices: this.spaceship.vertices.length,
      indices: this.spaceship.indices.length
    });
    
    // Inicializar buffers de todos los asteroides
    this.asteroids.forEach((asteroid, index) => {
      asteroid.initBuffers(this.gl!);
    });
    console.log(`⭐ Initialized buffers for ${this.asteroids.length} asteroids`);
    console.log('📊 First asteroid buffer info:', {
      vertexBuffer: !!this.asteroids[0]?.vertexBuffer,
      vertices: this.asteroids[0]?.vertices.length,
      indices: this.asteroids[0]?.indices.length
    });
  }

  /**
   * Inicia el bucle principal del juego
   */
  public start(): void {
    console.log('🚀 GameEngine.start() LLAMADO:', {
      wasRunning: this.isRunning
    });
    
    if (!this.isRunning) {
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.gameLoop();
      console.log('✅ GameEngine iniciado - isRunning:', this.isRunning);
    } else {
      console.log('⚠️ GameEngine ya estaba corriendo');
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
    // DEBUG CRÍTICO - Verificar isRunning
    if (!this.isRunning) {
      console.log('⚠️ GameLoop BLOQUEADO - isRunning:', this.isRunning);
      return;
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000; // Convertir a segundos
    this.lastFrameTime = currentTime;

    // DEBUG CRÍTICO - Verificar gameLoop
    if (performance.now() % 2000 < 50) { // Cada 2 segundos
      console.log('🔄 GameEngine.gameLoop() EJECUTADO:', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        isRunning: this.isRunning,
        currentTime: Math.round(currentTime)
      });
    }

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
    // DEBUG CRÍTICO - Verificar que update se ejecuta
    if (performance.now() % 1500 < 50) { // Cada 1.5 segundos
      console.log('🎮 GameEngine.update() EJECUTADO:', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        spaceship: !!this.spaceship,
        asteroids: this.asteroids.length
      });
    }
    
    // Actualizar nave si existe
    if (!this.spaceship) {
      console.error('❌ Spaceship is undefined in update method');
      return;
    }
    
    this.spaceship.update(deltaTime);
    
    // Actualizar efectos de partículas
    this.particleEffects.updateThrusterEffect(this.spaceship, deltaTime);

    // Actualizar cámara con nueva posición
    this.camera.update(this.spaceship, deltaTime);

    // Actualizar asteroides
    this.asteroids.forEach(asteroid => {
      asteroid.update(deltaTime);
      
      // Mantener asteroides dentro del mundo
      this.wrapPosition(asteroid);
    });

    // Actualizar sistema de targeting con objetos disponibles (catálogo genérico)
    const availableTargets = this.targetCatalog.getAllTargets();
    
    // Debug ocasional para verificar targets
    if (Math.random() < 0.001) { // 0.1% chance
      console.log('🎯 GameEngine targets update:', {
        asteroidCount: this.asteroids.length,
        targetCount: availableTargets.length,
        firstTarget: availableTargets[0]?.getDisplayName() || 'none'
      });
    }
    
    // DEBUG CRÍTICO - Verificar llamada
    if (performance.now() % 2000 < 50) { // Cada 2 segundos aprox
      console.log('🚀 GameEngine→ReticleManager.update():', {
        deltaTime: Math.round(deltaTime * 1000) + 'ms',
        asteroids: this.asteroids.length,
        targets: availableTargets.length,
        firstTarget: availableTargets[0]?.getDisplayName() || 'none',
        reticleManager: !!this.reticleManager
      });
    }
    
    this.reticleManager.update(deltaTime, availableTargets);

    // Update target preview animation regardless of selection
    this.targetPreview.update(deltaTime);

    // Drive HUD Target Panel from hovered/selected targets
    const hovered = this.reticleManager.getHoveredTarget();
    const selected = this.reticleManager.getCurrentTarget() || hovered;
    if (selected) {
      // Distance
      const dx = selected.position.x - this.camera.position.x;
      const dy = selected.position.y - this.camera.position.y;
      const dz = selected.position.z - this.camera.position.z;
      const distance = Math.hypot(dx, dy, dz);

      // Relation heuristic (asteroids neutral; extend later)
  const selType = selected.getTargetType();
  const relation: 'ally' | 'neutral' | 'enemy' = (selType === TargetType.ASTEROID) ? 'neutral' : 'enemy';

      // Render preview into offscreen canvas
      this.targetPreview.renderPreview(selected);
      if (Math.random() < 0.01) {
        console.log('🎯 TargetPreview status:', (this.targetPreview as any).getStatus?.());
      }
      const previewCanvas = this.targetPreview.getCanvas();

    // Details: fetch async once per different selection (simple cache by id)
      // For now, fire-and-forget; the HUD will be updated next frame when resolved
      this.fetchAndCacheTargetDetails(selected);

  const baseDetails = (this as any)._targetDetailsCache?.[selected.id] || this.getFallbackDetails(selected);
  // Añadir propiedades visibles comunes: masa del vacío del objeto si existe
  const voidMass = (selected as any).voidMassUnits ?? 0;
  const details = { ...baseDetails, type: this.typeToLabel(selType), previewStatus: (this.targetPreview as any).getStatus?.(), voidMassUnits: voidMass } as any;

      this.hudManager.updateTargetPanel({
        name: selected.getDisplayName(),
        distance,
        relation,
        previewCanvas,
        details,
        active: true
      });
    } else {
      this.hudManager.clearTargetPanel();
    }

    // Detectar colisiones
    this.checkCollisions();
  }

  private async fetchAndCacheTargetDetails(target: ITargetable) {
    const cache = ((this as any)._targetDetailsCache ||= {});
    if (cache[target.id]) return; // Already have details
    try {
      const res = await this.targetDetails.getDetails(target);
      // Decorate asteroid details with fantastical metals when applicable
      if (res.type === TargetType.ASTEROID) {
        const variants = ['adamantium', 'mythril', 'quantum-iron', 'dark-nickel', 'starlight-opal'];
        (res.data as any).composition = variants[Math.floor(Math.random()*variants.length)];
        (res.data as any).albedo = Number((Math.random()*0.8+0.1).toFixed(2));
        (res.data as any).massTons = Math.floor(Math.random()*5000)+100;
        // Incluir masa del vacío si el target la expone
        (res.data as any).voidMassUnits = (target as any).voidMassUnits ?? 0;
      }
      cache[target.id] = res.data;
    } catch (e) {
      console.warn('Target details fetch failed', e);
    }
  }

  private getFallbackDetails(target: ITargetable) {
    if (target.getTargetType() === TargetType.ASTEROID) {
      return { composition: 'basalt', albedo: 0.3, massTons: 1200 };
    }
    return {};
  }

  private typeToLabel(t: TargetType): string {
    switch (t) {
      case TargetType.ASTEROID: return 'Asteroid';
      case TargetType.SPACESHIP: return 'Spaceship';
      case TargetType.PLANET: return 'Planet';
      case TargetType.PORTAL: return 'Portal';
      case TargetType.WAYPOINT: return 'Waypoint';
      default: return 'Unknown';
    }
  }

  // Los efectos de propulsión ahora se manejan en ParticleEffectsService

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
    
    // BYPASS TEMPORAL - Forzar update desde render
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    if (deltaTime > 0) {
      this.update(deltaTime);
      this.lastFrameTime = currentTime;
    }
    
    // Log detallado cada 60 frames para evitar spam
    if (Math.floor(performance.now() / 1000) % 3 === 0) {
      console.log('🎨 Rendering frame - Spaceship:', this.spaceship?.position, 'Asteroids:', this.asteroids.length);
      console.log('📹 Camera pos:', this.camera?.position, 'target:', this.camera?.target);
    }

    // Configurar iluminación global
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

    // Renderizar nave con shader texturizado
  this.renderSpaceship();
    
    // Renderizar efectos de partículas
    this.particleEffects.render(this.camera);

    // Cambiar de vuelta al shader estándar para asteroides
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

    // Renderizar asteroides con shader estándar
    // Establecer color marrón por defecto para asteroides
    this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4])); // Color gris-marrón rocoso
    
    this.asteroids.forEach(asteroid => {
      this.renderObject(asteroid);
    });

    // Renderizar outlines avanzados (FASE 4)
    this.renderOutlineSystem();
  }

  /**
   * Renderiza la nave con textura metálica
   */
  private renderSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship || !this.textureManager) {
      return;
    }

    // Verificar que la nave tiene buffers inicializados
    if (!this.spaceship.vertexBuffer) {
      console.error('❌ Spaceship has no vertex buffer! Skipping render.');
      return;
    }

    // Usar programa texturizado
    this.shaderManager.useTexturedProgram();

    // Debug: attribute collision check once
    if (!this.onceLoggedAttribCollision) {
      const litNormalIdx = this.shaderManager.litAttributes['normal'];
      const basicColorIdx = this.shaderManager.basicAttributes['color'];
      console.log('🔬 Attrib indices (lit.a_normal vs basic.a_color):', { litNormalIdx, basicColorIdx, equal: litNormalIdx === basicColorIdx });
      this.onceLoggedAttribCollision = true;
    }

    // Obtener texturas
    const metallicTexture = this.textureManager.getTexture('metallic');
    const gradientTexture = this.textureManager.getTexture('gradient');
    
    if (!metallicTexture || !gradientTexture) {
      console.error('❌ Missing textures for spaceship');
      return;
    }

    // Calcular matriz normal
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    // Configurar matrices
    this.shaderManager.setTexturedMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Configurar iluminación y color base metálico
    const baseColor = new Float32Array([0.7, 0.75, 0.8]); // Color metálico plateado
    this.shaderManager.setTexturedLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength,
      baseColor
    );

    // Configurar texturas
    this.shaderManager.setTexturedTextures(metallicTexture, gradientTexture);

  // Debug: before ship modules, check a_normal enabled state
  this.debugNormalAttribEnabled('before-ship-modules');

  // Renderizar usando el método texturizado personalizado
  this.renderModularSpaceship();

  // Debug: after ship modules
  this.debugNormalAttribEnabled('after-ship-modules');
  }

  /**
   * Renderiza la nave con atributos de textura
   */
  private renderTexturedSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const program = this.shaderManager.texturedProgram;
    if (!program) return;

    // Configurar atributos de posición
    const positionLocation = this.shaderManager.texturedAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.vertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar atributos de normales
    const normalLocation = this.shaderManager.texturedAttributes['normal'];
    if (normalLocation >= 0 && this.spaceship.normalBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.normalBuffer);
      this.gl.enableVertexAttribArray(normalLocation);
      this.gl.vertexAttribPointer(normalLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar atributos UV
    const uvLocation = this.shaderManager.texturedAttributes['uv'];
    if (uvLocation >= 0 && this.spaceship.uvBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.spaceship.uvBuffer);
      this.gl.enableVertexAttribArray(uvLocation);
      this.gl.vertexAttribPointer(uvLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    // Dibujar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.spaceship.indexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, this.spaceship.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar atributos
    if (positionLocation >= 0) this.gl.disableVertexAttribArray(positionLocation);
    if (normalLocation >= 0) this.gl.disableVertexAttribArray(normalLocation);
    if (uvLocation >= 0) this.gl.disableVertexAttribArray(uvLocation);
  }

  /**
   * Renderiza la nave con componentes modulares
   */
  private renderModularSpaceship(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // Renderizar cada componente de la nave por separado
    this.renderSpaceshipNose();
    this.renderSpaceshipBody();
    this.renderSpaceshipCockpit();  // Cabina del piloto
    this.renderSpaceshipEngineNozzle();  // Tubo del motor
    this.renderSpaceshipWings();
    this.renderSpaceshipThruster();
    // this.renderOrientationIndicator(); // Temporalmente deshabilitada
    
    // Renderizar HUD (solo en modo COCKPIT)
    this.renderHUDPlane();
    
    // Renderizar sistema de retícula (FASE 2)
    this.renderReticleSystem();

    // Debug: after reticle render, check which program is active
    if (this.gl) {
      const prog = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
      console.log('🔬 Program after reticle render:', { programId: prog ? (prog as any) : null });
    }
  }

  /**
   * Renderiza el cono/pirámide de la punta delantera (textura naranja)
   */
  private renderSpaceshipNose(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // No renderizar el nose en modo COCKPIT para tener vista despejada
    const isInCockpitMode = this.camera.getCurrentMode() === CameraMode.COCKPIT;
    if (isInCockpitMode) {
      return; // Salir sin renderizar nada
    }

    const noseGeometry = this.spaceship.createNoseGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría del nose
    const noseVertexBuffer = this.gl.createBuffer();
    const noseIndexBuffer = this.gl.createBuffer();

    // Configurar geometría del nose
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, noseVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, noseGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, noseIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, noseGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, noseVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color naranja para el nose
    this.shaderManager.setLitColor(new Float32Array([1.0, 0.6, 0.2]));

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, noseIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, noseGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(noseVertexBuffer);
    this.gl.deleteBuffer(noseIndexBuffer);
  }

  /**
   * Renderiza el cuerpo esférico principal (textura metálica)
   */
  private renderSpaceshipBody(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const bodyGeometry = this.spaceship.createBodyGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría del body
    const bodyVertexBuffer = this.gl.createBuffer();
    const bodyIndexBuffer = this.gl.createBuffer();

    // Configurar geometría del body
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, bodyVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, bodyGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, bodyIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, bodyGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, bodyVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color metálico plateado para el body
    this.shaderManager.setLitColor(new Float32Array([0.7, 0.7, 0.8]));

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, bodyIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, bodyGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(bodyVertexBuffer);
    this.gl.deleteBuffer(bodyIndexBuffer);
  }

  /**
   * Renderiza la cabina del piloto (esfera azul oscuro reflectante)
   */
  private renderSpaceshipCockpit(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // No renderizar la cabina en modo COCKPIT para tener vista despejada
    const isInCockpitMode = this.camera.getCurrentMode() === CameraMode.COCKPIT;
    if (isInCockpitMode) {
      return; // Salir sin renderizar nada
    }

    console.log('🛸 Renderizando cabina del piloto...');
    const cockpitGeometry = this.spaceship.createCockpitGeometry();
    console.log('🛸 Geometría de cabina creada:', cockpitGeometry.vertices.length, 'vértices');
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría de la cabina
    const cockpitVertexBuffer = this.gl.createBuffer();
    const cockpitIndexBuffer = this.gl.createBuffer();

    // Configurar geometría de la cabina
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, cockpitVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, cockpitGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, cockpitIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, cockpitGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, cockpitVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color azul eléctrico súper brillante para la cabina del piloto
    this.shaderManager.setLitColor(new Float32Array([0.0, 0.5, 1.0])); 

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, cockpitIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, cockpitGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(cockpitVertexBuffer);
    this.gl.deleteBuffer(cockpitIndexBuffer);
  }

  /**
   * Renderiza el tubo del motor que conecta el cuerpo con el thruster
   */
  private renderSpaceshipEngineNozzle(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    console.log('🔧 Renderizando tubo del motor...');
    const nozzleGeometry = this.spaceship.createEngineNozzleGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría del tubo
    const nozzleVertexBuffer = this.gl.createBuffer();
    const nozzleIndexBuffer = this.gl.createBuffer();

    // Configurar geometría del tubo
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nozzleVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, nozzleGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, nozzleIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, nozzleGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, nozzleVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color metálico oscuro para el tubo del motor
    this.shaderManager.setLitColor(new Float32Array([0.4, 0.4, 0.45])); // Gris metálico

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, nozzleIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, nozzleGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(nozzleVertexBuffer);
    this.gl.deleteBuffer(nozzleIndexBuffer);
  }

  /**
   * Renderiza las alas laterales (textura azul metálica)
   */
  private renderSpaceshipWings(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const wingsGeometry = this.spaceship.createWingsGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría de las wings
    const wingsVertexBuffer = this.gl.createBuffer();
    const wingsIndexBuffer = this.gl.createBuffer();

    // Configurar geometría de las wings
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, wingsVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, wingsGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, wingsIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, wingsGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, wingsVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color azul metálico para las wings
    this.shaderManager.setLitColor(new Float32Array([0.2, 0.4, 0.8]));

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, wingsIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, wingsGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(wingsVertexBuffer);
    this.gl.deleteBuffer(wingsIndexBuffer);
  }

  /**
   * Renderiza la esfera del thruster trasero (color dinámico rojo→amarillo)
   */
  private renderSpaceshipThruster(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    const thrusterGeometry = this.spaceship.createThrusterGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales para la geometría del thruster
    const thrusterVertexBuffer = this.gl.createBuffer();
    const thrusterIndexBuffer = this.gl.createBuffer();

    // Configurar geometría del thruster (el escalado ya está aplicado en createThrusterGeometry)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, thrusterVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, thrusterGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, thrusterIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, thrusterGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, thrusterVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color dinámico del thruster basado en el estado del motor
    let red: number, green: number, blue: number;
    const intensity = this.spaceship.thrusterIntensity;
    
    switch (this.spaceship.thrusterState) {
      case ThrusterState.IDLE:
        // Rojo suave - motor apagado
        red = 0.8; green = 0.2; blue = 0.1;
        break;
        
      case ThrusterState.ACCELERATING:
        // Amarillo/naranja súper brillante emisivo - acelerando
        red = 2.5; 
        green = 1.8 + (intensity * 0.7); // De 1.8 a 2.5 (amarillo emisivo)
        blue = 0.2;
        break;
        
      case ThrusterState.BRAKING:
        // Rojo súper intenso emisivo - frenando  
        red = 3.0;
        green = 0.3;
        blue = 0.1;
        break;
        
      case ThrusterState.CRUISING:
        // Azul plasma emisivo - manteniendo velocidad
        red = 0.3;
        green = 0.8;
        blue = 2.5 + (intensity * 0.5); // Azul plasma súper brillante
        break;
    }
    
    this.shaderManager.setLitColor(new Float32Array([red, green, blue]));

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, thrusterIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, thrusterGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // NO RESETEAR COLOR - dejar que cada objeto maneje el suyo

    // Limpiar buffers temporales
    this.gl.deleteBuffer(thrusterVertexBuffer);
    this.gl.deleteBuffer(thrusterIndexBuffer);
  }

  /**
   * Renderiza una bola negra indicadora de orientación (arriba de la nave)
   */
  private renderOrientationIndicator(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship) return;

    // Usar la geometría del thruster pero más pequeña (esfera)
    const indicatorGeometry = this.spaceship.createThrusterGeometry();
    const program = this.shaderManager.litProgram;
    if (!program) return;

    this.gl.useProgram(program);

    // Crear buffers temporales
    const indicatorVertexBuffer = this.gl.createBuffer();
    const indicatorIndexBuffer = this.gl.createBuffer();

    // Configurar geometría
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, indicatorGeometry.vertices, this.gl.STATIC_DRAW);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indicatorIndexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indicatorGeometry.indices, this.gl.STATIC_DRAW);

    // Configurar atributos
    const positionLocation = this.shaderManager.litAttributes['position'];
    if (positionLocation >= 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }

    // Crear geometría modificada: más pequeña y desplazada hacia arriba
    const modifiedVertices = new Float32Array(indicatorGeometry.vertices.length);
    
    // Escalar los vértices (hacer la bola más pequeña) y desplazar hacia arriba
    for (let i = 0; i < indicatorGeometry.vertices.length; i += 3) {
      modifiedVertices[i] = indicatorGeometry.vertices[i] * 0.3;         // X * 0.3 (más pequeña)
      modifiedVertices[i + 1] = indicatorGeometry.vertices[i + 1] * 0.3 + 0.4; // Y * 0.3 + 0.4 (arriba)
      modifiedVertices[i + 2] = indicatorGeometry.vertices[i + 2] * 0.3 + 0.2; // Z * 0.3 + 0.2 (adelante)
    }
    
    // Actualizar el buffer con la geometría modificada
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, indicatorVertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, modifiedVertices, this.gl.STATIC_DRAW);
    
    // Usar la matriz modelo de la nave directamente
    this.spaceship.updateModelMatrix();
    
    // Usar directamente la matriz de la nave (más simple)
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // NO establecer color específico - usar el color por defecto del sistema
    // Los asteroides manejan sus propios colores internamente

    // Renderizar
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indicatorIndexBuffer);
    this.gl.drawElements(this.gl.TRIANGLES, indicatorGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);

    // Limpiar buffers temporales
    this.gl.deleteBuffer(indicatorVertexBuffer);
    this.gl.deleteBuffer(indicatorIndexBuffer);
  }

  /**
   * Renderiza un objeto individual
   */
  private renderObject(object: GameObject): void {
    if (!this.gl || !this.shaderManager) {
      console.warn('❌ RenderObject skipped: gl or shaderManager not available');
      return;
    }
    
    // Verificar que el objeto tiene buffers inicializados
    if (!object.vertexBuffer) {
      console.error('❌ Object', object.id, 'has no vertex buffer! Skipping render.');
      return;
    }

    // Calcular matriz normal (para iluminación)
    this.calculateNormalMatrix(object.modelMatrix);

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

  // Debug helper: check if lit.a_normal attribute array is enabled in default VAO
  private debugNormalAttribEnabled(where: string): void {
    if (!this.gl || !this.shaderManager) return;
    const idx = this.shaderManager.litAttributes['normal'];
    if (idx < 0) return;
    const enabled = !!this.gl.getVertexAttrib(idx, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
    if (this.lastNormalAttribEnabled !== enabled) {
      console.log('🔬 a_normal enabled state changed:', { where, enabled });
      this.lastNormalAttribEnabled = enabled;
    }
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
    // Manejo de cambio de modos de cámara
    if (key === '0') {
      this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
      return;
    } else if (key === '8') {
      this.camera.setCameraMode(CameraMode.COCKPIT);
      return;
    } else if (key === '9') {
      this.camera.setCameraMode(CameraMode.REAR_TRACKING);
      return;
    }

    // Manejo de controles de nave
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
   * Maneja el zoom de la cámara
   */
  public handleZoom(delta: number): void {
    if (this.camera) {
      this.camera.handleZoom(delta);
    }
  }

  /**
   * Actualiza los controles de la nave
   */
  private updateShipControls(key: string, pressed: boolean): void {
    if (!this.spaceship) return;

    const keyLower = key.toLowerCase();

    switch (keyLower) {
      case 'w':
        this.spaceship.controls.down = pressed; // Pitch down (invertido)
        break;
      case 's':
        this.spaceship.controls.up = pressed; // Pitch up (invertido)
        break;
      case 'a':
        this.spaceship.controls.rollLeft = pressed; // Roll left
        break;
      case 'd':
        this.spaceship.controls.rollRight = pressed; // Roll right
        break;
      case 'q':
        this.spaceship.controls.left = pressed; // Yaw left
        break;
      case 'e':
        this.spaceship.controls.right = pressed; // Yaw right
        break;
      case '+':
      case '=':
        this.spaceship.controls.speedUp = pressed;
        break;
      case '-':
      case '_':
        this.spaceship.controls.speedDown = pressed;
        break;
      case 'shift': // Mantener shift como alternativa
        this.spaceship.controls.speedUp = pressed;
        break;
      case 'control': // Mantener control como alternativa
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

    // Actualizar tamaño del sistema de retícula
    if (this.reticleManager) {
      this.reticleManager.updateCanvasSize(width, height);
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
    
    if (this.textureManager) {
      this.textureManager.cleanup();
    }

    if (this.particleEffects) {
      this.particleEffects.cleanup();
    }
    
    console.log('GameEngine limpiado');
  }

  /**
   * Ejecuta tests de integración para verificar la relación cámara-nave
   */
  private runIntegrationTests(): void {
    try {
      console.log('🧪 Iniciando tests de integración cámara-nave...');
      const results = runCameraSpaceshipTests();
      
      if (results.passedTests === results.totalTests) {
        console.log(`✅ Todos los tests pasaron: ${results.passedTests}/${results.totalTests}`);
      } else {
        console.warn(`⚠️ Tests fallidos: ${results.failedTests}/${results.totalTests}`);
        console.log('📋 Detalles de tests fallidos:');
        results.details
          .filter(test => !test.passed)
          .forEach(test => {
            console.log(`  ❌ ${test.name}:`);
            console.log(`     Esperado: ${test.expected}`);
            console.log(`     Actual: ${test.actual}`);
          });
      }
    } catch (error) {
      console.error('❌ Error ejecutando tests de integración:', error);
    }
  }

  /**
   * Crea matriz de transformación para el thruster con orden correcto: Escala → Rotación → Traslación
   */
  private createThrusterMatrix(scaleFactor: number): Float32Array {
    const matrix = new Float32Array(16);
    
    // 1. Inicializar matriz identidad
    this.identityMatrix(matrix);
    
    // 2. PRIMERO: Aplicar escalado (en espacio local del objeto)
    this.scaleMatrixUniform(matrix, scaleFactor);
    
    // 3. SEGUNDO: Aplicar rotaciones (en el mismo orden que la spaceship)
    this.rotateXMatrix(matrix, this.spaceship.rotation.x);
    this.rotateYMatrix(matrix, this.spaceship.rotation.y); 
    this.rotateZMatrix(matrix, this.spaceship.rotation.z);
    
    // 4. ÚLTIMO: Aplicar traslación (mover al mundo)
    this.translateMatrix(matrix, this.spaceship.position.x, this.spaceship.position.y, this.spaceship.position.z);
    
    return matrix;
  }

  /**
   * Matriz identidad
   */
  private identityMatrix(matrix: Float32Array): void {
    matrix[0] = 1; matrix[1] = 0; matrix[2] = 0; matrix[3] = 0;
    matrix[4] = 0; matrix[5] = 1; matrix[6] = 0; matrix[7] = 0;
    matrix[8] = 0; matrix[9] = 0; matrix[10] = 1; matrix[11] = 0;
    matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
  }

  /**
   * Traslación
   */
  private translateMatrix(matrix: Float32Array, x: number, y: number, z: number): void {
    matrix[12] += matrix[0] * x + matrix[4] * y + matrix[8] * z;
    matrix[13] += matrix[1] * x + matrix[5] * y + matrix[9] * z;
    matrix[14] += matrix[2] * x + matrix[6] * y + matrix[10] * z;
  }

  /**
   * Rotación X
   */
  private rotateXMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[4] = temp[4] * cos + temp[8] * sin;
    matrix[5] = temp[5] * cos + temp[9] * sin;
    matrix[6] = temp[6] * cos + temp[10] * sin;
    matrix[8] = temp[8] * cos - temp[4] * sin;
    matrix[9] = temp[9] * cos - temp[5] * sin;
    matrix[10] = temp[10] * cos - temp[6] * sin;
  }

  /**
   * Rotación Y
   */
  private rotateYMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos - temp[8] * sin;
    matrix[1] = temp[1] * cos - temp[9] * sin;
    matrix[2] = temp[2] * cos - temp[10] * sin;
    matrix[8] = temp[0] * sin + temp[8] * cos;
    matrix[9] = temp[1] * sin + temp[9] * cos;
    matrix[10] = temp[2] * sin + temp[10] * cos;
  }

  /**
   * Rotación Z
   */
  private rotateZMatrix(matrix: Float32Array, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const temp = new Float32Array(matrix);
    
    matrix[0] = temp[0] * cos + temp[4] * sin;
    matrix[1] = temp[1] * cos + temp[5] * sin;
    matrix[2] = temp[2] * cos + temp[6] * sin;
    matrix[4] = temp[4] * cos - temp[0] * sin;
    matrix[5] = temp[5] * cos - temp[1] * sin;
    matrix[6] = temp[6] * cos - temp[2] * sin;
  }

  /**
   * Escalado uniforme
   */
  private scaleMatrixUniform(matrix: Float32Array, factor: number): void {
    matrix[0] *= factor;
    matrix[1] *= factor;
    matrix[2] *= factor;
    matrix[4] *= factor;
    matrix[5] *= factor;
    matrix[6] *= factor;
    matrix[8] *= factor;
    matrix[9] *= factor;
    matrix[10] *= factor;
  }

  /**
   * Crea la geometría del plano HUD inclinado (FASE 2)
   */
  private createHUDPlaneGeometry(): { vertices: Float32Array; indices: Uint16Array } {
    // Dimensiones del plano HUD ajustadas
    const width = 3.0;  // 1.5x más ancho (2.0 * 1.5 = 3.0)
    const height = 0.75; // Mitad de profundidad (1.5 / 2 = 0.75)
    
    // Posición relativa a la cámara (acercamos para pegar la base)
    const distance = 1.1; // Distancia de la cámara (más cerca)
    const tilt = -30 * (Math.PI / 180); // Inclinación de 30° hacia la cámara
    
    // Vértices del plano rectangular (antes de inclinar)
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    console.log('🎯 Creando geometría HUD:', {
      width, height, distance, tilt: tilt * 180 / Math.PI
    });
    
    // Crear vértices del plano inclinado (base pegada al borde inferior)
    const vertices = [
      // Esquina inferior izquierda
      -halfWidth, -halfHeight * Math.cos(tilt) - 0.5, distance + halfHeight * Math.sin(tilt),
      
      // Esquina inferior derecha  
      halfWidth, -halfHeight * Math.cos(tilt) - 0.5, distance + halfHeight * Math.sin(tilt),
      
      // Esquina superior derecha
      halfWidth, halfHeight * Math.cos(tilt) - 0.5, distance - halfHeight * Math.sin(tilt),
      
      // Esquina superior izquierda
      -halfWidth, halfHeight * Math.cos(tilt) - 0.5, distance - halfHeight * Math.sin(tilt)
    ];
    
    console.log('🎯 Vértices HUD:', vertices);
    
    // Índices para formar los triángulos del plano
    const indices = [
      0, 1, 2,  // Primer triángulo
      0, 2, 3   // Segundo triángulo
    ];
    
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
  }

  /**
   * Renderiza el HUD con texturas dinámicas (FASE 3)
   * CORREGIDO: El HUD es FIJO relativo a la cámara, no rota con la nave
   */
  private renderHUDPlane(): void {
    if (!this.gl || !this.shaderManager || !this.spaceship || !this.hudManager) {
      console.log('🚫 HUD render skipped - missing components:', {
        hasGL: !!this.gl,
        hasShaderManager: !!this.shaderManager,
        hasSpaceship: !!this.spaceship,
        hasHudManager: !!this.hudManager
      });
      return;
    }

    // DEBUG: Verificar modo de cámara actual
    const currentCameraMode = this.camera.getCurrentMode();
    console.log('🎥 HUD render attempt - Camera mode:', {
      currentMode: currentCameraMode,
      isCockpit: currentCameraMode === CameraMode.COCKPIT,
      CockpitEnum: CameraMode.COCKPIT
    });

    // Obtener datos del juego para el HUD
    const velocityMagnitude = Math.sqrt(
      this.spaceship.velocity.x ** 2 + 
      this.spaceship.velocity.y ** 2 + 
      this.spaceship.velocity.z ** 2
    );

    const gameData = {
      velocity: velocityMagnitude,
      heading: this.spaceship.rotation.y * (180 / Math.PI), // Convertir a grados
      pitch: this.spaceship.rotation.x * (180 / Math.PI),
      roll: this.spaceship.rotation.z * (180 / Math.PI),
      altitude: this.spaceship.position.y,
      speed: this.spaceship.getSpeedPercentage() * 2, // Escalar para mejor visualización
      voidEnergy: {
        current: this.spaceship.voidEnergyCurrent,
        max: this.spaceship.voidEnergyMax,
        pct: (this.spaceship.voidEnergyCurrent / this.spaceship.voidEnergyMax) * 100
      },
      weapons: this.spaceship.weapons,
      // Pasar posición de la nave para cálculo de bearing/elevación en brújula
      position: { x: this.spaceship.position.x, y: this.spaceship.position.y, z: this.spaceship.position.z }
    };

    // Sincronizar el target actual del sistema de retícula con el HUD
    try {
      const currentTarget = this.reticleManager?.getCurrentTarget ? this.reticleManager.getCurrentTarget() : null;
      if (this.hudManager?.setTarget) {
        this.hudManager.setTarget(currentTarget);
      }
    } catch (e) {
      console.warn('⚠️ No se pudo sincronizar target con HUD:', e);
    }

    // Actualizar elementos del HUD
    this.hudManager.update(gameData);

    // Renderizar HUD que se mueve CON la cámara
    this.hudManager.render(
      this.camera.getCurrentMode(),
      this.shaderManager,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.camera.position
    );

    console.log('🎯 HUD dinámico FIJO renderizado:', {
      velocity: gameData.velocity.toFixed(1),
      heading: gameData.heading.toFixed(1),
      speed: gameData.speed.toFixed(1)
    });
  }

  /**
   * Crea la matriz de transformación para el HUD (relativa a la nave)
   */
  private createHUDMatrix(): Float32Array {
    const matrix = new Float32Array(16);
    
    // Inicializar como matriz identidad
    this.identityMatrix(matrix);
    
    // Aplicar las rotaciones de la nave para que el HUD rote con ella
    this.rotateXMatrix(matrix, this.spaceship.rotation.x);
    this.rotateYMatrix(matrix, this.spaceship.rotation.y); 
    this.rotateZMatrix(matrix, this.spaceship.rotation.z);
    
    // Aplicar traslación de la nave
    this.translateMatrix(matrix, this.spaceship.position.x, this.spaceship.position.y, this.spaceship.position.z);
    
    return matrix;
  }

  /**
   * Renderiza el sistema de retícula (FASE 2)
   */
  private renderReticleSystem(): void {
    if (!this.reticleManager) return;

    const deltaTime = (performance.now() - this.lastFrameTime) / 1000;
    this.reticleManager.render(deltaTime);
  }

  /**
   * Renderiza el sistema de outlines avanzados (FASE 4)
   */
  private renderOutlineSystem(): void {
    if (!this.reticleManager || !this.camera) return;

    // Obtener todos los targets de forma genérica
    const availableTargets = this.targetCatalog.getAllTargets();

    // Renderizar outlines con matrices actuales de la cámara
    this.reticleManager.renderOutlines(
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      availableTargets
    );
  }
}
