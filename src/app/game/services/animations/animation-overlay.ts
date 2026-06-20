import { GameEngine } from '../../GameEngine';

/**
 * Pieza reutilizable de "imagen a pantalla completa con zoom" para las animaciones que muestran una
 * lámina (void-jump, gate-rite, quimio-sigillum). Unifica la carga con URLs candidatas (resiliente a
 * dónde esté el asset) y el dibujo en modo cover. docs/ARQUITECTURA.md Fase 8.
 *
 * Tipado estructural sobre `textureManager`/`overlayRenderer` (sueltos en el engine) para no usar `any`.
 */
interface TextureManagerLike {
  getTexture?(key: string): WebGLTexture | null;
  getTextureSize?(key: string): { width: number; height: number } | null;
  loadTextureFromUrl?(key: string, url: string): Promise<unknown>;
}

interface OverlayRendererLike {
  drawTextureCover?(tex: WebGLTexture, width: number, height: number, zoom: number, alpha: number): void;
  drawSolid?(color: [number, number, number], alpha: number): void;
}

function textureManagerOf(engine: GameEngine): TextureManagerLike | null {
  return (engine.textureManager as unknown as TextureManagerLike) ?? null;
}

function overlayRendererOf(engine: GameEngine): OverlayRendererLike | null {
  return (engine.overlayRenderer as unknown as OverlayRendererLike) ?? null;
}

export class OverlayImage {
  private texture: WebGLTexture | null = null;
  private size = { width: 1024, height: 1024 };

  /**
   * Carga la primera URL que resuelva, registrando la textura bajo `key`. Si ya existe la adjunta.
   * En fallo intenta recuperar la textura (TextureManager registra un placeholder) — igual que antes.
   */
  load(engine: GameEngine, key: string, urls: string[]): void {
    const tm = textureManagerOf(engine);
    if (!tm) {
      return;
    }
    const attach = (tex: WebGLTexture) => {
      this.texture = tex;
      const s = tm.getTextureSize?.(key);
      if (s && s.width && s.height) {
        this.size = { width: s.width, height: s.height };
      }
    };

    const existing = tm.getTexture?.(key) ?? null;
    if (existing) {
      attach(existing);
      return;
    }

    (async () => {
      for (const url of urls) {
        try {
          await tm.loadTextureFromUrl?.(key, url);
          const tex = tm.getTexture?.(key) ?? null;
          if (tex) { attach(tex); return; }
        } catch {
          const tex = tm.getTexture?.(key) ?? null;
          if (tex) { attach(tex); return; }
        }
      }
    })();
  }

  get ready(): boolean {
    return this.texture !== null;
  }

  /** Dibuja la imagen en modo "cover" con zoom y alpha (no hace nada si no está cargada o alpha<=0). */
  drawCover(engine: GameEngine, zoom: number, alpha: number): void {
    if (!this.texture || alpha <= 0) {
      return;
    }
    const overlay = overlayRendererOf(engine);
    if (!overlay?.drawTextureCover) {
      return;
    }
    try {
      overlay.drawTextureCover(this.texture, this.size.width, this.size.height, zoom, alpha);
    } catch {
      // best-effort: el render nunca debe romper el frame
    }
  }

  reset(): void {
    this.texture = null;
    this.size = { width: 1024, height: 1024 };
  }
}
