import { effect, Injectable, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { UserIdentity } from '../../types/identity';
import { CLOUD_SAVES_SESSION_BRIDGE, CloudSavesSessionBridge } from './cloud-saves.tokens';

@Injectable({ providedIn: 'root', useExisting: CloudSavesSessionBridgeService })
export class CloudSavesSessionBridgeService implements CloudSavesSessionBridge {
  private readonly auth = inject(AuthService);
  private readonly tokenListeners = new Set<(token: string | null) => void>();
  private readonly identityListeners = new Set<(identity: UserIdentity | null) => void>();

  constructor() {
    effect(() => {
      const token = this.auth.token();
      for (const listener of this.tokenListeners) {
        listener(token);
      }
    });

    effect(() => {
      const identity = this.auth.identity();
      for (const listener of this.identityListeners) {
        listener(identity);
      }
    });
  }

  async getToken(): Promise<string | null> {
    return this.auth.getTokenSnapshot();
  }

  onSessionChange(cb: (token: string | null) => void): () => void {
    this.tokenListeners.add(cb);
    cb(this.auth.getTokenSnapshot());
    return () => this.tokenListeners.delete(cb);
  }

  async getIdentity(): Promise<UserIdentity | null> {
    return this.auth.getIdentitySnapshot();
  }

  onIdentityChange(cb: (identity: UserIdentity | null) => void): () => void {
    this.identityListeners.add(cb);
    cb(this.auth.getIdentitySnapshot());
    return () => this.identityListeners.delete(cb);
  }
}
