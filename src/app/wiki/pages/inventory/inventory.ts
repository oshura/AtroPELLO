import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

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
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-header">
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
          El bloque izquierdo muestra barras de salud, memoria y experiencia junto a la cuadrícula de cordura. Todo se actualiza
          en tiempo real cuando completas eventos, aterrizas o sufres daño, así que siempre ves el estado auténtico del piloto.
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
          Cada acción relevante otorga o resta experiencia según esta tabla. Cuando llenas la barra, subes de nivel y el contador
          vuelve a cero con un tope mayor.
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
          <li>El traje determina cuántos accesorios puedes llevar a la vista (hasta 3). El panel solo deja huecos para los slots realmente disponibles.</li>
          <li>Los accesorios extra quedan almacenados fuera de la vista hasta que mejores el traje o expulses algo.</li>
          <li>El botón “Expulsar carga/equipo” solo actúa sobre lo que tengas seleccionado en la bodega o en el equipo personal; nunca desmonta módulos de la nave.</li>
          <li>Los objetos expulsados desaparecen de inmediato y liberan capacidad, así que confirma que no necesitas ese recurso antes de pulsar.</li>
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
              <li>Las selecciones se mantienen aunque la lista cambie, por lo que puedes revisar varias columnas sin perder el foco.</li>
              <li>El pie indica qué elemento está activo y solo habilita la expulsión cuando de verdad es posible.</li>
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

    .page-header {
      margin-bottom: 2rem;
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
      summary: 'Columna izquierda del panel',
      bullets: [
        'Muestra nombre, nivel y barras de Salud, Memoria y Experiencia (esta última como valor actual / cap).',
        'Incluye la cuadrícula de cordura: casillas activas, reservadas por glifos y bloqueadas por falta de tope.',
        'Lista el equipo personal (traje, botas y accesorios) con scroll independiente y resaltado de selección.'
      ]
    },
    {
      title: 'Módulos de nave',
      summary: 'Columna central con tarjetas por slot',
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
        'El botón “Expulsar carga/equipo” solo se ilumina cuando la selección es válida.',
        'El panel mantiene la misma selección aunque cambies de columna para que puedas revisar los datos con calma.'
      ]
    }
  ];

  stats: InventoryStat[] = [
    {
      name: 'Salud',
      scope: '0 — 100',
      summary: 'Integridad física del piloto cuando el daño traspasa los escudos de la nave.',
      gains: ['Descansos en planetas o eventos de historia que curan.', 'Respawns completos o checkpoints especiales.'],
      losses: ['Colisiones fuertes, impactos solares y estados alterados.', 'Eventos narrativos que apliquen heridas.']
    },
    {
      name: 'Memoria',
      scope: '0 — 100',
      summary: 'Grado de lucidez y conocimiento recordado por el piloto. No se regenera sola.',
      gains: ['Misiones de historia, descubrimientos y escenas clave.', 'Consumibles o mejoras específicas que restauren recuerdos.'],
      losses: ['Ciertos eventos de historia que fuerzan sacrificios.', 'Reinicios manuales del perfil.']
    },
    {
      name: 'Experiencia',
      scope: 'Nivel + XP actual',
      summary: 'Sube al realizar acciones heroicas. Al llenar la barra aumentas de nivel.',
      gains: ['Eventos descritos en la tabla (combate, hallazgos, diplomacia).', 'Recompensas especiales de misiones secundarias.'],
      losses: ['Muerte del piloto (pierdes parte del progreso).', 'Fallar ciertos eventos críticos.']
    },
    {
      name: 'Cordura',
      scope: 'Base 99 · tope dinámico',
      summary: 'Casillas disponibles para los glifos. Cada hechizo aprendido bloquea parte del máximo y cada lanzamiento consume cordura temporal.',
      gains: ['Descansos seguros, aterrizajes exitosos o rituales de recuperación.', 'Olvidar un glifo libera sus casillas reservadas.'],
      losses: ['Aprender glifos aumenta el coste permanente.', 'Castear hechizos consume cordura temporal hasta que se estabiliza.']
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
