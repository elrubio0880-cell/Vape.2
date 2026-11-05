# Catálogo de Equipos Vape con Variantes de Color y Sugerencia Inmediata de Líquido (Cross-Sell)

Expansión de **BLACK VAPE** para vender equipos de vapeo (Vapes/Pods) con múltiples fotos asociadas a cada variante de color y stock independiente por color, complementado con un flujo automático de venta cruzada (*cross-sell*) que invita al cliente a elegir su líquido de recarga en el instante en que agrega un Vape a su pedido.

### User Review & Critical Decisions

> [!IMPORTANT]
> Se han confirmado las siguientes decisiones clave de producto para que la experiencia funcione igual que en las tiendas de vapeo online líderes:

- **Variantes con Foto y Stock Propio por Color**: Cada equipo Vape permite registrar múltiples variantes de color (ej. *Rojo*, *Verde*, *Azul*, *Negro*), donde cada variante tiene su propia fotografía optimizada y su cantidad disponible en inventario.
- **Sugerencia Inmediata de Líquido (Modal Cross-Sell)**: Apenas el cliente pulsa para agregar o pedir un equipo Vape, se abre una ventana emergente interactiva preguntándole qué sabor de líquido desea echarle a su nuevo Vape (Tanque Lleno o Mitad de Tanque), permitiéndole sumarlo con un solo toque o continuar solo con el equipo.
- **Navegación por Pestañas Principales en Tienda**: El catálogo principal se organiza en dos pestañas claras y directas: **Líquidos de Recarga** y **Equipos Vape**, permitiendo alternar al instante sin mezclar filtros.
- **Precio Fijo por Equipo y Acumulación en Club de Puntos**: Cada modelo de Vape maneja su costo de adquisición y un precio de venta único en pesos dominicanos (`DOP`), sumando puntos de fidelidad (1 punto por cada $1 DOP) al completarse la entrega.

---

### 1. Overview & Core Concept

- **What It Does**: Transforma la tienda actual de recargas en una tienda completa de vapeo donde el administrador puede publicar equipos Vape con galería interactiva por colores, y los clientes pueden elegir visualmente el color de su equipo, recibir al instante la recomendación para llenarlo con su líquido favorito y recibir todo en un mismo envío a domicilio.
- **Target Audience / Persona**:
  - **Clientes en Loma de Cabrera**: Usuarios que compran un equipo nuevo o de reemplazo desde su celular y necesitan tanto el dispositivo del color que les gusta como el líquido listo para usar al recibir al repartidor.
  - **Administradores de BLACK VAPE**: Gestión ágil desde celular o escritorio para subir fotos de cada color con compresión automática de imagen, controlar qué colores se están agotando y analizar ganancias combinadas (equipos + líquidos + delivery).
