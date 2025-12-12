import { InjectionToken } from '@angular/core';

export interface CloudSettings {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  hostedUiDomain: string;
  authLauncherUrl: string;
  logoutLauncherUrl: string;
  scopes: string[];
  defaultRedirectUri: string;
  defaultLogoutUri: string;
  returnAllowlist: string[];
  logoutReturnAllowlist: string[];
  sessionCookieName: string;
  sessionCookieDomain: string;
}

declare global {
  interface Window {
    __TO3_CLOUD_SETTINGS__?: Partial<CloudSettings>;
  }
}

const FALLBACK_SETTINGS: CloudSettings = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_LUb5DU8t5',
  userPoolClientId: '6rokvnv3eveofdjb1vlmsrqhkp',
  hostedUiDomain: 'https://auth.atropello-games.es',
  authLauncherUrl: 'https://www.atropello-games.es/auth/launch',
  logoutLauncherUrl: 'https://www.atropello-games.es/auth/logout',
  scopes: ['openid', 'profile', 'email'],
  defaultRedirectUri: 'https://www.atropello-games.es/auth/callback',
  defaultLogoutUri: 'https://www.atropello-games.es/',
  returnAllowlist: ['https://www.atropello-games.es', 'https://www.atropello-games.es/auth/callback', 'https://to3.atropello-games.es'],
  logoutReturnAllowlist: ['https://www.atropello-games.es/'],
  sessionCookieName: 'atropello-session',
  sessionCookieDomain: '.atropello-games.es'
};

export const CLOUD_SETTINGS = new InjectionToken<CloudSettings>('CLOUD_SETTINGS', {
  providedIn: 'root',
  factory: () => resolveCloudSettings()
});

export function resolveCloudSettings(): CloudSettings {
  if (typeof window === 'undefined') {
    return FALLBACK_SETTINGS;
  }
  const overrides = window.__TO3_CLOUD_SETTINGS__ ?? {};
  const hostedUiDomain = normalizeDomain(overrides.hostedUiDomain ?? FALLBACK_SETTINGS.hostedUiDomain);
  const authLauncherUrl = normalizeLauncherUrl(overrides.authLauncherUrl, '/auth/launch', FALLBACK_SETTINGS.authLauncherUrl);
  const logoutLauncherUrl = normalizeLauncherUrl(overrides.logoutLauncherUrl, '/auth/logout', FALLBACK_SETTINGS.logoutLauncherUrl);
  return {
    ...FALLBACK_SETTINGS,
    ...overrides,
    hostedUiDomain,
    authLauncherUrl,
    logoutLauncherUrl,
    scopes: overrides.scopes ?? FALLBACK_SETTINGS.scopes,
    returnAllowlist: overrides.returnAllowlist ?? FALLBACK_SETTINGS.returnAllowlist,
    logoutReturnAllowlist: overrides.logoutReturnAllowlist ?? FALLBACK_SETTINGS.logoutReturnAllowlist,
    sessionCookieDomain: overrides.sessionCookieDomain ?? FALLBACK_SETTINGS.sessionCookieDomain
  };
}

function normalizeDomain(value: string): string {
  if (!value) {
    return value;
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  return `https://${value}`;
}

function normalizeLauncherUrl(value: string | undefined, forcedPath: string, fallback: string): string {
  const source = value ?? fallback;
  try {
    const url = new URL(source);
    url.pathname = forcedPath;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    try {
      const base = ensureAbsoluteUrl(source.trim());
      const url = new URL(forcedPath, base);
      return url.toString();
    } catch {
      return fallback;
    }
  }
}

function ensureAbsoluteUrl(candidate: string): string {
  if (!candidate) {
    return FALLBACK_SETTINGS.authLauncherUrl;
  }
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    return candidate;
  }
  return `https://${candidate.replace(/^\/+/, '')}`;
}
