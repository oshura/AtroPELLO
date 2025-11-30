# Landing Narrative JSON Schema

**Fecha:** 29 Nov 2025  
**Autor:** GitHub Copilot (GPT-5.1-Codex Preview)

## Objetivo
Centralizar en archivos JSON los textos interactivos del panel de aterrizaje para que el equipo pueda:
- Localizar/copiar fácilmente los diálogos Lovecraftianos.
- Iterar sin recompilar lógica de `LandingActionService`.
- Reutilizar el mismo formato para futuros idiomas.

## Ubicación
Los archivos residen en `src/app/assets/narrative/landing/` y se agrupan por ámbito:
1. `landing_base.json` – Acciones generales (Descansar, Registrar Anomalía, resultados comunes).
2. `landing_exploration.json` – Subacciones de exploración.
3. `landing_diplomacy.json` – Botones según animosidad (ally/neutral/enemy) + pistas.
4. `landing_missions_<race>.json` – Bloques por raza con diálogos, pistas y memorias.

## Formato común
Cada archivo exporta un objeto raíz con categorías. Los nodos terminan en textos y metadatos:
```json
{
  "rest": {
    "intro": { "speaker": "narrator", "text": "..." },
    "options": [ { "id": "rest", "label": "Descansar" } ],
    "outcomes": {
      "success": { "text": "...", "effects": ["+1 sanity", "+5 health", "+1 day"] },
      "interrupted": { "text": "...", "effects": ["reveal_lesser", "-1 sanity", "-5 health"] }
    }
  }
}
```
Campos estándar:
- `speaker`: `narrator | race | ai | pilot` (para UI).  
- `text`: cadena multi-línea permitida.  
- `options`: botones disponibles (id + etiqueta).  
- `effects`: lista corta que la UI mostraría bajo el texto.  
- `requires`: condiciones opcionales (`intel:lesserKnown`, `resource:metal>=1`, etc.).

## Archivos específicos
### 1. `landing_base.json`
Incluye:
- `rest` (intro, éxito, interrupción).
- `logAnomaly` (intro, costo, resultado).
- `commonFailure` (mensaje genérico para RNG fallido).

### 2. `landing_exploration.json`
Estructura:
```json
{
  "artifact": {
    "intro": "...",
    "options": [...],
    "success": { "hasArtifact": "...", "confirmedAbsent": "..." },
    "failure": "..."
  },
  "voidMass": { ... }
}
```
Cada bloque describe outcome doble (éxito/fracaso) y variantes según estado.

### 3. `landing_diplomacy.json`
Divide por animosidad (`ally`, `neutral`, `enemy`). Cada nivel contiene acciones con `intro`, `resolution`, `costs`. También define plantillas para `pistas` (`rumor`, `errand`, `vision`).

### 4. `landing_missions_<race>.json`
Formato:
```json
{
  "meta": {
    "race": "MI_GO",
    "memoryShare": 7,
    "missionType": "artifact",
    "artifactName": "Nodo Espectral"
  },
  "offer": { "scene": "...", "options": [...] },
  "clues": {
    "minor": { "cost": "1 metal + 1 orgánico", "text": "..." },
    "major": { "subTask": "calibrar-resonador", "success": "...", "failure": "..." },
    "final": { "cost": "-3 cordura", "text": "..." }
  },
  "turnIn": { "success": "...", "memory": "..." }
}
```

## Serialización / Consumo
- `LandingActionService` carga estos JSON vía `HttpClient` o import estático (TS/webpack).  
- Cada acción consulta `narrative[actionId]` y rellena el panel con `intro`.  
- Los outcomes indican qué efecto mostrar en el log y qué hooks (`reveal_lesser`, `apply_damage`) deben ejecutarse.

## Internacionalización futura
- Mantener claves estables (`rest.intro.text`).  
- Para nuevos idiomas, duplicar archivos dentro de `landing/<lang>/` y cargar según `languageService`.  
- Evitar concatenaciones en texto; usar placeholders `{planetName}`, `{raceName}`.

Con este esquema el equipo puede avanzar creando contenido sin tocar componentes Angular hasta que toque integrar.
