# Sistema de Autenticación por Roles y Reestructuración Estilo PedidosYa

Este plan describe la arquitectura y el rediseño de **VapeExpress Delivery** para incorporar autenticación diferenciada por roles (Compradores, Administrador y Repartidores creados por el admin), y reorganizar la experiencia de usuario inspirada en PedidosYa (con la Tienda como vista principal, el Mapa en una sección dedicada y barra de navegación intuitiva).

---

> [!IMPORTANT]
> **Decisiones Confirmadas:**
> 1. **Estructura Estilo PedidosYa:** La tienda será la pantalla principal de bienvenida; el mapa interactivo se ubica en su propia sección de navegación ("Mapa & Rastreo") y durante el checkout para fijar el destino.
> 2. **Autenticación del Comprador:** Ingreso rápido y sin fricción solicitando únicamente **Nombre Completo** y **Número de Teléfono**, con sesión recordada automáticamente.
> 3. **Administrador y Repartidores:** El Administrador ingresa con **Correo y Contraseña**. Desde su panel de control puede dar de alta nuevos repartidores asignándoles usuario, clave y teléfono para que estos inicien sesión en el módulo de Delivery.

---

## 1. Visión General & Modelo de Roles

### 1.1 Matriz de Roles y Acceso

| Rol | Método de Acceso / Registro | Capacidades & Pantallas |
| :--- | :--- | :--- |
| **Comprador (Cliente)** | Nombre + Teléfono (registro/login rápido en 1 paso) | Catálogo de líquidos, elección de tanque lleno ($100) o mitad ($50), checkout con fijación de ubicación, pestaña de seguimiento en vivo con negociación inDrive ($25-$100), botón de llamada al delivery e historial. |
| **Administrador (Vendedor)** | Correo electrónico + Contraseña | Panel financiero (ventas hoy, mes, acumulado, ganancia neta líquida vs delivery), gestión de catálogo/costos, ubicación física de la tienda en mapa, y **creación/gestión de cuentas de repartidores**. |
| **Repartidor (Delivery)** | Usuario + Contraseña asignados por el Admin | Despacho activo, optimización de ruta multipedido trazada en mapa, cotización de tarifa por distancia ($25, $50, $75, $100), botón de llamada directa al cliente si no sale, y actualización de estado en tiempo real. |

---

## 2. Experiencia de Usuario & Flujos de Navegación (Estilo PedidosYa)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      VapeExpress Delivery (Header)                     │
│  [Logo / 18+]    [Local Físico]    [Usuario Activo / Rol]    [Salir]   │
├────────────────────────────────────────────────────────────────────────┤
│                      Barra de Pestañas Principal                       │
│  [🛍️ Tienda]    [🛵 Mapa & Rastreo]    [📋 Historial]    [⚙️ Gestión*]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                      ÁREA DE CONTENIDO PRINCIPAL                       │
│                                                                        │
│   • En pestaña "Tienda": Hero promocional de bienvenida, buscador/     │
│     categorías (Frutales, Mentolados, etc.), tarjetas de e-liquids     │
│     con selector Tanque Lleno ($100) / Mitad ($50) y barra de carrito. │
│                                                                        │
│   • En pestaña "Mapa & Rastreo": Mapa interactivo con ruta activa,     │
│     ubicación de tienda, repartidor en tiempo real, cotización         │
│     inDrive y llamadas directas.                                       │
│                                                                        │
│   • En pestaña "Gestión / Admin": Métricas financieras, creación de    │
│     repartidores, inventario y configuración de tienda física.         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Flujo del Comprador
1. **Acceso Ágil:** Modal o pestaña de identificación donde ingresa su Nombre y Teléfono. Queda recordado en el dispositivo.
2. **Exploración de Tienda:** Entra directamente a la tienda de líquidos; revisa fotos, niveles de nicotina y stock.
3. **Selección de Porciones:** Elige Tanque Lleno ($100) o Mitad ($50) y pulsa "Continuar al Pedido".
4. **Checkout con Mapa:** Selecciona en el mapa interactivo su punto exacto de entrega y confirma.
5. **Rastreo Automático:** Se le redirige fluidamente a la pestaña "Mapa & Rastreo" para esperar la cotización del repartidor ($25, $50, $75 o $100) y aprobar el recibo.

