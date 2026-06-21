import { GameEngine } from '../../GameEngine';

/**
 * Pieza reutilizable de "imagen a pantalla completa con zoom" para las animaciones que muestran una
 * lámina (void-jump, quimio-sigillum). Unifica la carga con URLs candidatas (resiliente a dónde esté el
 * asset) y el dibujo en modo cover. docs/ARQUITECTURA.md Fase 8.
 *
 * IMPORTANTE (bug de los Primigenios en blanco): `TextureManager.loadTextureFromUrl` deja un placeholder
 * BLANCO 1x1 y, ante un 404, lo cachea bajo la misma clave devolviendo `null` (y SIN registrar tamaño).
 * Por eso aquí (1) la carga usa el VALOR DE RETORNO (no `getTexture`, que daría el placeholder) y prueba
 * TODAS las URLs candidatas hasta que una resuelva de verdad; y (2) el dibujo exige tamaño real (las cargas
 * con éxito registran tamaño) — si no, NO dibuja, evitando el flash blanco.
 *
 * Tipado estructural sobre `textureManager`/`overlayRenderer` (sueltos en el engine) para no usar `any`.
 */
interface TextureManagerLike {
  getTexture?(key: string): WebGLTexture | null;
  getTextureSize?(key: string): { width: number; height: number } | null;
  loadTextureFromUrl?(key: string, url: string): Promise<WebGLTexture | null>;
}

interface OverlayRendererLike {
  drawTextureCover?(tex: WebGLTexture, width: number, height: number, zoom: number, alpha: number): void;
}

function textureManagerOf(engine: GameEngine): TextureManagerLike | null {
  return (engine.textureManager as unknown as TextureManagerLike) ?? null;
}

function overlayRendererOf(engine: GameEngine): OverlayRendererLike | null {
  return (engine.overlayRenderer as unknown as OverlayRendererLike) ?? null;
}

export class OverlayImage {
  private key: string | null = null;
  private loaded = false;

  /**
   * Carga la primera URL candidata que resuelva de verdad (textura real). Reusa una carga previa SÓLO si
   * ya hay textura real (con tamaño); un placeholder de un fallo anterior NO cuenta.
   */
  load(engine: GameEngine, key: string, urls: string[]): void {
    this.key = key;
    this.loaded = false;
    const tm = textureManagerOf(engine);
    if (!tm) {
      return;
    }
    // Reusar SOLO si ya hay una textura REAL (las cargas con éxito registran su tamaño; un 404 deja un
    // placeholder blanco SIN tamaño bajo la misma clave → no se debe reutilizar).
    if (tm.getTexture?.(key) && tm.getTextureSize?.(key)) {
      this.loaded = true;
      return;
    }
    (async () => {
      for (const url of urls) {
        try {
          // Usar el VALOR DE RETORNO (textura real en éxito, null en fallo). Mirar getTexture() daría el
          // placeholder blanco que deja un 404 y se vería BLANCO. Probamos TODAS las candidatas.
          const tex = await tm.loadTextureFromUrl?.(key, url);
          if (tex) { this.loaded = true; return; }
        } catch {
          // siguiente URL candidata
        }
      }
    })();
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Dibuja la imagen en modo "cover" con zoom y alpha. Re-consulta textura y tamaño en cada llamada. Sólo
   * dibuja imágenes REALES (con tamaño): si no hay tamaño (placeholder), NO dibuja (evita el flash blanco).
   */
  drawCover(engine: GameEngine, zoom: number, alpha: number): void {
    if (!this.loaded || !this.key || alpha <= 0) {
      return;
    }
    const tm = textureManagerOf(engine);
    const overlay = overlayRendererOf(engine);
    if (!tm || !overlay?.drawTextureCover) {
      return;
    }
    const texture = tm.getTexture?.(this.key);
    const size = tm.getTextureSize?.(this.key);
    if (!texture || !size || !size.width || !size.height) {
      return;
    }
    try {
      overlay.drawTextureCover(texture, size.width, size.height, zoom, alpha);
    } catch {
      // best-effort: el render nunca debe romper el frame
    }
  }

  reset(): void {
    this.key = null;
    this.loaded = false;
  }
}
