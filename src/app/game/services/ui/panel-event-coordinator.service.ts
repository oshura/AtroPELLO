import { Injectable } from '@angular/core';
import { LoggingService, LogLevel, LogCategory } from '../../../services/logging.service';

/**
 * PanelEventCoordinator
 * 
 * FASE 6: Event binding and routing service
 * Responsabilidades:
 * - Attach/detach DOM event listeners (keyboard, mouse, wheel)
 * - Route events to appropriate panels based on state
 * - Coordinate which panel handles each event type
 * 
 * NO gestiona (para fases posteriores):
 * - Panel state/mutual exclusivity → FASE 6b: PanelStateManager
 * - Audio triggers → FASE 6c: UI Audio Integration
 * - Cursor management → FASE 6d: CursorManager
 * - Cooldown logic → FASE 6b: PanelStateManager
 */

export interface PanelEventCallbacks {
  // Map panel callbacks (mouse/wheel only - keyboard handled by GameEngine)
  onMapClick?: (clientX: number, clientY: number) => void;
  onMapMove?: (clientX: number, clientY: number) => void;
  onMapWheel?: (deltaY: number, clientX: number, clientY: number) => void;
  onMapPointerDown?: (clientX: number, clientY: number, button: number) => void;
  onMapPointerUp?: (clientX: number, clientY: number, button: number) => void;
  
  // Grimoire panel callbacks (mouse only - keyboard handled by GameEngine)
  onGrimoireClick?: (clientX: number, clientY: number) => void;
  onGrimoireMove?: (clientX: number, clientY: number) => void;
  onGrimoirePointerDown?: (clientX: number, clientY: number, button: number) => void;
  onGrimoirePointerUp?: (clientX: number, clientY: number, button: number) => void;

  // Inventory panel callbacks (mouse/wheel)
  onInventoryClick?: (clientX: number, clientY: number) => void;
  onInventoryMove?: (clientX: number, clientY: number) => void;
  onInventoryWheel?: (deltaY: number, clientX: number, clientY: number) => void;
  
  // 3D targeting callback (when no panel is active)
  on3DClick?: (event: MouseEvent) => void;

  // Vuelo sin paneles: botón derecho = gatillo del arma seleccionada (Fase 12)
  onFlightPointerMove?: (clientX: number, clientY: number) => void;
  onFlightPointerDown?: (button: number) => void;
  onFlightPointerUp?: (button: number) => void;
  /** true si el menú contextual del navegador debe suprimirse en vuelo. */
  onFlightContextMenu?: () => boolean;

  // Pointer activity notifications (any canvas interaction)
  onPointerActivity?: () => void;
}

@Injectable({ providedIn: 'root' })
export class PanelEventCoordinator {
  private canvas: HTMLCanvasElement | null = null;
  private callbacks: PanelEventCallbacks = {};
  
  // Event handler references for cleanup
  private clickHandler?: (e: MouseEvent) => void;
  private moveHandler?: (e: MouseEvent) => void;
  private wheelHandler?: (e: WheelEvent) => void;
  private pointerDownHandler?: (e: MouseEvent) => void;
  private pointerUpHandler?: (e: MouseEvent) => void;
  private contextMenuHandler?: (e: MouseEvent) => void;
  private pointerLeaveHandler?: (e: MouseEvent) => void;
  
  // State flags (minimal - just for routing decisions)
  private mapEnabled = false;
  private grimoireEnabled = false;
  private inventoryEnabled = false;
  private inputsBlocked = false;

  constructor(private logger: LoggingService) {}

