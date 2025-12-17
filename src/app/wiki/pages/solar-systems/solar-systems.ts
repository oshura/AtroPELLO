import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

@Component({
  selector: 'app-solar-systems-wiki',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-header">
        <h1>☀️ Solar Systems</h1>
      </header>

      <section class="intro">
        <p>Procedurally generated star systems with realistic orbital mechanics and dynamic debris fields.</p>
      </section>

      <div class="system-types">
        <h2>System Types</h2>
        
        <div class="system-card">
          <h3>🌍 Human Solar System</h3>
          <p class="description">Pre-configured system based on our solar system, with the dramatic addition of Earth's catastrophic split.</p>
          
          <div class="params">
            <h4>Configuration:</h4>
            <ul>
              <li><strong>Sun Radius:</strong> 1500 units</li>
              <li><strong>Planets:</strong> 8 (Mercury, Venus, Earth-Split, Mars, Jupiter, Saturn, Uranus, Neptune)</li>
              <li><strong>Orbital Distances:</strong> Scaled approximately 1:1,000,000 from real values</li>
              <li><strong>Asteroid Belt:</strong> Between Mars and Jupiter (2.2-3.2 AU scaled)</li>
              <li><strong>Debris Density:</strong> Medium (50-80 clusters)</li>
            </ul>
          </div>
          
          <div class="note">
            <strong>Special Feature:</strong> Earth has been split into two halves, exposing the molten core. 
            The debris field between the halves is extremely dense and dangerous.
          </div>
        </div>

        <div class="system-card">
          <h3>🌌 Procedural Solar Systems</h3>
          <p class="description">Randomly generated systems with varied characteristics.</p>
          
          <div class="params">
            <h4>Generation Parameters:</h4>
            <div class="param-grid">
              <div class="param">
                <span class="param-name">Planets:</span>
                <span class="param-value">3-8</span>
              </div>
              <div class="param">
                <span class="param-name">Sun Radius:</span>
                <span class="param-value">1500-2500 units</span>
              </div>
              <div class="param">
                <span class="param-name">First Orbit:</span>
                <span class="param-value">2000-3000 units</span>
              </div>
              <div class="param">
                <span class="param-name">Orbit Spacing:</span>
                <span class="param-value">1500-3000 units</span>
              </div>
              <div class="param">
                <span class="param-name">Planet Radius:</span>
                <span class="param-value">150-1200 u (gigantes 1.3k-2.3k, anillados 2.6k-4.2k)</span>
              </div>
              <div class="param">
                <span class="param-name">Debris Clusters:</span>
                <span class="param-value">30-120</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <section class="physics">
        <h2>⚙️ Orbital Physics</h2>
        
        <div class="physics-details">
          <h3>Planetary Orbits</h3>
          <ul>
            <li><strong>Estado actual:</strong> Los planetas permanecen estáticos, así que puedes planear rutas sin preocuparte por órbitas móviles. Más adelante empezarán a moverse.</li>
            <li><strong>Corredores seguros:</strong> Cada órbita deja un pasillo de 1500-3000 unidades para maniobrar sin rozar otras esferas de influencia.</li>
            <li><strong>Distancia mínima al sol:</strong> Ningún mundo aparece a menos de 2000 unidades, dándote margen antes de entrar en la zona de calor letal.</li>
            <li><strong>Impactos:</strong> Golpear un planeta equivale a 100.000 de daño: no hay aterrizajes de emergencia si llegas a esa velocidad.</li>
          </ul>

          <h3>Asteroid Mechanics</h3>
          <ul>
            <li><strong>Trails:</strong> Los campos aparecen en pequeños trenes de 5-15 rocas que comparten dirección.</li>
            <li><strong>Movimiento común:</strong> Cada trail avanza con la misma velocidad base, así que puedes leer su trayectoria a simple vista.</li>
            <li><strong>Deriva individual:</strong> Las rocas se mueven unos 0.1-0.5u por fotograma en direcciones aleatorias, generando huecos temporales.</li>
            <li><strong>Núcleo invisible:</strong> Cada trail orbita un centro que define la posición del grupo; destruirlo dispersa las piezas.</li>
            <li><strong>Zonas calientes:</strong> La mayoría se concentra entre órbitas rocosas y gigantes gaseosos.</li>
          </ul>

          <h3>Collision Physics</h3>
          <ul>
            <li><strong>Asteroides pequeños:</strong> Rebotan contigo y transfieren parte de tu inercia; cuanto más rápido vas, mayor será el empujón.</li>
            <li><strong>Trails fragmentados:</strong> Cada impacto separa esa roca del grupo y la deja flotando con la velocidad que llevaba.</li>
            <li><strong>Objetos enormes:</strong> No se mueven ni un milímetro. Si los rozas, la nave se desliza por su superficie preservando la velocidad tangencial.</li>
            <li><strong>Detección de aproximación:</strong> El juego distingue si embistes una roca estacionaria o si una roca móvil te golpea para aplicar el daño adecuado.</li>
          </ul>
        </div>
      </section>

      <section class="debris-system">
        <h2>🌠 Debris Distribution</h2>
        
        <div class="debris-rules">
          <h3>Density Variation</h3>
          <p>Debris density varies by solar system type and region:</p>
          
          <div class="density-grid">
            <div class="density-zone">
              <h4>Inner System</h4>
              <p>Close to sun (< 5000 units)</p>
              <p><strong>Density:</strong> Low (5-15 clusters)</p>
              <p><strong>Type:</strong> Small rocky asteroids</p>
            </div>
            
            <div class="density-zone">
              <h4>Asteroid Belt</h4>
              <p>Between rocky and gas planets</p>
              <p><strong>Density:</strong> Very High (40-80 clusters)</p>
              <p><strong>Type:</strong> Mixed sizes, super/mega asteroids</p>
            </div>
            
            <div class="density-zone">
              <h4>Outer System</h4>
              <p>Beyond gas giants</p>
              <p><strong>Density:</strong> Medium (15-30 clusters)</p>
              <p><strong>Type:</strong> Icy asteroids, dwarf planets</p>
            </div>
            
            <div class="density-zone">
              <h4>Deep Space</h4>
              <p>Far from planets (> 20,000 units)</p>
              <p><strong>Density:</strong> Sparse (5-10 clusters)</p>
              <p><strong>Type:</strong> Scattered individual asteroids</p>
            </div>
          </div>

          <h3>Cluster Placement Rules</h3>
          <ul>
            <li>Minimum distance between cluster centers: 500 units</li>
            <li>Clusters avoid spawning within 1.5x planet radius of any planet</li>
            <li>Higher concentration along orbital planes</li>
            <li>Random scatter adds unpredictability to navigation</li>
          </ul>
        </div>
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

    .page-header {
      margin-bottom: 2rem;
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

    .system-types h2,
    .physics h2,
    .debris-system h2 {
      color: #00ff41;
      margin-top: 2rem;
      margin-bottom: 1.5rem;
    }

    .system-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
    }

    .system-card h3 {
      color: #00ff41;
      margin: 0 0 1rem 0;
      font-size: 1.8rem;
    }

    .description {
      color: #ccc;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }

    .params h4 {
      color: #00ff41;
      margin: 1.5rem 0 1rem 0;
    }

    .params ul {
      line-height: 2;
      padding-left: 2rem;
    }

    .param-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }

    .param {
      background: rgba(0, 255, 65, 0.05);
      padding: 1rem;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 65, 0.2);
      display: flex;
      justify-content: space-between;
    }

    .param-name {
      color: #888;
      font-weight: 600;
    }

    .param-value {
      color: #00ff41;
      font-weight: bold;
    }

    .note {
      background: rgba(0, 255, 65, 0.1);
      border-left: 4px solid #00ff41;
      padding: 1rem;
      margin-top: 1.5rem;
      border-radius: 4px;
    }

    .physics-details h3 {
      color: #00ff41;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }

    .physics-details ul {
      line-height: 2;
      padding-left: 2rem;
    }

    .debris-rules h3 {
      color: #00ff41;
      margin: 2rem 0 1rem 0;
    }

    .density-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin: 1.5rem 0;
    }

    .density-zone {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
    }

    .density-zone h4 {
      color: #00ff41;
      margin: 0 0 0.5rem 0;
    }

    .density-zone p {
      margin: 0.5rem 0;
      color: #ccc;
    }

    .tbd-section {
      margin-top: 3rem;
      background: rgba(255, 170, 0, 0.05);
      border: 1px solid rgba(255, 170, 0, 0.3);
      border-radius: 8px;
      padding: 2rem;
    }

    .tbd-section h2 {
      color: #ffaa00;
      margin-top: 0;
    }

    .tbd-section ul {
      line-height: 2;
      padding-left: 2rem;
    }
  `]
})
export class SolarSystemsWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
