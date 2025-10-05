import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { Modal } from '../modal/modal';
import { WebGLService, WebGLConfig } from '../../services/webgl.service';

@Component({
  selector: 'app-game',
  imports: [Modal],
  templateUrl: './game.html',
  styleUrl: './game.scss'
})
export class Game implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  
  gameStarted = false;
  webglReady = false;
  private animationFrameId?: number;

  constructor(private webglService: WebGLService) {}

  async ngAfterViewInit() {
    await this.initializeWebGL();
    this.setupEventListeners();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  /**
   * Inicializa WebGL usando el servicio inyectable
   */
  private async initializeWebGL(): Promise<void> {
    try {
      // Configuración optimizada para el juego
      const config: WebGLConfig = {
        antialias: true,
        alpha: false,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
      };

      const success = await this.webglService.initialize(this.canvas, config);
      
      if (success) {
        this.webglReady = true;
        console.log('🎮 WebGL ready for game!', this.webglService.getState());
        
        // Limpiar canvas inicial
        this.webglService.clear();
      } else {
        console.error('❌ Failed to initialize WebGL');
        this.handleWebGLError();
      }
    } catch (error) {
      console.error('❌ WebGL initialization error:', error);
      this.handleWebGLError();
    }
  }

  /**
   * Configura los event listeners para el canvas
   */
  private setupEventListeners(): void {
    // Escuchar eventos de redimensionamiento
    this.canvas.nativeElement.addEventListener('webgl-resize', (event: any) => {
      console.log('📐 Canvas resized:', event.detail);
      if (this.gameStarted) {
        this.onCanvasResize(event.detail);
      }
    });

    // Escuchar eventos del juego (teclado, mouse, etc.)
    this.setupGameControls();
  }

  /**
   * Configura los controles del juego
   */
  private setupGameControls(): void {
    // Eventos de teclado
    window.addEventListener('keydown', (event) => {
      if (this.gameStarted) {
        this.handleKeyDown(event);
      }
    });

    // Eventos del canvas
    const canvas = this.canvas.nativeElement;
    
    canvas.addEventListener('mousedown', (event) => {
      if (this.gameStarted) {
        this.handleMouseDown(event);
      }
    });

    canvas.addEventListener('mousemove', (event) => {
      if (this.gameStarted) {
        this.handleMouseMove(event);
      }
    });
  }

  /**
   * Inicia el juego
   */
  async startGame(): Promise<void> {
    if (!this.webglReady) {
      console.warn('⚠️ WebGL not ready, waiting...');
      return;
    }

    this.gameStarted = true;
    console.log('🚀 Game started!');

    // Inicializar recursos del juego
    await this.loadGameResources();
    
    // Comenzar el loop de renderizado
    this.startGameLoop();
  }

  /**
   * Carga los recursos necesarios para el juego
   */
  private async loadGameResources(): Promise<void> {
    // Aquí cargarías texturas, shaders, modelos, etc.
    console.log('📦 Loading game resources...');
    
    // Ejemplo: simular carga de recursos
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ Game resources loaded');
  }

  /**
   * Inicia el loop principal del juego
   */
  private startGameLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.gameLoop();
  }

  /**
   * Loop principal del juego
   */
  private gameLoop(): void {
    if (!this.gameStarted || !this.webglReady) return;

    // Limpiar canvas
    this.webglService.clear();

    // Actualizar lógica del juego
    this.updateGame();

    // Renderizar frame
    this.renderGame();

    // Continuar el loop
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  /**
   * Actualiza la lógica del juego
   */
  private updateGame(): void {
    // Aquí irá la lógica de actualización del juego
    // - Física
    // - Colisiones
    // - IA
    // - Input handling
  }

  /**
   * Renderiza el frame actual del juego
   */
  private renderGame(): void {
    const gl = this.webglService.getContext();
    if (!gl) return;

    // Aquí irá el código de renderizado OpenGL
    // - Configurar shaders
    // - Dibujar geometría
    // - Aplicar texturas
    // - Efectos de post-procesado
  }

  /**
   * Maneja eventos de redimensionamiento del canvas
   */
  private onCanvasResize(detail: any): void {
    console.log('🔄 Updating game viewport:', detail);
    // Actualizar cámaras, proyecciones, etc.
  }

  /**
   * Maneja eventos de teclado
   */
  private handleKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'Space':
        event.preventDefault();
        // Acción de salto o disparo
        break;
      case 'Escape':
        this.pauseGame();
        break;
      // Más controles...
    }
  }

  /**
   * Maneja eventos del mouse (down)
   */
  private handleMouseDown(event: MouseEvent): void {
    const canvas = this.canvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    console.log('🖱️ Mouse click at:', { x, y });
    // Manejar clicks del juego
  }

  /**
   * Maneja eventos del mouse (move)
   */
  private handleMouseMove(event: MouseEvent): void {
    // Manejar movimiento del mouse para cámaras, etc.
  }

  /**
   * Pausa el juego
   */
  private pauseGame(): void {
    this.gameStarted = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
    console.log('⏸️ Game paused');
  }

  /**
   * Maneja errores de WebGL
   */
  private handleWebGLError(): void {
    // Mostrar mensaje de error al usuario
    console.error('💥 WebGL not supported. Game cannot run.');
    // Podrías mostrar un modal de error aquí
  }

  /**
   * Limpia recursos al destruir el componente
   */
  private cleanup(): void {
    this.gameStarted = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.webglService.destroy();
    console.log('🧹 Game component cleaned up');
  }
}
