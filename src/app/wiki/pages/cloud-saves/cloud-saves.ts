import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

interface RequirementBlock {
  title: string;
  bullets: string[];
}

interface PanelActionCard {
  title: string;
  summary: string;
  bullets: string[];
}

interface TechnicalBlock {
  title: string;
  summary: string;
  links: string[];
}

@Component({
  selector: 'app-cloud-saves-wiki',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-hero">
        <a routerLink="/wiki" class="back-link">← Back to Wiki</a>
        <p class="eyebrow">Infraestructura compartida</p>
        <h1>☁️ Cloud Saves & Auth Bridge</h1>
        <p class="lead">
          TO³ ahora reutiliza el stack de autenticación Cognito de la landing: el botón “Iniciar Sesión” redirige primero a
          <code>https://www.atropello-games.es/auth/launch</code>, la landing gestiona Cognito y luego devuelve al juego. El tab “Partidas”
          dentro del diálogo de Opciones queda disponible tras completar ese flujo y permite probar la API REST de guardados.
          para probar la API REST de guardados. Esta entrada resume el flujo para QA y explica la arquitectura que lo hace posible.
        </p>
      </header>

      <section class="requirements">
        <div class="section-heading">
          <h2>🔑 Requisitos previos</h2>
          <p>Sin sesión, el tab “Partidas” no aparece.</p>
        </div>
        <div class="card-grid">
          @for (req of requirements; track req.title) {
            <article class="card">
              <h3>{{ req.title }}</h3>
              <ul>
                @for (bullet of req.bullets; track bullet) {
                  <li>{{ bullet }}</li>
                }
              </ul>
            </article>
          }
        </div>
      </section>

      <section class="panel-actions">
        <div class="section-heading">
          <h2>🎛️ Acciones del tab “Partidas”</h2>
          <p>Los botones corresponden directamente a métodos de <code>CloudSavesService</code>.</p>
        </div>
        <div class="action-grid">
          @for (action of panelActions; track action.title) {
            <article class="action-card">
              <header>
                <h3>{{ action.title }}</h3>
                <p>{{ action.summary }}</p>
              </header>
              <ul>
                @for (bullet of action.bullets; track bullet) {
                  <li>{{ bullet }}</li>
                }
              </ul>
            </article>
          }
        </div>
        <p class="tip">⚠️ Todas las peticiones viajan firmadas con el ID Token actual. Si el token expira, el tab mostrará el error y pedirá volver a iniciar sesión.</p>
      </section>

      <section class="technical">
        <div class="section-heading">
          <h2>🛠️ Integración técnica</h2>
          <p>La misma cookie compartida alimenta al juego, al iframe y al SDK.</p>
        </div>
        <div class="technical-grid">
          @for (block of technicalBlocks; track block.title) {
            <article class="tech-card">
              <h3>{{ block.title }}</h3>
              <p>{{ block.summary }}</p>
              <ul>
                @for (link of block.links; track link) {
                  <li>{{ link }}</li>
                }
              </ul>
            </article>
          }
        </div>
      </section>

      <section class="troubleshooting">
        <h2>🧪 Checklist de QA</h2>
        <ol>
          <li>Inicia sesión desde el header (se abrirá la landing, completará Cognito y te regresará) y confirma que el badge muestra tu alias.</li>
          <li>Abre Opciones → tab <strong>Partidas</strong> y pulsa <strong>Sync slots</strong>; deberían aparecer los slots creados desde la landing.</li>
          <li>Usa <strong>Save demo slot</strong> para crear <code>slot 0</code> y verifica desde la landing que aparece como "Demo save".</li>
          <li>Ejecuta <strong>Load latest</strong> y revisa el JSON de la consola inferior del panel.</li>
          <li>Elimina el slot con <strong>Delete slot</strong> y confirma que el listado se actualiza sin errores.</li>
        </ol>
        <p class="note">Si algo falla, revisa el texto rojo al pie del tab: expone el último mensaje de error emitido por el SDK.</p>
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      min-height: 100%;
      background: radial-gradient(circle at top, #071229 0%, #050611 50%, #02030a 100%);
      color: #eaf4ff;
    }

    .wiki-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2.5rem 3rem 4rem;
    }

    .back-link {
      color: #64ffd3;
      text-decoration: none;
      font-weight: 600;
    }

    .page-hero {
      margin-bottom: 2.5rem;
    }

    .eyebrow {
      letter-spacing: 0.4rem;
      text-transform: uppercase;
      font-size: 0.75rem;
      color: rgba(100, 255, 211, 0.7);
      margin: 0.5rem 0;
    }

    h1 {
      font-size: clamp(2.4rem, 4vw, 3.4rem);
      margin: 0.25rem 0 0.75rem;
      color: #64ffd3;
    }

    .lead {
      font-size: 1.1rem;
      line-height: 1.7;
      color: rgba(229, 244, 255, 0.9);
      max-width: 960px;
    }

    section {
      margin-bottom: 3rem;
      background: rgba(4, 9, 22, 0.75);
      border: 1px solid rgba(100, 255, 211, 0.2);
      border-radius: 18px;
      padding: 2rem;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    }

    .section-heading h2 {
      margin: 0;
      color: #89ffe0;
    }

    .section-heading p {
      margin: 0.35rem 0 1.5rem;
      color: rgba(226, 246, 255, 0.75);
    }

    .card-grid,
    .action-grid,
    .technical-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.5rem;
    }

    .card,
    .action-card,
    .tech-card {
      background: rgba(3, 13, 28, 0.85);
      border: 1px solid rgba(100, 255, 211, 0.25);
      border-radius: 16px;
      padding: 1.25rem 1.5rem;
    }

    .card h3,
    .action-card h3,
    .tech-card h3 {
      margin-top: 0;
      color: #64ffd3;
    }

    ul {
      margin: 0;
      padding-left: 1.2rem;
      line-height: 1.6;
    }

    .action-card header p {
      margin: 0.25rem 0 0.75rem;
      color: rgba(229, 244, 255, 0.75);
    }

    .tip {
      margin-top: 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 12px;
      background: rgba(255, 153, 0, 0.08);
      border: 1px solid rgba(255, 153, 0, 0.4);
      color: #ffd9a3;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      color: #a0ffe1;
      background: rgba(0, 0, 0, 0.35);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }

    .troubleshooting ol {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.8;
      counter-reset: qa;
    }

    .troubleshooting li {
      margin-bottom: 0.75rem;
    }

    .note {
      margin-top: 1.25rem;
      color: rgba(255, 123, 123, 0.9);
    }

    @media (max-width: 768px) {
      .wiki-page {
        padding: 2rem 1.5rem 3rem;
      }
    }
  `]
})
export class CloudSavesWikiComponent implements OnInit {
  private readonly wikiNav = inject(WikiNavigationService);
  private readonly router = inject(Router);

  requirements: RequirementBlock[] = [
    {
      title: 'Cuenta AtroPELLO',
      bullets: [
        'Comparte credenciales con la landing. Si puedes iniciar sesión allí, puedes hacerlo aquí.',
        'El header muestra el botón “Iniciar Sesión”; tras volver del Hosted UI se mostrará tu alias o nickname.'
      ]
    },
    {
      title: 'Cookies y dominio',
      bullets: [
        'La cookie `atropello-session` se escribe en `.atropello-games.es` para que el iframe bridge pueda leerla.',
        'Desactiva extensiones que bloqueen cookies con `SameSite=None` durante las pruebas.'
      ]
    },
    {
      title: 'Autorización para la API',
      bullets: [
        'El ID Token de Cognito firma cada llamada `GET/PUT/DELETE` al endpoint `https://api.atropello-games.es/cloud-saves`.',
        'Si el token expira, vuelve a pulsar “Iniciar Sesión” antes de interactuar con los botones.'
      ]
    }
  ];

  panelActions: PanelActionCard[] = [
    {
      title: 'Sync slots',
      summary: 'Refresca la lista de slots disponibles (ordenados por fecha).',
      bullets: [
        'Invoca `CloudSavesService.syncSlots()` y, en caso de éxito, rellena la tabla del panel.',
        'Se recomienda ejecutar este paso inmediatamente después de iniciar sesión para cargar el maestro.'
      ]
    },
    {
      title: 'Load latest',
      summary: 'Descarga el slot más reciente y muestra el JSON raw.',
      bullets: [
        'Equivale a `loadLatest()` que a su vez llama a `syncSlots()` y luego a `getSlot(index)`.',
        'Útil para validar que una partida creada en la landing se pueda consumir desde TO³.'
      ]
    },
    {
      title: 'Save demo slot',
      summary: 'Genera un payload de prueba y lo guarda en el slot 0.',
      bullets: [
        'El payload incluye título, timestamp ISO y stats aleatorios para facilitar la verificación.',
        'Tras guardar se ejecuta automáticamente `syncSlots()` para mostrar el nuevo registro.'
      ]
    },
    {
      title: 'Load slot / Delete',
      summary: 'Botones por fila para cargar o eliminar un índice específico.',
      bullets: [
        'Ambos comandos deshabilitan los controles mientras la petición está en curso (usa `saves.loading()`).',
        'Eliminar un slot limpia el feedback si la tarjeta mostraba ese mismo índice.'
      ]
    }
  ];

  technicalBlocks: TechnicalBlock[] = [
    {
      title: 'AuthService & cookies',
      summary: 'Procesa el callback del Hosted UI, serializa la sesión y expone señales live.',
      links: [
        'Los métodos `loginWithRedirect` y `logoutWithRedirect` se conectan al botón del header.',
        'La señal `displayName()` alimenta tanto el badge del header como el `username` que ve el panel.'
      ]
    },
    {
      title: 'CloudSavesSessionBridgeService',
      summary: 'Traduce la cookie compartida a un token utilizable dentro de TO³.',
      links: [
        'Escucha eventos del iframe `/bridge.html` y expone `getToken()` / `onSessionChange()`.',
        'Responde con identidad básica (`displayName`, `nickname`, `email`) para depurar quién firmó la petición.'
      ]
    },
    {
      title: 'CloudSavesService + Panel',
      summary: 'SDK Angular con señales para slots, carga y errores.',
      links: [
        '`slots()` contiene el listado sincronizado; `error()` expone el último mensaje mostrado al pie del panel.',
        'El componente `app-cloud-saves-panel` se renderiza dentro del tab “Partidas” del diálogo de Opciones.'
      ]
    }
  ];

  ngOnInit(): void {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
