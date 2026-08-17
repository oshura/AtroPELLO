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
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';
import { AudioEngineService } from '../../../services/audio/audio-engine.service';
import type { TargetOccluder } from './targeting-occluders';

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
  private previousHoveredId: string | null = null;
  private previousSelectedId: string | null = null;
  private hoverAudioMuted = false;
  // Sticky hover to avoid flicker on borderline detections
  private stickyHover: { info: TargetDisplayInfo; lastSeenTs: number } | null = null;
  private hoverHoldMs: number = 120; // keep last hover briefly if still within tolerance
  private lastMousePos: { x: number; y: number } | null = null;
  
  // Performance tracking
  private lastUpdateByCategory = new Map<string, number>();
  // Hover picking options
  private useRaycastHover: boolean = true; // enable precise hover using ray→sphere
  // Oclusores (EXPERIMENTAL): siluetas REALES de cuerpos grandes (estación). Ver targeting-occluders.ts.
  private occluderProvider: (() => readonly TargetOccluder[]) | null = null;
  // Margen mundo tras el impacto del oclusor: lo pegado al casco (puertos) no cae en el veto de oclusión.
  private occlusionMarginWorld = 60;
  private dominantRadiusGateEnabled: boolean = true; // gate giant targets when they dominate screen
  private dominantRadiusFraction: number = 0.35; // fraction of min(screenW,screenH)
  // Hysteresis to avoid dominant gate flapping
  private dominantGateState = new Map<string, boolean>();
  private dominantGateReleaseFactor = 0.9; // ungate when below 90% of threshold
  private targetsByCategory = new Map<string, TargetDisplayInfo[]>();
  // Screen-anchor sampling for dominant targets
  private screenAnchorRadiusFraction: number = 0.18; // fraction of min screen dim required to attempt surface samples
  private screenAnchorMinPx: number = 32; // absolute minimum size in pixels to justify alternate anchors
  private forceCenterRadiusFraction: number = 0.28; // when projected radius exceeds this, keep center projected even if off-screen
  private forceCenterMinPx: number = 72;
  // Portal-specific tuning
  private portalInteriorSuppressionMin = 180;
  private portalInteriorSuppressionScale = 1.35;
  private portalInteriorSuppressionCap = 2600;
  private portalInteriorSuppressionRatio = 0.65;
  private portalLegacyRadiusCap = 1500;
  
  constructor(
    private webglService: WebGLService,
    private relationService: RelationService,
    private logging: LoggingService,
    private audio: AudioEngineService
  ) {}

  // ===================================
  // INITIALIZATION
  // ===================================

  public initialize(camera: Camera): void {
    this.camera = camera;
    this.canvas = this.webglService.getCanvas() || null;
  this.logging.debug(LogCategory.TARGETING, 'AdaptiveTargetingSystem v2 initialized');
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

  public detectTargetAt(mousePos: { x: number; y: number }, skipDetection: boolean = false): AdaptiveTargetingResult {
    if (!this.camera || !this.canvas) {
      return { hoveredTarget: null, selectedTarget: this.currentSelected, nearbyTargets: [] };
    }

    // If a UI panel occludes the 3D scene, skip raycast detection but preserve current selection
    if (skipDetection) {
      // Clear hover but maintain selection
      this.currentHovered = null;
      this.previousHoveredId = null;
      return { 
        hoveredTarget: null, 
        selectedTarget: this.currentSelected, 
        nearbyTargets: [] 
      };
    }

    const now = performance.now();
    this.lastMousePos = { x: mousePos.x, y: mousePos.y };
    
    // 1. Categorize targets by distance
    const categorizedTargets = this.categorizeTargetsByDistance();
    // Persist for public access (STEP 2 stats / integrator)
    this.targetsByCategory = categorizedTargets;
    
    // 2. Update each category based on its update frequency
    this.updateCategorizedTargets(categorizedTargets, now);
    
    // 3. Detect hover target using appropriate method for each category
    let hoveredTarget = this.detectHoverTarget(mousePos, categorizedTargets);
    // Sticky hover: if hover briefly drops or flips due to jitter, hold the previous target for a short window
    hoveredTarget = this.applyStickyHover(hoveredTarget, now, mousePos);
    
    // 4. Update current state
    this.currentHovered = hoveredTarget;

    // Play audio cue when hover changes
    const newHoveredId = hoveredTarget?.target.id?.toString() || null;
    if (newHoveredId !== this.previousHoveredId) {
      if (newHoveredId !== null && !this.hoverAudioMuted) {
        // Hover appeared
        try {
          const clip = this.audio.has('ui_outline_hover') ? 'ui_outline_hover' : 'ui_select';
          this.audio.play(clip, { bus: 'ui', volume: 0.5 });
        } catch (e) {
          this.logging.log(LogLevel.WARN, LogCategory.AUDIO, 'Hover sound failed', e);
        }
      }
      // Note: No sound when hover clears (only when deselecting with click)
      this.previousHoveredId = newHoveredId;
    }

    // 4.5 Keep selected and hovered target display info fresh every frame (screen pos, distances, category)
    if (this.currentSelected) {
      const selTarget = this.currentSelected.target;
      // Rebuild full display info to avoid freezing projection/values
      this.currentSelected = this.createTargetDisplayInfo(selTarget);
    }
    if (this.currentHovered) {
      const hovTarget = this.currentHovered.target;
      this.currentHovered = this.createTargetDisplayInfo(hovTarget);
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
    const newSelectedId = target?.id?.toString() || null;
    const hadPreviousSelection = this.previousSelectedId !== null;
    
    if (!target) {
      this.currentSelected = null;
      // Play deselect sound only if there was a previous selection
      if (hadPreviousSelection) {
        try {
          const clip = this.audio.has('ui_outline_clear') ? 'ui_outline_clear' : 'ui_select';
          this.audio.play(clip, { bus: 'ui', volume: 0.4 });
        } catch {}
      }
      this.previousSelectedId = null;
      return;
    }

    // Convert ITargetable to TargetDisplayInfo
    const displayInfo = this.createTargetDisplayInfo(target);
    this.currentSelected = displayInfo;
    
    // Play select sound only if selection actually changed
    if (newSelectedId !== this.previousSelectedId) {
      try {
        const clip = this.audio.has('ui_outline_select') ? 'ui_outline_select' : 'ui_select';
        this.audio.play(clip, { bus: 'ui', volume: 0.65 });
      } catch {}
      this.previousSelectedId = newSelectedId;
    }
  }

  public setHoverAudioMuted(muted: boolean): void {
    this.hoverAudioMuted = muted;
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
        this.logging.trace(
          LogCategory.TARGETING,
          'Target categorized',
          {
            name: displayInfo.name,
            category: category.name,
            centerDist: Math.round(displayInfo.distanceToCenter),
            edgeDist: Math.round(displayInfo.distanceToEdge),
            tolerancePx: Math.round(category.tolerancePx)
          }
        );
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
    const screenAnchor = this.getScreenAnchorForTarget(target, anchor);
    
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
      screenPosition: screenAnchor.screen
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
    const radius = this.getTargetRadius(target);
    // Distance to edge = distance to center - radius (clamped at 0)
    return Math.max(0, distanceToCenter - radius);
  }

  private getTargetRadius(target: ITargetable): number {
    const anyTarget = target as any;
      const targetType = typeof target.getTargetType === 'function' ? target.getTargetType() : undefined;
      if (targetType === TargetType.PORTAL) {
        const portalRadius = this.getPortalTargetingRadius(target);
        if (portalRadius !== null) {
          return portalRadius;
        }
      }
    if (anyTarget?.boundingSphere?.radius !== undefined) {
      const r = Number(anyTarget.boundingSphere.radius);
      if (Number.isFinite(r) && r > 0) {
        return r;
      }
    }
    if (typeof anyTarget?.size === 'number' && Number.isFinite(anyTarget.size)) {
      return Math.max(1, Number(anyTarget.size));
    }
    if (typeof anyTarget?.radius === 'number' && Number.isFinite(anyTarget.radius)) {
      return Math.max(1, Number(anyTarget.radius));
    }
    return 10;
  }

  private getPortalTargetingRadius(target: ITargetable): number | null {
    const anyTarget = target as any;
    if (typeof anyTarget?.getTargetingRadius === 'function') {
      const r = Number(anyTarget.getTargetingRadius());
      if (Number.isFinite(r) && r > 0) {
        return r;
      }
    }
    if (typeof anyTarget?.targetingRadius === 'number') {
      const r = Number(anyTarget.targetingRadius);
      if (Number.isFinite(r) && r > 0) {
        return Math.max(1, r);
      }
    }
    const raw = this.getPortalActualRadius(target);
    if (raw !== null) {
      return Math.min(this.portalLegacyRadiusCap, Math.max(1, raw));
    }
    return null;
  }

  private getPortalActualRadius(target: ITargetable): number | null {
    const anyTarget = target as any;
    if (typeof anyTarget?.radius === 'number' && Number.isFinite(anyTarget.radius)) {
      return Math.max(1, Number(anyTarget.radius));
    }
    if (anyTarget?.boundingSphere?.radius !== undefined) {
      const r = Number(anyTarget.boundingSphere.radius);
      if (Number.isFinite(r) && r > 0) {
        return r;
      }
    }
    return null;
  }

  private getPortalSuppressionRadius(target: ITargetable, targetingRadius: number, actualRadius?: number | null): number {
    const anyTarget = target as any;
    let candidate = 0;
    if (typeof anyTarget?.getTargetingSuppressionRadius === 'function') {
      const r = Number(anyTarget.getTargetingSuppressionRadius());
      if (Number.isFinite(r) && r > 0) {
        candidate = r;
      }
    } else if (typeof anyTarget?.targetingSuppressionRadius === 'number') {
      const r = Number(anyTarget.targetingSuppressionRadius);
      if (Number.isFinite(r) && r > 0) {
        candidate = r;
      }
    }
    if (!candidate && actualRadius && Number.isFinite(actualRadius)) {
      candidate = actualRadius * this.portalInteriorSuppressionRatio;
    }
    const fallback = Math.max(this.portalInteriorSuppressionMin, targetingRadius * this.portalInteriorSuppressionScale);
    candidate = Math.max(candidate, fallback);
    return Math.min(candidate, this.portalInteriorSuppressionCap);
  }

  private shouldSuppressPortalRayHit(
    center: { x: number; y: number; z: number },
    rayOrigin: { x: number; y: number; z: number },
    suppressionRadius: number
  ): boolean {
    if (!Number.isFinite(suppressionRadius) || suppressionRadius <= 0) {
      return false;
    }
    const dx = center.x - rayOrigin.x;
    const dy = center.y - rayOrigin.y;
    const dz = center.z - rayOrigin.z;
    const dist = Math.hypot(dx, dy, dz);
    return dist <= suppressionRadius;
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
    if (this.useRaycastHover) {
      return this.detectHoverWithRay(mousePos, categorizedTargets);
    }

    let bestTarget: TargetDisplayInfo | null = null;
    let bestDistance = Infinity;
    for (const [categoryName, targets] of categorizedTargets) {
      const category = DISTANCE_CATEGORIES.find(c => c.name === categoryName);
      if (!category || targets.length === 0) continue;
      for (const targetInfo of targets) {
        if (this.isDominantAndGated(targetInfo)) continue;
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

  // Ray-based hover detection: choose nearest target sphere intersected by cursor ray
  private detectHoverWithRay(mousePos: { x: number; y: number }, categorizedTargets: Map<string, TargetDisplayInfo[]>): TargetDisplayInfo | null {
    const ray = this.screenToRay(mousePos);
    if (!ray) return null;
    // Oclusores (silueta REAL de cuerpos grandes): un impacto del rayo contra su geometría convierte al
    // cuerpo en candidato ahí mismo Y veta todo lo que quede más allá del corte (con margen). NaN = el
    // cuerpo tiene silueta pero el rayo no la toca (p. ej. a través del hueco del toroide): no es candidato.
    const occluders = this.occluderProvider ? this.occluderProvider() : [];
    const occByTarget = new Map<string, number>();
    let occCut = Infinity;
    for (const occ of occluders) {
      const tHit = occ.rayHit(ray.origin, ray.dir);
      if (tHit !== null && tHit > 1e-6) {
        occByTarget.set(occ.targetId, tHit);
        if (tHit < occCut) occCut = tHit;
      } else {
        occByTarget.set(occ.targetId, Number.NaN);
      }
    }
    const occCutLimit = occCut + this.occlusionMarginWorld;
    let best: { info: TargetDisplayInfo; t: number } | null = null;
    // Fallback by pixel distance if no precise ray hit within tolerance
    let bestByPixel: { info: TargetDisplayInfo; d: number } | null = null;
    for (const targets of categorizedTargets.values()) {
      for (const info of targets) {
        const occKey = info.target.id ?? info.name;
        if (occByTarget.has(occKey)) {
          // Cuerpo con silueta real: candidato SOLO donde el rayo toca su geometría — sin esfera de
          // puntería, sin fallback por píxel y sin dominant gate (el rayo ya solo "ve" casco de verdad).
          const tHit = occByTarget.get(occKey)!;
          if (Number.isFinite(tHit) && (!best || tHit < best.t)) best = { info, t: tHit };
          continue;
        }
        if (this.isDominantAndGated(info)) continue; // skip dominant gated
        const center = this.getTargetAnchorPosition(info.target);
        const radius = this.getTargetRadius(info.target);
        if (occCut < Infinity) {
          const ocx = center.x - ray.origin.x;
          const ocy = center.y - ray.origin.y;
          const ocz = center.z - ray.origin.z;
          if (Math.hypot(ocx, ocy, ocz) - radius > occCutLimit) {
            continue; // ocluido tras el casco: ni impacto de rayo ni fallback por píxel
          }
        }
        let t = this.raySphere(ray.origin, ray.dir, center, radius);
        if (info.type === TargetType.PORTAL && t !== null) {
          const actualRadius = this.getPortalActualRadius(info.target) ?? radius;
          const suppressionRadius = this.getPortalSuppressionRadius(info.target, radius, actualRadius);
          if (this.shouldSuppressPortalRayHit(center, ray.origin, suppressionRadius)) {
            t = null; // evita que el portal bloquee todo cuando estamos dentro
          }
        }
        if (t !== null && t > 0) {
          if (!best || t < best.t) best = { info, t };
        } else {
          if (!info.screenPosition) continue; // cannot measure pixel distance without screen projection
          // Pixel distance fallback within category tolerance
          const category = info.category;
          const dx = mousePos.x - info.screenPosition.x;
          const dy = mousePos.y - info.screenPosition.y;
          const d = Math.hypot(dx, dy);
          const tolerance = category.tolerancePx * category.uiScale * 1.1; // small cushion
          if (d <= tolerance) {
            if (!bestByPixel || d < bestByPixel.d) bestByPixel = { info, d };
          }
        }
      }
    }
    if (best) {
      if (!best.info.screenPosition) {
        const hitPoint = {
          x: ray.origin.x + ray.dir.x * best.t,
          y: ray.origin.y + ray.dir.y * best.t,
          z: ray.origin.z + ray.dir.z * best.t
        };
        const projected = this.worldToScreen(hitPoint);
        if (projected) {
          best.info.screenPosition = projected;
        }
      }
      return best.info;
    }
    return bestByPixel?.info || null;
  }

  private screenToRay(mouse: { x: number; y: number }): { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null {
    if (!this.camera || !this.canvas) return null;
    const dims = this.getCanvasDimensions();
    const x = (mouse.x / Math.max(1, dims.width)) * 2 - 1;
    const y = 1 - (mouse.y / Math.max(1, dims.height)) * 2;
    // Inverse of VP
    const proj = this.camera.projectionMatrix as unknown as mat4;
    const view = this.camera.viewMatrix as unknown as mat4;
    const vp = mat4.create(); mat4.multiply(vp, proj, view);
    const invVP = mat4.create();
    if (!mat4.invert(invVP, vp)) return null;
    // Unproject near (z=-1) and far (z=1)
    const pNear = vec4.fromValues(x, y, -1, 1);
    const pFar  = vec4.fromValues(x, y,  1, 1);
    vec4.transformMat4(pNear, pNear, invVP);
    vec4.transformMat4(pFar,  pFar,  invVP);
    // Perspective divide
    const nW = pNear[3] !== 0 ? 1 / pNear[3] : 1;
    const fW = pFar[3]  !== 0 ? 1 / pFar[3]  : 1;
    const near = { x: pNear[0] * nW, y: pNear[1] * nW, z: pNear[2] * nW };
    const far  = { x: pFar[0]  * fW, y: pFar[1]  * fW, z: pFar[2]  * fW };
    const dir = this.normalize3({ x: far.x - near.x, y: far.y - near.y, z: far.z - near.z });
    const origin = near; // camera position also works, but near plane origin avoids numeric issues
    return { origin, dir };
  }

  private raySphere(ro: { x: number; y: number; z: number }, rd: { x: number; y: number; z: number }, c: { x: number; y: number; z: number }, r: number): number | null {
    const ox = ro.x - c.x, oy = ro.y - c.y, oz = ro.z - c.z;
    const b = ox * rd.x + oy * rd.y + oz * rd.z;
    const cval = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cval;
    if (disc < 0) return null;
    const sqrt = Math.sqrt(disc);
    let t = -b - sqrt;
    if (t <= 1e-6) t = -b + sqrt;
    return (t > 1e-6) ? t : null;
  }

  private normalize3(v: { x: number; y: number; z: number }) {
    const l = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  }

  private isDominantAndGated(info: TargetDisplayInfo): boolean {
    if (!this.dominantRadiusGateEnabled) return false;
    const rp = this.getProjectedRadiusPx(info.target);
    const dims = this.getCanvasDimensions();
    const minDim = Math.min(dims.width, dims.height) || 1;
    const up = this.dominantRadiusFraction * minDim;
    const down = this.dominantRadiusFraction * this.dominantGateReleaseFactor * minDim;
    // identify target id key
    const key = (info.target as any)?.id ?? info.name;
    const wasGated = this.dominantGateState.get(key) || false;
    let nowGated = wasGated;
    if (wasGated) {
      if (rp < down) nowGated = false; // release only when comfortably below
    } else {
      if (rp >= up) nowGated = true; // engage when above upper threshold
    }
    if (nowGated !== wasGated) this.dominantGateState.set(key, nowGated);
    return nowGated;
  }

  public getProjectedRadiusPx(target: ITargetable): number {
    if (!this.camera || !this.canvas) return 0;
    const radius = this.getTargetRadius(target);
    const center = this.getTargetAnchorPosition(target);
    // View-space z (camera forward is -Z in our view matrix)
    const view = this.camera.viewMatrix as unknown as mat4;
    const v = vec4.fromValues(center.x, center.y, center.z, 1);
    vec4.transformMat4(v, v, view);
    const zc = -v[2]; // positive in front of camera
    if (zc <= 1e-3) return 0;
    const dims = this.getCanvasDimensions();
    const f = 0.5 * dims.height / Math.tan(this.camera.fov * 0.5);
    return (radius * f) / zc;
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

  private getScreenAnchorForTarget(
    target: ITargetable,
    center: { x: number; y: number; z: number }
  ): { world: { x: number; y: number; z: number }; screen: { x: number; y: number } | null } {
    const primary = this.worldToScreen(center);
    if (primary) {
      return { world: center, screen: primary };
    }

    if (!this.camera) {
      return { world: center, screen: null };
    }

    const radius = this.getTargetRadius(target);
    if (!Number.isFinite(radius) || radius <= 0) {
      return { world: center, screen: null };
    }

    const dims = this.getCanvasDimensions();
    const minDim = Math.min(dims.width, dims.height) || 1;
    const projectedRadius = this.getProjectedRadiusPx(target);
    const minPx = Math.max(this.screenAnchorMinPx, this.screenAnchorRadiusFraction * minDim);
    if (projectedRadius < minPx) {
      return { world: center, screen: null };
    }

    const camPos = this.camera.position;
    let toCamera = this.normalize3({
      x: camPos.x - center.x,
      y: camPos.y - center.y,
      z: camPos.z - center.z
    });
    if (Math.hypot(toCamera.x, toCamera.y, toCamera.z) < 1e-4) {
      toCamera = this.getCameraBasis().forward;
    }

    const directions = this.buildSurfaceDirections(toCamera);
    for (const dir of directions) {
      const sample = {
        x: center.x + dir.x * radius,
        y: center.y + dir.y * radius,
        z: center.z + dir.z * radius
      };
      const screen = this.worldToScreen(sample);
      if (screen) {
        return { world: sample, screen };
      }
    }

    if (this.shouldForceCenterAnchor(projectedRadius, minDim)) {
      const forced = this.worldToScreen(center, { allowOffscreen: true });
      if (forced) {
        return { world: center, screen: forced };
      }
    }

    return { world: center, screen: null };
  }

  private shouldForceCenterAnchor(projectedRadius: number, minDim: number): boolean {
    if (!Number.isFinite(projectedRadius) || projectedRadius <= 0) {
      return false;
    }
    const threshold = Math.max(this.forceCenterMinPx, this.forceCenterRadiusFraction * minDim);
    return projectedRadius >= threshold;
  }

  private buildSurfaceDirections(facing: { x: number; y: number; z: number }): Array<{ x: number; y: number; z: number }> {
    const dirs: Array<{ x: number; y: number; z: number }> = [];
    const base = this.normalize3(facing);
    dirs.push(base);

    const basis = this.getCameraBasis();
    const mixes = [
      { x: base.x + basis.right.x * 0.65, y: base.y + basis.right.y * 0.65, z: base.z + basis.right.z * 0.65 },
      { x: base.x - basis.right.x * 0.65, y: base.y - basis.right.y * 0.65, z: base.z - basis.right.z * 0.65 },
      { x: base.x + basis.up.x * 0.65, y: base.y + basis.up.y * 0.65, z: base.z + basis.up.z * 0.65 },
      { x: base.x - basis.up.x * 0.65, y: base.y - basis.up.y * 0.65, z: base.z - basis.up.z * 0.65 },
      { x: base.x + basis.right.x * 0.45 + basis.up.x * 0.45, y: base.y + basis.right.y * 0.45 + basis.up.y * 0.45, z: base.z + basis.right.z * 0.45 + basis.up.z * 0.45 },
      { x: base.x - basis.right.x * 0.45 + basis.up.x * 0.45, y: base.y - basis.right.y * 0.45 + basis.up.y * 0.45, z: base.z - basis.right.z * 0.45 + basis.up.z * 0.45 },
      { x: base.x + basis.right.x * 0.45 - basis.up.x * 0.45, y: base.y + basis.right.y * 0.45 - basis.up.y * 0.45, z: base.z + basis.right.z * 0.45 - basis.up.z * 0.45 },
      { x: base.x - basis.right.x * 0.45 - basis.up.x * 0.45, y: base.y - basis.right.y * 0.45 - basis.up.y * 0.45, z: base.z - basis.right.z * 0.45 - basis.up.z * 0.45 }
    ];

    for (const mix of mixes) {
      const normalized = this.normalize3(mix);
      dirs.push(normalized);
    }

    return dirs;
  }

  private getCameraBasis(): {
    forward: { x: number; y: number; z: number };
    right: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
  } {
    if (!this.camera) {
      return {
        forward: { x: 0, y: 0, z: -1 },
        right: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 1, z: 0 }
      };
    }

    const cam = this.camera as any;
    const camPos = cam.position ?? { x: 0, y: 0, z: 0 };
    const camTarget = cam.target ?? { x: camPos.x, y: camPos.y, z: camPos.z - 1 };
    let forward = this.normalize3({
      x: camTarget.x - camPos.x,
      y: camTarget.y - camPos.y,
      z: camTarget.z - camPos.z
    });
    if (!Number.isFinite(forward.x) || !Number.isFinite(forward.y) || !Number.isFinite(forward.z)) {
      forward = { x: 0, y: 0, z: -1 };
    }
    let upRaw = cam.up ? { x: cam.up.x, y: cam.up.y, z: cam.up.z } : { x: 0, y: 1, z: 0 };
    upRaw = this.normalize3(upRaw);
    let right = this.cross3(forward, upRaw);
    if (Math.hypot(right.x, right.y, right.z) < 1e-4) {
      // forward and up almost parallel, pick fallback up
      const fallback = Math.abs(forward.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
      upRaw = this.normalize3(fallback);
      right = this.cross3(forward, upRaw);
    }
    right = this.normalize3(right);
    const up = this.normalize3(this.cross3(right, forward));
    return { forward, right, up };
  }

  private cross3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  // ===================================
  // PROJECTION UTILITIES
  // ===================================

  private worldToScreen(
    worldPos: { x: number; y: number; z: number },
    options?: { allowOffscreen?: boolean }
  ): { x: number; y: number } | null {
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
    if (ndcZ < -1.2 || ndcZ > 1.2) return null;
    
    const dims = this.getCanvasDimensions();
    const margin = 1.06;

    if (!options?.allowOffscreen) {
      if (ndcX < -margin || ndcX > margin || ndcY < -margin || ndcY > margin) return null;
      const screenX = (ndcX + 1.0) * dims.width * 0.5;
      const screenY = (1.0 - ndcY) * dims.height * 0.5;
      return { x: screenX, y: screenY };
    }

    const clampedX = Math.max(-1, Math.min(1, ndcX));
    const clampedY = Math.max(-1, Math.min(1, ndcY));
    const screenX = (clampedX + 1.0) * dims.width * 0.5;
    const screenY = (1.0 - clampedY) * dims.height * 0.5;
    return { x: screenX, y: screenY };
  }

  // ===================================
  // STICKY HOVER HELPERS
  // ===================================

  private applyStickyHover(candidate: TargetDisplayInfo | null, now: number, mousePos: { x: number; y: number }): TargetDisplayInfo | null {
    const prev = this.stickyHover?.info || null;
    const prevSeen = this.stickyHover?.lastSeenTs || 0;
    // If we have a strong candidate, update sticky and return it
    if (candidate) {
      this.stickyHover = { info: candidate, lastSeenTs: now };
      return candidate;
    }
    // No candidate: if previous hover exists and is still near the cursor, hold it briefly (without extending lastSeenTs)
    if (prev) {
      // Refresh previous info's screen position to compare accurately against current mouse and camera state
      let prevInfo = prev;
      try {
        prevInfo = this.createTargetDisplayInfo(prev.target);
      } catch {}

      if (prevInfo.screenPosition) {
        const dx = mousePos.x - prevInfo.screenPosition.x;
        const dy = mousePos.y - prevInfo.screenPosition.y;
        const d = Math.hypot(dx, dy);
        const tol = prevInfo.category.tolerancePx * prevInfo.category.uiScale * 1.15; // only hold if truly within tolerance
        const withinWindow = (now - prevSeen) <= this.hoverHoldMs;
        if (withinWindow && d <= tol) {
          // Hold previous hover but DO NOT refresh lastSeenTs; it will naturally expire if not re-detected
          this.stickyHover = { info: prevInfo, lastSeenTs: prevSeen };
          return prevInfo;
        }
      }
      // Out of tolerance or time window: drop immediately (no lingering)
      this.stickyHover = null;
      return null;
    }
    // No previous: clear and return null
    this.stickyHover = null;
    return null;
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

  /** Registra la fuente de oclusores de silueta real (EXPERIMENTAL; null la desactiva). */
  public setOccluderProvider(fn: (() => readonly TargetOccluder[]) | null): void {
    this.occluderProvider = fn;
  }

  // Runtime toggles for testing
  public setUseRaycastHover(v: boolean): void { this.useRaycastHover = !!v; }
  public setDominantGateEnabled(v: boolean): void { this.dominantRadiusGateEnabled = !!v; }
  public setDominantRadiusFraction(f: number): void { this.dominantRadiusFraction = Math.max(0.05, Math.min(0.9, Number(f) || 0.35)); }
}