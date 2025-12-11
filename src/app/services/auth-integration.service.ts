import { Injectable, inject } from '@angular/core';
import { CloudSettings, CLOUD_SETTINGS } from '../settings/cloud-settings';

@Injectable({ providedIn: 'root' })
export class AuthIntegrationService {
  private readonly settings = inject(CLOUD_SETTINGS);

  loginWithRedirect(returnTo?: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const fallbackReturn = this.settings.defaultLogoutUri ?? window.location.origin;
    const returnTarget = this.ensureAllowedUrl(returnTo) ?? this.ensureAllowedUrl(window.location.href) ?? fallbackReturn;
    const launcherUrl = new URL(this.settings.authLauncherUrl);
    launcherUrl.searchParams.set('return', returnTarget);
    window.location.href = launcherUrl.toString();
  }

  logoutWithRedirect(returnTo?: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    const logoutUri = this.ensureAllowedUrl(returnTo) ?? this.settings.defaultLogoutUri;
    const logoutUrl = new URL('/logout', this.settings.hostedUiDomain);
    logoutUrl.searchParams.set('client_id', this.settings.userPoolClientId);
    logoutUrl.searchParams.set('logout_uri', logoutUri);
    window.location.href = logoutUrl.toString();
  }

  private ensureAllowedUrl(candidate?: string): string | null {
    if (!candidate) {
      return null;
    }
    if (candidate.startsWith('/')) {
      return typeof window !== 'undefined'
        ? `${window.location.origin}${candidate}`
        : null;
    }
    const allowed = this.settings.returnAllowlist.find(origin => candidate.startsWith(origin));
    return allowed ? candidate : null;
  }
}
