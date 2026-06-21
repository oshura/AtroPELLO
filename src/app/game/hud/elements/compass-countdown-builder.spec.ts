import { buildCompassCountdownPayload } from './compass-countdown-builder';

describe('buildCompassCountdownPayload', () => {
  it('null si no hay efectos activos', () => {
    expect(buildCompassCountdownPayload(1000, {
      voidCocoonActiveUntilMs: null, speedRiteUntilMs: null, speedRiteActive: false,
    })).toBeNull();
  });

  it('Void Cocoon activo ⇒ payload COCOON con segundos restantes', () => {
    const p = buildCompassCountdownPayload(1000, {
      voidCocoonActiveUntilMs: 4000, speedRiteUntilMs: null, speedRiteActive: false,
    });
    expect(p).toEqual({ seconds: 3, label: 'COCOON', accentColor: '#6ef6ff' });
  });

  it('Speed Rite activo ⇒ payload SPEED RITE', () => {
    const p = buildCompassCountdownPayload(1000, {
      voidCocoonActiveUntilMs: null, speedRiteUntilMs: 3000, speedRiteActive: true,
    });
    expect(p!.label).toBe('SPEED RITE');
    expect(p!.seconds).toBe(2);
  });

  it('Speed Rite con timestamp pero no activo ⇒ null', () => {
    expect(buildCompassCountdownPayload(1000, {
      voidCocoonActiveUntilMs: null, speedRiteUntilMs: 3000, speedRiteActive: false,
    })).toBeNull();
  });

  it('ambos activos ⇒ gana el Cocoon (prioridad 1 < 3)', () => {
    const p = buildCompassCountdownPayload(1000, {
      voidCocoonActiveUntilMs: 5000, speedRiteUntilMs: 9000, speedRiteActive: true,
    });
    expect(p!.label).toBe('COCOON');
  });

  it('countdown ya expirado (now >= until) no cuenta', () => {
    expect(buildCompassCountdownPayload(5000, {
      voidCocoonActiveUntilMs: 5000, speedRiteUntilMs: null, speedRiteActive: false,
    })).toBeNull();
  });
});
