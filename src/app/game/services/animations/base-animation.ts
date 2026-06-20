import { GameAnimation } from './types';
import { GameEngine } from '../../GameEngine';
import { ITargetable } from '../../types/targeting.types';

/**
 * Core común de las animaciones (docs/ARQUITECTURA.md Fase 8). Encapsula el ciclo de vida y, sobre todo,
 * UNIFICA el teardown: cleanup() y el fin natural de update() pasan por el MISMO `finish(aborted)` que
 * corre una sola vez los callbacks de `onTeardown(...)` y luego `onFinish(aborted)`. Esto elimina la
 * divergencia clásica (que cleanup restaure cosas distintas que la rama de fin de update).
 *
 * Las subclases implementan `onStart`/`onUpdate` (lógica creativa intacta) y registran su limpieza con
 * `onTeardown(...)` o la ponen en `onFinish(...)`. El flag de bloqueo de input lo gestiona el core.
 */
export abstract class BaseAnimation implements GameAnimation {
  abstract readonly name: string;

  protected blocking = true;
  private teardowns: Array<(engine: GameEngine) => void> = [];
  private finished = false;

  /** Configuración de la animación (estado inicial). No debe finalizar la animación. */
  protected abstract onStart(engine: GameEngine, target?: ITargetable): void;
  /** Avance por frame; devuelve true cuando la animación ha terminado. */
  protected abstract onUpdate(engine: GameEngine, dt: number): boolean;

  start(engine: GameEngine, target?: ITargetable): void {
    this.blocking = true;
    this.finished = false;
    this.teardowns = [];
    this.onStart(engine, target);
  }

  update(engine: GameEngine, dt: number): boolean {
    if (this.finished) {
      return true;
    }
    const done = this.onUpdate(engine, dt);
    if (done) {
      this.finish(engine, false);
      return true;
    }
    return false;
  }

  render(_engine: GameEngine): void {
    // Por defecto sin overlay; las subclases con render propio lo sobreescriben.
  }

  isBlockingInputs(): boolean {
    return this.blocking;
  }

  cleanup(engine: GameEngine): void {
    this.finish(engine, true);
  }

  /** Registra una limpieza que se ejecuta EXACTAMENTE una vez (en fin natural o en cleanup). */
  protected onTeardown(fn: (engine: GameEngine) => void): void {
    this.teardowns.push(fn);
  }

  /** Hook específico de la subclase tras correr los teardowns (notificaciones de resultado, etc.). */
  protected onFinish(_engine: GameEngine, _aborted: boolean): void {
    // opcional
  }

  /** Camino único de cierre: idempotente, corre teardowns y luego onFinish. */
  protected finish(engine: GameEngine, aborted: boolean): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.blocking = false;
    const fns = this.teardowns.splice(0);
    for (const fn of fns) {
      try {
        fn(engine);
      } catch {
        // best-effort: una limpieza fallida no debe abortar el resto
      }
    }
    this.onFinish(engine, aborted);
  }

  protected get isFinished(): boolean {
    return this.finished;
  }
}
