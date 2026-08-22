/**
 * Vuelo por ratón (Fase 14 — el maniobrador de los Mi-Go).
 *
 * A más distancia del cursor a la retícula (el centro del canvas), más velocidad demandada de
 * pitch/yaw; el roll sigue en Q/E. Clase plana con host (patrón ARQUITECTURA §5.3): el motor la
 * llama una vez por frame ANTES de actualizar la nave, y este sistema escribe la demanda analógica
 * [-1, 1] en los canales `analogPitch`/`analogYaw` de la nave.
 *
 * Curva: zona muerta del 6 % (el cursor "en la retícula" no vira), saturación al 42 % del semilado
 * menor del canvas, y respuesta cuadrática entre medias (precisión cerca del centro, contundencia
 * en los bordes). Sin dispositivo instalado, con el toggle apagado o con los inputs de vuelo
 * bloqueados (paneles, animaciones, aterrizaje), la demanda es SIEMPRE 0.
 */

/** Fracción del semilado menor donde empieza a virar (zona muerta). */
export const MOUSE_FLIGHT_DEAD_ZONE = 0.06;
/** Fracción del semilado menor donde la deflexión satura al máximo. */
export const MOUSE_FLIGHT_SATURATION = 0.42;

export interface MouseFlightHost {
  /** ¿El maniobrador Mi-Go está instalado en el outfit? */
  isDeviceInstalled(): boolean;
  /** ¿El piloto lo tiene encendido? (toggle con tecla; por defecto sí). */
  isUserEnabled(): boolean;
  /** ¿Los inputs de vuelo están bloqueados? (paneles abiertos, animación, aterrizado…). */
  areFlightInputsLocked(): boolean;
  /** Posición del cursor en el canvas, o null si aún no se ha movido. */
  getPointer(): { x: number; y: number } | null;
  /** Dimensiones CSS del canvas. */
  getCanvasSize(): { width: number; height: number } | null;
  /** Vuelca la demanda [-1,1] en la nave. Con (0,0) el ratón no manda. */
  applyAnalog(pitch: number, yaw: number): void;
}

export class MouseFlightSystem {
  private lastPitch = 0;
  private lastYaw = 0;

  /** Demanda aplicada en el último frame (para HUD/depuración). */
  get demand(): { pitch: number; yaw: number } {
    return { pitch: this.lastPitch, yaw: this.lastYaw };
  }

  /** ¿El maniobrador está mandando ahora mismo? */
  isSteering(): boolean {
    return this.lastPitch !== 0 || this.lastYaw !== 0;
  }

  update(host: MouseFlightHost): void {
    if (!host.isDeviceInstalled() || !host.isUserEnabled() || host.areFlightInputsLocked()) {
      this.apply(host, 0, 0);
      return;
    }
    const pointer = host.getPointer();
    const size = host.getCanvasSize();
    if (!pointer || !size || size.width <= 0 || size.height <= 0) {
      this.apply(host, 0, 0);
      return;
    }
    // Offset del cursor al centro, normalizado por el SEMILADO MENOR: la sensibilidad es la misma
    // en horizontal y vertical aunque el canvas sea panorámico.
    const half = Math.min(size.width, size.height) / 2;
    const dx = (pointer.x - size.width / 2) / half;
    const dy = (size.height / 2 - pointer.y) / half; // arriba de la retícula = morro arriba
    this.apply(host, this.shape(dy), this.shape(dx));
  }

  /** Zona muerta + saturación + curva cuadrática, conservando el signo. */
  private shape(offset: number): number {
    const magnitude = Math.abs(offset);
    if (magnitude <= MOUSE_FLIGHT_DEAD_ZONE) {
      return 0;
    }
    const span = MOUSE_FLIGHT_SATURATION - MOUSE_FLIGHT_DEAD_ZONE;
    const t = Math.min(1, (magnitude - MOUSE_FLIGHT_DEAD_ZONE) / span);
    return Math.sign(offset) * t * t;
  }

  private apply(host: MouseFlightHost, pitch: number, yaw: number): void {
    // No repetir el volcado nulo cada frame: sólo cuando cambia algo o al soltar el mando.
    if (pitch === 0 && yaw === 0 && this.lastPitch === 0 && this.lastYaw === 0) {
      return;
    }
    this.lastPitch = pitch;
    this.lastYaw = yaw;
    host.applyAnalog(pitch, yaw);
  }
}
