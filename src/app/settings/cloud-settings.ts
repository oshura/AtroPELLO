import { InjectionToken } from '@angular/core';

export interface CloudSettings {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  hostedUiDomain: string;
  authLauncherUrl: string;
  scopes: string[];
  defaultRedirectUri: string;
  defaultLogoutUri: string;
  returnAllowlist: string[];
  sessionCookieName: string;
  bridgeUrl: string;
  bridgeOrigin: string;
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
  scopes: ['openid', 'profile', 'email'],
  defaultRedirectUri: 'https://www.atropello-games.es/auth/callback',
  defaultLogoutUri: 'https://to3.atropello-games.es',
  returnAllowlist: ['https://www.atropello-games.es', 'https://www.atropello-games.es/auth/callback'],
  sessionCookieName: 'atropello-session',
  bridgeUrl: 'https://www.atropello-games.es/bridge.html',
  bridgeOrigin: 'https://www.atropello-games.es'  
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
  const authLauncherUrl = overrides.authLauncherUrl ?? FALLBACK_SETTINGS.authLauncherUrl;
  return {
    ...FALLBACK_SETTINGS,
    ...overrides,
    hostedUiDomain,
    authLauncherUrl,
    scopes: overrides.scopes ?? FALLBACK_SETTINGS.scopes,
    returnAllowlist: overrides.returnAllowlist ?? FALLBACK_SETTINGS.returnAllowlist
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
