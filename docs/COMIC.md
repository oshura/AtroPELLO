# AtroPELLO — Biblia visual y pipeline de cómic

> **Documento vivo (reescrito 2026‑07).** Define cómo producimos las viñetas B/N que narran
> `docs/HISTORIA.md` y, sobre todo, **cómo garantizamos la coherencia mediante assets canónicos**.
> Las herramientas y modelos viven FUERA del repo en `D:\Olles\Comic\` (pesan GB; no se versionan).
> Aquí vive la doctrina. La web de Memorias y el reproductor de animación‑cómic: `docs/MEMORIAS.md`.

---

## 0. Objetivo y principio rector

Narrar los momentos clave del juego con **viñetas de cómic** generadas en local (ComfyUI + SD1.5,
GTX 1650 4 GB), iteradas con Claude —que **ve** cada PNG, lo criba contra checklist y regenera— y con
el usuario como director de arte que aprueba.

**Principio rector: primero assets canónicos, después viñetas.** Ninguna viñeta se produce si los
elementos que aparecen (personaje, nave, escenario, props) no tienen **hoja de modelo aprobada** por
ambos. La viñeta se compone **citando** esos assets como referencia visual. Los assets son la
inversión; las viñetas, la producción barata y coherente que sale de ellos.

---

## 1. Dirección artística — estilo «post‑Beà»

Referencia: **Josep Maria Beà** (*1984*, *Rambla*, *Historias de la Taberna Galáctica*). No se copia
obra; se extrae gramática visual. Páginas estudiadas en `D:\Olles\Comic\refs\bea\` (Rambla 15,
Creepy 09): **todo es línea y trama sobre papel** (nada de degradados fotográficos), figuras
resueltas con **economía de trazo**, negros sólidos, belleza inquietante, ciencia‑ficción
anti‑tópico, y el detalle al servicio de la atmósfera, no del realismo.

**Regla de detalle (fijada por el usuario):**
- Techo de detalle facial = el del retrato canónico. Solo para primeros planos.
- En escenas de acción, cara **simplificada** (nivel del cuerpo entero oblicuo canónico).
- Prohibido derivar a realismo/hiperrealismo. Es un cómic: *«en la sencillez está el arte»*.

### 1.1 Style blocks oficiales (usar verbatim)

**ASSET / hoja de modelo** (papel plano, diseño legible):
```
black and white pen and ink comic illustration, 1970s Spanish graphic novel style, expressive
scratchy hand-drawn linework, rough organic ink strokes, cross-hatching and stippling shadows,
solid deep blacks, simplified stylized figure drawn with economy, flat white paper background,
vintage European sci-fi comic, no gradients
```

**VIÑETA** (claroscuro cósmico; validado con `TEST_W1_earth`, `EST_w1adrift`):
```
black and white ink comic illustration, dense cross-hatching and stippling, high-contrast
chiaroscuro, deep inky blacks, dramatic single-source lighting, cosmic horror, eldritch,
Lovecraftian, atmospheric, elegant yet sinister, cinematic composition, European sci-fi
graphic novel, masterful pen and ink
```

**Negativo base común** (anti‑realismo, anti‑color, anti‑deriva):
```
photorealistic, photo, hyperrealistic, 3d render, cgi, smooth shading, airbrush, gradient,
color, colored, cartoon, anime, manga, clean vector lines, text, watermark, signature,
collage, multiple views, several figures, extra heads
```

---

## 2. Especificación canónica — Harvey Walters

### 2.1 Cara (fichero canónico: `harvey_face_CANON.png`, crop del retrato aprobado)
- Pelo **negro corto, algo despeinado, flequillo suave** sobre la frente.
- **Cejas relajadas y rectas** — la cara por defecto es serena; NUNCA ceño fruncido "de cabreo"
  salvo que el beat lo pida.
- **Barba negra corta recortada uniforme + bigote CORTO recortado** (nunca largo/mostacho),
  SIEMPRE la misma densidad/largo.
- Hombre corriente de mediana edad; complexión **normal, no musculada**.
- Prompt: `black short slightly tousled hair with a soft fringe over the forehead, calm relaxed
  straight eyebrows, short dense neatly trimmed full black beard with mustache, serene neutral
  expression, middle-aged ordinary face`
- Negativo: `angry, frowning, furrowed brows, scowling, long beard, goatee, clean shaven, sparse
  beard, stubble, long hair, ponytail, young man, teenager, white hair, grey hair`

### 2.2 Traje MK2 (fuente de diseño: `harvey_oblique_CANON.png`; el traje es EXACTAMENTE ese)
- **Mono de una pieza gris claro, holgado**, tela mate con pliegues suaves (jamás ceñido).
- **Cremallera frontal** del cuello a la cintura.
- **Bolsillos de pecho BLANCOS con solapa** (nunca negros).
- **UN parche negro plano en el brazo IZQUIERDO** (único parche; sin texto).
- **Cinturón fino de tela NEGRO, CERRADO** con hebilla metálica pequeña (igual en todas las vistas).
- **Manga SIEMPRE larga** hasta muñequeras reforzadas (**prohibido remangado**); **guantes negros**.
- **Botas negras ALTAS lisas**; el pantalón cae sobre la bota con puño liso.
  **PROHIBIDO** el puño tipo calcetín/canalé entre bota y pantalón.
- **Anillo de cuello metálico REMACHADO con cierre frontal** (acople del casco; detalle heredado
  del casco canónico — visible en frente y retrato).
- **Espalda LISA**: sin hombreras, sin correas diagonales, sin líneas negras; dos bolsillos traseros
  discretos bajo el cinturón. Proporciones normales (piernas no alargadas).
- Prompt: `wearing a light grey astronaut coverall jumpsuit, loose and baggy with soft fabric folds,
  long sleeves reaching down to reinforced wrist cuff rings, front zipper, a small dark rectangular
  chest panel, a flapped chest pocket, a single dark patch on his left upper arm, a thin fabric
  waist belt with a small buckle, plain black gloves, tall plain black boots, bare metal neck ring
  collar, simple utilitarian spacesuit`
- Negativo: `epaulettes, shoulder tabs, shoulder straps, thin straps, diagonal strap, cross strap,
  harness, suspenders, overalls, dungarees, bib, backpack, ribbed cuffs, sock cuffs, knitted cuffs,
  rolled sleeves, short sleeves, armor, tight suit, skintight, muscular, superhero, american flag,
  woman, female, high heels` (+ `helmet, hat, cap, hood, beanie, headphones, glasses` si va a cabeza
  descubierta)

### 2.3 Ficheros canónicos (`D:\Olles\Comic\refs\assets\personaje\` — copiados a `ComfyUI\input\`)

| Fichero | Contenido | Estado |
|---|---|---|
| `harvey_face_CANON.png` | cara canónica (crop SOLO cabeza, sin ropa, fondo limpio) | **[x] APROBADA** |
| `harvey_portrait_CANON.png` | retrato con traje gris canónico (anillo + cremallera) | [~] propuesta 3 |
| `harvey_suit_front_CANON.png` | traje frente + **anillo de cuello remachado** (inpaint) | [~] propuesta 3 |
| `harvey_suit_back_CANON.png` | traje espaldas, proporciones corregidas (PIL) | [~] propuesta 3 |
| `harvey_oblique_CANON.png` | oblicuo regenerado: mangas largas, cinturón negro, cara canónica | [~] propuesta 3 |
| `harvey_helmet_CANON.png` | casco MK2 con **bigote corto** (inpaint sobre el bonus aprobado) | [~] propuesta 3 |

---

## 3. LA CLAVE TÉCNICA: cómo se mantiene el canon

**Cadena de cinco capas, por orden de fuerza.** Toda imagen (asset o viñeta) se genera con las
capas aplicables activas:

1. **Style block fijo** (§1.1) — la misma familia de tinta siempre; el estilo nunca se improvisa.
2. **Asset canónico como referencia visual** — la imagen aprobada se inyecta vía **IP‑Adapter de
   imagen** (`scripts\gen_ipa.py`, `--weight 0.55–0.7`, `weight_type linear`). Es el **ADN de
   diseño**: impide que traje/nave/escenario muten. Se elige la vista canónica más cercana al
   ángulo de cámara de la viñeta. `gen_ipa.py` admite **dos referencias encadenadas**
   (`--ref` diseño + `--ref2` cara, `--weight2 ~0.45`): así se fijan traje Y cara a la vez.
3. **Descripción canónica verbatim** (§2) en el prompt — refuerzo textual de cada detalle; los
   negativos canónicos matan las derivas conocidas.
4. **Composición** — cuando la estructura/encuadre importan: **ControlNet canny/depth**
   (`scripts\gencontrol.py`) alimentado con **capturas del juego** (`refs\game\` → `canny_prep.py`)
   o bocetos. Sin esto, SD1.5 clava estilo pero improvisa la estructura.
5. **Reproducibilidad y retoque** — todo PNG lleva **sidecar JSON** (prompt, seed, pesos, refs);
   aprobado = congelado. Defectos puntuales se corrigen SIN relotear la imagen entera, por orden de
   precisión: **inpaint por máscara** (`gen_inpaint.py` + `make_mask.py`), **edición directa PIL**
   (parches planos, borrados, transformaciones geométricas — p. ej. acortar piernas 8 %), o clonado.
   El mejor candidato se **rescata y repara**; no se busca la perfección en una sola tirada.

**La cara del usuario (FaceID)** quedó relegada a *inspiración puntual* (weight 0.45–0.5) o se
omite: manda la **cara canónica dibujada** (§2.1). Decisión del usuario: **coherencia > parecido**.

**Criba visual obligatoria:** Claude genera 2–4 candidatos por pieza, los MIRA y pasa el
checklist (§5). Solo se enseñan candidatos que lo superan; el usuario arbitra el gusto, no los
defectos.

**Refuerzo futuro (opcional, recomendado):** con 20–30 imágenes aprobadas de Harvey, entrenar un
**LoRA propio** del personaje. Identidad + traje quedan grabados en el modelo y la fidelidad sube
del ~90 % al ~99 % sin depender de referencias. Requiere entrenamiento (local lento en 4 GB, o
cloud); decidir cuando la biblioteca de aprobados exista.

---

## 4. Receta de una viñeta (paso a paso)

1. Elegir el *beat* del guion (§7) y escribir su ficha (plano, sujeto, emoción, luz, aire para
   bocadillo).
2. Elegir assets implicados y ángulo → `--ref` = vista canónica más cercana (+ `--ref2` cara si se
   ve el rostro).
3. Montar el prompt: **bloque VIÑETA** + **specs canónicas** de cada asset presente + escena,
   emoción y luz del beat.
4. Si hay estructura (nave, estación, Tierra, cabina): **ControlNet** con la captura/boceto.
5. Generar 2–4 seeds → **checklist §5** → regenerar/inpaint hasta pasar.
6. Presentar candidatos → aprobación del usuario → archivar PNG+JSON en `output\` (y el elegido a
   la galería/artifact).

## 5. Checklist de QA (pasar ANTES de enseñar nada)

- **Estilo**: ¿tinta B/N familia Beà? ¿negros sólidos y tramas? ¿sin deriva foto/3D/anime/vector?
- **Cara**: ¿cejas relajadas (no cabreo por defecto)? ¿flequillo y pelo canónicos? ¿barba corta
  densa uniforme? ¿mediana edad?
- **Traje**: ¿gris claro holgado? ¿cremallera? ¿bolsillo(s) pecho? ¿parche SOLO brazo izquierdo?
  ¿cinturón fino? ¿manga larga + muñequeras? ¿guantes negros? ¿botas altas lisas SIN calcetín?
  ¿espalda limpia? ¿anillo de cuello?
- **Figura**: ¿complexión normal? ¿masculina? ¿manos correctas?
- **Escena**: ¿composición legible? ¿sin texto/marcas? ¿aire para bocadillo si toca?
- **Continuidad**: ¿heridas/props coherentes con el beat (corte fresco en P5 → cicatrizado en D*)?

---

## 6. Herramientas

| Script (`D:\Olles\Comic\scripts\`) | Uso |
|---|---|
| `gen_ipa.py` | **herramienta central**: genera citando 1–2 assets canónicos (IP‑Adapter imagen) |
| `gen.py` | txt2img simple (escenas sin referencia) |
| `gencontrol.py` | ControlNet canny/depth para composición estructural |
| `canny_prep.py` | capturas del juego → mapas canny (recorta HUD) |
| `gen_inpaint.py` + `make_mask.py` | retoque quirúrgico por máscara (corregir un detalle sin regenerar) |
| `genface.py` | FaceID con fotos del usuario (hoy: solo inspiración puntual) |
| `crop_face.py` | extrajo la cara canónica del retrato aprobado |
| `build_modelsheet.py` | página HTML de la biblia de assets (artifact) |
| `build_gallery.py` | galería de viñetas tipo novela gráfica (artifact) |

Motor: **ComfyUI portable** (Python 3.13 embebido, `--lowvram`) + **SD1.5 DreamShaper 8**.
Arranque: `D:\Olles\Comic\ComfyUI_windows_portable\run_comic.bat`. API: `127.0.0.1:8188`.
Salidas + sidecars JSON: `D:\Olles\Comic\output\`. Referencias: `refs\bea` (autor), `refs\game`
(capturas del juego), `refs\assets\<categoría>` (canónicos aprobados), `refs\yo` (fotos usuario).

---

## 7. Guion → viñetas de la INTRO (`HISTORIA.md` §2–§4)

> Con la biblia de assets aprobada, estas viñetas se **rehacen** componiendo desde los canónicos.
> Ficha por beat: plano, sujeto+acción, expresión, luz, elementos, aire para bocadillo.

**Prólogo — El Incidente (§2)**
- **[P1] El robo** — plano medio; Harvey con el grimorio en el hangar de la secta, su nave detrás;
  tensión de transgresión.
- **[P2] El rito** — DESDE la cabina (atril + grimorio); el portal eldritch abriéndose tras la
  cúpula.
- **[P3] La catástrofe** *(splash)* — la Tierra partida: grieta de magma + núcleo rojo expuesto +
  cinturón de escombros (ControlNet con captura).
- **[P4] La estación herida** — el toro dañado flotando entre asteroides (ControlNet con captura).
- **[P5] Lanzado al vacío** — Harvey golpeado en la cabina; corte en la frente (herida moderada);
  intercom: «¡¿Qué haces, loco?! ¡Para ya! ¡Aborta!» (aire para bocadillo).

**El Despertar (§3)** — herida ya cicatrizada:
- **[D1] Inconsciente** — desplomado en el asiento, cabina en penumbra.
- **[D2] Alarmas** — primer plano despertando sobresaltado (cara canónica + expresión dirigida).
- **[D3] A los mandos** — decidido, manos en los mandos, luces de alarma.

**Estado del mundo (§4)**
- **[W1] A la deriva** — la nave (asset) diminuta en el campo de escombros, la Tierra partida al
  fondo.

**La Estación (§5)** — S1 aparición, S2 acoplamiento, S3 hallazgo grotesco (horror corporal),
S4 descubrimiento de Void Jump. **Recuerdos (§6)** — R*: mismo pipeline con tratamiento visual
distinto (p. ej. trama más difusa/duotono) para marcar el flashback.

---

## 8. Catálogo de assets y estado

| Asset | Vistas | Estado |
|---|---|---|
| **Harvey Walters** | cara; traje frente/espalda/oblicuo; retratos | **[x] oblicuo+cara aprobados**; [~] frente/espalda propuesta 2 |
| Casco MK2 | ¾ | [x] aprobado (bonus del retrato) |
| **Nave (exterior)** | planta, lateral, frontal, oblicua | [ ] — refs juego: `ship_exterior.png`, `earth_core.png` |
| Cabina (interior) | vista piloto + vista hacia atrás | [ ] — spec en §7/[P2] |
| Pasillo de la nave | 1 vista | [ ] |
| Tierra | entera | [ ] |
| Tierra partida | splash | [ ] — ref `earth_core.png` |
| Hangar/cripta de la secta | 1 vista | [ ] |
| Estación humana | exterior | [ ] — ref `station2.png` (base EST_station3) |
| Campo de asteroides | 1 vista | [ ] |
| Grimorio | cerrado + abierto | [ ] |
| Portal Gate Rite | abriéndose | [ ] — base EST_rite |

---

## 9. Maquetación y rótulos (fuera de la IA)

La IA no genera texto legible ni páginas multi‑viñeta. Viñetas individuales → la página (rejilla,
calles, márgenes) se monta aparte; **bocadillos, cartelas y onomatopeyas siempre en post**
(HTML/editor), dejando aire en la composición. Los textos salen de `HISTORIA.md`.

## 10. Lecciones aprendidas (gotchas de SD1.5 — consultar antes de promptear)

- La palabra **"helmet"** en positivo invoca cascos/gorros fantasma; "model sheet" invoca collages
  (usar `single figure alone`).
- **"rear view"** tiende a figura femenina → negativos `woman, female, high heels`.
- El color del pelo hay que fijarlo (`black`): "dark" deriva a blanco/gris con IPA.
- Expresión extrema vs identidad: pelean; se resuelve con `--start_at` (FaceID) o con ref2 de cara.
- ControlNet filtra el color de la ref (magma naranja) → normalizar a grises en post.
- SD1.5 **no dibuja naves/estructuras concretas sin referencia** (improvisa) → ControlNet o asset.
- Fondos con halo/círculo en una ref IPA se transfieren → usar refs de fondo limpio.
- Mangas: sin especificar, salen remangadas; fijar `long sleeves down to the wrist cuffs`.
- 4 GB VRAM: cuerpos enteros 512×896 ~2 min/imagen; lotes de ≤3 por llamada (timeout).

## 11. Registro de decisiones

- **2026‑07‑02** — Estilo: tinta B/N post‑Beà. Motor local (ComfyUI+SD1.5). Iteración con Claude.
- **2026‑07‑03** — Protagonista con la cara del usuario vía FaceID; HERO_04 elegido. Consistencia >
  parecido. Correcciones: traje MK2 sencillo, sin cruces/catedrales; estación toroidal fiel al juego.
- **2026‑07‑04** — Workflow de **biblia de assets** (hojas de modelo aprobadas antes de viñetas).
  Traje holgado, complexión normal.
- **2026‑07‑05/06** — Estilo de assets = mismo Beà (nada de realismo). Traje canónico = el del
  oblicuo ¾; espalda limpia; cara canónica = retrato frontal (cejas relajadas). FaceID relegado a
  inspiración. Nace la cadena de 5 capas y las herramientas `gen_ipa --ref2` e inpaint.
