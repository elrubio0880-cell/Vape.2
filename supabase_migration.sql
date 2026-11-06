-- ==============================================================================
-- BLACK VAPE DELIVERY - MIGRACIÓN OFICIAL COMPLETA PARA SUPABASE
-- Plataforma de pedidos de líquidos y equipos vape con delivery en tiempo real
-- Regla de negocio: 1.5 km = $25 DOP (Haversine en servidor)
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. FUNCIONES MATEMÁTICAS Y DE NEGOCIO (EN SERVIDOR)
-- ==============================================================================

-- Cálculo Haversine de distancia geodésica en kilómetros entre dos coordenadas
CREATE OR REPLACE FUNCTION public.haversine_distance_km(
  lat1 numeric,
  lon1 numeric,
  lat2 numeric,
  lon2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r constant numeric := 6371.0; -- Radio medio terrestre en km
  dlat numeric;
  dlon numeric;
  a numeric;
  c numeric;
  pi constant numeric := 3.14159265358979323846;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN 0.0;
  END IF;

  dlat := ((lat2 - lat1) * pi) / 180.0;
  dlon := ((lon2 - lon1) * pi) / 180.0;

  a := sin(dlat / 2.0) * sin(dlat / 2.0) +
       cos((lat1 * pi) / 180.0) * cos((lat2 * pi) / 180.0) *
       sin(dlon / 2.0) * sin(dlon / 2.0);

  c := 2.0 * atan2(sqrt(a), sqrt(greatest(0.0, 1.0 - a)));

  -- Redondeo oficial a 2 decimales
  RETURN round(r * c, 2);
END;
$$;

-- Regla de negocio de la tarifa de delivery:
-- Tarifa = GREATEST(1, CEIL(distanciaKm / 1.5)) * 25
-- Hasta 1.5 km inclusive: $25 DOP
-- 1.51 km a 3.0 km: $50 DOP
-- 3.01 km a 4.5 km: $75 DOP
CREATE OR REPLACE FUNCTION public.calculate_delivery_fee(distance_km numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (GREATEST(1, CEIL(GREATEST(0.0, distance_km) / 1.5)::integer) * 25)::numeric;
$$;

-- ==============================================================================
-- 3. TABLAS DEL SISTEMA
-- ==============================================================================

-- 3.1 Perfiles de Usuario (Extensión de auth.users con roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'comprador' CHECK (role IN ('admin', 'delivery', 'comprador')),
  name text NOT NULL,
  phone text,
  username text UNIQUE,
  points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 Catálogo de Productos (Líquidos y Equipos Vape con Variantes JSONB)
CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  name text NOT NULL,
  product_type text NOT NULL DEFAULT 'liquido' CHECK (product_type IN ('liquido', 'vape')),
  flavor_category text NOT NULL,
  nicotine_mg integer NOT NULL DEFAULT 0,
  image_url text NOT NULL,
  stock_units integer NOT NULL DEFAULT 0 CHECK (stock_units >= 0),
  cost_price numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
  price_full_tank numeric(10,2) NOT NULL DEFAULT 100.00 CHECK (price_full_tank > 0),
  price_half_tank numeric(10,2) NOT NULL DEFAULT 50.00 CHECK (price_half_tank > 0),
  description text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Asegurar columnas nativas si la tabla products ya existía
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'liquido' CHECK (product_type IN ('liquido', 'vape')),
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3.3 Configuración de la Tienda / Local Físico (Fila Única id=1)
CREATE TABLE IF NOT EXISTS public.store_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'BLACK VAPE • Colmado Noadia',
  address_text text NOT NULL DEFAULT 'Colmado Noadia, C98P+QVV, Loma de Cabrera',
  latitude numeric(10,7) NOT NULL DEFAULT 19.41688,
  longitude numeric(10,7) NOT NULL DEFAULT -71.61287,
  phone text NOT NULL DEFAULT '8092104901',
  whatsapp text NOT NULL DEFAULT '8092104901',
  bank_account_info text NOT NULL DEFAULT 'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901',
  is_open boolean NOT NULL DEFAULT true,
  points_per_redemption integer NOT NULL DEFAULT 1000 CHECK (points_per_redemption > 0),
  redemptions_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4 Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
  id text PRIMARY KEY, -- Formato 'ORD-XXX' o uuid
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address_note text,
  destination_lat numeric(10,7) NOT NULL,
  destination_lng numeric(10,7) NOT NULL,

  -- Finanzas y tarifas
  subtotal_liquid numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (subtotal_liquid >= 0),
  liquid_cost_total numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (liquid_cost_total >= 0),
  calculated_distance_km numeric(6,2) NOT NULL DEFAULT 0.00 CHECK (calculated_distance_km >= 0),
  calculated_delivery_fee numeric(10,2) NOT NULL DEFAULT 25.00 CHECK (calculated_delivery_fee >= 25),
  proposed_delivery_fee numeric(10,2),
  final_delivery_fee numeric(10,2) NOT NULL DEFAULT 25.00 CHECK (final_delivery_fee >= 0),
  total_amount numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),

  -- Estados
  status text NOT NULL DEFAULT 'pendiente_cotizacion' CHECK (
    status IN (
      'pendiente_cotizacion',
      'tarifa_propuesta',
      'aprobado_en_preparacion',
      'en_camino',
      'llegada_a_destino',
      'entregado',
      'cancelado'
    )
  ),

  -- Repartidor asignado (Bloqueo atómico)
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  driver_name text,

  -- Pagos, canjes y notas
  order_type text NOT NULL DEFAULT 'regular' CHECK (order_type IN ('regular', 'canje')),
  points_redeemed integer NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  redemption_id uuid,
  payment_method text NOT NULL DEFAULT 'efectivo' CHECK (payment_method IN ('efectivo', 'transferencia', 'tarjeta')),
  cash_given numeric(10,2),
  change_due numeric(10,2),
  special_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5 Ítems del Pedido (Order Items)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_type text NOT NULL DEFAULT 'liquido' CHECK (product_type IN ('liquido', 'vape')),
  variant_id text,
  variant_color text,
  variant_image text,
  portion text NOT NULL CHECK (portion IN ('tanque_lleno', 'mitad')),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  cost_price numeric(10,2) NOT NULL DEFAULT 0.00 CHECK (cost_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0)
);

-- Asegurar columnas y llave foránea ON DELETE SET NULL en order_items si ya existía
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'liquido' CHECK (product_type IN ('liquido', 'vape')),
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS variant_color text,
  ADD COLUMN IF NOT EXISTS variant_image text;

DO $$
BEGIN
  ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;
  ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_unit_price_check;
  ALTER TABLE public.order_items ADD CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3.6 Ubicación en Vivo de Repartidores (Driver Locations)
CREATE TABLE IF NOT EXISTS public.driver_locations (
  driver_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  heading numeric(5,2),
  speed_kmh numeric(5,2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 Historial de Cambios de Estado (Order Status History)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. ÍNDICES DE RENDIMIENTO
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON public.orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_updated_at ON public.driver_locations(updated_at DESC);

-- ==============================================================================
-- 5. FUNCIONES AUXILIARES DE ROL Y SEGURIDAD
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_driver()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'delivery' AND is_active = true
  );
$$;

-- Trigger para crear perfil automáticamente al registrar usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_name text;
  v_phone text;
  v_username text;
  v_clean_email text;
BEGIN
  v_clean_email := lower(trim(COALESCE(new.email, '')));
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'comprador');

  -- Cuentas administradoras principales autorizadas siempre reciben rol 'admin'
  IF v_clean_email IN ('noadiasclaribel.y2k@icloud.com', 'elrubio0880.0@gmail.com') THEN
    v_role := 'admin';
  ELSIF v_role = 'admin' AND NOT public.is_admin() THEN
    v_role := 'comprador';
  ELSIF v_role NOT IN ('comprador', 'delivery', 'admin') THEN
    v_role := 'comprador';
  END IF;

  v_name := COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Usuario');
  v_phone := new.raw_user_meta_data->>'phone';
  v_username := new.raw_user_meta_data->>'username';

  INSERT INTO public.profiles (id, role, name, phone, username, is_active)
  VALUES (new.id, v_role, v_name, v_phone, v_username, true)
  ON CONFLICT (id) DO UPDATE
  SET role = CASE
        WHEN v_clean_email IN ('noadiasclaribel.y2k@icloud.com', 'elrubio0880.0@gmail.com') THEN 'admin'
        ELSE profiles.role
      END,
      name = EXCLUDED.name,
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      username = COALESCE(EXCLUDED.username, profiles.username),
      updated_at = now();

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    new.role := old.role;
    new.is_active := old.is_active;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- ==============================================================================
-- 6. RPC: CREACIÓN SEGURA DE PEDIDOS (Cálculo de Precios, Variantes y Distancia)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_order_id text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address_note text,
  p_destination_lat numeric,
  p_destination_lng numeric,
  p_payment_method text,
  p_cash_given numeric,
  p_special_notes text,
  p_items jsonb -- Arreglo: [{ product_id, portion, quantity, product_type, variant_id, variant_color, variant_image }]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_store public.store_config%ROWTYPE;
  v_item jsonb;
  v_prod public.products%ROWTYPE;
  v_item_unit_price numeric;
  v_item_cost_price numeric;
  v_item_subtotal numeric;
  v_subtotal_liquid numeric := 0.00;
  v_liquid_cost_total numeric := 0.00;
  v_distance_km numeric;
  v_delivery_fee numeric;
  v_total_amount numeric;
  v_change_due numeric := NULL;
  v_item_portion text;
  v_item_quantity integer;
  v_item_type text;
  v_variant_id text;
  v_variant_color text;
  v_variant_image text;
  v_clean_phone text;
BEGIN
  -- 1. Validaciones de entrada en servidor
  IF p_order_id IS NULL OR length(trim(p_order_id)) < 3 THEN
    p_order_id := 'ORD-' || floor(100 + random() * 900)::text;
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio y debe tener al menos 2 caracteres.';
  END IF;

  -- Validación de teléfono dominicano (809, 829, 849 con 10 dígitos)
  v_clean_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g');
  IF length(v_clean_phone) = 11 AND v_clean_phone LIKE '1%' THEN
    v_clean_phone := substr(v_clean_phone, 2);
  END IF;

  IF length(v_clean_phone) <> 10 OR (v_clean_phone NOT LIKE '809%' AND v_clean_phone NOT LIKE '829%' AND v_clean_phone NOT LIKE '849%') THEN
    RAISE EXCEPTION 'El teléfono del cliente debe ser un número dominicano válido (809, 829 o 849 con 10 dígitos).';
  END IF;

  IF p_destination_lat IS NULL OR p_destination_lng IS NULL OR p_destination_lat = 0 OR p_destination_lng = 0
     OR p_destination_lat < -90 OR p_destination_lat > 90 OR p_destination_lng < -180 OR p_destination_lng > 180 THEN
    RAISE EXCEPTION 'La ubicación de entrega (coordenadas GPS) es inválida.';
  END IF;

  IF p_payment_method NOT IN ('efectivo', 'transferencia', 'tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido. Debe ser efectivo, transferencia o tarjeta.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
  END IF;

  -- 2. Obtener coordenadas del local central
  SELECT * INTO v_store FROM public.store_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Configuración de tienda no encontrada.';
  END IF;

  -- 3. Calcular distancia Haversine y tarifa oficial en servidor
  v_distance_km := public.haversine_distance_km(
    v_store.latitude,
    v_store.longitude,
    p_destination_lat,
    p_destination_lng
  );
  v_delivery_fee := public.calculate_delivery_fee(v_distance_km);

  -- 4. Validar productos, porciones, stock e importes desde la tabla 'products'
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_portion := COALESCE(v_item->>'portion', 'tanque_lleno');
    v_item_quantity := (v_item->>'quantity')::integer;

    IF v_item_quantity IS NULL OR v_item_quantity <= 0 THEN
      RAISE EXCEPTION 'La cantidad de cada producto debe ser mayor a 0.';
    END IF;

    IF v_item_portion NOT IN ('tanque_lleno', 'mitad') THEN
      RAISE EXCEPTION 'Porción inválida: debe ser tanque_lleno o mitad.';
    END IF;

    SELECT * INTO v_prod FROM public.products WHERE id = (v_item->>'product_id') AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto con ID % no encontrado o inactivo.', v_item->>'product_id';
    END IF;

    IF v_prod.stock_units < v_item_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente para %: solo quedan % unidades.', v_prod.name, v_prod.stock_units;
    END IF;

    IF v_prod.product_type = 'vape' OR v_item_portion = 'tanque_lleno' THEN
      v_item_unit_price := v_prod.price_full_tank;
    ELSE
      v_item_unit_price := v_prod.price_half_tank;
    END IF;

    v_item_cost_price := v_prod.cost_price;
    v_item_subtotal := v_item_unit_price * v_item_quantity;

    v_subtotal_liquid := v_subtotal_liquid + v_item_subtotal;
    v_liquid_cost_total := v_liquid_cost_total + (v_item_cost_price * v_item_quantity);
  END LOOP;

  v_total_amount := v_subtotal_liquid + v_delivery_fee;

  IF p_payment_method = 'efectivo' AND p_cash_given IS NOT NULL AND p_cash_given >= v_total_amount THEN
    v_change_due := p_cash_given - v_total_amount;
  END IF;

  -- 5. Insertar encabezado del pedido
  INSERT INTO public.orders (
    id,
    customer_id,
    customer_name,
    customer_phone,
    delivery_address_note,
    destination_lat,
    destination_lng,
    subtotal_liquid,
    liquid_cost_total,
    calculated_distance_km,
    calculated_delivery_fee,
    proposed_delivery_fee,
    final_delivery_fee,
    total_amount,
    status,
    payment_method,
    cash_given,
    change_due,
    special_notes
  ) VALUES (
    p_order_id,
    auth.uid(),
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_delivery_address_note),
    p_destination_lat,
    p_destination_lng,
    v_subtotal_liquid,
    v_liquid_cost_total,
    v_distance_km,
    v_delivery_fee,
    v_delivery_fee,
    v_delivery_fee,
    v_total_amount,
    'pendiente_cotizacion',
    p_payment_method,
    p_cash_given,
    v_change_due,
    trim(p_special_notes)
  );

  -- 6. Insertar detalle de ítems (con soporte de Equipos Vape y colores)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_portion := COALESCE(v_item->>'portion', 'tanque_lleno');
    v_item_quantity := (v_item->>'quantity')::integer;
    v_variant_id := NULLIF(trim(COALESCE(v_item->>'variant_id', '')), '');
    v_variant_color := NULLIF(trim(COALESCE(v_item->>'variant_color', '')), '');
    v_variant_image := NULLIF(trim(COALESCE(v_item->>'variant_image', '')), '');

    SELECT * INTO v_prod FROM public.products WHERE id = (v_item->>'product_id');

    v_item_type := COALESCE(NULLIF(v_item->>'product_type', ''), v_prod.product_type, 'liquido');
    IF v_item_type NOT IN ('liquido', 'vape') THEN
      v_item_type := 'liquido';
    END IF;

    IF v_item_type = 'vape' OR v_item_portion = 'tanque_lleno' THEN
      v_item_unit_price := v_prod.price_full_tank;
    ELSE
      v_item_unit_price := v_prod.price_half_tank;
    END IF;

    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      product_type,
      variant_id,
      variant_color,
      variant_image,
      portion,
      unit_price,
      cost_price,
      quantity
    ) VALUES (
      p_order_id,
      v_prod.id,
      CASE
        WHEN v_variant_color IS NOT NULL AND position('(' in v_prod.name) = 0
        THEN format('%s (%s)', v_prod.name, v_variant_color)
        ELSE v_prod.name
      END,
      v_item_type,
      v_variant_id,
      v_variant_color,
      v_variant_image,
      v_item_portion,
      v_item_unit_price,
      v_prod.cost_price,
      v_item_quantity
    );
  END LOOP;

  -- 7. Registrar historial inicial
  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (
    p_order_id,
    'pendiente_cotizacion',
    format('Pedido creado en servidor. Distancia calculada: %s km. Tarifa oficial: $%s DOP.', v_distance_km, v_delivery_fee)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'distance_km', v_distance_km,
    'delivery_fee', v_delivery_fee,
    'subtotal_liquid', v_subtotal_liquid,
    'total_amount', v_total_amount
  );
