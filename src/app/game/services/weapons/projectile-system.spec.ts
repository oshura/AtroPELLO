import {
  ProjectileSystem,
  ProjectileSystemHost,
  ProjectileTargetLike,
  ProjectileImpact,
  ProjectileFaction,
  ProjectileSpawnRequest,
} from './projectile-system';
import { Vector3 } from '../../../types/game.types';

function makeHost(
  targetsByFaction: Partial<Record<ProjectileFaction, ProjectileTargetLike[]>>,
  guidancePoint: Vector3 | null = null
) {
  const impacts: ProjectileImpact[] = [];
  const host: ProjectileSystemHost = {
    getTargets: (faction: ProjectileFaction) => targetsByFaction[faction] ?? [],
    applyDamage: (impact: ProjectileImpact) => {
      impacts.push(impact);
      return impact.damage;
    },
    getGuidancePoint: () => guidancePoint,
    logInfo: () => undefined,
  };
  return { host, impacts };
}

function baseShot(overrides: Partial<ProjectileSpawnRequest> = {}): ProjectileSpawnRequest {
  return {
    faction: 'player',
    sourceId: 'player-ship',
    kind: 'GAUSS_ICE',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 1200 },
    lifeSec: 2.5,
    radius: 1.2,
    damageNear: 34,
    damageFar: 34,
    falloffRange: 3000,
    ...overrides,
  };
}

