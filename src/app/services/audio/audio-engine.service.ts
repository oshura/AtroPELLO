import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AudioDebugService } from './audio-debug.service';

export type AudioBus = 'master' | 'music' | 'sfx' | 'voice' | 'ui';

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
    this.buses.music = this.makeBus(0.8);
    this.buses.sfx = this.makeBus(1.0);
    this.buses.voice = this.makeBus(1.0);
    this.buses.ui = this.makeBus(0.9);
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

  public async load(name: string, url: string): Promise<void> {
    this.ensureContext();
    if (!this.ctx) return;
    if (this.buffers.has(name)) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Audio] Failed to fetch ${name} from ${url}: ${res.status} ${res.statusText}`);
        return;
      }
      const arr = await res.arrayBuffer();
  const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(name, buf);
      const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const dur = (buf.duration ?? 0).toFixed(2);
      console.log(`[Audio] Loaded '${name}' (${dur}s, ${arr.byteLength} bytes) from ${url} in ${(t1 - t0).toFixed(0)}ms`);
  try { this.debug.markLoaded(name); this.debug.logInfo(`Loaded '${name}' (${dur}s)`); } catch {}
    } catch (e) {
      console.warn(`[Audio] Error loading '${name}' from ${url}`, e);
    }
  }

  public has(name: string): boolean { return this.buffers.has(name); }

  public play(name: string, opts: PlayOptions = {}): PlayingHandle | null {
    this.ensureContext();
    if (!this.ctx) return null;
    const buf = this.buffers.get(name);
    if (!buf) { console.warn('[Audio] Buffer not loaded:', name); return null; }

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
      console.log(`[Audio] Play #${id} '${name}' (${desc})`);
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
      setVolume: (v: number) => { gain.gain.value = Math.max(0, Math.min(1, v)); },
      setPlaybackRate: (r: number) => { src.playbackRate.value = Math.max(0.25, Math.min(4, r)); },
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
        try { console.log(`[Audio] Ended #${id} '${name}'`); this.debug.markEnded(id, name); } catch {}
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
    return {
      start: (initialVolume = 0.0) => {
        if (!h || !h.isPlaying()) {
          h = this.play(soundName, { loop: true, volume: initialVolume, bus: 'sfx', fadeInMs: 80 });
        }
      },
      stop: (fadeOutMs = 120) => { if (h) { h.stop(fadeOutMs); h = null; } },
      update: (speedNorm: number, accelNorm: number) => {
        if (!h) return;
        const rate = 0.85 + speedNorm * 0.6 + accelNorm * 0.2; // 0.85..~1.65
        const vol = 0.1 + Math.max(speedNorm, accelNorm) * 0.6; // 0.1..0.7
        h.setPlaybackRate(rate);
        h.setVolume(Math.max(0, Math.min(1, vol)));
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
  }) {
    const handle = this.play(params.name, {
      loop: false,
      volume: params.baseVolume ?? 0.5,
      playbackRate: 1.0,
      position: params.initialPos,
      bus: params.bus ?? 'sfx',
      rolloff: { distanceModel: 'inverse', refDistance: 8, maxDistance: 200, rolloffFactor: 2.0 }
    });
    const c = params.cUnits ?? 300; // tune to game scale
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
        // Natural volume rolloff by distance
        const vol = Math.max(0, Math.min(1, (params.baseVolume ?? 0.5) * (rLen <= 50 ? (1 - rLen / 50) : 0)));
        handle.setPlaybackRate(rate);
        handle.setVolume(vol);
        handle.setPosition(emitterPos.x, emitterPos.y, emitterPos.z);
      },
      stop: (fadeOutMs = 100) => { if (handle) handle.stop(fadeOutMs); }
    };
  }
}