  /**
   * Initialize event coordinator with canvas element and callbacks
   * Note: Keyboard events are handled by existing game.ts @HostListener flow,
   * not by this service (to avoid duplicate event handling)
   */
  initialize(canvas: HTMLCanvasElement, callbacks: PanelEventCallbacks): void {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.attachCanvasMouseListeners();
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'PanelEventCoordinator initialized');
  }

  /**
   * Update panel state for routing decisions
   */
  setMapEnabled(enabled: boolean): void {
    this.mapEnabled = enabled;
  }

  setGrimoireEnabled(enabled: boolean): void {
    this.grimoireEnabled = enabled;
  }

  setInventoryEnabled(enabled: boolean): void {
    this.inventoryEnabled = enabled;
  }

  setInputsBlocked(blocked: boolean): void {
    this.inputsBlocked = blocked;
  }

  /**
   * Attach canvas mouse/wheel listeners
   */
  private attachCanvasMouseListeners(): void {
    if (!this.canvas) return;

    this.clickHandler = (e: MouseEvent) => this.handleClick(e);
    this.moveHandler = (e: MouseEvent) => this.handleMouseMove(e);
    this.wheelHandler = (e: WheelEvent) => this.handleWheel(e);
    this.pointerDownHandler = (e: MouseEvent) => this.handlePointerDown(e);
    this.pointerUpHandler = (e: MouseEvent) => this.handlePointerUp(e);
    this.contextMenuHandler = (e: MouseEvent) => this.handleContextMenu(e);

    this.canvas.addEventListener('click', this.clickHandler);
    this.canvas.addEventListener('mousemove', this.moveHandler);
    this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
    this.canvas.addEventListener('mousedown', this.pointerDownHandler);
    this.canvas.addEventListener('mouseup', this.pointerUpHandler);
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler);
    // Si el puntero abandona el canvas con el botón pulsado no llega el 'mouseup': hay que soltar
    // el gatillo a mano o el arma se queda disparando sola.
    this.pointerLeaveHandler = () => this.callbacks.onFlightPointerUp?.(2);
    this.canvas.addEventListener('mouseleave', this.pointerLeaveHandler);
  }

  /**
   * Route mouse clicks based on active panel
   */
  private handleClick(event: MouseEvent): void {
    this.callbacks.onPointerActivity?.();
    if (event.button !== 0) {
      return;
    }
    if (this.inputsBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.mapEnabled) {
      this.callbacks.onMapClick?.(event.clientX, event.clientY);
      return;
    }

    if (this.grimoireEnabled) {
      this.callbacks.onGrimoireClick?.(event.clientX, event.clientY);
      // Prevent 3D targeting when grimoire is open
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.inventoryEnabled) {
      this.callbacks.onInventoryClick?.(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // No panel active - allow 3D targeting
    this.callbacks.on3DClick?.(event);
  }

  private handlePointerDown(event: MouseEvent): void {
    this.callbacks.onPointerActivity?.();
    if (this.inputsBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.mapEnabled) {
      this.callbacks.onMapPointerDown?.(event.clientX, event.clientY, event.button);
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (this.grimoireEnabled) {
      this.callbacks.onGrimoirePointerDown?.(event.clientX, event.clientY, event.button);
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    // Sin panel activo: estamos en vuelo. El botón derecho dispara.
    this.callbacks.onFlightPointerDown?.(event.button);
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handlePointerUp(event: MouseEvent): void {
    this.callbacks.onPointerActivity?.();
    if (this.inputsBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.mapEnabled) {
      this.callbacks.onMapPointerUp?.(event.clientX, event.clientY, event.button);
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (this.grimoireEnabled) {
      this.callbacks.onGrimoirePointerUp?.(event.clientX, event.clientY, event.button);
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    this.callbacks.onFlightPointerUp?.(event.button);
    if (event.button === 2) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleContextMenu(event: MouseEvent): void {
    this.callbacks.onPointerActivity?.();
    if (this.mapEnabled || this.grimoireEnabled || this.inventoryEnabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // En vuelo el botón derecho es el gatillo: nunca debe abrir el menú del navegador.
    if (this.callbacks.onFlightContextMenu?.()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Route mouse movement to appropriate panel
   */
  private handleMouseMove(event: MouseEvent): void {
    this.callbacks.onPointerActivity?.();
    if (this.inputsBlocked) {
      return;
    }
    if (this.mapEnabled) {
      this.callbacks.onMapMove?.(event.clientX, event.clientY);
      return;
    }

    if (this.grimoireEnabled) {
      this.callbacks.onGrimoireMove?.(event.clientX, event.clientY);
      return;
    }

    if (this.inventoryEnabled) {
      this.callbacks.onInventoryMove?.(event.clientX, event.clientY);
      return;
    }
    // Sin panel activo: el cursor dirige las armas guiadas.
    this.callbacks.onFlightPointerMove?.(event.clientX, event.clientY);
  }

  /**
   * Route mouse wheel events (only for map zoom)
   */
  private handleWheel(event: WheelEvent): void {
    this.callbacks.onPointerActivity?.();
    if (this.inputsBlocked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.mapEnabled) {
      this.callbacks.onMapWheel?.(event.deltaY, event.clientX, event.clientY);
      // Prevent page scroll when map is open
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (this.inventoryEnabled) {
      this.callbacks.onInventoryWheel?.(event.deltaY, event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /**
   * Cleanup all event listeners
   */
  destroy(): void {
    if (this.canvas) {
      if (this.clickHandler) {
        this.canvas.removeEventListener('click', this.clickHandler);
      }
      if (this.moveHandler) {
        this.canvas.removeEventListener('mousemove', this.moveHandler);
      }
      if (this.wheelHandler) {
        this.canvas.removeEventListener('wheel', this.wheelHandler);
      }
      if (this.pointerDownHandler) {
        this.canvas.removeEventListener('mousedown', this.pointerDownHandler);
      }
      if (this.pointerUpHandler) {
        this.canvas.removeEventListener('mouseup', this.pointerUpHandler);
      }
      if (this.contextMenuHandler) {
        this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
      }
      if (this.pointerLeaveHandler) {
        this.canvas.removeEventListener('mouseleave', this.pointerLeaveHandler);
      }
    }

    this.canvas = null;
    this.callbacks = {};
    
    this.logger.log(LogLevel.INFO, LogCategory.HUD, 'PanelEventCoordinator destroyed');
  }
}
