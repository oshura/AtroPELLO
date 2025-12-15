import { Component, signal, OnInit, computed, effect, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, ActivatedRoute } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Game } from './components/game/game';
import { AudioDebugOverlayComponent } from './components/audio-debug-overlay/audio-debug-overlay';
import { AuthService } from './services/auth.service';
import { SeoConfig, SeoService } from './services/seo/seo.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Game, AudioDebugOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.fullscreen-active]': 'fullViewportEnabled()'
  }
})
export class App implements OnInit {
  protected readonly title = signal('AtroPELLO');
  protected readonly isWikiVisible = signal(false);
  protected readonly fullViewportEnabled = signal(false);
  protected readonly auth = inject(AuthService);
  protected readonly fullscreenTooltip = computed(() =>
    this.fullViewportEnabled()
      ? 'Salir del modo pantalla completa'
      : 'Expandir el canvas del juego'
  );
  
  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private seo: SeoService
  ) {
    effect(() => {
      if (!this.auth.authenticated() && this.fullViewportEnabled()) {
        this.fullViewportEnabled.set(false);
      }
    });
  }
  
  ngOnInit() {
    // Track when wiki is visible
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        const resolvedUrl = event.urlAfterRedirects ?? event.url;
        this.isWikiVisible.set(resolvedUrl.startsWith('/wiki'));
        this.applyRouteSeo();
      });

    // Apply initial SEO snapshot
    queueMicrotask(() => this.applyRouteSeo());
  }

  protected toggleFullViewport(): void {
    if (!this.auth.authenticated()) {
      return;
    }
    this.fullViewportEnabled.update(value => !value);
  }

  private applyRouteSeo(): void {
    let route: ActivatedRoute | null = this.activatedRoute;
    while (route?.firstChild) {
      route = route.firstChild;
    }
    const seoData = route?.snapshot?.data?.['seo'] as SeoConfig | undefined;
    this.seo.update(seoData);
  }
}
