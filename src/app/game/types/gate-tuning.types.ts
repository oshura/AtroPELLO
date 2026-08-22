/**
 * Sintonía del Rito de la Puerta (Fases 13–15 — docs/RAZAS.md).
 *
 * Una raza puede "sintonizar" el PRÓXIMO Gate Rite del jugador para dirigir el sistema que se
 * genere al otro lado. Nació como un simple primigenio forzado (los Grises → Yog-Sothoth) y ahora
 * describe destinos completos: los Mi-Go sintonizan hacia el sistema de guerra arácnido y, tras su
 * misión, hacia el sistema natal de Yig.
 *
 * Es de un solo uso: el rito la consume al generar el destino. Persiste en el savegame (sección de
 * personaje) para que guardar entre aceptar el encargo y lanzar el rito no la pierda.
 */
export interface GateTuningState {
  /** Primigenio que dominará el sistema destino. */
  forcedElderGod?: string;
  /** Primigenio que NUNCA dominará el destino (manda sobre `forcedElderGod` si chocan). */
  excludedElderGod?: string;
  /** Raza que habitará el destino (vida 100 %, civilización confirmada). */
  guaranteedInhabitants?: string;
  /** Cuántos planetas habitados por esa raza (default 1). */
  guaranteedInhabitedCount?: number;
  /** Tema de estaciones del destino: los sistemas de guerra arácnidos llevan telarañas. */
  stationTheme?: 'aracnida';
}

/** ¿Hay algo que aplicar? (una sintonía vacía no dirige nada). */
export function isGateTuningEmpty(tuning: GateTuningState | null | undefined): boolean {
  if (!tuning) {
    return true;
  }
  return (
    !tuning.forcedElderGod &&
    !tuning.excludedElderGod &&
    !tuning.guaranteedInhabitants &&
    !tuning.stationTheme
  );
}