END;
$$;

-- ==============================================================================
-- 7. RPC: ACEPTACIÓN ATÓMICA DE PEDIDOS (Evita doble toma entre repartidores)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.accept_order_atomic(
  p_order_id text,
  p_driver_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_driver public.profiles%ROWTYPE;
BEGIN
  -- Validar que el driver existe y tiene rol delivery
  SELECT * INTO v_driver FROM public.profiles WHERE id = p_driver_id AND role = 'delivery' AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repartidor no válido o inactivo.';
  END IF;

  -- Bloqueo atómico de la fila con FOR UPDATE
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado.', p_order_id;
  END IF;

  IF v_order.status IN ('entregado', 'cancelado') THEN
    RAISE EXCEPTION 'El pedido ya fue % y no puede ser aceptado.', v_order.status;
  END IF;

  IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> p_driver_id THEN
    RAISE EXCEPTION 'Este pedido ya fue tomado por otro repartidor (%s).', COALESCE(v_order.driver_name, 'otro');
  END IF;

  -- Asignar y cambiar a en_camino
  UPDATE public.orders
  SET driver_id = p_driver_id,
      driver_name = v_driver.name,
      status = 'en_camino',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (p_order_id, 'en_camino', format('Pedido asignado a repartidor %s y puesto en camino.', v_driver.name));

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'driver_id', p_driver_id,
    'driver_name', v_driver.name,
    'status', 'en_camino'
  );