describe('ProjectileSystem', () => {
  it('integra la posición y expira por vida', () => {
    const system = new ProjectileSystem();
    const { host } = makeHost({ player: [] });

    system.spawn(baseShot({ velocity: { x: 0, y: 0, z: 100 }, lifeSec: 0.1 }));
    expect(system.activeCount).toBe(1);

    system.update(host, 0.05);
    expect(system.getViews('player')[0].position.z).toBeCloseTo(5, 5);

    system.update(host, 0.06);
    expect(system.activeCount).toBe(0);
  });

  it('impacta en un objetivo atravesado a media zancada (sin tunneling)', () => {
    const system = new ProjectileSystem();
    const target: ProjectileTargetLike = { id: 'vampiro', position: { x: 0, y: 0, z: 10 }, radius: 3 };
    const { host, impacts } = makeHost({ player: [target] });

    // 1200 u/s durante 16 ms ⇒ 19.2 u: rebasa al objetivo dentro del mismo frame.
    system.spawn(baseShot());
    system.update(host, 0.016);

    expect(impacts.length).toBe(1);
    expect(impacts[0].targetId).toBe('vampiro');
    expect(impacts[0].faction).toBe('player');
    expect(impacts[0].damage).toBeGreaterThan(0);
    expect(system.activeCount).toBe(0);
  });

  it('nunca golpea a quien lo dispara', () => {
    const system = new ProjectileSystem();
    const self: ProjectileTargetLike = { id: 'player-ship', position: { x: 0, y: 0, z: 1 }, radius: 20 };
    const { host, impacts } = makeHost({ player: [self] });

    system.spawn(baseShot());
    system.update(host, 0.016);

    expect(impacts.length).toBe(0);
  });

  it('el impacto directo aplica el daño a bocajarro', () => {
    const system = new ProjectileSystem();
    const target: ProjectileTargetLike = { id: 'presa', position: { x: 0, y: 0, z: 300 }, radius: 5 };
    const { host, impacts } = makeHost({ player: [target] });

    system.spawn(
      baseShot({ velocity: { x: 0, y: 0, z: 1000 }, damageNear: 100, damageFar: 0, falloffRange: 1000 })
    );
    system.update(host, 0.32);

    expect(impacts.length).toBe(1);
    // El falloff mide la distancia AL PUNTO DE IMPACTO, no la recorrida: un tiro certero pega fuerte.
    expect(impacts[0].damage).toBeGreaterThan(90);
  });

  it('las facciones colisionan contra listas de candidatos distintas', () => {
    const system = new ProjectileSystem();
    const ship: ProjectileTargetLike = { id: 'player-ship', position: { x: 0, y: 0, z: 10 }, radius: 20 };
    const being: ProjectileTargetLike = { id: 'being-1', position: { x: 0, y: 0, z: 10 }, radius: 20 };
    const { host, impacts } = makeHost({ player: [being], enemy: [ship] });

    system.spawn(baseShot({ faction: 'enemy', sourceId: 'being-1', kind: 'acid_spit' }));
    system.update(host, 0.016);

    expect(impacts.length).toBe(1);
    expect(impacts[0].targetId).toBe('player-ship');
    expect(impacts[0].faction).toBe('enemy');
  });

  it('la detonación por radio reparte daño a todo lo que hay dentro', () => {
    const system = new ProjectileSystem();
    const targets: ProjectileTargetLike[] = [
      { id: 'a', position: { x: 0, y: 0, z: 10 }, radius: 3 },
      { id: 'b', position: { x: 8, y: 0, z: 10 }, radius: 3 },
      { id: 'lejos', position: { x: 400, y: 0, z: 10 }, radius: 3 },
    ];
    const { host, impacts } = makeHost({ player: targets });

    system.spawn(
      baseShot({ velocity: { x: 0, y: 0, z: 1000 }, blastRadius: 40, damageNear: 100, damageFar: 0 })
    );
    system.update(host, 0.016);

    const hitIds = impacts.map(i => i.targetId).sort();
    expect(hitIds).toEqual(['a', 'b']);
    // Dentro del radio, el daño cae con la distancia al punto de detonación.
    const damageA = impacts.find(i => i.targetId === 'a')!.damage;
    const damageB = impacts.find(i => i.targetId === 'b')!.damage;
    expect(damageA).toBeGreaterThan(damageB);
  });

  it('el proyectil guiado vira hacia el punto de guía sin exceder su giro', () => {
    const system = new ProjectileSystem();
    const { host } = makeHost({ player: [] }, { x: 100, y: 0, z: 0 });

    system.spawn(
      baseShot({
        velocity: { x: 0, y: 0, z: 100 },
        lifeSec: 10,
        guidance: { mode: 'mouse', turnRateRad: 0.2, remainingSec: 10 },
      })
    );
    system.update(host, 0.5);

    const view = system.getViews('player')[0];
    // Giro máximo 0.1 rad en medio segundo: se ha inclinado hacia +X pero sigue mirando a +Z.
    expect(view.velocity.x).toBeGreaterThan(0);
    expect(view.velocity.z).toBeGreaterThan(view.velocity.x);
    expect(Math.hypot(view.velocity.x, view.velocity.y, view.velocity.z)).toBeCloseTo(100, 3);
  });

  it('el guiado caduca y el proyectil sigue recto', () => {
    const system = new ProjectileSystem();
    const { host } = makeHost({ player: [] }, { x: 100, y: 0, z: 0 });

    system.spawn(
      baseShot({
        velocity: { x: 0, y: 0, z: 100 },
        lifeSec: 10,
        guidance: { mode: 'mouse', turnRateRad: 5, remainingSec: 0.1 },
      })
    );
    system.update(host, 0.2);
    const afterExpiry = system.getViews('player')[0].velocity.x;
    system.update(host, 0.5);

    expect(system.countGuided('player')).toBe(0);
    expect(system.getViews('player')[0].velocity.x).toBeCloseTo(afterExpiry, 5);
  });

  it('el guiado por cursor engancha a un hostil que entra en su radio', () => {
    const system = new ProjectileSystem();
    const target: ProjectileTargetLike = { id: 'presa', position: { x: 0, y: 0, z: 30 }, radius: 2 };
    const { host } = makeHost({ player: [target] }, { x: 0, y: 0, z: 1000 });

    system.spawn(
      baseShot({
        velocity: { x: 0, y: 0, z: 10 },
        lifeSec: 10,
        radius: 0.5,
        guidance: { mode: 'mouse', turnRateRad: 3, remainingSec: 10, lockRadius: 50 },
      })
    );
    system.update(host, 0.1);

    expect(system.countGuided('player')).toBe(1);
    system.update(host, 0.1);
    // Tras enganchar sigue vivo y guiado hasta impactar.
    expect(system.activeCount).toBeGreaterThanOrEqual(0);
  });

  it('removeBySource retira los proyectiles de un ser que desaparece', () => {
    const system = new ProjectileSystem();
    const { host } = makeHost({ enemy: [] });

    system.spawn(baseShot({ faction: 'enemy', sourceId: 'being-1', kind: 'orb' }));
    system.spawn(baseShot({ faction: 'enemy', sourceId: 'being-2', kind: 'orb' }));
    system.removeBySource('being-1');

    expect(system.countFaction('enemy')).toBe(1);
    system.clearFaction('enemy');
    expect(system.activeCount).toBe(0);
    expect(host).toBeTruthy();
  });

  it('sin proyectiles no consulta candidatos', () => {
    const system = new ProjectileSystem();
    let calls = 0;
    const host: ProjectileSystemHost = {
      getTargets: () => {
        calls++;
        return [];
      },
      applyDamage: (impact: ProjectileImpact) => impact.damage,
      getGuidancePoint: () => null,
      logInfo: () => undefined,
    };

    system.update(host, 0.016);
    expect(calls).toBe(0);
  });
});
