/**
 * Elemento HUD: Panel de Marquesina
 * Muestra mensajes rotativos con estilo retro-futurista
 * FASE 4: Elementos HUD individuales
 */
export class MarqueePanel {
  private messages: string[] = [];
  private currentMessageIndex: number = 0;
  private scrollPosition: number = 0;
  private scrollSpeed: number = 1; // pixels por frame
  private messageChangeInterval: number = 3000; // ms
  private lastMessageChange: number = 0;
  private panelWidth: number = 300;
  private panelHeight: number = 40;
  
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
    
    this.lastMessageChange = Date.now();
  }

  public update(): void {
    const currentTime = Date.now();
    
    // Actualizar scroll horizontal
    this.scrollPosition += this.scrollSpeed;
    
    // Cambiar mensaje cada cierto tiempo
    if (currentTime - this.lastMessageChange > this.messageChangeInterval) {
      this.currentMessageIndex = (this.currentMessageIndex + 1) % this.messages.length;
      this.scrollPosition = 0; // Reiniciar scroll
      this.lastMessageChange = currentTime;
    }
    
    // Reiniciar scroll si se sale del panel
    const currentMessage = this.messages[this.currentMessageIndex] || '';
    if (this.scrollPosition > currentMessage.length * 12 + this.panelWidth) {
      this.scrollPosition = -this.panelWidth;
    }
  }

  public render(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Configurar contexto
    ctx.save();
    
    // Dibujar fondo del panel
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(x, y, this.panelWidth, this.panelHeight);
    
    // Dibujar borde
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, this.panelWidth, this.panelHeight);
    
    // Crear área de clipping para el texto
    ctx.beginPath();
    ctx.rect(x + 4, y + 4, this.panelWidth - 8, this.panelHeight - 8);
    ctx.clip();
    
    // Configurar texto
    ctx.fillStyle = this.textColor;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Efecto de brillo (sombra verde)
    ctx.shadowColor = this.textColor;
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Dibujar texto con scroll
    const currentMessage = this.messages[this.currentMessageIndex] || '';
    const textY = y + this.panelHeight / 2;
    const textX = x + 10 - this.scrollPosition;
    
    ctx.fillText(currentMessage, textX, textY);
    
    // Si el texto está saliendo por la izquierda, dibujarlo también por la derecha
    if (this.scrollPosition > 50) {
      ctx.fillText(currentMessage, textX + currentMessage.length * 12 + 50, textY);
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

  public setMessageInterval(intervalMs: number): void {
    this.messageChangeInterval = Math.max(1000, intervalMs);
  }
}