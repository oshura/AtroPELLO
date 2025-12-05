import { GameObject } from '../GameObject';
import { Vector3 } from '../../types/game.types';
import { ITargetable, TargetType } from '../types/targeting.types';
import { EyeState } from '../types/solar-system.types';
import { LoggingService, LogCategory, LogLevel } from '../../services/logging.service';
import { GameObjectType } from '../types/game-object.types';
import { GameObjectAnimosity } from '../types/animosity.types';

/**
 * Portal: Objeto persistente creado por el Gate Rite.
 * Targeteable, con geometría circular de runas y ojo central (placeholder en esta fase).
 */
export class Portal extends GameObject implements ITargetable {
  private static readonly TARGETING_RADIUS_MIN = 80;
  private static readonly TARGETING_RADIUS_MAX = 1500;
  private static readonly TARGETING_RADIUS_RATIO = 0.4;
  private static readonly TARGETING_SUPPRESSION_RATIO = 0.6;
  private static readonly TARGETING_SUPPRESSION_CAP = 2400;
  // Health: portals are magical constructs, very durable but can be destroyed
  // Override with simple setter to initialize backing field
  protected override _healthCurrent: number = 5000;
  public override healthMax: number = 5000;
  public radius: number; // radio visual/base para targeting
  /** Radio efectivo que usa el sistema de targeting para raycasts */
  private targetingRadius: number;
  // Blank portal: no custom sub-geometry; keep only core disk for targeting proxy
  public manifestTime = 0; // tiempo de vida para animación
  // Store original planet size reference
  public planetRadiusRef: number;
  // Blank portal: legacy eye direction removed from rendering; keep stub for shader uniform compatibility
  public eyeDir = { x: 0, y: 0, z: 1 }; // dirección actual del ojo (normalizada)
  private _eyeDirTarget = { x: 0, y: 0, z: 1 }; // dirección objetivo suavizada
  private _eyeDirSmoothSpeed = 3.2; // velocidad de seguimiento (rads/sec aproximado)
  private _nextBlinkTime = 0; // tiempo absoluto para próximo blink
  private _blinkDuration = 0.18; // duración de un parpadeo completo (segundos)
  private _blinkElapsed = 0; // acumulador dentro de ciclo de blink
  private _isBlinking = false;
  // Bidirectional link metadata (id of paired portal)
  public linkedPortalId?: string;
  // Snapshot-driven eye state (gaze, eyelid openness, intensity)
  public eyeState?: EyeState;
  // Concordia Gate seal state
  public concordSealActive: boolean = false;
  public concordSealActivatedAt: number = 0;
  private _concordSealStrength: number = 0;
  public preventsLesserIncursions: boolean = false;
  // Sub-geom para ojo 3D (esfera simple) reutilizando procedencia similar a Planet pero de baja resolución
  private _eyeVertices: Float32Array | null = null;
  private _eyeNormals: Float32Array | null = null;
  private _eyeIndices: Uint16Array | null = null;
  private _eyeVBO: WebGLBuffer | null = null;
  private _eyeNBO: WebGLBuffer | null = null;
  private _eyeIBO: WebGLBuffer | null = null;
  private _eyeEnabled: boolean = true; // se puede desactivar si se quiere solo pentáculo
  // Geometría para billboard de llama (quad con UV)
  private _flameVBO: WebGLBuffer | null = null;
  private _flameUVBO: WebGLBuffer | null = null;
  private _flameIBO: WebGLBuffer | null = null;
  private _flameIndexCount: number = 0;
  // Control de párpado (0 cerrado, 1 totalmente abierto)
  public eyelidOpen: number = 0;

  constructor(id: string, position: Vector3, radius: number = 100, private logger?: LoggingService) {
    super(id, position, { x: 0, y: 0, z: 0 }, { x: radius, y: radius, z: radius });
    this.setType(GameObjectType.PORTAL); // Establecer tipo de GameObject
    this.objectType = TargetType.PORTAL; // Mantener para compatibilidad
    this.color = { r: 0.2, g: 0.8, b: 1.0, a: 1.0 }; // cian arcano
    this.setAnimosity(GameObjectAnimosity.ENEMY);
    this.radius = radius;
    this.targetingRadius = this.computeTargetingRadius(radius);
    this.planetRadiusRef = radius;
    this.voidMassUnits = 0;
    // Ajustar bounding sphere (compute manually usando escala)
    this.boundingSphere = { center: { ...this.position }, radius: radius };
    try { this.logger?.log(LogLevel.INFO, LogCategory.PORTAL, 'Portal created', { id, radius }); } catch {}
  }

