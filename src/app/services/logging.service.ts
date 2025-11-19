import { Injectable } from '@angular/core';

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  OFF = 5,
}

// Refreshed taxonomy (legacy aliases removed):
// NOTE: Keep names already in use elsewhere (HUD, TARGETING, AUDIO, etc.) to minimize refactor scope.
export enum LogCategory {
  GAME_INITIALIZATION = 'GAME_INITIALIZATION',
  CONFIGURATION = 'CONFIGURATION',
  GAME_LOOP = 'GAME_LOOP',
  RENDER = 'RENDER',
  SHADERS = 'SHADERS',
  ASSETS = 'ASSETS',
  HUD = 'HUD',
  TARGETING = 'TARGETING',
  ANIMATION = 'ANIMATION',
  SOLAR_SYSTEM_GENERATION = 'SOLAR_SYSTEM_GENERATION',
  AUDIO = 'AUDIO',
  MUSIC = 'MUSIC',
  PERFORMANCE = 'PERFORMANCE',
  DEBUG = 'DEBUG',
  PORTAL = 'PORTAL',
  INPUT = 'INPUT',
  LANDING = 'LANDING',
  TEXTURE = 'TEXTURE',
  PARTICLES = 'PARTICLES',
  COLLISION_PHYSICS = 'COLLISION_PHYSICS'  // Nueva categoría para física de colisiones
}

export interface LogEntry {
  time: number;            // performance.now timestamp
  level: LogLevel;         // severity
  category: LogCategory;   // functional area
  message: string;         // human readable message
  context?: any;           // optional metadata (object/string)
}

@Injectable({ providedIn: 'root' })
export class LoggingService {
  private static STORAGE_KEY = 'game.logging.v1';
  // Global singleton bridge for non-injectable classes (engine domain)
  private static globalInstance: LoggingService | null = null;

  private levelThreshold: LogLevel = LogLevel.INFO;
  // Start with no categories enabled by default; overlay UI or user prefs will enable them.
  private enabledCategories: Set<LogCategory> = new Set();
  private history: LogEntry[] = [];
  private maxHistory = 800; // allow a bit more history
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  constructor() {
  this.loadPreferences();
  // If no persisted categories, keep defaults (empty); otherwise use stored prefs
    // Register as global instance (first construction wins; subsequent ones overwrite for safety during HMR)
    LoggingService.globalInstance = this;
  }

  // ===== Global bridge helpers =====
  static setGlobalInstance(instance: LoggingService) { LoggingService.globalInstance = instance; }
  static getGlobalInstance(): LoggingService | null { return LoggingService.globalInstance; }

  // ===== Preferences (persisted) =====
  setLevelThreshold(level: LogLevel) {
    this.levelThreshold = level;
    this.savePreferences();
  }
  getLevelThreshold(): LogLevel { return this.levelThreshold; }

  enableCategory(cat: LogCategory) {
    this.enabledCategories.add(cat);
    this.savePreferences();
  }
  disableCategory(cat: LogCategory) {
    this.enabledCategories.delete(cat);
    this.savePreferences();
  }
  isCategoryEnabled(cat: LogCategory): boolean { return this.enabledCategories.has(cat); }
  getEnabledCategories(): LogCategory[] { return Array.from(this.enabledCategories); }

  clearHistory() { this.history.length = 0; }
  getHistory() { return [...this.history]; }

  // Subscribe for UI overlays
  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // Core logging API
  log(level: LogLevel, category: LogCategory, message: string, context?: any): void {
    if (level < this.levelThreshold) return;
    if (!this.enabledCategories.has(category)) return;
    const entry: LogEntry = { time: performance.now(), level, category, message, context };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();

    // Notify listeners
    if (this.listeners.size) {
      for (const l of this.listeners) {
        try { l(entry); } catch { /* ignore listener errors */ }
      }
    }

    // Route to console with consistent formatting
    try {
      const ts = new Date().toISOString().split('T')[1];
      const prefix = `[${ts}][${LogLevel[level]}][${category}]`;
      switch (level) {
        case LogLevel.ERROR: console.error(prefix, message, context ?? ''); break;
        case LogLevel.WARN: console.warn(prefix, message, context ?? ''); break;
        case LogLevel.INFO: console.info(prefix, message, context ?? ''); break;
        case LogLevel.DEBUG: console.debug(prefix, message, context ?? ''); break;
        case LogLevel.TRACE: console.log(prefix, message, context ?? ''); break;
        default: break;
      }
    } catch { /* console may be unavailable (SSR) */ }
  }

  // Convenience helpers
  info(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.INFO, cat, msg, ctx); }
  warn(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.WARN, cat, msg, ctx); }
  error(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.ERROR, cat, msg, ctx); }
  debug(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.DEBUG, cat, msg, ctx); }
  trace(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.TRACE, cat, msg, ctx); }

  // ===== Persistence layer =====
  private savePreferences(): void {
    try {
      const data = {
        level: this.levelThreshold,
        categories: Array.from(this.enabledCategories)
      };
      localStorage.setItem(LoggingService.STORAGE_KEY, JSON.stringify(data));
    } catch { /* storage may be unavailable (SSR) */ }
  }

  private loadPreferences(): void {
    try {
      const raw = localStorage.getItem(LoggingService.STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.level === 'number') this.levelThreshold = data.level;
      if (Array.isArray(data.categories)) {
        this.enabledCategories = new Set(data.categories.filter((c: any) => Object.values(LogCategory).includes(c)));
      }
    } catch { /* ignore parse errors */ }
  }
}