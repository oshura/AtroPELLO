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
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
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
        <div class="controls-grid">
          <div class="control-group">
            <h3>Movement</h3>
            <div class="control-item">
              <kbd>W</kbd> / <kbd>↑</kbd>
              <span>Thrust Forward</span>
            </div>
            <div class="control-item">
              <kbd>A</kbd> / <kbd>←</kbd>
              <span>Rotate Left</span>
            </div>
            <div class="control-item">
              <kbd>D</kbd> / <kbd>→</kbd>
              <span>Rotate Right</span>
            </div>
            <div class="control-item">
              <kbd>S</kbd> / <kbd>↓</kbd>
              <span>Brake / Slow Down</span>
            </div>
            <div class="control-item">
              <kbd>Shift</kbd>
              <span>Precision rotation (half turn rate while held)</span>
            </div>
            <div class="control-item">
              <kbd>Caps&nbsp;Lock</kbd>
              <span>Toggle precision rotation latch</span>
            </div>
          </div>

          <p class="note movement-note">Mantén <kbd>Shift</kbd> presionado o alterna <kbd>Caps&nbsp;Lock</kbd> para activar la rotación precisa: el motor reduce al 50&nbsp;% la velocidad de pitch, yaw y roll, y la brújula ilumina el texto <em>PRECISION</em> bajo los timers para recordarte que sigues en modo fino.</p>

          <div class="control-group">
            <h3>Camera</h3>
            <div class="control-item">
              <kbd>C</kbd>
              <span>Toggle Camera Mode</span>
            </div>
            <div class="control-item">
              <kbd>Mouse Wheel</kbd>
              <span>Zoom In/Out</span>
            </div>
          </div>
          <p class="note camera-note">Resize the browser or detach the canvas whenever you want—the resize-aware pipeline recalculates the cockpit camera, viewport and HUD/reticle alignment in the next frame so nothing stretches.</p>
          <p class="note camera-note">Los modos externos 0 y 7 ahora incorporan un <em>intent offset</em>: cuando mantienes <kbd>W/S/A/D/Q/E</kbd> la cámara se desplaza o banca ligeramente en esa dirección, y al acelerar/frenar con <kbd>+</kbd>/<kbd>-</kbd> sólo cambia la distancia hacia la nave sin girar el ángulo. Todo vuelve suave a su ancla al soltar las teclas. El HUD interno (modo 8) y la cámara 9 permanecen sin cambios.</p>

          <div class="control-group">
            <h3>Interface</h3>
            <div class="control-item">
              <kbd>G</kbd>
              <span>Open Grimoire</span>
            </div>
            <div class="control-item">
              <kbd>I</kbd>
              <span>Toggle Inventory Panel</span>
            </div>
            <div class="control-item">
              <kbd>Tab</kbd>
              <span>Toggle Solar System Panel</span>
            </div>
            <div class="control-item">
              <kbd>Esc</kbd>
              <span>Pause Menu</span>
            </div>
          </div>
        </div>
        <p class="note interface-note">Map, Grimoire and Inventory toggles now comparten un cooldown común de 500&nbsp;ms para evitar dobles aperturas accidentales. Puedes cerrar y reabrir cualquiera casi al instante, pero el motor ignora inputs repetidos dentro de esa ventana para que el focus del cursor no se rompa.</p>
      </section>

      <section class="hud-marquee">
        <h2>🖥️ HUD Marquee Link</h2>
        <p>The marquee is now fully event-driven. It only scrolls curated alerts (respawn, threats, rituals, portals) and stays visually mounted even when idle—an empty text line simply means there are no pending events.</p>
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
          <div class="marquee-card boot-sequence">
            <h3>Boot Sequence Alerts</h3>
            <ol>
              <li>Explosion detectada.</li>
              <li>Integridad comprometida.</li>
              <li>Piloto dañado.</li>
              <li>Sugerencia: contactar nave nodriza.</li>
            </ol>
            <p class="note">Se emiten automáticamente al iniciar sesión o tras reconstruir el HUD para dejar claro el estado de emergencia inicial.</p>
          </div>
        </div>
        <p class="note marquee-note">Queue is throttled, deduped per event type and capped to keep the scroll readable. Expect a ~1.2s grace period after respawn before void energy starts draining again.</p>
        <p class="note marquee-note">Cada alerta completa una única vuelta en el panel antes de caducar y el scroll aplica compensación de FPS bajos para que los textos no avancen a golpes incluso cuando el juego corre a 32&nbsp;FPS. El panel se mantiene discreto cuando no hay cola y se ilumina con un halo verde intenso en cuanto vuelve a emitir mensajes.</p>
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
        <p class="note">Current implementation: Single ship model with all components. Code architecture supports component swapping system.</p>
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

    .ship-overview {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
      margin-bottom: 2rem;
    }

    .ship-overview h2 {
      color: #00ff41;
      margin-top: 0;
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

    kbd {
      background: rgba(0, 255, 65, 0.2);
      color: #00ff41;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      border: 1px solid #00ff41;
      font-family: monospace;
      font-size: 0.9rem;
      box-shadow: 0 2px 0 rgba(0, 255, 65, 0.3);
      min-width: 40px;
      text-align: center;
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
