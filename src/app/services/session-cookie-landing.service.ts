import { Injectable, inject } from '@angular/core';
import { CLOUD_SETTINGS } from '../settings/cloud-settings';
import { LoggingService, LogCategory } from './logging.service';
import { UserIdentity } from '../types/identity';

interface CookieEnvelope {
  token: string;
  accessToken?: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  profile?: UserIdentity | null;
}

@Injectable({ providedIn: 'root' })
export class SessionCookieLandingService {
  private static readonly COOKIE_NAME = 'atropello-session';
  private static readonly COOKIE_TTL_MS = 60 * 60 * 1000; // 1 hour fallback
  private static readonly KEY_STORAGE = 'session.cookie.key.v1';
  private readonly settings = inject(CLOUD_SETTINGS);
  private readonly logger = inject(LoggingService);

  async writeTokens(idToken: string, accessToken?: string | null, profile?: UserIdentity | null): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }

    try {
      const payload: CookieEnvelope = {
        token: idToken,
        accessToken: accessToken ?? undefined,
        issuedAt: Date.now(),
        expiresAt: Date.now() + SessionCookieLandingService.COOKIE_TTL_MS,
        nonce: this.randomNonce(),
        profile: profile ?? null
      };
      const serialized = JSON.stringify(payload);
      const encrypted = await this.encrypt(serialized);
      const cookieValue = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
      const domain = this.settings.hostedUiDomain ? this.normalizeDomain(this.settings.hostedUiDomain) : '.atropello-games.es';
      const cookie = `${SessionCookieLandingService.COOKIE_NAME}=${cookieValue}; Path=/; Domain=${domain}; Secure; SameSite=None; Max-Age=${Math.floor(SessionCookieLandingService.COOKIE_TTL_MS / 1000)}`;
      document.cookie = cookie;
      this.logger.info(LogCategory.CONFIGURATION, 'Shared session cookie updated');
    } catch (error) {
      this.logger.error(LogCategory.CONFIGURATION, 'Failed to write session cookie', error);
    }
  }

  async readTokens(): Promise<CookieEnvelope | null> {
    if (typeof document === 'undefined') {
      return null;
    }

    try {
      const raw = this.getCookieValue(SessionCookieLandingService.COOKIE_NAME);
      if (!raw) {
        return null;
      }
      const binary = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const decrypted = await this.decrypt(binary.buffer);
      return JSON.parse(new TextDecoder().decode(decrypted)) as CookieEnvelope;
    } catch (error) {
      this.logger.warn(LogCategory.CONFIGURATION, 'Unable to read shared session cookie', error);
      return null;
    }
  }

  clearCookie(): void {
    if (typeof document === 'undefined') {
      return;
    }
    const domain = this.settings.hostedUiDomain ? this.normalizeDomain(this.settings.hostedUiDomain) : '.atropello-games.es';
    document.cookie = `${SessionCookieLandingService.COOKIE_NAME}=; Path=/; Domain=${domain}; Max-Age=0; Secure; SameSite=None`;
  }

  private getCookieValue(name: string): string | null {
    const cookies = document.cookie?.split(';') ?? [];
    for (const entry of cookies) {
      const [cookieName, ...value] = entry.trim().split('=');
      if (cookieName === name) {
        return value.join('=');
      }
    }
    return null;
  }

  private async encrypt(content: string): Promise<ArrayBuffer> {
    const key = await this.getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(content);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const result = new Uint8Array(iv.length + cipher.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(cipher), iv.length);
    return result.buffer;
  }

  private async decrypt(payload: ArrayBuffer): Promise<ArrayBuffer> {
    const key = await this.getOrCreateKey();
    const buffer = new Uint8Array(payload);
    const iv = buffer.slice(0, 12);
    const data = buffer.slice(12);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  }

  private async getOrCreateKey(): Promise<CryptoKey> {
    const storage = this.getStorage();
    if (!storage) {
      throw new Error('Storage unavailable for session key');
    }
    const existing = storage.getItem(SessionCookieLandingService.KEY_STORAGE);
    if (existing) {
      const raw = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await crypto.subtle.exportKey('raw', key);
    storage.setItem(SessionCookieLandingService.KEY_STORAGE, btoa(String.fromCharCode(...new Uint8Array(raw))));
    return key;
  }

  private normalizeDomain(hostedUiDomain: string): string {
    const domain = hostedUiDomain.replace(/^https?:\/\//i, '');
    return domain.startsWith('.') ? domain : `.${domain}`;
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return null;
      }
      return localStorage;
    } catch {
      return null;
    }
  }

  private randomNonce(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }
}