END;
$$;

-- ==============================================================================
-- 8. RPCs DE ADMINISTRACIÓN DE CATÁLOGO Y PURGA DE PEDIDOS
-- ==============================================================================

-- 8.1 RPC: Eliminar un producto físicamente de la base de datos (Solo Admin)
CREATE OR REPLACE FUNCTION public.delete_product_admin(p_product_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo un administrador puede eliminar productos.';
  END IF;

  -- Desvincular referencias históricas para permitir borrado físico limpio
  UPDATE public.order_items SET product_id = NULL WHERE product_id = p_product_id;
  UPDATE public.redemptions SET product_id = NULL WHERE product_id = p_product_id;

  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_id', p_product_id
  );
END;
$$;

-- 8.2 RPC: Purgar pedidos de prueba (Solo Admin autenticado)
CREATE OR REPLACE FUNCTION public.clear_test_orders_admin()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo un administrador autenticado puede purgar los pedidos.';
  END IF;

  SELECT count(*) INTO v_count FROM public.orders;

  -- Borrar todas las órdenes (order_items y order_status_history se borran por CASCADE)
  DELETE FROM public.orders WHERE true;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_count,
    'message', format('Se han eliminado %s pedidos de prueba exitosamente.', v_count)
  );
END;
$$;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) EN TODAS LAS TABLAS (IDEMPOTENTE)
-- ==============================================================================

-- 9.1 PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id OR
    public.is_admin() OR
    (public.is_driver() AND role IN ('comprador', 'delivery'))
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL
  USING (public.is_admin());

-- 9.2 PRODUCTS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_select" ON public.products;
CREATE POLICY "products_public_select"
  ON public.products FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "products_admin_modify" ON public.products;
CREATE POLICY "products_admin_modify"
  ON public.products FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9.3 STORE_CONFIG
ALTER TABLE public.store_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_config_public_select" ON public.store_config;
CREATE POLICY "store_config_public_select"
  ON public.store_config FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "store_config_admin_update" ON public.store_config;
CREATE POLICY "store_config_admin_update"
  ON public.store_config FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9.4 ORDERS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy"
  ON public.orders FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy"
  ON public.orders FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy"
  ON public.orders FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "orders_delete_admin" ON public.orders;
CREATE POLICY "orders_delete_admin"
  ON public.orders FOR DELETE
  USING (public.is_admin());

-- 9.5 ORDER_ITEMS
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
CREATE POLICY "order_items_select_policy"
  ON public.order_items FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
CREATE POLICY "order_items_insert_policy"
  ON public.order_items FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_delete_admin" ON public.order_items;
CREATE POLICY "order_items_delete_admin"
  ON public.order_items FOR DELETE
  USING (public.is_admin());

-- 9.6 DRIVER_LOCATIONS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_locations_select_public" ON public.driver_locations;
CREATE POLICY "driver_locations_select_public"
  ON public.driver_locations FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "driver_locations_modify_own" ON public.driver_locations;
