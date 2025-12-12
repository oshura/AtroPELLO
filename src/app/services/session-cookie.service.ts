import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { CloudSettings, CLOUD_SETTINGS } from '../settings/cloud-settings';
import { UserIdentity } from '../types/identity';

export interface PersistedAuthSession {
  token: string;
  identity: UserIdentity | null;
  expiresAt: number;
}

const STORAGE_KEY = 'to3.auth.session';

interface SharedCookiePayload {
  token: string;
  expiresAt: number;
  issuedAt?: number;
  accessToken?: string;
  identity?: UserIdentity | null;
  profile?: UserIdentity | null;
}

@Injectable({ providedIn: 'root' })
export class SessionCookieService {
  private readonly document = inject(DOCUMENT);
  private readonly settings = inject(CLOUD_SETTINGS);

  read(): PersistedAuthSession | null {
    if (typeof window === 'undefined') {
      return null;
    }
    return this.readCookie() ?? this.readStorage();
  }

  write(session: PersistedAuthSession): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.persistCookie(session);
    this.persistStorage(session);
  }

  clear(): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.clearCookie();
    this.clearStorage();
  }

  private readCookie(): PersistedAuthSession | null {
    if (!this.document) {
      return null;
    }
    const value = this.getCookie(this.settings.sessionCookieName);
    if (!value) {
      return null;
    }
    return this.decodeSharedCookie(value);
  }

  private readStorage(): PersistedAuthSession | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as PersistedAuthSession;
    } catch {
      return null;
    }
  }

  private persistCookie(session: PersistedAuthSession): void {
    if (!this.document) {
      return;
    }
    try {
      const encoded = this.encodeSessionPayload(session);
      const maxAge = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
      const domain = this.resolveCookieDomain();
      const cookieParts = [
        `${this.settings.sessionCookieName}=${encodeURIComponent(encoded)}`,
        'path=/',
        `max-age=${maxAge}`,
        'SameSite=None',
        'Secure'
      ];
      if (domain) {
        cookieParts.push(`domain=${domain}`);
      }
      this.document.cookie = cookieParts.join('; ');
    } catch {
      // Ignore cookie errors (private browsing, etc.)
    }
  }

  private persistStorage(session: PersistedAuthSession): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage quota errors
    }
  }

  private clearCookie(): void {
    if (!this.document) {
      return;
    }
    const domain = this.resolveCookieDomain();
    const parts = [
      `${this.settings.sessionCookieName}=`,
      'path=/',
      'max-age=0',
      'SameSite=None',
      'Secure'
    ];
    if (domain) {
      parts.push(`domain=${domain}`);
    }
    this.document.cookie = parts.join('; ');
  }

  private clearStorage(): void {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  private getCookie(name: string): string | null {
    if (!this.document) {
      return null;
    }
    const target = `${name}=`;
    const entries = this.document.cookie?.split(';') ?? [];
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (trimmed.startsWith(target)) {
        return decodeURIComponent(trimmed.substring(target.length));
      }
    }
    return null;
  }

  private resolveCookieDomain(): string | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const configured = this.settings.sessionCookieDomain?.trim();
    const host = window.location.hostname;
    if (configured) {
      if (host === 'localhost' || host === '127.0.0.1') {
        return undefined;
      }
      const normalized = configured.startsWith('.') ? configured : `.${configured}`;
      return normalized;
    }
    if (host.endsWith('atropello-games.es')) {
      return '.atropello-games.es';
    }
    return undefined;
  }

  private decodeSharedCookie(rawValue: string): PersistedAuthSession | null {
    const payloadSegment = this.extractPayloadSegment(rawValue);
    if (!payloadSegment) {
      return null;
    }
    try {
      const decoded = atob(payloadSegment);
      const parsed = JSON.parse(decoded) as SharedCookiePayload;
      return this.normalizeSharedPayload(parsed);
    } catch {
      return null;
    }
  }

  private extractPayloadSegment(value: string): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const separatorIndex = trimmed.indexOf('.');
    if (separatorIndex === -1) {
      return trimmed;
    }
    return trimmed.slice(0, separatorIndex);
  }

  private normalizeSharedPayload(payload: SharedCookiePayload | null): PersistedAuthSession | null {
    if (!payload || !payload.token || !payload.expiresAt) {
      return null;
    }
    const identity = payload.identity ?? payload.profile ?? null;
    return {
      token: payload.token,
      identity,
      expiresAt: payload.expiresAt
    };
  }

  private encodeSessionPayload(session: PersistedAuthSession): string {
    const payload: SharedCookiePayload = {
      token: session.token,
      expiresAt: session.expiresAt,
      issuedAt: Date.now(),
      identity: session.identity,
      profile: session.identity
    };
    return btoa(JSON.stringify(payload));
  }
}
