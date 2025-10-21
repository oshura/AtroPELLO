import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';

export interface GameAnimation {
  readonly name: string;
  start(engine: GameEngine, target: ITargetable): void;
  update(engine: GameEngine, dt: number): boolean; // returns true when finished
  render(engine: GameEngine): void; // optional overlays
  isBlockingInputs(): boolean;
}
