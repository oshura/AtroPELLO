import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

interface WikiEntry {
  id: string;
  title: string;
  route: string;
  description: string;
  keywords: string[];
}

@Component({
  selector: 'app-wiki-index',
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-container">
      <header class="wiki-header">
        <h1>📚 AtroPELLO Wiki</h1>
        <p class="subtitle">Complete guide to the game universe</p>
      </header>

      <div class="search-bar">
        <input 
          type="text" 
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
          placeholder="🔍 Search wiki entries..."
          class="search-input"
        />
        @if (searchQuery()) {
          <button (click)="clearSearch()" class="clear-btn">✕</button>
        }
      </div>

      <div class="wiki-grid">
        @for (entry of filteredEntries(); track entry.id) {
          <a [routerLink]="['/wiki', entry.route]" class="wiki-card">
            <h2>{{ entry.title }}</h2>
            <p>{{ entry.description }}</p>
            <div class="keywords">
              @for (keyword of entry.keywords; track keyword) {
                <span class="keyword">{{ keyword }}</span>
              }
            </div>
          </a>
        }
      </div>

      @if (filteredEntries().length === 0) {
        <div class="no-results">
          <p>No results found for "{{ searchQuery() }}"</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-height: 100%;
      background: #0a0a0f;
    }

    .wiki-container {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem 3rem;
      color: #e0e0e0;
    }

    .arcade-back {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9998;
      background: linear-gradient(135deg, #000000 0%, #1a0033 50%, #000000 100%);
      border: 3px solid #ff00ff;
      padding: 12px 24px;
      font-family: 'Impact', 'Arial Black', sans-serif;
      font-size: 16px;
      font-weight: 900;
      color: #00ffff;
      text-shadow: 
        0 0 5px #00ffff,
        0 0 10px #00ffff,
        0 0 20px #ff00ff,
        0 0 30px #ff00ff;
      box-shadow: 
        0 0 15px #ff00ff,
        inset 0 0 15px rgba(255, 0, 255, 0.2),
        0 4px 0 #660066;
      cursor: pointer;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: pulse 2s ease-in-out infinite;
      transform: perspective(500px) rotateX(-5deg);
      transition: all 0.2s;
      letter-spacing: 2px;
    }

    .arcade-back:hover {
      transform: perspective(500px) rotateX(-5deg) scale(1.05) translateY(-2px);
      box-shadow: 
        0 0 25px #ff00ff,
        inset 0 0 25px rgba(255, 0, 255, 0.4),
        0 6px 0 #660066;
      text-shadow: 
        0 0 8px #00ffff,
        0 0 15px #00ffff,
        0 0 25px #ff00ff,
        0 0 40px #ff00ff;
    }

    .arcade-back:active {
      transform: perspective(500px) rotateX(-5deg) scale(0.98) translateY(2px);
      box-shadow: 
        0 0 15px #ff00ff,
        inset 0 0 15px rgba(255, 0, 255, 0.2),
        0 2px 0 #660066;
    }

    @keyframes pulse {
      0%, 100% { 
        border-color: #ff00ff;
        box-shadow: 
          0 0 15px #ff00ff,
          inset 0 0 15px rgba(255, 0, 255, 0.2),
          0 4px 0 #660066;
      }
      50% { 
        border-color: #ff66ff;
        box-shadow: 
          0 0 25px #ff00ff,
          inset 0 0 25px rgba(255, 0, 255, 0.3),
          0 4px 0 #660066;
      }
    }

    .wiki-header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 2px solid #00ff41;
    }

    .wiki-header h1 {
      font-size: 3rem;
      margin: 0;
      color: #00ff41;
      text-shadow: 0 0 10px #00ff41;
    }

    .subtitle {
      font-size: 1.2rem;
      color: #888;
      margin-top: 0.5rem;
    }

    .search-bar {
      position: relative;
      margin-bottom: 2rem;
    }

    .search-input {
      width: 100%;
      padding: 1rem 3rem 1rem 1rem;
      font-size: 1.1rem;
      background: rgba(0, 255, 65, 0.05);
      border: 2px solid #00ff41;
      border-radius: 8px;
      color: #00ff41;
      outline: none;
      transition: all 0.3s;
    }

    .search-input::placeholder {
      color: rgba(0, 255, 65, 0.5);
    }

    .search-input:focus {
      background: rgba(0, 255, 65, 0.1);
      box-shadow: 0 0 20px rgba(0, 255, 65, 0.3);
    }

    .clear-btn {
      position: absolute;
      right: 1rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #00ff41;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.5rem;
      opacity: 0.7;
      transition: opacity 0.3s;
    }

    .clear-btn:hover {
      opacity: 1;
    }

    .wiki-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .wiki-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
      text-decoration: none;
      color: inherit;
      transition: all 0.3s;
      cursor: pointer;
    }

    .wiki-card:hover {
      background: rgba(0, 255, 65, 0.08);
      border-color: #00ff41;
      box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
      transform: translateY(-4px);
    }

    .wiki-card h2 {
      color: #00ff41;
      margin: 0 0 1rem 0;
      font-size: 1.5rem;
    }

    .wiki-card p {
      color: #ccc;
      margin: 0 0 1rem 0;
      line-height: 1.6;
    }

    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .keyword {
      background: rgba(0, 255, 65, 0.1);
      color: #00ff41;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
      border: 1px solid rgba(0, 255, 65, 0.3);
    }

    .no-results {
      text-align: center;
      padding: 3rem;
      color: #888;
      font-size: 1.2rem;
    }
  `]
})
export class WikiIndexComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);
  
  searchQuery = signal('');
  
  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
  
  entries: WikiEntry[] = [
    {
      id: 'game-objects',
      title: '🌌 Game Objects',
      route: 'game-objects',
      description: 'Complete catalog of all game objects with masses, collision damage, physics properties, and generation parameters.',
      keywords: ['asteroids', 'planets', 'mass', 'collision', 'physics', 'damage', 'portals']
    },
    {
      id: 'glyphs',
      title: '✨ Glyphs & Spells',
      route: 'glyphs',
      description: 'Mystical glyphs and spell system. Learn about each spell type, activation requirements, and effects.',
      keywords: ['magic', 'spells', 'gate', 'void jump', 'speed', 'eternal', 'disruption']
    },
    {
      id: 'spaceship',
      title: '🚀 Spaceship',
      route: 'spaceship',
      description: 'Your vessel and its components: body, wings, thrusters, weapons (TBD). Ship models and characteristics.',
      keywords: ['ship', 'thruster', 'wings', 'weapons', 'body', 'components']
    },
    {
      id: 'solar-systems',
      title: '☀️ Solar Systems',
      route: 'solar-systems',
      description: 'Physics and generation of solar systems. Parameters, debris distribution, orbital mechanics, and procedural generation.',
      keywords: ['solar system', 'generation', 'orbits', 'debris', 'physics', 'human system']
    },
    {
      id: 'planets',
      title: '🌍 Planets',
      route: 'planets',
      description: 'Detailed information about planet types and the Human Solar System planets, including the shattered Earth.',
      keywords: ['planets', 'earth', 'mars', 'venus', 'jupiter', 'saturn', 'types']
    },
    {
      id: 'game-rules',
      title: '📜 Game Rules',
      route: 'game-rules',
      description: 'How to play: landing on planets, navigation, spell casting, collision mechanics, and survival.',
      keywords: ['rules', 'landing', 'controls', 'gameplay', 'mechanics']
    }
  ];

  filteredEntries = signal<WikiEntry[]>(this.entries);

  onSearch() {
    const query = this.searchQuery().toLowerCase().trim();
    
    if (!query) {
      this.filteredEntries.set(this.entries);
      return;
    }

    const searchTerms = query.split(/\s+/);
    
    const filtered = this.entries.filter(entry => {
      const searchText = [
        entry.title,
        entry.description,
        ...entry.keywords
      ].join(' ').toLowerCase();

      return searchTerms.every(term => searchText.includes(term));
    });

    this.filteredEntries.set(filtered);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.filteredEntries.set(this.entries);
  }
}
