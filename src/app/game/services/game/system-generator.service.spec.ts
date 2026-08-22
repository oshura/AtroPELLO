import { SystemGeneratorService } from './system-generator.service';
import { PlanetInhabitants, PLANET_INHABITANT_POOL } from '../../types/cosmic-life.types';
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

  it('los Grises nunca salen en una tirada aleatoria de habitantes', () => {
    expect(PLANET_INHABITANT_POOL).not.toContain(PlanetInhabitants.GRISES);
    expect(PLANET_INHABITANT_POOL).not.toContain(PlanetInhabitants.NONE);
    expect(PLANET_INHABITANT_POOL).toContain(PlanetInhabitants.MI_GO);
  });
});
