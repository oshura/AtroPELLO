import { BaseAnimation } from './base-animation';
import { GameEngine } from '../../GameEngine';

const engine = {} as unknown as GameEngine;

class TestAnimation extends BaseAnimation {
  readonly name = 'test';
  teardownCount = 0;
  finishOutcomes: boolean[] = [];
  updateCalls = 0;
  framesUntilDone = 2;

  protected override onStart(): void {
    this.onTeardown(() => { this.teardownCount++; });
  }
  protected override onUpdate(): boolean {
    this.updateCalls++;
    return this.updateCalls >= this.framesUntilDone;
  }
  protected override onFinish(_e: GameEngine, aborted: boolean): void {
    this.finishOutcomes.push(aborted);
  }
}

describe('BaseAnimation', () => {
  it('start activa el bloqueo; el fin natural corre teardown+onFinish una vez', () => {
    const a = new TestAnimation();
    a.start(engine);
    expect(a.isBlockingInputs()).toBe(true);

    expect(a.update(engine, 0.1)).toBe(false); // frame 1
    const done = a.update(engine, 0.1); // frame 2 ⇒ done
    expect(done).toBe(true);
    expect(a.teardownCount).toBe(1);
    expect(a.finishOutcomes).toEqual([false]);
    expect(a.isBlockingInputs()).toBe(false);
  });

  it('cleanup tras el fin natural NO repite el teardown', () => {
    const a = new TestAnimation();
    a.framesUntilDone = 1;
    a.start(engine);
    a.update(engine, 0.1); // done ⇒ finish(false)
    a.cleanup(engine); // ya finalizada
    expect(a.teardownCount).toBe(1);
    expect(a.finishOutcomes).toEqual([false]);
  });

  it('cleanup antes del fin corre teardown con aborted=true y frena onUpdate', () => {
    const a = new TestAnimation();
    a.framesUntilDone = 99;
    a.start(engine);
    a.update(engine, 0.1);
    a.cleanup(engine); // aborta
    expect(a.teardownCount).toBe(1);
    expect(a.finishOutcomes).toEqual([true]);
    expect(a.isBlockingInputs()).toBe(false);

    const callsBefore = a.updateCalls;
    expect(a.update(engine, 0.1)).toBe(true); // no reabre
    expect(a.updateCalls).toBe(callsBefore);
  });
});
