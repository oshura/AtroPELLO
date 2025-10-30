/**
 * ADAPTIVE TARGETING SYSTEM V2
 * 
 * Nuevo sistema de targeting optimizado para rangos extremos (10u - 200,000u)
 * con detección de bounding sphere edge, animosity colors, y performance tiering.
 */

import { Injectable } from '@angular/core';
import { ITargetable, TargetType } from '../../types/targeting.types';
import { Camera } from '../../Camera';
import { mat4, vec4 } from 'gl-matrix';
import { WebGLService } from '../../../services/webgl.service';
import { RelationService, Relation } from '../../../services/relation.service';

// ===================================
// TYPES & INTERFACES
// ===================================

export interface DistanceCategory {
  name: 'immediate' | 'close' | 'medium' | 'far' | 'extreme';
  minDistance: number;
  maxDistance: number;
  detectionMethod: 'pixel-perfect' | 'bounding-sphere' | 'screen-space' | 'culled-list';
  uiScale: number;
  tolerancePx: number;
  updateFrequency: number;
  // Optional hysteresis factor (0-0.5) to avoid flicker around thresholds
  hysteresisRatio?: number;
}

export interface TargetDisplayInfo {
  target: ITargetable;
  name: string;
  type: TargetType;
  relation: Relation;
  
  // Distancias calculadas
  distanceToEdge: number;    // CRÍTICO: Distancia al borde de bounding sphere
  distanceToCenter: number;  // Distancia al centro
  
  // Información contextual
  details: {
    health?: { current: number; max: number };
    threat?: 'none' | 'low' | 'medium' | 'high';
    composition?: string;
    size?: number;
  };
  
  // UI Properties
  category: DistanceCategory;
  displaySize: number;
  accentColor: string;
  showDetails: boolean;
  screenPosition: { x: number; y: number } | null;
}

export interface AdaptiveTargetingResult {
  hoveredTarget: TargetDisplayInfo | null;
  selectedTarget: TargetDisplayInfo | null;
  nearbyTargets: TargetDisplayInfo[];
}

// ===================================
// DISTANCE CATEGORIES CONFIGURATION
// ===================================

const DISTANCE_CATEGORIES: DistanceCategory[] = [
  { 
    name: 'immediate', 
    minDistance: 0, 
    maxDistance: 50, 
    detectionMethod: 'pixel-perfect', 
    uiScale: 2.0, 
    tolerancePx: 8,
    updateFrequency: 60,
    hysteresisRatio: 0.08
  },
  { 
    name: 'close', 
    minDistance: 50, 
    maxDistance: 500, 
    detectionMethod: 'bounding-sphere', 
    uiScale: 1.5, 
    tolerancePx: 12,
    updateFrequency: 30,
    hysteresisRatio: 0.08
  },
  { 
    name: 'medium', 
    minDistance: 500, 
    maxDistance: 5000, 
    detectionMethod: 'screen-space', 
    uiScale: 1.0, 
    tolerancePx: 16,
    updateFrequency: 20,
    hysteresisRatio: 0.1
  },
  { 
    name: 'far', 
    minDistance: 5000, 
    maxDistance: 50000, 
    detectionMethod: 'screen-space', 
    uiScale: 0.8, 
    tolerancePx: 24,
    updateFrequency: 10,
    hysteresisRatio: 0.12
  },
  { 
    name: 'extreme', 
    minDistance: 50000, 
    maxDistance: 200000, 
    detectionMethod: 'culled-list', 
    uiScale: 0.6, 
    tolerancePx: 32,
    updateFrequency: 5,
    hysteresisRatio: 0.15
  }
];

// ===================================
// MAIN ADAPTIVE TARGETING SYSTEM
// ===================================

@Injectable({
  providedIn: 'root'
})
export class AdaptiveTargetingSystem {
  private camera: Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private availableTargets: ITargetable[] = [];
  private distanceOriginProvider: (() => { x: number; y: number; z: number }) | null = null;
  
  // Current state
  private currentHovered: TargetDisplayInfo | null = null;
  private currentSelected: TargetDisplayInfo | null = null;
  
  // Performance tracking
  private lastUpdateByCategory = new Map<string, number>();
  private targetsByCategory = new Map<string, TargetDisplayInfo[]>();
  
  constructor(
    private webglService: WebGLService,
    private relationService: RelationService
  ) {}

  // ===================================
  // INITIALIZATION
  // ===================================

