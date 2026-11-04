-- ==============================================================================
-- BLACK VAPE DELIVERY - MIGRACIÓN FASE B: SISTEMA DE PUNTOS, CANJES Y RIFAS
-- Integración en servidor: PostgreSQL + RLS + RPCs SECURITY DEFINER
-- Zona horaria de referencia: America/Santo_Domingo
-- ==============================================================================

-- 1. AMPLIACIÓN DE TABLAS EXISTENTES
-- ------------------------------------------------------------------------------

-- 1.1 Saldo de puntos en perfiles de usuario
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS points_balance integer NOT NULL DEFAULT 0 CHECK (points_balance >= 0);

-- 1.2 Configuración de canjes en la tienda (costo por defecto 1000 puntos = 1 llenada gratis)
ALTER TABLE public.store_config
  ADD COLUMN IF NOT EXISTS points_per_redemption integer NOT NULL DEFAULT 1000 CHECK (points_per_redemption > 0),
  ADD COLUMN IF NOT EXISTS redemptions_enabled boolean NOT NULL DEFAULT true;

-- 1.3 Clasificación de tipo de pedido en orders (regular vs canje)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'regular' CHECK (order_type IN ('regular', 'canje')),
  ADD COLUMN IF NOT EXISTS points_redeemed integer NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  ADD COLUMN IF NOT EXISTS redemption_id uuid;

-- ==============================================================================
-- 2. NUEVAS TABLAS CON RLS
-- ==============================================================================

-- 2.1 Historial y Auditoría de Movimientos de Puntos (Point Transactions)
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
  points integer NOT NULL, -- Positivo (suma) o Negativo (resta)
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Garantía estricta de idempotencia: un pedido entregado jamás acumula puntos dos veces
CREATE UNIQUE INDEX IF NOT EXISTS idx_point_transactions_order_accrual
  ON public.point_transactions(order_id, type)
  WHERE type = 'acumulacion_pedido';

CREATE INDEX IF NOT EXISTS idx_point_transactions_user
  ON public.point_transactions(user_id, created_at DESC);

-- 2.2 Solicitudes y Registro de Canjes (Redemptions)
CREATE TABLE IF NOT EXISTS public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  user_phone text NOT NULL,
  product_id text NOT NULL REFERENCES public.products(id),
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

CREATE INDEX IF NOT EXISTS idx_redemptions_status ON public.redemptions(status);
CREATE INDEX IF NOT EXISTS idx_redemptions_user ON public.redemptions(user_id, created_at DESC);

-- 2.3 Rifas y Sorteos (Raffles)
CREATE TABLE IF NOT EXISTS public.raffles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  prize text NOT NULL, -- Texto libre configurable por el admin
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

-- 2.4 Participantes de Rifas (Raffle Participants con rangos de tickets para sorteo determinista)
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

-- ==============================================================================
-- 3. POLÍTICAS DE SEGURIDAD (RLS)
-- ==============================================================================

-- 3.1 Point Transactions
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de transacciones de puntos propias o admin" ON public.point_transactions;
CREATE POLICY "Lectura de transacciones de puntos propias o admin"
  ON public.point_transactions
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

-- Modificaciones solo mediante RPCs SECURITY DEFINER
DROP POLICY IF EXISTS "Sin insercion directa en transacciones de puntos" ON public.point_transactions;
CREATE POLICY "Sin insercion directa en transacciones de puntos"
  ON public.point_transactions
  FOR INSERT
  WITH CHECK (false);

-- 3.2 Redemptions
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de canjes propios o admin" ON public.redemptions;
CREATE POLICY "Lectura de canjes propios o admin"
  ON public.redemptions
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Cliente puede solicitar su propio canje" ON public.redemptions;
CREATE POLICY "Cliente puede solicitar su propio canje"
  ON public.redemptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin puede actualizar canjes" ON public.redemptions;
CREATE POLICY "Admin puede actualizar canjes"
  ON public.redemptions
  FOR UPDATE
  USING (public.is_admin());

-- 3.3 Raffles
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquiera autenticado puede ver rifas" ON public.raffles;
CREATE POLICY "Cualquiera autenticado puede ver rifas"
  ON public.raffles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Solo admin gestiona rifas" ON public.raffles;
