import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

interface GameObjectData {
  type: string;
  category: string;
  mass: number;
  collisionDamage: number;
  physicsSize: string;
  minRadius: number;
  maxRadius: number;
  generation: string;
  imageUrl?: string;
}

@Component({
  selector: 'app-game-objects-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-page">
      <header class="page-header">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>🌌 Game Objects</h1>
      </header>

      <section class="intro">
        <p>Complete catalog of all objects in the AtroPELLO universe. Each object has unique physical properties that affect gameplay.</p>
      </section>

      <section class="object-grid">
        @for (obj of gameObjects; track obj.type) {
          <div class="object-card" [id]="obj.type">
            <div class="object-header">
              <h2>
                @if (obj.imageUrl) {
                  <img [src]="obj.imageUrl" [alt]="obj.type" class="object-icon">
                }
                {{ obj.type }}
              </h2>
              <span class="category-badge" [class]="'badge-' + obj.category">{{ obj.category }}</span>
            </div>
            
            <div class="object-details">
              <div class="detail-row">
                <span class="label">Mass:</span>
                <span class="value">{{ obj.mass | number:'1.0-0' }} kg</span>
              </div>
              <div class="detail-row">
                <span class="label">Collision Damage:</span>
                <span class="value damage">{{ obj.collisionDamage }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Physics Size:</span>
                <span class="value">{{ obj.physicsSize }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Radius Range:</span>
                <span class="value">{{ obj.minRadius }} - {{ obj.maxRadius }} units</span>
              </div>
              <div class="detail-full">
                <span class="label">Generation:</span>
                <p class="generation-text">{{ obj.generation }}</p>
              </div>
            </div>
          </div>
        }
      </section>

      <section class="physics-notes">
        <h2>Physics Notes</h2>
        <ul>
          <li><strong>SMALL</strong> objects: Full 3D inelastic collision physics with momentum conservation</li>
          <li><strong>MEDIUM/LARGE</strong> objects: Immovable, ship slides around them</li>
          <li><strong>MASSIVE</strong> objects: Extremely high damage, ship cannot penetrate</li>
          <li><strong>ETHEREAL</strong> objects: No collision physics (portals)</li>
        </ul>
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
      max-width: 1400px;
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

    .intro p {
      margin: 0;
      line-height: 1.6;
    }

    .object-grid {
      display: grid;
      gap: 1.5rem;
    }

    .object-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
      transition: all 0.3s;
    }

    .object-card:hover {
      border-color: #00ff41;
      box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
    }

    .object-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(0, 255, 65, 0.2);
    }

    .object-header h2 {
      color: #00ff41;
      margin: 0;
      font-size: 1.8rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .object-icon {
      width: 40px;
      height: 40px;
      object-fit: contain;
    }

    .category-badge {
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: bold;
      text-transform: uppercase;
    }

    .badge-debris {
      background: rgba(255, 165, 0, 0.2);
      color: #ffa500;
      border: 1px solid #ffa500;
    }

    .badge-celestial {
      background: rgba(100, 149, 237, 0.2);
      color: #6495ed;
      border: 1px solid #6495ed;
    }

    .badge-portal {
      background: rgba(138, 43, 226, 0.2);
      color: #8a2be2;
      border: 1px solid #8a2be2;
    }

    .object-details {
      display: grid;
      gap: 1rem;
    }

    .detail-row {
      display: grid;
      grid-template-columns: 180px 1fr;
      align-items: center;
    }

    .detail-full {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .label {
      color: #888;
      font-weight: 600;
    }

    .value {
      color: #00ff41;
      font-weight: 500;
    }

    .value.damage {
      color: #ff4444;
      font-weight: bold;
    }

    .generation-text {
      color: #ccc;
      line-height: 1.6;
      margin: 0;
      padding-left: 1rem;
      border-left: 2px solid rgba(0, 255, 65, 0.3);
    }

    .physics-notes {
      margin-top: 3rem;
      padding: 2rem;
      background: rgba(0, 255, 65, 0.05);
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 65, 0.3);
    }

    .physics-notes h2 {
      color: #00ff41;
      margin-top: 0;
    }

    .physics-notes ul {
      list-style: none;
      padding: 0;
    }

    .physics-notes li {
      padding: 0.75rem 0;
      border-bottom: 1px solid rgba(0, 255, 65, 0.1);
      line-height: 1.6;
    }

    .physics-notes li:last-child {
      border-bottom: none;
    }
  `]
})
export class GameObjectsWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);
  
  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
  
  gameObjects: GameObjectData[] = [
    {
      type: 'Asteroid',
      category: 'debris',
      mass: 1,
      collisionDamage: 10,
      physicsSize: 'SMALL',
      minRadius: 8,
      maxRadius: 25,
      generation: 'Generated in clusters (trails). Each cluster contains 5-15 asteroids with shared orbital motion. Random drift speeds between 0.1-0.5 units/frame.'
    },
    {
      type: 'Super Asteroid',
      category: 'debris',
      mass: 10,
      collisionDamage: 75,
      physicsSize: 'MEDIUM',
      minRadius: 35,
      maxRadius: 80,
      generation: 'Spawned independently in asteroid-rich regions. Approximately 5-10% of asteroid population. Immovable obstacles that cause significant damage.'
    },
    {
      type: 'Mega Asteroid',
      category: 'debris',
      mass: 100,
      collisionDamage: 150,
      physicsSize: 'LARGE',
      minRadius: 100,
      maxRadius: 200,
      generation: 'Rare spawns (1-3 per solar system). Often found near planetary orbits. Ship must navigate around them - collision is catastrophic.'
    },
    {
      type: 'Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 300,
      maxRadius: 800,
      generation: 'Procedurally generated in orbital paths. 3-8 planets per solar system. Distance between orbits: 1500-3000 units. Various visual types with random colors.'
    },
    {
      type: 'Ringed Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 400,
      maxRadius: 900,
      generation: 'Rare variant (10-20% of planets). Features procedurally generated ring system with multiple bands. Ring radius typically 1.5-2.5x planet radius.'
    },
    {
      type: 'Gaseous Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 500,
      maxRadius: 1000,
      generation: 'Large gas giants with swirling atmospheric patterns. Typically outer solar system. Distinctive banded appearance with dynamic cloud textures.'
    },
    {
      type: 'Giant Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 600,
      maxRadius: 1200,
      generation: 'Largest planetary bodies. 0-2 per system. Dominant gravitational influence in their orbital region. Can have multiple moons (TBD).'
    },
    {
      type: 'Dwarf Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 150,
      maxRadius: 300,
      generation: 'Small rocky bodies in outer orbits. 2-5 per system. Often found in asteroid belt regions. Can be landed on with precision.'
    },
    {
      type: 'Protoplanet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 200,
      maxRadius: 400,
      generation: 'Forming planetary bodies with irregular shapes. Rare (5% spawn rate). Visual effect of accretion disk. Unstable appearance.'
    },
    {
      type: 'Earth Split Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 400,
      maxRadius: 600,
      generation: 'Unique to Human Solar System. Earth after catastrophic split. Exposed molten core visible. Two halves with debris field between them.'
    },
    {
      type: 'Sun',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 1500,
      maxRadius: 2500,
      generation: 'One per solar system at center (0,0,0). Emits dynamic light with corona effects. Extreme heat damage when approached. Minimum safe distance: 3000 units.'
    },
    {
      type: 'Portal',
      category: 'portal',
      mass: 0,
      collisionDamage: 0,
      physicsSize: 'ETHEREAL',
      minRadius: 80,
      maxRadius: 150,
      generation: 'Created by Gate Rite spell. Links two locations in space. Semi-transparent visual with swirling energy. Player can traverse. Persists until dismissed or limit reached.'
    }
  ];
}
