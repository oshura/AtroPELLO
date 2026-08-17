import { GameEngine } from '../../GameEngine';
import { CameraMode } from '../../Camera';
import { ThrusterState, Spaceship } from '../../game-objects/Spaceship';
import { Vector3 } from '../../../types/game.types';
import { clamp01, lerp, smoothstep } from './animation-math';
import { BaseAnimation } from './base-animation';

/**
 * Cinemática de ATRAQUE/SEPARACIÓN de la nave con un puerto de estación (docs/ESTACIONES.md §3, antes DIFERIDA).
 * Sustituye al glide lineal inline del motor. Acoplar: la nave describe un ARCO (Bezier) hasta encarar el
 * puerto, despliega el tren (alas), frena con retro y la cámara ORBITA encuadrando nave + puerto + estación.
 * Separar: empuje hacia afuera con giro de 180° para encarar el espacio. El motor solo delega (regla #1).
 */
export interface DockingSequenceContext {
  mode: 'docking' | 'undocking';
  portPosition: Vector3;
  approachNormal: Vector3;                 // saliente de la estación (dirección de aproximación)
  onComplete: (aborted: boolean) => void;  // el motor abre el menú / restaura cámara
}

const INSIDE_DEPTH = 30;  // u que la nave se adentra ATRAVESANDO el puerto (queda "dentro" de la estación)
const DEPART_DIST = 200;  // u a los que se aleja al despegar
const APPROACH_DIST = 58; // u frente al puerto (punto de control del arco de aproximación)
const EXIT_SPEED_FACTOR = 0.25; // fracción de maxSpeed con la que la nave sale LANZADA al sistema

export class DockingSequenceAnimation extends BaseAnimation {
  public readonly name = 'docking-sequence';

  private ctx!: DockingSequenceContext;
  private elapsed = 0;
  private duration = 5.5;
  private started = false;

  private n!: Vector3;        // normal saliente (unit)
  private right!: Vector3;    // eje lateral de la base del puerto
  private startPos!: Vector3;
  private endPos!: Vector3;
  private control!: Vector3;  // punto de control del arco
  private startFwd!: Vector3; // heading inicial de la nave
  private endFwd!: Vector3;   // heading final

  public configure(ctx: DockingSequenceContext): void { this.ctx = ctx; }

