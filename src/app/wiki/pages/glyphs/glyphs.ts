import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

interface Glyph {
  name: string;
  type: string;
  icon: string;
  activation: string;
  effect: string;
  cooldown: string;
  description: string;
}

@Component({
  selector: 'app-glyphs-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-page">
      <header class="page-header">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>✨ Glyphs & Spells</h1>
      </header>

      <section class="intro">
        <p>Ancient mystical glyphs that grant your ship extraordinary abilities. Each glyph is discovered through exploration and unlocked through specific achievements.</p>
      </section>

      <div class="glyphs-grid">
        @for (glyph of glyphs; track glyph.type) {
          <div class="glyph-card">
            <div class="glyph-icon">{{ glyph.icon }}</div>
            <h2>{{ glyph.name }}</h2>
            <div class="glyph-type">{{ glyph.type }}</div>
            
            <div class="glyph-details">
              <div class="detail-section">
                <h3>Activation</h3>
                <p>{{ glyph.activation }}</p>
              </div>
              
              <div class="detail-section">
                <h3>Effect</h3>
                <p>{{ glyph.effect }}</p>
              </div>
              
              <div class="detail-section">
                <h3>Cooldown</h3>
                <p>{{ glyph.cooldown }}</p>
              </div>
              
              <div class="detail-section description">
                <p>{{ glyph.description }}</p>
              </div>
            </div>
          </div>
        }
      </div>

      <section class="grimoire-info">
        <h2>📖 The Grimoire</h2>
        <p>Access your spell book by pressing <kbd>G</kbd> during gameplay. The Grimoire displays:</p>
        <ul>
          <li>All discovered glyphs and their current state</li>
          <li>Locked spells (shown as <span class="locked-indicator">🔒</span>)</li>
          <li>Available spells (shown as <span class="available-indicator">⚡</span>)</li>
          <li>Active spells with remaining duration</li>
          <li>Cooldown timers for recently used spells</li>
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

    .intro p {
      margin: 0;
      line-height: 1.6;
    }

    .glyphs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 2rem;
      margin-bottom: 3rem;
    }

    .glyph-card {
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
      transition: all 0.3s;
      text-align: center;
    }

    .glyph-card:hover {
      border-color: #00ff41;
      box-shadow: 0 0 30px rgba(0, 255, 65, 0.3);
      transform: translateY(-4px);
    }

    .glyph-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      filter: drop-shadow(0 0 10px rgba(0, 255, 65, 0.5));
    }

    .glyph-card h2 {
      color: #00ff41;
      margin: 0 0 0.5rem 0;
      font-size: 1.8rem;
    }

    .glyph-type {
      color: #888;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid rgba(0, 255, 65, 0.2);
    }

    .glyph-details {
      text-align: left;
    }

    .detail-section {
      margin-bottom: 1.5rem;
    }

    .detail-section h3 {
      color: #00ff41;
      font-size: 1rem;
      margin: 0 0 0.5rem 0;
      text-transform: uppercase;
      font-weight: 600;
    }

    .detail-section p {
      color: #ccc;
      margin: 0;
      line-height: 1.6;
    }

    .detail-section.description {
      padding-top: 1rem;
      border-top: 1px solid rgba(0, 255, 65, 0.2);
    }

    .detail-section.description p {
      font-style: italic;
      color: #aaa;
    }

    .grimoire-info {
      background: rgba(0, 255, 65, 0.05);
      padding: 2rem;
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 65, 0.3);
    }

    .grimoire-info h2 {
      color: #00ff41;
      margin-top: 0;
    }

    .grimoire-info ul {
      line-height: 2;
    }

    kbd {
      background: rgba(0, 255, 65, 0.2);
      color: #00ff41;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      border: 1px solid #00ff41;
      font-family: monospace;
      font-size: 1rem;
      box-shadow: 0 2px 0 rgba(0, 255, 65, 0.3);
    }

    .locked-indicator {
      color: #ff4444;
    }

    .available-indicator {
      color: #ffaa00;
    }
  `]
})
export class GlyphsWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }

  glyphs: Glyph[] = [
    {
      name: 'Gate Rite',
      type: 'GATE_RITE',
      icon: '🌀',
      activation: 'Press and hold spell key. Mark first location, navigate to destination, mark second location.',
      effect: 'Creates a bidirectional portal between two points in space. Portal persists until dismissed or maximum portal limit reached.',
      cooldown: '30 seconds',
      description: 'The most versatile glyph. Allows instant travel across vast distances. Maximum 5 active portals. Strategic portal placement is key to efficient exploration.'
    },
    {
      name: 'Void Jump',
      type: 'VOID_JUMP',
      icon: '⚡',
      activation: 'Single press. Instant cast.',
      effect: 'Teleports ship forward 500 units in current facing direction. Passes through all obstacles.',
      cooldown: '15 seconds',
      description: 'Emergency escape or quick repositioning. Excellent for dodging asteroid fields or evading danger. Cannot teleport into solid objects - will stop at safe distance.'
    },
    {
      name: 'Speed Rite',
      type: 'SPEED_RITE',
      icon: '💨',
      activation: 'Toggle on/off.',
      effect: 'Increases ship maximum speed by 50% and acceleration by 30%. Reduces turn rate by 20%.',
      cooldown: '5 seconds after deactivation',
      description: 'High-speed travel across solar systems. Trade maneuverability for velocity. Use in open space, deactivate when precision is needed.'
    },
    {
      name: 'Eternal Rite',
      type: 'ETERNAL_RITE',
      icon: '🛡️',
      activation: 'Toggle on/off.',
      effect: 'Ship becomes invulnerable to all collision damage. Shield visual effect active.',
      cooldown: 'TBD',
      description: 'Complete protection from asteroids and planetary collisions. Energy cost TBD. Essential for navigating dense debris fields or exploring dangerous regions.'
    },
    {
      name: 'Disruption Rite',
      type: 'DISRUPTION_RITE',
      icon: '💥',
      activation: 'Channeled cast. Hold to charge.',
      effect: 'TBD - Planned: Destroys asteroids in area of effect. Damage scales with channel time.',
      cooldown: 'TBD',
      description: 'Offensive glyph for clearing paths through asteroid fields. Implementation in progress. Will create satisfying explosions and debris clouds.'
    }
  ];
}
