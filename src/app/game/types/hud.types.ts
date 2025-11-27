export interface CompassCountdownPayload {
  /** Seconds remaining for the active timed effect */
  seconds: number;
  /** Short label rendered above the countdown digits */
  label: string;
  /** Optional hex color accent for glow/details */
  accentColor?: string;
}
