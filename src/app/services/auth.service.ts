import { computed, Injectable, signal } from '@angular/core';
import { AuthIntegrationService } from './auth-integration.service';
import { AuthReturnService, AuthCallbackPayload } from './auth-return.service';
import { PersistedAuthSession, SessionCookieService } from './session-cookie.service';
import { UserIdentity } from '../types/identity';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenState = signal<string | null>(null);
  private readonly identityState = signal<UserIdentity | null>(null);

  readonly token = this.tokenState.asReadonly();
  readonly identity = this.identityState.asReadonly();
  readonly authenticated = computed(() => !!this.tokenState());
  readonly displayName = computed(() => {
    const identity = this.identityState();
    if (!identity) {
      return null;
    }
    return identity.displayName
      ?? identity.nickname
      ?? identity.preferredUsername
      ?? null;
  });

  constructor(
    private readonly integration: AuthIntegrationService,
    private readonly returnService: AuthReturnService,
    private readonly sessionCookie: SessionCookieService
  ) {
    this.bootstrap();
  }

  loginWithRedirect(returnTo?: string): void {
    this.integration.loginWithRedirect(returnTo ?? this.currentUrl());
  }

  logoutWithRedirect(returnTo?: string): void {
    this.sessionCookie.clear();
    this.tokenState.set(null);
    this.identityState.set(null);
    this.integration.logoutWithRedirect(returnTo ?? this.currentUrl());
  }

  getTokenSnapshot(): string | null {
    return this.tokenState();
  }

  getIdentitySnapshot(): UserIdentity | null {
    return this.identityState();
  }

  isAuthenticated(): boolean {
    return this.authenticated();
  }

  private bootstrap(): void {
    const callback = this.returnService.consumeCallback();
    if (callback) {
      this.applySession(callback);
      if (callback.redirectTo && callback.redirectTo !== this.currentUrl()) {
        window.location.replace(callback.redirectTo);
      }
      return;
    }
    const persisted = this.sessionCookie.read();
    if (persisted && persisted.expiresAt > Date.now()) {
      this.hydrate(persisted);
    } else {
      this.sessionCookie.clear();
    }
  }

  private applySession(payload: AuthCallbackPayload): void {
    const session: PersistedAuthSession = {
      token: payload.token,
      identity: payload.identity,
      expiresAt: payload.expiresAt
    };
    this.hydrate(session);
    this.sessionCookie.write(session);
  }

  private hydrate(session: PersistedAuthSession): void {
    this.tokenState.set(session.token);
    this.identityState.set(session.identity);
  }

  private currentUrl(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.location.href;
  }
}