CREATE POLICY "driver_locations_modify_own"
  ON public.driver_locations FOR ALL
  USING (auth.uid() = driver_id OR public.is_admin())
  WITH CHECK (auth.uid() = driver_id OR public.is_admin());

-- 9.7 ORDER_STATUS_HISTORY
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_history_select_policy"
  ON public.order_status_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "order_history_insert_policy" ON public.order_status_history;
CREATE POLICY "order_history_insert_policy"
  ON public.order_status_history FOR INSERT
  WITH CHECK (true);

-- ==============================================================================
-- 10. SUPABASE REALTIME (PUBLICACIÓN PARA WEBSOCKETS EN VIVO)
-- ==============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_config;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ==============================================================================
-- 11. SEED INICIAL: TIENDA OFICIAL Y PRODUCTOS REALES AGREGADOS POR EL DUEÑO
-- (ELIMINA LOS 9 LÍQUIDOS ANTIGUOS Y CARGA LOS PRODUCTOS NUEVOS EN BASE DE DATOS)
-- ==============================================================================

-- 11.1 Tienda física (Colmado Noadia, Loma de Cabrera)
INSERT INTO public.store_config (
  id,
  name,
  address_text,
  latitude,
  longitude,
  phone,
  whatsapp,
  bank_account_info,
  is_open,
  points_per_redemption,
  redemptions_enabled
) VALUES (
  1,
  'BLACK VAPE • Colmado Noadia',
  'Colmado Noadia, C98P+QVV, Loma de Cabrera',
  19.41688,
  -71.61287,
  '8092104901',
  '8092104901',
  'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901',
  true,
  1000,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    address_text = EXCLUDED.address_text,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    phone = EXCLUDED.phone,
    whatsapp = EXCLUDED.whatsapp,
    bank_account_info = EXCLUDED.bank_account_info,
    updated_at = now();

-- 11.2 Limpiar pedidos de demostración y los 9 líquidos antiguos
DELETE FROM public.orders WHERE id IN ('ORD-700', 'ORD-701', 'ORD-702', 'ORD-901', 'ORD-902');

UPDATE public.order_items
SET product_id = NULL
WHERE product_id IN (
  'prod-horny-ice-mint',
  'prod-mistiq-melon',
  'prod-pod-juice-energy',
  'prod-pop-big-apple',
  'prod-pop-blueberry-lemonade',
  'prod-pop-grape',
  'prod-pop-mango-dragon-fruit',
  'prod-pop-mango-strawberry',
  'prod-pop-strawberry-watermelon',
  'prod-vape-puff-plus',
  'prod-vape-caliburn-gk2'
);

DELETE FROM public.products
WHERE id IN (
  'prod-horny-ice-mint',
  'prod-mistiq-melon',
  'prod-pod-juice-energy',
  'prod-pop-big-apple',
  'prod-pop-blueberry-lemonade',
  'prod-pop-grape',
  'prod-pop-mango-dragon-fruit',
  'prod-pop-mango-strawberry',
  'prod-pop-strawberry-watermelon',
  'prod-vape-puff-plus',
  'prod-vape-caliburn-gk2'
);

-- 11.3 Cargar los nuevos productos reales en la base de datos
INSERT INTO public.products (
  id,
  name,
  product_type,
  flavor_category,
  nicotine_mg,
  image_url,
  stock_units,
  cost_price,
  price_full_tank,
  price_half_tank,
  description,
  variants,
  is_active
) VALUES
(
  'prod-1793903205129',
  'La popy',
  'liquido',
  'Frutales',
  70,
  '/productos/la-popy.jpg',
  29,
  850.00,
  100.00,
  50.00,
  'La popy 70mg nicotina',
  '[]'::jsonb,
  true
),
(
  'prod-1793923232176',
  'MUHA MEDS',
  'vape',
  'Equipos Vape',
  0,
  '/productos/muha-meds-main.jpg',
  2,
  3500.00,
  3500.00,
  3500.00,
  'Equipo Vape disponible en múltiples colores. Agrega tu líquido favorito al instante.',
  '[{"id":"var-1793923139032-0","colorName":"Negro","colorHex":"#18181b","imageUrl":"/productos/muha-meds-var-0.jpg","stockUnits":1},{"id":"var-1793923168792-1","colorName":"Negro","colorHex":"#18181b","imageUrl":"/productos/muha-meds-var-1.jpg","stockUnits":1}]'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    product_type = EXCLUDED.product_type,
    flavor_category = EXCLUDED.flavor_category,
    nicotine_mg = EXCLUDED.nicotine_mg,
    image_url = EXCLUDED.image_url,
    stock_units = EXCLUDED.stock_units,
    cost_price = EXCLUDED.cost_price,
    price_full_tank = EXCLUDED.price_full_tank,
    price_half_tank = EXCLUDED.price_half_tank,
    description = EXCLUDED.description,
    variants = EXCLUDED.variants,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- ==============================================================================
-- 12. RPCs DE AUTENTICACIÓN SEGURA Y ADMINISTRACIÓN DE REPARTIDORES
-- ==============================================================================

-- Función para que el Administrador cree cuentas de repartidores sin exponer service_role
CREATE OR REPLACE FUNCTION public.create_driver_account(
  p_name text,
  p_phone text,
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_clean_user text;
  v_email text;
  v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede crear cuentas de repartidores.';
  END IF;

  v_clean_user := lower(trim(p_username));
  IF length(v_clean_user) < 3 THEN
    RAISE EXCEPTION 'El nombre de usuario debe tener al menos 3 caracteres.';
  END IF;

  IF length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
  END IF;

  v_email := v_clean_user || '@repartidor.blackvape.local';

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_clean_user) THEN
    RAISE EXCEPTION 'Ya existe un repartidor con el usuario "%".', v_clean_user;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'phone', p_phone, 'username', v_clean_user, 'role', 'delivery'),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id,
    role,
    name,
    phone,
    username,
    is_active
  ) VALUES (
    v_user_id,
    'delivery',
    trim(p_name),
    trim(p_phone),
    v_clean_user,
    true
  )
  ON CONFLICT (id) DO UPDATE
  SET role = 'delivery',
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      username = EXCLUDED.username,
      is_active = true,
      updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'username', v_clean_user,
    'name', p_name
  );
END;
$$;

-- Función auxiliar para asignar el rol de administrador de forma segura
CREATE OR REPLACE FUNCTION public.make_user_admin(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_clean_email text;
  v_jwt_claims text;
BEGIN
  v_clean_email := lower(trim(COALESCE(p_email, '')));
  v_jwt_claims := COALESCE(current_setting('request.jwt.claims', true), '');
  IF v_jwt_claims <> ''
     AND NOT public.is_admin()
     AND v_clean_email NOT IN ('noadiasclaribel.y2k@icloud.com', 'elrubio0880.0@gmail.com') THEN
    RAISE EXCEPTION 'Acceso denegado: Solo un administrador puede promover usuarios.';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró ningún usuario con el correo % en auth.users.', p_email;
  END IF;

  UPDATE public.profiles
  SET role = 'admin',
      is_active = true,
      updated_at = now()
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'email', v_clean_email, 'role', 'admin');
END;
$$;

