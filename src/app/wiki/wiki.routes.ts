import { Routes } from '@angular/router';

const SITE_URL = 'https://to3.atropello-games.es';
const HERO_IMAGE = `${SITE_URL}/assets/Wiki.png`;

export const WIKI_ROUTES: Routes = [
  {
    path: '',
    data: {
      seo: {
        title: 'AtroPELLO Wiki · Guía del vacío TO³',
        description: 'Explora el índice oficial de la wiki TO³: narrativa, sistemas solares, glifos, inventario diegético y reglas de supervivencia.',
        url: `${SITE_URL}/wiki`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['AtroPELLO wiki', 'TO3 guide', 'space rpg wiki']
      }
    },
    loadComponent: () => import('./pages/wiki-index/wiki-index').then(m => m.WikiIndexComponent)
  },
  {
    path: 'legal',
    data: {
      seo: {
        title: 'Aviso Legal y Licencias · AtroPELLO Wiki',
        description: 'Consulta los avisos legales, derechos de autor y licencias de audio/arte que respaldan el universo de AtroPELLO.',
        url: `${SITE_URL}/wiki/legal`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['AtroPELLO legal', 'licencias juego web']
      }
    },
    loadComponent: () => import('./pages/legal-terms/legal-terms').then(m => m.LegalTermsComponent)
  },
  {
    path: 'game-objects',
    data: {
      seo: {
        title: 'Game Objects & Entities · AtroPELLO Wiki',
        description: 'Catálogo de naves, asteroides, portales y seres menores que pueblan el vacío en TO³.',
        url: `${SITE_URL}/wiki/game-objects`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['AtroPELLO objetos', 'space entities', 'TO3 bestiary']
      }
    },
    loadComponent: () => import('./pages/game-objects/game-objects').then(m => m.GameObjectsWikiComponent)
  },
  {
    path: 'glyphs',
    data: {
      seo: {
        title: 'Glyphs y Rituales del Vacío · AtroPELLO Wiki',
        description: 'Todos los glifos, cooldowns y efectos del grimorio TO³ para planificar builds y rituales.',
        url: `${SITE_URL}/wiki/glyphs`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['AtroPELLO glyphs', 'void rituals', 'grimorio TO3']
      }
    },
    loadComponent: () => import('./pages/glyphs/glyphs').then(m => m.GlyphsWikiComponent)
  },
  {
    path: 'spaceship',
    data: {
      seo: {
        title: 'Spaceship TO³ — Especificaciones y HUD',
        description: 'Ficha técnica de la nave TO³: masa, paneles HUD, cámara, controles y componentes modulares.',
        url: `${SITE_URL}/wiki/spaceship`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['TO3 spaceship', 'HUD AtroPELLO', 'controles nave webgl']
      }
    },
    loadComponent: () => import('./pages/spaceship/spaceship').then(m => m.SpaceshipWikiComponent)
  },
  {
    path: 'solar-systems',
    data: {
      seo: {
        title: 'Sistemas Solares y Gate Rite · AtroPELLO',
        description: 'Cómo se generan los sistemas solares, cómo funcionan los portales Concordia y el ritual Gate Rite.',
        url: `${SITE_URL}/wiki/solar-systems`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['solar systems TO3', 'gate rite', 'procedural space game']
      }
    },
    loadComponent: () => import('./pages/solar-systems/solar-systems').then(m => m.SolarSystemsWikiComponent)
  },
  {
    path: 'planets',
    data: {
      seo: {
        title: 'Planetas y Biomas · AtroPELLO Wiki',
        description: 'Lista de planetas habitables, gigantes gaseosos y biomas extremos que afectan la supervivencia de la nave.',
        url: `${SITE_URL}/wiki/planets`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['planetas TO3', 'biomas espacio', 'exploracion AtroPELLO']
      }
    },
    loadComponent: () => import('./pages/planets/planets').then(m => m.PlanetsWikiComponent)
  },
  {
    path: 'inventory',
    data: {
      seo: {
        title: 'Inventario y Panel del Piloto · AtroPELLO Wiki',
        description: 'Describe el panel diegético de inventario, módulos de nave, equipamiento y slots persistentes.',
        url: `${SITE_URL}/wiki/inventory`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['inventario TO3', 'panel piloto', 'ui diegetica']
      }
    },
    loadComponent: () => import('./pages/inventory/inventory').then(m => m.InventoryWikiComponent)
  },
  {
    path: 'game-rules',
    data: {
      seo: {
        title: 'Reglas del Juego y Bucles de Supervivencia · AtroPELLO Wiki',
        description: 'Resumen de mecánicas de daño, respawn, cooldowns y progresión permanente de TO³.',
        url: `${SITE_URL}/wiki/game-rules`,
        image: HERO_IMAGE,
        type: 'article',
        keywords: ['reglas TO3', 'survival loop', 'roguelite web']
      }
    },
    loadComponent: () => import('./pages/game-rules/game-rules').then(m => m.GameRulesWikiComponent)
  }
];
