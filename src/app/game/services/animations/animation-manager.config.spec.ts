import { applyConfigure, applyFlashConfig } from './animation-manager.service';
import { GameAnimation } from './types';

function baseAnim(extra: Partial<GameAnimation> & Record<string, unknown> = {}): GameAnimation {
  return {
    name: 'stub',
    start: () => {},
    update: () => true,
    render: () => {},
    isBlockingInputs: () => false,
    ...extra,
  } as GameAnimation;
}

describe('animation manager config helpers', () => {
  it('applyConfigure llama a configure con los args si existe', () => {
    const configure = jasmine.createSpy('configure');
    const anim = baseAnim({ configure });
    applyConfigure(anim, { radius: 800 }, { phase: 'ground' });
    expect(configure).toHaveBeenCalledWith({ radius: 800 }, { phase: 'ground' });
  });

  it('applyConfigure es no-op si la animación no tiene configure', () => {
    const anim = baseAnim();
    expect(() => applyConfigure(anim, { x: 1 })).not.toThrow();
  });

  it('applyConfigure traga errores de configure', () => {
    const anim = baseAnim({ configure: () => { throw new Error('boom'); } });
    expect(() => applyConfigure(anim, {})).not.toThrow();
  });

  it('applyFlashConfig llama a setFlashConfig con las imágenes si existe', () => {
    const setFlashConfig = jasmine.createSpy('setFlashConfig');
    const anim = baseAnim({ setFlashConfig });
    applyFlashConfig(anim, ['/assets/YogSothoth.jpg']);
    expect(setFlashConfig).toHaveBeenCalledWith({ images: ['/assets/YogSothoth.jpg'] });
  });

  it('applyFlashConfig es no-op si no existe setFlashConfig', () => {
    const anim = baseAnim();
    expect(() => applyFlashConfig(anim, ['x'])).not.toThrow();
  });
});
