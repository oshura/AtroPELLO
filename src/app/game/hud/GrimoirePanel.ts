import { Vector3 } from '../../types/game.types';
import { SpellType, SpellState, isSpellType, getSpellSanityCost } from '../types/spell.types';
import { AudioEngineService } from '../../services/audio/audio-engine.service';
import { computePanelLetterbox, mapViewportPointToCanvas, PANEL_HORIZONTAL_STRETCH } from './utils/panel-letterbox';

type NormalizedGlyphLayout = Partial<Record<SpellType, { nx: number; ny: number }>>;
type GlyphPlacement = { type: SpellType | string; x: number; y: number; s: number; r: number };

interface GlyphDragState {
  active: boolean;
  iconIndex: number;
  spell: SpellType | null;
  offsetX: number;
  offsetY: number;
  pointerX: number;
  pointerY: number;
  currentX: number;
  currentY: number;
  snapshotDirty: boolean;
}

/**
 * GrimoirePanel: full-screen, opaque panel rendering an ancient open book
 * with yellowed pages, occult icons, and a crimson pentacle cursor.
 *
 * Implementation mirrors SolarSystemPanel plumbing (canvas→texture→fullscreen quad),
 * but the content is decorative instead of a navigable map.
 */
export class GrimoirePanel {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private program: WebGLProgram | null = null;
  private uvTransformLoc: WebGLUniformLocation | null = null;
  private enabled: boolean = false;
  private cursorPx: number | null = null;
  private cursorPy: number | null = null;
  // Page geometry (for layout/hit-test)
  private leftPage!: { x:number; y:number; w:number; h:number };
  private rightPage!: { x:number; y:number; w:number; h:number };
  private bookBounds: { x: number; y: number; w: number; h: number } | null = null;

  // Simple internal animation time
  private t: number = 0;
  private startTime: number = performance.now();
  // Static layout data (seeded RNG)
  private rng!: () => number;
  private speckles: Array<{ x: number; y: number; r: number; color: string }> = [];
  private iconPlacements: GlyphPlacement[] = [];
  private handwritingLines: Array<Array<{ x: number; y: number }>> = [];
  // Handwriting as segmented "words": each line is an array of word-polylines
  private handwritingSegments: Array<Array<Array<{ x: number; y: number }>>> = [];
  private pageWrinkles: Array<Array<{ x:number; y:number }>> = [];
  private hoveredIconIndex: number = -1;
  private previousHoveredIconIndex: number = -1; // Track hover changes for audio
  private baseCanvas: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D | null = null;
  private dragState: GlyphDragState = {
    active: false,
    iconIndex: -1,
    spell: null,
    offsetX: 0,
    offsetY: 0,
    pointerX: 0,
    pointerY: 0,
    currentX: 0,
    currentY: 0,
    snapshotDirty: false,
  };
  private pendingNormalizedLayout: NormalizedGlyphLayout | null = null;
  private readonly BOOK_HEIGHT_SCALE = 0.9;
  private readonly GLYPH_FRAME_EXTRA_WIDTH = 26;
  // Spell states and selection
  private spellStates: Map<SpellType, SpellState> = new Map([
    [SpellType.SPEED, SpellState.AVAILABLE],
    [SpellType.LONGJUMP, SpellState.AVAILABLE],
    [SpellType.GATE_RITE, SpellState.AVAILABLE],
    [SpellType.ETERNAL_RITE, SpellState.AVAILABLE],
    [SpellType.DISRUPT, SpellState.AVAILABLE],
    [SpellType.ANCHORING_PULSE, SpellState.AVAILABLE],
    [SpellType.VOID_KINESIS, SpellState.AVAILABLE],
    [SpellType.VOID_COCOON, SpellState.AVAILABLE],
    [SpellType.TEMPUS_SIGILLUM, SpellState.AVAILABLE],
    [SpellType.QUIMIO_SIGILLUM, SpellState.AVAILABLE],
    [SpellType.SPECIES_SCAN, SpellState.AVAILABLE],
    [SpellType.CREATURE_SCAN, SpellState.AVAILABLE]
  ]);
  private selectedSpell: SpellType | null = null;
  // Reading mode animation (zoom + slight tilt)
  private animStartMs: number = performance.now();
  private animDurMs: number = 320;
  private animOpening: boolean = false;
  private animProgress: number = 0; // 0..1
  private animClosingPendingDisable: boolean = false;
  private tScale: number = 1.0; // current scale
  private tRot: number = 0.0;   // current rotation (radians)

  private audioService: AudioEngineService | null = null;

  constructor(gl: WebGL2RenderingContext, audioService: AudioEngineService | null = null, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.audioService = audioService;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('GrimoirePanel: 2D context not available');
    this.ctx = ctx;
    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.width = width; this.baseCanvas.height = height;
    this.baseCtx = this.baseCanvas.getContext('2d');
    if (!this.baseCtx) throw new Error('GrimoirePanel: base 2D context not available');
    this.initGLResources();
    this.initializeStaticLayout();
  }

  public setEnabled(v: boolean) {
    if (v) {
      // Start opening animation and keep enabled
      this.enabled = true;
      this.animOpening = true;
      this.animStartMs = performance.now();
      this.animClosingPendingDisable = false;
    } else {
      this.abortGlyphDrag();
      // Start closing animation; keep enabled until it finishes
      if (this.enabled) {
        this.animOpening = false;
        this.animStartMs = performance.now();
        this.animClosingPendingDisable = true;
      } else {
        this.enabled = false;
      }
    }
  }
  public isEnabled(): boolean { return this.enabled; }
  /**
   * Panel interactivo (recibe clicks) solo mientras está completamente abierto.
   * Durante la animación de cierre mantenemos render pero desactivamos interacción
   * para no interceptar clicks destinados al mapa u otros HUDs.
   */
  public isInteractive(): boolean { return this.enabled && !this.animClosingPendingDisable; }
  /**
   * Check if this panel occludes the 3D scene at the given viewport coordinates.
   * Uses isInteractive() to avoid occluding during closing animation.
   */
  public containsPoint(_x: number, _y: number): boolean { return this.isInteractive(); }
  public setCursorFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    const mapped = mapViewportPointToCanvas(
      clientX,
      clientY,
      rect,
      viewportW,
      viewportH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    if (!mapped.inside && !this.dragState.active) {
      this.cursorPx = null;
      this.cursorPy = null;
      return;
    }
    const targetX = mapped.inside ? mapped.mapX : mapped.mapX;
    const targetY = mapped.inside ? mapped.mapY : mapped.mapY;
    const clamped = this.clampToCanvas(targetX, targetY);
    this.cursorPx = clamped.x;
    this.cursorPy = clamped.y;
    if (this.dragState.active) {
      this.updateDragPointer(clamped.x, clamped.y);
    }
  }

  // Expose hovered spell type for casting
  public getHoveredSpellType(): SpellType | null {
    if (this.dragState.active || this.hoveredIconIndex < 0) return null;
    const icon = this.iconPlacements[this.hoveredIconIndex];
    // Only return SpellType enums, ignore decorative string glyphs
    return (icon && isSpellType(icon.type)) ? icon.type : null;
  }
  
  public getSelectedSpellType(): SpellType | null { 
    return this.selectedSpell; 
  }
  
  public setSelectedSpellType(t: SpellType | null): void {
    const wasEquipped = this.selectedSpell !== null;
    const isEquipping = t !== null && t !== this.selectedSpell;
    
    // Toggle off if the same glyph is clicked again
    if (t && this.selectedSpell === t) {
      this.selectedSpell = null;
    } else {
      this.selectedSpell = t;
      // Play equip sound when selecting a new glyph
      if (isEquipping && this.audioService) {
        this.audioService.play('ui_select_glyph', { volume: 0.6, bus: 'ui' });
      }
    }
    // Update states based on the current selectedSpell
    const sel = this.selectedSpell;
    const allSpells = [
      SpellType.SPEED,
      SpellType.LONGJUMP,
      SpellType.GATE_RITE,
      SpellType.ETERNAL_RITE,
      SpellType.DISRUPT,
      SpellType.ANCHORING_PULSE,
      SpellType.VOID_KINESIS,
      SpellType.VOID_COCOON,
      SpellType.TEMPUS_SIGILLUM,
      SpellType.QUIMIO_SIGILLUM,
      SpellType.SPECIES_SCAN,
      SpellType.CREATURE_SCAN
    ];
    allSpells.forEach(k => {
      const currentState = this.spellStates.get(k);
      if (!sel) {
        if (currentState !== SpellState.LOCKED) this.spellStates.set(k, SpellState.AVAILABLE);
      } else if (k === sel) {
        this.spellStates.set(k, SpellState.EQUIPPED);
      } else if (currentState !== SpellState.LOCKED) {
        this.spellStates.set(k, SpellState.AVAILABLE);
      }
    });
  }
  
  /** Clear any current selection completely (external casting can call this). */
  public clearSelection(): void {
    this.selectedSpell = null;
    const allSpells = [
      SpellType.SPEED,
      SpellType.LONGJUMP,
      SpellType.GATE_RITE,
      SpellType.ETERNAL_RITE,
      SpellType.DISRUPT,
      SpellType.ANCHORING_PULSE,
      SpellType.VOID_KINESIS,
      SpellType.VOID_COCOON,
      SpellType.TEMPUS_SIGILLUM,
      SpellType.QUIMIO_SIGILLUM,
      SpellType.SPECIES_SCAN,
      SpellType.CREATURE_SCAN
    ];
    allSpells.forEach(k => {
      const currentState = this.spellStates.get(k);
      if (currentState !== SpellState.LOCKED) this.spellStates.set(k, SpellState.AVAILABLE);
    });
  }

