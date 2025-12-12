import { CloudSaveMasterFile, CloudSaveSlotData, CloudSaveSlotMetadata } from './cloud-saves.models';
import { CloudSavesSettings } from './cloud-saves.tokens';

export class CloudSavesClient {
  private readonly fetchFn: typeof fetch | undefined = globalThis.fetch?.bind(globalThis);

  constructor(private readonly settings: CloudSavesSettings) {}

  async listSlots(token: string, gameId: string): Promise<CloudSaveMasterFile> {
    this.assertToken(token);
    await this.simulateLatency();
    const url = this.buildUrl('/slots', { gameId });
    return this.request<CloudSaveMasterFile>(url, {
      method: 'GET',
      headers: this.buildHeaders(token)
    });
  }

  async getSlot(token: string, gameId: string, index: number): Promise<CloudSaveSlotData> {
    this.assertToken(token);
    await this.simulateLatency();
    const target = Math.max(0, Math.floor(index));
    const url = this.buildUrl(`/slots/${target}`, { gameId });
    return this.request<CloudSaveSlotData>(url, {
      method: 'GET',
      headers: this.buildHeaders(token)
    });
  }

  async putSave(token: string, gameId: string, index: number, payload: unknown, metadata?: CloudSaveSlotMetadata | null): Promise<void> {
    this.assertToken(token);
    await this.simulateLatency();
    const sanitizedIndex = Math.max(0, Math.floor(index));
    const url = this.buildUrl(`/slots/${sanitizedIndex}`, { gameId });
    const body: {
      gameId: string;
      savegame: unknown;
      metadata?: CloudSaveSlotMetadata | null;
    } = {
      gameId,
      savegame: payload
    };
    if (metadata) {
      body.metadata = metadata;
    }
    await this.request(url, {
      method: 'PUT',
      headers: this.buildHeaders(token, true),
      body: JSON.stringify(body)
    });
  }

  async deleteSave(token: string, gameId: string, index: number): Promise<void> {
    this.assertToken(token);
    await this.simulateLatency();
    const target = Math.max(0, Math.floor(index));
    const url = this.buildUrl(`/slots/${target}`, { gameId });
    await this.request(url, {
      method: 'DELETE',
      headers: this.buildHeaders(token)
    });
  }

  private buildHeaders(token: string, asJson = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`
    };
    if (asJson) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  private buildUrl(path: string, query: Record<string, string | number | undefined>): string {
    const normalizedBase = this.settings.apiBaseUrl.endsWith('/')
      ? this.settings.apiBaseUrl
      : `${this.settings.apiBaseUrl}/`;
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = new URL(normalizedPath, normalizedBase);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  private async request<T = Record<string, unknown>>(url: string, init: RequestInit): Promise<T> {
    if (!this.fetchFn) {
      throw new Error('Fetch API is not available in this runtime');
    }
    const response = await this.fetchFn(url, init);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = typeof payload === 'object' && payload !== null && 'error' in payload
        ? (payload as { error?: string }).error ?? 'Request failed'
        : `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  private async simulateLatency(): Promise<void> {
    const delay = Math.max(0, this.settings.mockLatencyMs ?? 0);
    if (!delay) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private assertToken(token: string | null | undefined): void {
    if (!token) {
      throw new Error('Missing authorization token');
    }
  }
}
