import { CameraMode } from '../Camera';
import { HUDTexture } from './HUDTexture';
import { VelocityBar } from './elements/VelocityBar';
import { Compass } from './elements/Compass';
import { NavigationSphere } from './elements/NavigationSphere';
import { SpeedometerDigital } from './elements/SpeedometerDigital';

/**
 * Administrador principal del sistema HUD
 * Coordina todos los elementos y la textura dinámica
 * FASE 3: Sistema de texturas dinámicas Canvas 2D → WebGL
 */
export class HUDManager {
  private gl: WebGL2RenderingContext;
  private hudTexture: HUDTexture;
  
  // Elementos del HUD
  private velocityBarLeft: VelocityBar;
  private velocityBarRight: VelocityBar;
  private compass: Compass;
  private navigationSphere: NavigationSphere;
  private speedometer: SpeedometerDigital;
  
  // Geometría del plano HUD
  private hudGeometry: { vertices: Float32Array; indices: Uint16Array } | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    
    // Inicializar sistema de texturas dinámicas
    this.hudTexture = new HUDTexture(gl, 1024, 768);
    
    // Inicializar elementos del HUD
    this.velocityBarLeft = new VelocityBar('left');
    this.velocityBarRight = new VelocityBar('right');
    this.compass = new Compass();
    this.navigationSphere = new NavigationSphere();
    this.speedometer = new SpeedometerDigital();
    
    // Crear geometría del plano
    this.createHUDPlaneGeometry();
    
    console.log('🎯 HUDManager inicializado con texturas dinámicas');
  }

  /**
   * Actualiza todos los elementos del HUD con datos del juego
   */
  public update(gameData: {
    velocity: number;
    heading: number;
    pitch: number;
    roll: number;
    altitude: number;
    speed: number;
  }): void {
    // Actualizar elementos individuales
    this.velocityBarLeft.update(gameData.velocity);
    this.velocityBarRight.update(gameData.velocity);
    this.compass.update(gameData.heading);
    this.navigationSphere.update(gameData.pitch, gameData.roll, gameData.heading);
    this.speedometer.update(gameData.speed);
    
    // Renderizar todos los elementos en la textura
    this.renderToTexture();
  }

  /**
   * Renderiza el HUD solo en modo COCKPIT
   */
  public render(cameraMode: CameraMode, shaderManager: any): void {
    if (cameraMode !== CameraMode.COCKPIT || !this.hudGeometry) {
      return;
    }

    console.log('🎯 Renderizando HUD dinámico en modo COCKPIT');
    
    // Configurar shader y buffers
    this.setupRenderingState(shaderManager);
    
    // Renderizar el plano con textura dinámica
    this.gl.drawElements(this.gl.TRIANGLES, this.hudGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);
  }

  /**
   * Renderiza todos los elementos HUD en la textura dinámica
   */
  private renderToTexture(): void {
    const canvas = this.hudTexture.getCanvas();
    const ctx = canvas.getContext('2d')!;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fondo semitransparente para debugging
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Renderizar cada elemento en su posición
    this.velocityBarLeft.render(ctx, { x: 50, y: 100 });
    this.velocityBarRight.render(ctx, { x: canvas.width - 100, y: 100 });
    this.compass.render(ctx, { x: canvas.width / 2, y: 80 });
    this.navigationSphere.render(ctx, { x: canvas.width / 2, y: canvas.height / 2 });
    this.speedometer.render(ctx, { x: canvas.width / 2, y: canvas.height - 100 });
    
    // Actualizar textura WebGL
    this.hudTexture.updateTexture();
  }

  /**
   * Configura el estado de renderizado para el HUD
   */
  private setupRenderingState(shaderManager: any): void {
    // Enlazar textura del HUD
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.hudTexture.getWebGLTexture());
    
    // Configurar buffers de geometría
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    // Configurar atributos de shader
    const positionLocation = shaderManager.basicAttributes?.['position'] ?? -1;
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 0, 0);
    }
  }

  /**
   * Crea la geometría del plano HUD inclinado (usa la geometría de FASE 2)
   */
  private createHUDPlaneGeometry(): void {
    const width = 3.0;
    const height = 0.75;
    const distance = 1.1;
    const tilt = -30 * (Math.PI / 180);
    
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    console.log('🎯 Creando geometría HUD para texturas dinámicas:', {
      width, height, distance, tilt: tilt * 180 / Math.PI
    });
    
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

    const indices = [
      0, 1, 2,
      0, 2, 3
    ];

    this.hudGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
    
    this.createBuffers();
  }

  /**
   * Crea los buffers WebGL para la geometría
   */
  private createBuffers(): void {
    if (!this.hudGeometry) return;
    
    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.hudGeometry.vertices, this.gl.STATIC_DRAW);
    
    this.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.hudGeometry.indices, this.gl.STATIC_DRAW);
  }

  /**
   * Limpia recursos WebGL
   */
  public dispose(): void {
    if (this.vertexBuffer) {
      this.gl.deleteBuffer(this.vertexBuffer);
    }
    if (this.indexBuffer) {
      this.gl.deleteBuffer(this.indexBuffer);
    }
    this.hudTexture.dispose();
  }
}