  protected override onStart(engine: GameEngine): void {
    const ship = engine.spaceship;
    if (!ship || !this.ctx) { this.blocking = false; return; }
    const docking = this.ctx.mode === 'docking';
    this.duration = docking ? 5.5 : 4.0;
    this.elapsed = 0;

    this.n = this.norm(this.ctx.approachNormal);
    const worldUp: Vector3 = Math.abs(this.n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    this.right = this.norm(this.cross(worldUp, this.n));

    // Pose final DENTRO de la estación: la nave atraviesa el tile hacia el lado interior (-normal).
    const dockPose = this.add(this.ctx.portPosition, this.scale(this.n, -INSIDE_DEPTH));
    const departPose = this.add(this.ctx.portPosition, this.scale(this.n, DEPART_DIST));
    this.startPos = { ...ship.position };
    this.startFwd = this.norm({ ...ship.forwardDirection });
    this.control = this.add(this.ctx.portPosition, this.scale(this.n, APPROACH_DIST));

    if (docking) {
      this.endPos = dockPose;
      this.endFwd = this.scale(this.n, -1); // mira HACIA el puerto
    } else {
      this.endPos = departPose;
      this.endFwd = { ...this.n };          // sale mirando hacia afuera
    }

    // Congelar la nave: sin controles ni deriva; sin gasto de void energy; sin colisiones durante el vuelo.
    ship.voidEnergyPaused = true;
    ship.currentSpeed = 0; ship.targetSpeed = 0;
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    this.zeroControls(ship);
    ship.thrusterState = docking ? ThrusterState.BRAKING : ThrusterState.ACCELERATING;
    engine.collisionsDisabled = true;

    try { engine.camera?.setCameraMode?.(CameraMode.MANUAL); } catch {}

    this.started = true;
  }

  protected override onUpdate(engine: GameEngine, dt: number): boolean {
    const ship = engine.spaceship;
    if (!ship || !this.ctx) { return true; }
    const docking = this.ctx.mode === 'docking';
    this.elapsed += dt;
    const p = clamp01(this.elapsed / this.duration);
    const e = smoothstep(p);

    // Posición: arco cuadrático (Bezier) start → control(frente al puerto) → end, con easing.
    const pos = this.bezier(this.startPos, this.control, this.endPos, e);
    ship.position.x = pos.x; ship.position.y = pos.y; ship.position.z = pos.z;
    ship.velocity.x = ship.velocity.y = ship.velocity.z = 0;
    if (docking) {
      ship.currentSpeed = 0; ship.targetSpeed = 0;
    } else {
      // Al separar, los thrusters ya SUENAN (y el velocímetro marca) a la velocidad de salida: el
      // audio del motor mapea currentSpeed → volumen. La POSICIÓN la sigue mandando el bezier
      // (velocity va a 0), así que esto solo alimenta audio/HUD/partículas, no el movimiento.
      const exit = (ship.maxSpeed || 20) * EXIT_SPEED_FACTOR;
      ship.currentSpeed = exit * smoothstep(clamp01(p / 0.2)); // arranque breve, sin golpe de volumen
      ship.targetSpeed = exit;
    }
    this.zeroControls(ship);

    // Orientación (nave siempre "de pie", up = mundo).
    const fwd = docking ? this.dockingForward(p) : this.undockingForward(p);
    ship.lookAt(this.add(ship.position, fwd), { x: 0, y: 1, z: 0 });
    ship.updateModelMatrix();
    if (ship.boundingSphere?.center) {
      ship.boundingSphere.center.x = ship.position.x;
      ship.boundingSphere.center.y = ship.position.y;
      ship.boundingSphere.center.z = ship.position.z;
    }

    // Tren de acople (alas): despliega al acoplar, recoge al separar.
    try { ship.setWingDeploymentProgress?.(docking ? e : 1 - e); } catch {}

    // Retro al acoplar (más fuerte cerca del contacto); empuje al separar.
    ship.thrusterState = docking ? ThrusterState.BRAKING : ThrusterState.ACCELERATING;
    ship.isThrusting = docking ? p < 0.96 : true;

    this.updateCamera(engine, ship.position, p, docking);
    return p >= 1;
  }

  protected override onFinish(engine: GameEngine, aborted: boolean): void {
    if (!this.started) { this.safeComplete(true); return; }
    const ship = engine.spaceship;
    const docking = this.ctx.mode === 'docking';
    if (ship && !aborted) {
      ship.position = { ...this.endPos };
      ship.lookAt(this.add(ship.position, this.endFwd), { x: 0, y: 1, z: 0 });
      ship.updateModelMatrix();
      if (docking) {
        ship.voidEnergyPaused = true;
        ship.currentSpeed = 0; ship.targetSpeed = 0;
        this.zeroControls(ship);
        ship.thrusterState = ThrusterState.IDLE;
        try { ship.setWingDeploymentProgress?.(1); } catch {}
      } else {
        try { ship.setWingDeploymentProgress?.(0); } catch {}
        const sp = (ship.maxSpeed || 20) * EXIT_SPEED_FACTOR;
        ship.currentSpeed = sp; ship.targetSpeed = sp;
        ship.voidEnergyPaused = false;
        ship.thrusterState = ThrusterState.CRUISING;
      }
    }
    // Re-activar colisiones (acoplada = estática; separada = libre). El motor gestiona la cámara vía onComplete.
    engine.collisionsDisabled = false;
    this.safeComplete(aborted);
  }

  public override render(_engine: GameEngine): void { /* cinemática con cámara física, sin overlay */ }

  // ---- cámara: órbita suave encuadrando nave + puerto (+ estación al fondo) ----
  private updateCamera(engine: GameEngine, shipPos: Vector3, p: number, docking: boolean): void {
    const cam = engine.camera;
    if (!cam) { return; }
    const port = this.ctx.portPosition;
    const s = smoothstep(p);
    let dir: Vector3;
    let dist: number;
    let camY: number;
    let targetT: number;
    if (docking) {
      // Fly-in: de una vista lateral (aproximación) a DETRÁS-FUERA mirando al puerto, para ver la nave
      // atravesar el tile y meterse dentro (se aleja de la cámara hacia el interior de la estación).
      const behind = smoothstep(clamp01((p - 0.5) / 0.5));
      const side = 1 - behind;
      const ang = lerp(-0.9, 0.15, s);
      dir = this.norm(this.add(
        this.scale(this.right, Math.cos(ang) * side * 0.9),
        this.scale(this.n, 0.5 + 1.1 * behind + 0.4 * side)   // siempre fuera (+n); al final casi puro +n
      ));
      dist = lerp(92, 58, s);
      camY = lerp(24, 13, behind);
      targetT = lerp(0.4, 0.8, behind);                       // al final mira al puerto (la nave ya está dentro)
    } else {
      const ang = lerp(0.2, 1.0, s);
      dir = this.norm(this.add(this.scale(this.right, Math.cos(ang)), this.scale(this.n, 0.55 + 0.5 * Math.sin(ang))));
      dist = lerp(150, 310, s); // el DOBLE de lejos que antes: la nave se ve a la mitad o menos (petición)
      camY = 45;
      targetT = 0.4;
    }
    const anchor = this.lerpVec(shipPos, port, 0.3);
    const camPos = this.add(this.add(anchor, this.scale(dir, dist)), { x: 0, y: camY, z: 0 });
    const target = this.lerpVec(shipPos, port, targetT);
    try {
      cam.seedManualTransform?.(camPos, target, { x: 0, y: 1, z: 0 });
      cam.markDirty?.();
    } catch { /* best-effort */ }
  }

  private dockingForward(p: number): Vector3 {
    // De su heading actual al que encara el puerto (-n). El jugador llega mirando la estación → sin flip.
    return this.norm(this.nlerp(this.startFwd, this.endFwd, smoothstep(clamp01(p / 0.8))));
  }

  private undockingForward(p: number): Vector3 {
    // Giro de 180° por un costado (evita el punto muerto de interpolar vectores opuestos): -n → right → +n.
    const th = Math.PI * smoothstep(p);
    return this.norm(this.add(this.scale(this.n, -Math.cos(th)), this.scale(this.right, Math.sin(th))));
  }

  private safeComplete(aborted: boolean): void {
    try { this.ctx?.onComplete?.(aborted); } catch { /* best-effort */ }
  }

  // ---- helpers vectoriales ----
  private zeroControls(ship: Spaceship): void {
    const c = ship.controls;
    c.forward = c.backward = c.left = c.right = c.up = c.down = false;
    c.speedUp = c.speedDown = c.rollLeft = c.rollRight = false;
  }
  private norm(v: Vector3): Vector3 { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  private cross(a: Vector3, b: Vector3): Vector3 { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
  private add(a: Vector3, b: Vector3): Vector3 { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  private scale(a: Vector3, s: number): Vector3 { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  private lerpVec(a: Vector3, b: Vector3, t: number): Vector3 { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }; }
  private nlerp(a: Vector3, b: Vector3, t: number): Vector3 { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) }; }
  private bezier(a: Vector3, c: Vector3, b: Vector3, t: number): Vector3 {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
    };
  }
}
