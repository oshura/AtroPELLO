/**
 * Gestor de texturas para el juego
 */
export class TextureManager {
  private gl: WebGL2RenderingContext;
  private textures: Map<string, WebGLTexture> = new Map();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Crea una textura metálica procedural
   */
  public createMetallicTexture(): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    
    if (!texture) {
      console.error('❌ Failed to create metallic texture');
      return null;
    }

    // Crear datos de textura metálica procedural (64x64)
    const size = 64;
    const data = new Uint8Array(size * size * 4); // RGBA

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        
        // Patrón metálico con ruido
        const noise1 = Math.sin(x * 0.2) * Math.cos(y * 0.15);
        const noise2 = Math.sin(x * 0.1 + y * 0.08) * 0.5;
        const noise3 = Math.random() * 0.3 - 0.15;
        
        const metallic = 0.6 + noise1 * 0.2 + noise2 * 0.15 + noise3;
        
        // Colores metálicos plateados/grises
        const baseColor = Math.floor(metallic * 255);
        const variation = Math.floor(Math.random() * 30 - 15);
        
        data[index] = Math.max(0, Math.min(255, baseColor + variation));     // R
        data[index + 1] = Math.max(0, Math.min(255, baseColor + variation)); // G  
        data[index + 2] = Math.max(0, Math.min(255, baseColor + variation)); // B
        data[index + 3] = 255; // A
      }
    }

    // Configurar textura
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    
    // Configurar filtros
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    
    // Generar mipmaps
    gl.generateMipmap(gl.TEXTURE_2D);

    this.textures.set('metallic', texture);
    console.log('✅ Metallic texture created');
    
    return texture;
  }

  /**
   * Crea una textura de gradiente para diferencias de iluminación
   */
  public createGradientTexture(): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    
    if (!texture) {
      console.error('❌ Failed to create gradient texture');
      return null;
    }

    // Crear gradiente vertical (más oscuro en la parte inferior)
    const width = 32;
    const height = 32;
    const data = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        
        // Gradiente de arriba (claro) a abajo (oscuro)
        const gradient = 1.0 - (y / (height - 1)); // 1.0 en la parte superior, 0.0 en la inferior
        const intensity = 0.3 + gradient * 0.7; // Rango de 0.3 a 1.0
        
        const color = Math.floor(intensity * 255);
        
        data[index] = color;     // R
        data[index + 1] = color; // G
        data[index + 2] = color; // B
        data[index + 3] = 255;   // A
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    this.textures.set('gradient', texture);
    console.log('✅ Gradient texture created');
    
    return texture;
  }

  /**
   * Obtiene una textura por nombre
   */
  public getTexture(name: string): WebGLTexture | null {
    return this.textures.get(name) || null;
  }

  /**
   * Limpia todas las texturas
   */
  public cleanup(): void {
    this.textures.forEach(texture => {
      this.gl.deleteTexture(texture);
    });
    this.textures.clear();
  }
}