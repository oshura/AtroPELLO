import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

interface ClipmapRingWikiRow {
  index: number;
  label: string;
  coverage: string;
  resolution: string;
  refresh: string;
  detail: string;
}

@Component({
  selector: 'app-terrain-wiki',
  standalone: true,
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="hero">
        <div>
          <p class="eyebrow">Atmospheric Terrain Systems</p>
          <h1>🗺️ Terrain & Clipmaps</h1>
          <p class="lede">
            Cuando atraviesas la atmósfera el suelo se arma en capas concéntricas. Aquí verás qué esperar desde cabina y cómo usar el overlay (tecla ñ) para leer las alertas CLIPMAP antes de aterrizar.
          </p>
        </div>
        <div class="hero-chip">LOD Budget · 180k vértices</div>
      </header>

      <section class="terrain-overview">
        <h2>Relieve vivo en cabina</h2>
        <p>
          Cada planeta mezcla tres capas de ruido para esculpir valles, dunas y casquetes. Para ti como piloto lo importante es reconocer las pistas visuales y reaccionar si algo luce plano.
        </p>
        <ul>
          <li><strong>Color responsivo:</strong> si el anillo cercano se ve uniforme, mantén rumbo 2&nbsp;s; la textura se rellena cuando el HUD indica “detalle alto”. Si el overlay reporta “uninitialized ring” espera a que cambie a “palette active” antes de descender.</li>
          <li><strong>Extrusión gradual:</strong> por encima de 600u el relieve se suaviza para darte una aproximación tranquila; al bajar de 80u recuperas toda la rugosidad.</li>
          <li><strong>Alertas HUD:</strong> ante cualquier “terrain warming up” abre el overlay y busca mensajes CLIPMAP antes de apoyar tren de aterrizaje.</li>
        </ul>
      </section>

      <section class="clipmap-layout">
        <div class="section-header">
          <div>
            <p class="eyebrow">Clipmap Stack</p>
            <h2>Anillos concéntricos y presupuesto</h2>
          </div>
          <span class="section-chip">Δ ≤ 2.3&nbsp;ms en anillo interno</span>
        </div>
        <p>
          Los anillos son cinturones de terreno que siguen a tu nave. Cuando cruzas el umbral Δ, ese cinturón se regenera mientras los demás se mantienen. Los anclajes ahora avanzan en saltos discretos (24u en el núcleo), así que verás que los anillos “saltan” sólo cuando el overlay marca que el <code>pendingArcLength</code> llegó a cero. Si necesitas un giro brusco, hazlo suave para evitar pops visibles entre anillos.
        </p>
        <div class="ring-grid">
          @for (ring of clipmapRings; track ring.index) {
            <article class="ring-card">
              <header>
                <h3>{{ ring.label }}</h3>
                <span class="ring-index">Ring {{ ring.index }}</span>
              </header>
              <dl>
                <div><dt>Cobertura</dt><dd>{{ ring.coverage }}</dd></div>
                <div><dt>Resolución</dt><dd>{{ ring.resolution }}</dd></div>
                <div><dt>Refresh</dt><dd>{{ ring.refresh }}</dd></div>
                <div><dt>Detalle</dt><dd>{{ ring.detail }}</dd></div>
              </dl>
            </article>
          }
        </div>
      </section>

      <section class="overlay-section">
        <div class="section-header">
          <div>
            <p class="eyebrow">Debug Overlay</p>
            <h2>Cómo leer las alertas CLIPMAP</h2>
          </div>
          <span class="section-chip">Pulsa ñ</span>
        </div>
        <ol class="overlay-steps">
          <li><strong>Abre Stats & Logs:</strong> pulsa ñ para mostrar el panel “📊 Stats & Logs”. Déjalo anclado durante el vuelo rasante.</li>
          <li><strong>Activa la categoría CLIPMAP:</strong> en la tira de botones habilita CLIPMAP junto con INFO/WARN. El overlay empezará a listar eventos como “Clipmap flush” o “Clipmap ring palette colors active”.</li>
          <li><strong>Interpreta las alertas:</strong> <em>palette colors active</em> indica que el anillo ya usa la paleta completa; <em>palette unavailable</em> significa que estás viendo un color provisional; <em>ring warming up noise cache</em> solo debería durar 1‑2&nbsp;s tras un viraje brusco; <em>uninitialized rings</em> señala anillos recién regenerados que aún conservan el color anterior.</li>
          <li><strong>Costuras visibles:</strong> revisa los campos <code>seamCount</code> y <code>seamsPending</code>. Si son mayores a cero, deja la nave en hover unos segundos hasta que el log “Clipmap seam diagnostics” muestre <em>avgGap</em> &lt; 0.05 y los pendientes bajen a cero.</li>
        </ol>
        <p class="hint">
          ¿Necesitas números crudos? La consola <code>window.__atropello.clipmaps.print()</code> sigue disponible para reportes QA, pero el overlay cubre lo necesario para un vuelo normal.
        </p>
      </section>

      <section class="qa-playbook">
        <h2>Checklist antes de tocar suelo</h2>
        <ol>
          <li><strong>Entrada atmosférica:</strong> mantén la actitud estable; si el overlay marca “ring warming up noise cache”, espera a que cambie a “palette colors active” antes de bajar más.</li>
          <li><strong>Vuelo rasante:</strong> busca gaps visuales entre anillos. Si ves un borde notable, acelera paralelo al terreno durante 2&nbsp;s para forzar el refresh hasta que desaparezca el pop.</li>
          <li><strong>Alineación final:</strong> revisa el overlay: no debería haber anillos en las listas de “tintedRings” o “uninitializedRings”. Si aparece alguno, mantén hover o asciende 30u para darle tiempo al manager. Asegúrate también de que <code>pendingArcLength</code> se mantenga &lt; 5u y que <code>seamsPending</code> sea cero antes de tocar suelo.</li>
          <li><strong>Post-aterrizaje:</strong> una vez estable toca ñ y desactiva CLIPMAP si ya no necesitas logs; así evitarás ruido en la bitácora al despegar.</li>
        </ol>
        <p>
          Para detalles técnicos profundos revisa <em>documentation/landing-requests/fractal-terrain-clipmaps.md</em>. Esta página se enfoca en el ángulo piloto: cómo leer el terreno y ejecutar aterrizajes seguros.
        </p>
      </section>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background: radial-gradient(circle at 20% 20%, rgba(0, 255, 153, 0.18), transparent 60%), #05060a;
      min-height: 100%;
      color: #f2f6f3;
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    }

    .wiki-page {
      max-width: 1160px;
      margin: 0 auto;
      padding: 2.5rem 2rem 4rem;
    }

    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 2rem;
      padding: 2.5rem;
      background: linear-gradient(135deg, rgba(0, 255, 153, 0.08), rgba(0, 140, 255, 0.08));
      border: 1px solid rgba(0, 255, 153, 0.2);
      border-radius: 18px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
      margin-bottom: 2.5rem;
    }

    .hero h1 {
      margin: 0.25rem 0 0.5rem;
      font-size: 2.8rem;
    }

    .hero .lede {
      color: #cfe9dd;
      line-height: 1.6;
      max-width: 640px;
    }

    .hero-chip {
      padding: 0.65rem 1.2rem;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.35);
      font-size: 0.95rem;
      letter-spacing: 0.05em;
    }

    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 0.75rem;
      color: #73ffd6;
      margin: 0;
    }

    .terrain-overview,
    .clipmap-layout,
    .overlay-section,
    .qa-playbook {
      background: rgba(5, 8, 15, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.4);
    }

    h2 {
      margin-top: 0;
      font-size: 1.8rem;
    }

    ul {
      margin: 1rem 0 0;
      padding-left: 1.5rem;
      line-height: 1.7;
    }

    .clipmap-layout p,
    .overlay-section p {
      color: #cbd6d1;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .section-chip {
      padding: 0.4rem 0.9rem;
      border-radius: 999px;
      border: 1px solid rgba(115, 255, 214, 0.4);
      color: #73ffd6;
      font-size: 0.8rem;
      letter-spacing: 0.05em;
    }

    .ring-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-top: 1.5rem;
    }

    .ring-card {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 1.5rem;
      background: rgba(6, 10, 18, 0.9);
    }

    .ring-card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .ring-index {
      font-size: 0.85rem;
      color: #8ad4ff;
    }

    .ring-card dl {
      margin: 0;
      display: grid;
      gap: 0.5rem;
    }

    .ring-card dt {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: rgba(255, 255, 255, 0.5);
    }

    .ring-card dd {
      margin: 0;
      font-weight: 600;
    }

    .qa-playbook ol {
      padding-left: 1.5rem;
      line-height: 1.8;
      color: #d8e0db;
    }

    .overlay-steps {
      padding-left: 1.5rem;
      line-height: 1.8;
      color: #d8e0db;
    }

    .overlay-steps li {
      margin-bottom: 0.75rem;
    }

    .hint {
      margin-top: 1rem;
      color: #8ad4ff;
      font-size: 0.95rem;
    }

    @media (max-width: 768px) {
      .hero {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  `]
})
export class TerrainWikiComponent implements OnInit {
  private wikiNav = inject(WikiNavigationService);
  private router = inject(Router);

  clipmapRings: ClipmapRingWikiRow[] = [
    { index: 0, label: 'Núcleo', coverage: '0 – 120u', resolution: '96 × 96', refresh: 'Δ 24u', detail: 'Extrusión 100 %' },
    { index: 1, label: 'Anillo 1', coverage: '120 – 250u', resolution: '72 × 72', refresh: 'Δ 120u', detail: 'Extrusión 85 %' },
    { index: 2, label: 'Anillo 2', coverage: '250 – 420u', resolution: '64 × 64', refresh: 'Δ 220u', detail: 'Extrusión 50 %' },
    { index: 3, label: 'Anillo 3', coverage: '420 – 650u', resolution: '48 × 48', refresh: 'Δ 220u', detail: 'Extrusión 35 %' },
    { index: 4, label: 'Cúpula', coverage: '650u – borde', resolution: '32 × 32', refresh: 'Δ 220u', detail: 'Extrusión 15 %' },
  ];

  ngOnInit(): void {
    this.wikiNav.setLastRoute(this.router.url);
  }
}
