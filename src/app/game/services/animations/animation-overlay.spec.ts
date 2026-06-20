import { OverlayImage } from './animation-overlay';
import { GameEngine } from '../../GameEngine';

const fakeTex = {} as WebGLTexture;

function engineWith(textureManager: unknown, overlayRenderer: unknown): GameEngine {
  return { textureManager, overlayRenderer } as unknown as GameEngine;
}

describe('OverlayImage', () => {
  it('load adjunta una textura ya existente y su tamaño', () => {
    const tm = {
      getTexture: () => fakeTex,
      getTextureSize: () => ({ width: 800, height: 600 }),
    };
    const img = new OverlayImage();
    img.load(engineWith(tm, null), 'k', ['/assets/x.webp']);
    expect(img.ready).toBe(true);
  });

  it('sin textureManager no carga', () => {
    const img = new OverlayImage();
    img.load(engineWith(null, null), 'k', ['/assets/x.webp']);
    expect(img.ready).toBe(false);
  });

  it('drawCover dibuja con tamaño/zoom/alpha cuando está lista', () => {
    const tm = {
      getTexture: () => fakeTex,
      getTextureSize: () => ({ width: 800, height: 600 }),
    };
    const drawTextureCover = jasmine.createSpy('drawTextureCover');
    const engine = engineWith(tm, { drawTextureCover });
    const img = new OverlayImage();
    img.load(engine, 'k', ['/assets/x.webp']);
    img.drawCover(engine, 1.2, 0.8);
    expect(drawTextureCover).toHaveBeenCalledWith(fakeTex, 800, 600, 1.2, 0.8);
  });

  it('drawCover no hace nada si no está lista o alpha<=0', () => {
    const drawTextureCover = jasmine.createSpy('drawTextureCover');
    const engine = engineWith({ getTexture: () => null }, { drawTextureCover });
    const img = new OverlayImage();
    img.load(engine, 'k', ['/assets/x.webp']); // no existe ⇒ async, sigue no-ready
    img.drawCover(engine, 1.2, 0.8);
    expect(drawTextureCover).not.toHaveBeenCalled();

    // lista pero alpha 0
    const tm2 = { getTexture: () => fakeTex, getTextureSize: () => ({ width: 10, height: 10 }) };
    const engine2 = engineWith(tm2, { drawTextureCover });
    const img2 = new OverlayImage();
    img2.load(engine2, 'k', ['/x']);
    img2.drawCover(engine2, 1.0, 0);
    expect(drawTextureCover).not.toHaveBeenCalled();
  });
});
