import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

@Component({
  selector: 'app-game-rules-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-page">
      <header class="page-header">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>📜 Game Rules & Mechanics</h1>
      </header>

      <section class="intro">
        <p>Master the fundamental rules and mechanics of AtroPELLO to survive and thrive in the void.</p>
      </section>

      <section class="rule-section">
        <h2>🛬 Landing on Planets</h2>
        <div class="rule-content">
          <h3>Requirements</h3>
          <ul>
            <li><strong>Speed:</strong> Approach speed must be less than 2 units/frame</li>
            <li><strong>Angle:</strong> Approach perpendicular to surface (within 30° tolerance)</li>
            <li><strong>Distance:</strong> Must enter planet's landing zone (bounding sphere + 50 units)</li>
          </ul>

          <h3>Procedure</h3>
          <ol>
            <li>Approach the planet slowly using controlled bursts of thrust</li>
            <li>Align your ship perpendicular to the planet's surface</li>
            <li>Reduce speed to near zero as you enter the landing zone</li>
            <li>Game will auto-dock when conditions are met</li>
          </ol>

          <div class="warning">
            <strong>⚠️ Warning:</strong> High-speed impacts cause catastrophic damage. Approaching too fast will destroy your ship.
          </div>

          <p class="tbd"><strong>TBD:</strong> Landing UI with visual indicators, surface exploration mode, departing from planets</p>
        </div>
      </section>

      <section class="rule-section">
        <h2>💥 Collision Mechanics</h2>
        <div class="rule-content">
          <h3>Asteroid Collisions</h3>
          <ul>
            <li><strong>Small Asteroids:</strong> Full 3D physics. Asteroids bounce realistically based on impact angle and relative velocities</li>
            <li><strong>Momentum Conservation:</strong> Both ship and asteroid velocities change according to physics</li>
            <li><strong>Cluster Ejection:</strong> Hitting cluster asteroid ejects it, making it independent</li>
            <li><strong>Damage:</strong> 10 HP per small asteroid, 75 HP for super, 150 HP for mega</li>
          </ul>

          <h3>Planet Collisions</h3>
          <ul>
            <li><strong>Instant Catastrophe:</strong> 100,000 damage (ship has 1000 HP)</li>
            <li><strong>Ship Slides:</strong> If contact occurs, ship is pushed tangentially around planet</li>
            <li><strong>No Landing:</strong> High-speed contact is not landing - it's death</li>
          </ul>

          <h3>Sun Collision</h3>
          <ul>
            <li><strong>Extreme Danger:</strong> 100,000 damage on contact</li>
            <li><strong>Heat Damage:</strong> Proximity damage TBD</li>
            <li><strong>Minimum Distance:</strong> Stay at least 3000 units away</li>
          </ul>
        </div>
      </section>

      <section class="rule-section">
        <h2>✨ Spell Casting</h2>
        <div class="rule-content">
          <h3>Spell System</h3>
          <ul>
            <li><strong>Access Grimoire:</strong> Press <kbd>G</kbd> to view available spells</li>
            <li><strong>Spell States:</strong> Locked 🔒, Available ⚡, Active ⏱️, Cooldown ⏳</li>
            <li><strong>Keybindings:</strong> Each spell assigned to number keys (1-5)</li>
            <li><strong>Visual Feedback:</strong> Active spells show duration timer</li>
          </ul>

          <h3>Spell Rules</h3>
          <ul>
            <li><strong>One Active Toggle:</strong> Only one toggle spell (Speed/Eternal) active at a time</li>
            <li><strong>Cooldowns:</strong> Cannot recast until cooldown expires</li>
            <li><strong>Portal Limit:</strong> Maximum 5 Gate Rite portals simultaneously</li>
            <li><strong>No Stacking:</strong> Cannot cast same spell multiple times for cumulative effect</li>
          </ul>

          <p class="tbd"><strong>TBD:</strong> Spell resource system (mana/energy), spell combinations, upgraded spell variants</p>
        </div>
      </section>

      <section class="rule-section">
        <h2>🎮 Navigation & Controls</h2>
        <div class="rule-content">
          <h3>Movement</h3>
          <ul>
            <li><strong>Thrust:</strong> Hold W or ↑ to accelerate forward</li>
            <li><strong>Brake:</strong> Hold S or ↓ to decelerate</li>
            <li><strong>Turn:</strong> A/D or ←/→ to rotate</li>
            <li><strong>Inertia:</strong> Ship maintains velocity when not thrusting</li>
          </ul>

          <h3>Camera</h3>
          <ul>
            <li><strong>Toggle Mode:</strong> Press C to switch between follow and free camera</li>
            <li><strong>Zoom:</strong> Mouse wheel to zoom in/out</li>
            <li><strong>Auto-follow:</strong> Camera automatically tracks ship in follow mode</li>
          </ul>

          <h3>Interface</h3>
          <ul>
            <li><strong>Grimoire:</strong> G to open spell book</li>
            <li><strong>Solar System Map:</strong> Tab to view all planets and asteroids</li>
            <li><strong>Pause:</strong> Esc to pause and access settings</li>
            <li><strong>Audio:</strong> Click anywhere to unlock audio on first load</li>
          </ul>
        </div>
      </section>

      <section class="rule-section">
        <h2>💀 Survival Tips</h2>
        <div class="rule-content">
          <ul>
            <li><strong>Watch Your Speed:</strong> High velocity = high damage on collision</li>
            <li><strong>Plan Ahead:</strong> Use Gate Rite portals for quick escapes</li>
            <li><strong>Asteroid Fields:</strong> Navigate perpendicular to cluster drift direction</li>
            <li><strong>Planet Flybys:</strong> Approach tangentially, not head-on</li>
            <li><strong>Emergency Void Jump:</strong> Keep cooldown ready for danger</li>
            <li><strong>Sun Avoidance:</strong> Always know where it is</li>
            <li><strong>Speed Rite Trade-off:</strong> Speed kills - literally if you hit something</li>
            <li><strong>Eternal Rite Usage:</strong> Save for dense debris fields</li>
          </ul>
        </div>
      </section>

      <section class="rule-section tbd-section">
        <h2>🔮 Future Mechanics (TBD)</h2>
        <div class="rule-content">
          <ul>
            <li><strong>Health Regeneration:</strong> Passive healing over time or at stations</li>
            <li><strong>Resource Gathering:</strong> Mining asteroids for upgrades</li>
            <li><strong>Ship Upgrades:</strong> Better thrusters, stronger hull, more spell slots</li>
            <li><strong>Combat System:</strong> Weapons, targeting, enemy ships</li>
            <li><strong>Missions:</strong> Objectives, rewards, progression system</li>
            <li><strong>Multiplayer:</strong> Co-op exploration, competitive races</li>
            <li><strong>Permadeath Mode:</strong> Hardcore difficulty with no respawn</li>
            <li><strong>Save System:</strong> Save/load game state</li>
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

    .rule-section {
      margin: 2rem 0;
      background: rgba(0, 255, 65, 0.03);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 2rem;
    }

    .rule-section h2 {
      color: #00ff41;
      margin: 0 0 1.5rem 0;
      font-size: 1.8rem;
    }

    .rule-content h3 {
      color: #00ff41;
      margin: 1.5rem 0 1rem 0;
      font-size: 1.3rem;
    }

    .rule-content ul,
    .rule-content ol {
      line-height: 2;
      padding-left: 2rem;
      margin: 1rem 0;
    }

    .rule-content li {
      margin: 0.5rem 0;
    }

    .warning {
      background: rgba(255, 68, 68, 0.1);
      border-left: 4px solid #ff4444;
      padding: 1rem;
      margin: 1.5rem 0;
      border-radius: 4px;
      color: #ffcccc;
    }

    .tbd {
      margin-top: 1.5rem;
      padding: 1rem;
      background: rgba(255, 170, 0, 0.1);
      border-left: 3px solid #ffaa00;
      border-radius: 4px;
      color: #ffaa00;
      font-style: italic;
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
    }

    .tbd-section {
      border-color: rgba(255, 170, 0, 0.3);
      background: rgba(255, 170, 0, 0.03);
    }

    .tbd-section h2 {
      color: #ffaa00;
    }
  `]
})
export class GameRulesWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