-- ==============================================================================
-- 13. SISTEMA DE PUNTOS DE LEALTAD, CANJES Y RIFAS CON RULETA
-- ==============================================================================

-- 13.1 Historial y Auditoría de Movimientos de Puntos (Point Transactions)
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id text REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (
    type IN (
      'acumulacion_pedido',
      'reversion_pedido',
      'canje_aprobado',
      'devolucion_canje',
      'ajuste_manual',
      'ajuste_reset'
    )
  ),
  points integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_point_transactions_order_accrual
  ON public.point_transactions(order_id, type)
  WHERE type = 'acumulacion_pedido';

CREATE INDEX IF NOT EXISTS idx_point_transactions_user
  ON public.point_transactions(user_id, created_at DESC);

-- 13.2 Solicitudes y Registro de Canjes (Redemptions)
CREATE TABLE IF NOT EXISTS public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_phone text NOT NULL,
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  portion text NOT NULL DEFAULT 'tanque_lleno' CHECK (portion IN ('tanque_lleno', 'mitad')),
  points_cost integer NOT NULL CHECK (points_cost > 0),
  delivery_address_note text,
  destination_lat numeric(10,7) NOT NULL,
  destination_lng numeric(10,7) NOT NULL,
  status text NOT NULL DEFAULT 'solicitado' CHECK (
    status IN ('solicitado', 'aprobado', 'rechazado', 'cancelado', 'entregado')
  ),
  generated_order_id text REFERENCES public.orders(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.redemptions ALTER COLUMN product_id DROP NOT NULL;
  ALTER TABLE public.redemptions DROP CONSTRAINT IF EXISTS redemptions_product_id_fkey;
  ALTER TABLE public.redemptions
    ADD CONSTRAINT redemptions_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.redemptions(user_id, created_at DESC);

-- 13.3 Rifas y Sorteos (Raffles)
CREATE TABLE IF NOT EXISTS public.raffles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  prize text NOT NULL,
  draw_type text NOT NULL DEFAULT 'igualitaria' CHECK (draw_type IN ('igualitaria', 'ponderada')),
  status text NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'finalizada', 'cancelada')),
  winner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  winner_name text,
  winner_phone text,
  winner_ticket_number integer,
  total_tickets integer NOT NULL DEFAULT 0,
  drawn_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raffles_status ON public.raffles(status);

