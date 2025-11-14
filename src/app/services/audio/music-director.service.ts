import { Injectable } from '@angular/core';
import { AudioEngineService, PlayingHandle } from './audio-engine.service';
import { AudioManifestService } from './audio-manifest.service';
import { AudioDebugService } from './audio-debug.service';
import { LoggingService, LogCategory, LogLevel } from '../logging.service';

export type MusicScene = 'menu' | 'exploration' | 'planet_approach' | 'combat' | 'spell_prep' | 'landing' | 'silence';

interface TrackDef { name: string; volume?: number; }

@Injectable({ providedIn: 'root' })
export class MusicDirectorService {
  private current: { scene: MusicScene; handle: PlayingHandle | null } = { scene: 'silence', handle: null };
  private next: { scene: MusicScene; handle: PlayingHandle | null } | null = null;
  private library: Record<MusicScene, TrackDef[]> = {
    menu: [{ name: 'music_entree', volume: 0.5 }],
    exploration: [{ name: 'music_explore_a', volume: 0.6 }],
    planet_approach: [{ name: 'music_planet', volume: 0.65 }],
    combat: [{ name: 'music_combat', volume: 0.7 }],
    spell_prep: [{ name: 'music_spell_prep', volume: 0.55 }],
    landing: [{ name: 'music_landing', volume: 0.6 }],
    silence: []
  };

  constructor(private audio: AudioEngineService, private manifest: AudioManifestService, private debug: AudioDebugService, private logger: LoggingService) {}

  /** Ensure audio context exists and is unlocked before calling */
  public async setScene(scene: MusicScene, fadeMs = 1200): Promise<void> {
    if (scene === this.current.scene) return;
    try { this.logger.log(LogLevel.INFO, LogCategory.MUSIC, 'Scene change', { scene }); this.debug.setScene(scene); } catch {}
    const tracks = this.library[scene] || [];
    // Prepare next track
    const def = tracks[0];
    let nextHandle: PlayingHandle | null = null;
    if (def) {
      // Ensure buffer loaded (should be preloaded by APP_INITIALIZER, but double-check)
      if (!this.audio.has(def.name)) {
        await this.manifest.loadByName(def.name);
      }
      nextHandle = this.audio.play(def.name, { loop: true, volume: 0, bus: 'music' });
      if (nextHandle && typeof def.volume === 'number') {
        nextHandle.setVolume(0);
      }
    }
    // Crossfade
    const prev = this.current.handle;
    if (prev) prev.stop(fadeMs);
    if (nextHandle) {
      // Simple linear fade-in
  const targetVol = (def?.volume ?? 0.6);
      const steps = 12; const step = fadeMs / steps; let i = 0;
    try { this.logger.log(LogLevel.DEBUG, LogCategory.MUSIC, 'Crossfade', { to: def?.name, targetVol, fadeMs }); this.debug.setScene(scene, def?.name); } catch {}
      const fadeInterval = setInterval(() => {
        if (!nextHandle || !nextHandle.isPlaying()) { clearInterval(fadeInterval); return; }
        const t = Math.min(1, (++i) / steps);
        nextHandle.setVolume(targetVol * t);
        if (t >= 1) clearInterval(fadeInterval);
      }, step);
    }
    this.current = { scene, handle: nextHandle };
  }

  public stop(fadeMs = 800) {
    if (this.current.handle) this.current.handle.stop(fadeMs);
    this.current = { scene: 'silence', handle: null };
  }

  /** Optional: temporarily duck music for voice/narration */
  public duckMusic(amount = 0.5, durationMs = 2000) {
    const bus = this.audio.getBus('music');
    const start = bus.gain.value;
    bus.gain.value = Math.max(0, start * (1 - amount));
    setTimeout(() => { bus.gain.value = start; }, durationMs);
  }
}
