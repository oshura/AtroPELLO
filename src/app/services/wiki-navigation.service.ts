import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class WikiNavigationService {
  private readonly lastWikiRoute = signal<string>('/wiki');

  setLastRoute(route: string): void {
    this.lastWikiRoute.set(route);
  }

  getLastRoute(): string {
    return this.lastWikiRoute();
  }
}
