/**
 * Sistema de Retícula WebGL - Tipos y Interfaces
 * FASE 1: Core Targeting System
 */

import { ITargetable } from '../../types/targeting.types';

// ===============================
// ENUMS DE CONFIGURACIÓN
// ===============================

/**
 * Estados de la máquina de estados del sistema de retícula
 */
export enum ReticleState {
  IDLE = 'idle',           // Sin target, retícula libre
  SCANNING = 'scanning',   // Mouse over objeto targeteable
  LOCKED = 'locked',       // Target seleccionado y locked
  TRANSITIONING = 'transitioning' // Transición entre targets
}

/**
 * Tipos de retícula disponibles
 */
export enum ReticleType {
  CROSSHAIR = 'crosshair',     // Cruz simple
  BRACKETS = 'brackets',       // Brackets angulares
  CIRCLE = 'circle',          // Círculo con punto central
  DYNAMIC = 'dynamic'         // Cambia según contexto
}

/**
 * Tipos de highlighting para targets
 */
export enum HighlightType {
  OUTLINE = 'outline',         // Borde brillante
  PULSING = 'pulsing',        // Efecto de pulso
  GLOW = 'glow',              // Resplandor
  BRACKETS_3D = 'brackets_3d'  // Brackets 3D alrededor del objeto
}

// ===============================
// INTERFACES DE DATOS
// ===============================

/**
 * Posición 2D en pantalla (coordenadas de canvas)
 */
export interface ScreenPosition {
  x: number;
  y: number;
}

/**
 * Información de raycast para detección de targets
 */
export interface RaycastHit {
  target: ITargetable;
  distance: number;
  screenPosition: ScreenPosition;
  worldPosition: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

/**
 * Configuración de la retícula
 */
export interface ReticleConfig {
  type: ReticleType;
  size: number;              // Tamaño base en píxeles
  color: [number, number, number, number]; // RGBA
  thickness: number;         // Grosor de líneas
  opacity: number;          // Transparencia
  animated: boolean;        // Si tiene animaciones
  animationSpeed: number;   // Velocidad de animación
}

/**
 * Configuración de highlighting
 */
export interface HighlightConfig {
  type: HighlightType;
  color: [number, number, number, number];
  intensity: number;
  pulseSpeed?: number;
  glowRadius?: number;
}

/**
 * Estado actual del sistema de retícula
 */
export interface ReticleSystemState {
  currentState: ReticleState;
  mousePosition: ScreenPosition;
  currentTarget: ITargetable | null;
  hoveredTarget: ITargetable | null;
  reticlePosition: ScreenPosition;
  isVisible: boolean;
  config: ReticleConfig;
}

// ===============================
// INTERFACES DE COMPONENTES
// ===============================

/**
 * Interface para detectores de targets
 */
export interface ITargetDetector {
  /**
   * Detecta targets en una posición de pantalla
   */
  detectTargetAt(screenPos: ScreenPosition): RaycastHit | null;
  
  /**
   * Obtiene todos los targets visibles en pantalla
   */
  getVisibleTargets(): ITargetable[];
  
  /**
   * Verifica si un objeto está en el campo de visión
   */
  isInViewFrustum(target: ITargetable): boolean;
}

/**
 * Interface para renderizado de retícula
 */
export interface IReticleRenderer {
  /**
   * Renderiza la retícula en la posición especificada
   */
  render(position: ScreenPosition, config: ReticleConfig, deltaTime: number): void;
  
  /**
   * Actualiza animaciones de la retícula
   */
  update(deltaTime: number): void;
  
  /**
   * Cambia el tipo de retícula con transición suave
   */
  setReticleType(type: ReticleType, animated?: boolean): void;
}

/**
 * Interface para highlighting de targets
 */
export interface ITargetHighlighter {
  /**
   * Aplica highlighting a un target
   */
  highlightTarget(target: ITargetable, config: HighlightConfig): void;
  
  /**
   * Remueve highlighting de un target
   */
  removeHighlight(target: ITargetable): void;
  
  /**
   * Actualiza efectos de highlighting
   */
  update(deltaTime: number): void;
  
  /**
   * Renderiza todos los highlights activos
   */
  render(): void;
}

// ===============================
// EVENTOS DEL SISTEMA
// ===============================

/**
 * Eventos del sistema de targeting
 */
export interface TargetingEvents {
  onTargetHovered: (target: ITargetable | null) => void;
  onTargetSelected: (target: ITargetable | null) => void;
  onTargetLocked: (target: ITargetable) => void;
  onTargetLost: () => void;
  onStateChanged: (newState: ReticleState, oldState: ReticleState) => void;
}

/**
 * Configuración de input del sistema
 */
export interface InputConfig {
  mouseButton: number;      // Botón para seleccionar (0=left, 1=middle, 2=right)
  keyboardKey: string;      // Tecla para deseleccionar ('Escape')
  holdToLock: boolean;      // Si requiere mantener presionado
  doubleClickToLock: boolean; // Si requiere doble click
}

// ===============================
// CONFIGURACIÓN PRINCIPAL
// ===============================

/**
 * Configuración completa del sistema de retícula
 */
export interface TargetingSystemConfig {
  reticle: ReticleConfig;
  highlight: HighlightConfig;
  input: InputConfig;
  detection: {
    maxDistance: number;    // Distancia máxima de detección
    raycastPrecision: number; // Precisión del raycast
    targetTypes: string[];  // Tipos de targets a detectar
  };
  performance: {
    updateFrequency: number; // Hz de actualización
    maxTargetsPerFrame: number;
    cullingDistance: number;
  };
}

/**
 * Configuraciones predefinidas
 */
export const DEFAULT_RETICLE_CONFIG: ReticleConfig = {
  type: ReticleType.CROSSHAIR,
  size: 32,
  color: [0.0, 1.0, 1.0, 0.8], // Cyan brillante
  thickness: 2,
  opacity: 0.8,
  animated: true,
  animationSpeed: 2.0
};

export const DEFAULT_HIGHLIGHT_CONFIG: HighlightConfig = {
  type: HighlightType.OUTLINE,
  color: [1.0, 0.5, 0.0, 1.0], // Naranja
  intensity: 1.0,
  pulseSpeed: 2.0,
  glowRadius: 5.0
};

export const DEFAULT_INPUT_CONFIG: InputConfig = {
  mouseButton: 0, // Left click
  keyboardKey: 'Escape',
  holdToLock: false,
  doubleClickToLock: false
};

export const DEFAULT_TARGETING_CONFIG: TargetingSystemConfig = {
  reticle: DEFAULT_RETICLE_CONFIG,
  highlight: DEFAULT_HIGHLIGHT_CONFIG,
  input: DEFAULT_INPUT_CONFIG,
  detection: {
    maxDistance: 1000,
    raycastPrecision: 0.1,
    targetTypes: ['asteroid', 'spaceship', 'planet', 'portal']
  },
  performance: {
    updateFrequency: 60,
    maxTargetsPerFrame: 20,
    cullingDistance: 500
  }
};