- **Key Value**: Aumenta el ticket promedio por pedido mediante la venta cruzada inmediata (*Vape + Recarga de Líquido*) y evita reclamos por colores agotados gracias al control de inventario individual por variante.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Exploración por Pestañas y Selección de Color (Cliente)**:
     - En la vista principal de **Tienda**, el cliente ve un selector superior de dos secciones: **Líquidos de Recarga** y **Equipos Vape**.
     - Al entrar a **Equipos Vape**, cada tarjeta muestra la foto en alta definición del color seleccionado actualmente, el nombre del modelo, su precio fijo en `DOP`, el stock disponible de ese color y los botones circulares/etiquetas de colores (*Rojo*, *Verde*, *Azul*, etc.).
     - Al tocar otro color en la tarjeta, la imagen principal del Vape cambia instantáneamente a la foto de ese color y actualiza el indicador de unidades disponibles.
  2. **Sugerencia Inmediata de Líquido (Cross-Sell en 1 Toque)**:
     - Cuando el cliente pulsa **Agregar Vape** (o **Pedir Ahora**), el equipo con el color elegido se añade al pedido y se despliega de inmediato la ventana **¿Le echamos líquido a tu nuevo Vape?**.
     - En esa ventana el cliente ve los sabores de líquido disponibles con selector rápido de **Tanque Lleno ($100)** o **Mitad ($50)**.
     - Si elige un sabor, el líquido se suma automáticamente junto al Vape y pasa directo al carrito/confirmación de ubicación; si prefiere solo el equipo, toca **Solo quiero el Vape por ahora**.
  3. **Creación y Edición de Vapes con Variantes (Administrador)**:
     - En el **Panel Administrador → Inventario**, al pulsar **Nuevo Producto**, el administrador elige el tipo: **Líquido de Recarga** o **Equipo Vape**.
     - Si selecciona **Equipo Vape**, ingresa el nombre del modelo, descripción, costo de compra y precio de venta, y accede al bloque **Variantes de Color e Imágenes**.
     - Allí puede añadir tantas variantes como desee (ej. *Rojo*, *Verde*, *Morado*), subir la foto de cada color (comprimida automáticamente a WebP ligero para no saturar la memoria) y definir cuántas unidades hay de cada color.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Streetwear & Urban Retail oscuro de alto contraste, manteniendo la identidad visual de **BLACK VAPE** con superficies limpias y foco protagonista en la fotografía del producto ($65\%\text{--}75\%$ de la altura de la tarjeta).
  - *Color Palette & Mood*: Lienzo profundo `#08050e`, superficies estructurales en `#110c1d` con bordes sutiles, acentos de acción en púrpura real (`#9333ea`) y verde esmeralda (`#10b981`) para confirmaciones de compra, más muestras de color reales (*swatches*) para cada variante del Vape.
  - *Typography & Hierarchy*: Encabezados en `Urbanist` SemiBold/Black con proporción equilibrada, etiquetas limpias sin saturación de cápsulas y precios alineados con números tabulares (`tabular-nums`).
  - *Component Styling & Layout*: Cuadrícula de 3 columnas en escritorio y 1–2 columnas en móvil con espaciado generoso, selectores táctiles de color de mínimo `44px` de área interactiva en móvil y transiciones suaves de imagen.

- **Interactive Feedback & Motion**:
  - Cambio instantáneo de fotografía (`150ms` de transición de opacidad) al tocar cada color del Vape.
  - Desactivación automática de colores con stock en `0` mostrando etiqueta clara de *Agotado* sin bloquear los demás colores disponibles del mismo modelo.
  - Confirmación visual y sonora al combinar el Vape con su recarga de líquido en el modal de sugerencia.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Inventario Independiente por Variante con Totalizador Automático**
  - *Chosen Approach*: Cada color dentro de un Vape almacena su propio `stockUnits` y su propia `imageUrl`, mientras que el stock general del equipo se calcula automáticamente como la suma del stock de todos sus colores activos.
  - *Why*: Permite saber con exactitud cuántos *Vape Puff Rojos* quedan frente a cuántos *Verdes*, descontando del color exacto cuando el repartidor entrega el pedido.
  - *Alternatives Considered*: Manejar un solo stock global para todos los colores, lo cual fue descartado porque impediría saber si un color específico ya se agotó.

- **Decision 2: Ventana Emergente de Venta Cruzada (Cross-Sell) No Intrusiva**
  - *Chosen Approach*: Abrir un selector visual rápido de líquidos justo al agregar un Vape, con botones de 1 toque para agregar *Tanque Lleno* o *Mitad* y un botón claro para omitir.
  - *Why*: Replica el comportamiento natural de compra en tienda física ("¿Con qué sabor te lo lleno?") maximizando las ventas de líquido sin obligar al cliente si solo desea comprar el dispositivo.
  - *Alternatives Considered*: Mostrar un aviso pequeño dentro del carrito, descartado porque muchos clientes usan el botón de compra rápida o WhatsApp directo y no pasarían por una revisión detallada del carrito.

- **Decision 3: Compatibilidad Transparente con Base de Datos y Nube**
  - *Chosen Approach*: Sincronizar las variantes de color y el tipo de producto tanto en almacenamiento local como en Supabase codificando de forma transparente los metadatos de variantes y manteniendo total compatibilidad con las restricciones de la tabla de pedidos y productos.
  - *Why*: Garantiza que los equipos Vape creados por el administrador aparezcan en todos los celulares al instante sin errores de esquema ni pérdida de datos al recargar la página.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     CAPA DE DATOS Y PERSISTENCIA                         │
