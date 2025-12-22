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
            <p><strong>Audio:</strong> El modo espacial conserva el loop clásico <code>sfx_thruster</code> (grave y mecánico) mientras que, al entrar en atmósfera, la lógica de <code>GameEngine.requestThrusterClip()</code> cambia al loop <em>Airthrust.wav</em> registrado como <code>sfx_thruster_atmo</code>. Ambos se modulan con el mismo throttle y se reconstruyen sin pops cuando desbloqueas el audio, así el swap ocurre en caliente justo al cruzar el límite del bioma.</p>
            <p class="tbd">Future: Different thruster types with efficiency/power trade-offs (TBD)</p>
          </div>
        </div>

        <div class="component-card">
          <h3>🧰 Bahía auxiliar</h3>
          <div class="component-details">
            <p><strong>Modelo:</strong> Bahía Auxiliar Mk. I</p>
            <p><strong>Descripción:</strong> Montura científica con dos sockets activos que exponen habilidades instantáneas mapeadas a la fila numérica.</p>
            <p><strong>Slots actuales:</strong></p>
            <ul>
              <li><strong>1 — Escáner Auxiliar de Habitantes:</strong> revela civilizaciones y seres menores de planetas a &lt;500u y sincroniza la intel con el HUD.</li>
              <li><strong>2 — Estabilizador Vectorial Atmosférico:</strong> cancela el auto-vector y amortigua turbulencias durante 6&nbsp;s, reduciendo drift/jitter al 20% y mostrando la alerta de autopilot suprimido.</li>
            </ul>
            <p><strong>Operativa:</strong></p>
            <ul>
              <li>Ambos sockets comparten la misma carcasa y HUD, pero mantienen cooldowns y telemetría independientes; el panel de Atmosphere muestra en vivo qué slot está activo y recalcula la escala de estabilidad.</li>
              <li>El estabilizador fuerza un estado de control manual: deshabilita temporalmente el auto-vector, bloquea la inyección de lift y clava los mensajes <em>ATMOSPHERE AUTO-VECTOR SUPPRESSED</em> en la marquesina para que sepas que vuelves a pilotar a pulso.</li>
              <li>Mientras dura la ventana de 6&nbsp;s, todas las sacudidas (drift lateral, turbulencia progresiva, jitter de cabina y carcasa) se atenúan al 20% para que puedas realinear la nariz o aterrizar; al expirar, el auto-vector retoma el control con una rampa suave.</li>
            </ul>
            <p><strong>Limitaciones:</strong> Cooldown independiente por módulo (8&nbsp;s para el escáner, 16&nbsp;s para el estabilizador). Los slots adicionales futuros reutilizarán las teclas 3/4 cuando la bahía se expanda.</p>
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

          <p class="note thrust-note">
            Mantener <kbd>+</kbd> presionado durante un segundo aumenta la <em>target speed</em> en ~2&nbsp;u/s hasta alcanzar el <em>max speed</em> de la nave. En atmósfera el motor simula rozamiento: la velocidad objetivo va decayendo poco a poco aunque sueltes el freno y, si la tormenta eleva la turbulencia, la tecla <kbd>+</kbd> empuja con menos fuerza (hasta un 35&nbsp;% menos) para obligarte a compensar a mano.
          </p>

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

          <div class="control-group">
            <h3>Bahía auxiliar</h3>
            <div class="control-item">
              <kbd>1</kbd>
              <span>Escáner Auxiliar de Habitantes (slot 1)</span>
            </div>
            <div class="control-item">
              <kbd>2</kbd>
              <span>Estabilizador Vectorial Atmosférico (slot 2)</span>
            </div>
            <p class="note">Los sockets comparten interfaz pero mantienen cooldowns independientes; si cambias los bindings en Opciones → Controles, el HUD actualiza las etiquetas al instante.</p>
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
        <p class="note marquee-note">El HUD guarda una pila con las últimas 10 alertas emitidas. Pulsa <kbd>Backspace</kbd> para recuperar la más reciente: se repite una sola vuelta, vuelve a entrar en la pila y deja paso al siguiente mensaje pendiente.</p>
      </section>

      <section class="hud-atmosphere">
        <h2>🌀 Horizonte artificial atmosférico</h2>
        <p>Cuando activas el modo atmosférico la brújula se convierte en un horizonte artificial completo. Divide el disco en cielo y suelo, proyecta las líneas de pitch y roll y añade un altímetro digital que mide la altura real sobre la superficie del planeta activo.</p>
        <ul>
          <li><strong>Normal planetaria precisa:</strong> <code>calculateAtmosphereAttitude()</code> toma la normal exacta (centro → nave) y la cruza con los ejes forward/right/up sanitizados, así la línea del horizonte responde al planeta activo y no al frame de referencia de la cámara.</li>
          <li><strong>Pitch y roll desacoplados:</strong> El pitch se limita a ±90° proyectando el vector forward sobre el plano tangencial, mientras que el roll proviene de <code>atan2</code>(right·normal, up·normal), por lo que un cabeceo brusco no arrastra al bank.</li>
          <li><strong>Filtro adaptativo:</strong> El Compass interpola los valores entrantes (pitch, roll y altitud) antes de dibujar, eliminando vibraciones cuando atraviesas turbulencias o justo al terminar la animación de aterrizaje.</li>
          <li><strong>Altímetro integrado:</strong> El contador verde se alimenta del radio real del planeta y se clampa a cero cuando rozas el suelo. Marca puntos clave para aterrizajes manuales.</li>
          <li><strong>Telemetría centralizada:</strong> La brújula vuelve a enfocarse en el horizonte artificial; toda la visibilidad, turbulencia y deriva migraron al nuevo <em>Atmosphere Telemetry Panel</em> que ocupa el antiguo TargetPanel cuando estás dentro de un bioma con atmósfera.</li>
          <li><strong>Vector + stability en HUD:</strong> El panel dedicado muestra la magnitud y rumbo del drift, el lift que inyecta el auto-vector y la etiqueta de estabilidad (<em>calm/stable/unstable</em>), así puedes tomar decisiones sin abrir el overlay de debug.</li>
        </ul>
        <p class="note hud-atmo-note">Cobertura de pruebas: el utilitario matemático verifica nivelado, nariz arriba/abajo, roll ±90° e inversión completa. El propio componente Compass confirma que el modo atmosférico sincroniza pitch/roll/altitud.</p>
      </section>

      <section class="hud-telemetry">
        <h2>📡 Atmosphere Telemetry Panel</h2>
        <p>El bloque central del HUD se reasigna automáticamente al entrar en un bioma atmosférico. El nuevo panel sustituye al TargetPanel hasta que salgas al espacio y concentra toda la telemetría de planeta + clima en un solo vistazo.</p>
        <ul>
          <li><strong>Datos del planeta activo:</strong> Usa el <code>LandingApproachContext</code> para mostrar nombre, tipo, probabilidad de vida, intel de habitantes/ser menor y si ya visitaste ese mundo. Las barras de altitud y distancia toman el radio del planeta para que la escala nunca cambie.</li>
          <li><strong>Clima vivo:</strong> El lado derecho escucha al <code>AtmosphereWeatherService</code>: evento en curso, intensidad, precipitación, probabilidad de rayos, capa activa y ETA con contador en segundos. Cada meteorología añade su propio tinte al panel y ahora se remaquetó con padding interno para que los datos se mantengan dentro de cada tarjeta.</li>
          <li><strong>Drift vector desglosado:</strong> Magnitud, heading y pitch del drift se derivan del snapshot de telemetría; los medidores horizontales/verticales se actualizan por frame y el panel resalta los avisos cuando cruzas umbrales de turbulencia o visibilidad crítica.</li>
          <li><strong>Escala de turbulencias:</strong> El panel imprime la severidad (CALM/LIGHT/MODERATE/SEVERE) directamente debajo de la estabilidad y sincroniza los badges rosas cuando cruzas 0.4 y 0.75 de intensidad, dejando claro cuándo arrancarán las sacudidas de cámara.</li>
          <li><strong>Warnings contextualizados:</strong> Inestabilidad, lift degradado, visibilidad &lt;35&nbsp;% o descargas frecuentes entran como <em>badges</em> rosas en la columna izquierda, sincronizados con el auto-vector para que sepas cuándo prepararte para un touchdown forzado.</li>
          <li><strong>Compatibilidad total:</strong> Al salir de la atmósfera el TargetPanel recupera el espacio automáticamente y el sistema de targeting sigue recibiendo actualizaciones en segundo plano, así no pierdes tu selección al volver al vacío.</li>
          <li><strong>HUD libre de filtros:</strong> Los tintes meteorológicos se aplican en la capa previa al HUD, de modo que la telemetría mantiene la misma paleta aun cuando llueven meteoros o el polvo tiñe toda la escena.</li>
        </ul>
        <p class="note hud-telemetry-note">QA puede capturar la telemetría en vídeo o texto: el panel se alimenta directamente del payload que también se loguea cada 10&nbsp;s en <code>LogCategory.GAME_LOOP</code>, por lo que cualquier discrepancia se puede correlacionar usando el timestamp renderizado.</p>
      </section>

      <section class="atmo-layers">
        <h2>🪨 Estratos y detalle de superficie</h2>
        <ul>
          <li><strong>Cuatro zonas cromáticas:</strong> Cada planeta mezcla valle, planicie, media montaña y picos, con tonos propios (Mercurio ahora usa óxidos rojizos). El relieve de la esfera decide qué zona domina y las transiciones se suavizan para evitar escalones.</li>
          <li><strong>Micro relieve dinámico:</strong> Al bajar de 600&nbsp;u el terreno añade extrusión extra (hasta 8&nbsp;% sobre el relief base) y ruido de color sincronizado, lo que proporciona grietas y cantos afilados cuando vuelas rasante.</li>
          <li><strong>Niebla azul sobre el suelo:</strong> Por debajo de 300&nbsp;u el domo del cielo interpola hacia un azul muy claro usando una curva cúbica continua (sin cuantización), simulando dispersión de luz en la baja atmósfera sin perder el tono base del planeta.</li>
        </ul>
        <p class="note atmo-layers-note">El detalle adicional solo se activa cuando la cámara está cerca del suelo, así la escena mantiene el rendimiento original mientras orbitas a gran altura.</p>
      </section>

      <section class="atmo-weather">
        <h2>🌫️ Clima volumétrico</h2>
        <ul>
          <li><strong>Capas temporales:</strong> <code>AtmosphereWeatherService</code> ahora genera eventos por estratos (superficie, baja, media y exósfera) con ventanas de ~2&nbsp;min, estados de calma reales y pesos distintos. Las tormentas de polvo quedaron bloqueadas a la superficie/baja, la lluvia y las tormentas eléctricas sólo arman eventos en capas baja y media, y las lluvias de meteoritos viven exclusivamente en la capa superior. La niebla (ligera/densa) se reparte entre capas alta, media y baja para conservar visibilidad coherente con el estrato. El snapshot expone <em>layerId</em>, etiqueta y el rango de altitud activo, así HUD y sistemas de juego saben qué tramo estás atravesando y cuándo tocarán truenos o fog.</li>
          <li><strong>Niebla estratificada:</strong> <code>AtmosphereSceneManager</code> dibuja un domo volumétrico que aumenta densidad conforme bajas de 900&nbsp;u y se refuerza según el evento del <code>AtmosphereWeatherService</code>. El color interpola entre el suelo del planeta y el tinte del clima (polvo, tormenta eléctrica o lluvia de meteoros).</li>
          <li><strong>Nubes en capas:</strong> Dos shells adicionales orbitan el planeta: la capa baja se pega a 400&nbsp;u y se desplaza con ruido senoidal, mientras que la capa alta vive cerca del sky dome con velocidades más lentas. Cada una usa un shader procedural independiente, así el horizonte mantiene parallax aunque el planeta sea pequeño.</li>
          <li><strong>Iluminación reactiva:</strong> El render atmosférico ajusta la luz ambiental entre 0.55 y 1.05&nbsp;x según la visibilidad del evento. Tormentas y densas neblinas atenúan el terreno, mientras que las lluvias de meteoros elevan la luz para resaltar los destellos.</li>
          <li><strong>Toggles QA:</strong> Desde la consola puedes llamar a <code>Debug.Atmosphere.setFogEnabled(false)</code> o <code>Debug.Atmosphere.setCloudsEnabled(false)</code> para aislar capas durante capturas y mediciones de rendimiento.</li>
          <li><strong>Loops y truenos dedicados:</strong> <code>GameEngine.updateAtmosphereAudio()</code> ahora ruta cada evento al bus <em>weather</em>, reproduce el loop correspondiente (lluvia, polvo, tormenta) y lanza relámpagos probabilísticos usando <code>lightningChance</code>, todo con ducking automático para no sobrecargar el resto de la mezcla.</li>
          <li><strong>Filtros y descargas sincronizadas:</strong> Cada evento meteorológico aplica su propio tinte sobre la cúpula (polvo ámbar, lluvia azulada, niebla gris, meteoros violáceos) y, cuando cae un rayo, la cámara recibe un flash blanco y un impulso extra de jitter. Los rayos nacen siguiendo la línea de visión real, ahora dibujan núcleo + halo con dos quads aditivos y conservan segmentos suficientes (≥7) para verse nítidos entre cielo y suelo.</li>
          <li><strong>Precipitación dirigida:</strong> El snapshot atmosférico alimenta <code>ParticleEffectsService.updateWeatherPrecipitation()</code>, que ahora recicla "seeds" ancladas a la nave y convierte cada gota/grano/braza en una estela tipo Void Jump. Las lluvias cruzan la marquesina como filamentos azulados, las tormentas de polvo dibujan trazos ámbar gruesos y las lluvias de meteoros dejan incandescentes detrás de la carlinga aunque vueles despacio. Todo sigue al jugador mezclando el forward de la nave con el drift del clima, y al salir de la atmósfera el servicio se limpia solo.</li>
          <li><strong>Capa de partículas en primer plano:</strong> El render reorganizado pinta la lluvia/polvo/meteoritos después de la escena atmosférica, así los trazos siempre cortan delante de la cabina en lugar de quedar tapados por el suelo o las nubes. Incluso tras un respawn forzado, el motor desmonta el clima activo y vacía las partículas antes de volver al espacio.</li>
          <li><strong>Fuerzas y sacudidas reforzadas:</strong> <code>applyAtmosphereWeatherForces()</code> escala el drift según altitud y turbulencia; a partir de 0.4 la tormenta añade bonus laterales visibles y, cuando supera 0.75, <code>applyAtmosphereCameraJitter()</code> lleva el jitter hasta 0.75&nbsp;u mientras empuja la cámara siguiendo el mismo vector de deriva.</li>
          <li><strong>Turbulencia física en la nave:</strong> <code>applyAtmosphereShipJitter()</code> escucha el mismo payload y, cuando la intensidad supera 0.35, proyecta ruido senoidal sobre los ejes right/up/forward de la nave. Las fuerzas se inyectan directo en <code>Spaceship.externalForces</code>, se escalan con la altitud y acumulan sacudidas laterales+lift visibles si no corriges.</li>
          <li><strong>Deriva progresiva acumulada:</strong> <code>applyAtmosphereProgressiveDrift()</code> empieza a sesgar el rumbo cuando <code>turbulenceCurrent</code> ≥ 0.45: calcula un vector lateral+lift, lo normaliza y aumenta su peso exponencialmente hasta que la tormenta cede. Si dejas de corregir, la nave termina siguiendo el drift del clima incluso aunque la cámara vuelva a la normalidad.</li>
        </ul>
        <p class="note atmo-weather-note">Los shaders de clima comparten el mismo <code>WeatherLayerProgram</code>, así que las pruebas de QA pueden capturar estados deterministas alimentando la misma semilla de clima y registrando el timestamp usado en <code>timeMs</code>.</p>
      </section>

      <section class="atmo-impulse">
        <h2>⏩ Empuje automático tras aterrizar</h2>
        <p>Al terminar el fade-out de <code>LandingSequence</code> y entrar en la escena atmosférica, la nave recibe un empuje inicial controlado antes de que recuperes el mando completo.</p>
        <ul>
          <li><strong>Hook dedicado:</strong> <code>GameEngine.applyAtmosphereLandingImpulse()</code> corre justo después de <code>enterAtmosphereScene()</code> y solo cuando hay touchdown válido.</li>
          <li><strong>Cinemática rasante:</strong> La nueva <code>LandingSequenceAnimation</code> reubica la nave a ~40u del punto de contacto, se posa durante 5&nbsp;s «de cara» a una cámara manual anclada casi a ras del suelo y dispara polvo + <code>sfx_autoland_touchdown</code> mediante <code>GameEngine.playLandingCinematicTouchdownFx()</code> cuando el timeline llega al 96&nbsp;%.</li>
          <li><strong>Velocidad de entrada máxima:</strong> <code>captureShipKineticsSnapshot()</code> sigue guardando la orientación y el vector de velocidad, pero al entrar <code>enforceAtmosphereMaxEntrySpeed()</code> pisa <code>currentSpeed</code>/<code>targetSpeed</code> con el <code>maxSpeed</code> de la nave (10&nbsp;u por defecto), alinea el <em>forward</em> y pone el thruster en <em>ACCELERATING</em>, así el modo atmosférico arranca inmediatamente a tope.</li>
          <li><strong>HUD sin sobresaltos:</strong> El thruster pasa a <em>ACCELERATING</em> y el HUD fuerza <code>stallWarning = false</code>, así no aparece la alarma roja justo después de aterrizar.</li>
          <li><strong>Fade-in suave:</strong> La escena atmosférica se abre con un overlay negro de 1.9&nbsp;s que se desvanece mediante <code>ScreenOverlayRenderer</code> mientras <code>sfx_passby_air</code> ya está sonando, ocultando el corte entre el fade-out de la animación y el render WebGL.</li>
          <li><strong>Silencio intencional:</strong> El <em>MusicDirector</em> memoriza la pista previa y obliga la escena <code>silence</code> durante todo el descenso; el panel de aterrizaje detecta la bandera y no reproduce <code>music_landing</code> hasta que abandones la atmósfera.</li>
          <li><strong>Touchdown físico:</strong> El motor calcula la distancia al centro del planeta y, cuando el casco intersecta la esfera de suelo (radio configurable), vuelve a invocar <code>handleLandingTouchdown()</code> para abrir el panel real de aterrizaje sin recrear la escena atmosférica.</li>
          <li><strong>Audio enfocado:</strong> Cuando el panel de landing se abre justo después de la cinemática, el motor corta los loops de clima, mantiene el silencio musical y deja solo <code>sfx_passby_air</code> a la mitad de volumen (<code>applyLandingPanelAudioFocus()</code>). El loop se apaga al cerrar el panel o al iniciar <code>startTakeoffSequence()</code>.</li>
          <li><strong>Despegue automático:</strong> Después de tocar tierra puedes ascender manualmente; al cruzar los 1000&nbsp;u sobre la superficie el juego arma <code>maybeTriggerAtmosphereAutoTakeoff()</code>, dispara la misma <em>TakeoffSequence</em> del sistema solar y te devuelve al renderer espacial sin atajos raros.</li>
          <li><strong>Auto-landing suave:</strong> Si entras en contacto con el suelo a <em>&lt; 1&nbsp;u</em> en el eje de gravedad, el motor marca <code>landingContext.autoLand</code>, reaprovecha el mismo flujo de touchdown y bloquea la cámara en modo manual “locked to ground” mientras sigue a la nave hasta que la velocidad lateral cae &lt; 0.4&nbsp;u. El bloqueo lanza un estallido corto de polvo (mismo pipeline de <code>ParticleEffectsService</code>) y dispara el swell <code>Landing.wav</code> (<code>sfx_autoland_touchdown</code>) sincronizado con la cámara, así el aterrizaje físico luce y suena igual que la secuencia cinematográfica aunque hayas frenado manualmente.</li>
          <li><strong>Vector anti-stall:</strong> Mientras la escena atmosférica esté activa, <code>GameEngine.applyAtmosphereAutoVector()</code> calcula el peso efectivo de la nave (masa + gravedad local) y suma el empuje opuesto dentro de <code>Spaceship.externalForces</code>; si desciendes por debajo de 30&nbsp;u reduce el empuje para permitir el touchdown y, si tu velocidad cae por debajo de 0.5&nbsp;u/s, el empuje se clampa al 15&nbsp;% (~0.18&nbsp;u/s). Solo cuando superas 2.6&nbsp;u/s vuelve al 100&nbsp;% (~1.2&nbsp;u/s), así la gravedad vuelve a ganar si te quedas flotando.</li>
          <li><strong>Piloto verde intacto:</strong> En modo atmósfera la lógica de <em>landing ready</em> reutiliza los mismos márgenes del espacio (≤50&nbsp;u de la superficie, ≤5&nbsp;u/s y ±60°). Solo cuando mantienes la nave estable durante 3&nbsp;s el indicador verde vuelve a encenderse y, dentro de la escena atmosférica, pulsar <kbd>Enter</kbd> dispara el auto-landing asistido (cámara bloqueada + polvo + <code>Landing.wav</code>) en vez de abrir el panel al instante. Fuera de atmósfera el atajo vuelve al flujo espacial tradicional.</li>
          <li><strong>Toma el control enseguida:</strong> Puedes seguir acelerando con <span class="key-cluster"><kbd>+</kbd><span class="key-sep">/</span><kbd>=</kbd></span> o frenar con <span class="key-cluster"><kbd>-</kbd><span class="key-sep">/</span><kbd>_</kbd></span>; el impulso solo abre la ventana inicial para maniobrar.</li>
        </ul>
        <p class="note atmo-impulse-note">QA: con el HUD de depuración puedes observar que <code>currentSpeed</code> nunca cae por debajo de 0.8u durante los primeros segundos, por lo que el loop de <code>sfx_stall</code> no se activa tras el aterrizaje.</p>
      </section>

      <section class="atmo-ground-impact">
        <h2>🪂 Impactos contra el suelo atmosférico</h2>
        <ul>
          <li><strong>Rebote físico inmediato:</strong> Si golpeas el terreno sin cumplir las condiciones de auto-landing, <code>GameEngine.handleAtmosphereGroundImpact()</code> recoloca la nave justo encima de la superficie y refleja la velocidad vertical con un coeficiente de restitución de 0.28. El componente lateral se amortigua al 65&nbsp;% para que el rebote siga la pendiente en vez de rebotar como una pelota.</li>
          <li><strong>Curva de daño escalonada:</strong> El impacto mide la velocidad vertical en el momento del golpe. Por debajo de 1&nbsp;u/s no hay daño, a partir de ahí la curva escala linealmente hasta 100&nbsp;u a 10&nbsp;u/s. Todo entra por la misma ruta de <code>applyShipDamage()</code>, así que los buff como el <em>Void Cocoon</em> pueden anularlo y la marquesina reporta «Impacto atmosférico» con la vida restante.</li>
          <li><strong>Auto-landing sigue intacto:</strong> Mientras el componente vertical sea ≤1&nbsp;u/s y el estado <em>Landing Ready</em> esté activo, el choque vuelve a invocar el flujo de touchdown completo (cámara manual, polvo sincronizado y swell dedicado). Solo los impactos duros activan este rebote.</li>
          <li><strong>Feedback audiovisual:</strong> Cada choque emite partículas de polvo reutilizando <code>ParticleEffectsService</code> y dispara el <code>sfx_collision_light</code> o <code>sfx_collision_heavy</code> según la velocidad, además de aumentar el vignette rojo para hacer evidente el golpe incluso si no hubo daño (por escudo o impacto menor).</li>
          <li><strong>Ducking según clima:</strong> Los mismos sonidos de impacto se mezclan con el multiplicador de <code>impactVolumeMultiplier</code>, así las tormentas fuertes reducen la pegada audible al 25&nbsp;% y dejan espacio para el loop meteorológico. Cuando el valor cae a 0.35 o menos, el HUD lanza la alerta «Absorción atmosférica» para recordarte que los choques están amortiguados.</li>
        </ul>
        <p class="note atmo-ground-impact-note">QA: la curva de daño queda acotada y reproducible—1u al rozar el suelo y 100u al caer a 10&nbsp;u/s—de modo que las pruebas de balance pueden repetir condiciones sabiendo exactamente qué castigo esperar.</p>
      </section>

      <section class="atmo-flow">
        <h2>🧭 Flujo simplificado en atmósfera</h2>
        <ol>
          <li><strong>Descenso asistido:</strong> Tras el fade-out de <code>LandingSequence</code> aparece un overlay negro de 1.9&nbsp;s mientras <code>sfx_passby_air</code> toma el control y la música queda silenciada; la nave entra en escena con posición alineada a la normal del planeta.</li>
          <li><strong>Vuelo bajo controlado:</strong> El impulso automático conserva la velocidad con la que cruzaste la puerta atmosférica (solo añade ~0.8&nbsp;u si llegas por debajo de ese umbral) y evita el <em>stall</em>; puedes mantenerte entre 20-80&nbsp;u de altura mientras el horizonte artificial reporta pitch/roll/altitud en tiempo real.</li>
          <li><strong>Gravedad modulada por velocidad:</strong> <code>applyAtmosphereGravity()</code> mezcla la altitud con el <code>currentSpeed</code>: en reposo aplica el 100&nbsp;% del tirón (caes a ~10&nbsp;u/s cuando vuelas a 1000&nbsp;u y hasta 30&nbsp;u/s pegado al suelo), a 3&nbsp;u/s baja a ~35&nbsp;% y se diluye por completo al superar las 5&nbsp;u/s. En paralelo, <code>applyAtmosphereAutoVector()</code> sólo entrega el 15&nbsp;% del lift cuando vas a &lt;0.5&nbsp;u/s y escala hasta el 100&nbsp;% a partir de 2.6&nbsp;u/s, de modo que si sueltas el acelerador la suma neta vuelve a apuntar hacia el suelo y la nave cae sin tener que cortar manualmente el auto-vector.</li>
          <li><strong>Rozamiento y aceleración condicionada:</strong> La escena atmosférica aplica un arrastre constante sobre la <em>target speed</em> que depende de la altitud y del estado del estabilizador vectorial. Las turbulencias refuerzan ese rozamiento y reducen la ganancia del thruster hasta un 35&nbsp;% cuando mantienes <kbd>+</kbd>, así que debes rearmar el empuje cada pocos segundos para conservar velocidad.</li>
          <li><strong>Aterrizaje manual:</strong> Si estabilizas la nave (≤50&nbsp;u de la superficie, ≤5&nbsp;u/s y ±60°) durante 3&nbsp;s el piloto verde vuelve a encenderse; en ese estado puedes presionar <kbd>Enter</kbd> para iniciar el auto-landing asistido (cámara, polvo y swell) y, tras el retardo de 2&nbsp;s, el panel se abre con el payload espacial.</li>
          <li><strong>Auto-landing suave:</strong> Cuando el toque con el suelo llega con componente vertical &lt;1&nbsp;u, el motor marca <code>landingContext.autoLand</code>, bloquea la cámara al terreno, lanza polvo y registra el touchdown sin intervención manual.</li>
          <li><strong>Salida por cielo:</strong> Puedes despegar manualmente y, al cruzar los 1000&nbsp;u sobre el suelo, <code>maybeTriggerAtmosphereAutoTakeoff()</code> ejecuta la secuencia completa, restaura música/renderer y deja la nave de vuelta en el sistema solar. También puedes iniciar el despegue desde el panel tradicional.</li>
        </ol>
        <p class="note atmo-flow-note">Toda la telemetría del HUD permanece activa durante el ciclo completo, así que puedes cambiar de cámara, usar el Grimorio o registrar datos de QA sin abandonar la escena.</p>
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

    .atmo-impulse {
      margin-top: 2rem;
      padding: 1.75rem;
      border: 1px solid rgba(0, 255, 65, 0.35);
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(0, 255, 65, 0.08), rgba(0, 50, 30, 0.65));
      box-shadow: inset 0 0 25px rgba(0, 255, 65, 0.05);
    }

    .atmo-impulse h2 {
      color: #00ff41;
      margin-bottom: 1rem;
    }

    .atmo-impulse ul {
      margin: 1rem 0;
      padding-left: 1.25rem;
      line-height: 1.6;
    }

    .atmo-impulse li {
      margin-bottom: 0.5rem;
      color: #e2ffe2;
    }

    .atmo-impulse-note {
      margin-top: 1rem;
      font-size: 0.95rem;
      color: #8ef0b5;
    }

    .atmo-flow {
      margin-top: 2rem;
      padding: 1.75rem;
      border: 1px solid rgba(0, 255, 65, 0.35);
      border-radius: 10px;
      background: linear-gradient(120deg, rgba(0, 20, 15, 0.85), rgba(0, 255, 65, 0.08));
      box-shadow: inset 0 0 25px rgba(0, 255, 65, 0.05);
    }

    .atmo-flow h2 {
      color: #00ff41;
      margin-bottom: 1rem;
    }

    .atmo-flow ol {
      margin: 0;
      padding-left: 1.5rem;
      line-height: 1.7;
      color: #d1ffea;
    }

    .atmo-flow li {
      margin-bottom: 0.75rem;
    }

    .atmo-flow-note {
      margin-top: 1rem;
      color: #8ef0b5;
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

    .hud-atmosphere {
      margin-top: 2rem;
      padding: 1.75rem;
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 65, 0.25);
      background: rgba(0, 255, 65, 0.03);
    }

    .hud-atmosphere h2 {
      color: #00ff41;
      margin-top: 0;
    }

    .hud-atmosphere ul {
      margin: 1rem 0;
      padding-left: 1.5rem;
      line-height: 1.8;
    }

    .hud-atmosphere li {
      margin-bottom: 0.5rem;
      color: #cfe9d7;
    }

    .hud-atmo-note {
      display: block;
      margin-top: 1rem;
    }

    .atmo-layers {
      margin-top: 2rem;
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid rgba(0, 255, 65, 0.25);
      background: rgba(0, 255, 65, 0.03);
    }

    .atmo-layers h2 {
      color: #00ff41;
      margin-top: 0;
    }

    .atmo-layers ul {
      margin: 1rem 0;
      padding-left: 1.5rem;
      line-height: 1.8;
      color: #cfe9d7;
    }

    .atmo-layers-note {
      display: block;
      margin-top: 1rem;
      color: #8ef0b5;
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
