import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AudioLogEntry {
  t: number; // performance.now or Date.now
  level: 'info' | 'warn';
  msg: string;
}

export interface AudioDebugState {
  visible: boolean;
  loaded: Set<string>;
  loadedArr: string[];
  plays: { id: number; name: string; desc: string }[];
  scene: string | null;
  logs: AudioLogEntry[];
}

@Injectable({ providedIn: 'root' })
export class AudioDebugService {
  private state: AudioDebugState = {
    visible: false,
    loaded: new Set<string>(),
    loadedArr: [],
    plays: [],
    scene: null,
    logs: []
  };
  private subj = new BehaviorSubject<AudioDebugState>(this.clone());

  readonly state$ = this.subj.asObservable();

  toggleVisible(): void { this.setVisible(!this.state.visible); }
  setVisible(v: boolean): void { this.state.visible = v; this.emit(); }

  logInfo(msg: string) { this.pushLog('info', msg); }
  logWarn(msg: string) { this.pushLog('warn', msg); }

  markLoaded(name: string) {
    this.state.loaded.add(name);
    this.state.loadedArr = Array.from(this.state.loaded).sort();
    this.emit();
  }

  markPlay(id: number, name: string, desc: string) {
    this.state.plays.unshift({ id, name, desc });
    if (this.state.plays.length > 20) this.state.plays.pop();
    this.emit();
  }

  markEnded(id: number, name: string) {
    // Keep history but can annotate end via log
    this.pushLog('info', `Ended #${id} '${name}'`);
  }

  setScene(scene: string, track?: string) {
    this.state.scene = scene;
    this.pushLog('info', `Music scene -> ${scene}${track ? ` (${track})` : ''}`);
    this.emit();
  }

  private pushLog(level: 'info' | 'warn', msg: string) {
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.state.logs.unshift({ t, level, msg });
    if (this.state.logs.length > 100) this.state.logs.pop();
    this.emit();
  }

  private emit() { this.subj.next(this.clone()); }
  private clone(): AudioDebugState {
    return {
      visible: this.state.visible,
      loaded: new Set(this.state.loaded),
      loadedArr: [...this.state.loadedArr],
      plays: [...this.state.plays],
      scene: this.state.scene,
      logs: [...this.state.logs]
    };
  }
}
