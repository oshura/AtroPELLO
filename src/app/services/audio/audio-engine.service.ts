import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AudioDebugService } from './audio-debug.service';
import { GameLogger } from '../../game/utils/GameLogger';
import { LogCategory, LogLevel } from '../logging.service';

export type AudioBus = 'master' | 'music' | 'sfx' | 'voice' | 'ui' | 'ambience' | 'weather';

export interface PlayOptions {
  loop?: boolean;
  volume?: number;      // 0..1
  playbackRate?: number; // 0.25..4
  detune?: number;       // cents
  position?: { x: number; y: number; z: number } | null;
  rolloff?: {
    distanceModel?: DistanceModelType;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
  };
  bus?: AudioBus;
  fadeInMs?: number;
}

export interface PlayingHandle {
  id: number;
  stop: (fadeOutMs?: number) => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (r: number) => void;
  setDetune: (cents: number) => void;
  setPosition: (x: number, y: number, z: number) => void;
  setRolloff: (cfg: Required<PlayOptions['rolloff']>) => void;
  isPlaying: () => boolean;
}

@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private master!: GainNode;
  private buses: Record<AudioBus, GainNode> = {} as any;
  private buffers = new Map<string, AudioBuffer>();
  private nextId = 1;
  // User-adjustable mix controls
  private thrusterMix: number = 0.5; // 0..1 (default 50%)
  private ambienceMix: number = 0.5; // 0..1 (default 50%)
  private ambientHandle: PlayingHandle | null = null;
  private pausedBusSnapshot: Partial<Record<AudioBus, number>> | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private debug: AudioDebugService) {}

  public isAvailable(): boolean {
  return isPlatformBrowser(this.platformId) && !!(window as any).AudioContext;
  }

  public ensureContext(): void {
    if (this.ctx || !this.isAvailable()) return;
  this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Master and buses
    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.ctx.destination);
  // Defaults: music quieter by default (30%), sfx at unity, ui/voice near unity
  this.buses.music = this.makeBus(0.3);
    this.buses.sfx = this.makeBus(1.0);
    this.buses.voice = this.makeBus(1.0);
    this.buses.ui = this.makeBus(0.9);
  this.buses.ambience = this.makeBus(0.6);
    this.buses.weather = this.makeBus(0.75);
    // Chain buses to master
    Object.values(this.buses).forEach(b => b.connect(this.master));
    // Safe defaults for listener (facing -Z)
    try {
      const L = this.ctx.listener;
      if ((L as any).forwardX) {
        (L as any).forwardX.value = 0; (L as any).forwardY.value = 0; (L as any).forwardZ.value = -1;
        (L as any).upX.value = 0; (L as any).upY.value = 1; (L as any).upZ.value = 0;
      } else {
        (L as any).setOrientation(0, 0, -1, 0, 1, 0);
      }
    } catch {}
  }

  private makeBus(vol: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = vol;
    return g;
  }

  /** Must be called from a user gesture (click/keydown) */
  public async unlock(): Promise<boolean> {
    this.ensureContext();
    if (!this.ctx) return false;
    if (this.unlocked) return true;
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.unlocked = this.ctx.state === 'running';
      return this.unlocked;
    } catch { return false; }
  }

  public getBus(bus: AudioBus): GainNode { this.ensureContext(); return this.buses[bus]; }
  public setBusVolume(bus: AudioBus, volume: number): void { this.getBus(bus).gain.value = Math.max(0, Math.min(1, volume)); }
  public getBusGain(bus: AudioBus): number | null { try { return this.getBus(bus).gain.value; } catch { return null; } }
  public setBusGain(bus: AudioBus, volume: number): void { this.setBusVolume(bus, volume); }
  public getMasterGain(): number { this.ensureContext(); return this.master?.gain?.value ?? 1; }
  public setMasterGain(v: number): void {
    this.ensureContext();
    if (!this.master) return;
    // Allow slight headroom up to 2.0 if the user wants to boost globally
    const clamped = Math.max(0, Math.min(2, v));
    this.master.gain.value = clamped;
  }
  /** Mute SFX/voice/UI buses while keeping ambience/music untouched for pause screens */
  public pauseNonAmbientBuses(): void {
    this.ensureContext();
    if (!this.ctx || this.pausedBusSnapshot) return;
    const snapshot: Partial<Record<AudioBus, number>> = {};
    const targets: AudioBus[] = ['sfx','voice','ui'];
    for (const bus of targets) {
      const node = this.buses[bus];
      if (!node) continue;
      snapshot[bus] = node.gain.value;
      node.gain.value = 0;
    }
    this.pausedBusSnapshot = snapshot;
  }

  /** Restore previously paused buses back to their stored gain levels */
  public resumeNonAmbientBuses(): void {
    if (!this.pausedBusSnapshot) return;
    this.ensureContext();
    const snapshot = this.pausedBusSnapshot;
    Object.entries(snapshot).forEach(([bus, gain]) => {
      if (typeof gain !== 'number') return;
      const node = this.buses[bus as AudioBus];
      if (node) node.gain.value = gain;
    });
    this.pausedBusSnapshot = null;
  }
  public getThrusterGain(): number { return this.thrusterMix; }
  public setThrusterGain(v: number): void { this.thrusterMix = Math.max(0, Math.min(1, v)); }
  public getAmbienceGain(): number { return this.ambienceMix; }
  public setAmbienceGain(v: number): void {
    this.ambienceMix = Math.max(0, Math.min(1, v));
    // Apply immediately if loop is running
    if (this.ambientHandle && this.ambientHandle.isPlaying()) {
      this.ambientHandle.setVolume(this.computeAmbientBaseVolume() * this.ambientEffectiveMix());
    }
  }

  /** Base ambient loudness to mimic previous thruster idle presence */
  private computeAmbientBaseVolume(): number {
    // Previously thruster idle hovered around ~0.08..0.1 before mix; choose a stable base
    return 0.1; // pre-mix; final = base * ambienceMix
  }

  private ambientEffectiveMix(): number {
    // Remap slider 50% to previous 100% loudness by doubling; cap at 200%
    return Math.max(0, Math.min(2, (this.ambienceMix ?? 0) * 2));
  }

  /** Start the always-on ambient loop once audio is unlocked */
  public startAmbientLoop(name: string = 'sfx_logdark'): void {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.ambientHandle && this.ambientHandle.isPlaying()) {
      // Already running; just ensure volume reflects current mix
      this.ambientHandle.setVolume(this.computeAmbientBaseVolume() * this.ambienceMix);
      return;
    }
    // Start loop on the ambience bus
    const vol = this.computeAmbientBaseVolume() * this.ambientEffectiveMix();
    this.ambientHandle = this.play(name, { loop: true, volume: vol, bus: 'ambience', fadeInMs: 120 });
  }

  public stopAmbientLoop(fadeOutMs = 200): void {
  if (this.ambientHandle) { try { this.ambientHandle.stop(fadeOutMs); } catch {} this.ambientHandle = null; }
  }

  public async load(name: string, url: string): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.buffers.has(name)) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try {
      const res = await fetch(url);
      if (!res.ok) {
    GameLogger.warn(LogCategory.AUDIO, 'Failed to fetch audio buffer', { name, url, status: res.status, statusText: res.statusText });
        return;
      }
      const arr = await res.arrayBuffer();
  const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(name, buf);
      const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dur = (buf.duration ?? 0).toFixed(2);
  GameLogger.info(LogCategory.AUDIO, 'Audio buffer loaded', { name, durationSec: dur, bytes: arr.byteLength, ms: Number((t1 - t0).toFixed(0)) });
  try { this.debug.markLoaded(name); this.debug.logInfo(`Loaded '${name}' (${dur}s)`); } catch {}
    } catch (e) {
  GameLogger.warn(LogCategory.AUDIO, 'Error decoding audio buffer', { name, url, error: e });
    }
  }

  public has(name: string): boolean { return this.buffers.has(name); }

  /** Returns decoded buffer duration in seconds, if loaded. */
  public getBufferDuration(name: string): number | null {
    const buf = this.buffers.get(name);
    if (!buf || typeof buf.duration !== 'number' || !isFinite(buf.duration)) {
      return null;
    }
    return buf.duration;
  }

  public play(name: string, opts: PlayOptions = {}): PlayingHandle | null {
    this.ensureContext();
    if (!this.ctx) return null;
    
    // Auto-resume if suspended (browser autoplay policy may require user gesture first)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        GameLogger.warn(LogCategory.AUDIO, 'Auto-resume failed (may need user gesture)', { name });
      });
    }
    
    const buf = this.buffers.get(name);
  if (!buf) { GameLogger.warn(LogCategory.AUDIO, 'Buffer not loaded', { name }); return null; }

    const id = this.nextId++;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!opts.loop;
    if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;
    if (typeof opts.detune === 'number') src.detune.value = opts.detune;

    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1.0;

    let panner: PannerNode | null = null;
    if (opts.position) {
      panner = new PannerNode(this.ctx, {
        panningModel: 'HRTF',
        distanceModel: opts.rolloff?.distanceModel ?? 'inverse',
        refDistance: opts.rolloff?.refDistance ?? 10,
        maxDistance: opts.rolloff?.maxDistance ?? 5000,
        rolloffFactor: opts.rolloff?.rolloffFactor ?? 1.0
      });
      panner.positionX.value = opts.position.x;
      panner.positionY.value = opts.position.y;
      panner.positionZ.value = opts.position.z;
    }

    // Connect chain: source -> gain -> (panner?) -> bus -> master -> dest
    const bus = this.buses[opts.bus ?? 'sfx'];
    if (panner) { src.connect(gain); gain.connect(panner); panner.connect(bus); }
    else { src.connect(gain); gain.connect(bus); }

    // Optional fade-in
    if (opts.fadeInMs && opts.fadeInMs > 0) {
      const now = this.ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(opts.volume ?? 1.0, now + opts.fadeInMs / 1000);
    }

    src.start(0);
    let playing = true;

    // Debug log: sound started
    try {
      const desc = `loop=${!!opts.loop}, vol=${(opts.volume ?? 1).toFixed(2)}, bus=${opts.bus ?? 'sfx'}, rate=${opts.playbackRate ?? 1}`;
  GameLogger.debug(LogCategory.AUDIO, 'Play buffer', { id, name, desc });
      try { this.debug.markPlay(id, name, desc); } catch {}
    } catch {}

    const handle: PlayingHandle = {
      id,
      stop: (fadeOutMs?: number) => {
        if (!playing) return;
        playing = false;
        const t = this.ctx!.currentTime;
        if (fadeOutMs && fadeOutMs > 0) {
          const start = gain.gain.value;
          gain.gain.setValueAtTime(start, t);
          gain.gain.linearRampToValueAtTime(0, t + fadeOutMs / 1000);
          setTimeout(() => { try { src.stop(); src.disconnect(); } catch {} }, fadeOutMs + 10);
        } else {
          try { src.stop(); src.disconnect(); } catch {}
        }
      },
      setVolume: (v: number) => {
        // Smooth ramp to avoid clicks when changing volume abruptly
        const target = Math.max(0, Math.min(1, v));
        const ctx = this.ctx!;
        const now = ctx.currentTime;
        const p = gain.gain;
        const current = p.value;
        // Keep ramp short but enough to prevent a pop
        const rampSec = 0.08; // 80ms
        try { p.cancelScheduledValues(now); } catch {}
        p.setValueAtTime(current, now);
        p.linearRampToValueAtTime(target, now + rampSec);
      },
      setPlaybackRate: (r: number) => {
        // Smooth playbackRate changes to avoid rate-stepping artifacts
        const target = Math.max(0.25, Math.min(4, r));
        const ctx = this.ctx!;
        const now = ctx.currentTime;
        const p = src.playbackRate;
        const current = p.value;
        const rampSec = 0.08; // 80ms
        try { p.cancelScheduledValues(now); } catch {}
        p.setValueAtTime(current, now);
        p.linearRampToValueAtTime(target, now + rampSec);
      },
      setDetune: (c: number) => { src.detune.value = c; },
      setPosition: (x: number, y: number, z: number) => {
        if (panner) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
      },
      setRolloff: (cfg) => {
        if (panner && cfg) {
          panner.distanceModel = cfg.distanceModel;
          panner.refDistance = cfg.refDistance;
          panner.maxDistance = cfg.maxDistance;
          panner.rolloffFactor = cfg.rolloffFactor;
        }
      },
      isPlaying: () => playing
    };

    // Auto cleanup for one-shots
    if (!opts.loop) {
      src.addEventListener('ended', () => {
        playing = false;
        try { src.disconnect(); } catch {}
  try { GameLogger.debug(LogCategory.AUDIO, 'Audio ended', { id, name }); this.debug.markEnded(id, name); } catch {}
      });
    }

    return handle;
  }

  public setListenerPose(pos: {x:number;y:number;z:number}, fwd: {x:number;y:number;z:number}, up: {x:number;y:number;z:number}): void {
    this.ensureContext();
    if (!this.ctx) return;
    try {
      const L = this.ctx.listener as any;
      if (L.positionX) { L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z; }
      else if (L.setPosition) L.setPosition(pos.x, pos.y, pos.z);
      if (L.forwardX) {
        L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
        L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
      } else if (L.setOrientation) {
        L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    } catch {}
  }

  // ===== Helpers for common effects =====

  /** Start/update a continuous thruster loop: returns a pair of functions to start/stop and an update method */
  public createThrusterController(soundName: string) {
    let h: PlayingHandle | null = null;
    // Simple transient onset state for acceleration press
  let onset: { type: 'accel'; startT: number; durationMs: number; depth: number } | null = null;
    const nowTime = () => (this.ctx ? this.ctx.currentTime : 0);
    return {
      start: (initialVolume = 0.0) => {
        if (!h || !h.isPlaying()) {
          h = this.play(soundName, { loop: true, volume: initialVolume, bus: 'sfx', fadeInMs: 80 });
        }
      },
      stop: (fadeOutMs = 120) => { if (h) { h.stop(fadeOutMs); h = null; } },
      /** Trigger a short lower-pitch attack when acceleration starts. */
      accelOnset: (speedNorm: number, opts?: { durationMs?: number; depth?: number }) => {
        // If already at/near max speed, do not trigger onset
        if (speedNorm >= 0.995) return;
        const dur = Math.max(60, Math.min(600, opts?.durationMs ?? 220));
        const depth = Math.max(0.02, Math.min(0.2, opts?.depth ?? 0.06)); // 6% below base by default
        // Nudge onset a few ms into the future to avoid coinciding exactly with press frame
        onset = { type: 'accel', startT: nowTime() + 0.005, durationMs: dur, depth };
        try { this.debug.logInfo(`[Thruster] Accel onset: speed=${(speedNorm*100).toFixed(0)}% dur=${dur}ms depth=${Math.round(depth*100)}%`); } catch {}
      },
      update: (speedNorm: number, accelNorm: number) => {
        if (!h) return;
        // speedNorm can be 0..2 (extended during speed rite). Split into phases 0..1 and 1..2
        const s = Math.max(0, Math.min(2, speedNorm));
        const s1 = Math.min(1, s);
        const s2 = Math.max(0, s - 1); // 0..1 for the extended band
        // Positive accel contributes to rate; negative accelNorm is a special signal for IDLE timbre
        let baseRate = 0.85 + s1 * 0.6 + s2 * 0.35 + Math.max(0, accelNorm) * 0.2; // second band adds extra 0.35
        // Base volume from speed/positive accel (second band grows slower to avoid excessive loudness)
        let baseVol = 0.1 + Math.max(s1, Math.max(0, accelNorm)) * 0.4 + s2 * 0.15; // +0..0.15 for 100→200%
        // Idle coloring: slightly lower pitch and lower volume
        if (accelNorm < 0) {
          baseRate = Math.max(0.5, baseRate - 0.05); // ~5% lower pitch on idle
          baseVol = baseVol * 0.8; // slightly quieter than 0-speed baseline
        }
        // New requirement: thruster must be silent at 0% speed
        if (s <= 0.0001) {
          baseVol = 0.0;
        }
        let rate = baseRate;
        // Apply transient onset if present
        if (onset && onset.type === 'accel') {
          const t = nowTime();
          const elapsedMs = (t - onset.startT) * 1000;
          const k = Math.max(0, Math.min(1, elapsedMs / Math.max(1, onset.durationMs)));
          // Smooth ease-out (cubic): start lower then approach base
          const smooth = 1 - Math.pow(1 - k, 3);
          const factor = 1 - onset.depth * (1 - smooth); // from (1-depth) at k=0 to 1 at k=1
          rate = baseRate * factor;
          if (k >= 1) {
            onset = null; // finished
          }
        }
        // Apply overall thruster user mix and clamp
        const vol = Math.max(0, Math.min(1, baseVol * (this.thrusterMix ?? 1)));
        h.setPlaybackRate(rate);
        h.setVolume(vol);
      }
    };
  }

  /** Attach a doppler-like one-shot near-pass cue to an object and update each frame */
  public createDopplerCue(params: {
    name: string;
    initialPos: {x:number;y:number;z:number};
    bus?: AudioBus;
    cUnits?: number;         // pseudo speed-of-sound in world units/s (controls pitch shift magnitude)
    baseVolume?: number;
    audibleRadius?: number;  // radius within which volume rolls to 0 (default 180u)
    loop?: boolean;          // when true, keep the cue looping for continuous presence
  }) {
    const handle = this.play(params.name, {
      loop: !!params.loop,
      volume: params.baseVolume ?? 0.6,
      playbackRate: 1.0,
      position: params.initialPos,
      bus: params.bus ?? 'sfx',
      // Relaxed rolloff to keep pass-bys audible for longer
      rolloff: { distanceModel: 'inverse', refDistance: 24, maxDistance: 600, rolloffFactor: 0.9 }
    });
    const c = params.cUnits ?? 300; // tune to game scale
    const audibleR = Math.max(1, params.audibleRadius ?? 180);
    return {
      update: (emitterPos: {x:number;y:number;z:number}, listenerPos: {x:number;y:number;z:number}, emitterVel: {x:number;y:number;z:number}, listenerVel: {x:number;y:number;z:number}) => {
        if (!handle || !handle.isPlaying()) return;
        // Relative vector and unit
        const rx = emitterPos.x - listenerPos.x;
        const ry = emitterPos.y - listenerPos.y;
        const rz = emitterPos.z - listenerPos.z;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        const ux = rx / rLen, uy = ry / rLen, uz = rz / rLen;
        // Radial velocities (projected onto r)
        const vrE = emitterVel.x * ux + emitterVel.y * uy + emitterVel.z * uz;
        const vrL = listenerVel.x * ux + listenerVel.y * uy + listenerVel.z * uz;
        const vr = vrE - vrL; // positive when moving away
        // Simple doppler factor approximation
        const factor = (c - vr) / (c + vr);
        const rate = Math.max(0.5, Math.min(2.0, factor));
        // Natural volume rolloff by distance (in addition to panner), with presence floor and speed boost
        const base = params.baseVolume ?? 0.6;
        const distLin = rLen <= audibleR ? (1 - rLen / audibleR) : 0; // 0..1
        const distFactor = Math.sqrt(Math.max(0, distLin)); // ease-out keeps more level until very far
        // Relative speed magnitude (emitter-listener)
        const rvx = emitterVel.x - listenerVel.x;
        const rvy = emitterVel.y - listenerVel.y;
        const rvz = emitterVel.z - listenerVel.z;
        const vRel = Math.hypot(rvx, rvy, rvz);
        const vNorm = Math.max(0, Math.min(1.2, vRel / (0.6 * c))); // normalize ~60% of c as strong pass
        const speedBoost = 0.8 + 0.8 * vNorm; // 0.8..~1.76
        const minPresence = 0.12; // -18 dB floor inside audible radius
        let vol = base * distFactor * speedBoost;
        // Apply presence floor scaled by distance factor to avoid jumps at the edge
        if (distFactor > 0) vol = Math.max(minPresence * distFactor, vol);
        vol = Math.max(0, Math.min(1, vol));
        handle.setPlaybackRate(rate);
        handle.setVolume(vol);
        handle.setPosition(emitterPos.x, emitterPos.y, emitterPos.z);
      },
      isPlaying: () => !!handle && handle.isPlaying(),
      stop: (fadeOutMs = 100) => { if (handle) handle.stop(fadeOutMs); }
    };
  }
}
