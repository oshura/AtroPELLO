/**
 * Elemento HUD: Panel de Marquesina
 * Muestra mensajes rotativos con estilo retro-futurista
 * FASE 4: Elementos HUD individuales
 */
export class MarqueePanel {
  private messages: string[] = [];
  private currentMessageIndex: number = 0;
  private scrollPosition: number = 0;
  private scrollSpeed: number = 1.5; // pixels por frame (un poco más rápido)
  private panelWidth: number = 450; // 1.5x anchura (300 * 1.5)
  private panelHeight: number = 80;  // 2x altura (40 * 2)
  private messageSpacing: number = 100; // Espacio entre mensajes
  
  // Colores del panel
  private readonly backgroundColor = '#0a3d0a'; // Verde oscuro
  private readonly textColor = '#00ff41';       // Verde fosforito
  private readonly borderColor = '#8b4513';     // Marrón
  
  constructor() {
    // Mensajes por defecto (después se cargarán desde donde me digas)
    this.messages = [
      'SISTEMA DE NAVEGACIÓN ACTIVO',
      'VELOCIDAD CRUCERO ALCANZADA', 
      'BIENVENIDO AL CENTRO DE COMANDO',
      'TODOS LOS SISTEMAS OPERATIVOS',
      'RUMBO ESTABLECIDO - MANTENER CURSO',
      'ENERGÍA AL 100% - SISTEMAS OK'
    ];
  }

  public update(): void {
    if (this.messages.length === 0) return;
    
    // Scroll continuo sin pausas
    this.scrollPosition += this.scrollSpeed;
    
    // Calcular cuando pasar al siguiente mensaje
    const currentMessage = this.messages[this.currentMessageIndex] || '';
    const messageWidth = currentMessage.length * 16; // Estimado de ancho del texto
    
    // Si el mensaje actual salió completamente, pasar al siguiente
    if (this.scrollPosition > messageWidth + this.messageSpacing) {
      this.currentMessageIndex = (this.currentMessageIndex + 1) % this.messages.length;
      this.scrollPosition = 0;
    }
  }

  public render(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.messages.length === 0) return;
    
    // Configurar contexto
    ctx.save();
    
    // Dibujar fondo del panel
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(x, y, this.panelWidth, this.panelHeight);
    
    // Dibujar borde
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 3; // Borde más grueso para panel más grande
    ctx.strokeRect(x, y, this.panelWidth, this.panelHeight);
    
    // Crear área de clipping para el texto
    ctx.beginPath();
    ctx.rect(x + 6, y + 6, this.panelWidth - 12, this.panelHeight - 12);
    ctx.clip();
    
    // Configurar texto más grande
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 24px "Courier New", monospace'; // Texto más grande para panel más grande
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Efecto de brillo (sombra verde)
    ctx.shadowColor = this.textColor;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Dibujar mensaje actual
    const currentMessage = this.messages[this.currentMessageIndex] || '';
    const textY = y + this.panelHeight / 2;
    const currentTextX = x + 15 - this.scrollPosition;
    
    ctx.fillText(currentMessage, currentTextX, textY);
    
    // Dibujar próximo mensaje si es necesario (flujo continuo)
    const messageWidth = currentMessage.length * 16;
    if (this.scrollPosition > 50) { // Empezar a mostrar el siguiente temprano
      const nextIndex = (this.currentMessageIndex + 1) % this.messages.length;
      const nextMessage = this.messages[nextIndex] || '';
      
      // CORREGIDO: El siguiente mensaje entra desde la derecha
      // Calculamos donde debe estar basado en la posición actual del mensaje anterior
      const nextStartPosition = messageWidth + this.messageSpacing;
      const nextTextX = x + 15 + (nextStartPosition - this.scrollPosition);
      
      ctx.fillText(nextMessage, nextTextX, textY);
    }
    
    ctx.restore();
  }

  // Métodos para gestionar mensajes
  public setMessages(messages: string[]): void {
    this.messages = [...messages];
    this.currentMessageIndex = 0;
    this.scrollPosition = 0;
  }

  public addMessage(message: string): void {
    this.messages.push(message);
  }

  public clearMessages(): void {
    this.messages = [];
    this.currentMessageIndex = 0;
    this.scrollPosition = 0;
  }

  public getCurrentMessage(): string {
    return this.messages[this.currentMessageIndex] || '';
  }

  public setPanelSize(width: number, height: number): void {
    this.panelWidth = width;
    this.panelHeight = height;
  }

  public setScrollSpeed(speed: number): void {
    this.scrollSpeed = Math.max(0.1, Math.min(5, speed));
  }

}