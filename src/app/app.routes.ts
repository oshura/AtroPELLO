import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'wiki',
    loadChildren: () => import('./wiki/wiki.routes').then(m => m.WIKI_ROUTES)
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: ''
  }
];
