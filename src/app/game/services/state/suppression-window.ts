/**
 * Ventana de supresión basada en timestamp: se "extiende" hasta `now + windowMs` (quedándose con el máximo)
 * y está activa mientras `now < until`. La usan la supresión de amenaza de aterrizaje y la gracia de colisión
 * atmosférica — mismo patrón, antes duplicado en GameEngine. Value-object PURO (recibe `nowMs`, sin host ni
 * estado externo) → trivialmente testeable y reutilizable. docs/ARQUITECTURA.md Fase 5.2 (sub-rebanada 5).
 */
export class SuppressionWindow {
  private untilMs = 0;

  /** Extiende la ventana hasta `nowMs + windowMs` (sólo si alarga la actual). */
  extend(nowMs: number, windowMs: number): void {
    const duration = Math.max(0, windowMs);
    if (duration <= 0) {
      return;
    }
    const target = nowMs + duration;
    if (target > this.untilMs) {
      this.untilMs = target;
    }
  }

  isActive(nowMs: number): boolean {
    return nowMs < this.untilMs;
  }

  reset(): void {
    this.untilMs = 0;
  }
}