  public initialize(camera: Camera): void {
    this.camera = camera;
    this.canvas = this.webglService.getCanvas() || null;
    console.log('🎯 AdaptiveTargetingSystem v2 initialized');
    // Expose minimal dev hooks for tuning in STEP 3
    try {
      const w = (globalThis as any);
      w.Targeting = w.Targeting || {};
      w.Targeting.getCategories = () => DISTANCE_CATEGORIES.map(c => ({ ...c }));
      w.Targeting.setCategory = (name: DistanceCategory['name'], partial: Partial<DistanceCategory>) => {
        this.setCategoryConfig(name, partial);
        return w.Targeting.getCategories();
      };
    } catch {}
  }

  public setDistanceOriginProvider(fn: (() => { x: number; y: number; z: number }) | null): void {
    this.distanceOriginProvider = fn;
  }

  public updateAvailableTargets(targets: ITargetable[]): void {
    this.availableTargets = targets.filter(t => t.isActive());
  }

  // ===================================
  // CORE DETECTION LOGIC
  // ===================================

  public detectTargetAt(mousePos: { x: number; y: number }): AdaptiveTargetingResult {
    if (!this.camera || !this.canvas) {
      return { hoveredTarget: null, selectedTarget: this.currentSelected, nearbyTargets: [] };
    }

    const now = performance.now();
    
    // 1. Categorize targets by distance
    const categorizedTargets = this.categorizeTargetsByDistance();
    // Persist for public access (STEP 2 stats / integrator)
    this.targetsByCategory = categorizedTargets;
    
    // 2. Update each category based on its update frequency
    this.updateCategorizedTargets(categorizedTargets, now);
    
    // 3. Detect hover target using appropriate method for each category
    const hoveredTarget = this.detectHoverTarget(mousePos, categorizedTargets);
    
    // 4. Update current state
    this.currentHovered = hoveredTarget;
    
    // 4.5 Keep selected target display info fresh every frame (screen pos, distances, category)
    if (this.currentSelected) {
      const selTarget = this.currentSelected.target;
      // Rebuild full display info to avoid freezing projection/values
      this.currentSelected = this.createTargetDisplayInfo(selTarget);
    }

    // 5. Get nearby targets for UI
    const nearbyTargets = this.getNearbyTargets(categorizedTargets);

    return {
      hoveredTarget: this.currentHovered,
      selectedTarget: this.currentSelected,
      nearbyTargets
    };
  }

  public selectTarget(target: ITargetable | null): void {
    if (!target) {
      this.currentSelected = null;
      return;
    }

    // Convert ITargetable to TargetDisplayInfo
    const displayInfo = this.createTargetDisplayInfo(target);
    this.currentSelected = displayInfo;
  }

  // ===================================
  // DISTANCE CATEGORIZATION
  // ===================================

  private categorizeTargetsByDistance(): Map<string, TargetDisplayInfo[]> {
    const categorized = new Map<string, TargetDisplayInfo[]>();
    
    // Initialize categories
    DISTANCE_CATEGORIES.forEach(cat => {
      categorized.set(cat.name, []);
    });

    for (const target of this.availableTargets) {
      const displayInfo = this.createTargetDisplayInfo(target);
      const category = displayInfo.category;
      
      const categoryList = categorized.get(category.name) || [];
      categoryList.push(displayInfo);
      categorized.set(category.name, categoryList);
      
      // Debug occasional categorization (1% chance)
      if (Math.random() < 0.01) {
        console.log('📏 Target categorized:', {
          name: displayInfo.name,
          category: category.name,
          centerDist: Math.round(displayInfo.distanceToCenter),
          edgeDist: Math.round(displayInfo.distanceToEdge),
          tolerancePx: Math.round(category.tolerancePx)
        });
      }
    }

    return categorized;
  }

  private createTargetDisplayInfo(target: ITargetable): TargetDisplayInfo {
    const anchor = this.getTargetAnchorPosition(target);
    const distanceToCenter = this.getWorldDistance(anchor);
    const distanceToEdge = this.getDistanceToEdge(target, distanceToCenter);
    const category = this.getCategoryForDistance(distanceToCenter);
    const relation = this.relationService.getRelation(target);
    
    return {
      target,
      name: target.getDisplayName(),
      type: target.getTargetType(),
      relation,
      distanceToEdge,
      distanceToCenter,
      details: this.getTargetDetails(target, category),
      category,
      displaySize: this.calculateDisplaySize(target, category, distanceToCenter),
      accentColor: this.getAccentColor(relation),
      showDetails: category.name !== 'extreme',
      screenPosition: this.worldToScreen(anchor)
    };
  }

