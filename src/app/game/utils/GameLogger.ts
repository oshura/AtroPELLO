import { LoggingService, LogLevel, LogCategory } from '../../services/logging.service';

/**
 * Static logging bridge for non-injectable engine domain classes (GameObject, GameEngine helpers, HUDManager, etc.)
 * Falls back to console when the LoggingService global instance is not yet available.
 */
export class GameLogger {
  private static svc(): LoggingService | null {
    return LoggingService.getGlobalInstance();
  }

  static log(level: LogLevel, category: LogCategory, message: string, context?: any) {
    const svc = this.svc();
    if (svc) {
      svc.log(level, category, message, context);
    } else {
      // Fallback minimal formatting
      const prefix = `[${LogLevel[level]}][${category}]`;
      switch (level) {
        case LogLevel.ERROR: console.error(prefix, message, context ?? ''); break;
        case LogLevel.WARN: console.warn(prefix, message, context ?? ''); break;
        case LogLevel.INFO: console.info(prefix, message, context ?? ''); break;
        case LogLevel.DEBUG: console.debug(prefix, message, context ?? ''); break;
        case LogLevel.TRACE: console.log(prefix, message, context ?? ''); break;
        default: console.log(prefix, message, context ?? ''); break;
      }
    }
  }

  // Convenience wrappers
  static trace(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.TRACE, cat, msg, ctx); }
  static debug(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.DEBUG, cat, msg, ctx); }
  static info(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.INFO, cat, msg, ctx); }
  static warn(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.WARN, cat, msg, ctx); }
  static error(cat: LogCategory, msg: string, ctx?: any) { this.log(LogLevel.ERROR, cat, msg, ctx); }
}