  public applyNormalizedGlyphLayout(layout: NormalizedGlyphLayout | null): void {
    this.pendingNormalizedLayout = layout ? { ...layout } : null;
    this.applyPendingGlyphLayout();
  }

  public beginGlyphDrag(): boolean {
    if (this.dragState.active || this.hoveredIconIndex < 0) {
      return false;
    }
    const icon = this.iconPlacements[this.hoveredIconIndex];
    if (!icon || !isSpellType(icon.type)) {
      return false;
    }
    const pointerX = this.cursorPx ?? icon.x;
    const pointerY = this.cursorPy ?? icon.y;
    const clampedPointer = this.clampToCanvas(pointerX, pointerY);
    this.dragState = {
      active: true,
      iconIndex: this.hoveredIconIndex,
      spell: icon.type,
      offsetX: clampedPointer.x - icon.x,
      offsetY: clampedPointer.y - icon.y,
      pointerX: clampedPointer.x,
      pointerY: clampedPointer.y,
      currentX: icon.x,
      currentY: icon.y,
      snapshotDirty: true,
    };
    this.hoveredIconIndex = -1;
    return true;
  }

  public endGlyphDrag(): { spell: SpellType; normalized: { nx: number; ny: number } } | null {
    if (!this.dragState.active || this.dragState.iconIndex < 0 || !this.dragState.spell) {
      return null;
    }
    const icon = this.iconPlacements[this.dragState.iconIndex];
    if (!icon || !isSpellType(icon.type)) {
      this.abortGlyphDrag();
      return null;
    }
    const finalX = this.dragState.currentX;
    const finalY = this.dragState.currentY;
    icon.x = finalX;
    icon.y = finalY;
    const normalized = {
      nx: Math.min(1, Math.max(0, finalX / this.canvas.width)),
      ny: Math.min(1, Math.max(0, finalY / this.canvas.height)),
    };
    const spell = this.dragState.spell;
    this.abortGlyphDrag(false);
    return { spell, normalized };
  }

  public isGlyphDragging(): boolean {
    return this.dragState.active;
  }

  public setSpellState(spellType: SpellType, state: SpellState): void {
    this.spellStates.set(spellType, state);
    if (state !== SpellState.EQUIPPED && this.selectedSpell === spellType) {
      this.selectedSpell = null;
    }
  }

  private getGlyphRadius(placement: GlyphPlacement): number {
    const scale = Number.isFinite(placement.s) ? placement.s : 1;
    return placement.r * (scale ?? 1);
  }

  private applyPendingGlyphLayout(): void {
    if (!this.pendingNormalizedLayout || !this.iconPlacements.length) {
      return;
    }
    const layout = this.pendingNormalizedLayout;
    const width = this.canvas.width;
    const height = this.canvas.height;
    for (const placement of this.iconPlacements) {
      if (!isSpellType(placement.type)) {
        continue;
      }
      const target = layout[placement.type];
      if (!target) {
        continue;
      }
      const px = target.nx * width;
      const py = target.ny * height;
      const clamped = this.clampToCanvas(px, py);
      placement.x = clamped.x;
      placement.y = clamped.y;
    }
    this.pendingNormalizedLayout = null;
  }

  private clampToCanvas(x: number, y: number): { x: number; y: number } {
    const width = this.canvas.width;
    const height = this.canvas.height;
    return {
      x: Math.min(width, Math.max(0, x)),
      y: Math.min(height, Math.max(0, y)),
    };
  }

  private updateDragPointer(x: number, y: number): void {
    if (!this.dragState.active || this.dragState.iconIndex < 0) {
      return;
    }
    const glyph = this.iconPlacements[this.dragState.iconIndex];
    if (!glyph) {
      return;
    }
    const radius = this.getGlyphRadius(glyph);
      const newCx = x - this.dragState.offsetX;
      const newCy = y - this.dragState.offsetY;
      const bounds = this.bookBounds ?? { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
      const minX = bounds.x + radius;
      const maxX = bounds.x + bounds.w - radius;
      const minY = bounds.y + radius;
      const maxY = bounds.y + bounds.h - radius;
    const clampedX = Math.min(maxX, Math.max(minX, newCx));
    const clampedY = Math.min(maxY, Math.max(minY, newCy));
    this.dragState.pointerX = x;
    this.dragState.pointerY = y;
    this.dragState.currentX = clampedX;
    this.dragState.currentY = clampedY;
  }

  private abortGlyphDrag(resetHover: boolean = true): void {
    if (resetHover) {
      this.hoveredIconIndex = -1;
    }
    this.dragState.active = false;
    this.dragState.iconIndex = -1;
    this.dragState.spell = null;
    this.dragState.offsetX = 0;
    this.dragState.offsetY = 0;
    this.dragState.pointerX = 0;
    this.dragState.pointerY = 0;
    this.dragState.currentX = 0;
    this.dragState.currentY = 0;
    this.dragState.snapshotDirty = false;
  }

  private drawDraggedGlyph(c: CanvasRenderingContext2D): void {
    if (!this.dragState.active || this.dragState.iconIndex < 0) {
      return;
    }
    const placement = this.iconPlacements[this.dragState.iconIndex];
    if (!placement) {
      return;
    }
    const ghost: GlyphPlacement = { ...placement, x: this.dragState.currentX, y: this.dragState.currentY };
    const radius = this.getGlyphRadius(ghost);
    let spellType: SpellType | null = null;
    let state: SpellState = SpellState.LOCKED;
    if (isSpellType(ghost.type)) {
      spellType = ghost.type;
      state = this.spellStates.get(ghost.type) ?? SpellState.AVAILABLE;
    }
    const equipped = spellType !== null && this.selectedSpell === spellType;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.save();
    c.translate(W/2, H/2);
    c.scale(this.tScale, this.tScale);
    c.translate(-W/2, -H/2);
    c.save();
    c.translate(W/2, H/2);
    c.scale(1, this.BOOK_HEIGHT_SCALE);
    c.translate(-W/2, -H/2);
    this.withGlyphAspectCompensation(c, ghost.x, ghost.y, true, () => {
      this.drawGlyphFrame(c, ghost.x, ghost.y, radius, state, equipped);
      this.drawSingleIcon(c, ghost, state, false, radius);
      if (spellType) {
        this.drawGlyphSanityCost(c, ghost.x, ghost.y, radius, spellType, state);
      }
    });
    c.restore();
    c.restore();
  }

  private updateHoverState(): void {
    const prevIndex = this.hoveredIconIndex;
    if (!this.isInteractive() || this.dragState.active || this.cursorPx === null || this.cursorPy === null) {
      this.hoveredIconIndex = -1;
      this.previousHoveredIconIndex = prevIndex;
      return;
    }
    const px = this.cursorPx;
    const py = this.cursorPy;
    let found = -1;
    for (let i = 0; i < this.iconPlacements.length; i++) {
      const glyph = this.iconPlacements[i];
      const radius = this.getGlyphRadius(glyph);
      const dx = px - glyph.x;
      const dy = py - glyph.y;
      if (dx * dx + dy * dy <= radius * radius) {
        found = i;
        break;
      }
    }
    if (found !== prevIndex) {
      this.previousHoveredIconIndex = prevIndex;
      this.hoveredIconIndex = found;
      if (found >= 0) {
        const hovered = this.iconPlacements[found];
        if (hovered && isSpellType(hovered.type)) {
          this.playGlyphHoverSound();
        }
      }
    }
  }

  private initGLResources(): void {
    const gl = this.gl;
    // Create texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Fullscreen quad (clip-space)
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    const indices = new Uint16Array([0,1,2, 0,2,3]);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Simple textured quad shader
    const vsSrc = `#version 300 es\nprecision mediump float;\nlayout(location=0) in vec2 a_pos;\nlayout(location=1) in vec2 a_uv;\nout vec2 v_uv;\nvoid main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const fsSrc = `#version 300 es\nprecision mediump float;\nuniform sampler2D u_tex;\nuniform vec4 u_uvTransform;\nin vec2 v_uv;\nout vec4 frag;\nvoid main(){\n  vec2 coverage = max(u_uvTransform.xy, vec2(0.0001));\n  vec2 uv = (v_uv - u_uvTransform.zw) / coverage;\n  uv = clamp(uv, vec2(0.0), vec2(1.0));\n  frag = texture(u_tex, uv);\n}`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    this.program = prog;
    this.uvTransformLoc = gl.getUniformLocation(prog, 'u_uvTransform');

    // Enable attributes
    const stride = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

    gl.bindVertexArray(null);
  }

  /** Re-render the book to the internal canvas and upload to texture */
  public update(deltaTime: number = 0): void {
    const now = performance.now();
    this.t = (now - this.startTime) / 1000;
    const tSince = now - this.animStartMs;
    const raw = Math.max(0, Math.min(1, tSince / Math.max(1, this.animDurMs)));
    const easeInOutQuad = (x:number) => x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2)/2;
    const p = easeInOutQuad(raw);
    this.animProgress = this.animOpening ? p : (1 - p);
    if (!this.animOpening && this.animClosingPendingDisable && raw >= 1) {
      this.enabled = false;
      this.animClosingPendingDisable = false;
    }
    const prog = Math.max(0, Math.min(1, this.animProgress));
    this.tScale = 1.0 + 0.06 * prog;
    this.tRot = 0.0;
    this.updateHoverState();

    if (!this.dragState.active) {
      this.renderScene(this.ctx, now, { includeTooltip: true, includeCursor: true });
    } else {
      if (this.dragState.snapshotDirty && this.baseCtx) {
        this.renderScene(this.baseCtx, now, {
          skipIconIndex: this.dragState.iconIndex,
          includeTooltip: false,
          includeCursor: false,
        });
        this.dragState.snapshotDirty = false;
      }
      this.drawDragComposite(now);
    }

    this.uploadCanvasTexture();
  }

