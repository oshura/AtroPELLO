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
        <h1>☁️ Cloud Saves & Cookie Compartida</h1>
        <p class="lead">
          Ahora TO³ depende únicamente del redirect clásico: al pulsar “Iniciar Sesión” se abre
          <code>https://www.atropello-games.es/auth/launch?return=...</code>, la landing escribe la cookie
          <code>atropello-session</code> en <em>.atropello-games.es</em> y, al volver al juego, la UI se hidrata leyendo esa cookie.
          Con sesión activa, el tab “Partidas” y el botón “Guardar partida” del header disparan exactamente el mismo pipeline:
          capturamos el <code>SaveGamePayload</code> real, lo subimos con metadata completa, mostramos feedback en vivo y, si algo falla,
          ambos puntos de entrada reutilizan <code>CloudSavesService.describeError()</code> para comunicar qué ocurrió.
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
        <p class="tip">⚠️ Todas las peticiones viajan firmadas con el ID Token actual. Si el token expira o falla la red, <code>describeError()</code> muestra el mismo mensaje en el panel y en el CTA.</p>
      </section>

      <section class="technical">
        <div class="section-heading">
          <h2>🛠️ Integración técnica</h2>
          <p>El Hosted UI redirige de vuelta con cookie compartida; no hay iframe ni handshake.</p>
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
          <li>Inicia sesión desde el header (se abrirá la landing, completará Cognito y te regresará) y confirma que aparecen el alias y el botón <strong>Guardar partida</strong>.</li>
          <li>Haz clic en <strong>Guardar partida</strong>; espera el feedback verde y revisa en la consola que el log <code>Cloud save uploaded</code> incluye <code>systemId</code>/<code>anchorLabel</code>.</li>
          <li>Abre Opciones → tab <strong>Partidas</strong>, pulsa <strong>Sync slots</strong> y comprueba que el slot 0 recién creado aparece con la fecha correcta.</li>
          <li>Acciona <strong>Save slot 0</strong> desde el panel para actualizar el mismo índice y revisa que el timestamp de la fila se refresca sin duplicados.</li>
          <li>Ejecuta <strong>Load latest</strong>, acepta la confirmación y verifica que el bloque “Last load” muestra sistema, anchor, build y <code>playTimeMs</code>, además del log con la duración en <code>LogCategory.SAVE_SYSTEM</code>.</li>
          <li>Provoca un error (p. ej. desconectando la red) y vuelve a guardar: tanto el CTA como el panel deben mostrar la misma copia producida por <code>describeError()</code>.</li>
          <li>Elimina el slot con <strong>Delete</strong> y confirma que si era el último cargado se limpia el bloque de feedback.</li>
        </ol>
        <p class="note">Si la carga no inicia, revisa la consola y asegúrate de estar probando con un payload v1 completo antes de abrir un issue.</p>
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
        'El header sólo muestra “Guardar partida” cuando `AuthService.authenticated()` es verdadero y reutiliza tu alias en el botón de logout.'
      ]
    },
    {
      title: 'Return URL permitido',
      bullets: [
        'El parámetro `return` siempre apunta a `https://to3.atropello-games.es` para que Cognito regrese al juego.',
        'Al volver, la cookie `atropello-session` ya está disponible y el CTA del header queda habilitado sin recargar la app.'
      ]
    },
    {
      title: 'Autorización para la API',
      bullets: [
        'El ID Token de Cognito firma cada llamada `GET/PUT/DELETE` al endpoint `https://api.atropello-games.es/cloud-saves`.',
        '`CloudSavesService.describeError()` detecta expiraciones/401 y muestra “Inicia sesión” tanto en el panel como en el CTA si la sesión caduca.'
      ]
    },
    {
      title: 'Payload v1 real',
      bullets: [
        'Los slots almacenan `SaveGamePayload` v1 con metadata (`schemaVersion`, `savedAt`, `systemId`, anchor, buildLabel, `playTimeMs`).',
        'Al cargar, `SaveGameMigrationService` normaliza el JSON y `GamePersistenceService.loadGame()` pausa/reanuda el loop para rehidratar el runtime.'
      ]
    }
  ];

  panelActions: PanelActionCard[] = [
    {
      title: 'Sync slots',
      summary: 'Refresca la lista de slots disponibles (ordenados por fecha).',
      bullets: [
        'Invoca `CloudSavesService.syncSlots()` y, en caso de éxito, rellena la tabla del panel.',
        'Se recomienda ejecutar este paso inmediatamente después de iniciar sesión para cargar el maestro y detectar expiraciones de token temprano.'
      ]
    },
    {
      title: 'Load latest',
      summary: 'Descarga el slot más reciente y ofrece inyectarlo en el runtime.',
      bullets: [
        'Equivale a `loadLatest()` que a su vez llama a `syncSlots()` y luego a `loadGameFromSlot()` antes de pasar el payload a `GamePersistenceService.loadGame()`.',
        'Siempre pide confirmación antes de pausar el loop; si algo falla, el estado previo continúa intacto y el mensaje aparece en el pie del panel.'
      ]
    },
    {
      title: 'Save slot 0',
      summary: 'Captura la partida actual y la sube al slot 0 (mismo pipeline que el CTA del header).',
      bullets: [
        '`saveCurrentGame(0)` pausa el loop, serializa jugador + universo + UI/audio opcional, adjunta metadata y hace PUT al endpoint.',
        'Tras guardar se ejecuta automáticamente `syncSlots()` y se actualiza el bloque de metadata con `savedAt`, `systemName` y `playTimeMs`.'
      ]
    },
    {
      title: 'Load slot / Delete',
      summary: 'Botones por fila para cargar o eliminar un índice específico.',
      bullets: [
        'Cargar un índice reutiliza el pipeline completo (migración → snapshots → `GameEngine.restartWithContext()`); el resultado queda registrado en el bloque “Last load”.',
        'Eliminar un slot llama a `deleteSave()` y, si era el último cargado, limpia el feedback para evitar inconsistencias.'
      ]
    }
  ];

  technicalBlocks: TechnicalBlock[] = [
    {
      title: 'AuthService & cookies',
      summary: 'Procesa el callback del Hosted UI, serializa la sesión y expone señales live.',
      links: [
        '`loginWithRedirect` abre `https://www.atropello-games.es/auth/launch?return=...` y `logoutWithRedirect` usa `https://www.atropello-games.es/auth/logout?return=...`.',
        '`SessionCookieService` lee `payload.signature`, decodifica el primer segmento base64 y mapea `profile → identity` incluso sin firma.',
        '`CloudSavesSessionBridgeService` retransmite token/identidad al servicio de saves para firmar peticiones.'
      ]
    },
    {
      title: 'Header CTA + Tab “Partidas”',
      summary: 'Ambos comparten señales (`saving()`, `error()`) y helpers de formato para mostrar feedback coherente.',
      links: [
        'El CTA invoca `saveCurrentGame(0)` con overrides mínimos y pinta el resultado en el propio header.',
        'El panel muestra metadata formateada (sistema, anchor, build, `playTimeMs`) y conserva el último resultado de carga.',
        'Ambos usan `CloudSavesService.describeError()` para mapear errores comunes a copy legible.'
      ]
    },
    {
      title: 'CloudSavesService',
      summary: 'SDK Angular con señales para slots, carga, flags de busy y errores contextualizados.',
      links: [
        '`saveCurrentGame()`/`loadGameFromSlot()` delegan en `GamePersistenceService` y registran logs `LogCategory.SAVE_SYSTEM`.',
        '`sendWithRetry()` controla loading spinners y centraliza mensajes en castellano.',
        'Más detalles en `documentacion/SaveGame_Serializacion_Cloud.md`.'
      ]
    },
    {
      title: 'GamePersistenceService',
      summary: 'Orquesta captura y carga real del SaveGamePayload v1 con metadata lista para la nube.',
      links: [
        'Pausa/reanuda el loop para congelar nave, GameStateStore y universo antes de serializar el payload.',
        'El metadata incluye `schemaVersion`, `savedAt`, `elapsedPlayTimeMs`, `systemId`, label del ancla y `userId` (si existe sesión).',
        'La carga usa `SaveGameMigrationService.ensureLatestSchema()`, hidrata jugador/estado/universo y deja trazas en `LogCategory.SAVE_SYSTEM` para cada fase.'
      ]
    }
  ];

  ngOnInit(): void {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
