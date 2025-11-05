import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AudioEngineService } from './audio-engine.service';
import { AudioDebugService } from './audio-debug.service';

type ManifestMap = Record<string, string>;

@Injectable({ providedIn: 'root' })
export class AudioManifestService {
  private manifestUrl = 'assets/audio/_manifest.json';
  private manifest: ManifestMap | null = null;
  private readyPromise: Promise<void> | null = null;

  constructor(
    private http: HttpClient,
  private audio: AudioEngineService,
  private debug: AudioDebugService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /** Begin loading the manifest and decoding all buffers. Safe to call multiple times. */
  init(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      // No-op on SSR
      return Promise.resolve();
    }
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      try {
        const manifest = await firstValueFrom(this.http.get<ManifestMap>(this.manifestUrl));
        this.manifest = manifest;
  const entries = Object.entries(manifest);
  console.log(`[AudioManifest] Loaded manifest with ${entries.length} entries from ${this.manifestUrl}`);
  try { this.debug.logInfo(`Manifest loaded (${entries.length} entries)`); } catch {}
        // Preload/Decode all entries in parallel
  await Promise.all(entries.map(([name, url]) => this.safeLoad(name, url)));
  console.log('[AudioManifest] Preload complete');
  try { this.debug.logInfo('Preload complete'); } catch {}
      } catch (err) {
        console.warn('[AudioManifest] Failed to load manifest:', err);
      }
    })();
    return this.readyPromise;
  }

  /** Await until manifest is fetched and any scheduled loads finished */
  whenReady(): Promise<void> { return this.init(); }

  getUrl(name: string): string | undefined {
    return this.manifest?.[name];
  }

  has(name: string): boolean { return this.audio.has(name); }

  /** Load a single asset by logical name (from manifest) if present */
  async loadByName(name: string): Promise<boolean> {
    await this.init();
    const url = this.getUrl(name);
    if (!url) return false;
    await this.safeLoad(name, url);
    return true;
  }

  private async safeLoad(name: string, url: string): Promise<void> {
    try {
      if (!this.audio.has(name)) {
        await this.audio.load(name, url);
      }
    } catch (e) {
      console.warn(`[AudioManifest] Failed to load ${name} from ${url}`, e);
    }
  }
}
