import { Component, effect, inject, signal } from '@angular/core';
import { SessionCookieLandingService } from '../services/session-cookie-landing.service';
import { LoggingService, LogCategory } from '../services/logging.service';
import { CloudSettings, CLOUD_SETTINGS } from '../settings/cloud-settings';
import { UserIdentity } from '../types/identity';

type WorkerRequest =
  | { type: 'init'; id?: string }
  | { type: 'session:get'; id: string }
  | { type: 'session:clear'; id: string }
  | { type: 'session:ping'; id: string };

type WorkerResponse =
  | { type: 'session:data'; id: string; token: string | null; accessToken?: string | null; issuedAt?: number; expiresAt?: number; profile?: UserIdentity | null }
  | { type: 'session:cleared'; id: string }
  | { type: 'session:pong'; id: string }
  | { type: 'bridge:ready' }
  | { type: 'bridge:error'; message: string };

@Component({
  standalone: true,
  template: ''
})
export class SessionBridgeWorkerComponent {
  private readonly cookie = inject(SessionCookieLandingService);
  private readonly logger = inject(LoggingService);
  private readonly settings = inject<CloudSettings>(CLOUD_SETTINGS);
  private readonly initialized = signal(false);

  constructor() {
    effect(() => this.attachListener());
    this.post({ type: 'bridge:ready' });
  }

  private attachListener(): void {
    if (this.initialized()) {
      return;
    }
    this.initialized.set(true);
    addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
      void this.handle(event.data);
    });
  }

  private async handle(request: WorkerRequest): Promise<void> {
    switch (request.type) {
      case 'session:get': {
        const data = await this.cookie.readTokens();
        this.post({
          type: 'session:data',
          id: request.id,
          token: data?.token ?? null,
          accessToken: data?.accessToken ?? null,
          issuedAt: data?.issuedAt,
          expiresAt: data?.expiresAt,
          profile: data?.profile ?? null
        });
        return;
      }
      case 'session:clear': {
        this.cookie.clearCookie();
        this.post({ type: 'session:cleared', id: request.id });
        return;
      }
      case 'session:ping': {
        this.post({ type: 'session:pong', id: request.id });
        return;
      }
      default:
        this.logger.warn(LogCategory.CONFIGURATION, 'Unknown bridge request', request);
    }
  }

  private post(response: WorkerResponse): void {
    postMessage(response);
  }
}
