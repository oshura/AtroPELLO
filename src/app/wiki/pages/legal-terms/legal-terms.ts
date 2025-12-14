import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

interface ObfuscatedContactField {
  label: string;
  encoded: string;
  kind: 'text' | 'mailto';
}

interface DecodedContactField extends ObfuscatedContactField {
  value: string;
}

@Component({
  selector: 'app-legal-terms',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  templateUrl: './legal-terms.html',
  styleUrl: './legal-terms.scss'
})
export class LegalTermsComponent implements OnInit {
  private readonly wikiNav = inject(WikiNavigationService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  protected readonly lastUpdated = '2025-02-17';
  protected readonly hasRevealed = signal(false);
  protected readonly decodedContact = signal<DecodedContactField[]>([]);

  private readonly contactFields: ObfuscatedContactField[] = [
    { label: 'Titular', encoded: 'T3NodXJhIERvbW8=', kind: 'text' },
    { label: 'Municipio', encoded: 'R3Jhbm9sbGVycyAoMDg0MDEpLCBFc3Bhw7Fh', kind: 'text' },
    { label: 'Email operativo', encoded: 'emFyZ2FudGFuYUBnbWFpbC5jb20=', kind: 'mailto' },
    { label: 'Dirección postal', encoded: 'Qy4vIEFyYWfDsyAxNSBjYXNh', kind: 'text' }
  ];

  private readonly textDecoder = this.isBrowser ? new TextDecoder('utf-8') : null;

  ngOnInit(): void {
    this.wikiNav.setLastRoute(this.router.url);
  }

  protected revealContact(): void {
    if (!this.isBrowser || this.hasRevealed()) {
      return;
    }
    const decoded = this.contactFields.map(field => ({
      ...field,
      value: this.decodeField(field.encoded)
    }));
    this.decodedContact.set(decoded);
    this.hasRevealed.set(true);
  }

  private decodeField(encoded: string): string {
    if (!this.isBrowser) {
      return '—';
    }
    try {
      const binary = typeof atob === 'function' ? atob(encoded) : encoded;
      if (!this.textDecoder) {
        return binary;
      }
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return this.textDecoder.decode(bytes);
    } catch {
      return encoded;
    }
  }
}
