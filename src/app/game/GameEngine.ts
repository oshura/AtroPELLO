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
import { SuperAsteroid } from './SuperAsteroid';
import { ClusterObject } from './Cluster';
import { ReticleManager } from './targeting';
import { AsteroidClusterService } from './services/game/asteroid-cluster.service';
import { TargetCatalogService } from './services/target-catalog.service';
import { TargetType, ITargetable } from './types/targeting.types';
import { runCameraSpaceshipTests } from './tests/CameraSpaceshipIntegration.test';
import { TargetDetailService } from './services/target-detail.service';
import { TargetPreviewRenderer } from './hud/TargetPreviewRenderer';
import { InstancedAsteroidRenderer } from './rendering/InstancedAsteroidRenderer';
import { Planet, PlanetColorName } from './Planet';

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
  private asteroidClusterService!: AsteroidClusterService;
  private targetCatalog!: TargetCatalogService;
  private targetDetails!: TargetDetailService;
  private targetPreview!: TargetPreviewRenderer;
  
  // Objetos del juego
  private spaceship!: Spaceship;
  private asteroids: Asteroid[] = [];
  private superAsteroids: SuperAsteroid[] = [];
  private planets: Planet[] = [];
  
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
  // Feature flag: toggle instanced rendering for asteroids
  private readonly USE_INSTANCING = true;
  private instancedRenderer: InstancedAsteroidRenderer | null = null;
  // Tipos de target que NO deben ser descartados por culling distancia/frustum
  private readonly neverCullTypes = new Set([TargetType.PLANET]);

  // VAOs/VBOs cache for spaceship modules (to avoid per-frame buffer churn)
  private shipVAO: {
    nose: WebGLVertexArrayObject | null,
    body: WebGLVertexArrayObject | null,
    cockpit: WebGLVertexArrayObject | null,
    nozzle: WebGLVertexArrayObject | null,
    wings: WebGLVertexArrayObject | null,
    thruster: WebGLVertexArrayObject | null,
  } = { nose: null, body: null, cockpit: null, nozzle: null, wings: null, thruster: null };
  private shipBuffers: {
    nose?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    body?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    cockpit?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    nozzle?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    wings?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
    thruster?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer; indexCount: number };
  } = {};

  constructor(
    private webglService: WebGLService,
    private particleEffectsService: ParticleEffectsService,
    private reticleManagerService: ReticleManager,
    private targetCatalogService: TargetCatalogService,
    private targetDetailService: TargetDetailService,
    asteroidClusterService: AsteroidClusterService
  ) {
    this.reticleManager = this.reticleManagerService;
    this.targetCatalog = this.targetCatalogService;
    this.targetDetails = this.targetDetailService;
    this.targetPreview = new TargetPreviewRenderer(256, 192);
    this.asteroidClusterService = asteroidClusterService;
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

      // Instanced renderer setup (optional)
      if (this.USE_INSTANCING) {
        this.instancedRenderer = new InstancedAsteroidRenderer(this.gl, this.shaderManager);
      }

      // Inicializar sistema de retícula con renderizado (FASE 2)
      const reticleInit = await this.reticleManager.initialize(this.camera, this.shaderManager);
      if (!reticleInit) {
        console.error('❌ Error inicializando sistema de retícula');
        return false;
      }
      console.log('🎯 ReticleManager inicializado con visual system');

      // Crear objetos del juego
      this.createGameObjects();

      // Configure targeting distance origin to use the spaceship center (so distances are reported from the ship)
      if (this.reticleManager && this.spaceship) {
        this.reticleManager.setDistanceOriginProvider(() => ({ ...this.spaceship.position }));
      }

  // Registro de targets se realiza al crear los clusters (initializeAllBuffers)

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
    // ¡CRÍTICO! Inicializar buffers WebGL para los objetos iniciales
    this.initializeAllBuffers();
  }

  // Registro de targets ahora se hace tras crear los clusters en initializeAllBuffers()
  
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
    
    // Crear varios clusters asteroidales en una cuadrícula 10x10 (100 total)
    // - 10 por línea alineados a lo largo de baseDir (50u de separación)
    // - 10 líneas paralelas separadas 50u en una dirección perpendicular a baseDir
  const CLUSTER_ROWS = 100 ; // líneas
  const CLUSTER_COLS = 10; // por línea
  // Aumentar el espaciado inicial de clusters en +100u
  const CLUSTER_SPACING_ALONG = 75; // separación a lo largo del vector base (antes 50)
  const CLUSTER_ROW_SPACING = 75; // separación entre líneas (perpendicular) (antes 50)
    const CLUSTER_SPEED = 1.5; // misma velocidad para todos
    const CLUSTER_COUNT_PER = 8; // número de asteroides pequeños por clúster
    const CLUSTER_INCLUDE_SUPER = true;
    const CLUSTER_RADIUS = 12;
    const CLUSTER_CENTER_FACTOR = 0.5;

    const baseDir = this.normalize({ x: 0.6, y: 0.2, z: 0.1 });
    const baseCenter = { x: 20, y: 0, z: 30 };

    // Vector perpendicular a baseDir para desplazar entre filas
    const up = { x: 0, y: 1, z: 0 };
    // cross(baseDir, up)
    let perp = {
      x: baseDir.y * up.z - baseDir.z * up.y,
      y: baseDir.z * up.x - baseDir.x * up.z,
      z: baseDir.x * up.y - baseDir.y * up.x,
    };
    const perpLen = Math.hypot(perp.x, perp.y, perp.z);
    if (perpLen < 1e-3) {
      // baseDir casi paralelo a up; usar eje X para calcular un perpendicular
      const right = { x: 1, y: 0, z: 0 };
      perp = {
        x: baseDir.y * right.z - baseDir.z * right.y,
        y: baseDir.z * right.x - baseDir.x * right.z,
        z: baseDir.x * right.y - baseDir.y * right.x,
      };
    }
    // normalizar perp
    const pLen = Math.hypot(perp.x, perp.y, perp.z) || 1;
    perp = { x: perp.x / pLen, y: perp.y / pLen, z: perp.z / pLen };

    const createdClusters: ReturnType<typeof this.asteroidClusterService.createCluster>[] = [];
    for (let r = 0; r < CLUSTER_ROWS; r++) {
      for (let c = 0; c < CLUSTER_COLS; c++) {
        const center = {
          x: baseCenter.x + baseDir.x * CLUSTER_SPACING_ALONG * c + perp.x * CLUSTER_ROW_SPACING * r,
          y: baseCenter.y + baseDir.y * CLUSTER_SPACING_ALONG * c + perp.y * CLUSTER_ROW_SPACING * r,
          z: baseCenter.z + baseDir.z * CLUSTER_SPACING_ALONG * c + perp.z * CLUSTER_ROW_SPACING * r,
        };
        // Pequeña perturbación para direcciones paralelas y mismo sentido
        const jitter = {
          x: (Math.random() - 0.5) * 0.02,
          y: (Math.random() - 0.5) * 0.02,
          z: (Math.random() - 0.5) * 0.02,
        };
        const dir = this.normalize({ x: baseDir.x + jitter.x, y: baseDir.y + jitter.y, z: baseDir.z + jitter.z });

        const cluster = this.asteroidClusterService.createCluster({
          id: `cluster-${r}-${c}`,
          center,
          direction: dir,
          speed: CLUSTER_SPEED,
          count: CLUSTER_COUNT_PER,
          includeSuper: CLUSTER_INCLUDE_SUPER,
          radius: CLUSTER_RADIUS,
          centerSpeedFactor: CLUSTER_CENTER_FACTOR
        });
        createdClusters.push(cluster);
      }
    }

    // Inicializar buffers de los objetos de todos los clusters
    createdClusters.forEach(c => c.objects.forEach(o => o.initBuffers(this.gl!)));

    // Registrar todos los objetos (buckets separados por tipo)
    const smalls: ITargetable[] = [];
    const supers: ITargetable[] = [];
    createdClusters.forEach(c => {
      c.objects.forEach(o => {
        if ((o as any) instanceof SuperAsteroid) supers.push(o as unknown as ITargetable);
        else smalls.push(o as unknown as ITargetable);
      });
    });
    this.targetCatalog.register(TargetType.ASTEROID, smalls);
    this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
    // Crear y registrar planetas
    this.createPlanets();
    this.planets.forEach(p => p.initBuffers(this.gl!));
    this.targetCatalog.register(TargetType.PLANET, this.planets as unknown as ITargetable[]);
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

    // Asteroides sueltos eliminados: gestionamos solo clusters
  // Actualizar clusters: mueven su centro y sincronizan física común
  this.asteroidClusterService.updateClusters(deltaTime);
  // LOD por distancia con histéresis: toProxy=750u, toFull=700u, dwell=0.4s
  const lodChanged = this.asteroidClusterService.updateLOD(this.spaceship.position, deltaTime, { toProxy: 1050, toFull: 1000, dwell: 0.4, cooldown: 1.2 });
  if (lodChanged && this.gl) {
    // Re-crear buffers para objetos nuevos (y liberar proxies antiguos)
    this.asteroidClusterService.getClusters().forEach(c => {
      if (c.lodMode === 'proxy') {
        if (c.proxy && !c.proxy.vertexBuffer) c.proxy.initBuffers(this.gl!);
      } else {
        c.objects.forEach(o => { if (!o.vertexBuffer) o.initBuffers(this.gl!); });
      }
    });
    // Re-registrar targets según modo
    const normals: ITargetable[] = [];
    const supers: ITargetable[] = [];
    const clusters: ITargetable[] = [];
    this.asteroidClusterService.getClusters().forEach(c => {
      if (c.lodMode === 'proxy' && c.proxy) clusters.push(c.proxy as unknown as ITargetable);
      if (c.lodMode === 'full') {
        c.objects.forEach(o => {
          if ((o as any) instanceof SuperAsteroid) supers.push(o as unknown as ITargetable);
          else normals.push(o as unknown as ITargetable);
        });
      }
    });
    this.targetCatalog.register(TargetType.ASTEROID, normals);
    this.targetCatalog.register(TargetType.SUPER_ASTEROID, supers);
    this.targetCatalog.register(TargetType.CLUSTER, clusters);

    // Transferencia estable de selección: solo si el clúster propietario del target actual cambia de LOD
    const current = this.reticleManager.getCurrentTarget();
    if (current) {
      const currentType = current.getTargetType();
      // Caso A: seleccionado es un miembro (asteroide/super) y su clúster colapsa a proxy
      if (currentType !== TargetType.CLUSTER) {
        const owner = this.asteroidClusterService
          .getClusters()
          .find(c => c.objects.some(o => o.id === current.id));
        if (owner && owner.lodMode === 'proxy' && owner.proxy) {
          // Persistir el miembro seleccionado para restaurar al expandir
          owner.lastSelectedMemberId = current.id;
          owner.freezeBySelection = true; // evitar flip inmediato que vuelva a mover selección
          this.reticleManager.selectTarget(owner.proxy as unknown as ITargetable);
        }
      } else {
        // Caso B: seleccionado es un proxy de clúster y su clúster expande a full
        // Nota: switchToFull() elimina el proxy; por tanto, no confíes solo en c.proxy para encontrar al dueño.
        const clusters = this.asteroidClusterService.getClusters();
        const suffix = '-cluster';
        const clusterId = current.id.endsWith(suffix) ? current.id.slice(0, -suffix.length) : current.id;
        const owner = clusters.find(c => (c.proxy && c.proxy.id === current.id) || c.id === clusterId);
        if (owner && owner.lodMode === 'full') {
          // Si hay un miembro previamente seleccionado, restaurarlo; si no, usar el primero
          const preferredId = owner.lastSelectedMemberId;
          const next = preferredId ? owner.objects.find(o => o.id === preferredId) : owner.objects?.[0];
          if (next) this.reticleManager.selectTarget(next as unknown as ITargetable);
          owner.freezeBySelection = true; // proteger un ciclo de LOD tras restaurar
        }
      }
    }
  }
  // Aplicar update a cada objeto del cluster (mueve posición según direction/driftSpeed) o proxy
  this.asteroidClusterService.getClusters().forEach(c => {
    if (c.lodMode === 'proxy') {
      if (c.proxy) c.proxy.update(deltaTime);
    }
    // Limpiar la bandera de freeze tras aplicar el frame
    if (c.freezeBySelection) c.freezeBySelection = false;
  });
  // Centro conduce a los miembros en 'full': evita integrar física por objeto
  this.asteroidClusterService.applyCenterDrivenFullUpdate(deltaTime);
  // Actualizar órbitas de planetas
  this.updatePlanets(deltaTime);
  // Persistencia: no re-centrar por defecto; dejamos vivir alrededor del centro
  // (Si se desea contención, llamar a enforceBoundsRelativeToCenter(threshold) aquí)

    // Superasteroides sueltos eliminados: vienen del cluster

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
  asteroids: this.targetCatalog.getByType(TargetType.ASTEROID).length,
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

    // Relation heuristic: asteroids, super-asteroids, clusters, and planets are neutral
  const selType = selected.getTargetType();
  const isNeutral = selType === TargetType.ASTEROID || selType === TargetType.SUPER_ASTEROID || selType === TargetType.CLUSTER || selType === TargetType.PLANET;
  const relation: 'ally' | 'neutral' | 'enemy' = isNeutral ? 'neutral' : 'enemy';

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
  // Mostrar etiqueta explícita para SuperAsteroid en el HUD
  const isSuper = (selected instanceof SuperAsteroid);
  const typeLabel = isSuper ? 'SuperAsteroid' : this.typeToLabel(selType);
  const details = { ...baseDetails, type: typeLabel, previewStatus: (this.targetPreview as any).getStatus?.(), voidMassUnits: voidMass } as any;

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
        // No sobreescribir composición/albedo/mass si ya vienen fijados por la factoría
        const data: any = res.data as any;
        data.composition = data.composition ?? (target as any).composition ?? 'mixed';
        data.albedo = data.albedo ?? (target as any).albedo ?? Number((0.4 + Math.random() * 0.2).toFixed(2));
        data.massTons = data.massTons ?? (target as any).massTons ?? (50 + Math.floor(Math.random() * 101));
        // Incluir masa del vacío si el target la expone
        data.voidMassUnits = (target as any).voidMassUnits ?? 0;
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
      case TargetType.CLUSTER: return 'Cluster';
      case TargetType.SUPER_ASTEROID: return 'SuperAsteroid';
      case TargetType.ASTEROID: return 'Asteroid';
      case TargetType.SPACESHIP: return 'Spaceship';
      case TargetType.PLANET: return 'Planet';
      case TargetType.PORTAL: return 'Portal';
      case TargetType.WAYPOINT: return 'Waypoint';
      default: return 'Unknown';
    }
  }

  // Los efectos de propulsión ahora se manejan en ParticleEffectsService

  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
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
    // Parámetros especulares globales por defecto
    this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.15, 32.0);
    // Establecer un color base por defecto para lit en el frame (evita depender de draws previos)
    this.shaderManager.setLitColor(new Float32Array([0.7, 0.75, 0.8]));

    // Renderizar nave con shader texturizado
  this.renderSpaceship();
    
    // Renderizar efectos de partículas en programa básico (usa additive blending)
    // Asegurar que el estado de la nave/asteroides no se contamine
    this.particleEffects.render(this.camera);
    // Reforzar de nuevo programa lit y su iluminación tras partículas
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

    // Cambiar de vuelta al shader estándar para asteroides
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
    // Color base por defecto de asteroides (si no se establece luego)
    this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4]));

  // Renderizar asteroides del cluster con shader estándar
  this.shaderManager.setLitColor(new Float32Array([0.6, 0.5, 0.4])); // Color gris-marrón rocoso

    // Renderizar objetos de clusters o proxy según LOD
  // Asegurar blending para soportar opacidades en fades
  this.gl.enable(this.gl.BLEND);
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

  if (this.USE_INSTANCING && this.instancedRenderer) {
      // Gather batches
      const smalls: GameObject[] = [];
      const supers: GameObject[] = [];
      this.asteroidClusterService.getClusters().forEach(c => {
        // Cluster-level frustum/distance culling (skip entire cluster if not visible)
        if (!this.isClusterVisible(c, 5000, TargetType.CLUSTER)) {
          return;
        }
        // Si estamos en modo proxy y hay representante, renderizarlo sin fade
        if (c.lodMode === 'proxy' && c.representativeId) {
          const rep = c.objects.find(o => o.id === c.representativeId);
          if (rep) {
            // Asegurar opacidad completa para el representante
            (rep as any).renderOpacity = 1.0;
            if ((rep as any) instanceof SuperAsteroid) supers.push(rep);
            else smalls.push(rep);
          }
        } else if (c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          // Si no hay representante, usar el proxy visual
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        // Miembros: instanciar si lod 'full' o si estamos fadeando hacia proxy
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy');
        if (shouldRenderMembers) {
          for (const o of c.objects) {
            // Evitar duplicar el representante si ya se añadió explícitamente
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) continue;
            if ((o as any) instanceof SuperAsteroid) supers.push(o);
            else smalls.push(o);
          }
        }
      });
      this.instancedRenderer.renderBatches(
        smalls,
        supers,
        this.camera.viewMatrix,
        this.camera.projectionMatrix,
        this.lightDirection,
        this.lightColor,
        this.ambientColor,
        this.ambientStrength,
        new Float32Array([0.6, 0.5, 0.4])
      );
      // Tras instancing, reforzar estado lit y limpiar divisores/atributos
      this.resetGLForLitDraw();
      this.shaderManager.useLitProgram();
      this.shaderManager.setLighting(
        this.lightDirection,
        this.lightColor,
        this.ambientColor,
        this.ambientStrength
      );
    } else {
      this.asteroidClusterService.getClusters().forEach(c => {
        // Cluster-level frustum/distance culling (skip entire cluster if not visible)
        if (!this.isClusterVisible(c, 4000, TargetType.CLUSTER)) {
          return;
        }
        // Proxy si existe y relevante, salvo que tengamos un representante
        if (!c.representativeId && c.proxy && (c.lodMode === 'proxy' || (c.fade && c.fade.target === 'members'))) {
          this.shaderManager.setLitOpacity((c.proxy as any).renderOpacity ?? 1.0);
          this.renderObject(c.proxy);
        }
        // Miembros si corresponde
        const shouldRenderMembers = c.lodMode === 'full' || (c.fade && c.fade.target === 'proxy') || (c.lodMode === 'proxy' && !!c.representativeId);
        if (shouldRenderMembers) {
          c.objects.forEach(o => {
            // Evitar doble render del representante (no instanciado) en proxy
            if (c.lodMode === 'proxy' && c.representativeId && o.id === c.representativeId) return;
            this.shaderManager.setLitOpacity((o as any).renderOpacity ?? 1.0);
            this.renderObject(o);
          });
          // Render explícito del representante en no instanciado si aplica
          if (c.lodMode === 'proxy' && c.representativeId) {
            const rep = c.objects.find(o => o.id === c.representativeId);
            if (rep) {
              this.shaderManager.setLitOpacity(1.0);
              this.renderObject(rep);
            }
          }
        }
      });
    }

    // Renderizar outlines avanzados (FASE 4)
    this.renderOutlineSystem();

    // Renderizar planetas al final para asegurar consistencia de estado
    this.renderPlanets();
  }

  /** Crea 9 planetas en órbitas elípticas concéntricas en el plano XZ */
  private createPlanets(): void {
    // Si ya existen, no recrear
    if (this.planets.length > 0) return;
    const colors: PlanetColorName[] = ['verde','azul_hielo','marron','gris','azul_marino','rojo_carmesi','violeta_oscuro','azul_hielo','marron'];
    const center = { x: 0, y: 0, z: 0 };
  const minA = 50000; const maxA = 100000;
  const count = 9;
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      const a = Math.round(minA + t * (maxA - minA)); // semi-eje mayor
      const e = 0.25 + Math.random() * 0.25; // excentricidad moderada 0.25..0.5
      const b = Math.round(a * Math.sqrt(1 - e * e)); // semi-eje menor
      const orient = Math.random() * Math.PI * 2;
      const angle0 = Math.random() * Math.PI * 2;
      const diameter = 200 + Math.random() * 800; // 200..1000 diag → radio 100..500
      const radius = diameter * 0.5;
      const color = colors[i % colors.length];
      // Posición inicial en la elipse
      const cx = Math.cos(angle0) * a;
      const cz = Math.sin(angle0) * b;
      const pos = { x: center.x + (cx * Math.cos(orient) - cz * Math.sin(orient)), y: 0, z: center.z + (cx * Math.sin(orient) + cz * Math.cos(orient)) };
      const planet = new Planet(`planet-${i}`, color, radius, pos);
      planet.orbitCenter = { ...center };
      planet.semiMajor = a;
      planet.semiMinor = b;
      planet.orbitOrientation = orient;
      planet.orbitAngle = angle0;
      // Velocidad angular inversamente proporcional a a^{3/2} (heurística kepleriana)
      planet.orbitAngularSpeed = 0.00003 * Math.pow(50000 / a, 1.5);
      // Lenta rotación propia
      planet.angularVelocity.y = 0.0001 + Math.random() * 0.0002;
      this.planets.push(planet);
    }
  }

  /** Actualiza la posición/orientación de planetas según su órbita */
  private updatePlanets(dt: number): void {
    for (const p of this.planets) {
      p.orbitAngle += p.orbitAngularSpeed * dt;
      // Mantener ángulo en rango
      if (p.orbitAngle > Math.PI * 2) p.orbitAngle -= Math.PI * 2;
      if (p.orbitAngle < 0) p.orbitAngle += Math.PI * 2;
      const cx = Math.cos(p.orbitAngle) * p.semiMajor;
      const cz = Math.sin(p.orbitAngle) * p.semiMinor;
      // Rotar el punto de la elipse por la orientación
      const x = cx * Math.cos(p.orbitOrientation) - cz * Math.sin(p.orbitOrientation);
      const z = cx * Math.sin(p.orbitOrientation) + cz * Math.cos(p.orbitOrientation);
      p.position.x = p.orbitCenter.x + x;
      p.position.y = 0;
      p.position.z = p.orbitCenter.z + z;
      // Rotación propia ya se aplica en update, pero aquí actualizamos matrices sin integrar física
      p.update(0);
    }
  }

  /** Renderiza planetas: lejos = lit monocromo; cerca (<10k) = shader texturizado tintado */
  private renderPlanets(): void {
    if (!this.gl || !this.shaderManager) return;
    const cam = this.camera;
    // Guardar estado mínimo para no interferir con otros pases
    const prevProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    const wasBlend = this.gl.isEnabled(this.gl.BLEND);
    for (const p of this.planets) {
      // Distancia desde la nave (criterio de cercanía pedido)
      const dx = p.position.x - this.spaceship.position.x;
      const dy = p.position.y - this.spaceship.position.y;
      const dz = p.position.z - this.spaceship.position.z;
      const distShip = Math.hypot(dx, dy, dz);

      if (distShip < 10000) {
        // Texturizado tintado con baseColor
        this.shaderManager.useTexturedProgram();
        // Matrices
        this.calculateNormalMatrix(p.modelMatrix);
        this.shaderManager.setTexturedMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
        // Iluminación y color base = color del planeta
        const base = new Float32Array([p.color.r, p.color.g, p.color.b]);
        this.shaderManager.setTexturedLighting(this.lightDirection, this.lightColor, this.ambientColor, this.ambientStrength, base);
        // Texturas disponibles (usamos metálica+gradient para simular patrones y que “parezca” tormentas/tierra/agua)
        const metallicTexture = this.textureManager.getTexture('metallic');
        const gradientTexture = this.textureManager.getTexture('gradient');
        if (metallicTexture && gradientTexture) {
          this.shaderManager.setTexturedTextures(metallicTexture, gradientTexture);
        }
        // Dibujar
        p.render(this.gl, this.shaderManager.texturedProgram!, cam.viewMatrix, cam.projectionMatrix);
      } else {
        // Lit monocromo con su color base
        this.shaderManager.useLitProgram();
        this.calculateNormalMatrix(p.modelMatrix);
        this.shaderManager.setLitMatrices(p.modelMatrix, cam.viewMatrix, cam.projectionMatrix, this.normalMatrix);
        this.shaderManager.setLitColor(new Float32Array([p.color.r, p.color.g, p.color.b]));
        p.render(this.gl, this.shaderManager.litProgram!, cam.viewMatrix, cam.projectionMatrix);
      }
    }
    // Desbindeo explícito de texturas usadas por el pase texturizado de planetas
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE0);
    // Restaurar estado
    if (!wasBlend) this.gl.disable(this.gl.BLEND);
    if (prevProgram) this.gl.useProgram(prevProgram);
  }

  /**
   * Cluster-level frustum/distance culling.
   * Returns true if the cluster's bounding sphere intersects the camera frustum cone approximation.
   * Also applies a hard distance cutoff (farDistance).
   */
  private isClusterVisible(cluster: any, farDistance: number = 4000, type?: TargetType): boolean {
    // Excepción por tipo: ciertos tipos nunca se cullan (p.ej., PLANET)
    if (type !== undefined && this.neverCullTypes.has(type)) return true;
    // Compute bounding radius from persistent offsets (stable across LOD)
    let radius = (cluster.config?.radius ?? 10);
    if (cluster.memberOffsets) {
      for (const off of cluster.memberOffsets.values()) {
        const d = Math.hypot(off.x, off.y, off.z);
        if (d > radius) radius = d;
      }
    }
    const center = cluster.center;
    const camPos = this.camera.position;
    const toC = { x: center.x - camPos.x, y: center.y - camPos.y, z: center.z - camPos.z };
    const dist = Math.hypot(toC.x, toC.y, toC.z);
    // Hard cutoff: if sphere entirely beyond farDistance, cull
    if (dist - radius > farDistance) return false;

    // Build camera basis
    const fwd = this.normalize({ x: this.camera.target.x - camPos.x, y: this.camera.target.y - camPos.y, z: this.camera.target.z - camPos.z });
    // Ensure up basis is orthonormal
    const worldUp = this.camera.up;
    const right = this.normalize({
      x: fwd.y * worldUp.z - fwd.z * worldUp.y,
      y: fwd.z * worldUp.x - fwd.x * worldUp.z,
      z: fwd.x * worldUp.y - fwd.y * worldUp.x,
    });
    const upB = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    };

    // Coordinates in camera basis
    const depth = toC.x * fwd.x + toC.y * fwd.y + toC.z * fwd.z;
    const sideX = toC.x * right.x + toC.y * right.y + toC.z * right.z;
    const sideY = toC.x * upB.x + toC.y * upB.y + toC.z * upB.z;

    // Behind camera completely (allow small radius tolerance)
    if (depth + radius <= 0) return false;

    // Get tan(fov/2) from projection matrix, and aspect from proj[5]/proj[0]
    const proj = this.camera.projectionMatrix as unknown as Float32Array;
    const f = proj[5] || 1; // f = 1/tan(fov/2)
    const tanHalfFovy = 1 / f;
    const aspect = (proj[0] !== 0) ? (f / (proj[0])) : 1.7777778;
    const tanHalfFovx = tanHalfFovy * aspect;

    // Frustum side checks with radius inflation
    const halfW = depth * tanHalfFovx + radius;
    const halfH = depth * tanHalfFovy + radius;
    if (Math.abs(sideX) > halfW) return false;
    if (Math.abs(sideY) > halfH) return false;

    return true;
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

    // Aislar: la nave se renderiza SOLO con el shader lit
    this.resetGLForLitDraw();

    // Debug: attribute collision check once
    if (!this.onceLoggedAttribCollision) {
      const litNormalIdx = this.shaderManager.litAttributes['normal'];
      const basicColorIdx = this.shaderManager.basicAttributes['color'];
      console.log('🔬 Attrib indices (lit.a_normal vs basic.a_color):', { litNormalIdx, basicColorIdx, equal: litNormalIdx === basicColorIdx });
      this.onceLoggedAttribCollision = true;
    }

    // Calcular matriz normal
    this.calculateNormalMatrix(this.spaceship.modelMatrix);
    // Configurar matrices para lit y asegurar iluminación
    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );

  // Debug: before ship modules, check a_normal enabled state
  this.debugNormalAttribEnabled('before-ship-modules');

  // Renderizar usando el método texturizado personalizado
  this.renderModularSpaceship();

  // Debug: after ship modules
  this.debugNormalAttribEnabled('after-ship-modules');
  }

  // Aísla el draw lit: apaga blending, desbindea texturas y reestablece programa/iluminación para la nave
  private resetGLForLitDraw(): void {
    if (!this.gl || !this.shaderManager) return;
    // Transparencias fuera para la nave
    this.gl.disable(this.gl.BLEND);
    // Deshabilitar todos los atributos de vértice y limpiar divisores de instancing
    const maxAttribs = this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS) as number;
    for (let i = 0; i < maxAttribs; i++) {
      const enabled = this.gl.getVertexAttrib(i, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED) as boolean;
      if (enabled) this.gl.disableVertexAttribArray(i);
      // Asegurar divisor a 0 para evitar residuales de instancing
      this.gl.vertexAttribDivisor(i, 0);
    }
    // Desvincular ARRAY_BUFFER genérico para evitar punteros colgantes
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    // Desbindeo de texturas por si un pase texturizado dejó algo activo
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    this.gl.activeTexture(this.gl.TEXTURE0);
    // Reforzar shader lit y su iluminación
    this.shaderManager.useLitProgram();
    this.shaderManager.setLighting(
      this.lightDirection,
      this.lightColor,
      this.ambientColor,
      this.ambientStrength
    );
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

  // Ensure VAO and buffers for a ship module; compute normals once
  private ensureShipModuleVAO(
    key: keyof GameEngine['shipVAO'],
    geometry: { vertices: Float32Array; indices: Uint16Array },
    normalAttribName: 'normal' = 'normal'
  ): void {
    if (!this.gl || !this.shaderManager) return;
    // Create buffers if missing
    if (!this.shipBuffers[key]) {
      const v = this.gl.createBuffer()!;
      const n = this.gl.createBuffer()!;
      const i = this.gl.createBuffer()!;
      // Upload geometry
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, v);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, geometry.vertices, this.gl.STATIC_DRAW);
      const normals = this.computeNormals(geometry.vertices, geometry.indices);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, n);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, normals, this.gl.STATIC_DRAW);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, i);
      this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, geometry.indices, this.gl.STATIC_DRAW);
      this.shipBuffers[key] = { v, n, i, indexCount: geometry.indices.length } as any;
    }
    // Create VAO if missing
    if (!this.shipVAO[key]) {
      const vao = this.gl.createVertexArray();
      if (!vao) return;
      this.shipVAO[key] = vao;
      this.gl.bindVertexArray(vao);
      // Bind attribute layout for lit program
      const aPos = this.shaderManager.litAttributes['position'];
      const aNrm = this.shaderManager.litAttributes[normalAttribName];
      // Position
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers[key]!.v);
      if (aPos >= 0) {
        this.gl.enableVertexAttribArray(aPos);
        this.gl.vertexAttribPointer(aPos, 3, this.gl.FLOAT, false, 0, 0);
      }
      // Normal
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.shipBuffers[key]!.n);
      if (aNrm >= 0) {
        this.gl.enableVertexAttribArray(aNrm);
        this.gl.vertexAttribPointer(aNrm, 3, this.gl.FLOAT, false, 0, 0);
      }
      // Indices
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.shipBuffers[key]!.i);
      // Unbind VAO
      this.gl.bindVertexArray(null);
    }
  }

  private drawShipModule(key: keyof GameEngine['shipVAO']): void {
    if (!this.gl) return;
    if (!this.shipVAO[key] || !this.shipBuffers[key]) return;
    this.gl.bindVertexArray(this.shipVAO[key]);
    this.gl.drawElements(this.gl.TRIANGLES, this.shipBuffers[key]!.indexCount, this.gl.UNSIGNED_SHORT, 0);
    this.gl.bindVertexArray(null);
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('nose', noseGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color naranja para el nose (asegurar baseColor por módulo)
  this.shaderManager.setLitColor(new Float32Array([1.0, 0.6, 0.2]));

    // Draw
    this.drawShipModule('nose');
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('body', bodyGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

    // Color metálico plateado para el body (asegurar baseColor por módulo)
  this.shaderManager.setLitColor(new Float32Array([0.7, 0.7, 0.8]));
    // Especular metálico medio para el cuerpo
    this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.25, 48.0);

    // Draw
    this.drawShipModule('body');
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('cockpit', cockpitGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color azul eléctrico para la cabina del piloto (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.0, 0.5, 1.0])); 

    // Draw
    this.drawShipModule('cockpit');
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('nozzle', nozzleGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color metálico oscuro para el tubo del motor (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.4, 0.4, 0.45])); // Gris metálico

    // Draw
    this.drawShipModule('nozzle');
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('wings', wingsGeometry);

    // Configurar matriz de transformación
    this.spaceship.updateModelMatrix();
    this.calculateNormalMatrix(this.spaceship.modelMatrix);

    this.shaderManager.setLitMatrices(
      this.spaceship.modelMatrix,
      this.camera.viewMatrix,
      this.camera.projectionMatrix,
      this.normalMatrix
    );

  // Color azul metálico para las wings (asegurar baseColor)
  this.shaderManager.setLitColor(new Float32Array([0.2, 0.4, 0.8]));

    // Draw
    this.drawShipModule('wings');
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
    // Ensure VAO + buffers
    this.ensureShipModuleVAO('thruster', thrusterGeometry);

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
  // Especular alto para tobera brillante
  this.shaderManager.setSpecular(new Float32Array([this.camera.position.x, this.camera.position.y, this.camera.position.z]), 0.4, 64.0);

  // Draw
  this.drawShipModule('thruster');

    // NO RESETEAR COLOR - dejar que cada objeto maneje el suyo

    // No buffer deletion; cached
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

  // Calcula normales por vértice acumulando normales de cara y normalizando
  private computeNormals(vertices: Float32Array, indices: Uint16Array): Float32Array {
    const vCount = vertices.length / 3;
    const normals = new Float32Array(vertices.length);
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      const v0x = vertices[i0], v0y = vertices[i0 + 1], v0z = vertices[i0 + 2];
      const v1x = vertices[i1], v1y = vertices[i1 + 1], v1z = vertices[i1 + 2];
      const v2x = vertices[i2], v2y = vertices[i2 + 1], v2z = vertices[i2 + 2];
      const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
      const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
      // Cross e1 x e2
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
      normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
      normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
    }
    // Normalize
    for (let i = 0; i < vCount; i++) {
      const ix = i * 3;
      const nx = normals[ix], ny = normals[ix + 1], nz = normals[ix + 2];
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[ix] = nx / len; normals[ix + 1] = ny / len; normals[ix + 2] = nz / len;
    }
    return normals;
  }

  /**
   * Maneja eventos de teclado
   */
  public handleKeyDown(key: string): void {
    // Manejo de cambio de modos de cámara
    if (key === '0') {
      this.camera.setCameraMode(CameraMode.INMOVILE_EXTERNAL);
      return;
    } else if (key === '7') {
      this.camera.setCameraMode(CameraMode.REAR_VIEW);
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
   * Deselecciona el target actual (usado por Escape desde el componente Game)
   */
  public clearTargetSelection(): void {
    try {
      if (this.reticleManager && this.reticleManager.selectTarget) {
        this.reticleManager.selectTarget(null);
      }
    } catch {}
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
        this.spaceship.controls.left = pressed; // Yaw left (remapeado)
        break;
      case 'd':
        this.spaceship.controls.right = pressed; // Yaw right (remapeado)
        break;
      case 'q':
        this.spaceship.controls.rollLeft = pressed; // Roll left (remapeado)
        break;
      case 'e':
        this.spaceship.controls.rollRight = pressed; // Roll right (remapeado)
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
    // Cleanup VAOs and buffers for ship modules
    if (this.gl) {
      const delVAO = (v: WebGLVertexArrayObject | null) => { if (v) this.gl!.deleteVertexArray(v); };
      delVAO(this.shipVAO.nose); delVAO(this.shipVAO.body); delVAO(this.shipVAO.cockpit);
      delVAO(this.shipVAO.nozzle); delVAO(this.shipVAO.wings); delVAO(this.shipVAO.thruster);
      const delBuf = (b?: { v: WebGLBuffer; n: WebGLBuffer; i: WebGLBuffer }) => {
        if (!b) return; this.gl!.deleteBuffer(b.v); this.gl!.deleteBuffer(b.n); this.gl!.deleteBuffer(b.i);
      };
      delBuf(this.shipBuffers.nose); delBuf(this.shipBuffers.body); delBuf(this.shipBuffers.cockpit);
      delBuf(this.shipBuffers.nozzle); delBuf(this.shipBuffers.wings); delBuf(this.shipBuffers.thruster);
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
