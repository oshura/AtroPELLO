import { CameraMode } from '../Camera';
import { HUDTexture } from './HUDTexture';
import { VelocityBar } from './elements/VelocityBar';
import { Compass } from './elements/Compass';
import { NavigationSphere } from './elements/NavigationSphere';
import { SpeedometerDigital } from './elements/SpeedometerDigital';
import { MarqueePanel } from './elements/MarqueePanel';
import { TargetingSystem, TargetInfo } from '../types/targeting.types';
import { TargetPanel, TargetPanelState, Relation } from './elements/TargetPanel';

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
  private marqueePanel: MarqueePanel;
  private targetPanel: TargetPanel;
  
  // Geometría del plano HUD
  private hudGeometry: { vertices: Float32Array; indices: Uint16Array } | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  
  constructor(gl: WebGL2RenderingContext) {
    console.log('🎯 HUDManager constructor iniciado');
    this.gl = gl;
    
    // Inicializar sistema de texturas dinámicas
    this.hudTexture = new HUDTexture(gl, 1024, 768);
    console.log('✅ HUDTexture creada:', !!this.hudTexture);
    
    // Inicializar elementos del HUD
    this.velocityBarLeft = new VelocityBar('left');
    this.velocityBarRight = new VelocityBar('right');
    this.compass = new Compass();
    this.navigationSphere = new NavigationSphere();
    this.speedometer = new SpeedometerDigital();
    this.marqueePanel = new MarqueePanel();
  this.targetPanel = new TargetPanel();
    console.log('✅ Elementos HUD creados');
    
    // Inicializar sistema de targeting
    this.targetingSystem = new TargetingSystem();
    console.log('✅ Sistema targeting inicializado');
    
    // Crear geometría del plano
    this.createHUDPlaneGeometry();
    console.log('✅ Geometría HUD creada:', !!this.hudGeometry);
    
    // DEBUG GLOBAL: Hacer método disponible en consola del navegador
    (window as any).toggleHUDShader = () => this.toggleDebugShader();
    
    // KEYBOARD LISTENERS: F1 y F2 para debug
    this.setupKeyboardListeners();
    
    console.log('🎯 HUDManager inicializado con FASE 4+ completa:');
    console.log('   📺 MarqueePanel - Mensajes rotativos');
    console.log('   📊 VelocityBars - Barras laterales');
    console.log('   🎯 Compass - Sistema de targeting (Norte=cuadrado, Target=triángulo)');  
    console.log('   🏃 SpeedometerDigital - Recolocado');
    console.log('   🎯 TargetingSystem - Listo para asteroides, naves, planetas...');
    console.log('🔧 DEBUG: Usa toggleHUDShader() en la consola para alternar shaders');
    console.log('⌨️  O usa las teclas: F1 (shaders) / F2 (canvas debug)');
  }

  /**
   * Actualiza todos los elementos del HUD con datos del juego
   */
  // Variables para debug
  private forceDebugShader: boolean = false; // DESACTIVADO para probar shader texturizado
  private showDebugCanvas: boolean = false; // Canvas debug se activa con F2
  private showHUDFrame: boolean = true; // Marco y grid permanente para inmersión cockpit
  
  // Sistema de targeting
  private targetingSystem: TargetingSystem;

  public update(gameData: {
    velocity: number;
    heading: number;
    pitch: number;
    roll: number;
    altitude: number;
    speed: number;
    position?: { x: number; y: number; z: number };
  }): void {
    // Actualizar elementos individuales
    this.velocityBarLeft.update(gameData.velocity);
    this.velocityBarRight.update(gameData.velocity);
    
    // Actualizar compass con información de targeting
    let targetInfo: TargetInfo | null = null;
    if (gameData.position) {
      targetInfo = this.targetingSystem.getTargetInfo(gameData.position);
    }
    this.compass.update(gameData.heading, targetInfo);
    
    this.navigationSphere.update(gameData.pitch, gameData.roll, gameData.heading);
    this.speedometer.update(gameData.speed);
  this.marqueePanel.update(); // Sin parámetros, usa su lógica interna
    
    // Renderizar todos los elementos en la textura
    this.renderToTexture();
  }

  // === Target Panel Public API ===
  public updateTargetPanel(state: Partial<TargetPanelState>) {
    this.targetPanel.setData({ active: true, ...state });
    const pc = (state as any).previewCanvas as HTMLCanvasElement | null | undefined;
    if (pc) {
      console.log('🖼️ TargetPanel.update: previewCanvas', { w: pc.width, h: pc.height });
    } else {
      console.log('🖼️ TargetPanel.update: SIN previewCanvas');
    }
  }
  public clearTargetPanel() { this.targetPanel.clear(); }

  /**
   * Debug: Mostrar información de estado en consola (F1)
   */
  public showDebugInfo(): void {
    console.log(`🔧 === INFORMACIÓN DE DEBUG HUD ===`);
    console.log(`Estado forceDebugShader: ${this.forceDebugShader ? 'ACTIVO (Magenta)' : 'INACTIVO (Texturizado)'}`);
    console.log(`Estado showDebugCanvas: ${this.showDebugCanvas ? 'ACTIVO (Marco debug rojo)' : 'INACTIVO'}`);
    console.log(`Estado showHUDFrame: ${this.showHUDFrame ? 'ACTIVO (Marco cockpit azul)' : 'INACTIVO'}`);
    console.log(`Dimensiones Canvas: ${this.hudTexture.getCanvas().width}x${this.hudTexture.getCanvas().height}`);
        console.log(`WebGL Texture: ${this.hudTexture.getWebGLTexture() ? 'CREADA' : 'NO CREADA'}`);
    console.log('📊 Estados actuales del HUD mostrados en consola');
  }

  /**
   * Debug: Alternar entre shader texturizado y fallback
   * Útil para comparar y identificar problemas
   */
  public toggleDebugShader(): void {
    this.forceDebugShader = !this.forceDebugShader;
    console.log(`🔧 === CAMBIO DE SHADER ===`);
    console.log(`Estado: ${this.forceDebugShader ? 'FORZAR FALLBACK (Magenta)' : 'INTENTAR TEXTURIZADO'}`);
    console.log(`Próximo render usará: ${this.forceDebugShader ? 'Shader básico (magenta)' : 'Shader texturizado (Canvas 2D)'}`);
    console.log('📢 ¡Mira el HUD después del próximo frame!');
  }

  /**
   * Debug: Alternar debug canvas con F2
   */
  public toggleDebugCanvas(): void {
    this.showDebugCanvas = !this.showDebugCanvas;
    console.log(`🎨 === TOGGLE DEBUG CANVAS ===`);
    console.log(`Estado: ${this.showDebugCanvas ? 'ACTIVADO' : 'DESACTIVADO'}`);
    
    if (this.showDebugCanvas) {
      this.createDebugCanvasDisplay();
      console.log('📺 Canvas debug creado - visible en pantalla');
    } else {
      this.removeDebugCanvasDisplay();
      console.log('🚫 Canvas debug eliminado');
    }
  }

  /**
   * Configurar listeners de teclado para debug
   */
  private setupKeyboardListeners(): void {
    document.addEventListener('keydown', (event) => {
      // Evitar que se ejecute si hay elementos de input activos
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      switch (event.code) {
        case 'F1':
          event.preventDefault();
          this.showDebugInfo();
          break;
        case 'F2':
          event.preventDefault();
          this.toggleDebugCanvas();
          break;
      }
    });

    console.log('⌨️  Controles debug configurados:');
    console.log('   🔄 F1: Alternar shader (HUD ↔ Fallback)');
    console.log('   🎨 F2: Alternar canvas debug');
  }

  // === MÉTODOS PÚBLICOS PARA MARQUEE PANEL ===
  
  /**
   * Establecer mensajes del panel de marquesina
   */
  public setMarqueeMessages(messages: string[]): void {
    this.marqueePanel.setMessages(messages);
  }

  /**
   * Agregar un mensaje al panel de marquesina
   */
  public addMarqueeMessage(message: string): void {
    this.marqueePanel.addMessage(message);
  }

  /**
   * Limpiar mensajes del panel de marquesina
   */
  public clearMarqueeMessages(): void {
    this.marqueePanel.clearMessages();
  }

  /**
   * Obtener el mensaje actual del panel
   */
  public getCurrentMarqueeMessage(): string {
    return this.marqueePanel.getCurrentMessage();
  }

  // === MÉTODOS PÚBLICOS PARA SISTEMA DE TARGETING ===
  
  /**
   * Obtener el sistema de targeting
   */
  public getTargetingSystem(): TargetingSystem {
    return this.targetingSystem;
  }
  
  /**
   * Establecer target actual (null para limpiar)
   */
  public setTarget(target: any): void {
    this.targetingSystem.setTarget(target);
  }
  
  /**
   * Obtener información del target actual
   */
  public getCurrentTargetInfo(): TargetInfo | null {
    // Necesitamos la posición de la nave para calcular
    // Por ahora retorna null, se completará cuando tengamos posición
    return null; 
  }

  /**
   * Renderiza el HUD que se mueve CON la cámara como HUD de avión
   * ENFOQUE SISTEMÁTICO CON DEBUG DETALLADO
   */
  public render(cameraMode: CameraMode, shaderManager: any, viewMatrix: Float32Array, projectionMatrix: Float32Array, cameraPosition?: {x: number, y: number, z: number}): void {
    console.log('🎯 HUDManager.render called with:', {
      cameraMode: cameraMode,
      isCockpit: cameraMode === CameraMode.COCKPIT,
      hasGeometry: !!this.hudGeometry,
      CockpitEnum: CameraMode.COCKPIT
    });
    
    if (cameraMode !== CameraMode.COCKPIT || !this.hudGeometry) {
      console.log('🚫 HUD render rejected:', {
        wrongMode: cameraMode !== CameraMode.COCKPIT,
        noGeometry: !this.hudGeometry
      });
      return;
    }

    console.log('🎯 === INICIO RENDER HUD ===');
    
    // PASO 1: Verificar que la textura Canvas 2D está actualizada
    this.debugCanvasContent();
    
    // PASO 2: Verificar estado de componentes necesarios
    const hudProgram = shaderManager.hudProgram;
    const webglTexture = this.hudTexture?.getWebGLTexture();
    
    console.log('🔍 Estado de componentes:', {
      hasHUDProgram: !!hudProgram,
      hasHudTexture: !!this.hudTexture,
      hasWebGLTexture: !!webglTexture,
      isValidTexture: webglTexture ? this.gl.isTexture(webglTexture) : false
    });
    
    // DECISIÓN: ¿Usar shader HUD o fallback?
    const hasValidComponents = hudProgram && webglTexture && this.gl.isTexture(webglTexture);
    const useHUDShader = hasValidComponents && !this.forceDebugShader;
    
    if (useHUDShader) {
      console.log('✅ Usando shader HUD');
      this.gl.useProgram(hudProgram);
      
      // DEBUG CRÍTICO: Verificar el programa shader en detalle
      this.debugShaderProgram(hudProgram, 'HUD');
      
      this.setupHUDRenderingState(shaderManager);
      this.setupHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
    } else {
      const reason = this.forceDebugShader ? 'FORZADO' : 'COMPONENTES FALTANTES';
      console.log(`⚠️ Usando shader FALLBACK (magenta) - Razón: ${reason}`);
      const program = shaderManager.litProgram;
      this.gl.useProgram(program);
      
      // DEBUG: Verificar también el programa fallback
      this.debugShaderProgram(program, 'FALLBACK');
      
      this.setupBasicRenderingState(shaderManager);
      this.setupFallbackHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
      shaderManager.setLitColor(new Float32Array([1.0, 0.0, 1.0])); // Magenta brillante
    }
    
    if (false) { // Desactivado temporalmente
      console.log('🎯 FALLBACK: shader básico (rosa) - faltan componentes');
      const program = shaderManager.litProgram;
      if (!program) {
        console.error('❌ litProgram no disponible');
        return;
      }

      this.gl.useProgram(program);
      this.setupBasicRenderingState(shaderManager);
      this.setupBasicHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
      shaderManager.setLitColor(new Float32Array([1.0, 0.0, 1.0]));
    }
    
    // Debug: verificar estado del renderizado
    const currentProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
    const activeTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    const boundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
    
    console.log('🔍 Estado HUD debug:', {
      vertices: this.hudGeometry.vertices.length,
      indices: this.hudGeometry.indices.length,
      currentProgram: currentProgram,
      activeTexture: activeTexture,
      boundTexture: boundTexture,
      isValidProgram: this.gl.isProgram(currentProgram),
      isValidTexture: this.gl.isTexture(boundTexture),
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
   * Actualiza la posición del HUD para que se mueva CON la cámara
   */
  private updateHUDPositionWithCamera(cameraPosition: {x: number, y: number, z: number}, viewMatrix: Float32Array): void {
    // Extraer la rotación de la matriz de vista de la cámara
    // La matriz de vista ya incluye la orientación de la cámara
    
    // Por ahora, mantener la geometría fija hasta que funcione el movimiento básico
    // TODO: Implementar transformación de geometría basada en orientación de cámara
    
    console.log('📍 HUD siguiendo cámara en:', cameraPosition);
  }

  /**
   * Renderiza todos los elementos HUD en la textura dinámica
   */
  private renderToTexture(): void {
    const canvas = this.hudTexture.getCanvas();
    const ctx = canvas.getContext('2d')!;
    
    // Limpiar canvas con fondo transparente
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Definir layout del HUD (1024x768)
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // === MARQUEE PANEL === (reemplaza "SPEEDOMETER TEST")
    // Posición: parte superior central (ahora más grande: 450x80)
    const marqueeX = centerX - 225; // Centrar panel de 450px
    const marqueeY = 20;
    this.marqueePanel.render(ctx, marqueeX, marqueeY);
    
    // (El velocímetro superior derecho se elimina; ahora se duplican sobre cada barra)
    
    // === COMPASS === 
    // Posición: parte superior central (debajo de marquee más grande)
    const compassPos = {
      x: centerX,
      y: 180  // Más abajo para no chocar con marquee de 80px altura
    };
    this.compass.render(ctx, compassPos);

    // === TARGET PANEL ===
    // Centered and larger (más alto) y un poco más abajo
    const panelWidth = 840;   // ancho actual
    const panelHeight = 360;  // más alto que antes (320 → 360)
    const panelX = centerX - panelWidth / 2;
    const panelYOffset = 100; // bajar un poco más el panel
    const panelY = centerY - panelHeight / 2 + panelYOffset;
    this.targetPanel.render(ctx, panelX, panelY, panelWidth, panelHeight);

    // === VELOCITY BARS ===
    // Alinear su base con la base del panel de targets y usar misma altura
  const barHeight = this.velocityBarLeft.setExternalHeight(panelHeight); // nuevo API: fija altura
  this.velocityBarRight.setExternalHeight(panelHeight);
    const baseY = panelY + panelHeight - barHeight; // garantizar que toque abajo del panel
    const leftBarPos = {
      x: 50,
      y: baseY
    };
    this.velocityBarLeft.render(ctx, leftBarPos);

    const rightBarPos = {
      x: canvas.width - 70,
      y: baseY
    };
    this.velocityBarRight.render(ctx, rightBarPos);

    // === SPEEDOMETER DUPLICADO SOBRE CADA BARRA ===
    // Renderizar dos instancias: izquierda y derecha, alineadas con cada barra
  // Dimensiones conocidas del speedometer digital (ver SpeedometerDigital)
  const speedWidth = 120;
  const speedHeight = 40;
  const marginAbovePanel = 10; // separación con el panel
  const speedY = panelY - (speedHeight / 2) - marginAbovePanel;
  // Alineación: izquierda igual que barra izquierda (sobresale por derecha)
  const speedLeftPos = { x: leftBarPos.x + speedWidth / 2, y: speedY };
  // Alineación: derecha igual que barra derecha (sobresale por izquierda)
  const rightBarRightEdge = rightBarPos.x + 20; // 20 = ancho de la barra
  const speedRightPos = { x: rightBarRightEdge - speedWidth / 2, y: speedY };
  // Render duplicado
  this.speedometer.render(ctx, speedLeftPos);
  this.speedometer.render(ctx, speedRightPos);
    
  // Nota: panel y elementos ya renderizados más arriba

  // Marco HUD permanente para inmersión cockpit
    if (this.showHUDFrame) {
      // Marco principal más sutil y elegante
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)'; // Azul cyan más elegante
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      
      // Grid de referencia sutil
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.08)'; // Muy sutil
      ctx.lineWidth = 0.5;
      for (let x = 50; x < canvas.width; x += 50) { // Grid más fino cada 50px
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, canvas.height - 8);
        ctx.stroke();
      }
      for (let y = 50; y < canvas.height; y += 50) { // Grid más fino cada 50px
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(canvas.width - 8, y);
        ctx.stroke();
      }
      
      // Esquinas reforzadas para look futurista
      ctx.strokeStyle = 'rgba(0, 150, 255, 0.6)';
      ctx.lineWidth = 2;
      const cornerSize = 20;
      // Esquina superior izquierda
      ctx.beginPath();
      ctx.moveTo(8, 8 + cornerSize);
      ctx.lineTo(8, 8);
      ctx.lineTo(8 + cornerSize, 8);
      ctx.stroke();
      // Esquina superior derecha  
      ctx.beginPath();
      ctx.moveTo(canvas.width - 8 - cornerSize, 8);
      ctx.lineTo(canvas.width - 8, 8);
      ctx.lineTo(canvas.width - 8, 8 + cornerSize);
      ctx.stroke();
      // Esquina inferior izquierda
      ctx.beginPath();
      ctx.moveTo(8, canvas.height - 8 - cornerSize);
      ctx.lineTo(8, canvas.height - 8);
      ctx.lineTo(8 + cornerSize, canvas.height - 8);
      ctx.stroke();
      // Esquina inferior derecha
      ctx.beginPath();
      ctx.moveTo(canvas.width - 8 - cornerSize, canvas.height - 8);
      ctx.lineTo(canvas.width - 8, canvas.height - 8);
      ctx.lineTo(canvas.width - 8, canvas.height - 8 - cornerSize);
      ctx.stroke();
    }
    
    // Marco de debug adicional (solo si debug canvas está activo)
    if (this.showDebugCanvas) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)'; // Rojo para distinguir del marco principal
      ctx.lineWidth = 1;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    }
    
    console.log('🎨 Canvas 2D renderizado con debug visual');
    
    // Forzar flush del contexto Canvas 2D
    ctx.getImageData(0, 0, 1, 1);
    
    // Actualizar textura WebGL
    this.hudTexture.updateTexture();
    
    console.log('📸 Textura WebGL actualizada desde Canvas 2D');
  }

  /**
   * Debug: Verifica el contenido del canvas 2D
   */
  private debugCanvasContent(): void {
    const canvas = this.hudTexture.getCanvas();
    const ctx = canvas.getContext('2d')!;
    
    // Obtener datos del canvas para verificar contenido
    const imageData = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100));
    const data = imageData.data;
    
    // Verificar si hay píxeles no transparentes
    let hasContent = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) { // Alpha > 0
        hasContent = true;
        break;
      }
    }
    
    console.log('🎨 DEBUG Canvas 2D:', {
      dimensions: `${canvas.width}x${canvas.height}`,
      hasContent: hasContent,
      firstPixel: [data[0], data[1], data[2], data[3]]
    });

    // Actualizar debug visual en pantalla
    this.updateDebugCanvasDisplay();
  }

  /**
   * Crea un display visual del canvas para debug
   */
  private createDebugCanvasDisplay(): void {
    const canvas = this.hudTexture.getCanvas();
    
    // Crear elemento de debug en la esquina superior izquierda
    const debugDiv = document.createElement('div');
    debugDiv.id = 'hud-debug-canvas';
    debugDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 10000;
      background: rgba(0,0,0,0.8);
      border: 2px solid #00ff00;
      padding: 10px;
      color: white;
      font-family: monospace;
      font-size: 12px;
      max-width: 300px;
    `;

    const title = document.createElement('div');
    title.textContent = '🎨 HUD Canvas Debug';
    title.style.cssText = `
      color: #00ff00;
      font-weight: bold;
      margin-bottom: 10px;
    `;

    const canvasPreview = document.createElement('canvas');
    canvasPreview.width = 150;
    canvasPreview.height = 113; // Mantener aspect ratio 1024x768
    canvasPreview.style.cssText = `
      border: 1px solid #00ff00;
      image-rendering: pixelated;
      display: block;
      margin-bottom: 10px;
    `;

    const infoDiv = document.createElement('div');
    infoDiv.id = 'hud-debug-info';

    debugDiv.appendChild(title);
    debugDiv.appendChild(canvasPreview);
    debugDiv.appendChild(infoDiv);

    // Añadir al DOM si no existe
    const existing = document.getElementById('hud-debug-canvas');
    if (existing) {
      existing.remove();
    }
    document.body.appendChild(debugDiv);

    console.log('🎨 Debug canvas display creado');
  }

  /**
   * Elimina el display visual del canvas
   */
  private removeDebugCanvasDisplay(): void {
    const existing = document.getElementById('hud-debug-canvas');
    if (existing) {
      existing.remove();
      console.log('🚫 Debug canvas display eliminado');
    }
  }

  /**
   * Actualiza el display visual del canvas (solo si está activo)
   */
  private updateDebugCanvasDisplay(): void {
    if (!this.showDebugCanvas) return; // No actualizar si no está activo
    
    const debugCanvas = document.querySelector('#hud-debug-canvas canvas') as HTMLCanvasElement;
    const debugInfo = document.getElementById('hud-debug-info');
    
    if (debugCanvas && debugInfo) {
      const canvas = this.hudTexture.getCanvas();
      const ctx = debugCanvas.getContext('2d')!;
      
      // Dibujar preview del canvas
      ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
      ctx.drawImage(canvas, 0, 0, debugCanvas.width, debugCanvas.height);
      
      // Actualizar información
      const webglTexture = this.hudTexture.getWebGLTexture();
      debugInfo.innerHTML = `
        Dimensiones: ${canvas.width}x${canvas.height}<br>
        WebGL Texture: ${webglTexture ? '✅' : '❌'}<br>
        Es Textura Válida: ${this.gl.isTexture(webglTexture) ? '✅' : '❌'}<br>
        Timestamp: ${new Date().toLocaleTimeString()}
      `;
    }
  }

  /**
   * Debug detallado del programa shader
   */
  private debugShaderProgram(program: WebGLProgram, type: string): void {
    console.log(`🔍 === DEBUG SHADER ${type} ===`);
    
    if (!this.gl.isProgram(program)) {
      console.error(`❌ ${type}: No es un programa válido`);
      return;
    }
    
    // Verificar si está linkeado
    const linkStatus = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
    console.log(`🔗 ${type} Link Status:`, linkStatus);
    
    if (!linkStatus) {
      const errorInfo = this.gl.getProgramInfoLog(program);
      console.error(`❌ ${type} Link Error:`, errorInfo);
    }
    
    // Obtener número de atributos y uniforms activos
    const activeAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES);
    const activeUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
    
    console.log(`📊 ${type} Activos:`, {
      attributes: activeAttributes,
      uniforms: activeUniforms
    });
    
    // Listar todos los atributos activos
    console.log(`📋 ${type} Atributos:`);
    for (let i = 0; i < activeAttributes; i++) {
      const info = this.gl.getActiveAttrib(program, i);
      if (info) {
        const location = this.gl.getAttribLocation(program, info.name);
        console.log(`  - ${info.name}: location=${location}, type=${info.type}, size=${info.size}`);
      }
    }
    
    // Listar todos los uniforms activos
    console.log(`📋 ${type} Uniforms:`);
    for (let i = 0; i < activeUniforms; i++) {
      const info = this.gl.getActiveUniform(program, i);
      if (info) {
        const location = this.gl.getUniformLocation(program, info.name);
        console.log(`  - ${info.name}: location=${location}, type=${info.type}, size=${info.size}`);
      }
    }
    
    console.log(`✅ Debug shader ${type} completado`);
  }

  /**
   * Configura el estado de renderizado para texturas dinámicas
   */
  private setupHUDRenderingState(shaderManager: any): void {
    console.log('🎨 === CONFIGURANDO ESTADO HUD ===');
    
    // PASO 1: Verificar y enlazar textura del HUD
    const webglTexture = this.hudTexture.getWebGLTexture();
    const isValidTexture = this.gl.isTexture(webglTexture);
    
    console.log('🖼️ Estado de textura:', {
      texture: webglTexture,
      isValidTexture: isValidTexture,
      textureTarget: this.gl.TEXTURE_2D
    });
    
    if (!isValidTexture) {
      console.error('❌ CRÍTICO: Textura WebGL no válida');
      return;
    }
    
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, webglTexture);
    
    // Verificar que la textura se enlazó correctamente
    const boundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
    console.log('✅ Textura enlazada:', this.gl.isTexture(boundTexture));
    
    // PASO 2: Configurar buffers de geometría
    const hasVertexBuffer = this.gl.isBuffer(this.vertexBuffer);
    const hasIndexBuffer = this.gl.isBuffer(this.indexBuffer);
    
    console.log('📊 Buffers:', {
      vertexBuffer: hasVertexBuffer,
      indexBuffer: hasIndexBuffer
    });
    
    if (!hasVertexBuffer || !hasIndexBuffer) {
      console.error('❌ CRÍTICO: Buffers de geometría no válidos');
      return;
    }
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    // PASO 3: Configurar atributos del shader HUD
    const positionLocation = shaderManager.hudAttributes?.['position'] ?? -1;
    const uvLocation = shaderManager.hudAttributes?.['uv'] ?? -1;
    
    console.log('🎯 Atributos shader HUD:', {
      position: positionLocation,
      uv: uvLocation,
      availableAttributes: Object.keys(shaderManager.hudAttributes || {})
    });
    
    let attributesConfigured = 0;
    
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 5 * 4, 0);
      attributesConfigured++;
      console.log('✅ Atributo posición configurado');
    } else {
      console.error('❌ CRÍTICO: Atributo position no encontrado');
    }
    
    if (uvLocation >= 0) {
      this.gl.enableVertexAttribArray(uvLocation);
      this.gl.vertexAttribPointer(uvLocation, 2, this.gl.FLOAT, false, 5 * 4, 3 * 4);
      attributesConfigured++;
      console.log('✅ Atributo UV configurado');
    } else {
      console.error('❌ CRÍTICO: Atributo uv no encontrado');
    }

    // El shader HUD no requiere normales, solo posición y UV
    
    // PASO 4: Configurar uniform de textura
    const textureLocation = shaderManager.hudUniforms?.['texture'];
    const opacityLocation = shaderManager.hudUniforms?.['opacity'];
    
    console.log('🎯 Uniforms HUD disponibles:', {
      texture: textureLocation,
      opacity: opacityLocation,
      allUniforms: Object.keys(shaderManager.hudUniforms || {})
    });
    
    // Configurar uniforms del shader HUD
    let textureUniformSet = false;
    
    if (textureLocation !== null && textureLocation !== undefined) {
      this.gl.uniform1i(textureLocation, 0); // Textura en unidad 0
      textureUniformSet = true;
      console.log('✅ Uniform u_texture configurado');
    } else {
      console.error('❌ CRÍTICO: No se encontró uniform u_texture');
    }
    
    if (opacityLocation !== null && opacityLocation !== undefined) {
      this.gl.uniform1f(opacityLocation, 1.0); // Opacidad completa
      console.log('✅ Uniform u_opacity configurado');
    }
    
    // PASO 5: Verificar estado final de WebGL
    const finalBoundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
    const activeTextureUnit = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    
    console.log('🔍 Estado final WebGL:', {
      textureBinding2D: finalBoundTexture,
      isValidBoundTexture: this.gl.isTexture(finalBoundTexture),
      activeTextureUnit: activeTextureUnit,
      expectedUnit: this.gl.TEXTURE0
    });
    
    // Verificar errores WebGL
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      console.error('❌ Error WebGL en setupHUDRenderingState:', error);
    } else {
      console.log(`✅ Estado HUD configurado (${attributesConfigured} atributos, textura: ${textureUniformSet})`);
    }
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
    // HUD EN ESPACIO DE CÁMARA: matriz identidad para que se mueva CON la cámara
    const hudModelMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    // MATRIZ IDENTIDAD = HUD se mueve y rota CON la cámara
    const hudViewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    const hudNormalMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);

    console.log('📐 HUD ESPACIO CÁMARA: se mueve y rota CON la cámara');

    shaderManager.setLitMatrices(
      hudModelMatrix,
      hudViewMatrix,
      projectionMatrix,
      hudNormalMatrix
    );
  }

  /**
   * Configura las matrices para que el HUD sea FIJO relativo a la cámara (shader fallback)
   * CRÍTICO: El HUD NO debe rotar con la nave, debe permanecer estático
   */
  private setupFallbackHUDMatrices(shaderManager: any, originalViewMatrix: Float32Array, projectionMatrix: Float32Array): void {
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

    // Aplicar matrices para el shader básico (litProgram)
    const modelMatrixLocation = shaderManager.litUniforms?.['modelMatrix'];
    const viewMatrixLocation = shaderManager.litUniforms?.['viewMatrix'];
    const projectionMatrixLocation = shaderManager.litUniforms?.['projectionMatrix'];
    const normalMatrixLocation = shaderManager.litUniforms?.['normalMatrix'];

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

    // Configurar parámetros de iluminación para el HUD básico
    const lightDirectionLocation = shaderManager.litUniforms?.['lightDirection'];
    const lightColorLocation = shaderManager.litUniforms?.['lightColor'];
    const ambientColorLocation = shaderManager.litUniforms?.['ambientColor'];
    const ambientStrengthLocation = shaderManager.litUniforms?.['ambientStrength'];
    const baseColorLocation = shaderManager.litUniforms?.['baseColor'];

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

    console.log('📐 HUD ESPACIO CÁMARA: se mueve y rota CON la cámara');
  }

  private setupHUDMatrices(shaderManager: any, originalViewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    console.log('📐 === CONFIGURANDO MATRICES HUD ===');
    
    // HUD EN ESPACIO DE CÁMARA: matriz identidad para que se mueva CON la cámara
    const hudModelMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    // MATRIZ IDENTIDAD = HUD se mueve y rota CON la cámara
    const hudViewMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
    
    // Shader HUD no requiere matriz normal

    // Debug: verificar uniforms disponibles
    console.log('🔍 Uniforms HUD disponibles:', 
      Object.keys(shaderManager.hudUniforms || {})
    );

    // Aplicar matrices para el shader HUD
    const modelMatrixLocation = shaderManager.hudUniforms?.['modelMatrix'];
    const viewMatrixLocation = shaderManager.hudUniforms?.['viewMatrix'];
    const projectionMatrixLocation = shaderManager.hudUniforms?.['projectionMatrix'];

    console.log('🎯 Localizaciones de matrices HUD:', {
      model: modelMatrixLocation,
      view: viewMatrixLocation,
      projection: projectionMatrixLocation
    });

    let matricesConfigured = 0;
    
    if (modelMatrixLocation !== null && modelMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(modelMatrixLocation, false, hudModelMatrix);
      matricesConfigured++;
      console.log('✅ Matriz modelo configurada');
    }
    if (viewMatrixLocation !== null && viewMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(viewMatrixLocation, false, hudViewMatrix);
      matricesConfigured++;
      console.log('✅ Matriz vista configurada');
    }
    if (projectionMatrixLocation !== null && projectionMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
      matricesConfigured++;
      console.log('✅ Matriz proyección configurada');
    }
    // El shader HUD no requiere matriz normal

    console.log(`📊 Matrices configuradas: ${matricesConfigured}/3`);

    // El shader HUD no requiere parámetros de iluminación - es simple textura 2D
    console.log('✅ Configuración de matrices HUD completada');
  }

  /**
   * Crea la geometría del plano HUD inclinado 
   * CORREGIDO: Geometría en espacio de cámara para que sea FIJA (no rote con nave)
   */
  private createHUDPlaneGeometry(): void {
    // HUD ajustado para FOV 55° - más lejos y visible
    const width = 2.0;  // Más ancho para FOV 55°
    const height = 0.6; // Más alto para mejor visibilidad
    const baseY = -0.8; // Más abajo para estar en zona visible
    const baseZ = -1.5; // Más lejos para FOV 55° - dentro del near plane
    const tilt = 10 * (Math.PI / 180); // Menos inclinación para mejor lectura
    
    console.log('🎯 === CREANDO GEOMETRÍA HUD ===');
    
    // HUD dentro del frustum visible - FORMATO: [x, y, z, u, v]
    const vertices = [
      // Vértice 0: Esquina inferior izquierda
      -width/2, baseY, baseZ, 0.0, 1.0,
      // Vértice 1: Esquina inferior derecha  
       width/2, baseY, baseZ, 1.0, 1.0,
      // Vértice 2: Esquina superior derecha
       width/2, baseY + height * Math.cos(tilt), baseZ - height * Math.sin(tilt), 1.0, 0.0,
      // Vértice 3: Esquina superior izquierda
      -width/2, baseY + height * Math.cos(tilt), baseZ - height * Math.sin(tilt), 0.0, 0.0
    ];

    console.log('� Coordenadas de vértices (x,y,z,u,v):');
    for (let i = 0; i < vertices.length; i += 5) {
      console.log(`  Vértice ${i/5}: pos(${vertices[i].toFixed(2)}, ${vertices[i+1].toFixed(2)}, ${vertices[i+2].toFixed(2)}) uv(${vertices[i+3].toFixed(2)}, ${vertices[i+4].toFixed(2)})`);
    }

    // Triángulos: 0-1-2, 0-2-3 (orden counter-clockwise)
    const indices = [0, 1, 2, 0, 2, 3];
    
    console.log('🔺 Índices de triángulos:', indices);
    console.log(`📏 Dimensiones: ${width}x${height}, inclinación: ${(tilt * 180/Math.PI).toFixed(1)}°`);

    this.hudGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
    
    this.createBuffers();
    
    console.log('✅ Geometría HUD creada: 4 vértices, 2 triángulos, 5 floats/vértice [x,y,z,u,v]');
  }

  /**
   * Crea los buffers WebGL para la geometría
   */
  private createBuffers(): void {
    if (!this.hudGeometry) {
      console.error('❌ No hay geometría HUD para crear buffers');
      return;
    }
    
    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.hudGeometry.vertices, this.gl.STATIC_DRAW);
    console.log('✅ Vertex buffer creado:', !!this.vertexBuffer);
    
    this.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.hudGeometry.indices, this.gl.STATIC_DRAW);
    console.log('✅ Index buffer creado:', !!this.indexBuffer);
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