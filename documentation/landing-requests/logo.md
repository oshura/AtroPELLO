# Logo AtroPELLO — Referencia rápida

- **Formato base**: cuadrado de 46×46 px, radios de 16 px y gradiente radial naranja→vino (`radial-gradient(circle at 30% 30%, #ff8c5c, #1d0c29)`). Safe zone mínima: 8 px alrededor del bloque para evitar colisiones con otros elementos.
- **Elementos internos** (proporciones relativas al contenedor):
  - **Spark** (26% del alto): círculo de 12 px `#64ffd3`, glow `box-shadow: 0 0 18px rgba(100, 255, 211, 0.8)`, ubicado a 8 px del borde izquierdo y superior.
  - **Orbit** (78%): circunferencia de 36 px con borde discontinuo `rgba(255, 255, 255, 0.3)`, centrada respecto al cuadrado.
  - **Core** (195% del ancho): rectángulo de 90×20 px `rgba(255, 255, 255, 0.15)` rotado -25°, anclado 30 px desde la parte superior y -10 px en X para simular un haz.
- **Tipografía y copy**:
  - `span`: “AtroPELLO Games”, 1.2 rem, peso 600, letter-spacing 0.04 rem.
  - `small`: “Sello independiente para juegos y prototipos amateur o indie, con acompañamiento técnico.”, 0.65 rem, letter-spacing 0.08 rem, color `rgba(255, 255, 255, 0.7)`.
  - Espaciado entre marca y copy: 0.75 rem. Mantener alineación vertical centrada.
- **Composición**: la marca y la copia viven en un ancla flexible (`display: flex`), con la copia en columna. Mantener un gap de 0.75 rem respecto a la navegación y permitir que el contenedor del logo sea de al menos 420 px antes de que la navegación salte a la siguiente fila.
- **Proceso para recrear el logo en otros formatos**:
  1. Dibujar el bloque base de 46×46 px con el gradiente indicado y aplicar el borde `rgba(255, 255, 255, 0.2)`.
  2. Posicionar los tres elementos internos respetando las proporciones anteriores (spark arriba a la izquierda, orbit centrado, core rotado -25° cruzando la parte inferior).
  3. Añadir la copia tipográfica usando las fuentes del sistema (equivalente a `font-weight: 600` para el `span` y regular para el `small`).
  4. Respetar la safe zone de 8 px alrededor del conjunto y mantener el gap de 0.75 rem frente al resto de componentes del header.
  5. Para versiones vectoriales, convertir el spark en un círculo con blur gaussiano, la orbit en un trazo punteado y el core en un rectángulo con opacidad 15%.
- Esta guía debe acompañar cualquier exportación (SVG, PNG, manual de marca) para asegurar consistencia en proporciones, colores y tagline.