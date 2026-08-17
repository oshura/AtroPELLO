import { Injectable, signal } from '@angular/core';
import { AudioEngineService } from '../audio/audio-engine.service';
import { LoggingService, LogCategory } from '../logging.service';
import {
  PRESENTATION_MAX_FRAMES,
  looksLikeHtmlFallback,
  presentationCaptionUrl,
  presentationImageUrl,
  presentationVoiceName,
  presentationVoiceUrl,
} from './presentation-assets';

/** Una viñeta lista para reproducir. */
interface PresentationFrame {
  imageUrl: string;
  voiceName: string;
  hasVoice: boolean;
  caption: string;
}

const FADE_MS = 500;             // fundido de entrada/salida (casado con la transición CSS del player)
const AMBIENCE_DUCK_FACTOR = 0.5; // la música ambiente baja a la MITAD mientras suenan las voces
const HOLD_AFTER_VOICE_MS = 1500; // espera tras terminar la voz (petición del usuario)
const FALLBACK_FRAME_MS = 4000;  // duración de una viñeta sin audio disponible
const VOICE_SAFETY_MS = 120000;  // tope duro por viñeta (por si el audio nunca "termina")

/**
 * Reproductor de PRESENTACIONES de cómic (viñetas + voz + subtítulo opcional, convención en
 * `presentation-assets.ts`): fade in → voz → 1,5 s → fade out → siguiente. ESC salta la
 * presentación entera. Estado en signals (zoneless-friendly); el DOM lo pinta
 * PresentationPlayerComponent. Voces bajo demanda por el bus 'voice' (fuera del manifest).
 */
@Injectable({ providedIn: 'root' })
export class PresentationService {
  readonly active = signal(false);
  readonly loading = signal(false); // velo con spinner mientras se descubren viñetas y decodifican voces
  readonly imageUrl = signal('');
  readonly caption = signal('');
  readonly shown = signal(false); // controla el fundido (opacity) de la viñeta actual

  private aborted = false;
  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      this.aborted = true;
    }
  };

  constructor(
    private readonly audio: AudioEngineService,
    private readonly logger: LoggingService,
  ) {}

  isActive(): boolean {
    return this.active();
  }

  /** Reproduce la presentación `base` completa. Resuelve al terminar (o al saltarla con ESC). */
  async play(base: string): Promise<void> {
    if (this.active() || typeof window === 'undefined') {
      return;
    }
    this.aborted = false;
    // El velo se enciende YA, en el propio click: descubrir viñetas y decodificar voces tarda y sin
    // feedback el botón parece muerto (mismo patrón que el velo de carga del arranque del motor).
    this.active.set(true);
    this.loading.set(true);
    window.addEventListener('keydown', this.onKeyDown);
    let ambiencePrev: number | null = null; // gain del bus 'ambience' antes del ducking (se restaura al salir)
    try {
      try { await this.audio.unlock(); } catch { /* sin gesto de usuario aún; play() reintenta resume */ }
      const frames = await this.discoverFrames(base);
      this.loading.set(false);
      if (this.aborted) {
        return;
      }
      if (frames.length === 0) {
        this.logger.warn(LogCategory.LANDING, 'Presentación sin viñetas', { base });
        return;
      }
      // Ducking: la música ambiente a la mitad mientras dura la presentación (petición del usuario).
      ambiencePrev = this.audio.getBusGain('ambience');
      if (typeof ambiencePrev === 'number') {
        this.audio.setBusGain('ambience', ambiencePrev * AMBIENCE_DUCK_FACTOR);
      }
      for (const frame of frames) {
        if (this.aborted) {
          break;
        }
        this.imageUrl.set(frame.imageUrl);
        this.caption.set(frame.caption);
        this.shown.set(true);
        await this.wait(FADE_MS);
        await this.playVoice(frame);
        await this.wait(HOLD_AFTER_VOICE_MS);
        this.shown.set(false);
        await this.wait(FADE_MS);
      }
    } finally {
      if (typeof ambiencePrev === 'number') {
        this.audio.setBusGain('ambience', ambiencePrev);
      }
      window.removeEventListener('keydown', this.onKeyDown);
      this.loading.set(false);
      this.active.set(false);
      this.shown.set(false);
      this.imageUrl.set('');
      this.caption.set('');
    }
  }

  /** Sondea viñetas desde 00 hasta el primer hueco y precarga voces y subtítulos en paralelo. */
  private async discoverFrames(base: string): Promise<PresentationFrame[]> {
    const frames: PresentationFrame[] = [];
    // Sondeo por LOTES en paralelo (el criterio sigue siendo "hasta el primer hueco"): con sondas
    // secuenciales cada viñeta costaba un round-trip completo y el velo se alargaba sin necesidad.
    const BATCH = 8;
    let gap = false;
    for (let start = 0; start < PRESENTATION_MAX_FRAMES && !gap; start += BATCH) {
      const count = Math.min(BATCH, PRESENTATION_MAX_FRAMES - start);
      const hits = await Promise.all(Array.from({ length: count }, (_, k) =>
        this.probeImage(presentationImageUrl(base, start + k))));
      for (let k = 0; k < count; k++) {
        if (!hits[k]) {
          gap = true;
          break;
        }
        const i = start + k;
        frames.push({ imageUrl: presentationImageUrl(base, i), voiceName: presentationVoiceName(base, i), hasVoice: false, caption: '' });
      }
    }
    await Promise.all(frames.map(async (frame, i) => {
      try { await this.audio.load(frame.voiceName, presentationVoiceUrl(base, i)); } catch { /* sin voz */ }
      frame.hasVoice = this.audio.has(frame.voiceName);
      frame.caption = await this.fetchCaption(presentationCaptionUrl(base, i));
    }));
    return frames;
  }

  /** ¿Existe la imagen? (el fallback SPA no decodifica como imagen → onerror). */
  private probeImage(url: string): Promise<boolean> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  private async fetchCaption(url: string): Promise<string> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return '';
      }
      const text = (await res.text()).trim();
      return looksLikeHtmlFallback(text) ? '' : text;
    } catch {
      return '';
    }
  }

  /** Reproduce la voz de la viñeta y espera a que termine (o al fallback si no hay audio). */
  private async playVoice(frame: PresentationFrame): Promise<void> {
    if (!frame.hasVoice) {
      await this.wait(FALLBACK_FRAME_MS);
      return;
    }
    const handle = this.audio.play(frame.voiceName, { bus: 'voice', volume: 1 });
    const durationMs = Math.min(VOICE_SAFETY_MS, Math.ceil((this.audio.getBufferDuration(frame.voiceName) ?? 4) * 1000));
    const t0 = performance.now();
    while (!this.aborted && performance.now() - t0 < durationMs) {
      if (handle && !handle.isPlaying() && performance.now() - t0 > 250) {
        break;
      }
      await this.sleep(80);
    }
    if (handle && this.aborted) {
      try { handle.stop(120); } catch { /* ya parado */ }
    }
  }

  /** Espera abortable (ESC corta la presentación sin quedarse colgada en un timeout largo). */
  private async wait(ms: number): Promise<void> {
    const t0 = performance.now();
    while (!this.aborted && performance.now() - t0 < ms) {
      await this.sleep(Math.min(80, ms));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