-- 13.4 Participantes de Rifas
CREATE TABLE IF NOT EXISTS public.raffle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id uuid NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_phone text,
  ticket_count integer NOT NULL DEFAULT 1 CHECK (ticket_count > 0),
  ticket_range_start integer NOT NULL DEFAULT 1,
  ticket_range_end integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_raffle_user UNIQUE (raffle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_raffle_participants_raffle ON public.raffle_participants(raffle_id);

-- 13.5 RLS para tablas de lealtad y rifas
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura de transacciones de puntos propias o admin" ON public.point_transactions;
CREATE POLICY "Lectura de transacciones de puntos propias o admin" ON public.point_transactions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Sin insercion directa en transacciones de puntos" ON public.point_transactions;
CREATE POLICY "Sin insercion directa en transacciones de puntos" ON public.point_transactions FOR INSERT WITH CHECK (false);

ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura de canjes propios o admin" ON public.redemptions;
CREATE POLICY "Lectura de canjes propios o admin" ON public.redemptions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Cliente puede solicitar su propio canje" ON public.redemptions;
CREATE POLICY "Cliente puede solicitar su propio canje" ON public.redemptions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admin puede actualizar canjes" ON public.redemptions;
CREATE POLICY "Admin puede actualizar canjes" ON public.redemptions FOR UPDATE USING (public.is_admin());

ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cualquiera autenticado puede ver rifas" ON public.raffles;
CREATE POLICY "Cualquiera autenticado puede ver rifas" ON public.raffles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Solo admin gestiona rifas" ON public.raffles;
CREATE POLICY "Solo admin gestiona rifas" ON public.raffles FOR ALL USING (public.is_admin());

ALTER TABLE public.raffle_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura de participantes de rifas" ON public.raffle_participants;
CREATE POLICY "Lectura de participantes de rifas" ON public.raffle_participants FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
DROP POLICY IF EXISTS "Solo admin gestiona participantes" ON public.raffle_participants;
CREATE POLICY "Solo admin gestiona participantes" ON public.raffle_participants FOR ALL USING (public.is_admin());

-- 13.6 RPC: Marcar Pedido Entregado con Descuento de Stock (General + Variante) y Puntos
CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_prod public.products%ROWTYPE;
  v_new_variants jsonb;
  v_var_elem jsonb;
  v_points_to_grant integer := 0;
  v_new_balance integer := 0;
  v_already_granted boolean := false;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado.', p_order_id;
  END IF;

  IF v_order.status = 'entregado' THEN
    RETURN jsonb_build_object('success', true, 'message', 'El pedido ya estaba marcado como entregado.');
  END IF;

  -- Descontar stock por ítem y por variante si aplica
  FOR v_item IN
    SELECT product_id, variant_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
  LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id FOR UPDATE;
    IF FOUND THEN
      IF v_item.variant_id IS NOT NULL AND jsonb_typeof(v_prod.variants) = 'array' AND jsonb_array_length(v_prod.variants) > 0 THEN
        v_new_variants := '[]'::jsonb;
        FOR v_var_elem IN SELECT * FROM jsonb_array_elements(v_prod.variants)
        LOOP
          IF (v_var_elem->>'id') = v_item.variant_id THEN
            v_var_elem := jsonb_set(
              v_var_elem,
              '{stockUnits}',
              to_jsonb(GREATEST(0, COALESCE((v_var_elem->>'stockUnits')::integer, 0) - v_item.quantity))
            );
          END IF;
          v_new_variants := v_new_variants || jsonb_build_array(v_var_elem);
        END LOOP;

        UPDATE public.products
        SET stock_units = GREATEST(0, stock_units - v_item.quantity),
            variants = v_new_variants,
            updated_at = now()
        WHERE id = v_item.product_id;
      ELSE
        UPDATE public.products
        SET stock_units = GREATEST(0, stock_units - v_item.quantity),
            updated_at = now()
        WHERE id = v_item.product_id;
      END IF;
    END IF;
  END LOOP;

  -- Otorgar puntos de lealtad si es pedido regular de cliente registrado
  IF v_order.order_type = 'regular' AND v_order.customer_id IS NOT NULL THEN
    v_points_to_grant := FLOOR(COALESCE(v_order.subtotal_liquid, 0))::integer;

    IF v_points_to_grant > 0 THEN
      SELECT EXISTS (
        SELECT 1 FROM public.point_transactions
        WHERE order_id = p_order_id AND type = 'acumulacion_pedido'
      ) INTO v_already_granted;

      IF NOT v_already_granted THEN
        UPDATE public.profiles
        SET points_balance = points_balance + v_points_to_grant,
            updated_at = now()
        WHERE id = v_order.customer_id
        RETURNING points_balance INTO v_new_balance;

        INSERT INTO public.point_transactions (
          user_id,
          order_id,
          type,
          points,
          balance_after,
          reason
        ) VALUES (
          v_order.customer_id,
          p_order_id,
          'acumulacion_pedido',
          v_points_to_grant,
          v_new_balance,
          format('Puntos ganados por pedido entregado %s ($%s en productos)', p_order_id, v_order.subtotal_liquid)
        );
      END IF;
    END IF;
  ELSIF v_order.order_type = 'canje' AND v_order.redemption_id IS NOT NULL THEN
    UPDATE public.redemptions
    SET status = 'entregado',
        updated_at = now()
    WHERE id = v_order.redemption_id;
  END IF;

  UPDATE public.orders
  SET status = 'entregado',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (
    p_order_id,
    'entregado',
    format('Pedido dispensado y cobrado. Stock descontado. Puntos otorgados: %s.', v_points_to_grant)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'entregado',
    'points_granted', v_points_to_grant
  );
END;
$$;

-- 13.7 RPC: Revertir Pedido Entregado
CREATE OR REPLACE FUNCTION public.revert_delivered_order(
  p_order_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_prev_tx public.point_transactions%ROWTYPE;
  v_new_balance integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede revertir un pedido entregado.';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado.';
  END IF;

  IF v_order.status <> 'entregado' THEN
    RAISE EXCEPTION 'El pedido no está entregado; su estado actual es %.', v_order.status;
  END IF;

  FOR v_item IN
    SELECT product_id, SUM(quantity)::integer AS total_qty
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET stock_units = stock_units + v_item.total_qty,
        updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  SELECT * INTO v_prev_tx
  FROM public.point_transactions
  WHERE order_id = p_order_id AND type = 'acumulacion_pedido';

  IF FOUND AND v_order.customer_id IS NOT NULL THEN
    UPDATE public.profiles
    SET points_balance = GREATEST(0, points_balance - v_prev_tx.points),
        updated_at = now()
    WHERE id = v_order.customer_id
    RETURNING points_balance INTO v_new_balance;

    INSERT INTO public.point_transactions (
      user_id,
      order_id,
      type,
      points,
      balance_after,
      reason,
      created_by
    ) VALUES (
      v_order.customer_id,
      p_order_id,
      'reversion_pedido',
      -v_prev_tx.points,
      v_new_balance,
      format('Reversión por pedido cancelado: %s', COALESCE(p_reason, 'Sin motivo especificado')),
      auth.uid()
    );
  END IF;

  UPDATE public.orders
  SET status = 'cancelado',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (p_order_id, 'cancelado', format('Pedido revertido por administrador. Motivo: %s', p_reason));

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'cancelado');
END;
$$;

-- 13.8 RPC: Solicitud de Canje por Cliente
CREATE OR REPLACE FUNCTION public.request_redemption_secure(
  p_product_id text,
  p_portion text,
  p_delivery_address_note text,
  p_destination_lat numeric,
  p_destination_lng numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_profile public.profiles%ROWTYPE;
  v_store public.store_config%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_cost integer;
  v_redemption_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para solicitar un canje.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.is_active = false THEN
    RAISE EXCEPTION 'Perfil de usuario no encontrado o inactivo.';
  END IF;

  SELECT * INTO v_store FROM public.store_config WHERE id = 1;
  IF NOT v_store.redemptions_enabled THEN
    RAISE EXCEPTION 'Los canjes de puntos están pausados temporalmente por la tienda.';
  END IF;

  v_cost := COALESCE(v_store.points_per_redemption, 1000);

  IF v_profile.points_balance < v_cost THEN
    RAISE EXCEPTION 'Saldo insuficiente: tienes % puntos y se requieren % puntos.', v_profile.points_balance, v_cost;
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto seleccionado no está disponible en catálogo.';
  END IF;

  IF v_prod.stock_units < 1 THEN
    RAISE EXCEPTION 'No hay stock disponible de este producto para canje.';
  END IF;

  INSERT INTO public.redemptions (
    user_id,
    user_name,
    user_phone,
    product_id,
    portion,
    points_cost,
    delivery_address_note,
    destination_lat,
    destination_lng,
    status
  ) VALUES (
    v_user_id,
    v_profile.name,
    COALESCE(v_profile.phone, ''),
    p_product_id,
    p_portion,
    v_cost,
    trim(p_delivery_address_note),
    p_destination_lat,
    p_destination_lng,
    'solicitado'
  ) RETURNING id INTO v_redemption_id;

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', v_redemption_id,
    'points_cost', v_cost,
    'current_balance', v_profile.points_balance
  );
END;
$$;

-- 13.9 RPC: Aprobación de Canje por Admin
CREATE OR REPLACE FUNCTION public.approve_redemption_admin(
  p_redemption_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption public.redemptions%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_prod public.products%ROWTYPE;
  v_store public.store_config%ROWTYPE;
  v_order_id text;
  v_distance_km numeric;
  v_delivery_fee numeric;
  v_new_balance integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede aprobar canjes de puntos.';
  END IF;

  SELECT * INTO v_redemption FROM public.redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de canje no encontrada.';
  END IF;

  IF v_redemption.status <> 'solicitado' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue atendida (estado actual: %).', v_redemption.status;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_redemption.user_id FOR UPDATE;
  IF v_profile.points_balance < v_redemption.points_cost THEN
    RAISE EXCEPTION 'El cliente ya no cuenta con los % puntos requeridos (saldo actual: %).',
      v_redemption.points_cost, v_profile.points_balance;
  END IF;

  SELECT * INTO v_prod FROM public.products WHERE id = v_redemption.product_id;
  SELECT * INTO v_store FROM public.store_config WHERE id = 1;

  UPDATE public.profiles
  SET points_balance = points_balance - v_redemption.points_cost,
       updated_at = now()
  WHERE id = v_redemption.user_id
  RETURNING points_balance INTO v_new_balance;

  INSERT INTO public.point_transactions (
    user_id,
    type,
    points,
    balance_after,
    reason,
    created_by
  ) VALUES (
    v_redemption.user_id,
    'canje_aprobado',
    -v_redemption.points_cost,
    v_new_balance,
    format('Canje aprobado: 1 llenada gratis de %s (-%s pts)', COALESCE(v_prod.name, 'Líquido'), v_redemption.points_cost),
    auth.uid()
  );

  v_distance_km := public.haversine_distance_km(
    v_store.latitude,
    v_store.longitude,
    v_redemption.destination_lat,
    v_redemption.destination_lng
  );
  v_delivery_fee := public.calculate_delivery_fee(v_distance_km);

  v_order_id := 'ORD-CANJE-' || floor(1000 + random() * 9000)::text;

  INSERT INTO public.orders (
    id,
    customer_id,
    customer_name,
    customer_phone,
    delivery_address_note,
    destination_lat,
    destination_lng,
    subtotal_liquid,
    liquid_cost_total,
    calculated_distance_km,
    calculated_delivery_fee,
    proposed_delivery_fee,
    final_delivery_fee,
    total_amount,
    status,
    order_type,
    points_redeemed,
    redemption_id,
    payment_method,
    special_notes
  ) VALUES (
    v_order_id,
    v_redemption.user_id,
    v_redemption.user_name,
    v_redemption.user_phone,
    v_redemption.delivery_address_note,
    v_redemption.destination_lat,
    v_redemption.destination_lng,
    0.00,
    COALESCE(v_prod.cost_price, 0.00),
    v_distance_km,
    v_delivery_fee,
    v_delivery_fee,
    v_delivery_fee,
    v_delivery_fee,
    'pendiente_cotizacion',
    'canje',
    v_redemption.points_cost,
    v_redemption.id,
    'efectivo',
    format('CANJE DE PUNTOS: 1x %s gratis. Tarifa de delivery estándar.', COALESCE(v_prod.name, 'Líquido'))
  );

  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_name,
    product_type,
    portion,
    unit_price,
    cost_price,
    quantity
  ) VALUES (
    v_order_id,
    v_prod.id,
    format('%s (Llenada Gratis x Puntos)', COALESCE(v_prod.name, 'Líquido')),
    COALESCE(v_prod.product_type, 'liquido'),
    v_redemption.portion,
    0.00,
    COALESCE(v_prod.cost_price, 0.00),
    1
  );

  UPDATE public.redemptions
  SET status = 'aprobado',
      generated_order_id = v_order_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_redemption_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (v_order_id, 'pendiente_cotizacion', 'Pedido de canje creado y aprobado por admin. Despacho asignable a repartidores.');

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', p_redemption_id,
    'order_id', v_order_id,
    'remaining_points', v_new_balance
  );
