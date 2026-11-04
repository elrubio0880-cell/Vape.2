# BLACK VAPE - Plataforma de Delivery de Líquidos en Tiempo Real

Plataforma web de pedidos y recarga de líquido de vapeo por delivery a domicilio para mayores de edad (+18), optimizada para **Colmado Noadia, Loma de Cabrera, República Dominicana**.

Diseñada con **React 19 + TypeScript + Vite + Tailwind CSS + Supabase (Postgres, Auth, Realtime, RLS) + Leaflet**.

---

## 🚀 1. Requisitos Previos

* **Node.js**: Versión 18 o superior (v20+ recomendada).
* **NPM**: Incluido con Node.
* **Proyecto en Supabase**: Cuenta gratuita en [supabase.com](https://supabase.com).

---

## 🔑 2. Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto basándote en `.env.example`:

```bash
# Variables Públicas para el Frontend de Vite
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-public-key"
```

> **⚠️ REGLA DE SEGURIDAD ESTRICTA**:  
> La `SUPABASE_SECRET_KEY` (o `service_role key`) **NUNCA** debe colocarse en el código ni en variables de frontend (`VITE_*`). El cliente web interactúa de manera 100% segura usando la `anon key` junto con las políticas de Row Level Security (RLS) y las funciones `SECURITY DEFINER` protegidas en PostgreSQL.

---

## 🗄️ 3. Configuración de Base de Datos en Supabase

### 3.1 Migración Principal (Delivery, Productos, Roles y Pedidos)
1. Entra a tu dashboard en [Supabase](https://supabase.com/dashboard) y abre tu proyecto.
2. En el menú lateral izquierdo, haz clic en **SQL Editor**.
3. Haz clic en **New query** (Nueva consulta).
4. Abre el archivo **`supabase_migration.sql`**, copia todo su contenido, pégalo y haz clic en **Run** (Ejecutar).

### 3.2 Migración del Club de Puntos, Canjes y Rifas (Fidelización)
1. En el mismo **SQL Editor**, crea una nueva consulta (**New query**).
2. Abre el archivo **`supabase/points_and_raffles_migration.sql`**, copia su contenido completo, pégalo y haz clic en **Run** (Ejecutar).

Esta segunda migración incorpora de forma atómica:
* Columna `points_balance` en `profiles`.
* Control de canjes en `store_config` (`points_per_redemption = 1000`, `redemptions_enabled = true`).
* Tablas con RLS: `point_transactions` (auditoría e idempotencia estricta), `redemptions` (solicitudes de llenadas gratis), `raffles` (sorteos) y `raffle_participants` (intervalos de boletos).
* Actualización de la función RPC `mark_order_delivered`: al entregar un pedido regular de un cliente registrado, calcula y acredita 1 punto por cada peso en líquido despachado (excluyendo el delivery).
* Funciones RPC protegidas (`SECURITY DEFINER`): `revert_delivered_order`, `request_redemption_secure`, `approve_redemption_admin`, `reject_or_cancel_redemption`, `adjust_user_points_admin`, `reset_user_points_admin`, `sync_raffle_participants_admin`, `execute_raffle_draw_admin`.

---

## 👤 4. Cómo Crear el Primer Administrador

El sistema permite que tú elijas tu propio correo y contraseña sin valores por defecto:

1. En tu panel de Supabase, ve a **Authentication** -> **Users**.
2. Haz clic en **Add User** -> **Create user**.
3. Ingresa tu correo electrónico personal y la contraseña que desees. Marca la casilla **Auto Confirm User** para no requerir confirmación por email.
4. Vuelve al **SQL Editor** y ejecuta la siguiente consulta para asignarte el rol de Administrador:

```sql
SELECT public.make_user_admin('tu-correo@ejemplo.com');
```

¡Listo! Ya puedes iniciar sesión en la app con este correo y contraseña para acceder al **Panel Administrador**.

---

## 💻 5. Comandos de Desarrollo y Pruebas

```bash
# Instalar dependencias
npm install

# Correr en servidor de desarrollo local
npm run dev

# Ejecutar la suite completa de pruebas unitarias
npx tsx --test src/utils/*.test.ts

# Validar sintaxis y TypeScript
npm run lint

# Compilar para producción
npm run build
```

---

## 🌐 6. Despliegue en Producción

### Opción A: Despliegue en Vercel (Recomendado)

1. Sube tu código a un repositorio de GitHub o GitLab.
2. Inicia sesión en [vercel.com](https://vercel.com) y selecciona **Add New Project**.
3. Importa tu repositorio.
4. En **Framework Preset**, Vercel detectará automáticamente **Vite**.
5. En la sección **Environment Variables**, añade:
   * `VITE_SUPABASE_URL`: Tu URL de Supabase (ej: `https://alwxeeyozlxfuysxhzay.supabase.co`).
   * `VITE_SUPABASE_ANON_KEY`: Tu clave pública publishable/anon (ej: `sb_publishable_...`).
6. En **Build Command**: `npm run build`
7. En **Output Directory**: `dist`
8. Haz clic en **Deploy**.
9. *Soporte SPA Routing*: Crea o verifica un archivo `vercel.json` con reescritura hacia `/index.html`:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```

### Opción B: Despliegue en Netlify

1. Inicia sesión en [netlify.com](https://netlify.com) y elige **Add new site** -> **Import an existing project**.
2. Conecta tu repositorio.
3. Configuración de Build:
   * **Build command**: `npm run build`
   * **Publish directory**: `dist`
4. En **Environment Variables**, añade:
   * `VITE_SUPABASE_URL`
   * `VITE_SUPABASE_ANON_KEY`
5. Crea un archivo `public/_redirects` con el siguiente contenido para SPA:
   ```
   /*    /index.html   200
   ```
6. Haz clic en **Deploy site**.

---

## 📋 7. Checklist Final de Puesta en Producción

- [x] **SSL / HTTPS Activo**: Tanto Vercel como Netlify aprovisionan certificados SSL automáticos (necesario para geolocalización GPS).
- [x] **Variables de Entorno**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` configuradas en la plataforma de hosting.
- [x] **Clave Secreta Oculta**: La clave `service_role` jamás debe configurarse en Vercel/Netlify.
- [x] **Base de Datos Migrada**: Ejecución completa de `supabase_migration.sql` sin errores.
- [x] **Primer Admin Creado**: Cuenta de admin verificada con `make_user_admin()`.
- [x] **Repartidores Registrados**: Creados desde el panel de admin con su usuario y contraseña.
- [x] **Bundle Optimizado**: Code-splitting activo con chunks menores a 500 kB e inicio en 139 kB.
- [x] **Cálculo de Tarifas en Servidor**: Tarifa mínima $25 DOP por cada 1.5 km calculada por Haversine en BD.

---

## 📱 8. Pruebas de Campo Recomendadas (Dos Celulares en la Calle)

Para certificar el funcionamiento en la vida real, realiza la siguiente prueba:

1. **Celular A (Cliente)**:
   * Abre la URL de producción por HTTPS.
   * Selecciona un sabor (ej. Pop Iced Big Apple, Tanque Lleno).
   * Ingresa nombre y teléfono dominicano (ej. 809...).
   * Permite el acceso a ubicación del navegador o toca el pin en el mapa donde te encuentras.
   * Envía la orden.

2. **Celular B (Repartidor)**:
   * Abre la URL de producción, toca **Entrar** e inicia sesión con las credenciales creadas por el admin (ej: `marcos_delivery`).
   * La app te dirigirá inmediatamente a **Rutas & Despacho**.
   * Verás la orden entrante con la distancia y la tarifa oficial calculada.
   * Acepta la orden y toca **Marcar En Camino**.
   * Activa el interruptor de GPS Real.
   * Muévete 100-200 metros por la calle: observa en el **Celular A** cómo la moto se desplaza en vivo sobre el mapa.
   * Al llegar a menos de 150 metros, el sistema avisará automáticamente la llegada al destino.
   * Realiza la recarga física en el tanque del vape del cliente.
   * Toca **Entregado & Cobrado** y confirma la entrega.
   * Verifica en el **Panel Administrador** que el stock se haya descontado automáticamente y las ventas se sumen a las ganancias del día.