  private getCategoryForDistance(distance: number): DistanceCategory {
    // Apply soft hysteresis by expanding bands slightly; categories are ordered from near to far
    for (const category of DISTANCE_CATEGORIES) {
      const ratio = category.hysteresisRatio ?? 0;
      const range = category.maxDistance - category.minDistance;
      const min = Math.max(0, category.minDistance - range * ratio);
      const max = category.maxDistance + range * ratio;
      if (distance >= min && distance < max) {
        return category;
      }
    }
    return DISTANCE_CATEGORIES[DISTANCE_CATEGORIES.length - 1]; // extreme category as fallback
  }

  // ===================================
  // DISTANCE CALCULATIONS
  // ===================================

  private getDistanceToEdge(target: ITargetable, distanceToCenter: number): number {
    // Get bounding sphere radius
    let radius = 10; // default
    const anyTarget = target as any;
    
    if (anyTarget.boundingSphere && typeof anyTarget.boundingSphere.radius === 'number') {
      radius = anyTarget.boundingSphere.radius;
    } else if (anyTarget.size && typeof anyTarget.size === 'number') {
      radius = anyTarget.size;
    } else if (anyTarget.radius && typeof anyTarget.radius === 'number') {
      radius = anyTarget.radius;
    }
    
    // Distance to edge = distance to center - radius (clamped at 0)
    return Math.max(0, distanceToCenter - radius);
  }

