# Solución Definitiva de Ubicación GPS y Alertas de Distancia

Sistema integral para garantizar la precisión de la ubicación de los pedidos en Loma de Cabrera mediante calibración satelital obligatoria, mapa libre interactivo y notificaciones en tiempo real para repartidores y administradores ante detecciones de ubicaciones lejanas o IPs remotas.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Decisiones confirmadas por el usuario en la fase de clarificación interactiva:
> - **Calibración Satelital GPS Obligatoria**: Al abrir el checkout de pedido, se inicia y requiere el proceso de calibración de alta precisión mediante GPS por satélite (`enableHighAccuracy: true`, multi-muestra y cálculo de margen de error en metros), evitando falsas coordenadas de antenas ISP de Santo Domingo o Santiago.
> - **Mapa Libre y Directo sin Lista de Sectores**: Siguiendo la instrucción expresa del usuario, se retira la lista estática de sectores y atajos de puntos de referencia del checkout para mantener una interfaz limpia con mapa interactivo libre (arrastre de pin, zoom, toque directo) y geolocalización directa.
> - **Alertas de Ubicación Lejana en Delivery y Admin**: Si un pedido tiene una ubicación a más de 15 km de Loma de Cabrera o coordenadas de cabecera ISP, el sistema etiqueta el pedido y dispara alertas prioritarias visuales y sonoras en los paneles de Repartidor (`DeliveryDashboard`) y Administrador (`SellerDashboard`).

---

## 1. Overview & Core Concept

- **Problema**: En República Dominicana, las conexiones de datos móviles y fibra residencial de proveedores como Claro o Altice asignan IPs enrutadas en Santo Domingo o Santiago (>150 km de Loma de Cabrera). Al solicitar ubicación sin fijar satélite GPS, el navegador envía coordenadas erróneas de la antena central. Además, anteriormente el mapa caía sobre el mismo negocio (`19.41688, -71.61287`) o confundía al cliente.
- **Solución**:
  1. **Calibración Satelital en Tiempo Real**: Un modal/overlay interactivo con radar satelital que calibra la precisión (±15m a ±5m) antes de fijar la entrega, descartando lecturas de antena telefónica remota.
  2. **Mapa Libre sin Distracciones**: Vista de mapa Leaflet full-screen/modal limpia, con arrastre fluido del pin de entrega, centrado natural en Loma de Cabrera y entrada de dirección escrita.
  3. **Sistema de Alerta a Delivery y Admin**: Los pedidos marcados como lejanos o sospechosos muestran una insignia de advertencia ("⚠️ Pedido a 180 km - Posible IP de Santo Domingo") con acción rápida de contacto por WhatsApp para confirmar la dirección real en Loma de Cabrera antes de despachar.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Flujo de Checkout del Cliente**:
   - El cliente pulsa "Pedir Recarga" en el catálogo.
   - Se abre el modal con el mapa libre y un botón prominente: **"🛰️ Calibrar mi Ubicación GPS"**.
   - Al pulsar o al iniciar, una animación de radar satelital muestra el estado: *"Buscando satélites... Precisión actual: ±12m"*.
   - Al alcanzar la precisión óptima, el pin se sitúa en la posición exacta del cliente en Loma de Cabrera con feedback táctil/sonoro.
   - El cliente puede arrastrar el pin si desea ajustar la puerta o entrada exacta de su casa.
   - Si la señal es rechazada o fuera de rango, se notifica claramente y se le permite colocar el pin manualmente en el mapa.

2. **Flujo de Recepción en Delivery y Administrador**:
   - Cuando entra un pedido cuya distancia supera los 15 km de Loma de Cabrera, se reproduce un sonido de alerta especial.
   - En la lista de pedidos pendientes, la tarjeta del pedido resalta con borde ámbar y una insignia de advertencia: *"⚠️ Ubicación fuera de zona (a XX km)"*.
   - El repartidor o admin puede presionar un botón de 1 toque: *"Consultar dirección por WhatsApp"* con mensaje predeterminado para solicitar la ubicación compartida de WhatsApp del cliente.

### Visual Identity & Theme Tokens

