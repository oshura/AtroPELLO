import { LoggingService, LogCategory } from '../../../services/logging.service';
import { Vector3 } from '../../../types/game.types';
import {
  PlanetTerrainSnapshot,
  PlanetTerrainMaterialProfile,
  PlanetTerrainMaterialLayer,
  PlanetTerrainMeshPayload,
  PlanetTerrainMaterialId,
} from '../terrain/planet-terrain.types';

interface LightUniformPayload {
  color: Float32Array;
  direction: Float32Array;
  intensity: number;
}

interface TerrainPalette {
  horizon: Float32Array;
  zenith: Float32Array;
  haze: Float32Array;
}

interface TerrainRenderParams {
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  cameraPosition: Vector3;
  planetCenter: Vector3;
  palette: TerrainPalette;
  groundRadius: number;
  heightRange: number;
  materialProfile: PlanetTerrainMaterialProfile | null;
  light: LightUniformPayload;
  time: number;
  effectMode: number;
  shipDistance: number | null;
}

interface TerrainBuffer {
  readonly level: string;
  readonly maxDistance: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly indexType: number;
  readonly positionBuffer: WebGLBuffer | null;
  readonly normalBuffer: WebGLBuffer | null;
  readonly uvBuffer: WebGLBuffer | null;
  readonly indexBuffer: WebGLBuffer | null;
}

type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

export class AtmosphereTerrainRenderer {
  private program: WebGLProgram | null = null;
  private attribPosition = -1;
  private attribNormal = -1;
  private attribUV = -1;
  private uniformViewMatrix: WebGLUniformLocation | null = null;
  private uniformProjectionMatrix: WebGLUniformLocation | null = null;
  private uniformPlanetCenter: WebGLUniformLocation | null = null;
  private uniformCameraPosition: WebGLUniformLocation | null = null;
  private uniformLightDirection: WebGLUniformLocation | null = null;
  private uniformLightColor: WebGLUniformLocation | null = null;
  private uniformLightIntensity: WebGLUniformLocation | null = null;
  private uniformPaletteLow: WebGLUniformLocation | null = null;
  private uniformPaletteMid: WebGLUniformLocation | null = null;
  private uniformPaletteHigh: WebGLUniformLocation | null = null;
  private uniformGroundRadius: WebGLUniformLocation | null = null;
  private uniformHeightRange: WebGLUniformLocation | null = null;
  private uniformLayerParams: WebGLUniformLocation | null = null;
  private uniformLayerColors: WebGLUniformLocation | null = null;
  private uniformLayerMetallic: WebGLUniformLocation | null = null;
  private uniformTime: WebGLUniformLocation | null = null;
  private uniformEffectMode: WebGLUniformLocation | null = null;

  private buffers: TerrainBuffer[] = [];
  private uintExtension: OES_element_index_uint | null = null;

  constructor(private readonly gl: GLContext, private readonly logger: LoggingService) {
    this.uintExtension = this.gl.getExtension('OES_element_index_uint');
    this.initializeProgram();
  }

  public syncTerrainSnapshot(snapshot: PlanetTerrainSnapshot | null): void {
    this.clearBuffers();
    if (!snapshot || !snapshot.landingEnabled || !snapshot.lodMeshes.length || !this.program) {
      return;
    }
    for (const mesh of snapshot.lodMeshes) {
      const buffer = this.buildBuffers(mesh);
      if (buffer) {
        this.buffers.push(buffer);
      }
    }
    this.buffers.sort((a, b) => a.maxDistance - b.maxDistance);
  }

  public render(params: TerrainRenderParams): void {
    if (!this.program || this.buffers.length === 0) {
      return;
    }

    const buffer = this.selectBuffer(params);
    if (!buffer || !buffer.indexBuffer) {
      return;
    }

    const gl = this.gl;
      this.ensureProgramBound();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.depthMask(true);

    this.setMatrixUniforms(params);
    this.setLightingUniforms(params);
    this.setPaletteUniforms(params);
    this.setMaterialUniforms(params);

    if (this.attribPosition >= 0 && buffer.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.positionBuffer);
      gl.enableVertexAttribArray(this.attribPosition);
      gl.vertexAttribPointer(this.attribPosition, 3, gl.FLOAT, false, 0, 0);
    }