  protected initGeometry(): void {
    // Geometría base: disco de halo (triángulos) + pentáculo (líneas) en buffers separados.
    // 1. Halo (triángulos) ----------------------------------------------------
    const segments = 64;
    const haloVerts: number[] = [];
    const haloIndices: number[] = [];
    // Centro
    haloVerts.push(0, 0, 0); // posición
    const haloNormals: number[] = [0, 0, 1];
    const haloUVs: number[] = [0.5, 0.5];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const x = Math.cos(a);
      const y = Math.sin(a);
      haloVerts.push(x, y, 0);
      haloNormals.push(0, 0, 1);
      haloUVs.push((x + 1) * 0.5, (y + 1) * 0.5);
    }
    for (let i = 1; i <= segments; i++) {
      const next = i === segments ? 1 : i + 1;
      haloIndices.push(0, i, next);
    }
    this.vertices = new Float32Array(haloVerts);
    this.indices = new Uint16Array(haloIndices);
    this.normals = new Float32Array(haloNormals);
    this.uvs = new Float32Array(haloUVs);

    // Pentáculo: eliminado de la geometría del Portal.
    // NOTA: el pentáculo visible lo genera y dibuja PortalShaderService (triangulado con grosor),
    // para evitar múltiples fuentes de verdad. Mantener aquí solo la malla base/halo como proxy.
  }

  public override update(deltaTime: number): void {
    this.manifestTime += deltaTime;
    // No efectos propios; solo mantener manifestTime para animación externa
    this.updateGazeAndBlink(deltaTime);
    this.updateConcordSeal(deltaTime);
    super.update(deltaTime);
  }

  /** Actualiza la dirección del ojo y el estado de blink con suavizado y límites */
  private updateGazeAndBlink(dt: number): void {
    // Determinar target: si hay eyeState con gazeTarget ship y existe la nave en window scope o global engine
    try {
      let shipPos: any = (window as any)?.gameEngine?.spaceship?.position;
      if (!shipPos && (window as any)?.spaceship) shipPos = (window as any).spaceship.position;
      if (this.eyeState?.gazeTarget === 'ship' && shipPos) {
        const dx = shipPos.x - this.position.x;
        const dy = shipPos.y - this.position.y;
        const dz = shipPos.z - this.position.z;
        const len = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1;
        // Clamp vertical componente para evitar giros antinaturales (> ~55°)
        const vyClamp = 0.82; // cos(55°) ~ 0.57; limit normalized y
        let nx = dx/len, ny = dy/len, nz = dz/len;
        if (ny > vyClamp) ny = vyClamp; else if (ny < -vyClamp) ny = -vyClamp;
        // Renormalizar tras clamp
        const renLen = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
        nx/=renLen; ny/=renLen; nz/=renLen;
        this._eyeDirTarget.x = nx; this._eyeDirTarget.y = ny; this._eyeDirTarget.z = nz;
      }
    } catch {}
    // Suavizado (lerp angular) entre eyeDir y eyeDirTarget
    const ax = this.eyeDir.x, ay = this.eyeDir.y, az = this.eyeDir.z;
    let bx = this._eyeDirTarget.x, by = this._eyeDirTarget.y, bz = this._eyeDirTarget.z;
    // Asegurar normalización de objetivo
    const bLen = Math.sqrt(bx*bx + by*by + bz*bz) || 1; bx/=bLen; by/=bLen; bz/=bLen;
    // Interpolación exponencial aproximada
    const follow = 1 - Math.exp(-this._eyeDirSmoothSpeed * dt);
    const ix = ax + (bx - ax) * follow;
    const iy = ay + (by - ay) * follow;
    const iz = az + (bz - az) * follow;
    const iLen = Math.sqrt(ix*ix + iy*iy + iz*iz) || 1;
    this.eyeDir.x = ix/iLen; this.eyeDir.y = iy/iLen; this.eyeDir.z = iz/iLen;

    // Blink scheduling: si tiempo actual supera _nextBlinkTime, iniciar parpadeo
    const now = performance.now() * 0.001; // segundos
    if (!this._isBlinking && now >= this._nextBlinkTime) {
      this._isBlinking = true; this._blinkElapsed = 0;
      // Programar próximo blink (aleatorio 2.5–6.5s)
      this._nextBlinkTime = now + (2.5 + Math.random()*4.0);
    }
    if (this._isBlinking) {
      this._blinkElapsed += dt;
      const k = Math.min(1, this._blinkElapsed / this._blinkDuration);
      // Perfil de parpadeo: cierre rápido (0→0.2) luego apertura (0.2→1)
      let curve: number;
      if (k < 0.35) { // fase cierre
        curve = 1 - (k / 0.35); // 1→0
      } else { // fase apertura
        const kk = (k - 0.35) / (0.65); // 0→1
        curve = Math.min(1, kk); // 0→1
      }
      // Mezclar con eyelidOpen actual (manifest puede estar animándolo) usando mínimo
      const baseOpen = (this as any).eyelidOpen ?? 1;
      (this as any).eyelidOpen = Math.min(baseOpen, curve);
      if (k >= 1) { this._isBlinking = false; }
    }
  }

  private updateConcordSeal(dt: number): void {
    const target = this.concordSealActive ? 1 : 0;
    const follow = 1 - Math.exp(-4 * dt);
    this._concordSealStrength += (target - this._concordSealStrength) * follow;
    if (!isFinite(this._concordSealStrength)) {
      this._concordSealStrength = target;
    }
    this._concordSealStrength = Math.min(1, Math.max(0, this._concordSealStrength));
  }

  /** Apply snapshot eye state (placeholder: future shader params, eyelid geometry). */
  public applyEyeState(state?: EyeState): void {
    if (!state) return;
    this.eyeState = { ...state };
    // Placeholder behavior: modulate renderOpacity by eyelid openness & intensity
    const eyelid = typeof state.eyelidOpen === 'number' ? Math.max(0, Math.min(1, state.eyelidOpen)) : 1;
    const intensity = typeof state.intensity === 'number' ? Math.max(0, Math.min(1, state.intensity)) : 1;
    (this as any).renderOpacity = eyelid * 0.5 + intensity * 0.5; // simple blend until shader integration
  }

  // Blank portal: no extra buffers to initialize
  public initExtraBuffers(gl: WebGL2RenderingContext): void {
    // Pentáculo: sin buffers en Portal; se genera en PortalShaderService.
    // Crear geometría del ojo (esfera low-poly) si no existe
    if (this._eyeEnabled && !this._eyeVBO) {
      // Ojo deshabilitado: reservar espacio vacío (sin geometría) para evitar condicionales en render futuro
      this._eyeVertices = new Float32Array();
      this._eyeNormals = new Float32Array();
      this._eyeIndices = new Uint16Array();
    }

    // Crear quad para llama en pupila si no existe
    if (!this._flameVBO) {
      const pos = new Float32Array([
        -0.5, -0.5, 0.0,
         0.5, -0.5, 0.0,
         0.5,  0.5, 0.0,
        -0.5,  0.5, 0.0,
      ]);
      const uv = new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
      ]);
      const idx = new Uint16Array([0,1,2, 0,2,3]);
      this._flameVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this._flameVBO); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      this._flameUVBO = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this._flameUVBO); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      this._flameIBO = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._flameIBO); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this._flameIndexCount = idx.length;
    }
  }

  // ITargetable implementation
  public getDisplayName(): string { return `Portal ${this.id}`; }
  public getTargetType(): TargetType { return TargetType.PORTAL; }
  public override isActive(): boolean { return this.active && this.visible; }

  /** Radio usado por el targeting adaptativo (clamp anti-mamut). */
  public getTargetingRadius(): number {
    return this.targetingRadius;
  }

  /** Radio máximo donde se suprime el raycast cuando la nave está "dentro" del portal. */
  public getTargetingSuppressionRadius(): number {
    const scaled = Math.min(
      this.radius * Portal.TARGETING_SUPPRESSION_RATIO,
      Portal.TARGETING_SUPPRESSION_CAP
    );
    const base = Math.max(this.targetingRadius * 0.9, Portal.TARGETING_RADIUS_MIN);
    return Math.max(base, scaled || this.targetingRadius);
  }

  private computeTargetingRadius(r: number): number {
    const scaled = Math.max(r * Portal.TARGETING_RADIUS_RATIO, Portal.TARGETING_RADIUS_MIN);
    return Math.min(Portal.TARGETING_RADIUS_MAX, scaled);
  }

  // ===== Pentáculo =====
  // Eliminado en Portal (se renderiza desde PortalShaderService para grosor/anillo consistentes)
  // Referencia al color base del planeta original (capturada durante Gate Rite)
  public planetColorRef?: { r:number; g:number; b:number; a?:number };
  public setConcordSealState(
    active: boolean,
    preventsIngress: boolean = true,
    activatedAt?: number,
    opts?: { immediateStrength?: boolean }
  ): void {
    this.concordSealActive = active;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (active) {
      this.concordSealActivatedAt = activatedAt ?? now;
      this.preventsLesserIncursions = preventsIngress;
    } else {
      this.preventsLesserIncursions = false;
      this.concordSealActivatedAt = activatedAt ?? this.concordSealActivatedAt;
    }
    if (opts?.immediateStrength) {
      this._concordSealStrength = active ? 1 : 0;
    }
  }
  public isConcordSealed(): boolean {
    return this.concordSealActive;
  }
  public getConcordSealStrength(): number {
    return this._concordSealStrength;
  }
  /** El pentáculo no expone buffers desde Portal; usar PortalShaderService.renderPentacle */
  public getEyeBuffers(): { v: WebGLBuffer | null; n: WebGLBuffer | null; i: WebGLBuffer | null; count: number } {
    return { v: this._eyeVBO, n: this._eyeNBO, i: this._eyeIBO, count: this._eyeIndices ? this._eyeIndices.length : 0 };
  }
  public getFlameBuffers(): { v: WebGLBuffer | null; uv: WebGLBuffer | null; i: WebGLBuffer | null; count: number } {
    return { v: this._flameVBO, uv: this._flameUVBO, i: this._flameIBO, count: this._flameIndexCount };
  }
}