CREATE POLICY "Solo admin gestiona rifas"
  ON public.raffles
  FOR ALL
  USING (public.is_admin());

-- 3.4 Raffle Participants
ALTER TABLE public.raffle_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de participantes de rifas" ON public.raffle_participants;
CREATE POLICY "Lectura de participantes de rifas"
  ON public.raffle_participants
  FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Solo admin gestiona participantes" ON public.raffle_participants;
CREATE POLICY "Solo admin gestiona participantes"
  ON public.raffle_participants
  FOR ALL
  USING (public.is_admin());

-- ==============================================================================
-- 4. INTEGRACIÓN DE PUNTOS EN RPC: MARK_ORDER_DELIVERED
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
  v_points_to_grant integer := 0;
  v_new_balance integer := 0;
  v_already_granted boolean := false;
BEGIN
  -- 1. Bloqueo atómico del pedido
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

  -- 2. Descontar stock de cada líquido vendido
  FOR v_item IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.products
    SET stock_units = GREATEST(0, stock_units - v_item.quantity),
        updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  -- 3. Lógica de Puntos de Lealtad
  -- REGLA: Puntos = subtotal del líquido (SIN delivery), redondeado a entero hacia abajo.
  -- SOLO si tiene cuenta registrada (customer_id no nulo) y SOLO si es pedido regular (canjes no suman puntos).
  IF v_order.order_type = 'regular' AND v_order.customer_id IS NOT NULL THEN
    v_points_to_grant := FLOOR(COALESCE(v_order.subtotal_liquid, 0))::integer;

    IF v_points_to_grant > 0 THEN
      -- Verificación de idempotencia
      SELECT EXISTS (
        SELECT 1 FROM public.point_transactions
        WHERE order_id = p_order_id AND type = 'acumulacion_pedido'
      ) INTO v_already_granted;

      IF NOT v_already_granted THEN
        -- Incrementar balance de forma atómica
        UPDATE public.profiles
        SET points_balance = points_balance + v_points_to_grant,
            updated_at = now()
        WHERE id = v_order.customer_id
        RETURNING points_balance INTO v_new_balance;

        -- Registrar transacción de auditoría
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
          format('Puntos ganados por pedido entregado %s ($%s en líquido dispensado)', p_order_id, v_order.subtotal_liquid)
        );
      END IF;
    END IF;
  ELSIF v_order.order_type = 'canje' AND v_order.redemption_id IS NOT NULL THEN
    -- Actualizar estado de la solicitud de canje a entregado
    UPDATE public.redemptions
    SET status = 'entregado',
        updated_at = now()
    WHERE id = v_order.redemption_id;
  END IF;

  -- 4. Actualizar estado del pedido
  UPDATE public.orders
  SET status = 'entregado',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (
    p_order_id,
    'entregado',
    format('Líquidos dispensados y cobrados. Stock descontado. Puntos otorgados: %s.', v_points_to_grant)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'entregado',
    'points_granted', v_points_to_grant
  );
END;
$$;

-- ==============================================================================
-- 5. RPC: REVERTIR PEDIDO ENTREGADO CON DEDUCCIÓN DE PUNTOS
-- ==============================================================================

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

  -- 1. Restaurar stock de productos
  FOR v_item IN
    SELECT product_id, quantity
    FROM public.order_items
    WHERE order_id = p_order_id
  LOOP
    UPDATE public.products
    SET stock_units = stock_units + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id;
  END LOOP;

  -- 2. Revertir puntos si fueron otorgados
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

  -- 3. Marcar pedido cancelado
  UPDATE public.orders
  SET status = 'cancelado',
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (p_order_id, 'cancelado', format('Pedido revertido por administrador. Motivo: %s', p_reason));

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'cancelado');
END;
$$;

-- ==============================================================================
-- 6. RPC: SOLICITUD DE CANJE DE LÍQUIDO GRATIS POR EL CLIENTE
-- ==============================================================================

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
    RAISE EXCEPTION 'El líquido seleccionado no está disponible en catálogo.';
  END IF;

  IF v_prod.stock_units < 1 THEN
    RAISE EXCEPTION 'No hay stock disponible de este líquido para canje.';
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

