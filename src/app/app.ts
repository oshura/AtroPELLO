import { Component, signal, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Game } from './components/game/game';
import { AudioDebugOverlayComponent } from './components/audio-debug-overlay/audio-debug-overlay';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Game, AudioDebugOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('AtroPELLO');
  protected readonly isWikiVisible = signal(false);
  
  constructor(private router: Router) {}
  
  ngOnInit() {
    // Track when wiki is visible
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isWikiVisible.set(event.url.startsWith('/wiki'));
      });
  }
}
