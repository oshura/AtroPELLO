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
  private clickPending: boolean = false;

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
    try {
      // Asegurar que el canvas es focusable y obtener el foco
      if (!this.canvas.hasAttribute('tabindex')) {
        this.canvas.setAttribute('tabindex', '0');
      }
      this.canvas.focus();
    } catch {}
    
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

    // Escuchar teclas en el canvas (el juego debe tener foco)
    this.canvas.addEventListener('keydown', onKeyDown, { capture: true } as any);
    this.canvas.addEventListener('keyup', onKeyUp, { capture: true } as any);

    // Listener global SOLO para la tecla de ciclo (p. ej., 't'), para que funcione aunque el canvas pierda foco
    const onDocCycleKey = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const cycleKey = (this.config.cycleNextKey || '').toLowerCase();
      if (!cycleKey || key !== cycleKey) return;
      // No interferir con inputs de texto/editables
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName?.toLowerCase();
      const isTextInput = !!(targetEl && (targetEl.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'));
      if (isTextInput) return;

      const isPrev = !!(this.config.cyclePrevWithShift && e.shiftKey);
      console.log('⌨️ Cycle key (global) pressed:', { key: e.key, shift: e.shiftKey, isPrev });
      if (isPrev) this.events?.onCyclePrev?.();
      else this.events?.onCycleNext?.();
    };

  document.addEventListener('keydown', onDocCycleKey, true);

    this.keyboardListeners.push(
      () => this.canvas?.removeEventListener('keydown', onKeyDown, { capture: true } as any),
      () => this.canvas?.removeEventListener('keyup', onKeyUp, { capture: true } as any),
      () => document.removeEventListener('keydown', onDocCycleKey, true)
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

    // Debug temporal: Log ocasional para verificar eventos
    if (Math.random() < 0.016) { // ~1 vez por segundo a 60fps
      console.log('🖱️ Mouse move event:', this.mousePosition);
    }
  }

  /**
   * Maneja mouse down
   */
  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;

    // Intentar mantener el foco en el canvas
    try { this.canvas?.focus(); } catch {}

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
        this.clickPending = true; // ReticleManager consumirá y decidirá el target
      }
    } else if (!this.config.holdToLock) {
      // Click simple para seleccionar
      this.clickPending = true; // ReticleManager consumirá y decidirá el target
    }

    this.lastClickTime = currentTime;
  }

  /**
   * Devuelve true si hay un click pendiente y lo consume.
   */
  public consumeClick(): boolean {
    if (this.clickPending) {
      this.clickPending = false;
      return true;
    }
    return false;
  }

  /**
   * Maneja teclas presionadas
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const key = (event.key || '').toLowerCase();
    // Escape: deseleccionar
    if (key === (this.config.keyboardKey || '').toLowerCase()) {
      event.preventDefault();
      
      // Deseleccionar target actual
      if (this.events?.onTargetSelected) {
        this.events.onTargetSelected(null);
      }
      return;
    }

    // Ciclar targets con tecla de ciclo (por defecto 't') / Shift+tecla
    if (this.config.cycleNextKey && key === this.config.cycleNextKey.toLowerCase()) {
      event.preventDefault();
      const isPrev = !!(this.config.cyclePrevWithShift && event.shiftKey);
      // Debug ligero
      console.log('⌨️ Cycle key pressed:', { key: event.key, shift: event.shiftKey, isPrev });
      if (isPrev) {
        this.events?.onCyclePrev?.();
      } else {
        this.events?.onCycleNext?.();
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
    // Debug ocasional para verificar captura de mouse
    if (performance.now() % 3000 < 50) { // Cada 3 segundos
      console.log('🖱️ InputHandler.getMousePosition():', {
        position: this.mousePosition,
        canvas: !!this.canvas,
        events: !!this.events
      });
    }
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