-- ==============================================================================
-- 7. RPC: APROBACIÓN DE CANJE POR EL ADMIN (DESCUENTA PUNTOS Y CREA PEDIDO)
-- ==============================================================================

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

  -- 1. Descontar saldo y registrar transacción
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
    format('Canje aprobado: 1 llenada gratis de %s (-%s pts)', v_prod.name, v_redemption.points_cost),
    auth.uid()
  );

  -- 2. Calcular tarifa de delivery al punto de entrega
  v_distance_km := public.haversine_distance_km(
    v_store.latitude,
    v_store.longitude,
    v_redemption.destination_lat,
    v_redemption.destination_lng
  );
  v_delivery_fee := public.calculate_delivery_fee(v_distance_km);

  -- 3. Crear pedido oficial de delivery tipo "canje" (líquido a $0.00)
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
    0.00, -- Líquido gratis
    v_prod.cost_price,
    v_distance_km,
    v_delivery_fee,
    v_delivery_fee,
    v_delivery_fee,
    v_delivery_fee, -- Solo se abona la tarifa de envío del repartidor
    'pendiente_cotizacion',
    'canje',
    v_redemption.points_cost,
    v_redemption.id,
    'efectivo',
    format('CANJE DE PUNTOS: 1x %s gratis. Tarifa de delivery estándar.', v_prod.name)
  );

  -- Detalle del ítem con unit_price $0
  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_name,
    portion,
    unit_price,
    cost_price,
    quantity
  ) VALUES (
    v_order_id,
    v_prod.id,
    format('%s (Llenada Gratis x Puntos)', v_prod.name),
    v_redemption.portion,
    0.00,
    v_prod.cost_price,
    1
  );

  -- Vincular orden generada a la solicitud de canje
  UPDATE public.redemptions
  SET status = 'aprobado',
      generated_order_id = v_order_id,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_redemption_id;

  INSERT INTO public.order_status_history (order_id, status, note)
  VALUES (v_order_id, 'pendiente_cotizacion', format('Pedido de canje creado y aprobado por admin. Despacho asignable a repartidores.'));

  RETURN jsonb_build_object(
    'success', true,
    'redemption_id', p_redemption_id,
    'order_id', v_order_id,
    'remaining_points', v_new_balance
  );
END;
$$;

-- ==============================================================================
-- 8. RPC: RECHAZO O CANCELACIÓN DE CANJE CON REINTEGRO DE PUNTOS
-- ==============================================================================

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

  -- Solo admin o el propio cliente si sigue solicitado
  IF NOT public.is_admin() AND v_redemption.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este canje.';
  END IF;

  IF v_redemption.status IN ('rechazado', 'cancelado', 'entregado') THEN
    RAISE EXCEPTION 'El canje ya está en estado final (%).', v_redemption.status;
  END IF;

  -- Si ya había sido aprobado y los puntos fueron descontados, devolverlos
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

    -- Cancelar la orden generada si existía y aún no fue entregada
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

-- ==============================================================================
-- 9. RPC: AJUSTE MANUAL Y RESET DE PUNTOS POR ADMIN (AUDITORÍA OBLIGATORIA)
-- ==============================================================================

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
    'balance_after', v_new_balance
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

-- ==============================================================================
-- 10. RPCs: GESTIÓN DE RIFAS Y SORTEO AUTORITATIVO (RULETA)
-- ==============================================================================

-- 10.1 Sincronizar o crear participantes para una rifa activa
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

-- 10.2 Sorteo determinista en servidor con número de boleto ganador
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

  -- Si no tiene participantes, sincronizar primero
  IF v_raffle.total_tickets <= 0 THEN
    PERFORM public.sync_raffle_participants_admin(p_raffle_id);
    SELECT * INTO v_raffle FROM public.raffles WHERE id = p_raffle_id;
  END IF;

  IF v_raffle.total_tickets <= 0 THEN
    RAISE EXCEPTION 'No hay clientes activos elegibles para participar en este sorteo.';
  END IF;

  -- Generación de número de ticket ganador criptográficamente imparcial en Postgres
  v_winning_ticket := FLOOR(1 + (random() * v_raffle.total_tickets))::integer;

  -- Localizar al participante que posee ese rango de ticket
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
