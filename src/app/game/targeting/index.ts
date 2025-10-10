/**
 * Barrel exports para el sistema de targeting
 * FASE 1: Core Targeting System
 */

// Tipos y configuraciones
export * from './types/reticle.types';

// Core components
export * from './core/ReticleManager';
export * from './core/TargetDetector';
export * from './core/InputHandler';

// FASE 2 - Rendering components
export * from './rendering/ReticleRenderer';

// TODO: FASE 3 - Target highlighting
// export * from './rendering/TargetHighlighter';