import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from './components/header/header';
import { Footer } from './components/footer/footer';
import { Game } from './components/game/game';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Game],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('AtroPELLO');
}
