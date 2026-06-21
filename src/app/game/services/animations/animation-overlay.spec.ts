import { OverlayImage } from './animation-overlay';
import { GameEngine } from '../../GameEngine';

const fakeTex = {} as WebGLTexture;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function engineWith(textureManager: unknown, overlayRenderer: unknown): GameEngine {
  return { textureManager, overlayRenderer } as unknown as GameEngine;
}

describe('OverlayImage', () => {
  it('load reusa una textura real ya cargada (con tamaño)', () => {
    const tm = {
      getTexture: () => fakeTex,
      getTextureSize: () => ({ width: 800, height: 600 }),
    };
    const img = new OverlayImage();
    img.load(engineWith(tm, null), 'k', ['/assets/x.webp']);
    expect(img.ready).toBe(true);
  });

  it('NO reusa un placeholder de un fallo anterior (textura sin tamaño)', async () => {
    // getTexture devuelve el placeholder blanco, pero sin tamaño ⇒ no debe darse por cargada al instante.
    const tm = {
      getTexture: () => fakeTex,
      getTextureSize: () => null,
      loadTextureFromUrl: () => Promise.resolve(null), // y todas las URLs fallan
    };
    const img = new OverlayImage();
    img.load(engineWith(tm, null), 'k', ['/assets/x.webp', '/app/assets/x.webp']);
    await tick();
    expect(img.ready).toBe(false);
  });

  it('queda lista usando el VALOR DE RETORNO de loadTextureFromUrl (no getTexture)', async () => {
    const tm = {
      getTexture: () => null, // getTexture devolvería el placeholder/null...
      getTextureSize: () => null,
      loadTextureFromUrl: () => Promise.resolve(fakeTex), // ...pero el retorno indica éxito
    };
    const img = new OverlayImage();
    img.load(engineWith(tm, null), 'k', ['/assets/x.webp']);
    await tick();
    expect(img.ready).toBe(true);
  });

  it('prueba todas las URLs candidatas hasta que una resuelve', async () => {
    let calls = 0;
    const tm = {
      getTexture: () => null,
      getTextureSize: () => null,
      loadTextureFromUrl: () => { calls++; return Promise.resolve(calls >= 2 ? fakeTex : null); },
    };
    const img = new OverlayImage();
    img.load(engineWith(tm, null), 'k', ['/assets/x.webp', '/app/assets/x.webp', '/src/app/assets/x.webp']);
    await tick();
    expect(img.ready).toBe(true);
    expect(calls).toBe(2); // paró en la 2ª (la que resolvió)
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

  it('drawCover NO dibuja un placeholder sin tamaño (evita el flash blanco)', async () => {
    const tm = {
      getTexture: () => fakeTex,
      getTextureSize: () => null, // sin tamaño = placeholder
      loadTextureFromUrl: () => Promise.resolve(fakeTex),
    };
    const drawTextureCover = jasmine.createSpy('drawTextureCover');
    const engine = engineWith(tm, { drawTextureCover });
    const img = new OverlayImage();
    img.load(engine, 'k', ['/x']);
    await tick();
    expect(img.ready).toBe(true);
    img.drawCover(engine, 1.0, 1.0);
    expect(drawTextureCover).not.toHaveBeenCalled();
  });

  it('drawCover no hace nada con alpha<=0', () => {
    const tm = { getTexture: () => fakeTex, getTextureSize: () => ({ width: 10, height: 10 }) };
    const drawTextureCover = jasmine.createSpy('drawTextureCover');
    const engine = engineWith(tm, { drawTextureCover });
    const img = new OverlayImage();
    img.load(engine, 'k', ['/x']);
    img.drawCover(engine, 1.0, 0);
    expect(drawTextureCover).not.toHaveBeenCalled();
  });
});
