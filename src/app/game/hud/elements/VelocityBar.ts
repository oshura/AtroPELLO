/**
 * Elemento HUD: Barra de velocidad vertical
 * Muestra la velocidad actual como barra progresiva
 * FASE 4: Elementos HUD individuales
 */
export class VelocityBar {
  private side: 'left' | 'right';
  private velocity: number = 0;         // Velocidad actual (puede superar maxVelocity si hay boosts)
  private maxVelocity: number = 8;      // Límite visual actual (cap dinámico)
  private baseMaxVelocity: number = 8;  // Límite base (pre‑boost/rito) para calcular capas 100→200→300...
  private externalHeight: number | null = null;
  
  constructor(side: 'left' | 'right') {
    this.side = side;
  }

  public update(velocity: number): void {
    // Guardar velocidad real (sin clamp) para permitir capas > 100%
    this.velocity = Math.max(0, velocity);
  }

  /**
   * Ajusta el valor máximo representado por la barra (p. ej., maxSpeed de la nave)
   */
  public setMaxVelocity(max: number): void {
    // Evitar valores no válidos; mantener al menos 1 para evitar divisiones por cero
    this.maxVelocity = Math.max(1, max);
    // Si no se ha fijado el base, asumir el mismo
    if (!isFinite(this.baseMaxVelocity) || this.baseMaxVelocity <= 0) {
      this.baseMaxVelocity = this.maxVelocity;
    }
  }

  /** Establece el máximo base (pre‑doble/boost) para calcular las capas por encima de 100% */
  public setBaseMaxVelocity(maxBase: number): void {
    this.baseMaxVelocity = Math.max(1, maxBase);
  }

  public render(ctx: CanvasRenderingContext2D, position: { x: number; y: number }): void {
    const barWidth = 20;
    const barHeight = this.externalHeight ?? 200;

    // Marco y fondo
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    ctx.strokeRect(position.x, position.y, barWidth, barHeight);

    // Calcular porcentaje extendido respecto al máximo base
    const base = Math.max(1, this.baseMaxVelocity);
    const totalPercent = Math.max(0, (this.velocity / base) * 100); // 0..N*100
    const fullLayers = Math.floor(totalPercent / 100);
    const remainder = totalPercent - fullLayers * 100; // 0..<100

    // Función helper para dibujar una capa con gradiente y opacidad
    const drawLayer = (percent: number, isBase: boolean, layerIndex: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      if (clamped <= 0) return;
      const h = (clamped / 100) * barHeight;
      const y = position.y + barHeight - h;
      // Relleno: base totalmente verde (como estaba), overlays "fosforitas"
      let fillStyle: string | CanvasGradient = '#00FF0080';
      if (!isBase) {
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        // Capas superpuestas: más “fosforitas”
        grad.addColorStop(0, '#00FFC0');
        grad.addColorStop(0.5, '#66FFE8');
        grad.addColorStop(1, '#FFFFFF');
        fillStyle = grad;
      }
      // Opacidad ligera para sumar densidad visual por superposición
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = isBase ? 1.0 : Math.max(0.5, 0.85 - layerIndex * 0.1);
      ctx.fillStyle = fillStyle;
      ctx.fillRect(position.x + 1, y, barWidth - 2, h);
      ctx.globalAlpha = prevAlpha;
    };

    // Capa base (0..100%)
    drawLayer(Math.min(100, totalPercent), true, 0);
    // Capas adicionales completas
    for (let i = 1; i <= fullLayers - 1; i++) {
      drawLayer(100, false, i);
    }
    // Última capa parcial si hay resto y al menos ya superamos 100%
    if (fullLayers >= 1 && remainder > 0) {
      drawLayer(remainder, false, fullLayers);
    }
    
    this.drawScaleMarkers(ctx, position, barWidth, barHeight);
    this.drawValueText(ctx, position, barWidth, barHeight);
  }

  private drawScaleMarkers(ctx: CanvasRenderingContext2D, position: { x: number; y: number }, width: number, height: number): void {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const y = position.y + height - (i * height / 4);
      const markWidth = (i % 2 === 0) ? width * 0.6 : width * 0.3;
      
      ctx.beginPath();
      if (this.side === 'left') {
        ctx.moveTo(position.x + width, y);
        ctx.lineTo(position.x + width - markWidth, y);
      } else {
        ctx.moveTo(position.x, y);
        ctx.lineTo(position.x + markWidth, y);
      }
      ctx.stroke();
    }
  }

  private drawValueText(ctx: CanvasRenderingContext2D, position: { x: number; y: number }, width: number, height: number): void {
    ctx.fillStyle = '#00FF00';
    ctx.font = '20px monospace';
    // Centrar el valor justo debajo de la barra, sin desplazamiento lateral
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const textX = position.x + width / 2;
    const textY = position.y + height + 8;
    
  ctx.fillText(Math.round(this.velocity).toString(), textX, textY);
  }

  public getDebugInfo(): any {
    return {
      type: 'VelocityBar',
      side: this.side,
      velocity: this.velocity,
      maxVelocity: this.maxVelocity,
      percentage: (this.velocity / this.maxVelocity) * 100
    };
  }

  /** Permite forzar la altura de la barra desde el layout externo. Devuelve la altura efectiva. */
  public setExternalHeight(h: number): number {
    this.externalHeight = Math.max(20, Math.floor(h));
    return this.externalHeight;
  }
}