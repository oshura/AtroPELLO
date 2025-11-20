import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

@Component({
  selector: 'app-spaceship-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
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
          </div>

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

          <div class="control-group">
            <h3>Interface</h3>
            <div class="control-item">
              <kbd>G</kbd>
              <span>Open Grimoire</span>
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
