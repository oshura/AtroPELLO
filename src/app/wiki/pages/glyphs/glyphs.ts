import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WikiNavigationService } from '../../../services/wiki-navigation.service';
import { WikiCloseComponent } from '../../components/wiki-close/wiki-close.component';

interface Glyph {
  name: string;
  type: string;
  icon: string;
  activation: string;
  effect: string;
  duration?: string;
  cooldown?: string;
  sanityTemp: number;
  sanityReserve: number;
  voidEnergy: string;
  requirements: string[];
  description: string;
  notes?: string;
}

@Component({
  selector: 'app-glyphs-wiki',
  imports: [CommonModule, RouterModule, WikiCloseComponent],
  template: `
    <app-wiki-close></app-wiki-close>
    <div class="wiki-page">
      <header class="page-header">
        <h1>✨ Glifos y Rituales</h1>
      </header>

      <section class="intro">
        <p>
          Cada glifo consume cordura temporal y bloquea parte de tu máximo mientras esté aprendido. Esta guía resume los
          costes confirmados y los requisitos de activación para que no pierdas cordura ni Energía del Vacío por error.
        </p>
      </section>

      <section class="cost-table">
        <h2>📊 Tabla de costes rápidos</h2>
        <table>
          <thead>
            <tr>
              <th>Glifo</th>
              <th>Temp</th>
              <th>Reserva</th>
              <th>Energía del Vacío</th>
              <th>Notas breves</th>
            </tr>
          </thead>
          <tbody>
            @for (glyph of glyphs; track glyph.type) {
              <tr>
                <td>{{ glyph.name }}</td>
                <td>{{ glyph.sanityTemp }}</td>
                <td>{{ glyph.sanityReserve }}</td>
                <td>{{ glyph.voidEnergy }}</td>
                <td>{{ glyph.notes || glyph.effect }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <div class="glyphs-grid">
        @for (glyph of glyphs; track glyph.type) {
          <div class="glyph-card">
            <div class="glyph-icon">{{ glyph.icon }}</div>
            <h2>{{ glyph.name }}</h2>
            <div class="glyph-type">{{ glyph.type }}</div>

            <div class="glyph-details">
              <div class="detail-section pill-row">
                <span class="pill">Temp {{ glyph.sanityTemp }}</span>
                <span class="pill">Reserva {{ glyph.sanityReserve }}</span>
                <span class="pill">Energía {{ glyph.voidEnergy }}</span>
              </div>

              <div class="detail-section">
                <h3>Activación</h3>
                <p [innerHTML]="glyph.activation"></p>
              </div>

              <div class="detail-section">
                <h3>Efecto</h3>
                <p>{{ glyph.effect }}</p>
              </div>

              @if (glyph.duration || glyph.cooldown) {
                <div class="detail-section">
                  <h3>Duración / CD</h3>
                  <p>
                    @if (glyph.duration) {<span>Duración: {{ glyph.duration }}.</span>}
                    @if (glyph.cooldown) {<span> CD: {{ glyph.cooldown }}.</span>}
                  </p>
                </div>
              }

              <div class="detail-section">
                <h3>Requisitos</h3>
                <ul>
                  @for (req of glyph.requirements; track req) {
                    <li>{{ req }}</li>
                  }
                </ul>
              </div>

              <div class="detail-section description">
                <p>{{ glyph.description }}</p>
              </div>
            </div>
          </div>
        }
      </div>

      <section class="grimoire-info">
        <h2>📖 Cómo usar el Grimorio</h2>
        <p>
          Pulsa <kbd>G</kbd> para abrir el grimorio y selecciona un glifo. La tecla rápida por defecto es <kbd>H</kbd>; al
          castear se limpia la selección para evitar dobles lanzamientos. El panel muestra estados bloqueado (<span class="locked-indicator">🔒</span>) y disponible (<span class="available-indicator">⚡</span>).
        </p>
        <ul>
          <li>Los costes de cordura temporal se aplican tras ejecutar el efecto.</li>
          <li>Augurio y Revelación comparten alcance (≤ 500u) con la bahía auxiliar.</li>
          <li>Si falta energía o el objetivo es inválido, verás un aviso y conservarás todos tus recursos.</li>
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

    .page-header {
      margin-bottom: 2rem;
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

    .cost-table {
      margin-bottom: 2.5rem;
      background: rgba(0, 255, 65, 0.04);
      border: 1px solid rgba(0, 255, 65, 0.3);
      border-radius: 8px;
      padding: 1.5rem;
    }

    .cost-table h2 {
      margin-top: 0;
      color: #00ff41;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 0.75rem 0.5rem;
      text-align: left;
    }

    th {
      color: #00ff41;
      text-transform: uppercase;
      font-size: 0.85rem;
      letter-spacing: 1px;
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

    .pill-row {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .pill {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      background: rgba(0, 255, 65, 0.15);
      color: #00ff41;
      font-size: 0.85rem;
      border: 1px solid rgba(0, 255, 65, 0.3);
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

    .detail-section ul {
      margin: 0;
      padding-left: 1.2rem;
      color: #ccc;
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
      name: 'Speed Rite',
      type: 'SPEED',
      icon: '💨',
      activation: 'Selecciona el glifo y pulsa la tecla rápida (<kbd>H</kbd>).',
      effect: 'Duplica velocidad máxima, aceleración y frenado durante 120 s.',
      duration: '120 s',
      sanityTemp: 1,
      sanityReserve: 2,
      voidEnergy: '0u',
      requirements: ['No requiere objetivo.', 'Animación de precast completada (2 s).'],
      description: 'Perfecto para travesías largas. Si lo relanzas antes de expirar refresca la duración; al terminar, la velocidad se ajusta para evitar sobresaltos.',
      notes: 'Cuando termina reduce la velocidad poco a poco para evitar tirones.'
    },
    {
      name: 'Void Jump',
      type: 'LONGJUMP',
      icon: '⚡',
      activation: 'Marca un objetivo (> 4000u) y pulsa la tecla del glifo.',
      effect: 'Inicia la animación de salto y desplaza la nave tras completarla.',
      sanityTemp: 2,
      sanityReserve: 4,
      voidEnergy: '0u',
      requirements: ['Objetivo válido y a > 4000u.', 'Animaciones libres.', 'Solo disponible fuera de atmósferas activas.'],
      description: 'Herramienta de escape fiable. Si el objetivo no es válido, verás un aviso y conservarás tus recursos.',
      notes: 'El flash muestra al Elder God dueño del sistema (Cthulhu/Azathoth/Yog-Sothoth/Cthugha) y congela brevemente los controles antes del salto.'
    },
    {
      name: 'Gate Rite',
      type: 'GATE_RITE',
      icon: '🌀',
      activation: 'Apunta a un planeta ≤ 50u, pulsa la tecla del glifo y espera la secuencia completa.',
      effect: 'Colapsa el planeta, crea un portal enlazado y te lleva a un nuevo sistema.',
      sanityTemp: 5,
      sanityReserve: 5,
      voidEnergy: '0u (pausa/rellena)',
      requirements: ['Planeta dentro de ≤ 50u.', 'Sin amenaza activa bloqueando la animación.'],
      description: 'La secuencia bloquea inputs y daño. Al llegar, el portal queda disponible para volver y tu Energía del Vacío se rellena.',
      notes: 'El planeta colapsado desaparece para siempre y el nuevo portal queda enlazado como ruta estable.'
    },
    {
      name: 'Eternal Rite',
      type: 'ETERNAL_RITE',
      icon: '🛡️',
      activation: 'Selecciona el glifo y pulsa la tecla rápida.',
      effect: 'Congela el tiempo para todo salvo tu nave, permitiendo maniobras seguras.',
      sanityTemp: 1,
      sanityReserve: 0,
      voidEnergy: '0u',
      requirements: ['Necesitas tener el control de la nave.', 'No se superpone con Gate Rite ni Void Jump.'],
      description: 'Ideal para atravesar campos densos de escombros. No aumenta daño ni velocidad: solo detiene el entorno temporalmente.',
      notes: 'Se puede cancelar manualmente volviendo a castear.'
    },
    {
      name: 'Disrupt',
      type: 'DISRUPT',
      icon: '💥',
      activation: 'Enfoca un portal u objeto resonante ≤ 50u y mantén la tecla.',
      effect: 'Canaliza un haz de 1.5 s que desestabiliza portales o artefactos enemigos.',
      sanityTemp: 1,
      sanityReserve: 1,
      voidEnergy: '0u',
      requirements: ['Objetivo válido y visible.', 'Distancia ≤ 50u.'],
      description: 'Herramienta antisabotaje. Cancela portales hostiles y, si estás fuera de rango, muestra un aviso sin gastar cordura.',
      notes: 'El haz sigue el mismo ángulo que tu cámara, así que apunta donde estés mirando.'
    },
    {
      name: 'Anchoring Pulse',
      type: 'ANCHORING_PULSE',
      icon: '🧲',
      activation: 'Apunta a un asteroide cercano y pulsa el glifo.',
      effect: 'Desintegra el asteroide y almacena su masa en la bodega.',
      sanityTemp: 2,
      sanityReserve: 3,
      voidEnergy: '0u',
      requirements: ['Asteroide a ≤ 50u.', 'Necesitas espacio libre en la bodega.'],
      description: 'Cuando la bodega se llena aparece un aviso de capacidad completa. Las nuevas entradas se reflejan en el inventario inmediatamente.',
      notes: 'Añade el mineral directamente al manifiesto del inventario.'
    },
    {
      name: 'Void Kinesis',
      type: 'VOID_KINESIS',
      icon: '🌌',
      activation: 'Selecciona un asteroide ≤ 50u y castea.',
      effect: 'Convierte el asteroide en Energía del Vacío (8u mínimo, escala con la masa).',
      sanityTemp: 2,
      sanityReserve: 3,
      voidEnergy: '+8u a +70u',
      requirements: ['Asteroide en rango.', 'Reserva del vacío con margen suficiente.'],
      description: 'Si el incremento llenaría la reserva aparece un aviso de límite y el objetivo se mantiene intacto.',
      notes: 'El HUD muestra cuánta energía del vacío obtuviste tras cada extracción.'
    },
    {
      name: 'Void Cocoon',
      type: 'VOID_COCOON',
      icon: '🕸️',
      activation: 'Selecciona el glifo y pulsa la tecla rápida en cualquier momento.',
      effect: 'Genera un escudo esférico durante 30 s que absorbe impactos de colisión sin dañar el casco.',
      duration: '30 s',
      sanityTemp: 3,
      sanityReserve: 3,
      voidEnergy: '0u',
      requirements: ['Sin animaciones bloqueantes en curso.', 'La nave debe estar operativa (no destruida).'],
      description: 'El capullo es semitransparente y muestra un countdown “COCOON” en la brújula. Cada impacto absorbido emite un mensaje y deja intactos tus puntos de vida.',
      notes: 'Emite un pulso grave al activarse para que sepas que sigues protegido.'
    },
    {
      name: 'Tempus Sigillum',
      type: 'TEMPUS_SIGILLUM',
      icon: '⏳',
      activation: 'Alinea un planeta ≤ 500u, selecciona el glifo y pulsa la tecla rápida.',
      effect: 'Reinicia el estado civilizatorio del planeta, borra augurios previos y amansa seres menores.',
      sanityTemp: 2,
      sanityReserve: 5,
      voidEnergy: '0u',
      requirements: ['Planeta válido dentro de ≤ 500u.', 'Debes tener el planeta marcado en el HUD.'],
      description: 'Ideal para rerollear habitantes o pacificar sistemas problemáticos. Limpia el lesser being y obliga a un nuevo escaneo.',
      notes: 'El HUD confirma qué planeta fue reiniciado al acabar el ritual.'
    },
    {
      name: 'Quimio Sigillum',
      type: 'QUIMIO_SIGILLUM',
      icon: '⚕️',
      activation: 'Selecciona el glifo y pulsa la tecla rápida; el rito se anula si la supervivencia ya es 100%.',
      effect: 'Restaura +5% de supervivencia instantáneamente (cap en 100%).',
      sanityTemp: 5,
      sanityReserve: 8,
      voidEnergy: '0u',
      requirements: ['No requiere objetivo.', 'Supervivencia < 100% para obtener efecto.'],
      description: 'Sello alquímico para recuperarte de tiradas de envejecimiento o encuentros letales. Si no puede aplicar el 5%, verás un aviso y el coste no se consume.',
      notes: 'El HUD indica el porcentaje de supervivencia que recuperaste.'
    },
    {
      name: 'Concordia Gate',
      type: 'PORTAL_CONCORD',
      icon: '🔷',
      activation: 'Alinea un portal hostil ≤ 500u, selecciona el glifo y pulsa la tecla rápida.',
      effect: 'Purga la animosidad del portal, lo vuelve aliado y sella futuras incursiones de seres menores enlazados.',
      sanityTemp: 2,
      sanityReserve: 4,
      voidEnergy: '0u',
      requirements: ['Portal objetivo con estado hostil.', 'Distancia ≤ 500u desde la nave.', 'Sin otra animación de rito en curso.'],
      description: 'El pentáculo pasa de carmesí a cian y el HUD confirma el pacto. Los portales aliados no permitirán que seres menores penetren hacia tus rutas.',
      notes: 'El mensaje emergente confirma el portal pacificado para que recuerdes qué ruta quedó segura.'
    },
    {
      name: 'Augurio',
      type: 'SPECIES_SCAN',
      icon: '🧬',
      activation: 'Apunta a un planeta y castea dentro de ≤ 500u de la superficie.',
      effect: 'Revela la especie dominante y marca el intel como completado.',
      sanityTemp: 1,
      sanityReserve: 3,
      voidEnergy: '50u',
      requirements: ['Planeta escaneable a ≤ 500u.', 'Objetivo seleccionado en el HUD.'],
      description: 'Otorga +100 XP la primera vez que detectas una especie distinta de NONE en ese planeta.',
      notes: 'El registro de intel añade automáticamente la especie descubierta.'
    },
    {
      name: 'Revelación',
      type: 'CREATURE_SCAN',
      icon: '👁️',
      activation: 'Idéntico a Augurio, pero centrado en el ser menor.',
      effect: 'Confirma si existe un Ser Menor activo y actualiza el intel.',
      sanityTemp: 1,
      sanityReserve: 3,
      voidEnergy: '50u',
      requirements: ['Planeta escaneable a ≤ 500u.', 'Objetivo seleccionado.'],
      description: 'Genera el mensaje “SER MENOR REVELADO/NO DETECTADO” junto al nombre del planeta.',
      notes: 'Solo consume energía cuando la lectura es válida y se añade al registro.'
    }
  ];
}
