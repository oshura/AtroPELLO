import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

@Component({
  selector: 'app-game-rules-wiki',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-header">
        <h1>📜 Game Rules & Mechanics</h1>
      </header>

      <section class="intro">
        <p>Master the fundamental rules and mechanics of AtroPELLO to survive and thrive in the void.</p>
      </section>

      <section class="rule-section">
        <h2>☁️ Cloud Saves · Regla actual</h2>
        <div class="rule-content">
          <p>
            Cada piloto comienza con <strong>un único slot</strong> en la nube. El juego sincroniza tus partidas al iniciar sesión y carga automáticamente la más reciente.
            Si el botón del header dice “Guardar partida” es porque guardará sobre ese slot sin pedir confirmación.
          </p>
          <ul>
            <li><strong>Ver todas las partidas</strong> muestra la lista completa de campañas. Mientras la vista esté abierta no puedes guardar para evitar sobrescribir otra historia.</li>
            <li><strong>Guardar/Load/Delete</strong> sólo se activan cuando eliges un slot (si solo tienes uno, queda marcado por defecto).</li>
            <li>Al desbloquear <em>Memoria Ancestral</em> o módulos como <em>Máquina del Tiempo</em> ganas slots adicionales y el botón “Guardar” abre el selector en vez de sobrescribir.</li>
            <li>La cantidad de slots y tus mejoras quedan ligadas al piloto, así que cada carga respeta el progreso que hayas comprado o ganado.</li>
          </ul>
          <p>
            Si creas varios pilotos con el mismo usuario, el juego siempre mostrará primero la campaña más reciente de tu personaje activo y ocultará las demás
            salvo que pulses “Ver todas las partidas”.
          </p>
          <p>
            Guardar tras un Gate Rite, un Sigillum móvil o cualquier salto remoto captura el sistema exacto, el portal y los portales abiertos. Al cargar vuelves a esa
            instantánea en lugar del ancla humano por defecto, aunque el Sigillum original apuntara a otro lugar.
          </p>
        </div>
      </section>

      <section class="rule-section">
        <h2>🛬 Aterrizaje manual y pilotos HUD</h2>
        <div class="rule-content">
          <p>
            El HUD muestra dos pilotos junto al marquee: <strong>Landing</strong> (verde) cuando cumples las condiciones y <strong>Threat</strong> (rojo) cuando algo pone en peligro la maniobra.
          </p>

          <h3>Checklist para aterrizar</h3>
          <ol>
            <li><strong>Velocidad:</strong> reduce por debajo de 5&nbsp;u/s usando el freno (<kbd>S</kbd>) o pulsos cortos inversos.</li>
            <li><strong>Alineación:</strong> coloca la nave casi paralela a la superficie (±60°). Evita picar directo al suelo.</li>
            <li><strong>Distancia:</strong> acércate hasta quedar a 50&nbsp;u o menos sin chocar con la esfera del planeta.</li>
            <li><strong>Estabilidad:</strong> mantenlo todo estable durante unos 3&nbsp;s. Si fallas algún punto, el piloto verde se apaga y debes reiniciar el proceso.</li>
          </ol>

          <div class="warning">
            <strong>Consejo:</strong> ajusta primero la velocidad, después la orientación y por último la distancia. Es la forma más rápida de encender el piloto verde.
          </div>

          <h3>Iniciar la secuencia</h3>
          <ul>
            <li>Con verde encendido y <strong>Threat</strong> apagado, pulsa <kbd>Enter</kbd> para que la nave complete automáticamente el touchdown.</li>
            <li>Durante la animación se bloquean los controles y recibes un breve flare de protección contra daño.</li>
            <li>Al tocar suelo se abre el panel de aterrizaje con acciones de descanso, exploración o despegue.</li>
          </ul>

          <h3>Piloto rojo “Threat”</h3>
          <p>Se activa si un enemigo, meteorito o anomalía entra a 500&nbsp;u o menos. Mientras esté encendido no podrás iniciar el aterrizaje.</p>
          <h4>Cómo despejar la amenaza</h4>
          <ul>
            <li>Destruye o empuja al enemigo usando tus glifos o maniobras evasivas.</li>
            <li>En lugar de combatir, traza una órbita amplia hasta que todos los hostiles queden fuera del radio.</li>
          </ul>
        </div>
      </section>

      <section class="rule-section">
        <h2>💥 Collision Mechanics</h2>
        <div class="rule-content">
          <h3>Asteroid Collisions</h3>
          <ul>
            <li><strong>Asteroides pequeños:</strong> Rebotan según el ángulo del impacto y la velocidad relativa, así que un toque suave apenas te moverá y un choque frontal te lanzará en otra dirección.</li>
            <li><strong>Intercambio de velocidad:</strong> Ambos objetos cambian su trayectoria tras la colisión; puedes usarlo para empujar rocas fuera del camino.</li>
            <li><strong>Trails fragmentados:</strong> Al golpear una roca perteneciente a un cluster, esa pieza se independiza y empieza a vagar sola.</li>
            <li><strong>Daño:</strong> 10&nbsp;HP por asteroide pequeño, 75&nbsp;HP por uno “super” y 150&nbsp;HP por un “mega”.</li>
          </ul>

          <h3>Planet Collisions</h3>
          <ul>
            <li><strong>Choque fatal:</strong> Impactar un planeta inflige 100.000 de daño (tu nave sólo tiene 1000&nbsp;HP).</li>
            <li><strong>Rozes:</strong> Si apenas rozas la superficie, la nave se desliza alrededor del planeta conservando su impulso lateral.</li>
            <li><strong>Sin atajos:</strong> Un golpe a alta velocidad nunca cuenta como aterrizaje; siempre es destrucción.</li>
          </ul>

          <h3>Sun Collision</h3>
          <ul>
            <li><strong>Peligro extremo:</strong> Contacto directo = 100.000 de daño instantáneo.</li>
            <li><strong>Radiación:</strong> El calor empieza a morder tus escudos mucho antes de tocar la superficie.</li>
            <li><strong>Distancia segura:</strong> Mantente al menos a 3000&nbsp;u para no entrar en la zona de quemado.</li>
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
            <li><strong>Zoom:</strong> Mouse wheel to zoom in/out</li>
            <li><strong>Auto-follow:</strong> Camera automatically tracks ship in follow mode</li>
            <li><strong>Resize-aware:</strong> Resizing the canvas or browser instantly recalculates aspect ratio and reticle alignment—no reloads or manual tweaks required.</li>
          </ul>

          <h3>Interface</h3>
          <ul>
            <li><strong>Grimoire:</strong> G to open spell book</li>
            <li><strong>Solar System Map:</strong> Tab to view all planets and asteroids</li>
            <li><strong>Audio:</strong> Click anywhere to unlock audio on first load</li>
            <li><strong>Full Screen Toggle:</strong> un botón verde fosforescente con icono <code>[ ]</code> aparece en la esquina inferior derecha cuando estás autenticado. Pulsa para ocultar header/footer y maximizar el canvas; el icono cambia a <code>▣</code> para regresar.</li>
            <li><strong>Flight Vector Reticle:</strong> una cruz discreta se dibuja ahora directamente sobre la pantalla (fuera del HUD) marcando el punto de fuga real de la nave. Cambia de posición al girar, escala con la velocidad, se oculta al abrir paneles diegéticos y, en el futuro, pasará a modo punto de mira cuando se activen armas.</li>
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

      <section class="rule-section">
        <h2>🌀 Respawn & Sigillum</h2>
        <div class="rule-content">
          <p>Cuando mueres, el juego recompone el sistema y coloca la nave en uno de estos dos contextos:</p>
          <ul>
            <li><strong>Sin Sigillum:</strong> reapareces en el ancla humano “Trail Entry”, lejos del sol y con todos los instrumentos recomenzados.</li>
            <li><strong>Con Sigillum:</strong> vuelves exactamente al punto que sellaste, con planeta, órbita y portales tal y como estaban cuando grabaste el símbolo.</li>
          </ul>

          <h3>Qué conserva un Sigillum</h3>
          <ul>
            <li>Portales y sellos: cada vez que abres o cierras uno, el estado queda ligado al sistema y se mantiene entre muertes o viajes.</li>
            <li>Planetas alterados: si destruyes un mundo, limpias un bioma o divides a la Tierra, la escena se conserva cuando regreses.</li>
            <li>Lesser beings: su posición, objetivo y memoria se guardan, así que un perseguidor reaparece exactamente donde lo dejaste.</li>
            <li>Deidad regente: cada sistema mantiene al mismo Elder God, por lo que las incursiones y cielos siguen siendo coherentes sesión tras sesión.</li>
            <li>Grimorio y paneles: la disposición de glifos y el estado de los paneles se restauran al cargar o tras un respawn.</li>
          </ul>

          <h3>Portales y transiciones</h3>
          <ul>
            <li>Al cruzar un portal o ejecutar Gate Rite, el juego guarda una instantánea del sistema origen antes de saltar, evitando portales fantasma o duplicados.</li>
            <li>Las dos bocas de cada portal permanecen enlazadas incluso después de morir o atravesar otro sistema.</li>
            <li>El consumo de Energía del Vacío se pausa durante la animación de portal y se reactiva al aparecer frente al destino.</li>
            <li>Los labels de sistema se reciclan en orden, así que nunca quedarás atrapado con capturas antiguas o inconsistentes.</li>
          </ul>

          <h3>Lesser beings y deidades</h3>
          <ul>
            <li>Cada sistema tiene un patrono concreto (Cthulhu, Azathoth, etc.) que define qué seres pueden invadirlo.</li>
            <li>Cuando ejecutas Void Jump, el juego decide de antemano si habrá incursión y qué criatura aparecerá según el patrono vigente.</li>
            <li>Las Semillas y Vampiros comparan constantemente la distancia a tu nave con la de los planetas cercanos: si estás más cerca, la persecución es obligatoria.</li>
          </ul>

        </div>
      </section>

      <section class="rule-section tbd-section">
        <h2>🔮 Future Mechanics (TBD)</h2>
        <div class="rule-content">
          <ul>
            <li><strong>Resource Gathering:</strong> Mining asteroids for upgrades</li>
            <li><strong>Ship Upgrades:</strong> Better thrusters, stronger hull, more spell slots</li>
            <li><strong>Combat System:</strong> Weapons, targeting, enemy ships</li>
            <li><strong>Missions:</strong> Objectives, rewards, progression system</li>
            <li><strong>Multiplayer:</strong> Co-op exploration, competitive races</li>
            <li><strong>Permadeath:</strong> Get old and die forever and ever. But there are ways to last longer...</li>
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
