import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';

interface PanelSection {
  title: string;
  summary: string;
  bullets: string[];
}

interface InventoryStat {
  name: string;
  scope: string;
  summary: string;
  gains: string[];
  losses: string[];
}

interface ExperienceEventRow {
  label: string;
  delta: string;
  notes: string;
}

@Component({
  selector: 'app-inventory-wiki',
  imports: [CommonModule, RouterModule],
  template: `
    <a routerLink="/" class="arcade-back">
      <span>BACK TO GAME &gt;&gt;</span>
    </a>
    <div class="wiki-page">
      <header class="page-header">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <h1>📦 Panel de Inventario</h1>
        <p class="lead">
          Referencia rápida para entender qué muestra cada columna del inventario (tecla <kbd>I</kbd>), cómo se calculan las
          estadísticas del piloto y qué acciones están disponibles mientras el panel está abierto.
        </p>
      </header>

      <section class="layout">
        <h2>🗂️ Distribución del panel</h2>
        <div class="cards-grid">
          @for (section of panelSections; track section.title) {
            <article class="card">
              <h3>{{ section.title }}</h3>
              <p class="card-summary">{{ section.summary }}</p>
              <ul>
                @for (bullet of section.bullets; track bullet) {
                  <li>{{ bullet }}</li>
                }
              </ul>
            </article>
          }
        </div>
      </section>

      <section class="stats">
        <h2>🧬 Ficha del piloto</h2>
        <p>
          El bloque izquierdo renderiza barras condensadas para salud, memoria y experiencia, además de la cuadrícula de cordura.
          Los valores provienen directamente de <code>GameStateStore.characterProfile</code> y se actualizan cada vez que un
          servicio invoca <code>CharacterProfileService.adjustVitals()</code> o <code>adjustExperience()</code>.
        </p>
        <div class="stats-grid">
          @for (stat of stats; track stat.name) {
            <article class="stat-card">
              <header>
                <h3>{{ stat.name }}</h3>
                <span class="stat-scope">{{ stat.scope }}</span>
              </header>
              <p class="stat-summary">{{ stat.summary }}</p>
              <div class="stat-columns">
                <div>
                  <h4>Cómo sube</h4>
                  <ul>
                    @for (gain of stat.gains; track gain) {
                      <li>{{ gain }}</li>
                    }
                  </ul>
                </div>
                <div>
                  <h4>Cómo baja</h4>
                  <ul>
                    @for (loss of stat.losses; track loss) {
                      <li>{{ loss }}</li>
                    }
                  </ul>
                </div>
              </div>
            </article>
          }
        </div>
      </section>

      <section class="xp-table">
        <h2>⭐ Eventos de experiencia</h2>
        <p>
          <code>CharacterProfileService.registerExperienceEvent()</code> usa esta tabla (valores definidos en
          <code>EXPERIENCE_EVENT_VALUES</code>). Al alcanzar <code>experienceMax</code> el nivel sube y el contador se reinicia con el
          nuevo tope.
        </p>
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Delta</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            @for (row of experienceEvents; track row.label) {
              <tr>
                <td>{{ row.label }}</td>
                <td>{{ row.delta }}</td>
                <td>{{ row.notes }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="personal-gear">
        <h2>🧥 Equipo personal y slots</h2>
        <ul>
          <li>El traje determina cuántos accesorios simultáneos puedes mostrar (hasta 3). El panel solo renderiza tantos slots vacíos como permita <code>accessorySlots</code>.</li>
          <li>Los accesorios más allá de ese límite quedan ocultos hasta que instales un traje mejor o expulses equipo.</li>
          <li>El botón “Expulsar carga/equipo” del pie funciona con selecciones de carga o de equipo personal; nunca desmonta módulos de nave.</li>
          <li>Al expulsar carga se llama a <code>Spaceship.removeCargo()</code> y <code>CargoHoldService.removeCargoEntry()</code>; al expulsar equipo personal se elimina la entrada del <code>GameStateStore</code>.</li>
        </ul>
      </section>

      <section class="flow">
        <h2>⌨️ Atajos y flujo de uso</h2>
        <div class="cards-grid">
          <article class="card">
            <h3>Apertura y cierre</h3>
            <ul>
              <li><kbd>I</kbd> abre/cierra el panel. Si el grimorio o el mapa están abiertos primero se cierran ellos.</li>
              <li><kbd>Esc</kbd> cierra cualquier panel abierto y limpia la selección.</li>
              <li>El puntero del ratón pasa a modo inventario (glow azul) mientras el panel está visible.</li>
            </ul>
          </article>
          <article class="card">
            <h3>Interacción</h3>
            <ul>
              <li>La rueda del ratón desplaza la columna donde se encuentre el cursor (izquierda = equipo personal, centro = módulos, derecha = carga).</li>
              <li>Cada tarjeta/filas registra un <code>InventoryPanelRegion</code>, así que las selecciones son persistentes incluso si la lista cambia.</li>
              <li>El pie indica qué elemento está activo y habilita la expulsión solo cuando la selección lo permite.</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-height: 100%;
      background: #05060d;
    }

    .wiki-page {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem 3rem;
      color: #e5edff;
    }

    .arcade-back {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 9998;
      background: linear-gradient(135deg, #000000 0%, #001b40 50%, #000000 100%);
      border: 3px solid #3b82f6;
      padding: 12px 24px;
      font-family: 'Impact', 'Arial Black', sans-serif;
      font-size: 16px;
      font-weight: 900;
      color: #7dd3fc;
      text-shadow:
        0 0 5px #7dd3fc,
        0 0 15px #38bdf8;
      box-shadow:
        0 0 15px rgba(59, 130, 246, 0.8),
        inset 0 0 15px rgba(15, 118, 255, 0.3);
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
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.9; }
      50% { opacity: 1; }
    }

    .page-header {
      margin-bottom: 2rem;
    }

    .back-link {
      color: #7dd3fc;
      text-decoration: none;
      display: inline-block;
      margin-bottom: 1rem;
    }

    .page-header h1 {
      margin: 0;
      font-size: 2.8rem;
    }

    .lead {
      color: #a5b4fc;
      max-width: 900px;
      line-height: 1.6;
    }

    .layout, .stats, .xp-table, .personal-gear, .flow {
      margin-bottom: 3rem;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 12px;
      padding: 2rem;
    }

    h2 {
      color: #7dd3fc;
      margin-top: 0;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.5rem;
    }

    .card {
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(125, 211, 252, 0.2);
      border-radius: 10px;
      padding: 1.25rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    }

    .card-summary {
      color: #9fb5ff;
      margin-top: 0.25rem;
    }

    .card ul {
      margin: 0;
      padding-left: 1.1rem;
      color: #d7e0ff;
      line-height: 1.6;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.5rem;
    }

    .stat-card {
      background: rgba(6, 11, 25, 0.95);
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 12px;
      padding: 1.25rem;
    }

    .stat-card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      padding-bottom: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .stat-scope {
      font-size: 0.85rem;
      color: #c4b5fd;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .stat-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }

    .stat-columns h4 {
      margin-bottom: 0.5rem;
      color: #a5b4fc;
    }

    .stat-columns ul {
      margin: 0;
      padding-left: 1.1rem;
      color: #cdd5ff;
      line-height: 1.5;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }

    th, td {
      padding: 0.75rem 0.5rem;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      text-align: left;
    }

    th {
      color: #7dd3fc;
      text-transform: uppercase;
      font-size: 0.85rem;
      letter-spacing: 1px;
    }

    kbd {
      background: rgba(125, 211, 252, 0.1);
      border: 1px solid rgba(125, 211, 252, 0.4);
      border-radius: 4px;
      padding: 0 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      color: #7dd3fc;
    }

    code {
      background: rgba(15, 23, 42, 0.7);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
      font-size: 0.95rem;
      color: #f9a8d4;
    }

    .personal-gear ul {
      margin: 0;
      padding-left: 1.2rem;
      line-height: 1.8;
      color: #e2e8f0;
    }
  `]
})
export class InventoryWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  panelSections: PanelSection[] = [
    {
      title: 'Perfil del piloto',
      summary: 'Columna izquierda (35% del ancho)',
      bullets: [
        'Muestra nombre, nivel y barras de Salud, Memoria y Experiencia (esta última como valor actual / cap).',
        'Incluye la cuadrícula de cordura: casillas activas, reservadas por glifos y bloqueadas por falta de tope.',
        'Lista el equipo personal (traje, botas y accesorios) con scroll independiente y resaltado de selección.'
      ]
    },
    {
      title: 'Módulos de nave',
      summary: 'Columna central (40%) con tarjetas por slot',
      bullets: [
        'Orden fijo: Cabina, Reactor, Alas, Fuselaje, Escudo, Bahía de drones y Bahía auxiliar.',
        'Cada tarjeta combina la descripción del manifiesto con datos dinámicos (por ejemplo, empuje/top speed del Reactor).',
        'Los slots no disponibles muestran “N/A” para dejar claro que ese fuselaje no soporta el módulo.'
      ]
    },
    {
      title: 'Carga y bodega',
      summary: 'Columna derecha (manifiesto + gauge)',
      bullets: [
        'Medidor horizontal con `current / max` unidades y color rojo a partir de 90% de ocupación.',
        'Filas de manifiesto con etiqueta, tipo (Materia prima, Artefacto, etc.) y unidades alineadas a la derecha.',
        'Scroll independiente para listas largas; cada fila queda seleccionable para expulsar o consultar.'
      ]
    },
    {
      title: 'Pie y acciones',
      summary: 'Resumen contextual + botón Expulsar',
      bullets: [
        'Describe la selección actual (slot · etiqueta) para evitar equivocaciones.',
        'Botón “Expulsar carga/equipo” habilitado solo cuando la selección es de carga o equipo personal.',
        'El botón registra un `InventoryPanelRegion` de tipo acción, así que respeta la misma lógica de selección.'
      ]
    }
  ];

  stats: InventoryStat[] = [
    {
      name: 'Salud',
      scope: '0 — 100',
      summary: 'Integridad física del piloto. Refleja impactos recibidos más allá de los escudos de la nave.',
      gains: ['Eventos de descanso o scripts que llamen a `adjustVitals({ health: +x })`.', 'Reiniciar partida o checkpoints de misión.'],
      losses: ['Colisiones y daño ambiental cuando el motor replica el impacto sobre el perfil del piloto.', 'Scripts narrativos que inyecten deltas negativos.']
    },
    {
      name: 'Memoria',
      scope: '0 — 100',
      summary: 'Progreso narrativo desbloqueado. No se regenera automáticamente porque representa conocimiento.',
      gains: ['Descubrimientos clave y escenas que disparan `adjustVitals({ memory: +x })`.', 'Cheats o herramientas de depuración que modifiquen el perfil.'],
      losses: ['Solo scripts dedicados podrían restarla (la campaña actual no incluye decrementos).', 'Reinicios manuales del perfil mediante herramientas internas.']
    },
    {
      name: 'Experiencia',
      scope: 'Nivel + XP actual',
      summary: 'Se alimenta con `adjustExperience(delta)` y sube de nivel al alcanzar `experienceMax`.',
      gains: ['Eventos registrados en `registerExperienceEvent` (ver tabla).', 'Ajustes directos con `awardExperience` o herramientas de QA.'],
      losses: ['Evento `PLAYER_DEATH` (−50 XP).', 'Deltas negativos explícitos enviados por scripts o depuración.']
    },
    {
      name: 'Cordura',
      scope: 'Base 99 · tope dinámico',
      summary: 'Casillas disponibles para lanzar glifos. Cada hechizo aprendido reserva parte del máximo y cada lanzamiento consume cordura temporal.',
      gains: ['`adjustVitals({ sanity: +x })` tras descansos, aterrizajes seguros u otros eventos.', 'Olvidar glifos libera casillas reservadas y restituye el tope efectivo.'],
      losses: ['Aprender glifos añade reservas permanentes igual a `SpellSanityCost.max`.', 'Castear glifos resta `SpellSanityCost.temp` mediante `applySpellSanityCost`.']
    }
  ];

  experienceEvents: ExperienceEventRow[] = [
    { label: 'Enemy ship destroyed', delta: '+25', notes: 'Combate espacial estándar.' },
    { label: 'Primigenio derrotado en planeta', delta: '+50', notes: 'Encuentros de alto riesgo ligados a bosses.' },
    { label: 'Planet landing', delta: '+3', notes: 'Cada aterrizaje registrado suma progreso incremental.' },
    { label: 'New species discovered', delta: '+100', notes: 'Escaneo Augurio/Revelación exitoso sobre una especie inédita.' },
    { label: 'Spell cast', delta: '+1', notes: 'Castear cualquier glifo concede XP simbólica.' },
    { label: 'Portal spell', delta: '+5', notes: 'Gate Rite completado o salto especial.' },
    { label: 'Player death', delta: '−50', notes: 'Se resta del contador actual pero nunca baja el nivel obtenido.' }
  ];

  ngOnInit() {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
