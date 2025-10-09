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
   * TEMPORAL: Usando litProgram hasta resolver texturas
   */
  public render(cameraMode: CameraMode, shaderManager: any, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (cameraMode !== CameraMode.COCKPIT || !this.hudGeometry) {
      return;
    }

    console.log('🎯 Verificando posición HUD inclinado 30° (temporalmente magenta)');
    
    // Usar shader básico para verificar posición
    const program = shaderManager.litProgram;
    if (!program) {
      console.error('❌ litProgram no disponible');
      return;
    }

    this.gl.useProgram(program);
    
    // Configurar shader básico
    this.setupBasicRenderingState(shaderManager);
    
    // Configurar matrices para HUD fijo
    this.setupBasicHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
    
    // Color magenta para verificar posición
    shaderManager.setLitColor(new Float32Array([1.0, 0.0, 1.0]));
    
    // Debug: verificar estado del renderizado
    console.log('🔍 Estado HUD debug:', {
      vertices: this.hudGeometry.vertices.length,
      indices: this.hudGeometry.indices.length,
      program: this.gl.getParameter(this.gl.CURRENT_PROGRAM),
      cullFace: this.gl.getParameter(this.gl.CULL_FACE),
      depthTest: this.gl.getParameter(this.gl.DEPTH_TEST)
    });
    
    // Desactivar depth test temporalmente para forzar visibilidad
    const depthTestEnabled = this.gl.getParameter(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.DEPTH_TEST);
    
    // Configurar transparencia
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.depthMask(false);
    
    // Renderizar el plano HUD
    this.gl.drawElements(this.gl.TRIANGLES, this.hudGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);
    
    // Verificar errores GL
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      console.error('❌ Error GL al renderizar HUD:', error);
    } else {
      console.log('✅ HUD renderizado sin errores GL');
    }
    
    // Restaurar estado
    this.gl.disable(this.gl.BLEND);
    this.gl.depthMask(true);
    if (depthTestEnabled) {
      this.gl.enable(this.gl.DEPTH_TEST);
    }
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
   * Configura el estado de renderizado para texturas dinámicas
   */
  private setupTexturedRenderingState(shaderManager: any): void {
    // Enlazar textura del HUD
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.hudTexture.getWebGLTexture());
    
    // Configurar buffers de geometría (posición + coordenadas de textura)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    // Configurar atributos del shader texturizado
    const positionLocation = shaderManager.texturedAttributes?.['position'] ?? -1;
    const texCoordLocation = shaderManager.texturedAttributes?.['texCoord'] ?? -1;
    
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      // 5 floats por vértice: 3 para posición + 2 para coordenadas de textura
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 5 * 4, 0);
    }
    
    if (texCoordLocation >= 0) {
      this.gl.enableVertexAttribArray(texCoordLocation);
      // Coordenadas de textura empiezan después de los 3 floats de posición
      this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 5 * 4, 3 * 4);
    }
    
    // Configurar uniform de textura (usar metallicTexture como textura del HUD)
    const metallicTextureLocation = shaderManager.texturedUniforms?.['metallicTexture'];
    if (metallicTextureLocation) {
      this.gl.uniform1i(metallicTextureLocation, 0); // Usar texture unit 0
    }
    
    console.log('🎨 Shader texturizado configurado para HUD');
  }

  private setupBasicRenderingState(shaderManager: any): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    const positionLocation = shaderManager.litAttributes?.['position'] ?? -1;
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 5 * 4, 0);
    }
  }

  private setupBasicHUDMatrices(shaderManager: any, originalViewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    // VOLVER a la configuración que FUNCIONABA
    const hudModelMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    // Usar la matriz de vista completa de la cámara (que funcionaba)
    const hudViewMatrix = originalViewMatrix;
    
    const hudNormalMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    console.log('📐 Restaurando matrices HUD que funcionaban');

    shaderManager.setLitMatrices(
      hudModelMatrix,
      hudViewMatrix,
      projectionMatrix,
      hudNormalMatrix
    );
  }

  /**
   * Configura las matrices para que el HUD sea FIJO relativo a la cámara
   * CRÍTICO: El HUD NO debe rotar con la nave, debe permanecer estático
   */
  private setupHUDMatrices(shaderManager: any, originalViewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    // Matriz de modelo de identidad para el HUD
    const hudModelMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Matriz de vista de identidad para el HUD (sin rotación de nave)
    const hudViewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Matriz normal de identidad
    const hudNormalMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    // Aplicar matrices al shader texturizado
    const modelMatrixLocation = shaderManager.texturedUniforms?.['modelMatrix'];
    const viewMatrixLocation = shaderManager.texturedUniforms?.['viewMatrix'];
    const projectionMatrixLocation = shaderManager.texturedUniforms?.['projectionMatrix'];
    const normalMatrixLocation = shaderManager.texturedUniforms?.['normalMatrix'];

    if (modelMatrixLocation) {
      this.gl.uniformMatrix4fv(modelMatrixLocation, false, hudModelMatrix);
    }
    if (viewMatrixLocation) {
      this.gl.uniformMatrix4fv(viewMatrixLocation, false, hudViewMatrix);
    }
    if (projectionMatrixLocation) {
      this.gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
    }
    if (normalMatrixLocation) {
      this.gl.uniformMatrix4fv(normalMatrixLocation, false, hudNormalMatrix);
    }

    // Configurar parámetros de iluminación para el HUD
    const lightDirectionLocation = shaderManager.texturedUniforms?.['lightDirection'];
    const lightColorLocation = shaderManager.texturedUniforms?.['lightColor'];
    const ambientColorLocation = shaderManager.texturedUniforms?.['ambientColor'];
    const ambientStrengthLocation = shaderManager.texturedUniforms?.['ambientStrength'];
    const baseColorLocation = shaderManager.texturedUniforms?.['baseColor'];

    if (lightDirectionLocation) {
      this.gl.uniform3fv(lightDirectionLocation, new Float32Array([0, 0, -1])); // Luz frontal
    }
    if (lightColorLocation) {
      this.gl.uniform3fv(lightColorLocation, new Float32Array([1, 1, 1])); // Luz blanca
    }
    if (ambientColorLocation) {
      this.gl.uniform3fv(ambientColorLocation, new Float32Array([1, 1, 1])); // Ambiente blanco
    }
    if (ambientStrengthLocation) {
      this.gl.uniform1f(ambientStrengthLocation, 1.0); // Ambiente fuerte
    }
    if (baseColorLocation) {
      this.gl.uniform3fv(baseColorLocation, new Float32Array([1, 1, 1])); // Color base blanco
    }

    console.log('📐 HUD matrices texturizadas configuradas: FIJO en espacio cámara');
  }

  /**
   * Crea la geometría del plano HUD inclinado 
   * CORREGIDO: Geometría en espacio de cámara para que sea FIJA (no rote con nave)
   */
  private createHUDPlaneGeometry(): void {
    // HUD más ancho (x1.5) y base en límite inferior de cámara
    const width = 1.5; // Ancho x1.5 como pediste
    const height = 0.4;
    const baseY = -0.6; // Base más abajo (límite inferior de vista)
    const baseZ = 1.0;
    const tilt = 15 * (Math.PI / 180); // Mantener inclinación suave por ahora
    
    console.log('🎯 HUD x1.5 más ancho, base en límite inferior de cámara');
    
    // Inclinación suave: base cerca y en límite inferior, top ligeramente más lejos
    const vertices = [
      // Base inferior (límite inferior de la vista de cámara)
      -width/2, baseY, baseZ, 0.0, 1.0, // Esquina inferior izquierda
       width/2, baseY, baseZ, 1.0, 1.0, // Esquina inferior derecha
      
      // Parte superior (inclinada hacia arriba y atrás)
       width/2, baseY + height * Math.cos(tilt), baseZ + height * Math.sin(tilt), 1.0, 0.0, // Superior derecha
      -width/2, baseY + height * Math.cos(tilt), baseZ + height * Math.sin(tilt), 0.0, 0.0  // Superior izquierda
    ];

    // Debug: verificar dimensiones
    const topY = baseY + height * Math.cos(tilt);
    const topZ = baseZ + height * Math.sin(tilt);
    console.log(`📊 HUD x1.5: Ancho=${width}, Base(Y:${baseY}, Z:${baseZ}) → Top(Y:${topY.toFixed(2)}, Z:${topZ.toFixed(2)})`);
    console.log(`📏 Base pegada al límite inferior de vista de cámara`);

    const indices = [0, 1, 2, 0, 2, 3];

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