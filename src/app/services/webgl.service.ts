import { Injectable, ElementRef } from '@angular/core';

export interface WebGLConfig {
  antialias?: boolean;
  alpha?: boolean;
  depth?: boolean;
  stencil?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'default' | 'high-performance' | 'low-power';
}

export interface WebGLState {
  isInitialized: boolean;
  canvas?: HTMLCanvasElement;
  context?: WebGLRenderingContext;
  width: number;
  height: number;
  devicePixelRatio: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebGLService {
  private state: WebGLState = {
    isInitialized: false,
    width: 0,
    height: 0,
    devicePixelRatio: 1
  };

  private resizeObserver?: ResizeObserver;

  /**
   * Inicializa el contexto WebGL en el canvas especificado
   * @param canvasRef - Referencia al elemento canvas
   * @param config - Configuración opcional de WebGL
   * @returns Promise que resuelve cuando WebGL está listo
   */
  async initialize(
    canvasRef: ElementRef<HTMLCanvasElement>,
    config: WebGLConfig = {}
  ): Promise<boolean> {
    try {
      this.state.canvas = canvasRef.nativeElement;
      
      if (!this.state.canvas) {
        throw new Error('Canvas element not found');
      }

      // Configuración por defecto optimizada para juegos
      const defaultConfig: WebGLConfig = {
        antialias: true,
        alpha: false,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
        ...config
      };

      // Intentar obtener contexto WebGL 2.0 primero, luego WebGL 1.0
      this.state.context = this.state.canvas.getContext('webgl2', defaultConfig) as WebGLRenderingContext ||
                           this.state.canvas.getContext('webgl', defaultConfig) as WebGLRenderingContext ||
                           this.state.canvas.getContext('experimental-webgl', defaultConfig) as WebGLRenderingContext;

      if (!this.state.context) {
        throw new Error('WebGL is not supported in this browser');
      }

      // Configurar device pixel ratio para pantallas de alta resolución
      this.state.devicePixelRatio = window.devicePixelRatio || 1;

      // Configurar canvas inicial
      this.setupCanvas();
      
      // Configurar auto-resize
      this.setupResizeObserver();

      // Configuración inicial de WebGL
      this.setupWebGLDefaults();

      this.state.isInitialized = true;
      console.log('✅ WebGL initialized successfully', {
        version: this.getWebGLVersion(),
        renderer: this.getRenderer(),
        maxTextureSize: this.getMaxTextureSize()
      });

      return true;
    } catch (error) {
      console.error('❌ WebGL initialization failed:', error);
      this.state.isInitialized = false;
      return false;
    }
  }

  /**
   * Configura las dimensiones y propiedades del canvas
   */
  private setupCanvas(): void {
    if (!this.state.canvas || !this.state.context) return;

    const container = this.state.canvas.parentElement;
    if (!container) return;

    // Obtener dimensiones del contenedor
    const rect = container.getBoundingClientRect();
    this.state.width = rect.width;
    this.state.height = rect.height;

    // Configurar dimensiones del canvas
    this.state.canvas.width = this.state.width * this.state.devicePixelRatio;
    this.state.canvas.height = this.state.height * this.state.devicePixelRatio;

    // Configurar CSS para mantener el tamaño visual correcto
    this.state.canvas.style.width = `${this.state.width}px`;
    this.state.canvas.style.height = `${this.state.height}px`;

    // Configurar viewport de WebGL
    this.state.context.viewport(0, 0, this.state.canvas.width, this.state.canvas.height);
  }

  /**
   * Configura el observador de redimensionamiento automático
   */
  private setupResizeObserver(): void {
    if (!this.state.canvas) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.setupCanvas();
        // Emitir evento personalizado para que el juego pueda reaccionar
        this.state.canvas?.dispatchEvent(new CustomEvent('webgl-resize', {
          detail: {
            width: this.state.width,
            height: this.state.height,
            devicePixelRatio: this.state.devicePixelRatio
          }
        }));
      }
    });

    const container = this.state.canvas.parentElement;
    if (container) {
      this.resizeObserver.observe(container);
    }
  }

  /**
   * Configura valores por defecto de WebGL optimizados para juegos
   */
  private setupWebGLDefaults(): void {
    if (!this.state.context) return;

    const gl = this.state.context;

    // Habilitar depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Habilitar blending para transparencias
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Configurar culling de caras traseras
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Color de fondo
    gl.clearColor(0.1, 0.1, 0.2, 1.0);
  }

  /**
   * Limpia el canvas con el color de fondo
   */
  clear(): void {
    if (!this.state.context) return;
    
    this.state.context.clear(
      this.state.context.COLOR_BUFFER_BIT | 
      this.state.context.DEPTH_BUFFER_BIT
    );
  }

  /**
   * Redimensiona el canvas manualmente
   * @param width - Nuevo ancho
   * @param height - Nueva altura
   */
  resize(width: number, height: number): void {
    if (!this.state.canvas || !this.state.context) return;

    this.state.width = width;
    this.state.height = height;
    this.setupCanvas();
  }

  /**
   * Obtiene el contexto WebGL
   * @returns Contexto WebGL o undefined si no está inicializado
   */
  getContext(): WebGLRenderingContext | undefined {
    return this.state.context;
  }

  /**
   * Obtiene el canvas
   * @returns Canvas HTML o undefined si no está inicializado
   */
  getCanvas(): HTMLCanvasElement | undefined {
    return this.state.canvas;
  }

  /**
   * Obtiene el estado actual de WebGL
   * @returns Estado completo de WebGL
   */
  getState(): WebGLState {
    return { ...this.state };
  }

  /**
   * Verifica si WebGL está inicializado y listo
   */
  isReady(): boolean {
    return this.state.isInitialized && !!this.state.context;
  }

  /**
   * Obtiene información de la versión de WebGL
   */
  getWebGLVersion(): string {
    if (!this.state.context) return 'Unknown';
    return this.state.context.getParameter(this.state.context.VERSION);
  }

  /**
   * Obtiene información del renderizador
   */
  getRenderer(): string {
    if (!this.state.context) return 'Unknown';
    return this.state.context.getParameter(this.state.context.RENDERER);
  }

  /**
   * Obtiene el tamaño máximo de textura soportado
   */
  getMaxTextureSize(): number {
    if (!this.state.context) return 0;
    return this.state.context.getParameter(this.state.context.MAX_TEXTURE_SIZE);
  }

  /**
   * Limpia recursos y destruye el servicio
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }

    // Limpiar contexto WebGL
    if (this.state.context && this.state.canvas) {
      // Limpiar buffers y texturas si es necesario
      this.state.context.getExtension('WEBGL_lose_context')?.loseContext();
    }

    this.state = {
      isInitialized: false,
      width: 0,
      height: 0,
      devicePixelRatio: 1
    };

    console.log('🧹 WebGL service destroyed');
  }
}