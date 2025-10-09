/**
 * Administra el sistema de texturas dinámicas para el HUD
 * Utiliza Canvas 2D para dibujar y WebGL para renderizar
 * FASE 3: Sistema de texturas dinámicas
 */
export class HUDTexture {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private webglTexture: WebGLTexture;
  
  constructor(gl: WebGL2RenderingContext, width: number = 1024, height: number = 768) {
    this.gl = gl;
    
    // Crear canvas para dibujo 2D
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Crear textura WebGL
    this.webglTexture = this.createWebGLTexture();
    
    console.log('🎨 HUDTexture inicializada:', { width, height });
  }

  /**
   * Crea la textura WebGL inicial
   */
  private createWebGLTexture(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error('No se pudo crear la textura WebGL');
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    
    // Configuración de la textura
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    
    // Inicializar con datos vacíos
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 
      0, 
      this.gl.RGBA, 
      this.canvas.width, 
      this.canvas.height, 
      0, 
      this.gl.RGBA, 
      this.gl.UNSIGNED_BYTE, 
      null
    );

    return texture;
  }

  /**
   * Actualiza la textura WebGL con el contenido actual del canvas
   */
  public updateTexture(): void {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.webglTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 
      0, 
      this.gl.RGBA, 
      this.gl.RGBA, 
      this.gl.UNSIGNED_BYTE, 
      this.canvas
    );
  }

  /**
   * Obtiene el canvas para dibujo 2D
   */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Obtiene la textura WebGL
   */
  public getWebGLTexture(): WebGLTexture {
    return this.webglTexture;
  }

  /**
   * Obtiene las dimensiones del canvas
   */
  public getDimensions(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    };
  }

  /**
   * Redimensiona el canvas y la textura
   */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    
    // Recrear textura con nuevo tamaño
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.webglTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 
      0, 
      this.gl.RGBA, 
      width, 
      height, 
      0, 
      this.gl.RGBA, 
      this.gl.UNSIGNED_BYTE, 
      null
    );
    
    console.log('📐 HUDTexture redimensionada:', { width, height });
  }

  /**
   * Limpia recursos WebGL
   */
  public dispose(): void {
    if (this.webglTexture) {
      this.gl.deleteTexture(this.webglTexture);
    }
  }
}