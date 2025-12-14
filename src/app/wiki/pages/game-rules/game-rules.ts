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
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>📜 Game Rules & Mechanics</h1>
      </header>

      <section class="intro">
        <p>Master the fundamental rules and mechanics of AtroPELLO to survive and thrive in the void.</p>
      </section>

      <section class="rule-section">
        <h2>☁️ Cloud Saves · Regla actual</h2>
        <div class="rule-content">
          <p>
            Cada piloto comienza con <strong>un único slot</strong> adjudicado en la nube. El motor sincroniza los slots al arrancar si hay sesión y
            carga automáticamente la partida más reciente de tu piloto. Si el botón del header dice “Guardar partida” significa que guardará
            directamente sobre ese slot. Cuando desbloquees magia <em>Memoria Ancestral</em> o módulos como <em>Máquina del Tiempo</em>, tu
            personaje añadirá más índices a su array de slots y el CTA ya no guardará sin preguntar: abrirá el diálogo en la pestaña “Partidas”.
          </p>
          <ul>
            <li><strong>Ver todas las partidas</strong> muestra el master data completo. Mientras está activo no puedes guardar para evitar sobrescribir otras campañas.</li>
            <li><strong>Guardar/Load/Delete</strong> sólo se habilitan cuando seleccionas un slot (si solo hay uno se selecciona automáticamente).</li>
            <li>El algoritmo <code>CloudSaveSlotFinderService.acquireNewSlot()</code> reserva el siguiente índice libre cuando un piloto gana un slot adicional.</li>
            <li>El array de slots y la capacidad máxima se guardan dentro del <code>SaveGamePayload.metadata</code> para que cada carga respete tus mejoras.</li>
          </ul>
          <p>
            Si inicias una nueva campaña con el mismo usuario, la master data puede contener varios pilotos. El juego siempre cargará la partida más
            reciente de tu piloto activo y ocultará el resto salvo que pulses “Ver todas las partidas”.
          </p>
        </div>
      </section>

      <section class="rule-section">
        <h2>🛬 Aterrizaje manual y pilotos HUD</h2>
        <div class="rule-content">
          <p>
            El HUD muestra dos pilotos junto al marquee: <strong>Landing</strong> (verde) cuando la aproximación cumple todos los
            requisitos y <strong>Threat</strong> (rojo) cuando el motor detecta condiciones peligrosas. Ambos se alimentan de
            <code>GameEngine.updateLandingTelemetry()</code> cada frame.
          </p>

          <h3>Checklist para encender el piloto verde</h3>
          <ol>
            <li><strong>Reduce la velocidad</strong> por debajo de <code>5 u/s</code> usando freno (S) o pulsos cortos inversos.</li>
            <li><strong>Alinea la nave</strong> con la normal del planeta: el producto punto debe ser ≤ <code>0.5</code> (≈ ±60° respecto a la perpendicular).</li>
            <li><strong>Acércate</strong> hasta situarte a ≤ <code>50u</code> de la superficie (distancia centro-radio).</li>
            <li><strong>Mantén los valores estables</strong> durante al menos <code>3000 ms</code> (<code>LANDING_READY_HOLD_MS</code>, 3&nbsp;s), sin oscillaciones.</li>
          </ol>

          <div class="warning">
            <strong>Consejo:</strong> cualquier violación reinicia el temporizador interno y el piloto vuelve a apagarse. Ajusta primero velocidad, luego alineación y, por último, distancia.
          </div>

          <h3>Iniciar la secuencia</h3>
          <ul>
            <li>Con el piloto verde encendido y <strong>Threat</strong> apagado, pulsa <kbd>Enter</kbd> para llamar a <code>startLandingSequence</code>.</li>
            <li>El Animation Manager toma el control, bloquea inputs y aplica un flare automático hasta tocar superficie.</li>
            <li>Tras el touchdown se abre el Landing Panel con opciones de permanecer o despegar; los daños siguen suprimidos hasta completar una orden.</li>
          </ul>

          <h3>Piloto rojo “Threat”</h3>
          <p><code>computeLandingThreat()</code> solo activa la luz si un objetivo hostil (<code>RelationService = enemy</code>) entra en el radio de ≤ <code>500u</code>. El motivo que genera se corresponde con ese game object e incluye la distancia.</p>
          <ul>
            <li><strong>Hostil a ≤ 500u:</strong> cuando aparece, el reason luce como “Garra Umbral a 184u”.</li>
          </ul>
          <p>Mientras el piloto rojo esté activo, <code>tryStartLandingSequence</code> devuelve temprano sin mensajes adicionales: el propio indicador es el bloqueo.</p>
          <h4>Cómo despejar la amenaza</h4>
          <ul>
            <li>Destruye o empuja al enemigo fuera del radio (Void Jump/Speed Rite sirven para abrir hueco).</li>
            <li>Si no quieres combatir, traza una órbita amplia hasta que todos los hostiles queden a &gt;500u.</li>
          </ul>
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
            <li><strong>Resize-aware:</strong> Resizing the canvas or browser instantly recalculates aspect ratio and reticle alignment—no reloads or manual tweaks required.</li>
          </ul>

          <h3>Interface</h3>
          <ul>
            <li><strong>Grimoire:</strong> G to open spell book</li>
            <li><strong>Solar System Map:</strong> Tab to view all planets and asteroids</li>
            <li><strong>Pause:</strong> Esc to pause and access settings</li>
            <li><strong>Audio:</strong> Click anywhere to unlock audio on first load</li>
            <li><strong>Full Screen Toggle:</strong> un botón verde fosforescente con icono <code>[ ]</code> aparece en la esquina inferior derecha cuando estás autenticado. Pulsa para ocultar header/footer y maximizar el canvas; el icono cambia a <code>▣</code> para regresar.</li>
          </ul>
        </div>
      </section>

      <section class="rule-section">
        <h2>⚖️ Compliance & Licenses</h2>
        <div class="rule-content">
          <p>
            El footer del juego ahora incluye el enlace <strong>Third Party Licenses</strong> que abre la página estática
            <code>/third-party-licenses/</code> sin necesidad de autenticación para revisar las licencias vigentes (Angular, Express,
            gl-matrix, RxJS y tslib).
          </p>
          <ul>
            <li>Cada entrada muestra el paquete, el tipo de licencia (MIT, Apache&nbsp;2.0 u 0BSD) y enlaza con el texto completo.</li>
            <li>Los ficheros viven en <code>/third-party-licenses/licenses/</code>, así que puedes guardar las copias en local para auditorías offline.</li>
            <li>El enlace abre en una pestaña externa y no pausa la sesión actual del juego ni cierra la wiki.</li>
          </ul>
          <p class="warning">
            Si la build incorpora nuevas dependencias, este apartado y la página de licencias se actualizan en bloque para reflejar los textos
            obligatorios sin esperar a un parche mayor.
          </p>
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
          <p>
            Cuando mueres, <code>RespawnService</code> prepara un nuevo contexto para el motor. Existen dos rutas:
          </p>
          <ul>
            <li>
              <strong>Sin Respawn Sigillum:</strong> el juego usa el <em>ancla por defecto</em> sembrado al arrancar la partida
              (label «Trail Entry»). Ese anchor se guarda en <code>GameStateStore.defaultRespawnAnchor</code> y siempre apunta al
              inicio del trail terrestre dentro de <code>human-system</code>; ya no existe el respawn improvisado cerca del sol.
            </li>
            <li>
              <strong>Con Sigillum grabado:</strong> se reutiliza tu ancla actual (posición, planeta, snapshot) y
              <code>UniverseStateSnapshotService.ensureSystemState()</code> carga ese sistema antes de llamar a <code>restartWithContext()</code>.
            </li>
          </ul>
          <p>
            Cada sistema queda etiquetado dentro de <code>PortalPersistenceService</code>. Cuando atraviesas un portal,
            el motor refresca el snapshot del sistema origen con ese mismo label antes de aplicar el destino, de modo que
            cualquier planeta destruido, sello de portal o rastro de lesser beings se conserva para el siguiente retorno.
          </p>
          <p>
            Antes de reanudar el loop tras un respawn, <code>resetPanelInteractionState()</code> limpia mapa, grimorio e inventario,
            desbloquea el <em>PanelEventCoordinator</em> y restaura el cursor del canvas. Así ningún Sigillum deja el mouse
            congelado tras una muerte: puedes volver a abrir paneles o atacar inmediatamente sin reiniciar el juego.
          </p>
          <p>
            Desde la build actual, cada muerte dispara el mismo ritual: antes de reconstruir el contexto de respawn,
            <code>GameEngine.persistActiveSystemState('respawn-transition')</code> captura el sistema activo, guarda los lesser
            beings en memoria y sobrescribe su etiqueta. Así, incluso si reapareces en el mismo sistema, verás exactamente el
            estado en el que caíste (portales sellados, planetas demolidos, debris flotando, etc.).
          </p>
          <p>
            Ese refresco sólo ocurre si sigues en el mismo sistema que tu Sigillum. El motor compara el <code>systemId</code> del
            ancla con el snapshot activo antes de clonar nada, de modo que un Gate Rite o una muerte lejana ya no pueden
            sobrescribir la etiqueta <code>respawn-anchor-latest</code>; únicamente cuando estás en casa se vuelca el nuevo portal en
            el sello.
          </p>
          <p>
            Esas capturas incluyen ahora un identificador persistente del sistema y el bloque <code>lesserBeingMemory</code>. Si
            abandonas un sistema con un lesser en pleno salto y vuelves horas después (o tras reiniciar el juego), el snapshot
            rehidrata los datos desde el propio portal, por lo que el intruso sigue acechando en el mismo borde del sistema.
          </p>
          <p>
            También se conserva el dios primigenio que regenta cada sistema: el serializer añade <code>meta.elderGod</code> antes
            de persistirlo y <code>PortalPersistenceService</code> nunca vuelve a sortearlo. Así, cuando reapareces mediante Sigillum,
            Gate Rite o un respawn completo, verás a la misma deidad dominando el cielo en lugar del fallback genérico.
          </p>
          <p>
            Para evitar portales "fantasma" se añadió un índice dentro de <code>PortalPersistenceService</code>: cada vez que se
            guarda un sistema, se sobreescribe cualquier snapshot previo con el mismo <em>persistentSystemId</em> y se reasigna cada
            <code>portalId</code> al label más reciente. Ya no existen versiones antiguas de un mismo sistema; al cruzar un portal o
            reaparecer tras una muerte siempre recuperas la última captura válida, con los dos extremos del portal enlazados.
          </p>
          <p>
            Durante un Void Jump ya no se improvisa el invasor: el motor planifica el encuentro antes de mostrar la animación,
            fija la especie que va a manifestarse y la secuencia visual interroga a <code>GameEngine.getCurrentSystemElderGod()</code>
            para mostrar siempre a la misma deidad que gobierna ese sistema. Si la tirada descarta la irrupción, la animación
            conserva el mismo icono y el salto no reintentará la invocación al aterrizar.
          </p>
          <p>
            Ese plan respeta ahora la jerarquía de patronazgo: cada pool descarta automáticamente a las especies cuyo
            <em>LESSER_BEING_PATRON</em> no coincide con el dios que rige el sistema. Así, un dominio de Cthulhu sólo puede
            proponer Semillas Estelares y Azathoth monopoliza los Shoggoths; si algún pool queda vacío, el motor cae al
            conjunto genérico y deja un warning para depurar la configuración.
          </p>
          <p>
            Las Semillas y los Vampiros invocados desde portales comparan constantemente la distancia a la nave con la distancia a
            la superficie del planeta libre más cercano; si la nave gana aunque sea por unos metros, la persecución es obligatoria
            y sólo se desvían a colonizar cuando existe un planeta desocupado mucho más cercano.
          </p>
          <p>
            Además, <code>handlePortalTraversal()</code> pausa el consumo de energía del vacío y reinicia el muestreo justo después de
            colocarte frente al portal de destino. Así evitas perder 100u de void energy por recorrer medio sistema en un único frame.
          </p>
          <p>
            Gate Rite ejecuta la misma captura justo antes de saltar: la animación llama a <code>persistActiveSystemState('gate-rite-transition')</code>
            antes de aplicar el snapshot remoto, de modo que el sistema humano conserva el portal arcano recién abierto aunque mueras lejos de él.
          </p>
          <p>
            Los respawns siempre reutilizan un label existente: <code>human-default-system</code> se sobreescribe automáticamente
            cuando abandonas el trail humano sin Sigillum, y <code>respawn-anchor-latest</code> ahora se reescribe (solo cuando
            existe un Sigillum activo) cada vez que <code>GameEngine.persistActiveSystemState()</code> captura el sistema (muerte,
            Gate Rite o cruce de portal). Antes de reaparecer, el motor rehidrata esa etiqueta desde
            <code>PortalPersistenceService</code> incluso si ya estabas en el mismo sistema, así tu Sigillum conserva portales,
            debris y lesser beings recientes sin volver a grabarlo mientras el fallback humano permanece intacto.
          </p>
          <p class="warning">
            Recordatorio: los sellos se limpian cuando inicias un «Full Respawn», así que vuelve a grabar uno si quieres reaparecer en un planeta concreto.
          </p>
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
