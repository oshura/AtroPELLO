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
- **Los Grises**: entregan **Speed Rite** al completar su encargo (§9).
- **Los Mi-Go**: enseñan **Void Kinesis** al aceptar su encargo (la herramienta para drenar mundos)
  y entregan **Void Cocoon** al completarlo; su sabiduría de aliado enseña **Quimio Sigillum** (§11).
- (Otros hechizos del juego se obtienen por otras vías; este documento solo fija los hilos narrativos.)

## 8. Los tres primigenios

El universo está repartido entre **TRES** primigenios, y el arco no crece por ahí (Cthugha se retiró
del diseño el 2026-08-22; sus siervos pasaron a Yog-Sothoth). Cada sistema solar está bajo el dominio
de uno de ellos, lo que determina qué siervos lo patrullan:

| Primigenio | Cómo se le describe | Siervos |
|---|---|---|
| **Cthulhu** | Sueña y espera. Domina el sistema humano; **la Tierra era uno de sus mundos más adorados** (dormía a temporadas bajo sus océanos). | Semillas estelares, shoggoths |
| **Azathoth** | No piensa, y por eso no se le puede negociar nada. | Shoggoths, semillas estelares |
| **Yog-Sothoth** | La puerta y la llave: el que respondió cuando se lanzó el Gate Rite. **Se oculta tras enjambres de burbujas que degradan todo lo que tocan; su ser vive en el centro de las burbujas** (observación Mi-Go, §11 — siembra del futuro enfrentamiento). | **Vampiros de fuego** (exclusivos suyos), shoggoths |

Todas las razas del universo están amenazadas por ellos y por sus guerras. La meta última del PJ es
enfrentarse a los tres en una dimensión desconocida, liberando por el camino planetas de sus siervos.

Aparte quedan las **razas acólitas**: inteligencias que sirven a un primigenio, no habitan planetas y
aparecen cuando la trama las convoca. Fueron los acólitos de Yog-Sothoth quienes combatieron sobre la
Tierra el día del Incidente.

## 9. Los Grises (primera raza)

Humanoides de cabeza ancha y ojos negros. **Vigilaban la Tierra desde antes del Incidente**: sabían lo
que la secta pretendía traer y acudieron a impedirlo. Llegaron a tiempo, pero no eran suficientes: los
acólitos de Yog-Sothoth llegaron prendidos al rito, la batalla se libró sobre el cielo terrestre y,
cuando el vacío se cerró, la Tierra tenía dos mitades.

- **Dónde**: habitan siempre el sistema al que lleva el **primer Gate Rite** de la partida. Ese sistema
  **nunca cae bajo Yog-Sothoth** (`excludedElderGod` en `gate-rite.animation.ts`): es el único que
  invoca vampiros de fuego, así que su dominio pondría la presa de la misión en el patio de quienes te
  mandan a buscarla lejos — y encima son sus acólitos los que partieron la Tierra.
- **Qué revelan**: el reparto del universo entre los tres primigenios y su papel en el Incidente
  (+5% de memoria).
- **Qué piden**: abatir un **vampiro de fuego** en un dominio de Yog-Sothoth y traer el rescoldo.
- **Qué dan por adelantado**: reacondicionan la nave (anillo de toberas hasta 100&nbsp;u de velocidad y
  10&nbsp;u/s² de aceleración, **cañones gauss de hielo** y módulo de vacío ×10) y **sintonizan el
  siguiente Rito** hacia el dominio correcto.
- **Qué dan al volver**: el glifo **Speed Rite**, su amistad y una oferta permanente de motor, anclajes
  de arma y armamento.

## 10. La verdad de la secta (revelación Mi-Go)

**Yog-Sothoth creó la secta humana.** Ningún humano soñó el Gate Rite por su cuenta: la puerta y la
llave sembró las fórmulas durante tres generaciones en los sueños de la secta hasta que un puñado de
"monos listos" creyó haber descubierto algo. El objetivo nunca fue la humanidad: era **Cthulhu**. La
Tierra era uno de los sistemas más adorados de su oponente, que a veces habitaba sus profundidades
marinas; destruir ese mundo **con las manos de sus propios habitantes** era, para Yog-Sothoth, humor.
Los humanos fueron una herramienta desechable en una guerra entre primigenios — y el último humano,
la palanca que quedó viva.

El fragmento de memoria de los Mi-Go lo confirma desde dentro: el cuaderno de la secta apareció en un
buzón sin remite, con las fórmulas ya escritas y una letra que no era de nadie.

## 11. Los Mi-Go (segunda raza)

Hongos quitinosos con alas que no baten y manos de cirujano. No sirven a ningún primigenio: los
**estudian** — es la única relación segura, y aun así pierden una colonia cada pocos siglos. Pagan
con verdades; las tres cosas que coleccionan (cerebros, mapas, verdades incómodas) se cobran.

- **Dónde**: entran en el sorteo de mundos con vida junto a los Grises (segunda raza terminada).
- **Qué revelan**: la verdad de la secta (§10) y el **comportamiento observado de Yog-Sothoth**: las
  burbujas que dañan todo objeto y el ser que vive en su centro (+5 % de memoria).
- **Qué piden**: **terminar la presencia de los tejedores arácnidos** en su sistema — los tres
  mundos habitados y los dos telares orbitales — porque bloquean su expansión hacia un cúmulo rico.
- **Qué dan por adelantado**: el **maniobrador de cursor** (vuelo por ratón: a más distancia de la
  retícula, más giro; roll sigue en Q/E), giroscopios retensados (+56 % de giro) y el glifo
  **Void Kinesis** con su uso quirúrgico: **drenar la void mass de un planeta hasta hacerlo
  desaparecer**. Y sintonizan el rito hacia el sistema tejedor.
- **Qué dan al volver**: +5 % de memoria, el glifo **Void Cocoon**, su tienda (misiles y anclajes) y
  la **senda de Yig**: sintonizar el rito hacia el sistema natal de la gran raza que guarda el warp
  a las dimensiones donde residen los primigenios.

## 12. Los Tejedores arácnidos (antagonistas)

Colonias de arácnidos del vacío que hilan **estaciones-telaraña** entre sus mundos. No conversan:
vibran. Neutrales hasta el primer disparo; desde entonces sus **cazas** salen del hilo en oleadas
mientras quede un telar vivo. Venden a cualquiera con carga que pese (minas-drone, "huevos que
muerden") y pagan por traición: un mundo Mi-Go a cambio de precio. No comercian con memoria.

Se comieron a los tres emisarios Mi-Go y tejieron con las alas.

## 13. La gran raza de Yig (gancho)

Serpientes anteriores a casi todo. Su sistema natal guarda un **warp plegado en el aire** que cruza
hacia las dimensiones donde residen los primigenios — el camino del enfrentamiento final. Hoy
duermen: el mundo entero respira despacio y las piedras se orientan hacia el visitante. Su fase (el
warp, su encargo, su historia) está por escribir.

## 14. Hilos abiertos (para crecer)

- ¿Qué quería Yog-Sothoth ABRIENDO la puerta, además de humillar a Cthulhu? (La palanca sigue viva.)
- ¿Quedan supervivientes humanos? ¿La estación tiene una IA/bitácora que hable con el PJ?
- El despertar de Yig y el warp: ¿qué precio piden las serpientes?
- Las burbujas de Yog-Sothoth como encuentro jugable (boss): dañan todo objeto; el ser, en el centro.
- El arco de la **memoria**: ¿recuperarla del todo cambia quién es el PJ (otra vez)?
