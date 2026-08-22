import { SystemGeneratorService } from './system-generator.service';
import { ElderGod, PlanetInhabitants, PLANET_INHABITANT_POOL } from '../../types/cosmic-life.types';
import { getDefinedRaces, getPoolableRaces } from '../../config/race-catalog.config';
import { PLANET_INTEL_STATUS } from '../../types/planet-intel.types';

/**
 * Generación procedural de sistemas. Interesa sobre todo el habitante garantizado: es el mecanismo
 * con el que la trama coloca a los Grises en el sistema del primer Gate Rite (Fase 13).
 */
describe('SystemGeneratorService', () => {
  function generate(options?: Parameters<SystemGeneratorService['generate']>[1]) {
    return new SystemGeneratorService().generate(4242, options);
  }

  it('sin opción de habitante garantizado no fuerza ninguna civilización', () => {
    const snapshot = generate();
    const forced = snapshot.planets.filter(p => p.inhabitants);
    expect(forced.length).toBe(0);
  });

  it('coloca la raza pedida en un planeta, con vida al 100 % y civilización confirmada', () => {
    const snapshot = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES });

    const inhabited = snapshot.planets.filter(p => p.inhabitants === PlanetInhabitants.GRISES);
    expect(inhabited.length).toBe(1);
    expect(inhabited[0].probabilityOfLifePct).toBe(100);
    expect(inhabited[0].civilizationIntelStatus).toBe(PLANET_INTEL_STATUS.CONFIRMED_PRESENT);
  });

  it('prefiere un planeta terrestre y nunca uno gaseoso', () => {
    const snapshot = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES });
    const host = snapshot.planets.find(p => p.inhabitants === PlanetInhabitants.GRISES);

    expect(host).toBeTruthy();
    expect(host!.kind).not.toBe('Gaseous');
    if (snapshot.planets.some(p => p.kind === 'Terrestrial')) {
      expect(host!.kind).toBe('Terrestrial');
    }
  });

  it('la generación sigue siendo determinista con la misma semilla', () => {
    const a = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES });
    const b = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES });

    const hostA = a.planets.find(p => p.inhabitants === PlanetInhabitants.GRISES);
    const hostB = b.planets.find(p => p.inhabitants === PlanetInhabitants.GRISES);
    expect(hostA?.id).toBe(hostB?.id);
  });

  describe('varios planetas habitados garantizados (sistema de guerra arácnido, Fase 15)', () => {
    it('count 3 puebla exactamente 3 planetas, todos confirmados y con vida al 100 %', () => {
      const snapshot = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES, guaranteedInhabitedCount: 3 });
      const hosts = snapshot.planets.filter(p => p.inhabitants === PlanetInhabitants.GRISES);

      expect(hosts.length).toBe(3);
      for (const host of hosts) {
        expect(host.probabilityOfLifePct).toBe(100);
        expect(host.civilizationIntelStatus).toBe(PLANET_INTEL_STATUS.CONFIRMED_PRESENT);
      }
    });

    it('pedir varios habitados no descuadra los ids de la semilla', () => {
      const plain = generate();
      const crowded = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES, guaranteedInhabitedCount: 3 });

      expect(crowded.planets.map(p => p.id)).toEqual(plain.planets.map(p => p.id));
    });

    it('el primer habitado con count 3 es el mismo planeta que con count 1', () => {
      const single = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES });
      const triple = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES, guaranteedInhabitedCount: 3 });

      const soloHost = single.planets.find(p => p.inhabitants === PlanetInhabitants.GRISES);
      const tripleHosts = triple.planets.filter(p => p.inhabitants === PlanetInhabitants.GRISES);
      expect(tripleHosts.map(p => p.id)).toContain(soloHost!.id);
    });

    it('un count mayor que el número de planetas satura sin romper', () => {
      const snapshot = generate({ guaranteedInhabitants: PlanetInhabitants.GRISES, guaranteedInhabitedCount: 99 });
      const hosts = snapshot.planets.filter(p => p.inhabitants === PlanetInhabitants.GRISES);
      expect(hosts.length).toBe(snapshot.planets.length);
    });
  });

  describe('identidad de los objetos generados', () => {
    it('dos sistemas distintos no comparten ningún id de planeta ni de cúmulo', () => {
      // Antes todos los sistemas reutilizaban planet-0, planet-1…: el planeta del mismo índice de
      // otro sistema era indistinguible por id y las misiones se cruzaban entre sistemas.
      const a = new SystemGeneratorService().generate(1111);
      const b = new SystemGeneratorService().generate(2222);

      const idsOf = (s: typeof a) => [...s.planets.map(p => p.id), ...(s.clusters ?? []).map(c => c.id)];
      const idsA = new Set(idsOf(a));
      const shared = idsOf(b).filter(id => idsA.has(id));

      expect(shared).toEqual([]);
    });

    it('los ids son estables para una misma semilla', () => {
      const a = new SystemGeneratorService().generate(4242);
      const b = new SystemGeneratorService().generate(4242);

      expect(b.planets.map(p => p.id)).toEqual(a.planets.map(p => p.id));
      expect((b.clusters ?? []).map(c => c.id)).toEqual((a.clusters ?? []).map(c => c.id));
    });

    it('los ids de planeta siguen siendo únicos dentro del propio sistema', () => {
      const snapshot = new SystemGeneratorService().generate(777);
      const ids = snapshot.planets.map(p => p.id);

      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('primigenio que domina el sistema', () => {
    const SEEDS = Array.from({ length: 120 }, (_, i) => 1000 + i * 37);
    const godsFor = (options?: Parameters<SystemGeneratorService['generate']>[1]) =>
      SEEDS.map(seed => new SystemGeneratorService().generate(seed, options).meta?.elderGod);

    it('sin exclusión, el sorteo SÍ puede dar Yog-Sothoth', () => {
      // Da sentido a la prueba siguiente: sin la exclusión el riesgo es real, no teórico.
      expect(godsFor()).toContain(ElderGod.YOG_SOTHOTH);
    });

    it('el primigenio excluido no sale nunca', () => {
      expect(godsFor({ excludedElderGod: ElderGod.YOG_SOTHOTH })).not.toContain(ElderGod.YOG_SOTHOTH);
    });

    it('excluir uno deja vivos a los otros dos', () => {
      const gods = new Set(godsFor({ excludedElderGod: ElderGod.YOG_SOTHOTH }));
      expect(gods).toContain(ElderGod.CTHULHU);
      expect(gods).toContain(ElderGod.AZATHOTH);
    });

    it('la exclusión manda sobre un rito sintonizado que pidiera ese mismo primigenio', () => {
      const gods = godsFor({ forcedElderGod: ElderGod.YOG_SOTHOTH, excludedElderGod: ElderGod.YOG_SOTHOTH });
      expect(gods).not.toContain(ElderGod.YOG_SOTHOTH);
    });

    it('sin exclusión, un rito sintonizado sigue imponiendo su primigenio', () => {
      const gods = new Set(godsFor({ forcedElderGod: ElderGod.YOG_SOTHOTH }));
      expect([...gods]).toEqual([ElderGod.YOG_SOTHOTH]);
    });

    it('excluir no descuadra el resto del sistema para una misma semilla', () => {
      // La exclusión consume el rng igual que el sorteo normal; si no, cambiaría todo lo generado
      // después (planetas, cúmulos, nombres) y los sistemas dejarían de ser reproducibles.
      const plain = new SystemGeneratorService().generate(4242);
      const excluded = new SystemGeneratorService().generate(4242, { excludedElderGod: ElderGod.YOG_SOTHOTH });

      expect(excluded.planets.map(p => p.id)).toEqual(plain.planets.map(p => p.id));
      expect((excluded.clusters ?? []).map(c => c.id)).toEqual((plain.clusters ?? []).map(c => c.id));
    });

    it('el sistema de los Grises se genera sin Yog-Sothoth y con su planeta habitado', () => {
      // Combinación exacta que aplica el primer Gate Rite (ver gate-rite.animation.ts).
      const options = {
        guaranteedInhabitants: PlanetInhabitants.GRISES,
        excludedElderGod: ElderGod.YOG_SOTHOTH
      };
      for (const seed of SEEDS) {
        const snapshot = new SystemGeneratorService().generate(seed, options);
        expect(snapshot.meta?.elderGod).not.toBe(ElderGod.YOG_SOTHOTH);
        expect(snapshot.planets.filter(p => p.inhabitants === PlanetInhabitants.GRISES).length).toBe(1);
      }
    });
  });

  describe('sorteo de habitantes', () => {
    it('sólo entran razas TERMINADAS: hoy, Grises y Mi-Go', () => {
      // El universo no debe poblarse con civilizaciones que no tienen nada que contar: una raza
      // entra en el sorteo cuando se cierra su ficha, no cuando se reserva su nombre en el enum.
      expect(getPoolableRaces().sort()).toEqual(
        [PlanetInhabitants.GRISES, PlanetInhabitants.MI_GO].sort()
      );
    });

    it('las razas sin ficha están reservadas, no disponibles', () => {
      const poolable = getPoolableRaces();
      expect(poolable).not.toContain(PlanetInhabitants.LENG);
      expect(poolable).not.toContain(PlanetInhabitants.NONE);
      // Su nombre sigue reservado en el enum para escribirlas más adelante.
      expect(PLANET_INHABITANT_POOL).toContain(PlanetInhabitants.LENG);
    });

    it('una raza con ficha pero excluida del sorteo jamás aparece por azar', () => {
      // Arácnidos y Yig existen SOLO donde la trama los coloca (sintonía del rito), aunque su
      // ficha esté completa: la exclusión es explícita, no una carencia.
      const poolable = getPoolableRaces();
      expect(poolable).not.toContain(PlanetInhabitants.ARACNIDOS);
      expect(poolable).not.toContain(PlanetInhabitants.YIG);
    });

    it('una raza acólita nunca habitaría planetas', () => {
      const acolytes = getDefinedRaces().filter(race => race.isAcolyte).map(race => race.id);
      for (const acolyte of acolytes) {
        expect(getPoolableRaces()).not.toContain(acolyte);
      }
    });
  });
});
