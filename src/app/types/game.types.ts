/**
 * Tipos y interfaces para el sistema WebGL del juego AtroPELLO
 */

export interface GameState {
  isRunning: boolean;
  isPaused: boolean;
  score: number;
  level: number;
  lives: number;
  timeElapsed: number;
}

export interface GameControls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  pause: boolean;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface Shader {
  program: WebGLProgram;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  uniforms: { [key: string]: WebGLUniformLocation | null };
  attributes: { [key: string]: number };
}

export interface Texture {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
}

export interface GameObject {
  id: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  velocity?: Vector3;
  acceleration?: Vector3;
  color?: Color;
  active: boolean;
  visible: boolean;
}

export interface Camera {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  fov: number;
  aspect: number;
  near: number;
  far: number;
}

export interface GameSettings {
  graphics: {
    quality: 'low' | 'medium' | 'high';
    vsync: boolean;
    antialiasing: boolean;
    shadows: boolean;
    effects: boolean;
  };
  audio: {
    masterVolume: number;
    musicVolume: number;
    effectsVolume: number;
    muted: boolean;
  };
  controls: {
    mousesensitivity: number;
    invertY: boolean;
    keyBindings: { [action: string]: string };
  };
}

export interface GameResource {
  id: string;
  type: 'texture' | 'audio' | 'model' | 'shader';
  path: string;
  loaded: boolean;
  data?: any;
}

export enum GameEventType {
  GAME_START = 'game_start',
  GAME_PAUSE = 'game_pause',
  GAME_RESUME = 'game_resume',
  GAME_OVER = 'game_over',
  LEVEL_COMPLETE = 'level_complete',
  SCORE_UPDATE = 'score_update',
  COLLISION = 'collision',
  POWER_UP = 'power_up'
}

export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  data?: any;
}

/**
 * Configuración específica para shaders
 */
export interface ShaderConfig {
  vertex: string;
  fragment: string;
  uniforms?: { [key: string]: any };
  attributes?: string[];
}

/**
 * Configuración de renderizado
 */
export interface RenderConfig {
  clearColor: Color;
  enableDepthTest: boolean;
  enableBlending: boolean;
  blendMode: {
    src: number;
    dst: number;
  };
  cullFace: boolean;
  wireframe: boolean;
}

/**
 * Estadísticas de rendimiento
 */
export interface PerformanceStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  vertices: number;
  triangles: number;
  memoryUsage: {
    textures: number;
    buffers: number;
    programs: number;
  };
}