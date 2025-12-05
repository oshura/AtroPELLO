export interface CompassCountdownPayload {
  /** Seconds remaining for the active timed effect */
  seconds: number;
  /** Short label rendered above the countdown digits */
  label: string;
  /** Optional hex color accent for glow/details */
  accentColor?: string;
}

export enum HudMarqueeEventType {
  RESPAWN = 'respawn',
  SYSTEM = 'system',
  LANDING_SEQUENCE = 'landing-sequence',
  TAKEOFF_SEQUENCE = 'takeoff-sequence',
  SHIP_DAMAGE = 'ship-damage',
  HAZARD = 'hazard',
  PORTAL = 'portal',
  LESSER_BEING = 'lesser-being',
  VOID_RITUAL = 'void-ritual',
  WARNING = 'warning',
}

export interface HudMarqueeEventOptions {
  /** Force emission even if throttle has not elapsed */
  force?: boolean;
  /** Use custom dedupe key, defaults to `${type}-${message}` */
  dedupeKey?: string;
  /** Allow duplicates even when the dedupe key matches */
  allowDuplicate?: boolean;
  /** Override default priority (lower number = higher priority) */
  priorityOverride?: number;
  /** Override number of loops the message should stay visible (defaults to config) */
  loops?: number;
}
