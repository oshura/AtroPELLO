import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
export class App {
  protected readonly title = signal('AtroPELLO');
}
