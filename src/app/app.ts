import { Component, signal, OnInit, computed, effect, inject } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Game } from './components/game/game';
import { AudioDebugOverlayComponent } from './components/audio-debug-overlay/audio-debug-overlay';
import { AuthService } from './services/auth.service';

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
  
  constructor(private router: Router) {
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
        this.isWikiVisible.set(event.url.startsWith('/wiki'));
      });
  }

  protected toggleFullViewport(): void {
    if (!this.auth.authenticated()) {
      return;
    }
    this.fullViewportEnabled.update(value => !value);
  }
}
