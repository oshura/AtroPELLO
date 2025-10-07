import { WebGLService } from '../services/webgl.service';

/**
 * Shader programs para renderizado 3D
 */
export class ShaderManager {
  private gl: WebGL2RenderingContext | null = null;
  
  // Programas de shader
  public basicProgram: WebGLProgram | null = null;
  public litProgram: WebGLProgram | null = null;
  public texturedProgram: WebGLProgram | null = null;
  
  // Ubicaciones de uniformes para el programa básico
  public basicUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa con iluminación
  public litUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de uniformes para el programa texturizado
  public texturedUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  
  // Ubicaciones de atributos
  public basicAttributes: { [key: string]: number } = {};
  public litAttributes: { [key: string]: number } = {};
  public texturedAttributes: { [key: string]: number } = {};

  constructor(private webglService: WebGLService) {
    const context = webglService.getContext();
    this.gl = context as WebGL2RenderingContext | null;
    if (this.gl) {
      this.initializeShaders();
    }
  }

  /**
   * Inicializa todos los programas de shader
   */
  private initializeShaders(): void {
    if (!this.gl) return;

    // Crear programa básico (sin iluminación)
    this.basicProgram = this.createProgram(
      this.getBasicVertexShader(),
      this.getBasicFragmentShader()
    );

    // Crear programa con iluminación
    this.litProgram = this.createProgram(
      this.getLitVertexShader(),
      this.getLitFragmentShader()
    );

    // Crear programa texturizado
    this.texturedProgram = this.createProgram(
      this.getTexturedVertexShader(),
      this.getTexturedFragmentShader()
    );

    // Obtener ubicaciones de uniformes y atributos
    if (this.basicProgram) {
      this.getBasicProgramLocations();
    }
    
    if (this.litProgram) {
      this.getLitProgramLocations();
    }

    if (this.texturedProgram) {
      this.getTexturedProgramLocations();
    }
  }

  /**
   * Vertex shader básico
   */
  private getBasicVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_color;

    // Uniformes
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    // Salidas al fragment shader
    out vec3 v_color;

