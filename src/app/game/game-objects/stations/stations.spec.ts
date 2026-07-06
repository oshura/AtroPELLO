import { HumanSpaceStation, HUMAN_STATION_ID } from './human-space-station';
import { DockPort } from './dock-port';
import { GameObjectType } from '../../types/game-object.types';
import { TargetType } from '../../types/targeting.types';

describe('HumanSpaceStation', () => {
  it('construye geometría (toroide + radios + núcleo) y es categoría SPACE_STATION', () => {
    const station = new HumanSpaceStation({ x: 100, y: 0, z: 0 });
    expect(station.vertices.length).toBeGreaterThan(0);
    expect(station.indices.length).toBeGreaterThan(0);
    expect(station.colors.length).toBe(station.vertices.length); // RGB por vértice = 3 comp como posición
    expect(station.getType()).toBe(GameObjectType.SPACE_STATION);
    expect(station.getTargetType()).toBe(TargetType.SPACE_STATION);
    expect(station.getDisplayName()).toBe('Estación Humana');
    expect(station.size).toBe(800);
  });

  it('tiene la bounding sphere DESACTIVADA (regla de STATIONS no esféricas)', () => {
    const station = new HumanSpaceStation({ x: 0, y: 0, z: 0 });
    expect(station.boundingSphere).toBeNull();
  });

  it('nace dañada (~16% de integridad) y es seleccionable por radio (sin colisión)', () => {
    const station = new HumanSpaceStation({ x: 0, y: 0, z: 0 });
    expect(station.healthCurrent / station.healthMax).toBeCloseTo(0.16, 2);
    expect(station.radius).toBe(800);          // radio de selección (targeting)
    expect(station.boundingSphere).toBeNull(); // pero sin bounding de colisión
  });

  it('expone puertos deterministas: 8 colocaciones, mezcla de intactos y destruidos', () => {
    const a = new HumanSpaceStation({ x: 0, y: 0, z: 0 });
    const b = new HumanSpaceStation({ x: 0, y: 0, z: 0 });
    const ports = a.getPortPlacements();
    expect(ports.length).toBe(8);
    // Determinismo por semilla (mismo id ⇒ mismo daño).
    expect(a.getPortPlacements().map(p => p.intact)).toEqual(b.getPortPlacements().map(p => p.intact));
    expect(ports.some(p => p.intact)).toBe(true);
    expect(ports.some(p => !p.intact)).toBe(true);
    // Los puertos miran en HORIZONTAL (este/oeste de cada radio), no hacia arriba.
    for (const p of ports) {
      expect(p.localNormal[1]).toBe(0);
      const mag = Math.hypot(p.localNormal[0], p.localNormal[1], p.localNormal[2]);
      expect(mag).toBeCloseTo(1, 5);
    }
  });

  it('usa el id canónico por defecto', () => {
    expect(new HumanSpaceStation({ x: 0, y: 0, z: 0 }).id).toBe(HUMAN_STATION_ID);
  });
});

describe('DockPort', () => {
  it('se llama "Puerto espacial" y es categoría DOCK_PORT con bounding propia', () => {
    const port = new DockPort('p1', { x: 1, y: 2, z: 3 }, 'human-station', 40);
    expect(port.getDisplayName()).toBe('Puerto espacial');
    expect(port.getType()).toBe(GameObjectType.DOCK_PORT);
    expect(port.getTargetType()).toBe(TargetType.DOCK_PORT);
    expect(port.parentStationId).toBe('human-station');
    expect(port.boundingSphere).not.toBeNull(); // pequeño y esférico ⇒ seleccionable
  });

  it('isDockable: intacto y libre ⇒ true; ocupado o destruido ⇒ false', () => {
    const port = new DockPort('p2', { x: 0, y: 0, z: 0 }, 's', 40, true);
    expect(port.isDockable()).toBe(true);
    port.occupied = true;
    expect(port.isDockable()).toBe(false);
    port.occupied = false;
    const broken = new DockPort('p3', { x: 0, y: 0, z: 0 }, 's', 40, false);
    expect(broken.isDockable()).toBe(false);
  });
});
