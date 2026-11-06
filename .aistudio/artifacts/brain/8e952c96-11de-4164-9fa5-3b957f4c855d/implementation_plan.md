# Plan de Implementación: Motor WebGL de Humo Volumétrico Realista

Este plan reemplaza las partículas circulares 2D y los recortes estáticos por una **simulación fluida de humo volumétrico en tiempo real mediante WebGL (GLSL Fragment Shader con Domain-Warped Fractal Brownian Motion & Curl Turbulence)**.

---

## 1. Decisiones Confirmadas

1. **Apariencia Visual Realista**: Humo de vape blanco/plateado translúcido con filamentos, remolinos y pliegues orgánicos reales (cero círculos 2D, cero imágenes PNG/JPG recortadas), iluminado sutilmente por reflejos neón morados y cyan del ambiente callejero.
2. **Movimiento Natural**: El vapor nace desde la parte inferior y asciende suavemente por el fondo con turbulencia fluida continua sin tapar la legibilidad de los productos.
3. **Interacción en Vivo**:
   - Flujo ambiental continuo ajustable (`Suave` | `Intenso` | `Épico` y botón de ocultar/mostrar).
   - Exhalación densa ("¡Calada!") inyectada en tiempo real en el shader al agregar cualquier líquido o equipo vape al carrito (`vape-smoke-burst`) o al presionar el botón **¡CALADA! 💨**.

---

## 2. Arquitectura Técnica (`src/components/effects/SmokeOverlay.tsx`)

### 2.1 Simulación WebGL con Domain Warping (GLSL Shader)
En lugar de dibujar círculos o mover fotos estáticas, el `<canvas>` ejecuta un shader GLSL a 60 FPS que calcula la densidad física del vapor píxel por píxel:
- **Ruido Simplex / Perlin Multicapa (6 octavas)**: Genera la estructura fina de las hebras de humo.
- **Domain Warping de Doble Paso (`f(p + f(p + f(p)))`)**: Deforma el campo de velocidad sobre sí mismo para producir los rizos, vórtices y volutas característicos del humo real de vape al dispersarse en el aire.
- **Convección Térmica Ascendente**: El campo de coordenadas se desplaza verticalmente hacia arriba con velocidad variable y deriva lateral orgánica.
- **Iluminación Volumétrica**:
  - Color base de vapor blanco realista (`rgba(244, 246, 252)`).
  - Sombreado interno por gradiente de densidad y reflejos sutiles morados (`#a855f7`) y cyan (`#22d3ee`) en los bordes de las volutas.
- **Inyección de Calada (`u_burst` uniform)**:
  - Cuando el cliente agrega un producto o pulsa **¡CALADA! 💨**, el uniforme `u_burst` impulsa una columna ascendente de vapor denso desde la base de la pantalla que se expande y se disipa gradualmente en el flujo ambiental.

---

## 3. Archivos a Modificar

- **`src/components/effects/SmokeOverlay.tsx`**:
  - Implementar el motor WebGL GLSL de humo volumétrico con Domain Warping y soporte para el evento `'vape-smoke-burst'`, el selector de intensidad (`Suave`, `Intenso`, `Épico`) y el fondo de ladrillos con grafitis a color (`graffiti_brick_wall`).