END;
$$;

-- 13.10 RPC: Rechazo o Cancelación de Canje
CREATE OR REPLACE FUNCTION public.reject_or_cancel_redemption(
  p_redemption_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_redemption public.redemptions%ROWTYPE;
  v_new_balance integer;
BEGIN
  SELECT * INTO v_redemption FROM public.redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de canje no encontrada.';
  END IF;

  IF NOT public.is_admin() AND v_redemption.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este canje.';
  END IF;

  IF v_redemption.status IN ('rechazado', 'cancelado', 'entregado') THEN
    RAISE EXCEPTION 'El canje ya está en estado final (%).', v_redemption.status;
  END IF;

  IF v_redemption.status = 'aprobado' THEN
    UPDATE public.profiles
    SET points_balance = points_balance + v_redemption.points_cost,
        updated_at = now()
    WHERE id = v_redemption.user_id
    RETURNING points_balance INTO v_new_balance;

    INSERT INTO public.point_transactions (
      user_id,
      type,
      points,
      balance_after,
      reason,
      created_by
    ) VALUES (
      v_redemption.user_id,
      'devolucion_canje',
      v_redemption.points_cost,
      v_new_balance,
      format('Devolución de puntos por canje cancelado: %s', COALESCE(p_reason, 'Cancelado')),
      auth.uid()
    );

    IF v_redemption.generated_order_id IS NOT NULL THEN
      UPDATE public.orders
      SET status = 'cancelado', updated_at = now()
      WHERE id = v_redemption.generated_order_id AND status <> 'entregado';
    END IF;
  END IF;

  UPDATE public.redemptions
  SET status = CASE WHEN public.is_admin() THEN 'rechazado' ELSE 'cancelado' END,
      rejection_reason = p_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_redemption_id;

  RETURN jsonb_build_object('success', true, 'redemption_id', p_redemption_id, 'status', 'cancelado');
END;
$$;

-- 13.11 RPC: Ajuste Manual y Reset de Puntos por Admin
CREATE OR REPLACE FUNCTION public.adjust_user_points_admin(
  p_user_id uuid,
  p_delta_points integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_new_balance integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ajustar puntos de usuarios.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'El motivo del ajuste es obligatorio y debe tener al menos 3 caracteres.';
  END IF;

  IF p_delta_points = 0 THEN
    RAISE EXCEPTION 'El ajuste de puntos debe ser distinto de cero.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  IF v_profile.points_balance + p_delta_points < 0 THEN
    RAISE EXCEPTION 'El ajuste resultaría en saldo negativo (% pts). El saldo mínimo es 0.',
      v_profile.points_balance + p_delta_points;
  END IF;

  UPDATE public.profiles
  SET points_balance = points_balance + p_delta_points,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING points_balance INTO v_new_balance;

  INSERT INTO public.point_transactions (
    user_id,
    type,
    points,
    balance_after,
    reason,
    created_by
  ) VALUES (
    p_user_id,
    'ajuste_manual',
    p_delta_points,
    v_new_balance,
    trim(p_reason),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'delta_points', p_delta_points,
    'balance_after', v_new_balance,
    'new_balance', v_new_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_points_admin(
  p_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_deducted integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede resetear puntos de usuarios.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'El motivo del reseteo es obligatorio.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario no encontrado.';
  END IF;

  v_deducted := v_profile.points_balance;
  IF v_deducted <= 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'El usuario ya tiene saldo 0.');
  END IF;

  UPDATE public.profiles
  SET points_balance = 0,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.point_transactions (
    user_id,
    type,
    points,
    balance_after,
    reason,
    created_by
  ) VALUES (
    p_user_id,
    'ajuste_reset',
    -v_deducted,
    0,
    trim(p_reason),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'points_deducted', v_deducted,
    'balance_after', 0
  );
END;
$$;

-- 13.12 RPCs: Sincronización y Sorteo de Rifas
CREATE OR REPLACE FUNCTION public.sync_raffle_participants_admin(
  p_raffle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raffle public.raffles%ROWTYPE;
  v_client record;
  v_current_ticket integer := 0;
  v_tickets integer := 0;
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden sincronizar participantes de rifa.';
  END IF;

  SELECT * INTO v_raffle FROM public.raffles WHERE id = p_raffle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rifa no encontrada.';
  END IF;

  IF v_raffle.status <> 'activa' THEN
    RAISE EXCEPTION 'La rifa no está activa.';
  END IF;

  DELETE FROM public.raffle_participants WHERE raffle_id = p_raffle_id;

  FOR v_client IN
    SELECT id, name, phone, points_balance
    FROM public.profiles
    WHERE role = 'comprador' AND is_active = true
    ORDER BY name ASC
  LOOP
    IF v_raffle.draw_type = 'ponderada' THEN
      v_tickets := GREATEST(1, v_client.points_balance);
    ELSE
      v_tickets := 1;
    END IF;

    INSERT INTO public.raffle_participants (
      raffle_id,
      user_id,
      user_name,
      user_phone,
      ticket_count,
      ticket_range_start,
      ticket_range_end
    ) VALUES (
      p_raffle_id,
      v_client.id,
      v_client.name,
      v_client.phone,
      v_tickets,
      v_current_ticket + 1,
      v_current_ticket + v_tickets
    );

    v_current_ticket := v_current_ticket + v_tickets;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.raffles
  SET total_tickets = v_current_ticket,
      updated_at = now()
  WHERE id = p_raffle_id;

  RETURN jsonb_build_object(
    'success', true,
    'raffle_id', p_raffle_id,
    'participants_count', v_count,
    'total_tickets', v_current_ticket
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_raffle_draw_admin(
  p_raffle_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_raffle public.raffles%ROWTYPE;
  v_winner public.raffle_participants%ROWTYPE;
  v_winning_ticket integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ejecutar el sorteo.';
  END IF;

  SELECT * INTO v_raffle FROM public.raffles WHERE id = p_raffle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rifa no encontrada.';
  END IF;

  IF v_raffle.status <> 'activa' THEN
    RAISE EXCEPTION 'La rifa no está activa para sorteo (estado actual: %).', v_raffle.status;
  END IF;

  IF v_raffle.total_tickets <= 0 THEN
    PERFORM public.sync_raffle_participants_admin(p_raffle_id);
    SELECT * INTO v_raffle FROM public.raffles WHERE id = p_raffle_id;
  END IF;

  IF v_raffle.total_tickets <= 0 THEN
    RAISE EXCEPTION 'No hay clientes activos elegibles para participar en este sorteo.';
  END IF;

  v_winning_ticket := FLOOR(1 + (random() * v_raffle.total_tickets))::integer;

  SELECT * INTO v_winner
  FROM public.raffle_participants
  WHERE raffle_id = p_raffle_id
    AND v_winning_ticket >= ticket_range_start
    AND v_winning_ticket <= ticket_range_end
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Error al calcular ganador con ticket %.', v_winning_ticket;
  END IF;

  UPDATE public.raffles
  SET status = 'finalizada',
      winner_user_id = v_winner.user_id,
      winner_name = v_winner.user_name,
      winner_phone = v_winner.user_phone,
      winner_ticket_number = v_winning_ticket,
      drawn_at = now(),
      updated_at = now()
  WHERE id = p_raffle_id;

  RETURN jsonb_build_object(
    'success', true,
    'raffle_id', p_raffle_id,
    'winning_ticket', v_winning_ticket,
    'winner_user_id', v_winner.user_id,
    'winner_name', v_winner.user_name,
    'winner_phone', v_winner.user_phone,
    'total_tickets', v_raffle.total_tickets
  );
END;
$$;

-- ==============================================================================
-- 14. REGISTRO AUTOMÁTICO DE ADMINISTRADORES OFICIALES Y REPARTIDORES ACTIVOS
-- ==============================================================================
DO $$
DECLARE
  v_admin record;
  v_driver record;
  v_user_id uuid;
BEGIN
  -- 14.1 Administradores Oficiales (Noadia Claribel y Administrador Black Vape)
  FOR v_admin IN
    SELECT * FROM (VALUES
      ('noadiasclaribel.y2k@icloud.com', 'blackVape2026', 'Noadia Claribel (Admin)', '8092104901'),
      ('elrubio0880.0@gmail.com', 'BlackVape2026*', 'Administrador Black Vape', '8092104901')
    ) AS t(email, password, name, phone)
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(v_admin.email));

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        reauthentication_token,
        phone_change,
        phone_change_token,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
      ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        lower(trim(v_admin.email)),
        crypt(v_admin.password, gen_salt('bf')),
        now(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', v_admin.name, 'phone', v_admin.phone, 'role', 'admin'),
        'authenticated',
        'authenticated',
        now(),
        now()
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(v_admin.email)), 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      );
    ELSE
      UPDATE auth.users
      SET encrypted_password = crypt(v_admin.password, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin', 'name', v_admin.name),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    INSERT INTO public.profiles (id, role, name, phone, is_active)
    VALUES (v_user_id, 'admin', v_admin.name, v_admin.phone, true)
    ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        name = EXCLUDED.name,
        is_active = true,
        updated_at = now();
  END LOOP;

  -- 14.2 Repartidores Reales Activos (Yanet y Jose)
  FOR v_driver IN
    SELECT * FROM (VALUES
      ('yanet@repartidor.blackvape.local', 'yanet123', 'Yanet', '8492763532', 'yanet'),
      ('jose@repartidor.blackvape.local', 'jose123', 'Jose', '8092104901', 'jose')
    ) AS t(email, password, name, phone, username)
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(v_driver.email));

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        reauthentication_token,
        phone_change,
        phone_change_token,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
      ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        lower(trim(v_driver.email)),
        crypt(v_driver.password, gen_salt('bf')),
        now(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', v_driver.name, 'phone', v_driver.phone, 'username', v_driver.username, 'role', 'delivery'),
        'authenticated',
        'authenticated',
        now(),
        now()
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(v_driver.email)), 'email_verified', true),
        'email',
        now(),
        now(),
        now()
      );
    END IF;

    INSERT INTO public.profiles (id, role, name, phone, username, is_active)
    VALUES (v_user_id, 'delivery', v_driver.name, v_driver.phone, v_driver.username, true)
    ON CONFLICT (id) DO UPDATE
    SET role = 'delivery',
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        username = EXCLUDED.username,
        is_active = true,
        updated_at = now();
  END LOOP;

  -- Normalizar columnas de texto en auth.users para evitar Error 500 en GoTrue
  UPDATE auth.users
  SET confirmation_token = COALESCE(confirmation_token, ''),
      recovery_token = COALESCE(recovery_token, ''),
      email_change_token_new = COALESCE(email_change_token_new, ''),
      email_change = COALESCE(email_change, ''),
      email_change_token_current = COALESCE(email_change_token_current, ''),
      reauthentication_token = COALESCE(reauthentication_token, ''),
      phone_change = COALESCE(phone_change, ''),
      phone_change_token = COALESCE(phone_change_token, '');
END $$;

-- Función pública para registrar compradores por Nombre y Teléfono sin límites de SMTP
CREATE OR REPLACE FUNCTION public.register_buyer_account(
  p_name text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_digits text;
  v_email text;
  v_password text;
  v_user_id uuid;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_digits) = 11 AND v_digits LIKE '1%' THEN
    v_digits := substr(v_digits, 2);
  END IF;
  IF length(v_digits) < 7 THEN
    RAISE EXCEPTION 'Número de teléfono inválido.';
  END IF;

  v_email := v_digits || '@clientes.blackvape.local';
  v_password := 'bv_cliente_' || v_digits || '_secure';

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      email_change_token_current,
      reauthentication_token,
      phone_change,
      phone_change_token,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', trim(p_name), 'phone', trim(p_phone), 'role', 'comprador'),
      'authenticated',
      'authenticated',
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );
  END IF;

  INSERT INTO public.profiles (id, role, name, phone, is_active)
  VALUES (v_user_id, 'comprador', trim(p_name), trim(p_phone), true)
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      updated_at = now();

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'email', v_email);
END;
$$;
