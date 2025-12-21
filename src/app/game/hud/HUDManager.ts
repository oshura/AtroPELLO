import { CameraMode } from '../Camera';
import { GameLogger } from '../utils/GameLogger';
import { LogCategory } from '../../services/logging.service';
import { HUDTexture } from './HUDTexture';
import { VelocityBar } from './elements/VelocityBar';
import { Compass } from './elements/Compass';
import { NavigationSphere } from './elements/NavigationSphere';
import { SpeedometerDigital } from './elements/SpeedometerDigital';
import { HealthGauge } from './elements/HealthGauge';
import { CargoGauge } from './elements/CargoGauge';
import { MarqueePanel } from './elements/MarqueePanel';
import { TargetingSystem, TargetInfo } from '../types/targeting.types';
import { OrientationBasis } from '../targeting/compass-direction.util';
import { TargetPanel, TargetPanelState, Relation } from './elements/TargetPanel';
import { LandingIndicatorsSnapshot } from '../types/landing.types';
import { CompassCountdownPayload, HudMarqueeEventOptions, HudMarqueeEventType } from '../types/hud.types';

interface QueuedMarqueeEntry {
  id: string;
  type: HudMarqueeEventType;
  message: string;
  createdAt: number;
  priority: number;
  dedupeKey: string;
  loopsRemaining: number;
  totalLoops: number;
}

interface HudMarqueeEventConfig {
  throttleMs: number;
  priority: number;
  allowDuplicates?: boolean;
  loops?: number;
}

interface MarqueeHistoryEntry {
  type: HudMarqueeEventType;
  message: string;
  timestamp: number;
}

const HUD_MARQUEE_DEFAULT_CONFIG: HudMarqueeEventConfig = {
  throttleMs: 1200,
  priority: 5,
  loops: 1,
};

const HUD_MARQUEE_HISTORY_LIMIT = 10;
const HUD_MARQUEE_REPLAY_PRIORITY = 0;

const HUD_MARQUEE_EVENT_CONFIG: Record<HudMarqueeEventType, HudMarqueeEventConfig> = {
  [HudMarqueeEventType.RESPAWN]: { throttleMs: 2000, priority: 1 },
  [HudMarqueeEventType.SYSTEM]: { throttleMs: 1500, priority: 2 },
  [HudMarqueeEventType.LANDING_SEQUENCE]: { throttleMs: 1500, priority: 2 },
  [HudMarqueeEventType.TAKEOFF_SEQUENCE]: { throttleMs: 1500, priority: 2 },
  [HudMarqueeEventType.SHIP_DAMAGE]: { throttleMs: 350, priority: 3, allowDuplicates: true },
  [HudMarqueeEventType.HAZARD]: { throttleMs: 1000, priority: 3 },
  [HudMarqueeEventType.PORTAL]: { throttleMs: 2500, priority: 2 },
  [HudMarqueeEventType.LESSER_BEING]: { throttleMs: 1200, priority: 3 },
  [HudMarqueeEventType.VOID_RITUAL]: { throttleMs: 1200, priority: 4 },
  [HudMarqueeEventType.WARNING]: { throttleMs: 2000, priority: 1 },
};

