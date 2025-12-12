import { InjectionToken } from '@angular/core';

/**
 * Referencia lista para copiar en otros juegos.
 * Ajusta los valores sólo si tu dominio o IDs cambian.
 */
export interface CloudSettings {
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
  identityPoolId: string;
  hostedUiDomain: string;
  sharedCookieDomain: string;
  loginRedirectUri: string;
  logoutRedirectUri: string;
  logoutReturnAllowlist: string[];
  savesApiBaseUrl: string;
  returnAllowlist: string[];
  enableSavedGamesCta: boolean;
  hostedUiScopes: string[];
}

export const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_LUb5DU8t5',
  userPoolWebClientId: '6rokvnv3eveofdjb1vlmsrqhkp',
  identityPoolId: '',
  hostedUiDomain: 'auth.atropello-games.es',
  sharedCookieDomain: '.atropello-games.es',
  loginRedirectUri: 'https://www.atropello-games.es/auth/callback',
  logoutRedirectUri: 'https://www.atropello-games.es/',
  logoutReturnAllowlist: ['https://www.atropello-games.es/'],
  savesApiBaseUrl: 'https://api.atropello-games.es/cloud-saves',
  returnAllowlist: ['https://www.atropello-games.es', 'https://to3.atropello-games.es'],
  enableSavedGamesCta: true,
  hostedUiScopes: ['openid', 'email', 'profile']
};

export const CLOUD_SETTINGS = new InjectionToken<CloudSettings>('CLOUD_SETTINGS_REFERENCE', {
  providedIn: 'root',
  factory: () => DEFAULT_CLOUD_SETTINGS
});
