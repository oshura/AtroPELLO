import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { Modal } from '../modal/modal';

@Component({
  selector: 'app-game',
  imports: [Modal],
  templateUrl: './game.html',
  styleUrl: './game.scss'
})
export class Game implements AfterViewInit {
  @ViewChild('gameCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  gameStarted = false;
  private gl: WebGLRenderingContext | null = null;

  ngAfterViewInit() {
    this.initializeCanvas();
  }

  private initializeCanvas() {
    const canvas = this.canvas.nativeElement;
    this.gl = canvas.getContext('webgl') as WebGLRenderingContext || 
              canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (!this.gl) {
      console.error('WebGL no está soportado en este navegador');
      return;
    }

    // Configurar el canvas para ocupar el espacio disponible
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas() {
    const canvas = this.canvas.nativeElement;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (this.gl) {
        this.gl.viewport(0, 0, canvas.width, canvas.height);
      }
    }
  }

  startGame() {
    this.gameStarted = true;
    console.log('Juego iniciado');
    
    if (this.gl) {
      // Limpiar el canvas con un color de fondo
      this.gl.clearColor(0.1, 0.1, 0.2, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      
      // Aquí irá la lógica del juego OpenGL
      this.gameLoop();
    }
  }

  private gameLoop() {
    if (!this.gameStarted || !this.gl) return;
    
    // Lógica básica del juego
    this.gl.clearColor(0.1, 0.1, 0.2, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    // Continuar el loop
    requestAnimationFrame(() => this.gameLoop());
  }
}
