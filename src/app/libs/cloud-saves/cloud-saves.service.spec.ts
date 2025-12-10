import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CloudSavesService } from './cloud-saves.service';
import { CLOUD_SAVES_GAME_CONTEXT, CLOUD_SAVES_SESSION_BRIDGE, CLOUD_SAVES_SETTINGS, CloudSavesGameContext, CloudSavesSessionBridge, CloudSavesSettings } from './cloud-saves.tokens';
import { CloudSaveMasterFile } from './cloud-saves.models';
import { CloudSavesClient } from './cloud-saves.client';

class StubClient implements Pick<CloudSavesClient, 'listSlots' | 'putSave' | 'deleteSave'> {
  public lastPut: { index: number; payload: unknown } | null = null;
  public lastDelete: number | null = null;
  public slots: CloudSaveMasterFile = {
    gameId: 'cloud-test',
    userId: 'user-123',
    saves: [
      { index: 0, key: 'slot-0', savedAt: '2025-12-09T00:00:00Z' }
    ]
  };

  async listSlots(): Promise<CloudSaveMasterFile> {
    return this.slots;
  }

  async putSave(_token: string, _gameId: string, index: number, payload: unknown): Promise<void> {
    this.lastPut = { index, payload };
  }

  async deleteSave(_token: string, _gameId: string, index: number): Promise<void> {
    this.lastDelete = index;
  }
}

describe('CloudSavesService (integration)', () => {
  let service: CloudSavesService;
  let client: StubClient;

  const settings: CloudSavesSettings = {
    apiBaseUrl: 'https://api.example.com/saves',
    mockLatencyMs: 0
  };
  const context: CloudSavesGameContext = { gameId: 'cloud-test' };
  const sessionBridge: CloudSavesSessionBridge = {
    async getToken() {
      return 'FAKE_TOKEN';
    },
    onSessionChange() {
      return () => undefined;
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CloudSavesService,
        { provide: CLOUD_SAVES_SETTINGS, useValue: settings },
        { provide: CLOUD_SAVES_GAME_CONTEXT, useValue: context },
        { provide: CLOUD_SAVES_SESSION_BRIDGE, useValue: sessionBridge }
      ]
    });

    service = TestBed.inject(CloudSavesService);
    client = new StubClient();
    (service as unknown as { client: CloudSavesClient }).client = client as unknown as CloudSavesClient;
  });

  it('syncSlots writes slots from LST payload', async () => {
    await service.syncSlots();

    expect(service.slots()).toEqual(client.slots.saves);
    expect(service.error()).toBeNull();
  });

  it('putSave sends PUT command and refreshes slots', async () => {
    client.slots = {
      gameId: 'cloud-test',
      userId: 'user-123',
      saves: [
        { index: 2, key: 'slot-2', savedAt: '2025-12-09T00:00:00Z' }
      ]
    };

    await service.putSave(2, { hull: 99 });

    expect(client.lastPut).toEqual({ index: 2, payload: { hull: 99 } });
    expect(service.slots()).toEqual(client.slots.saves);
  });
});
