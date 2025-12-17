import { Injectable } from '@angular/core';

export type GameAction =
  | 'pitch_down' | 'pitch_up'
  | 'yaw_left' | 'yaw_right'
  | 'roll_left' | 'roll_right'
  | 'accelerate' | 'brake'
  | 'map' | 'pause' | 'book' | 'spell' | 'inventory'
  | 'marquee_replay'
  | 'target_next' | 'target_prev'
  | 'camera_7' | 'camera_8' | 'camera_9' | 'camera_0'
  | 'stats_overlay'
  | 'start_resume' | 'clear_target' | 'resume'
  | 'aux_ability_1' | 'aux_ability_2' | 'aux_ability_3' | 'aux_ability_4'
  ;

interface BindingEntry { action: GameAction; key: string; }

const STORAGE_KEY = 'game.keybindings.v1';

const DEFAULT_BINDINGS: Record<GameAction, string> = {
  pitch_down: 'w',
  pitch_up: 's',
  yaw_left: 'a',
  yaw_right: 'd',
  roll_left: 'q',
  roll_right: 'e',
  accelerate: '+',
  brake: '-',
  map: 'm',
  pause: 'p',
  book: 'g',
  inventory: 'i',
  spell: 'h',
  target_next: 't',
  target_prev: 'shift+t',
  marquee_replay: 'backspace',
  camera_7: '7',
  camera_8: '8',
  camera_9: '9',
  camera_0: '0',
  aux_ability_1: '1',
  aux_ability_2: '2',
  aux_ability_3: '3',
  aux_ability_4: '4',
  stats_overlay: 'ñ',
  start_resume: 'space',
  clear_target: 'escape',
  resume: 'enter'
};

@Injectable({ providedIn: 'root' })
export class KeyBindingsService {
  private bindings: Record<GameAction, string> = { ...DEFAULT_BINDINGS };

  constructor() { this.load(); }

  getAll(): BindingEntry[] { return Object.entries(this.bindings).map(([action, key]) => ({ action: action as GameAction, key })); }
  get(action: GameAction): string { return this.bindings[action]; }
  getDefaultKey(action: GameAction): string { return DEFAULT_BINDINGS[action]; }

  set(action: GameAction, key: string) {
    // Normalize
    const norm = this.normalizeKey(key);
    // Remove from any other action first (avoid duplicates silently)
    for (const a of Object.keys(this.bindings) as GameAction[]) {
      if (this.bindings[a] === norm && a !== action) {
        this.bindings[a] = ''; // Clear previous
      }
    }
    this.bindings[action] = norm;
    this.save();
  }

  /** Turn a KeyboardEvent into a normalized key string */
  fromEvent(e: KeyboardEvent): string {
    const base = e.key.toLowerCase();
    if (e.shiftKey && base !== 'shift') return 'shift+' + base;
    return base;
  }

  /** Convert user-entered string into normalized representation */
  normalizeKey(k: string): string {
    return k.toLowerCase();
  }

  /** Lookup action for a given key string (normalized) */
  findActionForKey(key: string): GameAction | null {
    const norm = this.normalizeKey(key);
    const hasShift = norm.startsWith('shift+');
    const unshifted = hasShift ? norm.replace(/^shift\+/, '') : null;

    // Pass 1: require exact match (so explicit Shift bindings take precedence)
    for (const [action, bound] of Object.entries(this.bindings) as [GameAction, string][]) {
      if (bound && bound === norm) {
        return action;
      }
    }

    // Pass 2: if the pressed key included Shift but no explicit binding, allow fallback to the plain key
    if (hasShift && unshifted) {
      for (const [action, bound] of Object.entries(this.bindings) as [GameAction, string][]) {
        if (bound && !bound.startsWith('shift+') && bound === unshifted) {
          return action;
        }
      }
    }

    return null;
  }

  private save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings)); } catch {}
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        for (const a of Object.keys(this.bindings) as GameAction[]) {
          if (typeof obj[a] === 'string') this.bindings[a] = obj[a];
        }
        // Ensure essential hidden actions keep a default even if saved blank
        (['clear_target','start_resume','resume','stats_overlay'] as GameAction[]).forEach(a => {
          if (!this.bindings[a]) this.bindings[a] = DEFAULT_BINDINGS[a];
        });
      }
    } catch {}
  }

  /** Restore all bindings to original defaults */
  resetToDefaults() {
    this.bindings = { ...DEFAULT_BINDINGS };
    this.save();
  }
}
