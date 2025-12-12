import { ApplicationConfig, APP_INITIALIZER, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AudioManifestService } from './services/audio/audio-manifest.service';
import { CloudSavesService } from './libs/cloud-saves/cloud-saves.service';
import { CLOUD_SAVES_GAME_CONTEXT, CLOUD_SAVES_SESSION_BRIDGE, CLOUD_SAVES_SETTINGS } from './libs/cloud-saves/cloud-saves.tokens';
import { CloudSavesSessionBridgeService } from './libs/cloud-saves/cloud-saves-session-bridge.service';
import { CloudSettings, CLOUD_SETTINGS, resolveCloudSettings } from './settings/cloud-settings';

function initAudioManifest(manifest: AudioManifestService) {
  return () => manifest.init();
}

const baseCloudSettings = resolveCloudSettings();
const env = typeof import.meta !== 'undefined' && import.meta ? import.meta.env ?? {} : {};

function parseAllowlist(value: unknown): string[] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const entries = value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
  return entries.length ? entries : undefined;
}

const logoutAllowlistOverride = parseAllowlist(env['NG_APP_LOGOUT_ALLOWLIST']);

const cloudSettings: CloudSettings = {
  ...baseCloudSettings,
  region: env['NG_APP_COGNITO_REGION'] ?? baseCloudSettings.region,
  userPoolId: env['NG_APP_COGNITO_USER_POOL_ID'] ?? baseCloudSettings.userPoolId,
  userPoolClientId: env['NG_APP_COGNITO_CLIENT_ID'] ?? baseCloudSettings.userPoolClientId,
  hostedUiDomain: env['NG_APP_COGNITO_DOMAIN'] ?? baseCloudSettings.hostedUiDomain,
  defaultRedirectUri: env['NG_APP_COGNITO_REDIRECT_URI'] ?? baseCloudSettings.defaultRedirectUri,
  defaultLogoutUri: env['NG_APP_COGNITO_LOGOUT_URI'] ?? baseCloudSettings.defaultLogoutUri,
  authLauncherUrl: env['NG_APP_AUTH_LAUNCH_URL'] ?? baseCloudSettings.authLauncherUrl,
  logoutLauncherUrl: env['NG_APP_AUTH_LOGOUT_URL'] ?? baseCloudSettings.logoutLauncherUrl,
  logoutReturnAllowlist: logoutAllowlistOverride ?? baseCloudSettings.logoutReturnAllowlist
};

const cloudSavesApiBase = env['NG_APP_CLOUD_SAVES_API'] ?? 'https://api.atropello-games.es/cloud-saves';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(),
    { provide: APP_INITIALIZER, useFactory: initAudioManifest, deps: [AudioManifestService], multi: true },
    CloudSavesService,
    CloudSavesSessionBridgeService,
    { provide: CLOUD_SETTINGS, useValue: cloudSettings },
    {
      provide: CLOUD_SAVES_SETTINGS,
      useValue: {
        apiBaseUrl: cloudSavesApiBase,
        mockLatencyMs: 0
      }
    },
    { provide: CLOUD_SAVES_GAME_CONTEXT, useValue: { gameId: 'to3' } },
    { provide: CLOUD_SAVES_SESSION_BRIDGE, useExisting: CloudSavesSessionBridgeService }
  ]
};