  private renderScene(targetCtx: CanvasRenderingContext2D, _timestamp: number, options?: { skipIconIndex?: number; includeTooltip?: boolean; includeCursor?: boolean }): void {
    const includeTooltip = options?.includeTooltip ?? false;
    const includeCursor = options?.includeCursor ?? false;
    const c = targetCtx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.save();
    this.drawParchment(c, W, H);
    c.save();
    c.translate(W/2, H/2);
    c.scale(this.tScale, this.tScale);
    c.translate(-W/2, -H/2);
    c.save();
    c.translate(W/2, H/2);
    c.scale(1, this.BOOK_HEIGHT_SCALE);
    c.translate(-W/2, -H/2);
    this.drawBook(c, W, H);
    this.drawPageContent(c, W, H, { skipIconIndex: options?.skipIconIndex ?? -1 });
    c.restore();
    c.restore();
    this.drawTooltipAndCursor(c, includeTooltip, includeCursor);
    c.restore();
  }

  private drawDragComposite(timestamp: number): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.save();
    c.clearRect(0, 0, W, H);
    if (this.baseCanvas) {
      c.drawImage(this.baseCanvas, 0, 0);
    }
    this.drawDraggedGlyph(c);
    this.drawTooltipAndCursor(c, false, true);
    c.restore();
  }

  private drawTooltipAndCursor(c: CanvasRenderingContext2D, includeTooltip: boolean, includeCursor: boolean): void {
    if (includeTooltip && this.hoveredIconIndex >= 0) {
      const ic = this.iconPlacements[this.hoveredIconIndex];
      const t = ic.type;
      if (this.cursorPx !== null && this.cursorPy !== null) {
        const state = isSpellType(t) ? (this.spellStates.get(t) || SpellState.AVAILABLE) : SpellState.LOCKED;
        const Wb = this.measureTooltipWidth(t, state);
        const isRightPage = ic.x >= this.rightPage.x && ic.x <= (this.rightPage.x + this.rightPage.w);
        const pad = 18;
        let tipX = isRightPage ? (this.cursorPx - pad - Wb) : (this.cursorPx + pad);
        tipX = Math.max(6, Math.min(this.canvas.width - Wb - 6, tipX));
        const tipY = this.cursorPy + pad;
        this.drawSpellTooltip(c, tipX, tipY, t, state);
      }
    }
    if (includeCursor && this.cursorPx !== null && this.cursorPy !== null) {
      const W = this.canvas.width;
      const H = this.canvas.height;
      this.drawPentacle(c, this.cursorPx, this.cursorPy, Math.max(12, Math.min(22, Math.min(W, H) * 0.018)));
    }
  }

  private uploadCanvasTexture(): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // Inverse of reading transform for hit tests
  private inverseTransform(x:number, y:number, W:number, H:number): { x:number; y:number } {
    let px = x - W/2, py = y - H/2;
    const rx = px; const ry = py; // no rotation, zoom-only
    const invS = 1 / Math.max(1e-6, this.tScale);
    const invHeight = 1 / Math.max(1e-6, this.BOOK_HEIGHT_SCALE);
    const sx = rx * invS;
    const sy = ry * invS * invHeight;
    return { x: sx + W/2, y: sy + H/2 };
  }

  public render(viewportW: number, viewportH: number): void {
    if (!this.enabled || !this.texture || !this.program || !this.vao) return;
    const gl = this.gl;
    const prevBlend = gl.isEnabled(gl.BLEND);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const safeW = Math.max(1, Math.floor(viewportW));
    const safeH = Math.max(1, Math.floor(viewportH));
    const letterbox = computePanelLetterbox(
      safeW,
      safeH,
      this.canvas.width,
      this.canvas.height,
      { horizontalScale: PANEL_HORIZONTAL_STRETCH }
    );
    gl.viewport(0, 0, safeW, safeH);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const loc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(loc, 0);
    if (this.uvTransformLoc) {
      const coverageX = Math.max(letterbox.coverageX, 1e-4);
      const coverageY = Math.max(letterbox.coverageY, 1e-4);
      gl.uniform4f(this.uvTransformLoc, coverageX, coverageY, letterbox.offsetX, letterbox.offsetY);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (prevBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    if (prevDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  }

  // ===== Drawing helpers =====
  private drawParchment(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Base gradient
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e9d8a6'); // light ochre
    g.addColorStop(1, '#d4b483'); // deeper ochre
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Edge vignetting
    const vg = c.createRadialGradient(W/2, H/2, Math.min(W,H)*0.2, W/2, H/2, Math.max(W,H)*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0.0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.18)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // Speckles/stains (precomputed)
    c.globalAlpha = 0.045;
    for (const sp of this.speckles) {
      c.fillStyle = sp.color;
      c.beginPath(); c.arc(sp.x, sp.y, sp.r, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;
  }

  private drawBook(c: CanvasRenderingContext2D, W: number, H: number): void {
    // Book outer shadow
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 40;
    c.shadowOffsetX = 0; c.shadowOffsetY = 18;
  // Hard cover (make book visually narrower by increasing horizontal padding)
  const basePad = Math.min(W, H) * 0.06;
  const padX = Math.round(basePad * 2.5); // even wider left/right margins (narrower book)
  const padY = Math.round(basePad * 1.0); // keep top/bottom similar
    c.fillStyle = '#2b2018';
  this.roundRect(c, padX, padY, W-2*padX, H-2*padY, 18);
    c.fill();
    c.restore();
    // Inner pages area (must match initializeStaticLayout)
    const innerPadX = padX + Math.round(Math.min(W,H) * 0.02);
    const innerPadY = padY + Math.round(Math.min(W,H) * 0.02);
    const pageW = (W - 2*innerPadX);
    const pageH = (H - 2*innerPadY);
    // Draw two pages
    const seamX = Math.floor(W/2);
    const left = { x: innerPadX, y: innerPadY, w: seamX - innerPadX, h: pageH };
    // Right page ends at (W - innerPadX), symmetric to left
    const right = { x: seamX, y: innerPadY, w: (W - innerPadX) - seamX, h: pageH };
    // Cache page rects for other passes
    this.leftPage = left; this.rightPage = right;
    const pageFill = (x: number, y: number, w: number, h: number) => {
      const pg = c.createLinearGradient(x, y, x+w, y);
      pg.addColorStop(0, '#f0e3bf');
      pg.addColorStop(0.5, '#efe0b6');
      pg.addColorStop(1, '#f3e8c6');
      c.fillStyle = pg; this.roundRect(c, x, y, w, h, 8); c.fill();
      // Edge darkening
      c.save(); c.globalAlpha = 0.25; c.fillStyle = '#000';
      c.fillRect(x, y, 8, h); c.fillRect(x+w-8, y, 8, h); c.restore();
    };
    pageFill(left.x, left.y, left.w, left.h);
    pageFill(right.x, right.y, right.w, right.h);
    // Center seam shading
    const seamGrad = c.createLinearGradient(seamX-16, 0, seamX+16, 0);
    seamGrad.addColorStop(0, 'rgba(0,0,0,0.15)');
    seamGrad.addColorStop(0.5, 'rgba(0,0,0,0.02)');
    seamGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
  c.fillStyle = seamGrad; c.fillRect(seamX-16, innerPadY, 32, pageH);
    // Page wrinkles faint (precomputed)
    c.globalAlpha = 0.15; c.strokeStyle = 'rgba(100,80,60,0.5)';
    for (const line of this.pageWrinkles) {
      c.beginPath();
      c.moveTo(line[0].x, line[0].y);
      for (let i=1;i<line.length;i++) c.lineTo(line[i].x, line[i].y);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  private drawPageContent(c: CanvasRenderingContext2D, W: number, H: number, options?: { skipIconIndex?: number }): void {
    const skipIndex = options?.skipIconIndex ?? -1;
    c.strokeStyle = 'rgba(60,45,35,0.85)';
    c.lineWidth = 1.2; c.lineCap = 'round';
    for (const lineSegs of this.handwritingSegments) {
      for (const seg of lineSegs) {
        if (!seg.length) continue;
        c.beginPath();
        c.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length; i++) c.lineTo(seg[i].x, seg[i].y);
        c.stroke();
      }
    }
    for (let i = 0; i < this.iconPlacements.length; i++) {
      if (i === skipIndex) {
        continue;
      }
      const p = this.iconPlacements[i];
      const radius = this.getGlyphRadius(p);
      let state: SpellState;
      let spellType: SpellType | null = null;
      if (isSpellType(p.type)) {
        spellType = p.type;
        state = this.spellStates.get(spellType) ?? SpellState.AVAILABLE;
      } else {
        state = SpellState.LOCKED;
      }
      const equipped = spellType !== null && this.selectedSpell === spellType;
      this.withGlyphAspectCompensation(c, p.x, p.y, true, () => {
        this.drawGlyphFrame(c, p.x, p.y, radius, state, equipped);
      });
    }
    for (let i = 0; i < this.iconPlacements.length; i++) {
      if (i === skipIndex) {
        continue;
      }
      const p = this.iconPlacements[i];
      const radius = this.getGlyphRadius(p);
      let state: SpellState;
      let spellType: SpellType | null = null;
      if (isSpellType(p.type)) {
        spellType = p.type;
        state = this.spellStates.get(spellType) ?? SpellState.AVAILABLE;
      } else {
        state = SpellState.LOCKED;
      }
      const isHovered = i === this.hoveredIconIndex && !this.dragState.active;
      this.withGlyphAspectCompensation(c, p.x, p.y, true, () => {
        this.drawSingleIcon(c, p, state, isHovered, radius);
        if (spellType) {
          this.drawGlyphSanityCost(c, p.x, p.y, radius, spellType, state);
        }
      });
    }
  }

  // Initialize seeded RNG and precompute all static layout content
  private initializeStaticLayout(): void {
    // Seeded RNG (constant for reproducibility). You can tweak seed to change layout.
    this.rng = this.makeMulberry32(0xA11CE5);
    const W = this.ctx.canvas.width;
    const H = this.ctx.canvas.height;

    // Speckles/stains
    this.speckles.length = 0;
    const speckCount = 800;
    for (let i=0;i<speckCount;i++) {
      const x = this.rng()*W;
      const y = this.rng()*H;
      const r = 0.5 + this.rng()*2.5;
      const color = (this.rng() < 0.33) ? '#5a3e2b' : '#7f5f3f';
      this.speckles.push({ x, y, r, color });
    }

    // Compute page rects exactly like drawBook
    const basePad = Math.min(W, H) * 0.06;
    const padX = Math.round(basePad * 2.5);
    const padY = Math.round(basePad * 1.0);
    const innerPadX = padX + Math.round(Math.min(W,H) * 0.02);
    const innerPadY = padY + Math.round(Math.min(W,H) * 0.02);
    const pageW = (W - 2*innerPadX);
    const pageH = (H - 2*innerPadY);
    const seamX = Math.floor(W/2);
    this.leftPage = { x: innerPadX, y: innerPadY, w: seamX - innerPadX, h: pageH };
    this.rightPage = { x: seamX, y: innerPadY, w: (W - innerPadX) - seamX, h: pageH };
    this.bookBounds = {
      x: this.leftPage.x,
      y: innerPadY,
      w: (this.rightPage.x + this.rightPage.w) - this.leftPage.x,
      h: pageH,
    };

    // Page wrinkles precomputed (8 subtle lines across spread)
    this.pageWrinkles = [];
    for (let i=0;i<8;i++) {
      const y = innerPadY + (i+1)*(pageH/9) + (this.rng()-0.5)*6;
      const pts: Array<{x:number;y:number}> = [];
      for (let x = this.leftPage.x+12; x < this.rightPage.x+this.rightPage.w-12; x+= 24) {
        const yy = y + Math.sin(x*0.03 + i)*1.5 + (this.rng()-0.5)*0.6;
        pts.push({x, y: yy});
      }
      this.pageWrinkles.push(pts);
    }

    // Handwriting lines: segmented words per line (22 per page), with slant and jitter
    this.handwritingSegments = [];
    const buildWordPolyline = (x1:number, x2:number, y:number, slant:number, amp:number): Array<{x:number;y:number}> => {
      const pts: Array<{x:number;y:number}> = [];
      const len = Math.max(2, x2 - x1);
      const steps = Math.max(10, Math.floor(len / 10));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        // base: slight upward slant; add wavy micro-jitter
        const yOff = (x - x1) * slant + Math.sin(t * 10 + y * 0.003) * amp + (this.rng() - 0.5) * (amp * 0.3);
        pts.push({ x, y: y + yOff });
      }
      return pts;
    };
    const buildPageLinesWords = (page:{x:number;y:number;w:number;h:number}) => {
      const marginX = 18; const marginY = 20;
      const usableW = page.w - marginX*2;
      const usableH = page.h - marginY*2;
      const lines = 22; // ≥ 20
      const lineGap = usableH / (lines+1);
      for (let i=0;i<lines;i++) {
        const baselineY = page.y + marginY + (i+1)*lineGap + (this.rng()-0.5)*0.8;
        // Small slant per line (handwriting lean)
        const slant = (this.rng()-0.5) * 0.02; // px per px, tiny
        const amp = 1.6 + this.rng()*0.8;      // wave amplitude
        // Word distribution across the line width
        const xStart = page.x + marginX;
        const xEnd = xStart + usableW;
        let x = xStart;
        const lineSegs: Array<Array<{x:number;y:number}>> = [];
        while (x < xEnd) {
          // Word length and gap in pixels
          const wordLen = 20 + this.rng()*80;   // 20..100px
          const gap = 6 + this.rng()*18;       // 6..24px
          const x2 = Math.min(x + wordLen, xEnd);
          // Optionally skip tiny last word
          if (x2 - x >= 10) {
            // Slight per-word slant/amp variation
            const wSlant = slant + (this.rng()-0.5) * 0.006;
            const wAmp = amp * (0.85 + this.rng()*0.3);
            lineSegs.push(buildWordPolyline(x, x2, baselineY, wSlant, wAmp));
          }
          x = x2 + gap;
        }
        this.handwritingSegments.push(lineSegs);
      }
    };
  buildPageLinesWords(this.leftPage);
  buildPageLinesWords(this.rightPage);

    // Glyph layout: seed two uniform grids (4 filas x 2 columnas por página)
    const leftGrid = this.buildGlyphGridSlots(this.leftPage);
    const rightGrid = this.buildGlyphGridSlots(this.rightPage);
    this.iconPlacements = [];

    const leftSpells: SpellType[] = [
      SpellType.SPEED,
      SpellType.LONGJUMP,
      SpellType.GATE_RITE,
      SpellType.ETERNAL_RITE,
      SpellType.DISRUPT,
      SpellType.ANCHORING_PULSE,
      SpellType.VOID_KINESIS,
      SpellType.VOID_COCOON,
    ];
    leftSpells.forEach((spell, idx) => {
      const slot = leftGrid.positions[idx];
      if (!slot) {
        return;
      }
      this.iconPlacements.push({ type: spell, x: slot.x, y: slot.y, s: 1.0, r: leftGrid.radius });
    });

    const rightSpells: SpellType[] = [
      SpellType.TEMPUS_SIGILLUM,
      SpellType.QUIMIO_SIGILLUM,
      SpellType.SPECIES_SCAN,
      SpellType.CREATURE_SCAN,
    ];
    rightSpells.forEach((spell, idx) => {
      const slot = rightGrid.positions[idx];
      if (!slot) {
        return;
      }
      this.iconPlacements.push({ type: spell, x: slot.x, y: slot.y, s: 1.0, r: rightGrid.radius });
    });

    // Remaining decorative glyphs (lux, vinculum, etc.) stay locked placeholders if ever added later
    this.applyPendingGlyphLayout();
  }

  // Mulberry32 PRNG
  private makeMulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  private drawEye(c: CanvasRenderingContext2D, x:number,y:number, size:number): void {
    const w = size; const h = size*0.6;
    c.save(); c.translate(x,y);
    c.beginPath(); c.ellipse(0,0,w*0.6,h*0.45,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.ellipse(0,0,w*0.28,h*0.28,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.arc(0,0, Math.min(w,h)*0.15, 0, Math.PI*2); c.fill();
    // lashes
    for (let i=-3;i<=3;i++) {
      const ang = (i/6)*Math.PI;
      const lx = Math.cos(ang)*w*0.6; const ly = Math.sin(ang)*h*0.45;
      const ex = lx + Math.cos(ang)*8; const ey = ly + Math.sin(ang)*8;
      c.beginPath(); c.moveTo(lx,ly); c.lineTo(ex,ey); c.stroke();
    }
    c.restore();
  }

  private drawStarSymbol(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y);
    c.beginPath();
    const pts: Array<[number,number]> = [];
    for (let i=0;i<5;i++) {
      const ang = (-Math.PI/2) + i*2*Math.PI/5;
      pts.push([Math.cos(ang)*r, Math.sin(ang)*r]);
    }
    const order = [0,2,4,1,3,0];
    c.moveTo(pts[order[0]][0], pts[order[0]][1]);
    for (let i=1;i<order.length;i++) c.lineTo(pts[order[i]][0], pts[order[i]][1]);
    c.stroke();
    c.restore();
  }

  // Invented glyphs (locked by default)
  private drawIgnis(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    // Flame
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -r*0.9);
    c.bezierCurveTo(r*0.6, -r*0.6, r*0.8, -r*0.1, 0, r*0.9);
    c.bezierCurveTo(-r*0.8, -r*0.1, -r*0.6, -r*0.6, 0, -r*0.9);
    c.stroke();
    // inner tongue
    c.beginPath();
    c.moveTo(0, -r*0.5);
    c.bezierCurveTo(r*0.3, -r*0.2, r*0.4, 0, 0, r*0.5);
    c.bezierCurveTo(-r*0.4, 0, -r*0.3, -r*0.2, 0, -r*0.5);
    c.stroke();
    c.restore();
  }

  private drawUmbra(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    // Crescent moon
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2;
    c.beginPath(); c.arc(0,0, r, -Math.PI/2, Math.PI/2, false); c.stroke();
    c.beginPath(); c.arc(r*0.35, 0, r*0.85, -Math.PI/2, Math.PI/2, false); c.stroke();
    c.restore();
  }

  private drawEternalRite(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Stylized skull: circle head + eye sockets + nose triangle + jaw line
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const col = color || '#3b2b1f';
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2;
    // Skull outline (oval, taller than wide)
    c.beginPath();
    c.ellipse(0, 0, r*0.75, r*0.95, 0, 0, Math.PI*2);
    c.stroke();
    // Eye sockets (two dark filled circles)
    c.beginPath();
    c.arc(-r*0.35, -r*0.25, r*0.22, 0, Math.PI*2);
    c.arc(r*0.35, -r*0.25, r*0.22, 0, Math.PI*2);
    c.fill();
    // Nose (inverted triangle)
    c.beginPath();
    c.moveTo(0, -r*0.05);
    c.lineTo(-r*0.15, r*0.25);
    c.lineTo(r*0.15, r*0.25);
    c.closePath();
    c.fill();
    // Jaw teeth (simple vertical lines at bottom)
    c.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      const tx = i * r*0.18;
      c.beginPath();
      c.moveTo(tx, r*0.5);
      c.lineTo(tx, r*0.75);
      c.stroke();
    }
    c.restore();
  }

  private drawDisruptRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Material Disruption: shattered crystal/lightning bolt pattern
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const col = color || '#3b2b1f';
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5;
    
    // Outer circle (containment)
    c.beginPath();
    c.arc(0, 0, r*0.95, 0, Math.PI*2);
    c.stroke();
    
    // Central jagged lightning bolt (vertical zigzag)
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -r*0.8);
    c.lineTo(r*0.25, -r*0.3);
    c.lineTo(-r*0.15, -r*0.1);
    c.lineTo(r*0.2, r*0.3);
    c.lineTo(-r*0.1, r*0.5);
    c.lineTo(0, r*0.8);
    c.stroke();
    
    // Radiating cracks from center (8 lines)
    c.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x1 = Math.cos(angle) * r * 0.3;
      const y1 = Math.sin(angle) * r * 0.3;
      const x2 = Math.cos(angle) * r * 0.7;
      const y2 = Math.sin(angle) * r * 0.7;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }
    
    c.restore();
  }

  private drawAnchoringPulseRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Anchoring tether: concentric circle with chain link and anchor prongs
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const col = color || '#1d3c5d';
    c.strokeStyle = col; c.lineWidth = 2.4;
    // Outer containment ring
    c.beginPath(); c.arc(0, 0, r*0.95, 0, Math.PI*2); c.stroke();
    // Inner conduit ring with dashed energy
    c.setLineDash([6, 4]);
    c.beginPath(); c.arc(0, 0, r*0.65, 0, Math.PI*2); c.stroke();
    c.setLineDash([]);
    // Vertical tether column
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -r*0.25); c.lineTo(0, r*0.55); c.stroke();
    // Chain links along tether
    c.lineWidth = 2;
    for (let i=0;i<4;i++) {
      const ty = -r*0.1 + i * r*0.22;
      c.beginPath();
      c.ellipse(0, ty, r*0.14, r*0.08, 0, 0, Math.PI*2);
      c.stroke();
    }
    // Anchor prongs
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-r*0.40, r*0.45);
    c.lineTo(0, r*0.85);
    c.lineTo(r*0.40, r*0.45);
    c.stroke();
    // Small capture triangle above center
    c.beginPath();
    c.moveTo(0, -r*0.55);
    c.lineTo(-r*0.22, -r*0.30);
    c.lineTo(r*0.22, -r*0.30);
    c.closePath();
    c.stroke();
    c.restore();
  }

  private drawVoidKinesisRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Void beam: concentric circle with collapsing triangle and swirling tendrils
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const col = color || '#4f1a1f';
    c.strokeStyle = col; c.lineWidth = 2.6;
    // Outer ring
    c.beginPath(); c.arc(0, 0, r*0.95, 0, Math.PI*2); c.stroke();
    // Inner void circle
    c.globalAlpha = 0.8;
    c.beginPath(); c.arc(0, 0, r*0.55, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    // Inverted triangle core
    const triR = r*0.6;
    c.beginPath();
    for (let i=0;i<3;i++) {
      const ang = Math.PI/2 + i * (2*Math.PI/3);
      const px = Math.cos(ang) * triR;
      const py = Math.sin(ang) * triR;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.stroke();
    // Spiral tendrils (three Beziers)
    c.lineWidth = 2.2;
    for (let i=0;i<3;i++) {
      const baseAng = i * (2*Math.PI/3);
      const cx = Math.cos(baseAng) * r*0.15;
      const cy = Math.sin(baseAng) * r*0.15;
      const endX = Math.cos(baseAng + Math.PI/6) * r*0.9;
      const endY = Math.sin(baseAng + Math.PI/6) * r*0.9;
      c.beginPath();
      c.moveTo(cx, cy);
      const ctrl1X = Math.cos(baseAng + Math.PI/12) * r*0.45;
      const ctrl1Y = Math.sin(baseAng + Math.PI/12) * r*0.45;
      const ctrl2X = Math.cos(baseAng + Math.PI/3) * r*0.7;
      const ctrl2Y = Math.sin(baseAng + Math.PI/3) * r*0.7;
      c.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, endX, endY);
      c.stroke();
    }
    // Central void core dot
    c.beginPath(); c.arc(0, 0, r*0.08, 0, Math.PI*2); c.fillStyle = col; c.fill();
    c.restore();
  }

  private drawVoidCocoonRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Simpler chrysalis: single shell, seam, and pulse rings
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const shellColor = color ?? '#301d29';
    const pulseColor = color ?? '#54163a';
    c.strokeStyle = shellColor; c.lineWidth = 2.6;
    // Outer cocoon shell
    c.beginPath(); c.ellipse(0, 0, r*0.95, r*1.1, 0, 0, Math.PI*2); c.stroke();
    // Inner padding
    c.globalAlpha = 0.6;
    c.beginPath(); c.ellipse(0, 0, r*0.65, r*0.9, 0, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    // Vertical seam
    c.setLineDash([10,6]);
    c.beginPath(); c.moveTo(0, -r*1.0); c.lineTo(0, r*1.0); c.stroke();
    c.setLineDash([]);
    // Protective bands (two arcs)
    c.lineWidth = 2;
    for (const angle of [-0.4, 0.4]) {
      c.save();
      c.rotate(angle);
      c.beginPath();
      c.moveTo(-r*0.55, 0);
      c.quadraticCurveTo(0, angle < 0 ? -r*0.25 : r*0.25, r*0.55, 0);
      c.stroke();
      c.restore();
    }
    // Pulsing rings
    c.strokeStyle = pulseColor;
    c.lineWidth = 1.6;
    for (let i=0;i<2;i++) {
      const factor = 0.3 + i*0.25;
      c.globalAlpha = 0.5 + i*0.2;
      c.beginPath(); c.arc(0, 0, r*factor, 0, Math.PI*2); c.stroke();
    }
    c.globalAlpha = 1;
    // Core ember
    c.fillStyle = pulseColor;
    c.beginPath(); c.arc(0, 0, r*0.11, 0, Math.PI*2); c.fill();
    c.restore();
  }

  private drawTempusSigillumRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Hourglass sigil with rewind orbit
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#2f2411';
    c.strokeStyle = baseColor; c.lineWidth = 2.2;
    // Outer temporal ring + tick marks
    c.beginPath(); c.arc(0, 0, r*0.95, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 0.7;
    c.beginPath(); c.arc(0, 0, r*0.75, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    for (let i=0;i<12;i++) {
      const ang = i * Math.PI/6 + this.t * 0.15;
      const x1 = Math.cos(ang) * r*0.78;
      const y1 = Math.sin(ang) * r*0.78;
      const x2 = Math.cos(ang) * r*0.95;
      const y2 = Math.sin(ang) * r*0.95;
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    }
    // Hourglass body
    const hw = r*0.55;
    const hh = r*0.9;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-hw, -hh); c.lineTo(hw, -hh);
    c.moveTo(-hw, hh); c.lineTo(hw, hh);
    c.moveTo(-hw, -hh); c.lineTo(hw, hh);
    c.moveTo(hw, -hh); c.lineTo(-hw, hh);
    c.stroke();
    // Flow of sand (inverse triangles)
    c.fillStyle = baseColor;
    c.globalAlpha = 0.4;
    c.beginPath();
    c.moveTo(0, -hh + r*0.15);
    c.lineTo(-r*0.15, -r*0.05);
    c.lineTo(r*0.15, -r*0.05);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(-r*0.18, r*0.1);
    c.lineTo(r*0.18, r*0.1);
    c.lineTo(0, hh - r*0.15);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    // Rewind orbit arrow
    c.lineWidth = 2.4;
    const orbitR = r*0.55;
    c.beginPath();
    c.arc(0, 0, orbitR, Math.PI*0.15, Math.PI*1.65, true);
    c.stroke();
    const tipAng = Math.PI*0.15;
    const tipX = Math.cos(tipAng) * orbitR;
    const tipY = Math.sin(tipAng) * orbitR;
    c.beginPath();
    c.moveTo(tipX, tipY);
    c.lineTo(tipX - r*0.18, tipY - r*0.08);
    c.lineTo(tipX - r*0.1, tipY + r*0.12);
    c.closePath();
    c.fill();
    c.restore();
  }

  private drawQuimioSigillumRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    // Rejuvenation seal: medic cross, alchemical droplet, twin leaves
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#1f3b24';
    c.strokeStyle = baseColor; c.lineWidth = 2.4;
    c.beginPath(); c.arc(0, 0, r*0.95, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 0.7;
    c.beginPath(); c.arc(0, 0, r*0.72, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    // Medic cross
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -r*0.8); c.lineTo(0, r*0.8); c.stroke();
    c.beginPath(); c.moveTo(-r*0.6, 0); c.lineTo(r*0.6, 0); c.stroke();
    // Catalyst droplet
    c.fillStyle = baseColor;
    c.globalAlpha = 0.85;
    c.beginPath();
    c.moveTo(0, -r*0.38);
    c.quadraticCurveTo(r*0.25, -r*0.05, 0, r*0.55);
    c.quadraticCurveTo(-r*0.25, -r*0.05, 0, -r*0.38);
    c.fill();
    c.globalAlpha = 1;
    // Twin leaves hugging the droplet
    c.lineWidth = 1.8;
    for (const dir of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, r*0.12);
      c.quadraticCurveTo(dir * r*0.55, -r*0.18, dir * r*0.68, r*0.22);
      c.quadraticCurveTo(dir * r*0.48, r*0.48, 0, r*0.4);
      c.stroke();
    }
    // Pulsing sigil sparks
    c.lineWidth = 1.4;
    for (let i=0;i<4;i++) {
      const ang = i * (Math.PI/2) + this.t * 0.35;
      const x1 = Math.cos(ang) * r*0.32;
      const y1 = Math.sin(ang) * r*0.32;
      const x2 = Math.cos(ang) * r*0.5;
      const y2 = Math.sin(ang) * r*0.5;
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    }
    c.restore();
  }

  private drawSpeciesScanRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#3b2b1f';
    c.strokeStyle = baseColor; c.lineWidth = 2;
    // Outer circle
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI*2); c.stroke();
    // Inner guide ring
    c.globalAlpha = 0.65;
    c.beginPath(); c.arc(0, 0, r*0.8, 0, Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    // Double helix rails
    const helixHeight = r * 1.4;
    const steps = 18;
    c.lineWidth = 2.2;
    for (let rail = -1; rail <= 1; rail += 2) {
      c.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const yPos = -helixHeight/2 + helixHeight * t;
        const phase = t * Math.PI * 2 + (rail < 0 ? 0 : Math.PI);
        const xPos = Math.sin(phase) * r * 0.45;
        if (i === 0) c.moveTo(xPos, yPos); else c.lineTo(xPos, yPos);
      }
      c.stroke();
    }
    // Ladder rungs
    c.lineWidth = 1.6;
    for (let i = 0; i < steps; i += 2) {
      const t = i / steps;
      const yPos = -helixHeight/2 + helixHeight * t;
      const phase = t * Math.PI * 2;
      const xOffset = Math.cos(phase) * r * 0.25;
      c.beginPath();
      c.moveTo(-xOffset, yPos);
      c.lineTo(xOffset, yPos);
      c.stroke();
    }
    c.restore();
  }

  private drawCreatureScanRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#3b2b1f';
    c.strokeStyle = baseColor; c.lineWidth = 2.4;
    // Outer circle + inner circle
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    c.globalAlpha = 0.75;
    c.beginPath(); c.arc(0,0,r*0.75,0,Math.PI*2); c.stroke();
    c.globalAlpha = 1;
    // Stylized eye with tri-pronged claws
    c.beginPath(); c.ellipse(0,0,r*0.55,r*0.32,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.arc(0,0,r*0.18,0,Math.PI*2); c.stroke();
    c.fillStyle = baseColor; c.beginPath(); c.arc(0,0,r*0.08,0,Math.PI*2); c.fill();
    // Claw marks (triangles at 120°)
    const clawCount = 3;
    for (let i=0;i<clawCount;i++) {
      const ang = (-Math.PI/2) + i * (2*Math.PI/clawCount);
      const inner = r*0.85;
      const outer = r*1.1;
      c.beginPath();
      c.moveTo(Math.cos(ang)*inner, Math.sin(ang)*inner);
      c.lineTo(Math.cos(ang+0.15)*outer, Math.sin(ang+0.15)*outer);
      c.lineTo(Math.cos(ang-0.15)*outer, Math.sin(ang-0.15)*outer);
      c.closePath();
      c.stroke();
    }
    // Sigil spokes
    c.lineWidth = 1.8;
    for (let i=0;i<6;i++) {
      const a = i * Math.PI / 3 + this.t * 0.2;
      const x1 = Math.cos(a) * r*0.2;
      const y1 = Math.sin(a) * r*0.2;
      const x2 = Math.cos(a) * r*0.55;
      const y2 = Math.sin(a) * r*0.55;
      c.beginPath();
      c.moveTo(x1,y1);
      c.lineTo(x2,y2);
      c.stroke();
    }
    c.restore();
  }

  private drawLux(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    // Sun with rays
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2;
    c.beginPath(); c.arc(0,0, r*0.6, 0, Math.PI*2); c.stroke();
    for (let i=0;i<12;i++) {
      const ang = i*Math.PI/6;
      const x1 = Math.cos(ang)*r*0.7, y1 = Math.sin(ang)*r*0.7;
      const x2 = Math.cos(ang)*r*1.0, y2 = Math.sin(ang)*r*1.0;
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    }
    c.restore();
  }

  private drawVinculum(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    // Interlocked links
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2.5; c.beginPath();
    c.ellipse(-r*0.35, 0, r*0.35, r*0.22, 0, 0, Math.PI*2); c.stroke();
    c.beginPath(); c.ellipse(r*0.35, 0, r*0.35, r*0.22, 0, 0, Math.PI*2); c.stroke();
    // overlap accents
    c.lineWidth = 4; c.beginPath();
    c.arc(0,0, r*0.12, 0, Math.PI*2); c.stroke();
    c.restore();
  }

  private drawTempus(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    // Hourglass
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    c.strokeStyle = '#3b2b1f'; c.lineWidth = 2;
    const w = r*0.9, h = r*1.2;
    c.beginPath();
    c.moveTo(-w, -h); c.lineTo(w, -h);
    c.moveTo(-w, h); c.lineTo(w, h);
    c.moveTo(-w, -h); c.lineTo(w, h);
    c.moveTo(w, -h); c.lineTo(-w, h);
    c.stroke();
    c.restore();
  }

  // Long-jump rune: concentric rings with a portal sigil
  private drawLongJumpRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#3b2b1f';
    c.strokeStyle = baseColor;
    // Outer/inner rings
    c.lineWidth = 2;
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    c.globalAlpha = 0.75; c.beginPath(); c.arc(0,0,r*0.82,0,Math.PI*2); c.stroke(); c.globalAlpha = 1;
    // Portal glyph: three arcs opening clockwise
    const arc = (R:number, a0:number, a1:number) => { c.beginPath(); c.arc(0,0,R,a0,a1,false); c.stroke(); };
    c.lineWidth = 3;
    arc(r*0.55, -Math.PI*0.15, Math.PI*0.35);
    arc(r*0.68, -Math.PI*0.10, Math.PI*0.40);
    arc(r*0.40, -Math.PI*0.20, Math.PI*0.30);
    // Small center mark
    c.lineWidth = 2; c.beginPath(); c.arc(0,0, r*0.06, 0, Math.PI*2); c.stroke();
    c.restore();
  }

  // Speed rune: circular sigil with double chevrons ("velocity")
  private drawSpeedRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#3b2b1f';
    // Outer circle
    c.strokeStyle = baseColor; c.lineWidth = 2;
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    // Inner ring
    c.globalAlpha = 0.6; c.beginPath(); c.arc(0,0,r*0.78,0,Math.PI*2); c.stroke(); c.globalAlpha = 1;
    // Double chevrons pointing right
    const ch = (sx:number,sy:number, s:number)=>{
      c.strokeStyle = color ? baseColor : '#2e2218';
      c.beginPath();
      c.moveTo(sx-10*s, sy-6*s); c.lineTo(sx, sy); c.lineTo(sx-10*s, sy+6*s);
      c.stroke();
    };
    c.lineWidth = 3; c.strokeStyle = color ? baseColor : '#2e2218';
    ch(-r*0.25, -r*0.10, 1.0);
    ch(0, 0, 1.2);
    // Rune marks around circle (ticks)
    c.lineWidth = 2; c.strokeStyle = baseColor;
    for (let i=0;i<6;i++) {
      const ang = i*Math.PI/3;
      const x1 = Math.cos(ang)*r*0.86, y1 = Math.sin(ang)*r*0.86;
      const x2 = Math.cos(ang)*r*0.98, y2 = Math.sin(ang)*r*0.98;
      c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke();
    }
    c.restore();
  }

  // Gate Rite rune: triple ring + ojo + runas cardinales + radios internos
  private drawGateRiteRune(c: CanvasRenderingContext2D, x:number,y:number, r:number, color?: string): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    const baseColor = color ?? '#3b2b1f';
    c.strokeStyle = baseColor; c.lineWidth = 2.2;
    // Anillo exterior
    c.beginPath(); c.arc(0,0,r,0,Math.PI*2); c.stroke();
    // Anillo medio roto
    const arc = (R:number,a0:number,a1:number)=>{ c.beginPath(); c.arc(0,0,R,a0,a1,false); c.stroke(); };
    c.globalAlpha = 0.75; arc(r*0.82, -Math.PI*0.15, Math.PI*0.65); arc(r*0.82, Math.PI*0.85, Math.PI*1.35); c.globalAlpha = 1;
    // Anillo interior pulsante
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.8);
    c.lineWidth = 2 + pulse*1.5; c.beginPath(); c.arc(0,0,r*0.58,0,Math.PI*2); c.stroke();
    // Marcas cardinales
    const tick = (a:number)=>{ const x1=Math.cos(a)*r*0.90, y1=Math.sin(a)*r*0.90; const x2=Math.cos(a)*r*1.02, y2=Math.sin(a)*r*1.02; c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke(); };
    [0,Math.PI/2,Math.PI,3*Math.PI/2].forEach(tick);
    // Ojo central
    c.lineWidth = 2; c.beginPath(); c.ellipse(0,0,r*0.40,r*0.24,0,0,Math.PI*2); c.stroke();
    c.beginPath(); c.ellipse(0,0,r*0.18,r*0.18,0,0,Math.PI*2); c.stroke();
    c.fillStyle = baseColor; c.beginPath(); c.arc(0,0,r*0.10,0,Math.PI*2); c.fill();
    // Runas internas (spokes desplazados)
    c.lineWidth = 1.4; c.globalAlpha = 0.85;
    for (let i=0;i<6;i++) {
      const a = i*Math.PI/3 + this.t*0.3;
      const rx=Math.cos(a)*r*0.70, ry=Math.sin(a)*r*0.70;
      c.beginPath(); c.moveTo(rx,ry); c.lineTo(rx+Math.cos(a+Math.PI/2)*4, ry+Math.sin(a+Math.PI/2)*4); c.stroke();
    }
    c.globalAlpha = 1; c.restore();
  }

  private drawIconHover(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save(); c.translate(x,y); c.scale(1, 1.5);
    // Golden glow
    const g = c.createRadialGradient(0,0, r*0.6, 0,0, r*1.6);
    g.addColorStop(0, `rgba(255,215,0,0.35)`);
    g.addColorStop(1, `rgba(255,215,0,0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0,0, r*1.5, 0, Math.PI*2); c.fill();
    // Gold ring
    c.lineWidth = 3; c.strokeStyle = '#ffd700';
    c.beginPath(); c.arc(0,0, r*1.05, 0, Math.PI*2); c.stroke();
    // Subtle sparkles orbiting
    const sparkCount = 10; const t = this.t;
    for (let i=0;i<sparkCount;i++) {
      const ang = (i/sparkCount)*Math.PI*2 + t*0.9;
      const rr = r*1.2 + Math.sin(t*1.7 + i)*4;
      const sx = Math.cos(ang)*rr; const sy = Math.sin(ang)*rr;
      c.fillStyle = 'rgba(255,230,120,0.85)';
      c.beginPath(); c.arc(sx, sy, 2.2, 0, Math.PI*2); c.fill();
    }
    c.restore();
  }

  // Parchment frame behind glyphs to mask handwriting and provide a clean space
  private drawSingleIcon(
    c: CanvasRenderingContext2D,
    placement: GlyphPlacement,
    state: SpellState,
    isHovered: boolean,
    radius: number,
  ): void {
    const { type, x, y } = placement;
    const runeColor = state === SpellState.LOCKED ? 'rgba(80,80,80,0.65)' : undefined;
    if (isSpellType(type)) {
      switch (type) {
        case SpellType.SPEED:
          this.drawSpeedRune(c, x, y, radius, runeColor);
          break;
        case SpellType.LONGJUMP:
          this.drawLongJumpRune(c, x, y, radius, runeColor);
          break;
        case SpellType.GATE_RITE:
          this.drawGateRiteRune(c, x, y, radius, runeColor);
          break;
        case SpellType.ETERNAL_RITE:
          this.drawEternalRite(c, x, y, radius, runeColor);
          break;
        case SpellType.DISRUPT:
          this.drawDisruptRune(c, x, y, radius, runeColor);
          break;
        case SpellType.ANCHORING_PULSE:
          this.drawAnchoringPulseRune(c, x, y, radius, runeColor);
          break;
        case SpellType.VOID_KINESIS:
          this.drawVoidKinesisRune(c, x, y, radius, runeColor);
          break;
        case SpellType.VOID_COCOON:
          this.drawVoidCocoonRune(c, x, y, radius, runeColor);
          break;
        case SpellType.TEMPUS_SIGILLUM:
          this.drawTempusSigillumRune(c, x, y, radius, runeColor);
          break;
        case SpellType.QUIMIO_SIGILLUM:
          this.drawQuimioSigillumRune(c, x, y, radius, runeColor);
          break;
        case SpellType.SPECIES_SCAN:
          this.drawSpeciesScanRune(c, x, y, radius, runeColor);
          break;
        case SpellType.CREATURE_SCAN:
          this.drawCreatureScanRune(c, x, y, radius, runeColor);
          break;
        default:
          this.drawVinculum(c, x, y, radius);
          break;
      }
    } else {
      switch (type) {
        case 'ignis':
          this.drawIgnis(c, x, y, radius);
          break;
        case 'tempus':
          this.drawTempus(c, x, y, radius);
          break;
        default:
          this.drawLux(c, x, y, radius);
          break;
      }
    }
    if (isHovered) {
      this.drawIconHover(c, x, y, radius);
    }
  }

  private withGlyphAspectCompensation(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    enable: boolean,
    drawFn: () => void,
  ): void {
    if (!enable) {
      drawFn();
      return;
    }
    c.save();
    c.translate(cx, cy);
    c.scale(0.9, 1.1);
    c.translate(-cx, -cy);
    try {
      drawFn();
    } finally {
      c.restore();
    }
  }

  private drawGlyphFrame(c: CanvasRenderingContext2D, cx:number, cy:number, r:number, state: SpellState = SpellState.AVAILABLE, equipped: boolean = false): void {
    const { x, y, w, h } = this.getGlyphFrameRect(cx, cy, r);
    c.save();
    // Shadow to lift the frame slightly
    c.shadowColor = 'rgba(0,0,0,0.25)';
    c.shadowBlur = 6;
    c.shadowOffsetX = 0; c.shadowOffsetY = 3;
    // Fill: lighter parchment (locked even lighter/whiter)
    c.fillStyle = state === SpellState.LOCKED ? '#f7f4ec' : '#f7f0d8';
    this.roundRect(c, x, y, w, h, 6);
    c.fill();
    // Border
    c.shadowColor = 'transparent';
    c.lineWidth = 2.2;
    if (state === SpellState.LOCKED) {
      c.strokeStyle = 'rgba(80,80,80,0.35)';
    } else if (equipped) {
      c.strokeStyle = '#00c5ff';
    } else {
      c.strokeStyle = 'rgba(60,45,35,0.55)';
    }
    this.roundRect(c, x, y, w, h, 6);
    c.stroke();
    // Additional inner cyan accent for equipped to reinforce selection
    if (equipped) {
      c.save();
      c.globalAlpha = 0.95;
      c.strokeStyle = '#00e0ff';
      c.lineWidth = 2;
      this.roundRect(c, x+5, y+5, w-10, h-10, 5);
      c.stroke();
      c.restore();
    }
    // Removed 'EQUIPPED' ribbon per request
    c.restore();
  }

  private drawGlyphSanityCost(
    c: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    spell: SpellType,
    state: SpellState,
  ): void {
    const cost = getSpellSanityCost(spell);
    const tempCost = Math.max(0, cost?.temp ?? 0);
    const maxCost = Math.max(0, cost?.max ?? 0);
    const ratioLabel = `${tempCost}/${maxCost}`;
    const { x, y, w, h } = this.getGlyphFrameRect(cx, cy, radius);
    const anchorX = x + w - 10;
    const baseY = y + h - 10;
    c.save();
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.font = '700 12px serif';
    c.fillStyle = state === SpellState.LOCKED ? 'rgba(80,80,80,0.9)' : '#3b1f12';
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 2;
    c.fillText(ratioLabel, anchorX, baseY);
    c.restore();
  }

  private getGlyphFrameRect(cx:number, cy:number, radius:number): { x:number; y:number; w:number; h:number } {
    const w = radius * 2.4 + this.GLYPH_FRAME_EXTRA_WIDTH;
    const h = w * 1.2;
    const x = Math.round(cx - w/2);
    const y = Math.round(cy - h/2);
    return { x, y, w, h };
  }

  private drawSpellTooltip(c: CanvasRenderingContext2D, x:number, y:number, type: SpellType | string, state: SpellState): void {
    let title: string;
    let desc: string;
    if (type === SpellType.LONGJUMP) {
      title = 'Void Jump';
      desc = 'Tear the veil and traverse the void to your selected target.';
    } else if (type === SpellType.SPEED) {
      title = 'Double Phased Time Rite';
      desc = 'Double the ship\'s max speed for 2 minutes.';
    } else if (type === SpellType.GATE_RITE) {
      title = 'Gate Rite';
      desc = 'Rend a planet; birth an arcane portal to a new system.';
    } else if (type === SpellType.ETERNAL_RITE) {
      title = 'Eternal Rite';
      desc = 'Freeze time for all objects except your ship. Duration: 30 seconds.';
    } else if (type === SpellType.DISRUPT) {
      title = 'Material Disruption Rite';
      desc = 'Unleash a beam of pure entropy. Asteroids within 50u crumble.';
    } else if (type === SpellType.ANCHORING_PULSE) {
      title = 'Anchoring Pulse';
      desc = 'Emit a blue tether that drags compliant asteroids ≤50u into cargo.';
    } else if (type === SpellType.VOID_KINESIS) {
      title = 'Void Kinesis';
      desc = 'Concentrate a void-red beam to dissolve asteroids into void energy.';
    } else if (type === SpellType.VOID_COCOON) {
      title = 'Void Cocoon';
      desc = 'Encase the hull in a void chrysalis, nullifying impacts for 30 seconds.';
    } else if (type === SpellType.TEMPUS_SIGILLUM) {
      title = 'Tempus Sigillum';
      desc = 'Brand nearby planets with a rewind sigil, purging augury echoes and calming fauna.';
    } else if (type === SpellType.QUIMIO_SIGILLUM) {
      title = 'Quimio Sigillum';
      desc = 'Catalyze rejuvenation reagents to restore 5% survivability (cap 100%).';
    } else if (type === SpellType.SPECIES_SCAN) {
      title = 'Augurio';
      desc = 'Reveal the dominant sentient species of any planet <500u.';
    } else if (type === SpellType.CREATURE_SCAN) {
      title = 'Revelación';
      desc = 'Expose the terror being currently active on a planet <500u.';
    } else {
      const typeStr = typeof type === 'string' ? type : String(type);
      const cap = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
      title = `Sigillum ${cap}`;
      desc = 'Verba arcana obscura; incantatio vetusta et ineffabilis.';
    }
    const stateText = String(state); // Convert enum to string
    // Bubble scaled vertically by 1.5
    const pad = 10;
    c.save();
    c.translate(x, y);
    c.scale(1, 1.5);
    c.font = 'italic 14px serif';
    const wTitle = c.measureText(title).width;
    c.font = '12px serif';
    const wDesc = Math.max(c.measureText(desc).width, c.measureText(stateText).width);
    const Wb = Math.ceil(Math.max(wTitle, wDesc) + pad*2);
    const Hb = 54;
    // background
    c.fillStyle = 'rgba(0,0,0,0.65)';
    this.roundRect(c, 0, 0, Wb, Hb, 6);
    c.fill();
    // text
    c.fillStyle = '#fff';
    c.font = 'italic 14px serif';
    c.fillText(title, pad, 18);
    c.font = '12px serif';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillText(desc, pad, 34);
    c.fillStyle = state === SpellState.LOCKED ? '#ff8888' : (state === SpellState.EQUIPPED ? '#ffd700' : '#a0ffa0');
    c.fillText(stateText, pad, 50);
    c.restore();
  }

  // Measure tooltip bubble width (matches drawSpellTooltip font sizing)
  private measureTooltipWidth(type: SpellType | string, state: SpellState): number {
    const c = this.ctx;
    let title: string;
    let desc: string;
    if (type === SpellType.LONGJUMP) {
      title = 'Void Jump';
      desc = 'Tear the veil and traverse the void to your selected target.';
    } else if (type === SpellType.SPEED) {
      title = 'Double Phased Time Rite';
      desc = 'Double the ship\'s max speed for 2 minutes.';
    } else if (type === SpellType.GATE_RITE) {
      title = 'Gate Rite';
      desc = 'Rend a planet; birth an arcane portal to a new system.';
    } else if (type === SpellType.ETERNAL_RITE) {
      title = 'Eternal Rite';
      desc = 'Embrace the void. Let the end become the beginning.';
    } else if (type === SpellType.DISRUPT) {
      title = 'Material Disruption Rite';
      desc = 'Unleash a beam of pure entropy. Asteroids within 50u crumble.';
    } else if (type === SpellType.ANCHORING_PULSE) {
      title = 'Anchoring Pulse';
      desc = 'Hook compliant asteroids ≤50u and reel them into cargo.';
    } else if (type === SpellType.VOID_KINESIS) {
      title = 'Void Kinesis';
      desc = 'Transmute asteroid mass into volatile void energy.';
    } else if (type === SpellType.VOID_COCOON) {
      title = 'Void Cocoon';
      desc = 'Cocoon the ship for 30s, negating collisions while the chrysalis holds.';
    } else if (type === SpellType.TEMPUS_SIGILLUM) {
      title = 'Tempus Sigillum';
      desc = 'Rewrite a planet’s clock, clearing augury data and pacifying minor beings.';
    } else if (type === SpellType.QUIMIO_SIGILLUM) {
      title = 'Quimio Sigillum';
      desc = 'Rejuvenating sigil that restores 5% survivability (cap 100%).';
    } else if (type === SpellType.SPECIES_SCAN) {
      title = 'Augurio · Species Scan';
      desc = 'Reveal the dominant species of a scanned planet (<500u). Cost: 1/3 sanity.';
    } else if (type === SpellType.CREATURE_SCAN) {
      title = 'Revelación · Creature Scan';
      desc = 'Expose the active minor entity on a scanned planet (<500u). Cost: 1/3 sanity.';
    } else {
      const typeStr = typeof type === 'string' ? type : String(type);
      const cap = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
      title = `Sigillum ${cap}`;
      desc = 'Verba arcana obscura; incantatio vetusta et ineffabilis.';
    }
    const pad = 10;
    // Use same fonts as in drawSpellTooltip
    c.save();
    c.font = 'italic 14px serif';
    const wTitle = c.measureText(title).width;
    c.font = '12px serif';
    const stateText = String(state); // Convert enum to string
    const wDesc = Math.max(c.measureText(desc).width, c.measureText(stateText).width);
    const Wb = Math.ceil(Math.max(wTitle, wDesc) + pad*2);
    c.restore();
    return Wb;
  }

  private drawScribble(c: CanvasRenderingContext2D, x1:number,y1:number, x2:number,y2:number): void {
    c.beginPath(); c.moveTo(x1,y1);
    const steps = 18 + Math.floor(Math.random()*10);
    for (let i=1;i<=steps;i++) {
      const t = i/steps;
      const nx = x1 + (x2-x1)*t + (Math.random()-0.5)*8;
      const ny = y1 + (y2-y1)*t + (Math.random()-0.5)*6;
      c.lineTo(nx, ny);
    }
    c.stroke();
  }

  private drawPentacle(c: CanvasRenderingContext2D, x:number,y:number, r:number): void {
    c.save();
    c.translate(x,y);
    // Make the pentacle taller without changing panel dimensions
    const tall = 1.75; // ~25% taller
    c.scale(1, tall);
    // Pulse factors
    const s = 1 + 0.06 * Math.sin(this.t * 2.2); // scale pulse
    const glow = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * 3.1)); // alpha pulse
    const rr = r * s;
    // Soft outer glow
    const g = c.createRadialGradient(0, 0, rr * 0.6, 0, 0, rr * 1.4);
    g.addColorStop(0, `rgba(200,0,40,${(glow*0.7).toFixed(3)})`);
    g.addColorStop(1, 'rgba(200,0,40,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0,0, rr * 1.35, 0, Math.PI*2); c.fill();
    // Main circle and star
    c.strokeStyle = '#b00020'; // brighter crimson
    c.lineWidth = 2.2;
    c.beginPath(); c.arc(0,0, rr, 0, Math.PI*2); c.stroke();
    // star
    const pts: Array<[number,number]> = [];
    for (let i=0;i<5;i++) {
      const ang = (-Math.PI/2) + i*2*Math.PI/5;
      pts.push([Math.cos(ang)*(rr*0.85), Math.sin(ang)*(rr*0.85)]);
    }
    c.beginPath();
    const order = [0,2,4,1,3,0];
    c.moveTo(pts[order[0]][0], pts[order[0]][1]);
    for (let i=1;i<order.length;i++) c.lineTo(pts[order[i]][0], pts[order[i]][1]);
    c.closePath();
    c.stroke();
    // Inner faint fill pulsing
    c.fillStyle = `rgba(139,0,0,${(0.10 + glow*0.2).toFixed(3)})`;
    c.beginPath(); c.arc(0,0, rr*0.82, 0, Math.PI*2); c.fill();
    c.restore();
  }

  private roundRect(c: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) {
    c.beginPath();
    c.moveTo(x+r, y);
    c.lineTo(x+w-r, y);
    c.quadraticCurveTo(x+w, y, x+w, y+r);
    c.lineTo(x+w, y+h-r);
    c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    c.lineTo(x+r, y+h);
    c.quadraticCurveTo(x, y+h, x, y+h-r);
    c.lineTo(x, y+r);
    c.quadraticCurveTo(x, y, x+r, y);
    c.closePath();
  }

  private playGlyphHoverSound(): void {
    if (!this.audioService) {
      return;
    }
    try {
      this.audioService.play('ui_outline_hover', { bus: 'ui', volume: 0.32 });
    } catch {}
  }

  private buildGlyphGridSlots(page: { x: number; y: number; w: number; h: number }): { positions: Array<{ x: number; y: number }>; radius: number } {
    const rows = 4;
    const cols = 2;
    const marginX = page.w * 0.27;
    const marginY = page.h * 0.12;
    const usableW = Math.max(1, page.w - marginX * 2);
    const usableH = Math.max(1, page.h - marginY * 2);
    const stepX = cols > 1 ? usableW / (cols - 1) : 0;
    const stepY = rows > 1 ? usableH / (rows - 1) : 0;
    const positions: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        positions.push({
          x: page.x + marginX + col * stepX,
          y: page.y + marginY + row * stepY,
        });
      }
    }
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const baseRadius = Math.min(page.w, page.h) * 0.11;
    const radius = Math.min(baseRadius, Math.min(cellW, cellH) * 0.45);
    return { positions, radius };
  }
}
