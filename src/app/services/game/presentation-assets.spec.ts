import {
  looksLikeHtmlFallback,
  presentationCaptionUrl,
  presentationFrameId,
  presentationImageUrl,
  presentationVoiceName,
  presentationVoiceUrl,
} from './presentation-assets';

describe('presentation-assets (convención viñeta↔voz↔subtítulo)', () => {
  it('empareja imagen, voz y subtítulo por nombre base + índice a dos cifras (con ?v= anti-caché)', () => {
    expect(presentationFrameId('Base', 0)).toBe('Base-00');
    expect(presentationFrameId('Base', 12)).toBe('Base-12');
    expect(presentationImageUrl('Base', 0)).toMatch(/^assets\/presentationAnimation\/Base-00\.png\?v=\d+$/);
    expect(presentationVoiceUrl('Base', 0)).toMatch(/^assets\/audio\/presentations\/Base-00\.wav\?v=\d+$/);
    expect(presentationCaptionUrl('Base', 3)).toMatch(/^assets\/presentationAnimation\/Base-03\.txt\?v=\d+$/);
    // El sufijo es el MISMO build en los tres (URLs consistentes entre sí).
    const v = presentationImageUrl('Base', 0).split('?v=')[1];
    expect(presentationVoiceUrl('Base', 0).endsWith(`?v=${v}`)).toBeTrue();
  });

  it('el nombre lógico del buffer no colisiona con el manifest de audio', () => {
    expect(presentationVoiceName('Base', 1)).toBe('presentation:Base-01');
  });

  it('detecta el fallback SPA (index.html servido en vez del asset)', () => {
    expect(looksLikeHtmlFallback('<!doctype html><html>…')).toBeTrue();
    expect(looksLikeHtmlFallback('  <HTML lang="es">')).toBeTrue();
    expect(looksLikeHtmlFallback('Narrador: la estación giraba en silencio.')).toBeFalse();
  });
});
