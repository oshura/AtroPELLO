# AtroPELLO — Biblia narrativa

> **Documento vivo.** Recoge la historia del juego para que crezca de forma coherente. Cuando una
> mecánica nueva tenga carga narrativa, ánclala aquí. El tono es **lovecraftiano**: cósmico, fatalista,
> con horror corporal y pérdida de cordura. El equipo escribe en español; identificadores en inglés.

## 1. Premisa

El protagonista (PJ) es un iniciado de una **secta de los mitos de Cthulhu**. Se le ha encomendado
**probar un hechizo** sacado de un grimorio: el **Gate Rite** (`SpellType.GATE_RITE`). Para ello toma
**sin permiso** una de las naves de la secta —equipada con motor de vacío— y lo lanza.

## 2. Prólogo — El Incidente (cinemática de inicio)

El lanzamiento del Gate Rite **sale mal**. En vez de abrir una puerta limpia, **parte la Tierra en dos**
con una explosión descomunal, exponiendo su **núcleo** (de ahí `EarthSplitPlanet`: dos hemisferios
separados, tapas emisivas, núcleo rojo, tormenta procedural). La onda expansiva de los restos de la
Tierra:

- **Destruye parcialmente** la estación espacial humana que orbitaba cerca.
- **Lanza la nave del PJ lejos de la escena**, fuera del alcance inmediato.

El PJ sufre una **contusión**. La nave **aguanta bien**. Durante el incidente, por el intercomunicador
se oyen voces de la estación/secta: *«¡¿Qué haces, loco?! ¡Para ya! ¡Aborta!…»* (estos fragmentos se
recuperan después como recuerdos; ver §6).

## 3. El Despertar — Inicio del juego (para el jugador)

Tras **un día de inconsciencia**, el PJ despierta con **amnesia profunda y completa**: a efectos
prácticos es **otra persona**. Suenan las **alarmas de la nave**. Se recompone, toma los mandos, y
**ahí empieza el juego para el jugador**.

Estado de partida del PJ:
- **Memoria** muy baja (se recupera poco a poco; ver §6). Mecánicamente: `memoryPercent` bajo.
- **Grimorio con un único hechizo: Gate Rite**, el mismo que falló… que **nunca más volverá a fallar** ;)
- Solo dispone del **motor de vacío** de la nave para desplazarse (no hay saltos/atajos al principio).
- Objetivo emocional inmediato: **llegar a ver la Tierra** (ahora partida).

## 4. Estado del mundo al empezar

- La **Tierra está partida** y rodeada de su **cola de asteroides** (el cinturón de mega-asteroides de
  `EarthSplitPlanet.createWithDebris`). La nave despierta **alejada**, dentro/cerca de esa cola.
- El sistema es el **humano** (`human-system`, artesanal, elder god Cthulhu).
- Navegando entre los asteroides de la cola, el PJ acabará topándose con la **estación espacial humana
  parcialmente destruida** (ver §5).

## 5. La Estación Espacial Humana

Gran estación con forma de **toroide** que alberga **hábitats, almacenes y puestos de mantenimiento**,
conectados por **corredores y puertas estancas** (para aislar secciones). **Cuatro grandes radios
(pasadizos)** parten del toroide hacia un **núcleo central con los motores**. En esos radios están los
**puertos de atraque** donde naves como la del PJ se acoplan y despegan.

Tras el Incidente quedó **parcialmente destruida**: hay secciones reventadas, puertos inutilizados y
**peligros estructurales**. La nave del PJ puede **acoplarse a un puerto intacto y libre** de los ejes
que hayan sobrevivido.

A bordo (al **buscar por la estación**, 50% de éxito) pueden ocurrir:
- **Hallazgos grotescos**: cadáveres de la tripulación en escenas de horror → **pérdida de cordura**.
- **Peligros estructurales**: derrumbes, descompresión, fuego → **pérdida de vida**.
- **Recompensa**: el **descubrimiento de hechizos** que se añaden al grimorio. *Por ahora: **Void Jump**
  (`SpellType.LONGJUMP`).* 

> Diseño a futuro: habrá **estaciones de otras razas**, distintas en diseño pero que comparten el tener
> **puertos espaciales** y **lanzar su propio menú de aterrizaje**.

## 6. Recuerdos y recuperación de memoria

El PJ recupera memoria poco a poco. Al **descansar en la estación** (100% de éxito) recupera **vida,
cordura, un +5% de memoria** y **avanza el tiempo**, y se muestra una **presentación** (estilo
cinemática de inicio) que **amplía los recuerdos** del PJ. Estas presentaciones de la estación enseñan
**cómo el personaje tomó la nave con el hechizo y despegó sin permiso** (intercomunicador a tope:
*«¡¿Qué haces, loco?! ¡Para ya!…»*), encajando con §2.

> La presentación de recuerdos arranca desde el punto en que el PJ **recupera la consciencia** y va
> añadiendo capas a medida que sube la memoria. Es el vehículo para dosificar la verdad del Incidente.

## 7. El grimorio (estado narrativo)

- **Inicio**: solo **Gate Rite** (el rito fallido, ahora infalible).
- **Estación humana**: se descubre **Void Jump** (Long Jump).
- (Otros hechizos del juego se obtienen por otras vías; este documento solo fija los hilos narrativos.)

## 8. Hilos abiertos (para crecer)

- ¿Qué quería realmente la secta del Gate Rite? ¿Por qué esa nave concreta?
- ¿Quedan supervivientes humanos? ¿La estación tiene una IA/bitácora que hable con el PJ?
- Estaciones de otras razas: ¿aliadas, hostiles, neutrales? ¿Qué hechizos/recuerdos guardan?
- El arco de la **memoria**: ¿recuperarla del todo cambia quién es el PJ (otra vez)?
