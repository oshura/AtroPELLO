interface MarqueeRenderable {
  id: string;
  text: string;
}

/**
 * Elemento HUD: Panel de Marquesina
 * Muestra mensajes rotativos con estilo retro-futurista
 * FASE 4: Elementos HUD individuales
 */
export class MarqueePanel {
  private messages: MarqueeRenderable[] = [];
  private currentMessageIndex: number = 0;
  private scrollPosition: number = 0;
  private readonly defaultDeltaMs = 16.67;
  private scrollSpeedPxPerSec: number = 90; // equivalente a 1.5 px/frame @60fps
  private maxAdvancePerStep = 6; // limita saltos por frame para FPS bajos
  private panelWidth: number = 450; // 1.5x anchura (300 * 1.5)
  private panelHeight: number = 80;  // 2x altura (40 * 2)
  private messageSpacing: number = 100; // Espacio entre mensajes
  private lowFpsCompensationEnabled = true;
  private debugCompensationLogs = false;
  
  // Colores del panel
  private readonly backgroundColor = '#0a3d0a'; // Verde oscuro
  private readonly textColor = '#00ff41';       // Verde fosforito
  private readonly borderColor = '#8b4513';     // Marrón
  private readonly activeBackgroundColor = '#105d1b';
  private readonly activeBorderColor = '#d97706';
  private readonly panelGlowColor = 'rgba(0, 255, 65, 0.55)';
  private readonly activeGradientTop = 'rgba(0, 255, 65, 0.28)';
  private readonly activeGradientBottom = 'rgba(0, 16, 0, 0.8)';
  private readonly textStretchFactorY = 1.35;
  
  public update(deltaMs: number = this.defaultDeltaMs): string[] {
    const completed: string[] = [];
    if (!this.messages.length) {
      this.scrollPosition = 0;
      this.currentMessageIndex = 0;
      return completed;
    }

    const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : this.defaultDeltaMs;
    const pixelsToAdvance = this.scrollSpeedPxPerSec * (safeDelta / 1000);
    let remaining = pixelsToAdvance;

    const usedCompensation = this.lowFpsCompensationEnabled && pixelsToAdvance > this.maxAdvancePerStep;
    while (remaining > 0 && this.messages.length) {
      const step = this.lowFpsCompensationEnabled
        ? Math.min(remaining, this.maxAdvancePerStep)
        : remaining;
      this.advanceScroll(step, completed);
      if (!this.lowFpsCompensationEnabled) {
        break;
      }
      remaining -= step;
    }

    if (usedCompensation && this.debugCompensationLogs && typeof console !== 'undefined') {
      console.debug('[MarqueePanel] Low-FPS compensation applied', {
        deltaMs: Number(safeDelta.toFixed(2)),
        steps: Math.ceil(pixelsToAdvance / this.maxAdvancePerStep),
      });
    }

    return completed;
  }

  private advanceScroll(step: number, completed: string[]): void {
    if (!this.messages.length || step <= 0) {
      return;
    }
    this.scrollPosition += step;
    let current = this.messages[this.currentMessageIndex];
    if (!current) {
      this.scrollPosition = 0;
      this.currentMessageIndex = 0;
      return;
    }

    let cycleLength = this.computeCycleLength(current.text);
    while (this.scrollPosition >= cycleLength && this.messages.length) {
      this.scrollPosition -= cycleLength;
      completed.push(current.id);
      if (!this.messages.length) {
        break;
      }
      this.currentMessageIndex = this.messages.length
        ? (this.currentMessageIndex + 1) % this.messages.length
        : 0;
      current = this.messages[this.currentMessageIndex];
      if (!current) {
        this.scrollPosition = 0;
        this.currentMessageIndex = 0;
        return;
      }
      cycleLength = this.computeCycleLength(current.text);
    }
  }