### 2.2 Flujo del Administrador
1. **Login Seguro:** Correo y clave.
2. **Módulo de Repartidores:** Formulario para registrar nuevo delivery (Nombre, Teléfono, Usuario, Contraseña). Lista de repartidores registrados con estado y botón de bloqueo/edición.
3. **Finanzas & Inventario:** Monitoreo de ingresos desglosados (ganancia de líquidos deduciendo costos unitarios vs. recaudación de delivery).

### 2.3 Flujo del Repartidor
1. **Login de Delivery:** Ingresa sus credenciales otorgadas por el admin.
2. **Centro de Despacho & Ruta Óptima:** Ve todos los pedidos simultáneos en el mapa, la ruta óptima calculada, cotiza la tarifa y puede llamar directamente al teléfono del comprador con el botón integrado.

---

## 3. Arquitectura Técnica & Persistencia

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Capa de Estado & Storage                        │
│                                                                        │
│  • authStore: Sesión activa (usuario actual, rol, token/identificador) │
│  • usersStore: Cuentas de Compradores, Admin y Repartidores creados    │
│  • catalogStore: Líquidos, categorías, fotos, costos y stock           │
│  • ordersStore: Pedidos en curso, historial, estados y cotizaciones    │
│  • syncChannel: BroadcastChannel ('vape_delivery_channel') reactivo    │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌────────────────────────┐
       │ Componentes de Autent. │       │   Vistas de Navegación │
       │ • LoginRegisterModal   │       │ • NavigationBar        │
       │ • BuyerAuthForm        │       │ • Tienda (Storefront)  │
       │ • AdminAuthForm        │       │ • MapaRastreoView      │
       │ • DriverAuthForm       │       │ • DeliveryHub          │
       │ • DriverManagementForm │       │ • AdminFinancesView    │
       └────────────────────────┘       └────────────────────────┘
```

### 3.1 Estructuras de Datos Adicionales
- **UserAccount**:
  ```ts
  interface UserAccount {
    id: string;
    role: 'comprador' | 'delivery' | 'admin';
    name: string;
    phone?: string;
    email?: string;
    username?: string;
    passwordHash?: string;
    createdAt: string;
  }
  ```

---

## 4. Plan de Ejecución por Pasos

1. **Gestor de Usuarios & Autenticación (`src/utils/auth.ts`)**:
   - Funciones para login de comprador (nombre + teléfono).
   - Funciones para login/registro de admin (correo + contraseña).
   - Funciones para que el admin registre repartidores (usuario + contraseña + datos).
   - Persistencia segura y sesión activa.

2. **Modal / Pantalla Unificada de Acceso (`src/components/auth/AuthModal.tsx`)**:
   - Pestañas claras: *Soy Comprador* (solo nombre y teléfono), *Repartidor* (usuario y contraseña) y *Administrador* (correo y contraseña).
   - Botón de cierre de sesión y cambio rápido de perfil.

3. **Reestructuración de la Interfaz Estilo PedidosYa (`src/components/Navigation.tsx` y `src/App.tsx`)**:
   - Barra superior con marca, estado del usuario y botón de login/perfil.
   - Pestañas de secciones:
     - 🛍️ **Tienda** (Presentación principal, sin abrumar con mapas de inicio).
     - 🛵 **Mapa & Rastreo** (Seguimiento del pedido activo o vista del delivery).
     - 📋 **Mis Pedidos** (Historial con repetir compra).
     - ⚙️ **Panel Admin** (Visible si el usuario logueado es administrador).
   - Enlace contextual: Al crear un pedido, transición automática de la Tienda al Mapa de Rastreo.

4. **Panel de Gestión de Repartidores para el Administrador**:
   - Nueva pestaña dentro del panel del vendedor para agregar repartidores con credenciales.

5. **Pruebas y Verificación Integral (Ultra Mode)**:
   - Verificación de compilación (`compile_applet`) y linter (`lint_applet`).
   - Pruebas en navegador con `playwright-cli` para verificar el flujo de login de cliente, navegación por pestañas estilo PedidosYa, cotización de delivery y panel de administración.
