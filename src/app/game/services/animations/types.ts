import { ITargetable } from '../../types/targeting.types';
import { GameEngine } from '../../GameEngine';
import { SpellType } from '../../types/spell.types';

export interface GameAnimation {
  readonly name: string;
  start(engine: GameEngine, target?: ITargetable): void;
  update(engine: GameEngine, dt: number): boolean; // returns true when finished
  render(engine: GameEngine): void; // optional overlays
  isBlockingInputs(): boolean;
  cleanup?(engine: GameEngine): void; // optional cleanup method for emergency termination
  keepOutlinersVisible?: boolean; // if true, outliners remain visible during animation (default: false)
  spellType?: SpellType; // identify which spell triggered the animation (if any)
}