    void main() {
      // Transformar posición
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Pasar color al fragment shader
      v_color = a_color;
    }`;
  }

  /**
   * Fragment shader básico
   */
  private getBasicFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec3 v_color;

    // Salida
    out vec4 fragColor;

    void main() {
      fragColor = vec4(v_color, 1.0);
    }`;
  }

  /**
   * Vertex shader con iluminación
   */
  private getLitVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_normal;
    in vec3 a_color;

    // Uniformes de transformación
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_normalMatrix;

    // Uniformes de iluminación
    uniform vec3 u_lightDirection;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;

    // Salidas al fragment shader
    out vec3 v_color;
    out vec3 v_normal;
    out vec3 v_lightDirection;
    out float v_lightIntensity;

    void main() {
      // Transformar posición
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Transformar normal
      vec3 worldNormal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);

      // Calcular iluminación básica
      float lightDot = max(dot(worldNormal, -u_lightDirection), 0.0);
      v_lightIntensity = lightDot;

      // Pasar datos al fragment shader
      v_color = a_color;
      v_normal = worldNormal;
      v_lightDirection = u_lightDirection;
    }`;
  }

  /**
   * Fragment shader con iluminación
   */
  private getLitFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec3 v_color;
    in vec3 v_normal;
    in vec3 v_lightDirection;
    in float v_lightIntensity;

    // Uniformes
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform float u_ambientStrength;
    uniform vec3 u_baseColor;

    // Salida
    out vec4 fragColor;

    void main() {
      // Componente ambiental
      vec3 ambient = u_ambientStrength * u_ambientColor;

      // Componente difusa
      vec3 diffuse = v_lightIntensity * u_lightColor;

      // Usar u_baseColor como color base (se establece por uniform)
      vec3 baseColor = u_baseColor;
      
      // Color final
      vec3 finalColor = baseColor * (ambient + diffuse);
      
      // Asegurar que el color no sea demasiado oscuro
      finalColor = max(finalColor, baseColor * 0.2);
      
      fragColor = vec4(finalColor, 1.0);
    }`;
  }

  /**
   * Vertex shader texturizado con iluminación
   */
  private getTexturedVertexShader(): string {
    return `#version 300 es
    precision highp float;

    // Atributos de entrada
    in vec3 a_position;
    in vec3 a_normal;
    in vec2 a_uv;

    // Uniformes de transformación
    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform mat4 u_normalMatrix;

    // Uniformes de iluminación
    uniform vec3 u_lightDirection;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform vec3 u_baseColor;

    // Salidas al fragment shader
    out vec2 v_uv;
    out vec3 v_normal;
    out vec3 v_worldPos;
    out float v_lightIntensity;

    void main() {
      // Transformar posición
      vec4 worldPosition = u_modelMatrix * vec4(a_position, 1.0);
      vec4 viewPosition = u_viewMatrix * worldPosition;
      gl_Position = u_projectionMatrix * viewPosition;

      // Transformar normal
      vec3 worldNormal = normalize((u_normalMatrix * vec4(a_normal, 0.0)).xyz);

      // Calcular iluminación básica
      float lightDot = max(dot(worldNormal, -u_lightDirection), 0.0);
      v_lightIntensity = lightDot;

      // Pasar datos al fragment shader
      v_uv = a_uv;
      v_normal = worldNormal;
      v_worldPos = worldPosition.xyz;
    }`;
  }

  /**
   * Fragment shader texturizado con iluminación y gradiente vertical
   */
  private getTexturedFragmentShader(): string {
    return `#version 300 es
    precision highp float;

    // Entradas del vertex shader
    in vec2 v_uv;
    in vec3 v_normal;
    in vec3 v_worldPos;
    in float v_lightIntensity;

    // Uniformes
    uniform sampler2D u_metallicTexture;
    uniform sampler2D u_gradientTexture;
    uniform vec3 u_lightColor;
    uniform vec3 u_ambientColor;
    uniform float u_ambientStrength;
    uniform vec3 u_baseColor;

    // Salida
    out vec4 fragColor;

    void main() {
      // Muestrear textura metálica
      vec3 metallicColor = texture(u_metallicTexture, v_uv).rgb;
      
      // Crear gradiente vertical basado en la normal
      // Usar la componente Y de la normal para determinar si es parte superior o inferior
      float verticalGradient = (v_normal.y + 1.0) * 0.5; // Mapear de [-1,1] a [0,1]
      verticalGradient = pow(verticalGradient, 2.0); // Hacer el gradiente más pronunciado
      
      // Color base metálico más oscuro en la parte inferior
      vec3 baseMetallic = u_baseColor * metallicColor;
      vec3 darkMetallic = baseMetallic * 0.4; // Parte inferior más oscura
      vec3 lightMetallic = baseMetallic * 1.2; // Parte superior más clara
      
      // Interpolar entre oscuro (abajo) y claro (arriba)
      vec3 gradientColor = mix(darkMetallic, lightMetallic, verticalGradient);
      
      // Componente ambiental
      vec3 ambient = u_ambientStrength * u_ambientColor;

      // Componente difusa con efecto metálico
      vec3 diffuse = v_lightIntensity * u_lightColor * 1.5; // Más intenso para metal
      
      // Efecto especular simple para aspecto metálico
      float specular = pow(max(v_lightIntensity, 0.0), 32.0) * 0.8;
      
      // Color final con brillo metálico
      vec3 finalColor = gradientColor * (ambient + diffuse) + vec3(specular);
      
      // Asegurar que el color no sea demasiado oscuro ni demasiado claro
      finalColor = clamp(finalColor, gradientColor * 0.3, gradientColor * 2.0);
      
      fragColor = vec4(finalColor, 1.0);
    }`;
  }

  /**
   * Crea un programa de shader
   */
  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    // Verificar que el programa se vinculó correctamente
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Error al vincular programa de shader:', this.gl.getProgramInfoLog(program));
      this.gl.deleteProgram(program);
      return null;
    }

    // Limpiar shaders (ya no son necesarios)
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    return program;
  }

  /**
   * Compila un shader
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    // Verificar que el shader se compiló correctamente
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Error al compilar shader:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Obtiene ubicaciones para el programa básico
   */
  private getBasicProgramLocations(): void {
    if (!this.gl || !this.basicProgram) return;

    // Atributos
    this.basicAttributes['position'] = this.gl.getAttribLocation(this.basicProgram, 'a_position');
    this.basicAttributes['color'] = this.gl.getAttribLocation(this.basicProgram, 'a_color');

    // Uniformes
    this.basicUniforms['modelMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_modelMatrix');
    this.basicUniforms['viewMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_viewMatrix');
    this.basicUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.basicProgram, 'u_projectionMatrix');
  }

  /**
   * Obtiene ubicaciones para el programa con iluminación
   */
  private getLitProgramLocations(): void {
    if (!this.gl || !this.litProgram) return;

    // Atributos
    this.litAttributes['position'] = this.gl.getAttribLocation(this.litProgram, 'a_position');
    this.litAttributes['normal'] = this.gl.getAttribLocation(this.litProgram, 'a_normal');
    this.litAttributes['color'] = this.gl.getAttribLocation(this.litProgram, 'a_color');

    // Uniformes de transformación
    this.litUniforms['modelMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_modelMatrix');
    this.litUniforms['viewMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_viewMatrix');
    this.litUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_projectionMatrix');
    this.litUniforms['normalMatrix'] = this.gl.getUniformLocation(this.litProgram, 'u_normalMatrix');

    // Uniformes de iluminación
    this.litUniforms['lightDirection'] = this.gl.getUniformLocation(this.litProgram, 'u_lightDirection');
    this.litUniforms['lightColor'] = this.gl.getUniformLocation(this.litProgram, 'u_lightColor');
    this.litUniforms['ambientColor'] = this.gl.getUniformLocation(this.litProgram, 'u_ambientColor');
    this.litUniforms['ambientStrength'] = this.gl.getUniformLocation(this.litProgram, 'u_ambientStrength');
    this.litUniforms['baseColor'] = this.gl.getUniformLocation(this.litProgram, 'u_baseColor');
  }

  /**
   * Obtiene ubicaciones para el programa texturizado
   */
  private getTexturedProgramLocations(): void {
    if (!this.gl || !this.texturedProgram) return;

    // Atributos
    this.texturedAttributes['position'] = this.gl.getAttribLocation(this.texturedProgram, 'a_position');
    this.texturedAttributes['normal'] = this.gl.getAttribLocation(this.texturedProgram, 'a_normal');
    this.texturedAttributes['uv'] = this.gl.getAttribLocation(this.texturedProgram, 'a_uv');

    // Uniformes de transformación
    this.texturedUniforms['modelMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_modelMatrix');
    this.texturedUniforms['viewMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_viewMatrix');
    this.texturedUniforms['projectionMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_projectionMatrix');
    this.texturedUniforms['normalMatrix'] = this.gl.getUniformLocation(this.texturedProgram, 'u_normalMatrix');

    // Uniformes de iluminación
    this.texturedUniforms['lightDirection'] = this.gl.getUniformLocation(this.texturedProgram, 'u_lightDirection');
    this.texturedUniforms['lightColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_lightColor');
    this.texturedUniforms['ambientColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_ambientColor');
    this.texturedUniforms['ambientStrength'] = this.gl.getUniformLocation(this.texturedProgram, 'u_ambientStrength');
    this.texturedUniforms['baseColor'] = this.gl.getUniformLocation(this.texturedProgram, 'u_baseColor');

    // Uniformes de textura
    this.texturedUniforms['metallicTexture'] = this.gl.getUniformLocation(this.texturedProgram, 'u_metallicTexture');
    this.texturedUniforms['gradientTexture'] = this.gl.getUniformLocation(this.texturedProgram, 'u_gradientTexture');
  }

  /**
   * Usa el programa básico
   */
  public useBasicProgram(): void {
    if (!this.gl || !this.basicProgram) return;
    this.gl.useProgram(this.basicProgram);
  }

  /**
   * Usa el programa con iluminación
   */
  public useLitProgram(): void {
    if (!this.gl || !this.litProgram) return;
    this.gl.useProgram(this.litProgram);
  }

  /**
   * Establece las matrices para el programa básico
   */
  public setBasicMatrices(modelMatrix: Float32Array, viewMatrix: Float32Array, projectionMatrix: Float32Array): void {
    if (!this.gl || !this.basicProgram) return;

    this.gl.uniformMatrix4fv(this.basicUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.basicUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.basicUniforms['projectionMatrix'], false, projectionMatrix);
  }

  /**
   * Establece las matrices para el programa con iluminación
   */
  public setLitMatrices(
    modelMatrix: Float32Array, 
    viewMatrix: Float32Array, 
    projectionMatrix: Float32Array, 
    normalMatrix: Float32Array
  ): void {
    if (!this.gl || !this.litProgram) return;

    this.gl.uniformMatrix4fv(this.litUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['projectionMatrix'], false, projectionMatrix);
    this.gl.uniformMatrix4fv(this.litUniforms['normalMatrix'], false, normalMatrix);
  }

  /**
   * Establece la configuración de iluminación
   */
  public setLighting(
    lightDirection: Float32Array, 
    lightColor: Float32Array, 
    ambientColor: Float32Array, 
    ambientStrength: number
  ): void {
    if (!this.gl || !this.litProgram) return;

    this.gl.uniform3fv(this.litUniforms['lightDirection'], lightDirection);
    this.gl.uniform3fv(this.litUniforms['lightColor'], lightColor);
    this.gl.uniform3fv(this.litUniforms['ambientColor'], ambientColor);
    this.gl.uniform1f(this.litUniforms['ambientStrength'], ambientStrength);
  }

  /**
   * Establece el color base para el shader lit
   */
  public setLitColor(color: Float32Array): void {
    if (!this.gl || !this.litProgram) return;
    this.gl.uniform3fv(this.litUniforms['baseColor'], color);
  }

  /**
   * Usa el programa texturizado
   */
  public useTexturedProgram(): void {
    if (!this.gl || !this.texturedProgram) return;
    this.gl.useProgram(this.texturedProgram);
  }

  /**
   * Establece las matrices para el programa texturizado
   */
  public setTexturedMatrices(
    modelMatrix: Float32Array, 
    viewMatrix: Float32Array, 
    projectionMatrix: Float32Array, 
    normalMatrix: Float32Array
  ): void {
    if (!this.gl || !this.texturedProgram) return;

    this.gl.uniformMatrix4fv(this.texturedUniforms['modelMatrix'], false, modelMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['viewMatrix'], false, viewMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['projectionMatrix'], false, projectionMatrix);
    this.gl.uniformMatrix4fv(this.texturedUniforms['normalMatrix'], false, normalMatrix);
  }

  /**
   * Establece la configuración de iluminación para programa texturizado
   */
  public setTexturedLighting(
    lightDirection: Float32Array, 
    lightColor: Float32Array, 
    ambientColor: Float32Array, 
    ambientStrength: number,
    baseColor: Float32Array
  ): void {
    if (!this.gl || !this.texturedProgram) return;

    this.gl.uniform3fv(this.texturedUniforms['lightDirection'], lightDirection);
    this.gl.uniform3fv(this.texturedUniforms['lightColor'], lightColor);
    this.gl.uniform3fv(this.texturedUniforms['ambientColor'], ambientColor);
    this.gl.uniform1f(this.texturedUniforms['ambientStrength'], ambientStrength);
    this.gl.uniform3fv(this.texturedUniforms['baseColor'], baseColor);
  }

  /**
   * Configura las texturas para el programa texturizado
   */
  public setTexturedTextures(metallicTexture: WebGLTexture, gradientTexture: WebGLTexture): void {
    if (!this.gl || !this.texturedProgram) return;

    // Activar y vincular textura metálica en slot 0
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, metallicTexture);
    this.gl.uniform1i(this.texturedUniforms['metallicTexture'], 0);

    // Activar y vincular textura de gradiente en slot 1
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, gradientTexture);
    this.gl.uniform1i(this.texturedUniforms['gradientTexture'], 1);
  }

  /**
   * Verifica si los shaders están listos
   */
  public isReady(): boolean {
    return this.basicProgram !== null && this.litProgram !== null && this.texturedProgram !== null;
  }

  /**
   * Limpia recursos
   */
  public cleanup(): void {
    if (!this.gl) return;

    if (this.basicProgram) {
      this.gl.deleteProgram(this.basicProgram);
      this.basicProgram = null;
    }

    if (this.litProgram) {
      this.gl.deleteProgram(this.litProgram);
      this.litProgram = null;
    }

    if (this.texturedProgram) {
      this.gl.deleteProgram(this.texturedProgram);
      this.texturedProgram = null;
    }
  }
}