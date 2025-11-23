import {
  InventorySnapshot,
  EquipmentSlot,
  EquipmentSlotState,
  PersonalGearSlot,
  RarityTier,
  InventoryPanelRegion,
  InventoryRegionBounds,
  InventorySelection,
  InventoryActionType
} from '../types/inventory.types';

export class InventoryPanel {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly verticalScale = 1.25;
  private readonly textHeightScale = 1.25;
  private readonly unavailableSlots = new Set<EquipmentSlot>([
    EquipmentSlot.SHIELD,
    EquipmentSlot.DRONE_BAY,
    EquipmentSlot.AUXILIARY
  ]);
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private ibo: WebGLBuffer | null = null;
  private program: WebGLProgram | null = null;
  private enabled = false;
  private cursorPx: number | null = null;
  private cursorPy: number | null = null;
  private snapshot: InventorySnapshot | null = null;
  private cargoScrollOffset = 0;
  private cargoScrollTarget = 0;
  private cargoMaxScroll = 0;
  private equipmentScrollOffset = 0;
  private equipmentScrollTarget = 0;
  private equipmentMaxScroll = 0;
  private regions: InventoryPanelRegion[] = [];
  private selection: InventorySelection | null = null;

  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 1024) {
    this.gl = gl;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('InventoryPanel: 2D context not available');
    this.ctx = ctx;
    this.initGLResources();
  }

  public setEnabled(value: boolean): void {
    this.enabled = value;
    if (!value) {
      this.resetScroll();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isInteractive(): boolean {
    return this.enabled;
  }

  public containsPoint(): boolean {
    return this.enabled;
  }

  public setCursorFromViewport(clientX: number, clientY: number, rect: DOMRect, viewportW: number, viewportH: number): void {
    const x = ((clientX - rect.left) / Math.max(1, rect.width)) * viewportW;
    const y = ((clientY - rect.top) / Math.max(1, rect.height)) * viewportH;
    this.cursorPx = (x / viewportW) * this.canvas.width;
    this.cursorPy = (y / viewportH) * this.canvas.height;
  }

  public handleWheelFromViewport(deltaY: number): void {
    const pointerX = this.cursorPx ?? 0;
    const leftW = Math.floor(this.canvas.width * 0.35);
    const centerW = Math.floor(this.canvas.width * 0.4);
    const rightBoundary = leftW + centerW;
    const applyScroll = (target: 'equipment' | 'cargo') => {
      if (target === 'equipment') {
        this.equipmentScrollTarget += deltaY * 0.35;
        this.equipmentScrollTarget = Math.max(0, Math.min(this.equipmentMaxScroll, this.equipmentScrollTarget));
      } else {
        this.cargoScrollTarget += deltaY * 0.35;
        this.cargoScrollTarget = Math.max(0, Math.min(this.cargoMaxScroll, this.cargoScrollTarget));
      }
    };
    if (pointerX >= leftW && pointerX < rightBoundary) {
      applyScroll('equipment');
    } else {
      applyScroll('cargo');
    }
  }

  public resetScroll(): void {
    this.cargoScrollOffset = 0;
    this.cargoScrollTarget = 0;
    this.equipmentScrollOffset = 0;
    this.equipmentScrollTarget = 0;
  }

  public pickRegionAtCursor(): InventoryPanelRegion | null {
    if (this.cursorPx == null || this.cursorPy == null) {
      return null;
    }
    return this.pickRegionAt(this.cursorPx, this.cursorPy);
  }

  public setSelection(selection: InventorySelection | null): void {
    this.selection = selection;
    if (this.enabled && this.snapshot) {
      this.paint();
      this.uploadTexture();
    }
  }

  public getSelection(): InventorySelection | null {
    return this.selection;
  }

  public update(snapshot: InventorySnapshot | null): void {
    if (!snapshot) {
      return;
    }
    this.snapshot = snapshot;
    const currentSelection = this.selection;
    if (currentSelection) {
      if (currentSelection.kind === 'personal' && currentSelection.index >= snapshot.personalGear.length) {
        this.selection = null;
      } else if (currentSelection.kind === 'cargo') {
        const stillExists = snapshot.cargo.some(entry => entry.id === currentSelection.entryId);
        if (!stillExists) {
          this.selection = null;
        }
      } else if (currentSelection.kind === 'equipment') {
        const stillEquipped = snapshot.equipment[currentSelection.slot];
        if (!stillEquipped) {
          this.selection = null;
        }
      }
    }
    this.cargoScrollOffset += (this.cargoScrollTarget - this.cargoScrollOffset) * 0.2;
    this.equipmentScrollOffset += (this.equipmentScrollTarget - this.equipmentScrollOffset) * 0.2;
    this.paint();
    this.uploadTexture();
  }

  public render(viewportW: number, viewportH: number): void {
    if (!this.enabled || !this.texture || !this.program || !this.vao) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const loc = gl.getUniformLocation(this.program, 'u_tex');
    gl.uniform1i(loc, 0);
    const prevDepth = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    if (prevDepth) gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  private initGLResources(): void {
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1
    ]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    const vsSrc = `#version 300 es\nprecision mediump float;\nlayout(location=0) in vec2 a_pos;\nlayout(location=1) in vec2 a_uv;\nout vec2 v_uv;\nvoid main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    const fsSrc = `#version 300 es\nprecision mediump float;\nuniform sampler2D u_tex;\nin vec2 v_uv;\nout vec4 frag;\nvoid main(){ frag = texture(u_tex, v_uv); }`;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    this.program = gl.createProgram();
    gl.attachShader(this.program!, vs);
    gl.attachShader(this.program!, fs);
    gl.linkProgram(this.program!);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const stride = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);
    gl.bindVertexArray(null);
  }

  private paint(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const c = this.ctx;
    const { width: W, height: H } = this.canvas;
    this.regions = [];

    c.save();
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#05060d');
    bg.addColorStop(1, '#0e1220');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    const leftW = Math.floor(W * 0.35);
    const centerW = Math.floor(W * 0.4);
    const rightW = W - leftW - centerW;
    const footerHeight = 90;
    const contentHeight = Math.max(0, H - footerHeight);

    this.drawCharacterColumn(c, 0, 0, leftW, contentHeight, snapshot);
    this.drawEquipmentColumn(c, leftW, 0, centerW, contentHeight, snapshot);
    this.drawCargoColumn(c, leftW + centerW, 0, rightW, contentHeight, snapshot);
    this.drawFooter(c, 0, contentHeight, W, footerHeight, snapshot);
    c.restore();
  }

  private drawCharacterColumn(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, snapshot: InventorySnapshot): void {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,255,255,0.03)';
    c.fillRect(0, 0, w, h);

    c.font = '600 30px "Segoe UI", sans-serif';
    c.fillStyle = '#f2f5ff';
    const nameY = this.scaleY(48);
    this.drawTallText(c, snapshot.character.name, 24, nameY);

    const healthY = nameY + this.scaleY(32);
    this.drawStatBar(c, 'Salud', snapshot.character.health, '#4ade80', 24, healthY, w - 48);
    const sanityY = healthY + this.scaleY(68);
    const sanityBottom = this.drawSanityGrid(c, snapshot.character.sanity, 24, sanityY, w - 48);

    c.font = '500 18px "Segoe UI", sans-serif';
    c.fillStyle = '#9aa4c4';
    const personalTitleY = sanityBottom + this.scaleY(48);
    this.drawTallText(c, 'Equipo Personal', 24, personalTitleY);

    const cardHeight = this.scaleY(75);
    const cardSpacing = this.scaleY(90);
    let offsetY = personalTitleY + this.scaleY(24);
    snapshot.personalGear.forEach((gear, index) => {
      const isSelected = this.selection?.kind === 'personal' && this.selection.index === index;
      this.drawGearCard(c, gear.slot, gear.label, gear.description, gear.rarity, 24, offsetY, w - 48, cardHeight, isSelected);
      this.registerRegion({
        kind: 'personal',
        index,
        slot: gear.slot,
        bounds: { x: x + 24, y: y + offsetY, w: w - 48, h: cardHeight }
      });
      offsetY += cardSpacing;
    });
    c.restore();
  }

  private drawEquipmentColumn(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, snapshot: InventorySnapshot): void {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,255,255,0.02)';
    c.fillRect(0, 0, w, h);

    c.font = '500 22px "Segoe UI", sans-serif';
    c.fillStyle = '#cdd5ff';
    this.drawTallText(c, 'Módulos de Nave', 24, 40);

    const order: EquipmentSlot[] = [
      EquipmentSlot.CORE,
      EquipmentSlot.REACTOR,
      EquipmentSlot.WINGS,
      EquipmentSlot.HULL,
      EquipmentSlot.SHIELD,
      EquipmentSlot.DRONE_BAY,
      EquipmentSlot.AUXILIARY
    ];
    const cardWidth = w - 48;
    const cardHeight = this.scaleY(150);
    const listY = this.scaleY(72);
    const availableHeight = h - listY - this.scaleY(24);
    const gap = this.scaleY(28);
    const totalHeight = order.length * (cardHeight + gap) - gap;
    this.equipmentMaxScroll = Math.max(0, totalHeight - availableHeight);
    this.equipmentScrollTarget = Math.max(0, Math.min(this.equipmentScrollTarget, this.equipmentMaxScroll));
    this.equipmentScrollOffset = Math.max(0, Math.min(this.equipmentScrollOffset, this.equipmentMaxScroll));

    c.save();
    c.beginPath();
    c.rect(24, listY, cardWidth, availableHeight);
    c.clip();
    let yOffset = listY - this.equipmentScrollOffset;
    for (const slot of order) {
      const isSelected = this.selection?.kind === 'equipment' && this.selection.slot === slot;
      this.drawEquipmentCard(c, slot, snapshot.equipment[slot], 24, yOffset, cardWidth, cardHeight, isSelected, snapshot);
      this.registerRegion({
        kind: 'equipment',
        slot,
        bounds: { x: x + 24, y: y + yOffset, w: cardWidth, h: cardHeight }
      });
      yOffset += cardHeight + gap;
    }
    c.restore();

    if (this.equipmentMaxScroll > 0) {
      const barHeight = Math.max(30, (availableHeight / totalHeight) * availableHeight);
      const barY = listY + (this.equipmentScrollOffset / this.equipmentMaxScroll) * (availableHeight - barHeight);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(w - 16, barY, 6, barHeight);
    }
    c.restore();
  }

  private drawCargoColumn(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, snapshot: InventorySnapshot): void {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(255,255,255,0.04)';
    c.fillRect(0, 0, w, h);

    c.font = '500 22px "Segoe UI", sans-serif';
    c.fillStyle = '#f4f9ff';
    this.drawTallText(c, 'Carga', 20, 40);

    const gaugeWidth = w - 40;
    const pct = snapshot.cargoCapacity.pct;
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 4;
    c.strokeRect(20, 54, gaugeWidth, 14);
    c.fillStyle = pct >= 90 ? '#f87171' : '#34d399';
    c.fillRect(20, 54, (gaugeWidth * Math.min(100, Math.max(0, pct))) / 100, 14);
    c.fillStyle = '#aab5d5';
    c.font = '500 14px "Segoe UI", sans-serif';
    this.drawTallText(c, `${snapshot.cargoCapacity.current} / ${snapshot.cargoCapacity.max} u`, 20, 88);

    const listY = 110;
    const availableHeight = h - listY - 20;
    const rowHeight = this.scaleY(60);
    const totalHeight = snapshot.cargo.length * (rowHeight + 10);
    this.cargoMaxScroll = Math.max(0, totalHeight - availableHeight);
    this.cargoScrollTarget = Math.max(0, Math.min(this.cargoScrollTarget, this.cargoMaxScroll));
    this.cargoScrollOffset = Math.max(0, Math.min(this.cargoScrollOffset, this.cargoMaxScroll));

    c.save();
    c.beginPath();
    c.rect(20, listY, w - 40, availableHeight);
    c.clip();

    let yOffset = listY - this.cargoScrollOffset;
    for (const entry of snapshot.cargo) {
      const isSelected = this.selection?.kind === 'cargo' && this.selection.entryId === entry.id;
      this.drawCargoRow(c, entry, 24, yOffset, w - 48, rowHeight, isSelected);
      this.registerRegion({
        kind: 'cargo',
        entryId: entry.id,
        bounds: { x: x + 24, y: y + yOffset, w: w - 48, h: rowHeight }
      });
      yOffset += rowHeight + 10;
    }
    c.restore();

    if (this.cargoMaxScroll > 0) {
      const barHeight = Math.max(30, (availableHeight / totalHeight) * availableHeight);
      const barY = listY + (this.cargoScrollOffset / this.cargoMaxScroll) * (availableHeight - barHeight);
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(w - 16, barY, 6, barHeight);
    }

    c.restore();
  }

  private drawStatBar(c: CanvasRenderingContext2D, label: string, value: number, color: string, x: number, y: number, width: number): void {
    c.save();
    c.font = '500 14px "Segoe UI", sans-serif';
    c.fillStyle = '#a7b5d8';
    this.drawTallText(c, label, x, y);
    const topGap = this.scaleY(12);
    const barHeight = this.scaleY(14);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fillRect(x, y + topGap, width, barHeight);
    c.fillStyle = color;
    c.fillRect(x, y + topGap, (width * Math.max(0, Math.min(100, value))) / 100, barHeight);
    c.fillStyle = '#dde5ff';
    this.drawTallText(c, `${Math.round(value)}%`, x + width - 54, y);
    c.restore();
  }

  private drawGearCard(
    c: CanvasRenderingContext2D,
    slot: PersonalGearSlot,
    label: string,
    description: string | undefined,
    rarity: RarityTier,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean = false
  ): void {
    c.save();
    c.globalAlpha = 0.9;
    c.fillStyle = this.rarityFill(rarity);
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x, y, 6, h);

    if (selected) {
      c.strokeStyle = '#f97316';
      c.lineWidth = 3;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    const baseHeight = 60;
    const scale = h / baseHeight;
    c.fillStyle = '#040713';
    c.font = '600 14px "Segoe UI", sans-serif';
    this.drawTallText(c, this.prettyPersonalSlot(slot), x + 12, y + 20 * scale);
    c.fillStyle = '#0f172a';
    c.font = '600 16px "Segoe UI", sans-serif';
    const labelY = y + 40 * scale;
    this.drawTallText(c, label, x + 12, labelY);
    if (description) {
      c.fillStyle = '#1f2937';
      c.font = '13px "Segoe UI", sans-serif';
      const descGap = this.scaleY(22);
      const maxDescY = y + h - this.scaleY(8);
      const descY = Math.min(labelY + descGap, maxDescY);
      this.drawTallText(c, description, x + 12, descY);
    }
    c.restore();
  }

  private drawEquipmentCard(
    c: CanvasRenderingContext2D,
    slot: EquipmentSlot,
    state: EquipmentSlotState | null,
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean = false,
    snapshot: InventorySnapshot
  ): void {
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.strokeRect(x, y, w, h);

    if (selected) {
      c.strokeStyle = '#f97316';
      c.lineWidth = 3;
      c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    }

    const baseHeight = 120;
    const scale = h / baseHeight;
    c.font = '600 14px "Segoe UI", sans-serif';
    c.fillStyle = '#8ea3d8';
    this.drawTallText(c, this.prettySlot(slot), x + 12, y + 20 * scale);

    const isUnavailable = this.unavailableSlots.has(slot);

    if (state) {
      c.fillStyle = '#fafbff';
      c.font = '600 18px "Segoe UI", sans-serif';
      this.drawTallText(c, state.label, x + 12, y + 46 * scale);
      let textY = y + 70 * scale;
      if (state.description) {
        c.fillStyle = '#9aa4c4';
        c.font = '14px "Segoe UI", sans-serif';
        this.drawTallText(c, state.description, x + 12, textY);
        textY += 20 * scale;
      }

      const capabilityLines: string[] = [];
      if (state.capabilities?.length) {
        capabilityLines.push(...state.capabilities);
      }
      capabilityLines.push(...this.getDynamicCapabilityLines(slot, snapshot));

      if (capabilityLines.length) {
        c.fillStyle = '#7c8bad';
        c.font = '12px "Segoe UI", sans-serif';
        capabilityLines.forEach(line => {
          this.drawTallText(c, `- ${line}`, x + 12, textY);
          textY += 16 * scale;
        });
      }
    } else {
      if (isUnavailable) {
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.font = '600 16px "Segoe UI", sans-serif';
        this.drawTallText(c, 'N/A', x + 12, y + 34 * scale);
        c.font = '500 13px "Segoe UI", sans-serif';
        c.fillStyle = 'rgba(148,163,184,0.8)';
        this.drawTallText(c, 'No integrado en este fuselaje', x + 12, y + 56 * scale);
      } else {
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.font = 'italic 15px "Segoe UI", sans-serif';
        this.drawTallText(c, 'Slot vacío', x + 12, y + 50 * scale);
      }
    }
    c.restore();
  }

  private drawSanityGrid(c: CanvasRenderingContext2D, sanity: number, x: number, y: number, width: number): number {
    c.save();
    c.font = '500 14px "Segoe UI", sans-serif';
    c.fillStyle = '#a7b5d8';
    this.drawTallText(c, 'Cordura', x, y);

    const frameY = y + this.scaleY(26);
    const frameH = this.scaleY(140);
    c.fillStyle = '#fbfdff';
    c.fillRect(x, frameY, width, frameH);
    c.strokeStyle = 'rgba(15,23,42,0.65)';
    c.lineWidth = 3;
    c.strokeRect(x, frameY, width, frameH);

    const rows = 5;
    const totalValues = 99;
    const cols = Math.ceil(totalValues / rows);
    const gap = 4;
    const horizontalPad = 12;
    const verticalPad = 8;
    const innerWidth = width - horizontalPad * 2;
    const innerHeight = frameH - verticalPad * 2;
    const cellWidth = (innerWidth - gap * (cols - 1)) / cols;
    const cellHeight = (innerHeight - gap * (rows - 1)) / rows;
    const clampedValue = Math.max(1, Math.min(99, Math.round(sanity)));

    c.font = '600 10px "Segoe UI", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#020617';

    for (let value = 1; value <= totalValues; value++) {
      const index = value - 1;
      const row = Math.floor(index / cols);
      const col = index % cols;
      const cellX = x + horizontalPad + col * (cellWidth + gap);
      const cellY = frameY + verticalPad + row * (cellHeight + gap);

      c.fillStyle = '#020617';
      this.drawTallText(c, `${value}`, cellX + cellWidth / 2, cellY + cellHeight / 2);

      if (value === clampedValue) {
        c.strokeStyle = '#0f0f10';
        c.lineWidth = 1.6;
        this.drawHandCircle(
          c,
          cellX + cellWidth / 2,
          cellY + cellHeight / 2,
          Math.min(cellWidth, cellHeight) * 0.9,
          sanity
        );
      }
    }

    const bottom = frameY + frameH;
    c.restore();
    return bottom;
  }

  private drawHandCircle(c: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number): void {
    c.save();
    c.beginPath();
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const wobble = Math.sin(angle * 3 + seed * 0.1) * radius * 0.12;
      const r = Math.max(2, radius * 0.85 + wobble);
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) {
        c.moveTo(px, py);
      } else {
        c.lineTo(px, py);
      }
    }
    c.closePath();
    c.stroke();
    c.restore();
  }

  private getDynamicCapabilityLines(slot: EquipmentSlot, snapshot: InventorySnapshot): string[] {
    const lines: string[] = [];
    const stats = snapshot.shipStats;

    if (slot === EquipmentSlot.REACTOR && stats) {
      lines.push(`Thrust: ${stats.acceleration.toFixed(1)} u/s`);
      lines.push(`Top speed: ${stats.topSpeed.toFixed(1)} u/s`);
    }

    if (slot === EquipmentSlot.HULL && stats) {
      lines.push(`Structure: ${stats.health.max}`);
      lines.push(`Cargo capacity: ${snapshot.cargoCapacity.max}`);
    }

    return lines;
  }

  private drawCargoRow(
    c: CanvasRenderingContext2D,
    entry: InventorySnapshot['cargo'][number],
    x: number,
    y: number,
    w: number,
    h: number,
    selected: boolean = false
  ): void {
    c.save();
    c.fillStyle = 'rgba(8,11,24,0.9)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.strokeRect(x, y, w, h);

    if (selected) {
      c.strokeStyle = '#f97316';
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    c.fillStyle = '#f7f9ff';
    c.font = '600 15px "Segoe UI", sans-serif';
    const baseHeight = 60;
    const scale = h / baseHeight;
    this.drawTallText(c, entry.label, x + 12, y + 24 * scale);
    c.fillStyle = '#9ba4c6';
    c.font = '13px "Segoe UI", sans-serif';
    this.drawTallText(c, `${entry.massTons.toFixed(0)} t · ${entry.units}u`, x + 12, y + 42 * scale);

    const chip = this.rarityAccent(entry.rarity);
    c.fillStyle = chip;
    c.fillRect(x + w - 90, y + 12 * scale, 70, 18 * scale);
    c.fillStyle = '#020617';
    c.font = '11px "Segoe UI", sans-serif';
    this.drawTallText(c, entry.rarity, x + w - 85, y + 25 * scale);
    c.restore();
  }

  private drawFooter(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    snapshot: InventorySnapshot
  ): void {
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(4,7,19,0.95)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.strokeRect(0, 0, w, h);

    c.fillStyle = '#9ba4c6';
    c.font = '500 16px "Segoe UI", sans-serif';
    this.drawTallText(c, 'Selección', 24, 30);
    c.fillStyle = '#f4f9ff';
    c.font = '600 22px "Segoe UI", sans-serif';
    this.drawTallText(c, this.describeSelection(snapshot), 24, 60);

    const buttonWidth = 240;
    const buttonHeight = 52;
    const buttonX = w - buttonWidth - 32;
    const buttonY = (h - buttonHeight) / 2;
    const enabled = !!this.selection;

    c.fillStyle = enabled ? '#f87171' : 'rgba(148,163,184,0.25)';
    c.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    c.strokeStyle = enabled ? '#fecaca' : 'rgba(255,255,255,0.15)';
    c.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

    c.fillStyle = enabled ? '#0f172a' : '#94a3b8';
    c.font = '600 18px "Segoe UI", sans-serif';
    this.drawTallText(c, 'Expulsar carga/equipo', buttonX + 16, buttonY + 32);

    this.registerRegion({
      kind: 'action',
      action: InventoryActionType.JETTISON,
      enabled,
      bounds: { x: x + buttonX, y: y + buttonY, w: buttonWidth, h: buttonHeight }
    });

    c.restore();
  }

  private describeSelection(snapshot: InventorySnapshot): string {
    const selection = this.selection;
    if (!selection) {
      return 'Selecciona un slot de carga o módulo.';
    }
    if (selection.kind === 'cargo') {
      const entry = snapshot.cargo.find(item => item.id === selection.entryId);
      return entry ? `Carga · ${entry.label}` : 'Carga desconocida';
    }
    if (selection.kind === 'equipment') {
      const state = snapshot.equipment[selection.slot];
      if (state) {
        return `${this.prettySlot(selection.slot)} · ${state.label}`;
      }
      const unavailable = this.unavailableSlots.has(selection.slot);
      return `${this.prettySlot(selection.slot)} · ${unavailable ? 'N/A' : 'Vacío'}`;
    }
    const gear = snapshot.personalGear[selection.index];
    if (gear) {
      return `${this.prettyPersonalSlot(gear.slot)} · ${gear.label}`;
    }
    return 'Selección no válida';
  }

  private registerRegion(region: InventoryPanelRegion): void {
    this.regions.push(region);
  }

  private pickRegionAt(x: number, y: number): InventoryPanelRegion | null {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const region = this.regions[i];
      if (this.pointInBounds(region.bounds, x, y)) {
        return region;
      }
    }
    return null;
  }

  private pointInBounds(bounds: InventoryRegionBounds, px: number, py: number): boolean {
    return px >= bounds.x && px <= bounds.x + bounds.w && py >= bounds.y && py <= bounds.y + bounds.h;
  }

  private rarityFill(rarity: RarityTier): string {
    switch (rarity) {
      case RarityTier.LEGENDARY: return '#fcd34d';
      case RarityTier.EPIC: return '#c084fc';
      case RarityTier.RARE: return '#60a5fa';
      case RarityTier.UNCOMMON: return '#34d399';
      default: return '#94a3b8';
    }
  }

  private rarityAccent(rarity: RarityTier): string {
    switch (rarity) {
      case RarityTier.LEGENDARY: return '#fbbf24';
      case RarityTier.EPIC: return '#a855f7';
      case RarityTier.RARE: return '#3b82f6';
      case RarityTier.UNCOMMON: return '#10b981';
      default: return '#94a3b8';
    }
  }

  private drawTallText(c: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    if (!text) return;
    if (Math.abs(this.textHeightScale - 1) < 0.001) {
      c.fillText(text, x, y);
      return;
    }
    c.save();
    c.scale(1, this.textHeightScale);
    c.fillText(text, x, y / this.textHeightScale);
    c.restore();
  }

  private scaleY(value: number): number {
    return value * this.verticalScale;
  }

  private prettyPersonalSlot(slot: PersonalGearSlot): string {
    switch (slot) {
      case PersonalGearSlot.SUIT: return 'Traje';
      case PersonalGearSlot.BOOTS: return 'Botas';
      case PersonalGearSlot.ACCESSORY: return 'Accesorio';
      default: return slot;
    }
  }

  private prettySlot(slot: EquipmentSlot): string {
    switch (slot) {
      case EquipmentSlot.CORE: return 'Núcleo / Cabina';
      case EquipmentSlot.REACTOR: return 'Thruster';
      case EquipmentSlot.WINGS: return 'Alas';
      case EquipmentSlot.HULL: return 'Fuselaje';
      case EquipmentSlot.SHIELD: return 'Escudos';
      case EquipmentSlot.DRONE_BAY: return 'Bahía de Drones';
      case EquipmentSlot.AUXILIARY: return 'Auxiliar';
      default: return slot;
    }
  }

  private uploadTexture(): void {
    const gl = this.gl;
    if (!this.texture) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
