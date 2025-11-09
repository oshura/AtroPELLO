/**
 * Manejador de Input para Sistema de Retícula
 * FASE 1: Core Targeting System
 */

import { Injectable } from '@angular/core';
import { LoggingService, LogCategory } from '../../../services/logging.service';
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
  private isMouseDown = false;
  private lastClickTime = 0;
  private doubleClickThreshold = 300; // ms
  private clickPending = false;

  private mouseListeners: (() => void)[] = [];
  private keyboardListeners: (() => void)[] = [];

  constructor(private logger: LoggingService) {
    this.config = {
      mouseButton: 0,
      keyboardKey: 'Escape',
      holdToLock: false,
      doubleClickToLock: false
    };
  }

  // ===================== INIT =====================
  public initialize(canvas: HTMLCanvasElement, events: TargetingEvents): void {
    this.canvas = canvas;
    this.events = events;
    this.setupEventListeners();
    try {
      if (!this.canvas.hasAttribute('tabindex')) {
        this.canvas.setAttribute('tabindex', '0');
      }
      this.canvas.focus();
    } catch {}
    this.logger.debug(LogCategory.TARGETING, 'InputHandler initialized', { canvas: !!this.canvas, events: !!this.events });
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    // Mouse
    const onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    const onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    const onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
    const onClick = (e: MouseEvent) => this.handleClick(e);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    this.canvas.addEventListener('mousemove', onMouseMove);
    this.canvas.addEventListener('mousedown', onMouseDown);
    this.canvas.addEventListener('mouseup', onMouseUp);
    this.canvas.addEventListener('click', onClick);
    this.canvas.addEventListener('contextmenu', onContextMenu);

    this.mouseListeners.push(
      () => this.canvas?.removeEventListener('mousemove', onMouseMove),
      () => this.canvas?.removeEventListener('mousedown', onMouseDown),
      () => this.canvas?.removeEventListener('mouseup', onMouseUp),
      () => this.canvas?.removeEventListener('click', onClick),
      () => this.canvas?.removeEventListener('contextmenu', onContextMenu)
    );

    // Keyboard (canvas scoped)
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onKeyUp = (_: KeyboardEvent) => this.handleKeyUp(_);
    this.canvas.addEventListener('keydown', onKeyDown, { capture: true } as any);
    this.canvas.addEventListener('keyup', onKeyUp, { capture: true } as any);

    // Global cycle key (so targeting cycle works even if canvas briefly loses focus)
  const onDocCycleKey = (e: KeyboardEvent) => {
      const key = (e.key || '').toLowerCase();
      const cycleKey = (this.config.cycleNextKey || '').toLowerCase();
      if (!cycleKey || key !== cycleKey) return;
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName?.toLowerCase();
      const isTextInput = !!(targetEl && (targetEl.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'));
      if (isTextInput) return;
      const isPrev = !!(this.config.cyclePrevWithShift && e.shiftKey);
      this.logger.trace(LogCategory.TARGETING, 'Global cycle key', { key: e.key, shift: e.shiftKey, isPrev });
      if (isPrev) this.events?.onCyclePrev?.(); else this.events?.onCycleNext?.();
    };
    document.addEventListener('keydown', onDocCycleKey, true);

    this.keyboardListeners.push(
      () => this.canvas?.removeEventListener('keydown', onKeyDown, { capture: true } as any),
      () => this.canvas?.removeEventListener('keyup', onKeyUp, { capture: true } as any),
      () => document.removeEventListener('keydown', onDocCycleKey, true)
    );
  }

  // ===================== MOUSE =====================
  private handleMouseMove(event: MouseEvent): void {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;
    const canvasWidth = this.canvas.clientWidth || this.canvas.width || rect.width;
    const canvasHeight = this.canvas.clientHeight || this.canvas.height || rect.height;
    this.mousePosition = {
      x: Math.max(0, Math.min(canvasWidth, rawX)),
      y: Math.max(0, Math.min(canvasHeight, rawY))
    };
    if (Math.random() < 0.01) {
      this.logger.trace(LogCategory.TARGETING, 'Mouse coords', {
        raw: { x: Math.round(rawX), y: Math.round(rawY) },
        clamped: { x: Math.round(this.mousePosition.x), y: Math.round(this.mousePosition.y) },
        canvasSize: { w: Math.round(canvasWidth), h: Math.round(canvasHeight) }
      });
    }
  }

  private handleMouseDown(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;
    try { this.canvas?.focus(); } catch {}
    this.isMouseDown = true;
  }

  private handleMouseUp(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;
    this.isMouseDown = false;
    if (this.config.holdToLock && this.events?.onTargetSelected) {
      this.events.onTargetSelected(null);
    }
  }

  private handleClick(event: MouseEvent): void {
    if (event.button !== this.config.mouseButton) return;
    const currentTime = Date.now();
    const timeSinceLastClick = currentTime - this.lastClickTime;
    if (this.config.doubleClickToLock) {
      if (timeSinceLastClick < this.doubleClickThreshold) {
        this.clickPending = true;
      }
    } else if (!this.config.holdToLock) {
      this.clickPending = true;
    }
    this.lastClickTime = currentTime;
  }

  public consumeClick(): boolean {
    if (this.clickPending) {
      this.clickPending = false;
      return true;
    }
    return false;
  }

  // ===================== KEYBOARD =====================
  private handleKeyDown(event: KeyboardEvent): void {
    const key = (event.key || '').toLowerCase();
    if (key === (this.config.keyboardKey || '').toLowerCase()) {
      event.preventDefault();
      this.events?.onTargetSelected?.(null);
      return;
    }
    if (this.config.cycleNextKey && key === this.config.cycleNextKey.toLowerCase()) {
      event.preventDefault();
      const isPrev = !!(this.config.cyclePrevWithShift && event.shiftKey);
  this.logger.debug(LogCategory.TARGETING, 'Cycle key pressed', { key: event.key, shift: event.shiftKey, isPrev });
      if (isPrev) this.events?.onCyclePrev?.(); else this.events?.onCycleNext?.();
    }
  }

  private handleKeyUp(_event: KeyboardEvent): void { /* no-op for now */ }

  // ===================== PUBLIC API =====================
  public getMousePosition(): ScreenPosition {
    if (performance.now() % 3000 < 50) {
      this.logger.trace(LogCategory.TARGETING, 'getMousePosition()', {
        position: this.mousePosition,
        canvas: !!this.canvas,
        events: !!this.events
      });
    }
    return { ...this.mousePosition };
  }

  public isMousePressed(): boolean { return this.isMouseDown; }

  public shouldSelectAt(position: ScreenPosition): boolean {
    const mousePos = this.getMousePosition();
    const distance = Math.hypot(position.x - mousePos.x, position.y - mousePos.y);
    return distance <= 5; // 5px tolerance
  }

  public updateConfig(newConfig: Partial<InputConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): InputConfig { return { ...this.config }; }

  public destroy(): void {
    this.mouseListeners.forEach(fn => fn());
    this.mouseListeners = [];
    this.keyboardListeners.forEach(fn => fn());
    this.keyboardListeners = [];
    this.logger.info(LogCategory.TARGETING, 'InputHandler destroyed');
  }
}
