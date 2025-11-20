import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

interface Planet {
  name: string;
  type: string;
  realDistance: string;
  scaledDistance: number;
  radius: number;
  description: string;
  special?: string;
}

@Component({
  selector: 'app-planets-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-page">
      <header class="page-header">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>🌍 Planets</h1>
      </header>

      <section class="intro">
        <p>Explore the planets of the Human Solar System and learn about the various planetary types you'll encounter.</p>
      </section>

      <div class="planet-types">
        <h2>Planetary Types</h2>
        
        <div class="type-grid">
          <div class="type-card">
            <h3>🪨 Rocky Planets</h3>
            <p>Small, dense worlds with solid surfaces. Mercury, Venus, Earth, Mars.</p>
            <ul>
              <li>Radius: 150-400 units</li>
              <li>Can be landed on</li>
              <li>Various surface colors and textures</li>
            </ul>
          </div>

          <div class="type-card">
            <h3>💨 Gas Giants</h3>
            <p>Massive planets without solid surfaces. Jupiter, Saturn.</p>
            <ul>
              <li>Radius: 600-1200 units</li>
              <li>Swirling atmospheric bands</li>
              <li>Cannot land - instant death</li>
            </ul>
          </div>

          <div class="type-card">
            <h3>🧊 Ice Giants</h3>
            <p>Cold outer system worlds. Uranus, Neptune.</p>
            <ul>
              <li>Radius: 300-500 units</li>
              <li>Blue-green coloration</li>
              <li>Icy atmospheric composition</li>
            </ul>
          </div>

          <div class="type-card">
            <h3>⭕ Ringed Planets</h3>
            <p>Planets with spectacular ring systems.</p>
            <ul>
              <li>Ring radius: 1.5-2.5x planet radius</li>
              <li>Multiple ring bands</li>
              <li>Saturn is the prime example</li>
            </ul>
          </div>
        </div>
      </div>

      <section class="human-system">
        <h2>☀️ Human Solar System Planets</h2>
        
        @for (planet of planets; track planet.name) {
          <div class="planet-card" [class.special]="planet.special">
            <div class="planet-header">
              <h3>{{ planet.name }}</h3>
              <span class="planet-type">{{ planet.type }}</span>
            </div>
            
            <div class="planet-stats">
              <div class="stat">
                <span class="stat-label">Real Distance from Sun:</span>
                <span class="stat-value">{{ planet.realDistance }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Scaled Distance:</span>
                <span class="stat-value">{{ planet.scaledDistance }} units</span>
              </div>
              <div class="stat">
                <span class="stat-label">Radius:</span>
                <span class="stat-value">{{ planet.radius }} units</span>
              </div>
            </div>
            
            <p class="planet-description">{{ planet.description }}</p>
            
            @if (planet.special) {
              <div class="special-note">
                <strong>⚠️ Special Feature:</strong> {{ planet.special }}
              </div>
            }
          </div>
        }
      </section>

      <section class="landing">
        <h2>🛬 Landing Mechanics</h2>
        <p>Landing on planets is a precision maneuver:</p>
        <ul>
          <li><strong>Approach Speed:</strong> Must be less than 2 units/frame for safe landing</li>
          <li><strong>Angle:</strong> Approach perpendicular to surface (within 30°)</li>
          <li><strong>Landing Zone:</strong> Must be within planet's bounding sphere</li>
          <li><strong>Success:</strong> Ship docks on surface, can explore or depart</li>
          <li><strong>Failure:</strong> High-speed collision causes damage</li>
        </ul>
        <p class="tbd"><strong>TBD:</strong> Landing UI, surface exploration, resource gathering, planet-specific missions</p>
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-height: 100%;
      background: #0a0a0f;
    }

    .wiki-page {
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
      background: linear-gradient(135deg, #ff0080 0%, #ff8c00 100%);
      border: 4px solid #ffff00;
      padding: 12px 24px;
      font-family: 'Press Start 2P', 'Courier New', monospace;
      font-size: 14px;
      color: #ffff00;
      text-shadow: 2px 2px 0 #ff0080, -2px -2px 0 #00ffff;
      box-shadow: 0 0 20px #ff0080, 0 0 40px #ff8c00, inset 0 0 10px rgba(255, 255, 0, 0.3);
      cursor: pointer;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: blink 1.5s infinite;
      transform: skew(-5deg);
      transition: all 0.2s;
    }

    .arcade-back:hover {
      transform: skew(-5deg) scale(1.1);
      box-shadow: 0 0 30px #ff0080, 0 0 60px #ff8c00, inset 0 0 20px rgba(255, 255, 0, 0.5);
    }

    .arcade-back:active {
      transform: skew(-5deg) scale(0.95);
    }

    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 99% { opacity: 0.7; }
    }

    .page-header {
      margin-bottom: 2rem;
    }

    .back-link {
      color: #00ff41;
      text-decoration: none;
      font-size: 1rem;
      display: inline-block;
      margin-bottom: 1rem;
      transition: opacity 0.3s;
    }

    .back-link:hover {
      opacity: 0.7;
    }

    .page-header h1 {
      color: #00ff41;
      font-size: 2.5rem;
      margin: 0;
      text-shadow: 0 0 10px #00ff41;
    }

    .intro {
      background: rgba(0, 255, 65, 0.05);
      border-left: 4px solid #00ff41;
      padding: 1.5rem;
      margin-bottom: 2rem;
      border-radius: 4px;
    }

    .planet-types h2,
    .human-system h2,
    .landing h2 {
      color: #00ff41;
      margin: 2rem 0 1.5rem 0;
    }

    .type-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .type-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
    }

    .type-card h3 {
      color: #00ff41;
      margin: 0 0 1rem 0;
    }

    .type-card p {
      color: #ccc;
      margin-bottom: 1rem;
      line-height: 1.6;
    }

    .type-card ul {
      padding-left: 1.5rem;
      line-height: 1.8;
    }

    .planet-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 1.5rem;
    }

    .planet-card.special {
      border-color: #ff4444;
      background: rgba(255, 68, 68, 0.05);
    }

    .planet-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(0, 255, 65, 0.2);
    }

    .planet-card.special .planet-header {
      border-bottom-color: rgba(255, 68, 68, 0.3);
    }

    .planet-header h3 {
      color: #00ff41;
      margin: 0;
      font-size: 1.8rem;
    }

    .planet-card.special .planet-header h3 {
      color: #ff4444;
    }

    .planet-type {
      background: rgba(0, 255, 65, 0.2);
      color: #00ff41;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      border: 1px solid #00ff41;
    }

    .planet-stats {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }

    .stat {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem;
      background: rgba(0, 255, 65, 0.05);
      border-radius: 4px;
    }

    .stat-label {
      color: #888;
      font-weight: 600;
    }

    .stat-value {
      color: #00ff41;
      font-weight: bold;
    }

    .planet-description {
      color: #ccc;
      line-height: 1.6;
      margin-bottom: 1rem;
    }

    .special-note {
      background: rgba(255, 68, 68, 0.1);
      border-left: 4px solid #ff4444;
      padding: 1rem;
      border-radius: 4px;
      color: #ffcccc;
    }

    .landing {
      margin-top: 2rem;
      background: rgba(0, 255, 65, 0.05);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
    }

    .landing h2 {
      margin-top: 0;
    }

    .landing ul {
      line-height: 2;
      padding-left: 2rem;
    }

    .tbd {
      margin-top: 1rem;
      padding: 1rem;
      background: rgba(255, 170, 0, 0.1);
      border-left: 3px solid #ffaa00;
      border-radius: 4px;
      color: #ffaa00;
      font-style: italic;
    }
  `]
})
export class PlanetsWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }

  planets: Planet[] = [
    {
      name: 'Mercury',
      type: 'Rocky Planet',
      realDistance: '57.9 million km',
      scaledDistance: 2400,
      radius: 180,
      description: 'Smallest and innermost planet. Heavily cratered surface, extreme temperature variations. Fast orbital period makes it challenging to intercept.'
    },
    {
      name: 'Venus',
      type: 'Rocky Planet',
      realDistance: '108.2 million km',
      scaledDistance: 3200,
      radius: 350,
      description: 'Similar size to Earth, but with a toxic atmosphere. Thick cloud cover gives it a yellowish appearance. Deadly surface conditions.'
    },
    {
      name: 'Earth (Split)',
      type: 'Catastrophically Damaged',
      realDistance: '149.6 million km',
      scaledDistance: 4200,
      radius: 400,
      description: 'Once humanity\'s cradle, now a shattered world. The planet has split into two massive fragments, exposing the molten iron core at the center.',
      special: 'The exposed core glows with intense heat. A dense debris field orbits between the two halves. Approaching the core deals continuous heat damage. This is the most dangerous location in the solar system aside from the Sun itself.'
    },
    {
      name: 'Mars',
      type: 'Rocky Planet',
      realDistance: '227.9 million km',
      scaledDistance: 5400,
      radius: 250,
      description: 'The Red Planet. Ancient riverbeds and polar ice caps visible. Smaller than Earth, easier to land on. Often used as a navigation waypoint.'
    },
    {
      name: 'Jupiter',
      type: 'Gas Giant',
      realDistance: '778.5 million km',
      scaledDistance: 8200,
      radius: 1000,
      description: 'The largest planet in the system. Massive gas giant with distinctive bands and the Great Red Spot. Immense gravitational influence. Cannot be landed on.'
    },
    {
      name: 'Saturn',
      type: 'Ringed Gas Giant',
      realDistance: '1.43 billion km',
      scaledDistance: 11500,
      radius: 900,
      description: 'Famous for its spectacular ring system. Multiple bands of ice and rock orbit the planet. Navigating through the rings is treacherous but offers shortcuts.'
    },
    {
      name: 'Uranus',
      type: 'Ice Giant',
      realDistance: '2.87 billion km',
      scaledDistance: 16000,
      radius: 450,
      description: 'Tilted on its side with a blue-green appearance. Extremely cold with methane atmosphere. Remote and rarely visited.'
    },
    {
      name: 'Neptune',
      type: 'Ice Giant',
      realDistance: '4.50 billion km',
      scaledDistance: 19500,
      radius: 440,
      description: 'The outermost major planet. Deep blue color from methane absorption. Furthest safe haven before deep space. Beyond here, the solar system becomes increasingly empty and dangerous.'
    }
  ];
}
