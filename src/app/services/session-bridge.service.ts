import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { LoggingService, LogCategory } from './logging.service';
import { CloudSettings, CLOUD_SETTINGS } from '../settings/cloud-settings';
import { PersistedAuthSession } from './session-cookie.service';
import { UserIdentity } from '../types/identity';
import { decodeIdentityFromToken } from './auth-return.service';

interface BridgeRequest {
  type: 'session:get' | 'session:ping' | 'session:clear';
  id: string;
}

interface SessionDataMessage {
  type: 'session:data';
  id: string;
  token: string | null;
  accessToken?: string | null;
  issuedAt?: number;
  expiresAt?: number;
  profile?: UserIdentity | null;
}

interface BridgeClearedMessage {
  type: 'session:cleared';
  id: string;
}

interface BridgePongMessage {
  type: 'session:pong';
  id: string;
}

interface BridgeReadyMessage {
  type: 'bridge:ready';
}

interface BridgeErrorMessage {
  type: 'bridge:error';
  message: string;
}

type BridgeResponse = SessionDataMessage | BridgeClearedMessage | BridgePongMessage | BridgeReadyMessage | BridgeErrorMessage;

@Injectable({ providedIn: 'root' })
export class SessionBridgeService {
  private readonly document = inject(DOCUMENT, { optional: true });
  private readonly settings = inject<CloudSettings>(CLOUD_SETTINGS);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = typeof window !== 'undefined';
  private iframe: HTMLIFrameElement | null = null;
  private ready = false;
  private refreshTimer: number | null = null;
  private lastTokenSignature: string | null = null;

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    Promise.resolve().then(() => this.bootstrap());
  }

  private bootstrap(): void {
    window.addEventListener('message', this.handleMessage);
    window.addEventListener('focus', this.handleFocus, true);
    this.document?.addEventListener('visibilitychange', this.handleVisibilityChange, { passive: true });
    this.ensureIframe();
  }

  private ensureIframe(): void {
    const doc = this.document;
    if (!doc || this.iframe) {
      return;
    }

    const mount = () => {
      if (this.iframe || !doc.body) {
        return;
      }
      const iframe = doc.createElement('iframe');
      iframe.src = this.settings.bridgeUrl;
      iframe.tabIndex = -1;
      iframe.title = 'Session Bridge';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      iframe.style.clipPath = 'inset(50%)';
      iframe.addEventListener('load', () => this.onIframeReady(), { once: true });
      doc.body.appendChild(iframe);
      this.iframe = iframe;
    };

    if (doc.readyState === 'interactive' || doc.readyState === 'complete') {
      mount();
    } else {
      doc.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  }

  private onIframeReady(): void {
    this.pingBridge();
  }

  private pingBridge(): void {
    this.sendMessage({ type: 'session:ping', id: this.nextRequestId() });
  }

  private requestSession(force = false): void {
    if (!this.ready && !force) {
      return;
    }
    this.sendMessage({ type: 'session:get', id: this.nextRequestId() });
  }

  private handleSessionData(message: SessionDataMessage): void {
    if (!message.token) {
      this.logger.debug(LogCategory.CONFIGURATION, 'Session bridge reported empty session');
      this.applyExternalSession(null);
      this.scheduleRefresh();
      return;
    }

    const identity = this.resolveIdentity(message);
    const expiresAt = message.expiresAt ?? Date.now() + 55 * 60 * 1000;
    const session: PersistedAuthSession = {
      token: message.token,
      identity,
      expiresAt
    };

    if (this.isSameToken(session.token)) {
      this.logger.debug(LogCategory.CONFIGURATION, 'Session bridge returned unchanged token, skipping hydrate');
      this.scheduleRefresh(expiresAt);
      return;
    }

    this.logger.info(LogCategory.CONFIGURATION, 'Session bridge synced credentials');
    this.applyExternalSession(session);
    this.scheduleRefresh(expiresAt);
  }

  private handleCleared(): void {
    this.applyExternalSession(null);
    this.scheduleRefresh();
  }

  private applyExternalSession(session: PersistedAuthSession | null): void {
    if (!session) {
      this.lastTokenSignature = null;
      this.auth.syncExternalSession(null);
      return;
    }
    this.lastTokenSignature = this.extractTokenSignature(session.token);
    this.auth.syncExternalSession(session);
  }

  private resolveIdentity(message: SessionDataMessage): UserIdentity | null {
    if (message.profile) {
      return message.profile;
    }
    if (message.token) {
      return decodeIdentityFromToken(message.token);
    }
    return null;
  }

  private sendMessage(request: BridgeRequest): void {
    if (!this.iframe || !this.iframe.contentWindow) {
      this.logger.warn(LogCategory.CONFIGURATION, 'Session bridge iframe not ready');
      return;
    }
    this.iframe.contentWindow.postMessage(request, this.settings.bridgeOrigin);
  }

  private handleVisibilityChange = (): void => {
    if (this.document && this.document.hidden === false) {
      this.requestSession();
    }
  };

  private handleFocus = (): void => {
    this.requestSession();
  };

  private handleMessage = (event: MessageEvent<BridgeResponse>): void => {
    if (event.origin !== this.settings.bridgeOrigin || event.source !== this.iframe?.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }
    switch (data.type) {
      case 'bridge:ready':
      case 'session:pong':
        if (!this.ready) {
          this.ready = true;
        }
        this.requestSession(true);
        return;
      case 'session:data':
        this.handleSessionData(data);
        return;
      case 'session:cleared':
        this.handleCleared();
        return;
      case 'bridge:error':
        this.logger.error(LogCategory.CONFIGURATION, 'Session bridge error', data.message);
        return;
    }
  };

  private scheduleRefresh(expiresAt?: number): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const buffer = 60 * 1000;
    const defaultDelay = 5 * 60 * 1000;
    const delay = expiresAt
      ? Math.max(30 * 1000, expiresAt - Date.now() - buffer)
      : defaultDelay;
    this.refreshTimer = window.setTimeout(() => this.requestSession(), delay);
  }

  private nextRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }

  private extractTokenSignature(token: string): string {
    const parts = token.split('.');
    return parts.length >= 3 ? parts[2] : token;
  }

  private isSameToken(token: string): boolean {
    const signature = this.extractTokenSignature(token);
    return this.lastTokenSignature === signature;
  }
}