│  ┌──────────────────────────────┐    ┌────────────────────────────────┐  │
│  │ Catálogo Híbrido (Local+DB)  │    │ Órdenes, Finanzas y Puntos     │  │
│  │ • Tipo: 'liquido' | 'vape'   │◄──►│ • Descuento de stock por color │  │
│  │ • Variantes: Color+Foto+Stock│    │ • Cálculo de ganancia y puntos │  │
│  └──────────────┬───────────────┘    └───────────────▲────────────────┘  │
└─────────────────┼────────────────────────────────────┼───────────────────┘
                  │                                    │
                  ▼                                    │
┌──────────────────────────────────────────────────────┼───────────────────┐
│                     FLUJO DE TIENDA Y ADMINISTRACIÓN │                   │
│                                                      │                   │
│  ┌──────────────────────────────┐    ┌───────────────┴────────────────┐  │
│  │ Panel Admin (Inventario)     │    │ Catálogo Principal por Pestañas│  │
│  │ • Selector: Líquido vs Vape  │    │ • Tab 1: Líquidos de Recarga   │  │
│  │ • Gestor de Colores y Fotos  │    │ • Tab 2: Equipos Vape          │  │
│  │ • Compresión WebP por Color  │    │ • Selector interactivo de Color│  │
│  └──────────────────────────────┘    └───────────────┬────────────────┘  │
│                                                      │                   │
│                                      ┌───────────────▼────────────────┐  │
│                                      │ Modal Cross-Sell Inmediato     │  │
│                                      │ "¿Le echamos líquido al Vape?" │  │
│                                      │ • Elección rápida de Sabor     │  │
│                                      │ • Tanque Lleno / Mitad / Omitir│  │
│                                      └───────────────┬────────────────┘  │
│                                                      │                   │
│                                      ┌───────────────▼────────────────┐  │
│                                      │ Carrito, Checkout y WhatsApp   │  │
│                                      │ • Detalle de Color en Recibo   │  │
│                                      │ • Vista Repartidor con Foto    │  │
│                                      └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Variante de Vape (`VapeVariant`)**: Identificador único, nombre del color (`colorName`), código de color visual opcional (`colorHex`), imagen comprimida (`imageUrl`) y unidades disponibles (`stockUnits`).
  - **Producto Extendido (`Product`)**: Incorpora `productType` (`'liquido' | 'vape'`) y lista de `variants?: VapeVariant[]`. Para equipos Vape, el precio de venta del dispositivo se almacena en el campo de precio principal y el stock total refleja la suma de sus variantes.
  - **Ítem de Pedido (`OrderItem`)**: Incorpora `productType?: 'liquido' | 'vape'`, `variantId?: string`, `variantColor?: string` y `variantImage?: string` para que el carrito, el recibo de WhatsApp, el panel de repartidor y el descuento de inventario identifiquen exactamente qué color pidió el cliente.

- **Interactive Component & State Mapping**:
  - **Tarjetas de Equipos Vape**: Mantienen estado local del `selectedVariantId` (iniciando por defecto en el primer color con stock disponible). Al cambiar de color, actualizan la foto mostrada, el badge de stock y el color que se enviará al carrito.
  - **Modal de Sugerencia de Líquido (`VapeLiquidUpsellModal`)**: Se dispara automáticamente al añadir un Vape; recibe el equipo recién agregado y la lista de líquidos con stock activo (`productType !== 'vape' && stockUnits > 0`), permitiendo filtrar o elegir sabor y porción en un clic o cerrar para ir al carrito.
  - **Formulario de Variantes en Admin**: Permite agregar filas de color, elegir un color visual rápido (Rojo, Verde, Azul, Negro, Morado, Rosa, Dorado, Plata, etc.), subir su foto desde el celular/PC con compresión automática y ajustar el stock individual o reabastecer rápidamente (`+5` / `+10` unidades).
  - **Despacho y Finanzas**: En el panel del repartidor y en los mensajes de WhatsApp, los ítems de tipo Vape se muestran claramente como `Equipo Vape • Color: [Nombre]` diferenciándolos de las porciones de líquido (`Tanque Lleno` / `Mitad`), y al marcarse como entregado descuentan 1 unidad del color correspondiente y suman la ganancia neta (`precio venta - costo`) y los puntos del cliente.
