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
    const logoutTarget = this.ensureAllowedLogoutUrl(returnTo) ?? this.settings.defaultLogoutUri;
    const launcher = this.settings.logoutLauncherUrl;
    if (launcher) {
      const logoutEntryPoint = new URL(launcher);
      logoutEntryPoint.searchParams.set('return', logoutTarget);
      window.location.href = logoutEntryPoint.toString();
      return;
    }
    const logoutUrl = new URL('/logout', this.settings.hostedUiDomain);
    logoutUrl.searchParams.set('client_id', this.settings.userPoolClientId);
    logoutUrl.searchParams.set('logout_uri', logoutTarget);
    window.location.href = logoutUrl.toString();
  }

  private ensureAllowedUrl(candidate?: string): string | null {
    const absolute = this.normalizeAbsoluteUrl(candidate);
    if (!absolute) {
      return null;
    }
    const allowed = this.settings.returnAllowlist.find(origin => absolute.startsWith(origin));
    return allowed ? absolute : null;
  }

  private ensureAllowedLogoutUrl(candidate?: string): string | null {
    const defaultList = this.settings.logoutReturnAllowlist?.length
      ? this.settings.logoutReturnAllowlist
      : [this.settings.defaultLogoutUri];
    const absolute = this.normalizeAbsoluteUrl(candidate);
    if (absolute && defaultList.some(origin => absolute.startsWith(origin))) {
      return absolute;
    }
    return defaultList[0] ?? null;
  }

  private normalizeAbsoluteUrl(candidate?: string): string | null {
    if (!candidate) {
      return null;
    }
    if (candidate.startsWith('/')) {
      return typeof window !== 'undefined'
        ? `${window.location.origin}${candidate}`
        : null;
    }
    return candidate;
  }
}