const HUD_MARQUEE_MAX_ENTRIES = 6;

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
  private healthGauge: HealthGauge;
  private cargoGauge: CargoGauge;
  private marqueePanel: MarqueePanel;
  private targetPanel: TargetPanel;
  private landingIndicators = { landingReady: false, threatActive: false };
  private stallWarningActive: boolean = false; // Track stall state for threat blink
  private stallBlinkTimer: number = 0; // Acumulador para parpadeo cada 1s
  private marqueeEntries: QueuedMarqueeEntry[] = [];
  private marqueeHistory: MarqueeHistoryEntry[] = [];
  private marqueeLastEmit = new Map<HudMarqueeEventType, number>();
  private lastMarqueeUpdateMs: number | null = null;
  
  // Geometría del plano HUD
  private hudGeometry: { vertices: Float32Array; indices: Uint16Array } | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  // Landing windows overlay removed
  
  constructor(gl: WebGL2RenderingContext) {
    GameLogger.debug(LogCategory.HUD, 'HUDManager constructor iniciado');
    this.gl = gl;
    
    // Inicializar sistema de texturas dinámicas
  this.hudTexture = new HUDTexture(gl, 1024, 768);
  GameLogger.debug(LogCategory.HUD, 'HUDTexture creada', { ok: !!this.hudTexture });
    
    // Inicializar elementos del HUD
    this.velocityBarLeft = new VelocityBar('left');
    this.velocityBarRight = new VelocityBar('right');
    this.compass = new Compass();
    this.navigationSphere = new NavigationSphere();
    this.speedometer = new SpeedometerDigital();
    this.healthGauge = new HealthGauge();
    this.cargoGauge = new CargoGauge();
    this.marqueePanel = new MarqueePanel();
  this.targetPanel = new TargetPanel();
    GameLogger.debug(LogCategory.HUD, 'Elementos HUD creados');
    
    // Inicializar sistema de targeting
  this.targetingSystem = new TargetingSystem();
  GameLogger.debug(LogCategory.HUD, 'Sistema targeting inicializado');
    
    // Crear geometría del plano
  this.createHUDPlaneGeometry();
  GameLogger.debug(LogCategory.HUD, 'Geometría HUD creada', { ok: !!this.hudGeometry });

    
    
    // DEBUG GLOBAL: Hacer método disponible en consola del navegador
    (window as any).toggleHUDShader = () => this.toggleDebugShader();
    
    // KEYBOARD LISTENERS: F1 y F2 para debug
    this.setupKeyboardListeners();
    
  GameLogger.info(LogCategory.HUD, 'HUDManager inicializado con FASE 4+ completa');
  }

  /**
   * Actualiza todos los elementos del HUD con datos del juego
   */
  // Variables para debug
  private forceDebugShader: boolean = false; // DESACTIVADO para probar shader texturizado
  private showDebugCanvas: boolean = false; // Canvas debug se activa con F2
  private showHUDFrame: boolean = true; // Marco y grid permanente para inmersión cockpit
  // Reduce noisy logs by default unless explicitly debugging
  private debugHudLogs: boolean = false;
  // Opacidad actual del HUD (0..1) para transiciones
  private hudOpacity: number = 1.0;
  private hudFadeActive: boolean = false;
  private hudFadeDuration: number = 0.3; // 300ms por defecto (dentro de rango pedido 250–400ms)
  private hudFadeElapsed: number = 0;
  
  // Sistema de targeting
  private targetingSystem: TargetingSystem;

  public update(gameData: {
    velocity: number;
    heading: number;
    pitch: number;
    roll: number;
    altitude: number;
    speed: number;
    maxSpeed?: number;
    baseMaxSpeed?: number;
    position?: { x: number; y: number; z: number };
    voidEnergy?: { current: number; max: number; pct: number };
    weapons?: any[];
    shipHealth?: { current: number; max: number; pct: number };
    shipCargo?: { current: number; max: number; pct: number };
    orientation?: OrientationBasis | null;
    // Optional: remaining seconds for active speed rite (Double Phased Time Rite)
    speedRiteRemainingSec?: number | null;
    // Optional: timed spell payload for compass overlay
    compassCountdown?: CompassCountdownPayload | null;
    // Optional: precision rotation indicator
    precisionModeActive?: boolean;
    // Optional: portal traversal cooldown seconds remaining
    portalCooldownSec?: number | null; // ignored (wireframe removed)
    // Atmosphere-specific instruments
    atmosphereMode?: boolean;
    atmospherePitch?: number | null;
    atmosphereRoll?: number | null;
    altitudeAboveGround?: number;
  }): void {
    // Actualizar elementos individuales
    if (typeof gameData.maxSpeed === 'number' && !Number.isNaN(gameData.maxSpeed)) {
      this.velocityBarLeft.setMaxVelocity(gameData.maxSpeed);
      this.velocityBarRight.setMaxVelocity(gameData.maxSpeed);
    }
    if (typeof gameData.baseMaxSpeed === 'number' && !Number.isNaN(gameData.baseMaxSpeed)) {
      this.velocityBarLeft.setBaseMaxVelocity(gameData.baseMaxSpeed);
      this.velocityBarRight.setBaseMaxVelocity(gameData.baseMaxSpeed);
    }
    this.velocityBarLeft.update(gameData.velocity);
    this.velocityBarRight.update(gameData.velocity);
    
    // Actualizar compass con información de targeting
    let targetInfo: TargetInfo | null = null;
    if (gameData.position) {
      targetInfo = this.targetingSystem.getTargetInfo(gameData.position, gameData.orientation);
    }
    this.compass.update(gameData.heading, targetInfo);
    // Timed spell countdown overlay routed to compass
    this.compass.setCountdown(gameData.compassCountdown ?? null);
    this.compass.setPrecisionMode(gameData.precisionModeActive ?? false);
    if (gameData.atmosphereMode) {
      this.compass.setAtmosphereMode(
        true,
        gameData.atmospherePitch ?? gameData.pitch,
        gameData.atmosphereRoll ?? gameData.roll,
        gameData.altitudeAboveGround ?? 0
      );
    } else {
      this.compass.setAtmosphereMode(false);
    }
    
    this.navigationSphere.update(gameData.pitch, gameData.roll, gameData.heading);
  // Determinar si el rito de velocidad está activo (hasta 200%)
  const riteActive = !!(gameData.speedRiteRemainingSec && gameData.speedRiteRemainingSec > 0 && gameData.speed > 100);
  this.speedometer.setRiteActive(riteActive);
  this.speedometer.update(gameData.speed);
  const marqueeDelta = this.captureMarqueeDeltaMs();
  const completedLoops = this.marqueePanel.update(marqueeDelta);
  if (completedLoops.length) {
    for (const messageId of completedLoops) {
      this.handleMarqueeLoopComplete(messageId);
    }
  }
  this.healthGauge.update(gameData.shipHealth ?? null);
  this.cargoGauge.update(gameData.shipCargo ?? null);
    
    // Renderizar todos los elementos en la textura
    // Guardar temporalmente energía del vacío para el render
    (this as any)._voidEnergyHUD = gameData.voidEnergy;
    // Guardar armas de la nave para panel izquierdo
    (this as any)._weaponsHUD = gameData.weapons || [];
    // Guardar salud de la nave para barras de arco
    (this as any)._shipHealthHUD = gameData.shipHealth || null;
    (this as any)._shipCargoHUD = gameData.shipCargo || null;
    // Portal cooldown HUD removed
    this.renderToTexture();
  }

  /** Inicia un fade-in del HUD desde 0 a 1 en la duración configurada */
  public startFadeIn(duration: number = 0.3): void {
    this.hudFadeDuration = Math.max(0.25, Math.min(0.4, duration));
    this.hudFadeElapsed = 0;
    this.hudOpacity = 0;
    this.hudFadeActive = true;
  }

  /** Actualiza animaciones internas (llamar cada frame con deltaTime) */
  public tick(deltaTime: number): void {
    if (this.hudFadeActive) {
      this.hudFadeElapsed += deltaTime;
      const k = Math.min(1, this.hudFadeElapsed / Math.max(0.001, this.hudFadeDuration));
      // Ease-out suave: 1 - (1-k)^3
      const eased = 1 - Math.pow(1 - k, 3);
      this.hudOpacity = eased;
      if (k >= 1) { this.hudFadeActive = false; this.hudOpacity = 1; }
    }
    // Actualizar timer de parpadeo para stall warning (ciclo de 1s)
    if (this.stallWarningActive) {
      this.stallBlinkTimer += deltaTime;
    } else {
      this.stallBlinkTimer = 0;
    }
  }

  // === Target Panel Public API ===
  public updateTargetPanel(state: Partial<TargetPanelState>) {
    this.targetPanel.setData({ active: true, ...state });
    const pc = (state as any).previewCanvas as HTMLCanvasElement | null | undefined;
    if (pc) {
      GameLogger.debug(LogCategory.HUD, 'TargetPanel.update: previewCanvas', { w: pc.width, h: pc.height });
    } else {
      GameLogger.debug(LogCategory.HUD, 'TargetPanel.update: SIN previewCanvas');
    }
  }
  public clearTargetPanel() { this.targetPanel.clear(); }

  /**
   * Actualiza el estado de stall warning para parpadeo del threat light
   */
  public setStallWarning(active: boolean): void {
    this.stallWarningActive = active;
  }

  /**
   * Debug: Mostrar información de estado en consola (F1)
   */
  public showDebugInfo(): void {
    GameLogger.info(LogCategory.HUD, 'INFO DEBUG HUD', {
      forceDebugShader: this.forceDebugShader,
      showDebugCanvas: this.showDebugCanvas,
      showHUDFrame: this.showHUDFrame,
      canvas: `${this.hudTexture.getCanvas().width}x${this.hudTexture.getCanvas().height}`,
      hasTexture: !!this.hudTexture.getWebGLTexture()
    });
  }

  /**
   * Debug: Alternar entre shader texturizado y fallback
   * Útil para comparar y identificar problemas
   */
  public toggleDebugShader(): void {
  this.forceDebugShader = !this.forceDebugShader;
  GameLogger.info(LogCategory.HUD, 'Cambio de shader', { forceFallback: this.forceDebugShader });
  }

  /**
   * Debug: Alternar debug canvas con F2
   */
  public toggleDebugCanvas(): void {
  this.showDebugCanvas = !this.showDebugCanvas;
  GameLogger.info(LogCategory.HUD, 'Toggle debug canvas', { active: this.showDebugCanvas });
    
    if (this.showDebugCanvas) {
      this.createDebugCanvasDisplay();
      GameLogger.debug(LogCategory.HUD, 'Canvas debug creado');
    } else {
      this.removeDebugCanvasDisplay();
      GameLogger.debug(LogCategory.HUD, 'Canvas debug eliminado');
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

  GameLogger.debug(LogCategory.HUD, 'Controles debug configurados');
  }

  // === MÉTODOS PÚBLICOS PARA MARQUEE PANEL ===
  
  /**
   * Establecer mensajes del panel de marquesina
   */
  public setMarqueeMessages(messages: string[]): void {
    this.marqueeEntries = [];
    this.marqueeLastEmit.clear();
    for (const message of messages) {
      this.emitMarqueeEvent(HudMarqueeEventType.SYSTEM, message, {
        force: true,
        allowDuplicate: true,
      });
    }
  }

  /**
   * Emite un evento de marquee con metadatos para throttling y prioridad.
   */
  public emitMarqueeEvent(
    type: HudMarqueeEventType,
    message: string,
    options?: HudMarqueeEventOptions
  ): void {
    const text = (message ?? '').trim();
    if (!text) {
      return;
    }

    const now = this.nowMs();
    const config = HUD_MARQUEE_EVENT_CONFIG[type] ?? HUD_MARQUEE_DEFAULT_CONFIG;
    const dedupeKey = options?.dedupeKey ?? `${type}-${text}`;

    if (!options?.force && config.throttleMs > 0) {
      const last = this.marqueeLastEmit.get(type) ?? 0;
      if (now - last < config.throttleMs) {
        return;
      }
    }

    if (!options?.allowDuplicate && !config.allowDuplicates) {
      const existing = this.marqueeEntries.find(entry => entry.dedupeKey === dedupeKey);
      if (existing) {
        existing.createdAt = now;
        existing.priority = Math.min(existing.priority, options?.priorityOverride ?? config.priority);
        existing.loopsRemaining = existing.totalLoops;
        this.sortMarqueeEntries();
        this.syncMarqueePanel();
        return;
      }
    }

    this.marqueeLastEmit.set(type, now);
    const loops = this.resolveLoopBudget(type, options);
    const entry: QueuedMarqueeEntry = {
      id: `${type}-${now.toFixed(3)}`,
      type,
      message: text,
      createdAt: now,
      priority: options?.priorityOverride ?? config.priority,
      dedupeKey,
      loopsRemaining: loops,
      totalLoops: loops,
    };

    this.marqueeEntries.push(entry);
    this.sortMarqueeEntries();
    this.trimMarqueeEntries();
    this.syncMarqueePanel();
  }

  /**
   * Limpiar mensajes del panel de marquesina
   */
  public clearMarqueeMessages(): void {
    this.marqueeEntries = [];
    this.marqueePanel.clearMessages();
  }

  /**
   * Obtener el mensaje actual del panel
   */
  public getCurrentMarqueeMessage(): string {
    return this.marqueePanel.getCurrentMessage();
  }

  private handleMarqueeLoopComplete(messageId: string): void {
    const entryIndex = this.marqueeEntries.findIndex(entry => entry.id === messageId);
    if (entryIndex === -1) {
      return;
    }
    const entry = this.marqueeEntries[entryIndex];
    entry.loopsRemaining = Math.max(0, entry.loopsRemaining - 1);
    if (entry.loopsRemaining > 0) {
      return;
    }
    this.marqueeEntries.splice(entryIndex, 1);
    this.recordMarqueeHistory(entry);
    this.syncMarqueePanel();
  }

  private captureMarqueeDeltaMs(): number {
    const now = this.nowMs();
    if (this.lastMarqueeUpdateMs === null) {
      this.lastMarqueeUpdateMs = now;
      return 16.67;
    }
    const delta = now - this.lastMarqueeUpdateMs;
    this.lastMarqueeUpdateMs = now;
    return Math.max(4, Math.min(200, delta));
  }

  private sortMarqueeEntries(): void {
    this.marqueeEntries.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.createdAt - b.createdAt;
    });
  }

  private trimMarqueeEntries(): void {
    while (this.marqueeEntries.length > HUD_MARQUEE_MAX_ENTRIES) {
      this.marqueeEntries.pop();
    }
  }

  private resolveLoopBudget(type: HudMarqueeEventType, options?: HudMarqueeEventOptions): number {
    const config = HUD_MARQUEE_EVENT_CONFIG[type] ?? HUD_MARQUEE_DEFAULT_CONFIG;
    const raw = options?.loops ?? config.loops ?? HUD_MARQUEE_DEFAULT_CONFIG.loops ?? 1;
    return Math.max(1, Math.floor(raw));
  }

  private syncMarqueePanel(): void {
    if (!this.marqueeEntries.length) {
      this.marqueePanel.clearMessages();
      return;
    }
    const messages = this.marqueeEntries.map(entry => ({ id: entry.id, text: entry.message }));
    this.marqueePanel.setMessages(messages, true);
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private recordMarqueeHistory(entry: QueuedMarqueeEntry): void {
    if (!entry?.message) {
      return;
    }
    this.marqueeHistory.push({
      type: entry.type,
      message: entry.message,
      timestamp: this.nowMs(),
    });
    if (this.marqueeHistory.length > HUD_MARQUEE_HISTORY_LIMIT) {
      const excess = this.marqueeHistory.length - HUD_MARQUEE_HISTORY_LIMIT;
      this.marqueeHistory.splice(0, excess);
    }
  }

  public replayLastMarqueeHistory(): boolean {
    const replayEntry = this.marqueeHistory.pop();
    if (!replayEntry) {
      return false;
    }
    this.emitMarqueeEvent(replayEntry.type, replayEntry.message, {
      force: true,
      allowDuplicate: true,
      loops: 1,
      priorityOverride: HUD_MARQUEE_REPLAY_PRIORITY,
    });
    return true;
  }

  /**
   * Actualiza los pilotos de aterrizaje/amenaza situados junto al marquee.
   */
  public setLandingIndicators(snapshot: LandingIndicatorsSnapshot): void {
    this.landingIndicators = { ...snapshot };
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
  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, 'HUDManager.render called with', {
      cameraMode: cameraMode,
      isCockpit: cameraMode === CameraMode.COCKPIT,
      hasGeometry: !!this.hudGeometry,
      CockpitEnum: CameraMode.COCKPIT
    });
    
    if (cameraMode !== CameraMode.COCKPIT || !this.hudGeometry) {
  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, 'HUD render rejected', {
        wrongMode: cameraMode !== CameraMode.COCKPIT,
        noGeometry: !this.hudGeometry
      });
      return;
    }

  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, '=== INICIO RENDER HUD ===');
    
    // PASO 1: Verificar que la textura Canvas 2D está actualizada
  if (this.showDebugCanvas) this.debugCanvasContent();
    
    // PASO 2: Verificar estado de componentes necesarios
    const hudProgram = shaderManager.hudProgram;
    const webglTexture = this.hudTexture?.getWebGLTexture();
    
  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, 'Estado de componentes', {
      hasHUDProgram: !!hudProgram,
      hasHudTexture: !!this.hudTexture,
      hasWebGLTexture: !!webglTexture,
      isValidTexture: webglTexture ? this.gl.isTexture(webglTexture) : false
    });
    
    // DECISIÓN: ¿Usar shader HUD o fallback?
    const hasValidComponents = hudProgram && webglTexture && this.gl.isTexture(webglTexture);
    const useHUDShader = hasValidComponents && !this.forceDebugShader;
    
    if (useHUDShader) {
  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, 'Usando shader HUD');
      this.gl.useProgram(hudProgram);
      
      // DEBUG CRÍTICO: Verificar el programa shader en detalle
  if (this.debugHudLogs) this.debugShaderProgram(hudProgram, 'HUD');
      
      this.setupHUDRenderingState(shaderManager);
      this.setupHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
    } else {
      const reason = this.forceDebugShader ? 'FORZADO' : 'COMPONENTES FALTANTES';
  if (this.debugHudLogs) GameLogger.debug(LogCategory.HUD, 'Usando shader FALLBACK (magenta)', { reason });
      const program = shaderManager.litProgram;
      this.gl.useProgram(program);
      
      // DEBUG: Verificar también el programa fallback
  if (this.debugHudLogs) this.debugShaderProgram(program, 'FALLBACK');
      
      this.setupBasicRenderingState(shaderManager);
      this.setupFallbackHUDMatrices(shaderManager, viewMatrix, projectionMatrix);
      shaderManager.setLitColor(new Float32Array([1.0, 0.0, 1.0])); // Magenta brillante
    }
    
    // Bloque fallback legacy desactivado
    
    // Debug: verificar estado del renderizado
    if (this.debugHudLogs) {
      const currentProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
      const activeTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
      const boundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  GameLogger.trace(LogCategory.HUD, 'Estado HUD debug', {
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
    }
    
    // Desactivar depth test temporalmente para forzar visibilidad
    const depthTestEnabled = this.gl.getParameter(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.DEPTH_TEST);
    
    // Configurar transparencia
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.depthMask(false);
    
    // Renderizar el plano HUD
    // Aplicar opacidad (si el shader la soporta) antes de dibujar
    try {
      const opacityLocation = shaderManager.hudUniforms?.['opacity'];
      if (opacityLocation) {
        this.gl.uniform1f(opacityLocation, Math.max(0, Math.min(1, this.hudOpacity)));
      }
    } catch {}

    this.gl.drawElements(this.gl.TRIANGLES, this.hudGeometry.indices.length, this.gl.UNSIGNED_SHORT, 0);
    
    // Verificar errores GL
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
  GameLogger.error(LogCategory.HUD, 'Error GL al renderizar HUD', { error });
    } else if (this.debugHudLogs) {
  GameLogger.debug(LogCategory.HUD, 'HUD renderizado sin errores GL');
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
    
  GameLogger.trace(LogCategory.HUD, 'HUD siguiendo cámara', { cameraPosition });
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
    const sideMargin = 28;
    const weaponsPanelWidth = Math.round(280 * 0.65);
    const weaponsPanelHeight = Math.round(56 * 2.5);
    const weaponsPanelX = sideMargin;
    const weaponsPanelY = sideMargin + 24;
    const weaponsPanelRightEdge = weaponsPanelX + weaponsPanelWidth;
    
    // === MARQUEE PANEL === (reemplaza "SPEEDOMETER TEST")
    // Posición: parte superior central (ahora más grande: 450x80)
    const marqueeX = centerX - 225; // Centrar panel de 450px
    const marqueeY = 20;
    const { width: marqueeWidth, height: marqueeHeight } = this.marqueePanel.getDimensions();
    const landingPilotX = marqueeX - 32;
    const threatPilotX = marqueeX + marqueeWidth + 32;
    const pilotY = marqueeY + marqueeHeight / 2;
    this.drawPilotLight(ctx, landingPilotX, pilotY, {
      label: 'Land',
      active: this.landingIndicators.landingReady,
      onColor: '#22c55e',
      offColor: '#0f1f12',
      glowColor: 'rgba(34,197,94,0.45)',
      radius: 10
    });
    // Threat light: parpadea cada 1s cuando hay stall warning
    const threatBlink = this.stallWarningActive && (Math.floor(this.stallBlinkTimer) % 2 === 0);
    this.drawPilotLight(ctx, threatPilotX, pilotY, {
      label: 'Threat',
      active: this.landingIndicators.threatActive || threatBlink,
      onColor: '#ef4444',
      offColor: '#2c0f0f',
      glowColor: 'rgba(239,68,68,0.45)',
      radius: 10
    });
    this.marqueePanel.render(ctx, marqueeX, marqueeY);
    
    // (El velocímetro superior derecho se elimina; ahora se duplican sobre cada barra)
    
    // === COMPASS === 
    // Posición: parte superior central (debajo de marquee más grande)
    const compassPos = {
      x: centerX,
      y: 200  // Bajada adicional para evitar solaparse con el marquee
    };
    this.compass.render(ctx, compassPos);

    const shipHealth = (this as any)._shipHealthHUD as { current: number; max: number; pct: number } | null;
    let healthGaugeCenterX: number | null = null;
    if (shipHealth) {
      const dims = this.healthGauge.getDimensions();
      const gapFromWeapons = 10;
      const gapFromCompass = 58;
      const areaLeft = weaponsPanelRightEdge + gapFromWeapons;
      const areaRight = compassPos.x - gapFromCompass;
      const minX = areaLeft + dims.width / 2;
      const maxX = areaRight - dims.width / 2;
      let gaugeX = minX + 18;
      if (gaugeX > maxX) {
        gaugeX = Math.max(minX, maxX);
      }
      healthGaugeCenterX = gaugeX;
      const gaugeY = compassPos.y + dims.height * 0.1;
      this.healthGauge.render(ctx, { x: gaugeX, y: gaugeY });
    }

    const shipCargo = (this as any)._shipCargoHUD as { current: number; max: number; pct: number } | null;
    if (shipCargo) {
      const dims = this.cargoGauge.getDimensions();
      const gapFromCompass = 58;
      const mirroredX = healthGaugeCenterX !== null ? canvas.width - healthGaugeCenterX : null;
      const areaLeft = compassPos.x + gapFromCompass + dims.width / 2;
      const areaRight = canvas.width - sideMargin - dims.width / 2;
      let gaugeX = mirroredX ?? (areaRight - 18);
      gaugeX = Math.max(areaLeft, Math.min(areaRight, gaugeX));
      const gaugeY = compassPos.y + dims.height * 0.1;
      this.cargoGauge.render(ctx, { x: gaugeX, y: gaugeY });
    }

    // Salud y portal wireframe eliminados (diseño pendiente de redefinición)

    // === VOID ENERGY METER (top-right, adjusted thickness + legend) ===
    const vem = (this as any)._voidEnergyHUD as { current: number; max: number; pct: number } | undefined;
    if (vem) {
      // 25% shorter horizontally, double thickness vertically
      const meterW = weaponsPanelWidth; // mirror weapons panel width to keep edge breathing room
      const meterH = 56; // double previous 28px height
      const margin = 28; // side/top margin
      const x1 = canvas.width - meterW - margin;
      // Place the bar lower on the HUD (increase top offset)
      const y1 = margin + 56; // move panel further down by 56px
      // fondo
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x1, y1, meterW, meterH);
      // marco
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 - 1, y1 - 1, meterW + 2, meterH + 2);
      // color por tramos similar a salud
      const pct = Math.max(0, Math.min(100, vem.pct));
      let col = 'rgba(255,0,0,0.95)';
      if (pct >= 75) col = 'rgba(0,255,0,0.95)';
      else if (pct >= 50) col = 'rgba(255,220,0,0.95)';
      else if (pct >= 25) col = 'rgba(255,128,0,0.95)';
      ctx.fillStyle = col;
      // reverse fill: start from right edge and fill leftwards
      const fillW = Math.round((pct / 100) * meterW);
      const fillX = x1 + (meterW - fillW);
      ctx.fillRect(fillX, y1, fillW, meterH);

      // segment lines and legend (100%, 75%, 50%, 25%) under the bar
      const ticks = [1.0, 0.75, 0.5, 0.25];
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.font = '12px Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const labelY = y1 + meterH + 8;
      const labelOffset = 6;
      ticks.forEach(p => {
        const xTick = x1 + (1 - p) * meterW; // 100% at left, 25% near right
        // draw vertical tick spanning through bar and slightly below
        ctx.beginPath();
        ctx.moveTo(xTick, y1 - 2);
        ctx.lineTo(xTick, y1 + meterH + 6);
        ctx.stroke();
        // label text under the tick
        const pctLabel = Math.round(p * 100) + '%';
        ctx.fillText(pctLabel, xTick + labelOffset, labelY);
      });
      // etiqueta: draw above the bar with vertical-only stretch (safe with save/restore)
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '20px Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      const unitsStr = `${Math.round(vem.current)}u`;
      const labelText = `Void Energy: ${unitsStr}`;
      const labelX = x1 + meterW;
      const labelYTitle = y1 - 8;
      ctx.save();
      ctx.translate(labelX, labelYTitle);
      ctx.scale(1, 1.35);
      ctx.fillText(labelText, 0, 0);
      ctx.restore();
      ctx.restore();
    }

    // Landing windows overlay removed

    // === WEAPONS PANEL (top-left, mirrored size/height) ===
    // Always reserve symmetric space on the left side
    {
      const weapons: any[] = (this as any)._weaponsHUD as any[];
      const meterW = weaponsPanelWidth;
      const meterH = weaponsPanelHeight;
      const xL = weaponsPanelX;
      const yL = weaponsPanelY;

      // background
      ctx.save();
      ctx.fillStyle = 'rgba(0, 64, 32, 0.35)'; // dark greenish transparent
      ctx.fillRect(xL, yL, meterW, meterH);
      // frame
      ctx.strokeStyle = 'rgba(0,255,0,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(xL - 1, yL - 1, meterW + 2, meterH + 2);

      if (!weapons || weapons.length === 0) {
        // Show NO WEAPONS centered in the panel
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Slightly taller text without widening
        ctx.font = '20px Segoe UI, Roboto, sans-serif';
        const cx = xL + meterW / 2;
        const cy = yL + meterH / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 1.25);
        ctx.fillText('NO WEAPONS', 0, 0);
        ctx.restore();
      } else {
        // Placeholder schematic (if weapons exist): draw slots as small boxes
        const slotCount = Math.min(5, weapons.length);
        const gap = 6;
        const slotW = Math.max(24, Math.floor((meterW - gap * (slotCount + 1)) / slotCount));
        const slotH = meterH - 16;
        let sx = xL + gap;
        const sy = yL + (meterH - slotH) / 2;
        for (let i = 0; i < slotCount; i++) {
          ctx.fillStyle = 'rgba(0,128,64,0.4)';
          ctx.fillRect(sx, sy, slotW, slotH);
          ctx.strokeStyle = 'rgba(0,255,128,0.9)';
          ctx.strokeRect(sx - 1, sy - 1, slotW + 2, slotH + 2);
          sx += slotW + gap;
        }
      }
      ctx.restore();
    }

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
  // === SPEEDOMETER DUPLICADO SOBRE CADA BARRA ===
  // Renderizar dos instancias: izquierda y derecha, alineadas con cada barra
  // Dimensiones conocidas del speedometer digital (ver SpeedometerDigital)
  const speedWidth = 120;
  const speedHeight = 40;
  const marginAbovePanel = 20; // separación con el panel (subido un poco más)
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
      // Marco principal en verde fósforo
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)'; // Verde fósforo
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      
      // Grid de referencia sutil
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.08)'; // Muy sutil (verde)
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
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
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
    
  if (this.debugHudLogs) GameLogger.trace(LogCategory.HUD, 'Canvas 2D renderizado con debug visual');
    
    // Forzar flush del contexto Canvas 2D
  if (this.debugHudLogs) ctx.getImageData(0, 0, 1, 1);
    
    // Actualizar textura WebGL
    this.hudTexture.updateTexture();
    
  if (this.debugHudLogs) GameLogger.trace(LogCategory.HUD, 'Textura WebGL actualizada desde Canvas 2D');
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
    
  GameLogger.debug(LogCategory.HUD, 'DEBUG Canvas 2D', {
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

  GameLogger.info(LogCategory.HUD, 'Debug canvas display creado');
  }

  /**
   * Elimina el display visual del canvas
   */
  private removeDebugCanvasDisplay(): void {
    const existing = document.getElementById('hud-debug-canvas');
    if (existing) {
      existing.remove();
  GameLogger.info(LogCategory.HUD, 'Debug canvas display eliminado');
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

  private drawPilotLight(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    options: { label: string; active: boolean; onColor: string; offColor: string; glowColor: string; radius?: number }
  ): void {
    const radius = options.radius ?? 14;
    ctx.save();

    if (options.active) {
      const glow = ctx.createRadialGradient(centerX, centerY, radius * 0.6, centerX, centerY, radius * 1.8);
      glow.addColorStop(0, options.glowColor);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = options.active ? options.onColor : options.offColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.stroke();

    const labelColor = options.active ? 'rgba(248,250,252,0.95)' : 'rgba(148,163,184,0.85)';
    ctx.fillStyle = labelColor;
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(options.label, centerX, centerY + radius + 8);

    ctx.restore();
  }

  /**
   * Debug detallado del programa shader
   */
  private debugShaderProgram(program: WebGLProgram, type: string): void {
  GameLogger.debug(LogCategory.HUD, 'DEBUG SHADER begin', { type });
    
    if (!this.gl.isProgram(program)) {
  GameLogger.error(LogCategory.HUD, `${type}: No es un programa válido`);
      return;
    }
    
    // Verificar si está linkeado
    const linkStatus = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
  GameLogger.debug(LogCategory.HUD, `${type} Link Status`, { linkStatus });
    
    if (!linkStatus) {
      const errorInfo = this.gl.getProgramInfoLog(program);
  GameLogger.error(LogCategory.HUD, `${type} Link Error`, { errorInfo });
    }
    
    // Obtener número de atributos y uniforms activos
    const activeAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES);
    const activeUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
    
  GameLogger.debug(LogCategory.HUD, `${type} Activos`, {
      attributes: activeAttributes,
      uniforms: activeUniforms
    });
    
    // Listar todos los atributos activos
  GameLogger.trace(LogCategory.HUD, `${type} Atributos listado`);
    for (let i = 0; i < activeAttributes; i++) {
      const info = this.gl.getActiveAttrib(program, i);
      if (info) {
        const location = this.gl.getAttribLocation(program, info.name);
  GameLogger.trace(LogCategory.HUD, 'Atributo activo', { shaderType: type, name: info.name, location, glType: info.type, size: info.size });
      }
    }
    
    // Listar todos los uniforms activos
  GameLogger.trace(LogCategory.HUD, `${type} Uniforms listado`);
    for (let i = 0; i < activeUniforms; i++) {
      const info = this.gl.getActiveUniform(program, i);
      if (info) {
        const location = this.gl.getUniformLocation(program, info.name);
  GameLogger.trace(LogCategory.HUD, 'Uniform activo', { shaderType: type, name: info.name, location, glType: info.type, size: info.size });
      }
    }
    
  GameLogger.debug(LogCategory.HUD, 'Debug shader completado', { type });
  }

  /**
   * Configura el estado de renderizado para texturas dinámicas
   */
  private setupHUDRenderingState(shaderManager: any): void {
  GameLogger.debug(LogCategory.HUD, 'CONFIGURANDO ESTADO HUD');
    
    // PASO 1: Verificar y enlazar textura del HUD
    const webglTexture = this.hudTexture.getWebGLTexture();
    const isValidTexture = this.gl.isTexture(webglTexture);
    
  GameLogger.trace(LogCategory.HUD, 'Estado de textura', {
      texture: webglTexture,
      isValidTexture: isValidTexture,
      textureTarget: this.gl.TEXTURE_2D
    });
    
    if (!isValidTexture) {
  GameLogger.error(LogCategory.HUD, 'CRÍTICO: Textura WebGL no válida');
      return;
    }
    
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, webglTexture);
    
    // Verificar que la textura se enlazó correctamente
    const boundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
  GameLogger.trace(LogCategory.HUD, 'Textura enlazada', { valid: this.gl.isTexture(boundTexture) });
    
    // PASO 2: Configurar buffers de geometría
    const hasVertexBuffer = this.gl.isBuffer(this.vertexBuffer);
    const hasIndexBuffer = this.gl.isBuffer(this.indexBuffer);
    
  GameLogger.trace(LogCategory.HUD, 'Buffers estado', {
      vertexBuffer: hasVertexBuffer,
      indexBuffer: hasIndexBuffer
    });
    
    if (!hasVertexBuffer || !hasIndexBuffer) {
  GameLogger.error(LogCategory.HUD, 'CRÍTICO: Buffers de geometría no válidos');
      return;
    }
    
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    // PASO 3: Configurar atributos del shader HUD
    const positionLocation = shaderManager.hudAttributes?.['position'] ?? -1;
    const uvLocation = shaderManager.hudAttributes?.['uv'] ?? -1;
    
  GameLogger.trace(LogCategory.HUD, 'Atributos shader HUD', {
      position: positionLocation,
      uv: uvLocation,
      availableAttributes: Object.keys(shaderManager.hudAttributes || {})
    });
    
    let attributesConfigured = 0;
    
    if (positionLocation >= 0) {
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 3, this.gl.FLOAT, false, 5 * 4, 0);
      attributesConfigured++;
  GameLogger.trace(LogCategory.HUD, 'Atributo posición configurado');
    } else {
  GameLogger.error(LogCategory.HUD, 'CRÍTICO: Atributo position no encontrado');
    }
    
    if (uvLocation >= 0) {
      this.gl.enableVertexAttribArray(uvLocation);
      this.gl.vertexAttribPointer(uvLocation, 2, this.gl.FLOAT, false, 5 * 4, 3 * 4);
      attributesConfigured++;
  GameLogger.trace(LogCategory.HUD, 'Atributo UV configurado');
    } else {
  GameLogger.error(LogCategory.HUD, 'CRÍTICO: Atributo uv no encontrado');
    }

    // El shader HUD no requiere normales, solo posición y UV
    
    // PASO 4: Configurar uniform de textura
    const textureLocation = shaderManager.hudUniforms?.['texture'];
    const opacityLocation = shaderManager.hudUniforms?.['opacity'];
    
  GameLogger.trace(LogCategory.HUD, 'Uniforms HUD disponibles', {
      texture: textureLocation,
      opacity: opacityLocation,
      allUniforms: Object.keys(shaderManager.hudUniforms || {})
    });
    
    // Configurar uniforms del shader HUD
    let textureUniformSet = false;
    
    if (textureLocation !== null && textureLocation !== undefined) {
      this.gl.uniform1i(textureLocation, 0); // Textura en unidad 0
      textureUniformSet = true;
  GameLogger.trace(LogCategory.HUD, 'Uniform u_texture configurado');
    } else {
  GameLogger.error(LogCategory.HUD, 'CRÍTICO: No se encontró uniform u_texture');
    }
    
    if (opacityLocation !== null && opacityLocation !== undefined) {
      this.gl.uniform1f(opacityLocation, 1.0); // Opacidad completa
  GameLogger.trace(LogCategory.HUD, 'Uniform u_opacity configurado');
    }
    
    // PASO 5: Verificar estado final de WebGL
    const finalBoundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
    const activeTextureUnit = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
    
  GameLogger.trace(LogCategory.HUD, 'Estado final WebGL', {
      textureBinding2D: finalBoundTexture,
      isValidBoundTexture: this.gl.isTexture(finalBoundTexture),
      activeTextureUnit: activeTextureUnit,
      expectedUnit: this.gl.TEXTURE0
    });
    
    // Verificar errores WebGL
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
  GameLogger.error(LogCategory.HUD, 'Error WebGL en setupHUDRenderingState', { error });
    } else {
  GameLogger.debug(LogCategory.HUD, 'Estado HUD configurado', { attributesConfigured, textureUniformSet });
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

  GameLogger.trace(LogCategory.HUD, 'HUD ESPACIO CÁMARA (básico)');

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

  GameLogger.trace(LogCategory.HUD, 'HUD ESPACIO CÁMARA (fallback)');
  }

  private setupHUDMatrices(shaderManager: any, originalViewMatrix: Float32Array, projectionMatrix: Float32Array): void {
  GameLogger.debug(LogCategory.HUD, 'CONFIGURANDO MATRICES HUD');
    
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
    GameLogger.trace(LogCategory.HUD, 'Uniforms HUD disponibles', { uniforms: Object.keys(shaderManager.hudUniforms || {}) });

    // Aplicar matrices para el shader HUD
    const modelMatrixLocation = shaderManager.hudUniforms?.['modelMatrix'];
    const viewMatrixLocation = shaderManager.hudUniforms?.['viewMatrix'];
    const projectionMatrixLocation = shaderManager.hudUniforms?.['projectionMatrix'];

  GameLogger.trace(LogCategory.HUD, 'Localizaciones de matrices HUD', {
      model: modelMatrixLocation,
      view: viewMatrixLocation,
      projection: projectionMatrixLocation
    });

    let matricesConfigured = 0;
    
    if (modelMatrixLocation !== null && modelMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(modelMatrixLocation, false, hudModelMatrix);
      matricesConfigured++;
  GameLogger.trace(LogCategory.HUD, 'Matriz modelo configurada');
    }
    if (viewMatrixLocation !== null && viewMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(viewMatrixLocation, false, hudViewMatrix);
      matricesConfigured++;
  GameLogger.trace(LogCategory.HUD, 'Matriz vista configurada');
    }
    if (projectionMatrixLocation !== null && projectionMatrixLocation !== undefined) {
      this.gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);
      matricesConfigured++;
  GameLogger.trace(LogCategory.HUD, 'Matriz proyección configurada');
    }
    // El shader HUD no requiere matriz normal

  GameLogger.debug(LogCategory.HUD, 'Matrices configuradas', { count: matricesConfigured, expected: 3 });

    // El shader HUD no requiere parámetros de iluminación - es simple textura 2D
  GameLogger.debug(LogCategory.HUD, 'Configuración de matrices HUD completada');
  }

  /**
   * Crea la geometría del plano HUD inclinado 
   * CORREGIDO: Geometría en espacio de cámara para que sea FIJA (no rote con nave)
   */
  private createHUDPlaneGeometry(): void {
    // Ajuste para FOV 45º: reducir tamaño y alinear borde inferior con corte inferior de la cámara
    // Nota: con proyección estándar, y_bottom ≈ baseZ / f, donde f = 1/tan(FOV/2). Para FOV 45°, f≈2.414 y con Z=-1.5, y_bottom≈-0.621.
    // Dejamos un margen mínimo hacia arriba para asegurar visibilidad completa.
    const width = 1.70;   // Reducido (antes 2.0)
    const height = 0.48;  // Reducido (antes 0.6)
    const baseZ = -1.5;   // Profundidad estable y segura dentro del frustum
  const baseY = -0.63;  // Un poco más bajo para asegurar que no se recorte el borde inferior
    const tilt = 10 * (Math.PI / 180); // Inclinación ligera para legibilidad
    
  GameLogger.debug(LogCategory.HUD, 'CREANDO GEOMETRÍA HUD');
    
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

  GameLogger.trace(LogCategory.HUD, 'Coordenadas de vértices (x,y,z,u,v)');
    for (let i = 0; i < vertices.length; i += 5) {
  GameLogger.trace(LogCategory.HUD, 'Vértice', { index: i/5, x: +vertices[i].toFixed(2), y: +vertices[i+1].toFixed(2), z: +vertices[i+2].toFixed(2), u: +vertices[i+3].toFixed(2), v: +vertices[i+4].toFixed(2) });
    }

    // Triángulos: 0-1-2, 0-2-3 (orden counter-clockwise)
    const indices = [0, 1, 2, 0, 2, 3];
    
  GameLogger.trace(LogCategory.HUD, 'Índices de triángulos', { indices });
  GameLogger.debug(LogCategory.HUD, 'Dimensiones HUD', { width, height, tiltDeg: +(tilt * 180/Math.PI).toFixed(1) });

    this.hudGeometry = {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices)
    };
    
    this.createBuffers();
    
  GameLogger.info(LogCategory.HUD, 'Geometría HUD creada', { vertices: 4, triangles: 2, floatsPerVertex: 5 });
  }

  /**
   * Crea los buffers WebGL para la geometría
   */
  private createBuffers(): void {
    if (!this.hudGeometry) {
  GameLogger.error(LogCategory.HUD, 'No hay geometría HUD para crear buffers');
      return;
    }
    
    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.hudGeometry.vertices, this.gl.STATIC_DRAW);
  GameLogger.debug(LogCategory.HUD, 'Vertex buffer creado', { ok: !!this.vertexBuffer });
    
    this.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.hudGeometry.indices, this.gl.STATIC_DRAW);
  GameLogger.debug(LogCategory.HUD, 'Index buffer creado', { ok: !!this.indexBuffer });
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