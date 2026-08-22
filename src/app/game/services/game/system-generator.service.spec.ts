import { SystemGeneratorService } from './system-generator.service';
import { PlanetInhabitants, PLANET_INHABITANT_POOL } from '../../types/cosmic-life.types';
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

  describe('sorteo de habitantes', () => {
    it('sólo entran razas TERMINADAS: hoy, los Grises', () => {
      // El universo no debe poblarse con civilizaciones que no tienen nada que contar: una raza
      // entra en el sorteo cuando se cierra su ficha, no cuando se reserva su nombre en el enum.
      expect(getPoolableRaces()).toEqual([PlanetInhabitants.GRISES]);
    });

    it('las razas sin ficha están reservadas, no disponibles', () => {
      const poolable = getPoolableRaces();
      expect(poolable).not.toContain(PlanetInhabitants.MI_GO);
      expect(poolable).not.toContain(PlanetInhabitants.NONE);
      // Su nombre sigue reservado en el enum para escribirlas más adelante.
      expect(PLANET_INHABITANT_POOL).toContain(PlanetInhabitants.MI_GO);
    });

    it('una raza acólita nunca habitaría planetas', () => {
      const acolytes = getDefinedRaces().filter(race => race.isAcolyte).map(race => race.id);
      for (const acolyte of acolytes) {
        expect(getPoolableRaces()).not.toContain(acolyte);
      }
    });
  });
});
