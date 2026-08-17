/**
 * Convención de assets de PRESENTACIONES de cómic (docs/ESTACIONES.md §4): una presentación `base`
 * son viñetas consecutivas `assets/presentationAnimation/<base>-NN.png` (NN = 00, 01, …) con su voz
 * en `assets/audio/presentations/<base>-NN.wav` y, opcionalmente, su texto de guion/narrador en
 * `assets/presentationAnimation/<base>-NN.txt`. Basta con soltar ficheros en las carpetas: el
 * PresentationService descubre las viñetas sondeando desde 00 hasta el primer hueco. Las voces NO
 * van al `_manifest.json` (ese se precarga entero en el arranque): se cargan bajo demanda.
 */

import { resolveVersionSettings } from '../../settings/version-settings';

export const PRESENTATION_IMAGE_DIR = 'assets/presentationAnimation';
export const PRESENTATION_AUDIO_DIR = 'assets/audio/presentations';
/** Tope de sondeo de viñetas (corta en el primer NN sin imagen). */
export const PRESENTATION_MAX_FRAMES = 60;
/**
 * Cache-busting: los assets se sirven SIN Cache-Control (S3/CloudFront), así que el navegador cachea
 * heurísticamente la URL — al reemplazar un wav/png con el mismo nombre, seguiría sonando/viéndose el
 * viejo. El sufijo `?v=<build>` cambia la URL en cada build y fuerza la descarga fresca (el deploy ya
 * invalida CloudFront; esto cubre la caché del NAVEGADOR).
 */
const ASSET_VERSION = resolveVersionSettings().build;

/** Identificador de viñeta: `<base>-NN` con NN a dos cifras. */
export function presentationFrameId(base: string, index: number): string {
  return `${base}-${String(index).padStart(2, '0')}`;
}

export function presentationImageUrl(base: string, index: number): string {
  return `${PRESENTATION_IMAGE_DIR}/${presentationFrameId(base, index)}.png?v=${ASSET_VERSION}`;
}

export function presentationVoiceUrl(base: string, index: number): string {
  return `${PRESENTATION_AUDIO_DIR}/${presentationFrameId(base, index)}.wav?v=${ASSET_VERSION}`;
}

/** Nombre lógico del buffer en el AudioEngine (espacio propio para no chocar con el manifest). */
export function presentationVoiceName(base: string, index: number): string {
  return `presentation:${presentationFrameId(base, index)}`;
}

export function presentationCaptionUrl(base: string, index: number): string {
  return `${PRESENTATION_IMAGE_DIR}/${presentationFrameId(base, index)}.txt?v=${ASSET_VERSION}`;
}

/**
 * ¿La respuesta es el index.html del SPA en vez del asset pedido? (dev server y CloudFront
 * responden el fallback de la app ante rutas inexistentes; un .txt ausente llegaría como HTML).
 */
export function looksLikeHtmlFallback(text: string): boolean {
  const head = text.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head');
}