    if (this.attribNormal >= 0 && buffer.normalBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.normalBuffer);
      gl.enableVertexAttribArray(this.attribNormal);
      gl.vertexAttribPointer(this.attribNormal, 3, gl.FLOAT, false, 0, 0);
    }

    if (this.attribUV >= 0 && buffer.uvBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.uvBuffer);
      gl.enableVertexAttribArray(this.attribUV);
      gl.vertexAttribPointer(this.attribUV, 2, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.indexBuffer);
    gl.drawElements(gl.TRIANGLES, buffer.indexCount, buffer.indexType, 0);

    if (this.attribPosition >= 0) {
      gl.disableVertexAttribArray(this.attribPosition);
    }
    if (this.attribNormal >= 0) {
      gl.disableVertexAttribArray(this.attribNormal);
    }
    if (this.attribUV >= 0) {
      gl.disableVertexAttribArray(this.attribUV);
    }
  }

  public dispose(): void {
    this.clearBuffers();
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
  }

  private initializeProgram(): void {
    const vertexSrc = this.getVertexShaderSource();
    const fragmentSrc = this.getFragmentShaderSource();
    const program = this.createProgram(vertexSrc, fragmentSrc);
    if (!program) {
      this.logger.warn(LogCategory.RENDER, 'AtmosphereTerrainRenderer: program creation failed');
      return;
    }
    this.program = program;
    this.attribPosition = this.gl.getAttribLocation(program, 'a_position');
    this.attribNormal = this.gl.getAttribLocation(program, 'a_normal');
    this.attribUV = this.gl.getAttribLocation(program, 'a_uv');
    this.uniformViewMatrix = this.gl.getUniformLocation(program, 'u_viewMatrix');
    this.uniformProjectionMatrix = this.gl.getUniformLocation(program, 'u_projectionMatrix');
    this.uniformPlanetCenter = this.gl.getUniformLocation(program, 'u_planetCenter');
    this.uniformCameraPosition = this.gl.getUniformLocation(program, 'u_cameraPosition');
    this.uniformLightDirection = this.gl.getUniformLocation(program, 'u_lightDirection');
    this.uniformLightColor = this.gl.getUniformLocation(program, 'u_lightColor');
    this.uniformLightIntensity = this.gl.getUniformLocation(program, 'u_lightIntensity');
    this.uniformPaletteLow = this.gl.getUniformLocation(program, 'u_paletteLow');
    this.uniformPaletteMid = this.gl.getUniformLocation(program, 'u_paletteMid');
    this.uniformPaletteHigh = this.gl.getUniformLocation(program, 'u_paletteHigh');
    this.uniformGroundRadius = this.gl.getUniformLocation(program, 'u_groundRadius');
    this.uniformHeightRange = this.gl.getUniformLocation(program, 'u_heightRange');
    this.uniformLayerParams = this.gl.getUniformLocation(program, 'u_layerParams');
    this.uniformLayerColors = this.gl.getUniformLocation(program, 'u_layerColors');
    this.uniformLayerMetallic = this.gl.getUniformLocation(program, 'u_layerMetallic');
    this.uniformTime = this.gl.getUniformLocation(program, 'u_time');
    this.uniformEffectMode = this.gl.getUniformLocation(program, 'u_effectMode');
  }

  private ensureProgramBound(): void {
    if (!this.program) {
      return;
    }
    const active = this.gl.getParameter(this.gl.CURRENT_PROGRAM) as WebGLProgram | null;
    if (active !== this.program) {
      this.gl.useProgram(this.program);
    }
  }

  private buildBuffers(mesh: PlanetTerrainMeshPayload): TerrainBuffer | null {
    const gl = this.gl;
    const positionBuffer = gl.createBuffer();
    const normalBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    if (!positionBuffer || !normalBuffer || !uvBuffer || !indexBuffer) {
      this.logger.warn(LogCategory.RENDER, 'AtmosphereTerrainRenderer: failed to allocate mesh buffers');
      return null;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    let indexType: number = gl.UNSIGNED_SHORT;
    let indexArray: Uint16Array | Uint32Array;
    const requiresUint32 = mesh.vertexCount > 65535;
    if (requiresUint32) {
      if (!this.uintExtension) {
        this.logger.warn(LogCategory.RENDER, 'AtmosphereTerrainRenderer: Uint32 indices unsupported, skipping LOD', {
          level: mesh.level,
          vertexCount: mesh.vertexCount,
        });
        return null;
      }
      indexType = gl.UNSIGNED_INT;
      indexArray = mesh.indices;
    } else {
      indexArray = new Uint16Array(mesh.indices.length);
      for (let i = 0; i < mesh.indices.length; i++) {
        indexArray[i] = mesh.indices[i];
      }
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

    return {
      level: mesh.level,
      maxDistance: mesh.maxDistance,
      vertexCount: mesh.vertexCount,
      indexCount: mesh.indices.length,
      indexType,
      positionBuffer,
      normalBuffer,
      uvBuffer,
      indexBuffer,
    };
  }

  private selectBuffer(params: TerrainRenderParams): TerrainBuffer | null {
    if (this.buffers.length === 0) {
      return null;
    }
    const defaultBuffer = this.buffers[0];
    if (this.buffers.length === 1 || params.shipDistance === null) {
      return defaultBuffer;
    }
    const altitude = Math.max(0, params.shipDistance - params.groundRadius);
    for (const buffer of this.buffers) {
      if (altitude <= buffer.maxDistance) {
        return buffer;
      }
    }
    return this.buffers[this.buffers.length - 1];
  }

  private setMatrixUniforms(params: TerrainRenderParams): void {
    const gl = this.gl;
    if (this.uniformViewMatrix) {
      gl.uniformMatrix4fv(this.uniformViewMatrix, false, params.viewMatrix);
    }
    if (this.uniformProjectionMatrix) {
      gl.uniformMatrix4fv(this.uniformProjectionMatrix, false, params.projectionMatrix);
    }
    if (this.uniformPlanetCenter) {
      gl.uniform3f(
        this.uniformPlanetCenter,
        params.planetCenter.x,
        params.planetCenter.y,
        params.planetCenter.z,
      );
    }
    if (this.uniformCameraPosition) {
      gl.uniform3f(
        this.uniformCameraPosition,
        params.cameraPosition.x,
        params.cameraPosition.y,
        params.cameraPosition.z,
      );
    }
    if (this.uniformGroundRadius) {
      gl.uniform1f(this.uniformGroundRadius, params.groundRadius);
    }
    if (this.uniformHeightRange) {
      gl.uniform1f(this.uniformHeightRange, params.heightRange);
    }
    if (this.uniformTime) {
      gl.uniform1f(this.uniformTime, params.time);
    }
    if (this.uniformEffectMode) {
      gl.uniform1i(this.uniformEffectMode, params.effectMode);
    }
  }

  private setLightingUniforms(params: TerrainRenderParams): void {
    const gl = this.gl;
    if (this.uniformLightDirection) {
      gl.uniform3fv(this.uniformLightDirection, params.light.direction);
    }
    if (this.uniformLightColor) {
      gl.uniform3fv(this.uniformLightColor, params.light.color);
    }
    if (this.uniformLightIntensity) {
      gl.uniform1f(this.uniformLightIntensity, params.light.intensity);
    }
  }

  private setPaletteUniforms(params: TerrainRenderParams): void {
    const gl = this.gl;
    if (this.uniformPaletteLow) {
      gl.uniform3fv(this.uniformPaletteLow, params.palette.horizon);
    }
    if (this.uniformPaletteMid) {
      gl.uniform3fv(this.uniformPaletteMid, params.palette.zenith);
    }
    if (this.uniformPaletteHigh) {
      gl.uniform3fv(this.uniformPaletteHigh, params.palette.haze);
    }
  }

  private setMaterialUniforms(params: TerrainRenderParams): void {
    const layers = params.materialProfile?.layers ?? [];
    const maxLayers = 3;
    const layerParams = new Float32Array(maxLayers * 4);
    const layerColors = new Float32Array(maxLayers * 3);
    const layerMetallic = new Float32Array(maxLayers * 2);
    for (let i = 0; i < maxLayers; i++) {
      const layer = layers[i] ?? this.createFallbackLayer(i, params.palette);
      layerParams[i * 4] = layer.minHeight;
      layerParams[i * 4 + 1] = layer.maxHeight;
      layerParams[i * 4 + 2] = layer.blend;
      layerParams[i * 4 + 3] = 0;
      layerColors[i * 3] = layer.tint[0];
      layerColors[i * 3 + 1] = layer.tint[1];
      layerColors[i * 3 + 2] = layer.tint[2];
      layerMetallic[i * 2] = layer.metallic;
      layerMetallic[i * 2 + 1] = layer.roughness;
    }
    if (this.uniformLayerParams) {
      this.gl.uniform4fv(this.uniformLayerParams, layerParams);
    }
    if (this.uniformLayerColors) {
      this.gl.uniform3fv(this.uniformLayerColors, layerColors);
    }
    if (this.uniformLayerMetallic) {
      this.gl.uniform2fv(this.uniformLayerMetallic, layerMetallic);
    }
  }

  private createFallbackLayer(index: number, palette: TerrainPalette): PlanetTerrainMaterialLayer {
    const baseColor = index === 0 ? palette.horizon : index === 1 ? palette.zenith : palette.haze;
    return {
      materialId: PlanetTerrainMaterialId.BASALT,
      minHeight: -10 + index * 15,
      maxHeight: 30 + index * 25,
      blend: 5,
      tint: [baseColor[0], baseColor[1], baseColor[2]],
      roughness: 0.6,
      metallic: 0.02,
    };
  }

  private clearBuffers(): void {
    for (const buffer of this.buffers) {
      if (buffer.positionBuffer) {
        this.gl.deleteBuffer(buffer.positionBuffer);
      }
      if (buffer.normalBuffer) {
        this.gl.deleteBuffer(buffer.normalBuffer);
      }
      if (buffer.uvBuffer) {
        this.gl.deleteBuffer(buffer.uvBuffer);
      }
      if (buffer.indexBuffer) {
        this.gl.deleteBuffer(buffer.indexBuffer);
      }
    }
    this.buffers = [];
  }

  private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram | null {
    const vertexShader = this.compileShader(vertexSrc, this.gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentSrc, this.gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      return null;
    }
    const program = this.gl.createProgram();
    if (!program) {
      return null;
    }
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      this.logger.warn(LogCategory.RENDER, 'AtmosphereTerrainRenderer link failed', {
        log: this.gl.getProgramInfoLog(program),
      });
      this.gl.deleteProgram(program);
      return null;
    }
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    return program;
  }

  private compileShader(source: string, type: number): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) {
      return null;
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.logger.warn(LogCategory.RENDER, 'AtmosphereTerrainRenderer shader compile failed', {
        type,
        log: this.gl.getShaderInfoLog(shader),
      });
      this.gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private getVertexShaderSource(): string {
    return `
      precision mediump float;
      attribute vec3 a_position;
      attribute vec3 a_normal;
      attribute vec2 a_uv;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;
      uniform vec3 u_planetCenter;
      uniform float u_groundRadius;
      varying vec3 v_worldPos;
      varying vec3 v_normal;
      varying vec2 v_uv;
      varying float v_height;
      void main() {
        vec3 worldPos = a_position + u_planetCenter;
        v_worldPos = worldPos;
        v_normal = normalize(a_normal);
        v_uv = a_uv;
        v_height = length(a_position) - u_groundRadius;
        gl_Position = u_projectionMatrix * u_viewMatrix * vec4(worldPos, 1.0);
      }
    `;
  }

  private getFragmentShaderSource(): string {
    return `
      precision mediump float;
      varying vec3 v_worldPos;
      varying vec3 v_normal;
      varying vec2 v_uv;
      varying float v_height;
      uniform vec3 u_planetCenter;
      uniform vec3 u_cameraPosition;
      uniform vec3 u_lightDirection;
      uniform vec3 u_lightColor;
      uniform float u_lightIntensity;
      uniform vec3 u_paletteLow;
      uniform vec3 u_paletteMid;
      uniform vec3 u_paletteHigh;
      uniform float u_groundRadius;
      uniform float u_heightRange;
      uniform vec4 u_layerParams[3];
      uniform vec3 u_layerColors[3];
      uniform vec2 u_layerMetallic[3];
      uniform float u_time;
      uniform int u_effectMode;

      float layerWeight(float height, vec4 params) {
        float enter = smoothstep(params.x - params.z, params.x + params.z, height);
        float exit = smoothstep(params.y - params.z, params.y + params.z, height);
        return clamp(enter - exit, 0.0, 1.0);
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      vec3 applyEffect(int effectMode, vec3 color, vec2 uv, float height, float time) {
        if (effectMode == 1) {
          float dunes = sin(uv.x * 40.0 + time * 0.6) * cos(uv.y * 28.0 - time * 0.45);
          color += dunes * 0.04;
        } else if (effectMode == 2) {
          float shimmer = fbm(uv * 14.0 + time * 0.25);
          color = mix(color, vec3(0.92, 0.96, 1.0), shimmer * 0.35);
        }
        return color;
      }

      void main() {
        vec3 normal = normalize(v_normal);
        vec3 viewDir = normalize(u_cameraPosition - v_worldPos);
        vec3 lightDir = normalize(-u_lightDirection);
        float lambert = max(dot(normal, lightDir), 0.0);
        float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.2);
        float heightNorm = clamp(v_height / max(1.0, u_heightRange), 0.0, 1.0);

        vec3 layerColor = vec3(0.0);
        float totalWeight = 0.0;
        float metallic = 0.0;
        float roughness = 0.0;
        for (int i = 0; i < 3; i++) {
          float w = layerWeight(v_height, u_layerParams[i]);
          layerColor += u_layerColors[i] * w;
          totalWeight += w;
          metallic += u_layerMetallic[i].x * w;
          roughness += u_layerMetallic[i].y * w;
        }
        if (totalWeight <= 0.0001) {
          layerColor = mix(u_paletteLow, u_paletteHigh, heightNorm);
          metallic = 0.05;
          roughness = 0.6;
        } else {
          layerColor /= totalWeight;
          metallic /= totalWeight;
          roughness /= max(totalWeight, 0.0001);
        }

        vec2 uv = v_uv;
        vec3 effectColor = applyEffect(u_effectMode, layerColor, uv, v_height, u_time);
        vec3 diffuse = effectColor * (0.45 + 0.55 * lambert * u_lightIntensity);
        vec3 rimColor = mix(u_paletteHigh, u_lightColor, 0.25);
        vec3 finalColor = diffuse + rimColor * rim * 0.35;
        float specPower = mix(12.0, 64.0, clamp(1.0 - roughness, 0.0, 1.0));
        vec3 halfVec = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), specPower);
        vec3 specColor = mix(vec3(0.06), effectColor, clamp(metallic, 0.0, 1.0));
        finalColor += specColor * spec * u_lightIntensity * 0.45;
        finalColor = mix(finalColor, finalColor + u_lightColor * 0.2, lambert * 0.25);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;
  }
}
