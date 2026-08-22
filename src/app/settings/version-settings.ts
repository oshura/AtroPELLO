import { InjectionToken } from '@angular/core';

export interface VersionSettings {
  major: number;
  minor: number;
  build: number;
}

declare global {
  interface Window {
    __TO3_VERSION__?: Partial<VersionSettings>;
  }
}

const DEFAULT_VERSION: VersionSettings = {
  major: 0,
  minor: 0,
  build: 80
};

export const VERSION_SETTINGS = new InjectionToken<VersionSettings>('VERSION_SETTINGS', {
  providedIn: 'root',
  factory: () => resolveVersionSettings()
});

export function resolveVersionSettings(): VersionSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_VERSION;
  }
  const overrides = window.__TO3_VERSION__ ?? {};
  return {
    major: coerceVersionPart(overrides.major, DEFAULT_VERSION.major),
    minor: coerceVersionPart(overrides.minor, DEFAULT_VERSION.minor),
    build: coerceVersionPart(overrides.build, DEFAULT_VERSION.build)
  };
}

export function formatVersion(settings: VersionSettings): string {
  return `${settings.major}.${settings.minor}.${settings.build}`;
}

function coerceVersionPart(value: unknown, fallback: number): number {
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(0, Math.floor(numeric));
}
