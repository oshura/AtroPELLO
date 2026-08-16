/**
 * Convención de assets de PRESENTACIONES de cómic (docs/ESTACIONES.md §4): una presentación `base`
 * son viñetas consecutivas `assets/presentationAnimation/<base>-NN.png` (NN = 00, 01, …) con su voz
 * en `assets/audio/presentations/<base>-NN.wav` y, opcionalmente, su texto de guion/narrador en
 * `assets/presentationAnimation/<base>-NN.txt`. Basta con soltar ficheros en las carpetas: el
 * PresentationService descubre las viñetas sondeando desde 00 hasta el primer hueco. Las voces NO
 * van al `_manifest.json` (ese se precarga entero en el arranque): se cargan bajo demanda.
 */

export const PRESENTATION_IMAGE_DIR = 'assets/presentationAnimation';
export const PRESENTATION_AUDIO_DIR = 'assets/audio/presentations';
/** Tope de sondeo de viñetas (corta en el primer NN sin imagen). */
export const PRESENTATION_MAX_FRAMES = 60;

/** Identificador de viñeta: `<base>-NN` con NN a dos cifras. */
export function presentationFrameId(base: string, index: number): string {
  return `${base}-${String(index).padStart(2, '0')}`;
}

export function presentationImageUrl(base: string, index: number): string {
  return `${PRESENTATION_IMAGE_DIR}/${presentationFrameId(base, index)}.png`;
}

export function presentationVoiceUrl(base: string, index: number): string {
  return `${PRESENTATION_AUDIO_DIR}/${presentationFrameId(base, index)}.wav`;
}

/** Nombre lógico del buffer en el AudioEngine (espacio propio para no chocar con el manifest). */
export function presentationVoiceName(base: string, index: number): string {
  return `presentation:${presentationFrameId(base, index)}`;
}

export function presentationCaptionUrl(base: string, index: number): string {
  return `${PRESENTATION_IMAGE_DIR}/${presentationFrameId(base, index)}.txt`;
}

/**
 * ¿La respuesta es el index.html del SPA en vez del asset pedido? (dev server y CloudFront
 * responden el fallback de la app ante rutas inexistentes; un .txt ausente llegaría como HTML).
 */
export function looksLikeHtmlFallback(text: string): boolean {
  const head = text.slice(0, 200).trimStart().toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head');
}