- **Aesthetic Direction**: Interfaz nocturna de alta gama en tonos grafito oscuro (`#0a0a0c`, `#121217`) con acentos violeta/púrpura eléctrico (`#8b5cf6`, `#7c3aed`) y ámbar de advertencia (`#f59e0b`).
- **Tipografía**: `Plus Jakarta Sans` para titulares limpios y números tabulares (`tabular-nums`) para coordenadas y distancias.
- **Sin Elementos de Relleno**: Eliminación de chips de sectores innecesarios; espacio visual optimizado para el visor del mapa.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Eliminar pestaña de Sectores vs. Mantenerla**:
  - *Enfoque*: Se remueve completamente la lista/pestaña de sectores preconfigurados conforme a la respuesta del usuario: *"No, usar unicamente el mapa libre y GPS directo"*.
  - *Razón*: Elimina fricción visual y confusión, permitiendo que el usuario interactúe directamente con el mapa o calibre con su GPS real.
- **Decisión 2: Política ante Ubicaciones Lejanas**:
  - *Enfoque*: En lugar de bloquear la orden de forma rígida (lo que impediría comprar a clientes con bloqueos de GPS), se permite el envío pero se etiqueta con `isRemoteLocation: true` y se notifica inmediatamente a los paneles de Delivery y Admin.
  - *Razón*: El negocio no pierde ventas, y el repartidor/administrador recibe la alerta inmediata para comunicarse con el cliente antes de despachar.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT CHECKOUT                               │
│  ┌─────────────────────────┐         ┌───────────────────────────────┐ │
│  │  HighAccuracyGPS Engine │ ──────> │ MapView (Leaflet Free Map)    │ │
│  │  (Satellite Calibration)│         │ - Draggable Pin               │ │
│  └─────────────────────────┘         │ - Address input & geocode     │ │
│                 │                    └──────────────┬────────────────┘ │
│                 ▼                                   ▼                  │
│       Order Payload { location, isRemoteLocation, distanceKm }         │
└─────────────────────────────────────┬──────────────────────────────────┘
                                      │
                         Supabase / Local Storage Sync
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        ▼                                                           ▼
┌────────────────────────────────┐         ┌────────────────────────────────┐
│      SELLER DASHBOARD          │         │      DELIVERY DASHBOARD        │
│  - Remote Location Alert Banner│         │  - High-visibility Warning Tag │
│  - WhatsApp direct confirm CTA │         │  - Distance indicator (km)     │
│  - Filter / Flag order state   │         │  - Sound notification          │
└────────────────────────────────┘         └────────────────────────────────┘
```

### Data Model Updates

En `src/types/index.ts`:
- Agregar a la interfaz `Order`:
  - `isRemoteLocation?: boolean;`
  - `detectedRegion?: string;`
  - `locationAccuracyMeters?: number;`

### Interactive Component & State Mapping

1. **`src/utils/geocoding.ts`**:
   - Reforzar `getHighAccuracyGPS` con algoritmo de multi-muestreo (al menos 3 lecturas consecutivas de `navigator.geolocation.watchPosition` filtrando lecturas con precisión `accuracy > 80m`).
   - Retener `detectLocationIssue` para marcar distancias mayores a 15 km de Loma de Cabrera como `isSuspicious = true`.

2. **`src/components/client/OrderCheckoutModal.tsx`**:
   - Remover pestañas de sectores y lista de lugares predefinidos.
   - Dejar el mapa en formato expansivo e interactivo, con buscador de calles y botón destacado de "Calibrar GPS Satelital".
   - Al completar la calibración satelital, animar el mapa directamente a la coordenada con zoom de precisión (nivel 17).
   - Enviar en el objeto `newOrder` la propiedad `isRemoteLocation` y `distanceKm`.

3. **`src/components/seller/SellerDashboard.tsx` & `src/components/delivery/DeliveryDashboard.tsx`**:
   - Mostrar indicador de advertencia visible en la tarjeta del pedido si `o.isRemoteLocation` es verdadero o si `distanceKm > 15`.
   - Botón directo de WhatsApp: *"Hola [Nombre], vemos que tu GPS marcó una ubicación fuera de Loma de Cabrera. ¿Podrías confirmarnos tu dirección exacta o compartirnos tu ubicación actual por WhatsApp?"*.
