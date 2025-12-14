import { InjectionToken } from '@angular/core';

export interface LandingSettings {
  landingUrl: string;
}

export const DEFAULT_LANDING_URL = 'https://www.atropello-games.es';

declare global {
  interface Window {
    __TO3_LANDING_SETTINGS__?: Partial<LandingSettings>;
  }
}

export function normalizeLandingUrl(candidate?: string | null): string {
  if (!candidate) {
    return DEFAULT_LANDING_URL;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return DEFAULT_LANDING_URL;
  }
  const prefixed = /^(https?:)?\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`;
  try {
    return new URL(prefixed).toString();
  } catch {
    return DEFAULT_LANDING_URL;
  }
}

export function resolveLandingSettings(overrides?: Partial<LandingSettings>): LandingSettings {
  const source =
    overrides ??
    (typeof window !== 'undefined' ? window.__TO3_LANDING_SETTINGS__ : undefined) ??
    {};
  return {
    landingUrl: normalizeLandingUrl(source.landingUrl)
  };
}

export const LANDING_SETTINGS = new InjectionToken<LandingSettings>('LANDING_SETTINGS', {
  providedIn: 'root',
  factory: () => resolveLandingSettings()
});
