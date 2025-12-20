import { PlanetType, Planet, PlanetColorName } from '../game-objects/Planet';
import { HumanSolarSystemService } from '../services/game/human-solar-system.service';
import { buildBoundarySnapshotFromPlanet } from './planet-atmosphere-engine';
import { PlanetTerrainGenerator } from './terrain/planet-terrain-generator';
import { computePlanetTerrainContact } from './terrain/planet-terrain-contact';
import { Spaceship } from '../game-objects/Spaceship';

describe('PlanetAtmosphereEngine diagnostics', () => {
  it('generates terrain data for a Venus landing scenario', () => {
    const humanSystem = new HumanSolarSystemService();
    const snapshot = humanSystem.createSnapshot();
    const venusSnapshot = snapshot.planets.find(p => p.id.includes('venus'));
    expect(venusSnapshot).toBeDefined();

    const planet = new Planet(
      venusSnapshot!.id,
      venusSnapshot!.baseColorName as PlanetColorName,
      venusSnapshot!.radius,
      { ...venusSnapshot!.position },
    );
    planet.customName = venusSnapshot!.name;
    planet.planetType = PlanetType.Tierra;

    const boundaries = buildBoundarySnapshotFromPlanet(planet);
    const generator = new PlanetTerrainGenerator();
    const terrain = generator.generate(planet, boundaries);

    expect(terrain.landingEnabled).withContext('Venus terrain should allow landing').toBeTrue();

    const groundRadius = terrain.groundRadius ?? boundaries.groundRadius ?? planet.initialRadius;
    const ship = new Spaceship({
      x: planet.position.x,
      y: planet.position.y + groundRadius + 12,
      z: planet.position.z,
    });

    const contact = computePlanetTerrainContact(terrain, ship.position, planet.position);
    const shipVector = {
      x: ship.position.x - planet.position.x,
      y: ship.position.y - planet.position.y,
      z: ship.position.z - planet.position.z,
    };
    const shipDistance = Math.hypot(shipVector.x, shipVector.y, shipVector.z);
    const naiveAltitude = shipDistance - groundRadius; // equals the manual offset on a perfect sphere

    expect(contact.surfaceNormal).not.toBeNull();
    expect(contact.radius).withContext('Contact radius should stay close to ground radius despite noise').toBeGreaterThan(groundRadius - 80);
    expect(contact.radius).withContext('Contact radius upper bound').toBeLessThan(groundRadius + 120);

    expect(contact.altitude).withContext('Altitude should remain positive above displaced surface').toBeGreaterThan(0);
    expect(contact.altitude).withContext('Altitude stays near the expected offset despite procedural displacement').toBeLessThanOrEqual(naiveAltitude + 8);
    expect(Math.abs((contact.altitude ?? 0) - naiveAltitude)).withContext('Altitude deviation bounded by terrain noise amplitude').toBeLessThanOrEqual(8);
  });
});