  public render(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Configurar contexto
    ctx.save();
    
    const hasMessages = this.messages.length > 0;
    const baseBackground = hasMessages ? this.activeBackgroundColor : this.backgroundColor;

    // Dibujar fondo del panel
    ctx.fillStyle = baseBackground;
    ctx.fillRect(x, y, this.panelWidth, this.panelHeight);

    if (hasMessages) {
      const glowGradient = ctx.createLinearGradient(x, y, x, y + this.panelHeight);
      glowGradient.addColorStop(0, this.activeGradientTop);
      glowGradient.addColorStop(0.45, 'rgba(0, 64, 0, 0.08)');
      glowGradient.addColorStop(1, this.activeGradientBottom);
      ctx.fillStyle = glowGradient;
      ctx.fillRect(x, y, this.panelWidth, this.panelHeight);
    }

    // Dibujar borde
    ctx.strokeStyle = hasMessages ? this.activeBorderColor : this.borderColor;
    ctx.lineWidth = hasMessages ? 4 : 3; // Borde más grueso cuando está activo
    ctx.strokeRect(x + 0.5, y + 0.5, this.panelWidth - 1, this.panelHeight - 1);

    if (hasMessages) {
      ctx.save();
      ctx.strokeStyle = this.activeBorderColor;
      ctx.lineWidth = 2;
      ctx.shadowColor = this.panelGlowColor;
      ctx.shadowBlur = 18;
      ctx.strokeRect(x + 2, y + 2, this.panelWidth - 4, this.panelHeight - 4);
      ctx.restore();
    }
    
    // Crear área de clipping para el texto
    ctx.beginPath();
    ctx.rect(x + 6, y + 6, this.panelWidth - 12, this.panelHeight - 12);
    ctx.clip();

    const textY = y + this.panelHeight / 2;

    // Configurar estilo base
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = hasMessages ? 'rgba(0, 255, 65, 0.95)' : this.textColor;
    ctx.shadowBlur = hasMessages ? 10 : 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (!hasMessages) {
      // Keep panel visible while leaving the text area empty if no events are queued
      ctx.restore();
      return;
    }
    
    ctx.textAlign = 'left';
    const currentMessage = this.messages[this.currentMessageIndex]?.text || '';
    const currentTextX = x + 15 - this.scrollPosition;
    this.drawStretchedText(ctx, currentMessage, currentTextX, textY);
    
    // Dibujar próximo mensaje si es necesario (flujo continuo)
    const messageWidth = this.estimateMessageWidth(currentMessage);
    if (this.scrollPosition > 50 && this.messages.length > 1) {
      const nextIndex = (this.currentMessageIndex + 1) % this.messages.length;
      const nextMessage = this.messages[nextIndex]?.text || '';
      const nextStartPosition = messageWidth + this.messageSpacing;
      const nextTextX = x + 15 + (nextStartPosition - this.scrollPosition);
      this.drawStretchedText(ctx, nextMessage, nextTextX, textY);
    }
    
    ctx.restore();
  }

  // Métodos para gestionar mensajes
  public setMessages(messages: MarqueeRenderable[], preserveState: boolean = true): void {
    const snapshotId = preserveState && this.messages.length
      ? this.messages[Math.min(this.currentMessageIndex, this.messages.length - 1)]?.id
      : null;
    const snapshotScroll = preserveState ? this.scrollPosition : 0;
    this.messages = [...messages];
    if (!preserveState || !snapshotId) {
      this.currentMessageIndex = 0;
      this.scrollPosition = 0;
      return;
    }
    const nextIndex = this.messages.findIndex(msg => msg.id === snapshotId);
    if (nextIndex === -1) {
      this.currentMessageIndex = 0;
      this.scrollPosition = 0;
      return;
    }
    this.currentMessageIndex = nextIndex;
    const cycleLength = this.computeCycleLength(this.messages[this.currentMessageIndex]?.text || '');
    this.scrollPosition = Math.min(snapshotScroll, Math.max(0, cycleLength - 1));
  }

  public addMessage(message: MarqueeRenderable): void {
    this.messages.push(message);
  }

  public clearMessages(): void {
    this.messages = [];
    this.currentMessageIndex = 0;
    this.scrollPosition = 0;
  }

  public getCurrentMessage(): string {
    return this.messages[this.currentMessageIndex]?.text || '';
  }

  public setPanelSize(width: number, height: number): void {
    this.panelWidth = width;
    this.panelHeight = height;
  }

  public setScrollSpeed(speed: number): void {
    const perFrame = Math.max(0.1, Math.min(5, speed));
    this.scrollSpeedPxPerSec = perFrame * 60;
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.panelWidth, height: this.panelHeight };
  }

  public setLowFpsCompensation(enabled: boolean): void {
    this.lowFpsCompensationEnabled = enabled;
  }

  public enableCompensationDebug(enabled: boolean): void {
    this.debugCompensationLogs = enabled;
  }

  private computeCycleLength(message: string): number {
    return this.estimateMessageWidth(message) + this.messageSpacing;
  }

  private estimateMessageWidth(message: string): number {
    return Math.max(0, message.length * 16);
  }

  private drawStretchedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    textX: number,
    textY: number
  ): void {
    ctx.save();
    ctx.translate(textX, textY);
    ctx.scale(1, this.textStretchFactorY);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

}