import { Injectable, inject } from '@angular/core';
import { CloudSettings, CLOUD_SETTINGS } from '../settings/cloud-settings';
import { UserIdentity } from '../types/identity';

export interface AuthCallbackPayload {
  token: string;
  expiresAt: number;
  identity: UserIdentity;
  redirectTo: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthReturnService {
  private readonly settings = inject(CLOUD_SETTINGS);

  consumeCallback(): AuthCallbackPayload | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const hash = window.location.hash?.replace(/^#/, '') ?? '';
    if (!hash) {
      return null;
    }
    const params = new URLSearchParams(hash);
    const token = params.get('id_token');
    if (!token) {
      return null;
    }
    const expiresIn = Number(params.get('expires_in') ?? '3600');
    const redirectTo = this.sanitizeReturn(params.get('state'));
    this.clearLocationHash();
    return {
      token,
      expiresAt: Date.now() + Math.max(0, expiresIn) * 1000,
      identity: this.decodeIdentity(token),
      redirectTo
    };
  }

  private clearLocationHash(): void {
    if (typeof window === 'undefined') {
      return;
    }
    const { pathname, search } = window.location;
    const title = typeof document !== 'undefined' ? document.title : '';
    window.history.replaceState({}, title, `${pathname}${search}`);
  }

  private decodeIdentity(idToken: string): UserIdentity {
    try {
      const payload = idToken.split('.')[1] ?? '';
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const decoded = JSON.parse(atob(padded));
      return {
        userId: decoded['sub'] ?? 'unknown',
        displayName: decoded['name'] ?? decoded['preferred_username'] ?? decoded['nickname'] ?? null,
        nickname: decoded['nickname'] ?? null,
        preferredUsername: decoded['preferred_username'] ?? null,
        email: decoded['email'] ?? null
      };
    } catch {
      return {
        userId: 'unknown',
        displayName: null,
        nickname: null,
        preferredUsername: null,
        email: null
      };
    }
  }

  private sanitizeReturn(candidate: string | null): string | null {
    if (!candidate) {
      return null;
    }
    if (candidate.startsWith('/')) {
      return typeof window !== 'undefined' ? `${window.location.origin}${candidate}` : null;
    }
    const allowed = this.settings.returnAllowlist.find(origin => candidate.startsWith(origin));
    return allowed ? candidate : null;
  }
}
