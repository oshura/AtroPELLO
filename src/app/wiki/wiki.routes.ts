import { Routes } from '@angular/router';

export const WIKI_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/wiki-index/wiki-index').then(m => m.WikiIndexComponent)
  },
  {
    path: 'legal',
    loadComponent: () => import('./pages/legal-terms/legal-terms').then(m => m.LegalTermsComponent)
  },
  {
    path: 'game-objects',
    loadComponent: () => import('./pages/game-objects/game-objects').then(m => m.GameObjectsWikiComponent)
  },
  {
    path: 'glyphs',
    loadComponent: () => import('./pages/glyphs/glyphs').then(m => m.GlyphsWikiComponent)
  },
  {
    path: 'spaceship',
    loadComponent: () => import('./pages/spaceship/spaceship').then(m => m.SpaceshipWikiComponent)
  },
  {
    path: 'solar-systems',
    loadComponent: () => import('./pages/solar-systems/solar-systems').then(m => m.SolarSystemsWikiComponent)
  },
  {
    path: 'planets',
    loadComponent: () => import('./pages/planets/planets').then(m => m.PlanetsWikiComponent)
  },
  {
    path: 'inventory',
    loadComponent: () => import('./pages/inventory/inventory').then(m => m.InventoryWikiComponent)
  },
  {
    path: 'game-rules',
    loadComponent: () => import('./pages/game-rules/game-rules').then(m => m.GameRulesWikiComponent)
  }
];
