import { SuppressionWindow } from './suppression-window';

describe('SuppressionWindow', () => {
  it('arranca inactiva', () => {
    expect(new SuppressionWindow().isActive(1000)).toBe(false);
  });

  it('extend activa la ventana hasta now+windowMs', () => {
    const w = new SuppressionWindow();
    w.extend(1000, 500); // activa hasta 1500
    expect(w.isActive(1499)).toBe(true);
    expect(w.isActive(1500)).toBe(false); // estricto: now < until
  });

  it('extend se queda con el máximo (no acorta)', () => {
    const w = new SuppressionWindow();
    w.extend(1000, 1000); // hasta 2000
    w.extend(1000, 200);  // hasta 1200 < 2000 ⇒ no acorta
    expect(w.isActive(1500)).toBe(true);
  });

  it('extend con windowMs<=0 no hace nada', () => {
    const w = new SuppressionWindow();
    w.extend(1000, 0);
    w.extend(1000, -50);
    expect(w.isActive(1000)).toBe(false);
  });

  it('reset desactiva', () => {
    const w = new SuppressionWindow();
    w.extend(1000, 1000);
    w.reset();
    expect(w.isActive(1100)).toBe(false);
  });
});
