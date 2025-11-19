/**
 * Text Utilities
 * 
 * Funciones comunes para manipulación de texto en el juego.
 */

/**
 * Trunca un texto a una longitud máxima usando medición de canvas.
 * Si el texto excede el ancho máximo, lo recorta y añade '…'.
 * 
 * @param text - Texto a truncar
 * @param maxWidth - Ancho máximo en píxeles
 * @param ctx - Contexto de canvas para medir (debe tener font configurado)
 * @returns Texto truncado con '…' si fue necesario
 */
export function truncateTextByWidth(
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 3 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

/**
 * Trunca un texto a un número máximo de caracteres.
 * Si el texto excede la longitud máxima, lo recorta y añade '…'.
 * 
 * @param text - Texto a truncar
 * @param maxLength - Longitud máxima en caracteres
 * @returns Texto truncado con '…' si fue necesario
 */
export function truncateTextByLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + '…';
}
