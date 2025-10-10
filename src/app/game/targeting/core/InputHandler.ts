/**
 * Manejador de Input para Sistema de Retícula
 * FASE 1: Core Targeting System
 */

import { Injectable } from '@angular/core';
import { 
  InputConfig, 
  ScreenPosition,
  TargetingEvents 
} from '../types/reticle.types';

@Injectable({
  providedIn: 'root'
})
export class InputHandler {
  private canvas: HTMLCanvasElement | null = null;
  private config: InputConfig;
  private events: TargetingEvents | null = null;
  
  private mousePosition: ScreenPosition = { x: 0, y: 0 };
  private isMouseDown: boolean = false;
  private lastClickTime: number = 0;
  private doubleClickThreshold: number = 300; // ms

  // Listeners para limpieza
  private mouseListeners: (() => void)[] = [];
  private keyboardListeners: (() => void)[] = [];

  constructor() {
    this.config = {
      mouseButton: 0, // Left click
      keyboardKey: 'Escape',
      holdToLock: false,
      doubleClickToLock: false
    };
  }

  /**
   * Inicializa el handler con canvas y eventos
   */
  public initialize(canvas: HTMLCanvasElement, events: TargetingEvents): void {
    this.canvas = canvas;
    this.events = events;
    this.setupEventListeners();
    
    console.log('🎮 InputHandler inicializado', {
      canvas: !!this.canvas,
      events: !!this.events
    });
  }

  /**
   * Configura todos los event listeners
   */
  private setupEventListeners(): void {
    if (!this.canvas) return;

    // Mouse Events
    const onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    const onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    const onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
    const onClick = (e: MouseEvent) => this.handleClick(e);
    const onContextMenu = (e: MouseEvent) => e.preventDefault(); // Prevenir menú contextual

    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mousedown', onMouseDown);
    this.canvas.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('click', onClick);
    this.canvas.addEventListener('contextmenu', onContextMenu);

    // Guardar listeners para limpieza
    this.mouseListeners.push(
      () => this.canvas?.removeEventListener('mousemove', onMouseMove),
      () => this.canvas?.removeEventListener('mousedown', onMouseDown),
      () => this.canvas?.removeEventListener('mouseup', onMouseUp),
      () => this.canvas?.removeEventListener('click', onClick),
      () => this.canvas?.removeEventListener('contextmenu', onContextMenu)
    );

    // Keyboard Events
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    this.keyboardListeners.push(
      () => document.removeEventListener('keydown', onKeyDown),
      () => document.removeEventListener('keyup', onKeyUp)
    );
  }

  /**
   * Maneja movimiento del mouse
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    this.mousePosition = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  /**
   * Maneja mouse down
   */
  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;

    this.isMouseDown = true;

    // Si está configurado hold-to-lock, seleccionar inmediatamente
    if (this.config.holdToLock && this.events?.onTargetSelected) {
      // El ReticleManager manejará la detección del target
    }
  }

  /**
   * Maneja mouse up
   */
  private handleMouseUp(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;

    this.isMouseDown = false;

    // Si estaba en hold-to-lock, deseleccionar
    if (this.config.holdToLock && this.events?.onTargetSelected) {
      this.events.onTargetSelected(null);
    }
  }

  /**
   * Maneja clicks del mouse
   */
  private handleClick(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;

    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - this.lastClickTime;

    if (this.config.doubleClickToLock) {
      // Manejar doble click
      if (timeSinceLastClick < this.doubleClickThreshold) {
        // Es un doble click - seleccionar target
        if (this.events?.onTargetSelected) {
          // El ReticleManager detectará el target en esta posición
        }
      }
    } else if (!this.config.holdToLock) {
      // Click simple para seleccionar
      if (this.events?.onTargetSelected) {
        // El ReticleManager detectará el target en esta posición
      }
    }

    this.lastClickTime = currentTime;
  }

  /**
   * Maneja teclas presionadas
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === this.config.keyboardKey) {
      event.preventDefault();
      
      // Deseleccionar target actual
      if (this.events?.onTargetSelected) {
        this.events.onTargetSelected(null);
      }
    }
  }

  /**
   * Maneja teclas liberadas
   */
  private handleKeyUp(event: KeyboardEvent): void {
    // Por ahora no necesitamos manejar key up
  }

  /**
   * Obtiene la posición actual del mouse
   */
  public getMousePosition(): ScreenPosition {
    return { ...this.mousePosition };
  }

  /**
   * Verifica si el mouse está presionado
   */
  public isMousePressed(): boolean {
    return this.isMouseDown;
  }

  /**
   * Verifica si debe seleccionar en la posición actual
   */
  public shouldSelectAt(position: ScreenPosition): boolean {
    const mousePos = this.getMousePosition();
    const distance = Math.sqrt(
      (position.x - mousePos.x) ** 2 + 
      (position.y - mousePos.y) ** 2
    );
    
    // Tolerancia de 5 píxeles para clicks
    return distance <= 5;
  }

  /**
   * Actualiza la configuración de input
   */
  public updateConfig(newConfig: Partial<InputConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Obtiene la configuración actual
   */
  public getConfig(): InputConfig {
    return { ...this.config };
  }

  /**
   * Limpia todos los event listeners
   */
  public destroy(): void {
    // Limpiar mouse listeners
    this.mouseListeners.forEach(cleanup => cleanup());
    this.mouseListeners = [];

    // Limpiar keyboard listeners
    this.keyboardListeners.forEach(cleanup => cleanup());
    this.keyboardListeners = [];

    console.log('🧹 InputHandler destroyed');
  }
}