  private getWorldDistance(worldPos: { x: number; y: number; z: number }): number {
    const origin = this.distanceOriginProvider ? this.distanceOriginProvider() : (this.camera ? this.camera.position : null);
    if (!origin) return Infinity;

    const dx = worldPos.x - origin.x;
    const dy = worldPos.y - origin.y;
    const dz = worldPos.z - origin.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ===================================
  // DETECTION METHODS BY CATEGORY
  // ===================================

  private detectHoverTarget(mousePos: { x: number; y: number }, categorizedTargets: Map<string, TargetDisplayInfo[]>): TargetDisplayInfo | null {
    let bestTarget: TargetDisplayInfo | null = null;
    let bestDistance = Infinity;

    // Check each category with its appropriate detection method
    for (const [categoryName, targets] of categorizedTargets) {
      const category = DISTANCE_CATEGORIES.find(c => c.name === categoryName);
      if (!category || targets.length === 0) continue;

      for (const targetInfo of targets) {
        const hit = this.detectTargetWithMethod(mousePos, targetInfo, category);
        if (hit && hit.pixelDistance < bestDistance) {
          bestDistance = hit.pixelDistance;
          bestTarget = targetInfo;
        }
      }
    }

    return bestTarget;
  }

  private detectTargetWithMethod(
    mousePos: { x: number; y: number }, 
    targetInfo: TargetDisplayInfo, 
    category: DistanceCategory
  ): { pixelDistance: number } | null {
    if (!targetInfo.screenPosition) return null;

    const dx = mousePos.x - targetInfo.screenPosition.x;
    const dy = mousePos.y - targetInfo.screenPosition.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Use category-specific tolerance
    const tolerance = category.tolerancePx * category.uiScale;
    
    if (pixelDistance <= tolerance) {
      return { pixelDistance };
    }

    return null;
  }

  // ===================================
  // UI HELPERS
  // ===================================

  private getTargetDetails(target: ITargetable, category: DistanceCategory): TargetDisplayInfo['details'] {
    const details: TargetDisplayInfo['details'] = {};
    // Health info for ALL targets (health is a base property in GameObject)
    if (target.healthCurrent !== undefined && target.healthMax !== undefined) {
      details.health = { current: target.healthCurrent, max: target.healthMax };
    }
    
    // Size info
    const anyTarget = target as any;
    if (anyTarget.size) {
      details.size = anyTarget.size;
    }
    
    // Composition for asteroids
    if (target.getTargetType().includes('asteroid')) {
      details.composition = 'rocky'; // Could be expanded with real data
    }

    return details;
  }

  private calculateDisplaySize(target: ITargetable, category: DistanceCategory, distance: number): number {
    // Base size scaled by category and distance
    const baseSize = 32;
    const distanceScale = Math.max(0.5, Math.min(2.0, 100 / Math.max(1, distance)));
    return baseSize * category.uiScale * distanceScale;
  }

  private getAccentColor(relation: Relation): string {
    switch (relation) {
      case 'ally': return '#4ade80';    // green-400
      case 'neutral': return '#60a5fa'; // blue-400  
      case 'enemy': return '#f87171';   // red-400
      default: return '#9ca3af';        // gray-400
    }
  }

  // ===================================
  // PERFORMANCE OPTIMIZATION
  // ===================================

  private updateCategorizedTargets(categorizedTargets: Map<string, TargetDisplayInfo[]>, now: number): void {
    for (const [categoryName, targets] of categorizedTargets) {
      const category = DISTANCE_CATEGORIES.find(c => c.name === categoryName);
      if (!category) continue;

      const lastUpdate = this.lastUpdateByCategory.get(categoryName) || 0;
      const updateInterval = 1000 / category.updateFrequency;

      if (now - lastUpdate >= updateInterval) {
        // Update screen positions for this category
        this.updateScreenPositions(targets);
        this.lastUpdateByCategory.set(categoryName, now);
      }
    }
  }

  private updateScreenPositions(targets: TargetDisplayInfo[]): void {
    for (const target of targets) {
      const anchor = this.getTargetAnchorPosition(target.target);
      target.screenPosition = this.worldToScreen(anchor);
    }
  }

  private getNearbyTargets(categorizedTargets: Map<string, TargetDisplayInfo[]>): TargetDisplayInfo[] {
    const nearby: TargetDisplayInfo[] = [];
    
    // Get targets from immediate and close categories for UI display
    const immediate = categorizedTargets.get('immediate') || [];
    const close = categorizedTargets.get('close') || [];
    
    nearby.push(...immediate, ...close);
    
    // Limit to prevent UI clutter
    return nearby.slice(0, 10);
  }

  // ===================================
  // PROJECTION UTILITIES
  // ===================================

  private worldToScreen(worldPos: { x: number; y: number; z: number }): { x: number; y: number } | null {
    if (!this.camera || !this.canvas) return null;
    
    const proj = this.camera.projectionMatrix as unknown as mat4;
    const view = this.camera.viewMatrix as unknown as mat4;
    const vp = mat4.create();
    mat4.multiply(vp, proj, view);

    const v = vec4.fromValues(worldPos.x, worldPos.y, worldPos.z, 1.0);
    vec4.transformMat4(v, v, vp);
    
    if (v[3] <= 1e-6) return null;
    
    const ndcX = v[0] / v[3];
    const ndcY = v[1] / v[3];
    const ndcZ = v[2] / v[3];
    
    if (ndcZ < -1.1 || ndcZ > 1.1) return null;
    
    const dims = this.getCanvasDimensions();
    const screenX = (ndcX + 1.0) * dims.width * 0.5;
    const screenY = (1.0 - ndcY) * dims.height * 0.5;
    
    return {
      x: Math.max(0, Math.min(dims.width, screenX)),
      y: Math.max(0, Math.min(dims.height, screenY))
    };
  }

  /** Prefer the center of the bounding sphere when available to anchor UI to the perceived object center */
  private getTargetAnchorPosition(target: ITargetable): { x: number; y: number; z: number } {
    const anyT = target as any;
    const c = anyT?.boundingSphere?.center;
    if (c && typeof c.x === 'number' && typeof c.y === 'number' && typeof c.z === 'number') {
      return { x: Number(c.x), y: Number(c.y), z: Number(c.z) };
    }
    return target.position;
  }

  private getCanvasDimensions(): { width: number; height: number } {
    const state = this.webglService.getState();
    const width = state.width || this.canvas?.clientWidth || this.canvas?.width || 0;
    const height = state.height || this.canvas?.clientHeight || this.canvas?.height || 0;
    return { width: Number(width), height: Number(height) };
  }

  // ===================================
  // PUBLIC API
  // ===================================

  public getCurrentHovered(): TargetDisplayInfo | null {
    return this.currentHovered;
  }

  public getCurrentSelected(): TargetDisplayInfo | null {
    return this.currentSelected;
  }

  public getTargetsByCategory(): Map<string, TargetDisplayInfo[]> {
    return this.targetsByCategory;
  }

  // ===================================
  // RUNTIME CONFIG (STEP 3)
  // ===================================

  /** Returns a snapshot of current distance categories */
  public getCategoryConfig(): DistanceCategory[] {
    return DISTANCE_CATEGORIES.map(c => ({ ...c }));
  }

  /** Update one category by name with partial overrides (min/max/tolerance/uiScale/updateFrequency/hysteresisRatio) */
  public setCategoryConfig(name: DistanceCategory['name'], partial: Partial<DistanceCategory>): void {
    const idx = DISTANCE_CATEGORIES.findIndex(c => c.name === name);
    if (idx === -1) return;
    const current = DISTANCE_CATEGORIES[idx];
    DISTANCE_CATEGORIES[idx] = { ...current, ...partial, name: current.name };
    // Reset last-update timers so changes take effect consistently
    this.lastUpdateByCategory.delete(name);
  }
}