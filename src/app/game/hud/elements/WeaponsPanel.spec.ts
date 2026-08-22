import { WeaponsPanel } from './WeaponsPanel';
import { WeaponKind, WeaponsHudSnapshot } from '../../types/weapon.types';

/** Contexto 2D falso que anota las llamadas de dibujo relevantes. */
function makeCtx() {
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    scale: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y }),
    set fillStyle(value: string) {
      fillStyles.push(value);
    },
    get fillStyle() {
      return fillStyles[fillStyles.length - 1] ?? '';
    },
    set strokeStyle(value: string) {
      strokeStyles.push(value);
    },
    get strokeStyle() {
      return strokeStyles[strokeStyles.length - 1] ?? '';
    },
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, strokeStyles };
}

function snapshot(overrides: Partial<WeaponsHudSnapshot> = {}): WeaponsHudSnapshot {
  return {
    entries: [
      { label: 'Gauss de hielo', kind: WeaponKind.PROJECTILE, selected: true, cooldownPct: 0, ammoLabel: '1∅' },
    ],
    slotsMax: 2,
    guidedCount: 0,
    ...overrides,
  };
}

describe('WeaponsPanel', () => {
  it('conserva las dimensiones que anclan el layout del HUD', () => {
    // Salud y energía del vacío se colocan a partir de estas medidas: no pueden cambiar.
    expect(new WeaponsPanel().getDimensions()).toEqual({ width: 182, height: 140 });
  });

  it('sin armas mantiene el "NO WEAPONS" centrado', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();

    panel.update(null);
    panel.render(ctx, { x: 28, y: 52 });

    expect(texts.map(t => t.text)).toEqual(['NO WEAPONS']);
  });

  it('un snapshot vacío también muestra "NO WEAPONS"', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();

    panel.update(snapshot({ entries: [] }));
    panel.render(ctx, { x: 28, y: 52 });

    expect(texts.map(t => t.text)).toEqual(['NO WEAPONS']);
  });

  it('lista el arma con su munición y el contador de slots', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();

    panel.update(snapshot());
    panel.render(ctx, { x: 28, y: 52 });

    const rendered = texts.map(t => t.text);
    expect(rendered).toContain('Gauss de hielo');
    expect(rendered).toContain('1∅');
    expect(rendered).toContain('[R] 1/2');
  });

  it('marca la seleccionada con el cian del grimorio', () => {
    const panel = new WeaponsPanel();
    const { ctx, strokeStyles } = makeCtx();

    panel.update(
      snapshot({
        entries: [
          { label: 'Uno', kind: WeaponKind.PROJECTILE, selected: false, cooldownPct: 0, ammoLabel: null },
          { label: 'Dos', kind: WeaponKind.BEAM, selected: true, cooldownPct: 0.5, ammoLabel: null },
        ],
      })
    );
    panel.render(ctx, { x: 28, y: 52 });

    expect(strokeStyles).toContain('#00c5ff');
    expect(strokeStyles).toContain('#00e0ff');
  });

  it('anuncia los proyectiles guiados vivos', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();

    panel.update(snapshot({ guidedCount: 3 }));
    panel.render(ctx, { x: 28, y: 52 });

    expect(texts.map(t => t.text)).toContain('GUIADO x3');
  });

  it('no dibuja más de cinco filas aunque haya más armas', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();
    const entries = Array.from({ length: 8 }, (_, i) => ({
      label: `Arma ${i}`,
      kind: WeaponKind.PROJECTILE,
      selected: i === 0,
      cooldownPct: 0,
      ammoLabel: null,
    }));

    panel.update(snapshot({ entries, slotsMax: 8 }));
    panel.render(ctx, { x: 28, y: 52 });

    const labels = texts.map(t => t.text).filter(t => t.startsWith('Arma'));
    expect(labels.length).toBe(5);
  });

  it('recorta los nombres que no caben', () => {
    const panel = new WeaponsPanel();
    const { ctx, texts } = makeCtx();

    panel.update(
      snapshot({
        entries: [
          {
            label: 'Cañón de plasma de resonancia abisal extendido',
            kind: WeaponKind.PROJECTILE,
            selected: false,
            cooldownPct: 0,
            ammoLabel: null,
          },
        ],
      })
    );
    panel.render(ctx, { x: 28, y: 52 });

    const label = texts.find(t => t.text.startsWith('Cañón'));
    expect(label?.text.endsWith('…')).toBe(true);
  });
});
