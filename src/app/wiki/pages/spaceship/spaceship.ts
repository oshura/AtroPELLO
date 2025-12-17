import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

@Component({
  selector: 'app-spaceship-wiki',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-header">
        <h1>🚀 Spaceship</h1>
      </header>

      <section class="intro">
        <p>Your vessel through the void. A modular spacecraft designed for exploration, spell-casting, and survival.</p>
      </section>

      <div class="ship-overview">
        <h2>Ship Specifications</h2>
        <div class="specs-grid">
          <div class="spec">
            <span class="label">Mass:</span>
            <span class="value">100 kg</span>
          </div>
          <div class="spec">
            <span class="label">Hull Points:</span>
            <span class="value">1000 HP</span>
          </div>
          <div class="spec">
            <span class="label">Max Speed:</span>
            <span class="value">15 units/frame</span>
          </div>
          <div class="spec">
            <span class="label">Acceleration:</span>
            <span class="value">0.3 units/frame²</span>
          </div>
          <div class="spec">
            <span class="label">Turn Rate:</span>
            <span class="value">0.05 rad/frame</span>
          </div>
          <div class="spec">
            <span class="label">Bounding Radius:</span>
            <span class="value">~25 units</span>
          </div>
        </div>
      </div>

      <section class="components">
        <h2>Ship Components</h2>
        
        <div class="component-card">
          <h3>🛡️ Body</h3>
          <div class="component-details">
            <p><strong>Current Model:</strong> Standard Explorer Hull</p>
            <p><strong>Description:</strong> Central chassis providing structural integrity and mounting points for all other components.</p>
            <p><strong>Characteristics:</strong></p>
            <ul>
              <li>Collision detection sphere centered on ship position</li>
              <li>Houses glyph system and energy core</li>
              <li>Damage distribution across all components</li>
            </ul>
            <p class="tbd">Future: Multiple hull types with different mass/armor/capacity trade-offs (TBD)</p>
          </div>
        </div>

        <div class="component-card">
          <h3>🪽 Wings</h3>
          <div class="component-details">
            <p><strong>Current Model:</strong> Standard Stabilizers</p>
            <p><strong>Description:</strong> Provide aerodynamic stability and house maneuvering thrusters.</p>
            <p><strong>Characteristics:</strong></p>
            <ul>
              <li>Affect turn rate and roll stability</li>
              <li>Visual component in ship model</li>
              <li>Damage reduces maneuverability (TBD)</li>
            </ul>
            <p class="tbd">Future: Wing variants affecting speed/agility balance (TBD)</p>
          </div>
        </div>

        <div class="component-card">
          <h3>🔥 Thruster</h3>
          <div class="component-details">
            <p><strong>Current Model:</strong> Plasma Drive MK-I</p>
            <p><strong>Description:</strong> Primary propulsion system with visual and audio feedback.</p>
            <p><strong>Characteristics:</strong></p>
            <ul>
              <li>Variable thrust output (0-100%)</li>
              <li>Dynamic audio pitch based on throttle</li>
              <li>Visual particle trail effect</li>
              <li>Ambient space dust realigns with ship orientation after takeoff/portal jumps, so the parallax cloud never collapses into a single plane.</li>
              <li>Forward acceleration only (reverse via rotation)</li>
            </ul>
            <p><strong>Audio:</strong> Continuous loop with real-time volume/pitch modulation. Thruster sound fades in/out smoothly with throttle input.</p>
            <p class="tbd">Future: Different thruster types with efficiency/power trade-offs (TBD)</p>
          </div>
        </div>

        <div class="component-card tbd-component">
          <h3>⚔️ Weapons (TBD)</h3>
          <div class="component-details">
            <p><strong>Status:</strong> Not yet implemented</p>
            <p><strong>Planned Features:</strong></p>
            <ul>
              <li>Projectile-based weapons (energy bolts, missiles)</li>
              <li>Target leading for moving objects</li>
              <li>Ammunition or energy-based firing</li>
              <li>Different weapon types: rapid-fire, heavy, area-effect</li>
              <li>Asteroid destruction mechanics</li>
            </ul>
            <p class="tbd">Code structure supports weapon mounting. Implementation pending game balance design.</p>
          </div>
        </div>
      </section>

      <section class="controls">
        <h2>⌨️ Controls</h2>
        <p class="note controls-note">Todos los atajos listados corresponden a la configuración por defecto documentada en <em>Input_Bindings</em>. Si personalizas las teclas en el diálogo de controles, recuerda adaptar estas acciones a tu nuevo esquema.</p>
        <div class="controls-grid">
          <div class="control-group">
            <h3>Actitud</h3>
            <div class="control-item">
              <kbd>W</kbd>
              <span>Pitch down</span>
            </div>
            <div class="control-item">
              <kbd>S</kbd>
              <span>Pitch up</span>
            </div>
            <div class="control-item">
              <kbd>A</kbd>
              <span>Yaw left</span>
            </div>
            <div class="control-item">
              <kbd>D</kbd>
              <span>Yaw right</span>
            </div>
            <div class="control-item">
              <kbd>Q</kbd>
              <span>Roll left</span>
            </div>
            <div class="control-item">
              <kbd>E</kbd>
              <span>Roll right</span>
            </div>
          </div>

          <div class="control-group">
            <h3>Empuje y precisión</h3>
            <div class="control-item">
              <span class="key-cluster">
                <kbd>+</kbd>
                <span class="key-sep">/</span>
                <kbd>=</kbd>
              </span>
              <span>Thruster up</span>
            </div>
            <div class="control-item">
              <span class="key-cluster">
                <kbd>-</kbd>
                <span class="key-sep">/</span>
                <kbd>_</kbd>
              </span>
              <span>Thruster down</span>
            </div>
            <div class="control-item">
              <kbd>Shift</kbd>
              <span>Precisión mientras se mantiene</span>
            </div>
            <div class="control-item">
              <kbd>Caps&nbsp;Lock</kbd>
              <span>Precisión conmutada</span>
            </div>
          </div>

          <div class="control-group">
            <h3>Cámaras y zoom</h3>
            <div class="control-item">
              <kbd>7</kbd>
              <span>Rear view</span>
            </div>
            <div class="control-item">
              <kbd>8</kbd>
              <span>Cockpit</span>
            </div>
            <div class="control-item">
              <kbd>9</kbd>
              <span>Rear tracking</span>
            </div>
            <div class="control-item">
              <kbd>0</kbd>
              <span>Vista externa fija</span>
            </div>
            <div class="control-item">
              <kbd>Mouse Wheel</kbd>
              <span>Zoom in/out</span>
            </div>
          </div>
          <p class="note camera-note">Puedes redimensionar la ventana o sacar el canvas cuando quieras: la cámara y el HUD se reajustan al instante, sin estirar la imagen.</p>
          <p class="note camera-note">Las cámaras externas aplican un ligero <em>intent offset</em>: al mantener <kbd class="key-chord">W/S/A/D/Q/E</kbd> la vista se desplaza o banca en esa dirección, y al acelerar/frenar con <span class="key-cluster"><kbd>+</kbd><span class="key-sep">/</span><kbd>-</kbd></span> solo varía la distancia a la nave. Todo vuelve suave a su ancla al soltar las teclas. La vista interior y la cinemática se mantienen fijas.</p>

          <div class="control-group">
            <h3>Paneles</h3>
            <div class="control-item">
              <kbd>M</kbd>
              <span>Solar System Panel</span>
            </div>
            <div class="control-item">
              <kbd>G</kbd>
              <span>Grimorio</span>
            </div>
            <div class="control-item">
              <kbd>I</kbd>
              <span>Inventario</span>
            </div>
            <div class="control-item">
              <kbd>Esc</kbd>
              <span>Cierra panel o limpia objetivo</span>
            </div>
          </div>
        </div>
        <p class="note interface-note">Map, Grimoire e Inventory comparten un cooldown común de 500&nbsp;ms para evitar dobles aperturas accidentales. Puedes cerrar y reabrir cualquiera casi al instante, pero la interfaz descarta pulsaciones repetidas dentro de esa ventana para que el cursor no se rompa.</p>
      </section>

      <section class="hud-marquee">
        <h2>🖥️ HUD Marquee Link</h2>
        <p>La marquesina te muestra alertas y consejos en tiempo real: aterrizajes, amenazas, rituales o eventos del sistema. Si no hay mensajes pendientes permanece visible, indicando que la situación está estable.</p>
        <div class="marquee-columns">
          <div class="marquee-card">
            <h3>Mission Flow</h3>
            <ul>
              <li><strong>Respawn:</strong> Anchor label plus sanity/health recovery notices.</li>
              <li><strong>Landing Sequence:</strong> Approach initiation, touchdown confirmations and abort reasons.</li>
              <li><strong>Takeoff Sequence:</strong> Launch start, completion, or abort outcomes.</li>
            </ul>
          </div>
          <div class="marquee-card">
            <h3>Hazards & Damage</h3>
            <ul>
              <li><strong>Ship Damage:</strong> High-impact collisions that pierce the hull buffer.</li>
              <li><strong>Hazard:</strong> Solar radiation ticks, environmental DoT and anomaly burns.</li>
              <li><strong>Warning:</strong> System safeguards (panel locks, soft-lock prevention, etc.).</li>
            </ul>
          </div>
          <div class="marquee-card">
            <h3>World Events</h3>
            <ul>
              <li><strong>Portal:</strong> Concordia traversals plus Gate Rite stabilization results.</li>
              <li><strong>Lesser Beings:</strong> Rewards, discoveries and now incursion warnings—cada portal que abre una brecha anuncia la criatura por su nombre y confirma que viene directo a la nave.</li>
              <li><strong>Void Ritual:</strong> Anchoring Pulse, Material Disruption and other rites.</li>
            </ul>
          </div>
        </div>
        <p class="note marquee-note">El feed filtra duplicados y limita la velocidad del scroll para que siempre puedas leer los avisos. Tras cada respawn hay un respiro de ~1.2&nbsp;s antes de que la Energía del Vacío vuelva a bajar.</p>
        <p class="note marquee-note">Cada alerta completa una única vuelta antes de caducar; cuando no hay cola la marquesina se atenúa y vuelve a iluminarse en cuanto llega un mensaje nuevo.</p>
      </section>

      <section class="customization tbd-section">
        <h2>🔧 Customization (TBD)</h2>
        <p>The ship is designed with modularity in mind. Future updates will allow:</p>
        <ul>
          <li>Swapping components for different performance characteristics</li>
          <li>Visual customization (paint schemes, decals)</li>
          <li>Performance upgrades (better thrusters, reinforced hull)</li>
          <li>Specialized builds (explorer, combat, speed racer)</li>
        </ul>
        <p class="note">Por ahora existe un único modelo con todos los módulos instalados; las próximas versiones permitirán intercambiarlos de forma oficial.</p>
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

    .key-cluster {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .key-sep {
      color: #7dd3fc;
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 255, 65, 0.2);
      color: #00ff41;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      border: 1px solid #00ff41;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      box-shadow: 0 2px 0 rgba(0, 255, 65, 0.3);
      min-width: 40px;
      text-align: center;
      white-space: nowrap;
    }

    kbd.key-chord {
      letter-spacing: 0.05rem;
    }

    .specs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-top: 1.5rem;
    }

    .spec {
      display: flex;
      justify-content: space-between;
      padding: 1rem;
      background: rgba(0, 255, 65, 0.05);
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 65, 0.2);
    }

    .spec .label {
      color: #888;
      font-weight: 600;
    }

    .spec .value {
      color: #00ff41;
      font-weight: bold;
    }

    .components h2 {
      color: #00ff41;
      margin-bottom: 1.5rem;
    }

    .component-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .component-card h3 {
      color: #00ff41;
      margin: 0 0 1rem 0;
      font-size: 1.5rem;
    }

    .component-card.tbd-component {
      border-color: rgba(255, 170, 0, 0.3);
      background: rgba(255, 170, 0, 0.03);
    }

    .component-card.tbd-component h3 {
      color: #ffaa00;
    }

    .component-details p {
      margin: 0.75rem 0;
      line-height: 1.6;
    }

    .component-details ul {
      margin: 0.5rem 0;
      padding-left: 2rem;
      line-height: 1.8;
    }

    .tbd {
      color: #ffaa00 !important;
      font-style: italic;
      background: rgba(255, 170, 0, 0.1);
      padding: 0.75rem;
      border-radius: 4px;
      border-left: 3px solid #ffaa00;
      margin-top: 1rem !important;
    }

    .controls {
      margin-top: 2rem;
    }

    .controls h2 {
      color: #00ff41;
      margin-bottom: 1.5rem;
    }

    .controls-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 2rem;
    }

    .control-group h3 {
      color: #00ff41;
      margin-bottom: 1rem;
      font-size: 1.2rem;
    }

    .control-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      background: rgba(0, 255, 65, 0.03);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }

    .control-item span {
      color: #ccc;
    }

    .hud-marquee {
      margin-top: 2.5rem;
      padding: 2rem;
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 65, 0.3);
      background: rgba(0, 255, 65, 0.04);
    }

    .hud-marquee h2 {
      color: #00ff41;
      margin-top: 0;
    }

    .marquee-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-top: 1.5rem;
    }

    .marquee-card {
      padding: 1.25rem;
      border-radius: 6px;
      border: 1px solid rgba(0, 255, 65, 0.2);
      background: rgba(0, 255, 65, 0.06);
    }

    .marquee-card h3 {
      margin: 0 0 0.75rem 0;
      color: #00ff41;
      font-size: 1.2rem;
    }

    .marquee-card ul {
      margin: 0;
      padding-left: 1.25rem;
      color: #c8f5d9;
      line-height: 1.6;
    }

    .marquee-card ol {
      margin: 0;
      padding-left: 1.25rem;
      color: #c8f5d9;
      line-height: 1.6;
    }

    .marquee-card li {
      margin-bottom: 0.5rem;
    }

    .marquee-note {
      margin-top: 1.5rem;
      display: inline-block;
    }

    .customization {
      margin-top: 2rem;
      background: rgba(255, 170, 0, 0.05);
      border: 1px solid rgba(255, 170, 0, 0.3);
      border-radius: 8px;
      padding: 2rem;
    }

    .customization h2 {
      color: #ffaa00;
      margin-top: 0;
    }

    .customization ul {
      line-height: 2;
    }

    .note {
      margin-top: 1rem;
      padding: 1rem;
      background: rgba(0, 255, 65, 0.05);
      border-left: 3px solid #00ff41;
      border-radius: 4px;
      font-style: italic;
    }
  `]
})
export class SpaceshipWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
