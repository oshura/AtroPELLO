import { TargetDetailService } from './target-detail.service';
import { ITargetable, TargetType } from '../types/targeting.types';

function fakeTarget(type: TargetType, extra: Record<string, unknown> = {}): ITargetable {
  return {
    id: 'fake',
    position: { x: 0, y: 0, z: 0 },
    getDisplayName: () => 'Fake',
    getTargetType: () => type,
    isActive: () => true,
    ...extra,
  } as unknown as ITargetable;
}

describe('TargetDetailService — estación y puerto (§1.2.1 cuerpo seleccionable)', () => {
  const svc = new TargetDetailService();

  it('estación: lore coherente + resumen de puertos si está disponible', async () => {
    const res = await svc.getDetails(fakeTarget(TargetType.SPACE_STATION, { portsSummary: '2/8 operativos' }));
    expect(res.type).toBe(TargetType.SPACE_STATION);
    const data = res.data as Record<string, unknown>;
    expect(data['clase']).toBe('Estación orbital humana');
    expect(data['estado']).toBe('Energía inestable');
    expect(data['tripulación']).toBe('Sin señales de vida');
    expect(data['puertos']).toBe('2/8 operativos');
  });

  it('estación sin resumen: omite la línea de puertos (nada de "undefined" en el HUD)', async () => {
    const res = await svc.getDetails(fakeTarget(TargetType.SPACE_STATION));
    expect('puertos' in (res.data as Record<string, unknown>)).toBeFalse();
  });

  it('puerto: estado según intacto/ocupado y nombre de la estación padre', async () => {
    const operativo = await svc.getDetails(fakeTarget(TargetType.DOCK_PORT, {
      intact: true, occupied: false, parentStationName: 'Estación Humana',
    }));
    expect((operativo.data as any)['estado']).toContain('Operativo');
    expect((operativo.data as any)['estación']).toBe('Estación Humana');

    const cerrado = await svc.getDetails(fakeTarget(TargetType.DOCK_PORT, { intact: true, occupied: true }));
    expect((cerrado.data as any)['estado']).toBe('Cerrado');

    const destruido = await svc.getDetails(fakeTarget(TargetType.DOCK_PORT, { intact: false, occupied: false }));
    expect((destruido.data as any)['estado']).toContain('Destruido');
  });
});
