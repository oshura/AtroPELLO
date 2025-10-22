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
    console.log('📸 Actualizando textura WebGL desde Canvas...');
    
    // Verificar que el canvas tiene contenido
    const ctx = this.canvas.getContext('2d')!;
    const testData = ctx.getImageData(0, 0, 1, 1);
    console.log('🎨 Canvas pixel test:', [testData.data[0], testData.data[1], testData.data[2], testData.data[3]]);
    
    // Enlazar textura y actualizar
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.webglTexture);
    
    // Verificar que la textura está enlazada
    const boundTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
    console.log('🔗 Textura enlazada para actualización:', {
      expected: this.webglTexture,
      actual: boundTexture,
      matches: boundTexture === this.webglTexture
    });
    
    // Actualizar textura con datos del canvas
    // Asegurar orientación correcta del HUD (top-left canvas → top-left en pantalla)
    const prevFlip = this.gl.getParameter(this.gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D, 
      0, 
      this.gl.RGBA, 
      this.gl.RGBA, 
      this.gl.UNSIGNED_BYTE, 
      this.canvas
    );
    // Restaurar estado previo de pixelStore
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, prevFlip ? 1 : 0);
    
    // Verificar errores
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) {
      console.error('❌ Error al actualizar textura:', error);
    } else {
      console.log('✅ Textura WebGL actualizada correctamente');
    }
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