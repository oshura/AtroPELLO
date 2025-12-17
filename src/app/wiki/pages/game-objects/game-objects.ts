import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

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
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
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
          <li><strong>SMALL</strong> objects: rebotan y alteran tu trayectoria, sobre todo si llegas con mucha velocidad.</li>
          <li><strong>MEDIUM/LARGE</strong> objects: actúan como muros inmóviles; la nave se desliza alrededor y pierde gran parte de su escudo.</li>
          <li><strong>MASSIVE</strong> objects: impacto letal inmediato. No intentes atravesarlos.</li>
          <li><strong>ETHEREAL</strong> objects: no tienen colisión física; solo sirven como portales o marcadores.</li>
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
      generation: 'Se agrupan en trail y comparten trayectoria. Son rápidos y te obligan a corregir rumbo si impactas con varios seguidos.'
    },
    {
      type: 'Super Asteroid',
      category: 'debris',
      mass: 10,
      collisionDamage: 75,
      physicsSize: 'MEDIUM',
      minRadius: 35,
      maxRadius: 80,
      generation: 'Aparecen aislados en los tramos más densos. Apenas se mueven y tienes que rodearlos porque cualquier roce destroza el fuselaje.'
    },
    {
      type: 'Mega Asteroid',
      category: 'debris',
      mass: 100,
      collisionDamage: 150,
      physicsSize: 'LARGE',
      minRadius: 100,
      maxRadius: 200,
      generation: 'Solo encontrarás unos pocos por sistema y suelen custodiar órbitas estratégicas. Chocar contra uno equivale a una muerte automática.'
    },
    {
      type: 'Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 300,
      maxRadius: 800,
      generation: 'Orbitan alrededor del sol y definen las rutas principales. Entre órbitas queda espacio suficiente para maniobrar y preparar aterrizajes.'
    },
    {
      type: 'Ringed Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 400,
      maxRadius: 900,
      generation: 'Variante poco frecuente que añade anillos muy visibles. Los fragmentos del anillo ocultan asteroides secundarios y dificultan la navegación cercana.'
    },
    {
      type: 'Gaseous Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 500,
      maxRadius: 1000,
      generation: 'Gigantes gaseosos del exterior. Sus bandas en movimiento se ven desde muy lejos y su atmósfera es letal: nunca intentes aterrizar.'
    },
    {
      type: 'Giant Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 600,
      maxRadius: 1200,
      generation: 'Los cuerpos más pesados del sistema. Obligan a la nave a bordearlos con mucha antelación porque cualquier contacto provoca daños masivos.'
    },
    {
      type: 'Dwarf Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 150,
      maxRadius: 300,
      generation: 'Pequeños mundos rocosos en los cinturones exteriores. Son perfectos para aterrizajes rápidos y para ocultar portales improvisados.'
    },
    {
      type: 'Protoplanet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 200,
      maxRadius: 400,
      generation: 'Planetas en formación con formas irregulares y polvo orbitando. Algunos eventos narrativos solo se activan frente a ellos.'
    },
    {
      type: 'Earth Split Planet',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 400,
      maxRadius: 600,
      generation: 'Exclusivo del sistema humano: la Tierra partida en dos mitades con el núcleo al rojo vivo y un cinturón inestable que corta el ecuador.'
    },
    {
      type: 'Sun',
      category: 'celestial',
      mass: 1000000,
      collisionDamage: 100000,
      physicsSize: 'MASSIVE',
      minRadius: 1500,
      maxRadius: 2500,
      generation: 'Cada sistema tiene uno en el centro. Irradia calor extremo y debes mantenerte a distancia si no quieres ver cómo la nave se funde.'
    },
    {
      type: 'Portal',
      category: 'portal',
      mass: 0,
      collisionDamage: 0,
      physicsSize: 'ETHEREAL',
      minRadius: 80,
      maxRadius: 150,
      generation: 'Surgidos tras completar un Gate Rite. Enlazan dos sistemas y permanecen activos para permitir viajes de ida y vuelta.'
    }
  ];
}
