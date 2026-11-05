import { supabase, isSupabaseConfigured } from './supabase';
import { Product, Order, OrderItem, StoreConfig, OrderStatus, Coordinates, UserAccount, ProductType, VapeVariant } from '../types';
import {
  getStoredOrders,
  saveOrders,
  getStoredProducts,
  saveProducts,
  getStoredStore,
  saveStore,
  isOrdersPurgedByAdmin,
  setOrdersPurgedByAdmin,
  getDeletedProductIds,
  markProductDeleted,
  isProductsCustomized,
  isStoreCustomized,
} from './storage';
import { calculateDistanceKm, calculateDeliveryFee } from './routing';
import {
  awardPointsForOrderLocal,
  getStoredRedemptions,
  saveRedemptions,
  rejectOrCancelRedemption,
  isUuid,
} from './supabasePoints';

const VAPE_META_PREFIX = '<!--VAPE_META:';
const VAPE_META_SUFFIX = '-->';

export function encodeProductDescription(product: Product): string {
  const rawDesc = (product.description || '').replace(/<!--VAPE_META:[\s\S]*?-->/g, '').trim();
  if (product.productType === 'vape' || (product.variants && product.variants.length > 0)) {
    const metaPayload = JSON.stringify({
      productType: product.productType || 'vape',
      variants: product.variants || [],
    });
    return `${rawDesc}${rawDesc ? ' ' : ''}${VAPE_META_PREFIX}${metaPayload}${VAPE_META_SUFFIX}`;
  }
  return rawDesc;
}

export function decodeProductDescription(rawDesc?: string): {
  cleanDescription: string;
  productType?: ProductType;
  variants?: VapeVariant[];
} {
  if (!rawDesc) return { cleanDescription: '' };
  const startIdx = rawDesc.indexOf(VAPE_META_PREFIX);
  if (startIdx === -1) {
    return { cleanDescription: rawDesc };
  }
  const endIdx = rawDesc.indexOf(VAPE_META_SUFFIX, startIdx);
  if (endIdx === -1) {
    return { cleanDescription: rawDesc };
  }
  const cleanDescription = (
    rawDesc.slice(0, startIdx) + rawDesc.slice(endIdx + VAPE_META_SUFFIX.length)
  ).trim();
  const jsonStr = rawDesc.slice(startIdx + VAPE_META_PREFIX.length, endIdx);
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      cleanDescription,
      productType: parsed.productType === 'vape' ? 'vape' : 'liquido',
      variants: Array.isArray(parsed.variants) ? parsed.variants : undefined,
    };
  } catch {
    return { cleanDescription };
  }
}

/**
 * Normalizes DB product row to client Product model
 */
export function mapDbProductToClient(row: any): Product {
  const decoded = decodeProductDescription(row.description || '');
  const isVapeCategory =
    decoded.productType === 'vape' ||
    row.product_type === 'vape' ||
    (typeof row.flavor_category === 'string' &&
      row.flavor_category.toLowerCase().includes('vape'));
  const variants: VapeVariant[] | undefined =
    decoded.variants || (Array.isArray(row.variants) ? row.variants : undefined);
  const computedStock =
    isVapeCategory && variants && variants.length > 0
      ? variants.reduce((sum, v) => sum + Number(v.stockUnits || 0), 0)
      : Number(row.stock_units || 0);

  return {
    id: row.id,
    name: row.name,
    productType: isVapeCategory ? 'vape' : 'liquido',
    flavorCategory: row.flavor_category,
    nicotineMg: Number(row.nicotine_mg || 0),
    imageUrl: row.image_url,
    stockUnits: computedStock,
    costPrice: Number(row.cost_price || 0),
    priceFullTank: Number(row.price_full_tank || 100),
    priceHalfTank: Number(row.price_half_tank || row.price_full_tank || 50),
    description: decoded.cleanDescription,
    variants,
    isActive: Boolean(row.is_active),
  };
}

const DEMO_ORDER_IDS = new Set(['ORD-700', 'ORD-701', 'ORD-702', 'ORD-901', 'ORD-902']);
const DEFAULT_PRODUCTION_BANK_INFO =
  'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901';

/**
 * Normalizes DB store row to client StoreConfig model
 */
export function mapDbStoreToClient(row: any): StoreConfig {
  const rawBank = row.bank_account_info || '';
  const isLegacyBank =
    !rawBank ||
    rawBank.includes('960-441209-1') ||
    rawBank.includes('960-000000-0') ||
    rawBank.includes('789456123');

  return {
    name: row.name,
    addressText: row.address_text,
    location: {
      lat: Number(row.latitude || 19.41688),
      lng: Number(row.longitude || -71.61287),
    },
    phone: row.phone && row.phone !== '8095550199' ? row.phone : '8092104901',
    whatsapp: row.whatsapp && row.whatsapp !== '8095550199' ? row.whatsapp : '8092104901',
    bankAccountInfo: isLegacyBank ? DEFAULT_PRODUCTION_BANK_INFO : rawBank,
    isOpen: Boolean(row.is_open),
    pointsPerRedemption: Number(row.points_per_redemption ?? 1000),
    redemptionsEnabled: row.redemptions_enabled !== undefined ? Boolean(row.redemptions_enabled) : true,
  };
}

/**
 * Normalizes DB order row to client Order model
 */
export function mapDbOrderToClient(row: any, items: OrderItem[] = [], statusHistory: any[] = []): Order {
  const mappedItems: OrderItem[] = items.length > 0 ? items : (row.order_items || []).map((it: any) => ({
    productId: it.product_id,
    productName: it.product_name,
    portion: it.portion,
    unitPrice: Number(it.unit_price),
    costPrice: Number(it.cost_price || 0),
    quantity: Number(it.quantity),
  }));

  const history = (statusHistory.length > 0 ? statusHistory : (row.order_status_history || [])).map((h: any) => ({
    status: h.status as OrderStatus,
    timestamp: h.created_at || h.timestamp || new Date().toISOString(),
    note: h.note,
  }));

  if (history.length === 0) {
    history.push({
      status: row.status as OrderStatus,
      timestamp: row.created_at || new Date().toISOString(),
    });
  }

  return {
    id: row.id,
    createdAt: row.created_at || new Date().toISOString(),
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deliveryAddressNote: row.delivery_address_note,
    location: {
      lat: Number(row.destination_lat),
      lng: Number(row.destination_lng),
    },
    items: mappedItems,
    subtotalLiquid: Number(row.subtotal_liquid || 0),
    liquidCostTotal: Number(row.liquid_cost_total || 0),
    deliveryFee: Number(row.final_delivery_fee ?? row.calculated_delivery_fee ?? 25),
    calculatedDeliveryFee: Number(row.calculated_delivery_fee ?? 25),
    proposedDeliveryFee: row.proposed_delivery_fee !== null ? Number(row.proposed_delivery_fee) : undefined,
    calculatedDistanceKm: Number(row.calculated_distance_km ?? 0),
    totalAmount: Number(row.total_amount || 0),
    status: row.status as OrderStatus,
    statusHistory: history,
    driverId: row.driver_id,
    driverName: row.driver_name,
    paymentMethod: row.payment_method,
    cashGiven: row.cash_given ? Number(row.cash_given) : undefined,
    changeDue: row.change_due ? Number(row.change_due) : undefined,
    specialNotes: row.special_notes,
    orderType: row.order_type || 'regular',
    pointsRedeemed: row.points_redeemed ? Number(row.points_redeemed) : 0,
    redemptionId: row.redemption_id,
    isRemoteLocation: Boolean(row.is_remote_location || (row.calculated_distance_km && row.calculated_distance_km > 15)),
    detectedRegion: row.detected_region,
    locationAccuracyMeters: row.location_accuracy_meters ? Number(row.location_accuracy_meters) : undefined,
  };
}

const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  pendiente_cotizacion: 1,
  tarifa_propuesta: 2,
  aprobado_en_preparacion: 3,
  en_camino: 4,
  llegada_a_destino: 5,
  entregado: 6,
  cancelado: 6,
};

/**
 * 1. Fetch Products from Supabase (merged with local customizations)
 */
export async function fetchProducts(): Promise<Product[]> {
  const localProducts = getStoredProducts();
  const deletedIds = new Set(getDeletedProductIds());

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (!error && data && data.length > 0) {
        const serverProducts = data
          .map(mapDbProductToClient)
          .filter((p) => !deletedIds.has(p.id));

        const serverIds = new Set(serverProducts.map((p) => p.id));
        const missingVapes = localProducts.filter(
          (lp) => lp.productType === 'vape' && !serverIds.has(lp.id) && !deletedIds.has(lp.id)
        );
        const enrichedServerProducts = [...serverProducts, ...missingVapes];

        if (isProductsCustomized()) {
          // Preserve locally added/edited products and stock while including any new server products
          const localMap = new Map(localProducts.map((p) => [p.id, p]));
          const merged: Product[] = [...localProducts.filter((p) => !deletedIds.has(p.id))];

          for (const sp of enrichedServerProducts) {
            if (!localMap.has(sp.id)) {
              merged.push(sp);
            }
          }
          saveProducts(merged, false);
          return merged;
        }

        saveProducts(enrichedServerProducts, false);
        return enrichedServerProducts;
      }
    } catch (err) {
      console.warn('Error al cargar productos de Supabase, usando local cache:', err);
    }
  }
  return localProducts.filter((p) => !deletedIds.has(p.id));
}

/**
 * 2. Fetch Store Config from Supabase (respects local admin edits)
 */
export async function fetchStoreConfig(): Promise<StoreConfig> {
  const localStore = getStoredStore();
  if (isStoreCustomized()) {
    return localStore;
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('store_config')
        .select('*')
        .eq('id', 1)
        .single();

      if (!error && data) {
        const mapped = mapDbStoreToClient(data);
        saveStore(mapped, false);
        return mapped;
      }
    } catch (err) {
      console.warn('Error al cargar configuración de tienda de Supabase:', err);
    }
  }
  return localStore;
}

/**
 * 3. Fetch Orders with Items and Status History from Supabase
 * Merges server orders with local orders so RLS empty responses never wipe local orders on refresh.
 */
export async function fetchOrders(): Promise<Order[]> {
  const localOrders = getStoredOrders();

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*), order_status_history(*)')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const allServerOrders = data.map((o) => mapDbOrderToClient(o));
        const hasServerDemoOrders = allServerOrders.some((o) => DEMO_ORDER_IDS.has(o.id));
        if (hasServerDemoOrders) {
          supabase
            .from('orders')
            .delete()
            .in('id', Array.from(DEMO_ORDER_IDS))
            .then(() => {}, () => {});
        }
        const serverOrders = allServerOrders.filter((o) => !DEMO_ORDER_IDS.has(o.id));
        const mergedMap = new Map<string, Order>();

        for (const so of serverOrders) {
          mergedMap.set(so.id, so);
        }

        if (!isOrdersPurgedByAdmin()) {
          for (const lo of localOrders) {
            if (DEMO_ORDER_IDS.has(lo.id)) continue;
            const existingServer = mergedMap.get(lo.id);
            if (!existingServer) {
              mergedMap.set(lo.id, lo);
            } else {
              const localRank = ORDER_STATUS_RANK[lo.status] || 0;
              const serverRank = ORDER_STATUS_RANK[existingServer.status] || 0;
              const useLocalState =
                localRank > serverRank ||
                (localRank === serverRank &&
                  (lo.statusHistory?.length || 0) >= (existingServer.statusHistory?.length || 0));

              mergedMap.set(lo.id, {
                ...(useLocalState ? lo : existingServer),
                customerId: lo.customerId || existingServer.customerId,
                driverId: lo.driverId || existingServer.driverId,
                driverName: lo.driverName || existingServer.driverName,
                driverPhone: lo.driverPhone || existingServer.driverPhone,
                driverLocation: lo.driverLocation || existingServer.driverLocation,
                orderType: lo.orderType || existingServer.orderType,
                redemptionId: lo.redemptionId || existingServer.redemptionId,
                pointsRedeemed: lo.pointsRedeemed ?? existingServer.pointsRedeemed,
                items:
                  existingServer.items && existingServer.items.length > 0
                    ? existingServer.items
                    : lo.items,
              });
            }
          }
        }

        const mergedList = Array.from(mergedMap.values())
          .filter((o) => !DEMO_ORDER_IDS.has(o.id))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        saveOrders(mergedList);
        return mergedList;
      }
    } catch (err) {
      console.warn('Error al cargar pedidos de Supabase, usando local cache:', err);
    }
  }
  return localOrders;
}

export interface CreateOrderParams {
  orderId?: string;
  customerId?: string;
  orderType?: 'regular' | 'standard' | 'canje';
  redemptionId?: string;
  pointsRedeemed?: number;
  customerName: string;
  customerPhone: string;
  deliveryAddressNote?: string;
  destination: Coordinates;
  paymentMethod: 'efectivo' | 'transferencia' | 'tarjeta';
  cashGiven?: number;
  specialNotes?: string;
  isRemoteLocation?: boolean;
  detectedRegion?: string;
  locationAccuracyMeters?: number;
  items: Array<{
    productId: string;
    productType?: ProductType;
    portion: 'tanque_lleno' | 'mitad';
    quantity: number;
    variantId?: string;
    variantColor?: string;
    variantImage?: string;
  }>;
}

/**
 * Server-side order creation validation helper (matches server RPC contract)
 */
export function validateOrderInput(params: CreateOrderParams): { valid: boolean; error?: string } {
  if (!params.customerName || params.customerName.trim().length < 2) {
    return { valid: false, error: 'El nombre del cliente es obligatorio y debe tener al menos 2 caracteres.' };
  }

  // Dominican phone check: 809, 829, 849 (10 digits)
  const digits = (params.customerPhone || '').replace(/\D/g, '');
  const cleanDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (
    cleanDigits.length !== 10 ||
    (!cleanDigits.startsWith('809') && !cleanDigits.startsWith('829') && !cleanDigits.startsWith('849'))
  ) {
    return {
      valid: false,
      error: 'El teléfono debe ser un número dominicano válido (809, 829 o 849 con 10 dígitos).',
    };
  }

  // Coordinates validation
  const { lat, lng } = params.destination || {};
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    isNaN(lat) ||
    isNaN(lng) ||
    lat === 0 ||
    lng === 0 ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { valid: false, error: 'La ubicación de entrega (coordenadas GPS) es inválida.' };
  }

  if (!params.items || params.items.length === 0) {
    return { valid: false, error: 'El pedido debe contener al menos un líquido.' };
  }

  for (const it of params.items) {
    if (!it.quantity || it.quantity <= 0 || !Number.isInteger(it.quantity)) {
      return { valid: false, error: 'La cantidad de cada líquido debe ser un número entero mayor a 0.' };
    }
    if (it.portion !== 'tanque_lleno' && it.portion !== 'mitad') {
      return { valid: false, error: 'Porción inválida: debe ser tanque_lleno o mitad.' };
    }
  }

  if (!['efectivo', 'transferencia', 'tarjeta'].includes(params.paymentMethod)) {
    return { valid: false, error: 'Método de pago inválido. Debe ser efectivo, transferencia o tarjeta.' };
  }

  return { valid: true };
}

/**
 * 4. Create Order on Server (Precios y Distancia calculados estrictamente en servidor)
 */
export async function createOrderOnServer(
  params: CreateOrderParams,
  storeConfig: StoreConfig,
  currentProducts: Product[]
): Promise<{ success: boolean; order?: Order; error?: string }> {
  // 1. Client-side pre-validation
  const validation = validateOrderInput(params);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const generatedId = params.orderId || `ORD-${Math.floor(100 + Math.random() * 900)}`;

  // 2. Always validate stock and compute Haversine + 1.5km = $25 DOP rule
  const distanceKm = calculateDistanceKm(storeConfig.location, params.destination);
  const feeCalc = calculateDeliveryFee(distanceKm);
  const deliveryFee = feeCalc.fee;

  let subtotalLiquid = 0;
  let liquidCostTotal = 0;
  const orderItems: OrderItem[] = [];

  const requestedQtyByProduct = new Map<string, number>();
  for (const it of params.items) {
    requestedQtyByProduct.set(it.productId, (requestedQtyByProduct.get(it.productId) || 0) + it.quantity);
  }

  for (const [productId, totalQty] of requestedQtyByProduct.entries()) {
    const prod = currentProducts.find((p) => p.id === productId);
    if (!prod) {
      return { success: false, error: `Producto con ID ${productId} no encontrado.` };
    }
    if (prod.stockUnits < totalQty) {
      return {
        success: false,
        error: `Stock insuficiente para ${prod.name}. Solicitaste ${totalQty} y solo quedan ${prod.stockUnits} disponibles.`,
      };
    }
  }

  for (const it of params.items) {
    const prod = currentProducts.find((p) => p.id === it.productId)!;
    const isVape = prod.productType === 'vape' || it.productType === 'vape';

    // Validate per-color variant stock if applicable
    if (isVape && prod.variants && prod.variants.length > 0 && (it.variantId || it.variantColor)) {
      const targetVar = prod.variants.find(
        (v) => v.id === it.variantId || v.colorName === it.variantColor
      );
      if (targetVar && targetVar.stockUnits < it.quantity) {
        return {
          success: false,
          error: `Stock insuficiente para ${prod.name} (Color: ${targetVar.colorName}). Quedan ${targetVar.stockUnits} disponibles.`,
        };
      }
    }

    const unitPrice = isVape
      ? prod.priceFullTank
      : it.portion === 'tanque_lleno'
      ? prod.priceFullTank
      : prod.priceHalfTank;
    subtotalLiquid += unitPrice * it.quantity;
    liquidCostTotal += prod.costPrice * it.quantity;

    const displayName =
      isVape && it.variantColor && !prod.name.includes(`(${it.variantColor})`)
        ? `${prod.name} (${it.variantColor})`
        : prod.name;

    orderItems.push({
      productId: prod.id,
      productName: displayName,
      productType: isVape ? 'vape' : 'liquido',
      portion: isVape ? 'tanque_lleno' : it.portion,
      unitPrice,
      costPrice: prod.costPrice,
      quantity: it.quantity,
      variantId: it.variantId,
      variantColor: it.variantColor,
      variantImage: it.variantImage,
    });
  }

  const totalAmount = subtotalLiquid + deliveryFee;
  const changeDue =
    params.paymentMethod === 'efectivo' && params.cashGiven && params.cashGiven >= totalAmount
      ? params.cashGiven - totalAmount
      : undefined;

  const finalOrder: Order = {
    id: generatedId,
    customerId: params.customerId,
    orderType: params.orderType || 'regular',
    redemptionId: params.redemptionId,
    pointsRedeemed: params.pointsRedeemed,
    createdAt: new Date().toISOString(),
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    deliveryAddressNote: params.deliveryAddressNote?.trim(),
    location: params.destination,
    items: orderItems,
    subtotalLiquid,
    liquidCostTotal,
    deliveryFee,
    calculatedDeliveryFee: deliveryFee,
    proposedDeliveryFee: deliveryFee,
    calculatedDistanceKm: distanceKm,
    totalAmount,
    status: 'pendiente_cotizacion',
    statusHistory: [
      {
        status: 'pendiente_cotizacion',
        timestamp: new Date().toISOString(),
        note: `Pedido registrado. Distancia: ${distanceKm} km. Tarifa oficial: $${deliveryFee} DOP.`,
      },
    ],
    paymentMethod: params.paymentMethod,
    cashGiven: params.cashGiven,
    changeDue,
    specialNotes: params.specialNotes,
    isRemoteLocation: Boolean(params.isRemoteLocation || distanceKm > 15),
    detectedRegion: params.detectedRegion,
    locationAccuracyMeters: params.locationAccuracyMeters,
  };

  // Persist locally immediately so page refreshes never lose the order
  const stored = getStoredOrders().filter((o) => o.id !== finalOrder.id);
  saveOrders([finalOrder, ...stored]);

  // Also sync to Supabase via create_order_secure RPC
  if (isSupabaseConfigured()) {
    try {
      const dbItems = params.items.map((it) => ({
        product_id: it.productId,
        portion: it.portion,
        quantity: it.quantity,
      }));

      const { error } = await supabase.rpc('create_order_secure', {
        p_order_id: generatedId,
        p_customer_name: params.customerName.trim(),
        p_customer_phone: params.customerPhone.trim(),
        p_delivery_address_note: params.deliveryAddressNote?.trim() || null,
        p_destination_lat: params.destination.lat,
        p_destination_lng: params.destination.lng,
        p_payment_method: params.paymentMethod,
        p_cash_given: params.cashGiven || null,
        p_special_notes: params.specialNotes?.trim() || null,
        p_items: dbItems,
      });

      if (!error) {
        const { data: orderData } = await supabase
          .from('orders')
          .select('*, order_items(*), order_status_history(*)')
          .eq('id', generatedId)
          .maybeSingle();

        if (orderData) {
          const mappedOrder: Order = {
            ...mapDbOrderToClient(orderData),
            items: finalOrder.items,
            customerId: finalOrder.customerId || orderData.customer_id,
            orderType: finalOrder.orderType,
            redemptionId: finalOrder.redemptionId,
            pointsRedeemed: finalOrder.pointsRedeemed,
          };
          saveOrders([mappedOrder, ...stored]);
          return { success: true, order: mappedOrder };
        }
      }
    } catch (err) {
      console.warn('Aviso al sincronizar pedido con Supabase (guardado localmente):', err);
    }
  }

  return { success: true, order: finalOrder };
}

/**
 * 5. Atomic Order Assignment (RPC accept_order_atomic)
 * Prevents race condition where two drivers claim the same order simultaneously.
 */
export async function assignDriverAtomic(
  orderId: string,
  driver: UserAccount
): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredOrders();
  const target = stored.find((o) => o.id === orderId);

  if (target && target.driverId && target.driverId !== driver.id) {
    return {
      success: false,
      error: `Este pedido ya fue tomado por ${target.driverName || 'otro repartidor'}.`,
    };
  }

  if (isSupabaseConfigured() && isUuid(driver.id)) {
    try {
      const { error } = await supabase.rpc('accept_order_atomic', {
        p_order_id: orderId,
        p_driver_id: driver.id,
      });

      if (error && error.message?.includes('ya fue tomado')) {
        return { success: false, error: error.message };
      }
    } catch (err) {
      console.warn('Aviso en accept_order_atomic (aplicando localmente):', err);
    }
  }

  if (target) {
    target.driverId = driver.id;
    target.driverName = driver.name;
    target.driverPhone = driver.phone;
    target.status = 'en_camino';
    target.statusHistory.push({
      status: 'en_camino',
      timestamp: new Date().toISOString(),
      note: `Pedido asignado a ${driver.name} y puesto en camino.`,
    });
    saveOrders(stored);
  }

  return { success: true };
}

/**
 * 6. Mark Delivered with Atomic Server Stock Decrement (RPC mark_order_delivered)
 */
export async function markOrderDeliveredOnServer(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  const orders = getStoredOrders();
  const products = getStoredProducts();
  const targetOrder = orders.find((o) => o.id === orderId);

  if (!targetOrder) return { success: false, error: 'Pedido no encontrado.' };
  if (targetOrder.status === 'entregado') return { success: true };

  // Decrement stock summing all portions for the same productId (and per-variant stock for Vapes)
  const updatedProducts = products.map((prod) => {
    const matchingItems = targetOrder.items.filter((it) => it.productId === prod.id);
    const soldQuantity = matchingItems.reduce((sum, it) => sum + it.quantity, 0);
    if (soldQuantity <= 0) return prod;

    if (prod.productType === 'vape' && prod.variants && prod.variants.length > 0) {
      const updatedVariants = prod.variants.map((v) => ({ ...v }));
      for (const it of matchingItems) {
        const targetIdx = updatedVariants.findIndex(
          (v) =>
            (it.variantId && v.id === it.variantId) ||
            (it.variantColor && v.colorName.toLowerCase() === it.variantColor.toLowerCase()) ||
            it.productName.toLowerCase().includes(`(${v.colorName.toLowerCase()})`)
        );
        if (targetIdx >= 0) {
          updatedVariants[targetIdx].stockUnits = Math.max(
            0,
            updatedVariants[targetIdx].stockUnits - it.quantity
          );
        } else {
          const firstWithStock = updatedVariants.findIndex((v) => v.stockUnits > 0);
          if (firstWithStock >= 0) {
            updatedVariants[firstWithStock].stockUnits = Math.max(
              0,
              updatedVariants[firstWithStock].stockUnits - it.quantity
            );
          }
        }
      }
      const newTotalStock = updatedVariants.reduce((sum, v) => sum + v.stockUnits, 0);
      const updatedVapeProd: Product = {
        ...prod,
        variants: updatedVariants,
        stockUnits: newTotalStock,
      };
      saveProductToServer(updatedVapeProd).catch(() => {});
      return updatedVapeProd;
    }

    return {
      ...prod,
      stockUnits: Math.max(0, prod.stockUnits - soldQuantity),
    };
  });

  targetOrder.status = 'entregado';
  targetOrder.statusHistory.push({
    status: 'entregado',
    timestamp: new Date().toISOString(),
    note: 'Líquidos dispensados en tanque y cobrados con éxito. Stock descontado.',
  });

  // Award loyalty points if registered customer and not a free redemption order
  if (targetOrder.customerId && targetOrder.orderType !== 'canje') {
    awardPointsForOrderLocal(targetOrder.id, targetOrder.customerId, targetOrder.subtotalLiquid);
  }

  // If this was a free liquid redemption order, update redemption record to delivered
  if (targetOrder.orderType === 'canje' && targetOrder.redemptionId) {
    const redemptions = getStoredRedemptions();
    const r = redemptions.find((item) => item.id === targetOrder.redemptionId);
    if (r) {
      r.status = 'entregado' as any;
      r.updatedAt = new Date().toISOString();
      saveRedemptions(redemptions);
    }
  }

  saveProducts(updatedProducts);
  saveOrders(orders);

  if (isSupabaseConfigured()) {
    try {
      await supabase.rpc('mark_order_delivered', {
        p_order_id: orderId,
      });
    } catch (err) {
      console.warn('Aviso al sincronizar entrega en Supabase:', err);
    }
  }

  return { success: true };
}

/**
 * 7. Propose Fare (Repartidor propone tarifa, se guarda tanto la calculada como la propuesta)
 */
export async function proposeFareOnServer(
  orderId: string,
  fee: number
): Promise<{ success: boolean; error?: string }> {
  const orders = getStoredOrders();
  const target = orders.find((o) => o.id === orderId);
  if (target) {
    target.proposedDeliveryFee = fee;
    target.deliveryFee = fee;
    target.totalAmount = target.subtotalLiquid + fee;
    if (target.paymentMethod === 'efectivo' && target.cashGiven) {
      target.changeDue = target.cashGiven >= target.totalAmount ? target.cashGiven - target.totalAmount : undefined;
    }
    target.status = 'tarifa_propuesta';
    target.statusHistory.push({
      status: 'tarifa_propuesta',
      timestamp: new Date().toISOString(),
      note: `Repartidor propone tarifa de $${fee} DOP.`,
    });
    saveOrders(orders);
  }

  if (isSupabaseConfigured()) {
    try {
      const subtotal = target?.subtotalLiquid ?? 0;
      await supabase
        .from('orders')
        .update({
          proposed_delivery_fee: fee,
          final_delivery_fee: fee,
          total_amount: subtotal + fee,
          status: 'tarifa_propuesta',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'tarifa_propuesta',
        note: `Repartidor propone tarifa de $${fee} DOP.`,
      });
    } catch (err) {
      console.warn('Aviso al sincronizar tarifa propuesta en Supabase:', err);
    }
  }

  return { success: true };
}

/**
 * 8. Realtime Channel Subscription
 * Subscribes to postgres_changes on orders, products and store_config
 */
export function subscribeToSupabaseRealtime(
  onOrdersChange: () => void,
  onProductsChange?: () => void,
  onStoreChange?: () => void
): () => void {
  if (!isSupabaseConfigured()) {
    return () => {};
  }

  const channel = supabase
    .channel('black_vape_realtime_channel')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => {
        onOrdersChange();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => {
        onProductsChange?.();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'store_config' },
      () => {
        onStoreChange?.();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * 9. Clear Test Orders (Admin-Only with double confirmation)
 */
export async function clearTestOrdersOnServer(
  adminUser: UserAccount | null
): Promise<{ success: boolean; error?: string; deletedCount?: number }> {
  if (!adminUser || adminUser.role !== 'admin') {
    return {
      success: false,
      error: 'Acceso denegado: solo un administrador autenticado puede purgar los pedidos.',
    };
  }

  const count = getStoredOrders().length;
  setOrdersPurgedByAdmin(true);
  saveOrders([]);

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.rpc('clear_test_orders_admin');
      if (error) {
        await supabase.from('orders').delete().neq('id', '');
      }
    } catch (err) {
      console.warn('Aviso al purgar pedidos en Supabase:', err);
    }
  }

  return { success: true, deletedCount: count };
}

/**
 * 10. Save or update product on server
 */
export async function saveProductToServer(product: Product): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const encodedDescription = encodeProductDescription(product);
      const totalStock =
        product.productType === 'vape' && product.variants && product.variants.length > 0
          ? product.variants.reduce((sum, v) => sum + Number(v.stockUnits || 0), 0)
          : product.stockUnits;

      const { error } = await supabase.from('products').upsert({
        id: product.id,
        name: product.name,
        flavor_category: product.flavorCategory,
        nicotine_mg: product.nicotineMg,
        image_url: product.imageUrl,
        stock_units: totalStock,
        cost_price: product.costPrice,
        price_full_tank: product.priceFullTank,
        price_half_tank: product.priceHalfTank,
        description: encodedDescription,
        is_active: product.isActive,
        updated_at: new Date().toISOString(),
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  return { success: true };
}

/**
 * 11. Delete product on server (sets is_active to false and marks locally deleted)
 */
export async function deleteProductFromServer(productId: string): Promise<{ success: boolean; error?: string }> {
  markProductDeleted(productId);
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', productId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  return { success: true };
}

/**
 * 12. Save store config on server
 */
export async function saveStoreConfigToServer(store: StoreConfig): Promise<{ success: boolean; error?: string }> {
  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase.from('store_config').update({
        name: store.name,
        address_text: store.addressText,
        latitude: store.location.lat,
        longitude: store.location.lng,
        phone: store.phone,
        whatsapp: store.whatsapp,
        bank_account_info: store.bankAccountInfo,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  return { success: true };
}

/**
 * 13. Persist general order status change to local storage + Supabase
 */
export async function updateOrderStatusOnServer(
  orderId: string,
  newStatus: OrderStatus,
  note: string,
  driver?: UserAccount | null
): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredOrders();
  const target = stored.find((o) => o.id === orderId);
  if (target) {
    target.status = newStatus;
    if (driver && driver.role === 'delivery') {
      target.driverId = driver.id;
      target.driverName = driver.name;
      target.driverPhone = driver.phone;
    }
    target.statusHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note,
    });
    saveOrders(stored);

    // If a loyalty redemption order ('canje') is rejected/canceled, automatically refund the customer's points
    if (newStatus === 'cancelado' && target.orderType === 'canje' && target.redemptionId) {
      const redemptions = getStoredRedemptions();
      const linkedRedemp = redemptions.find((r) => r.id === target.redemptionId);
      if (linkedRedemp && linkedRedemp.status !== 'rechazado') {
        await rejectOrCancelRedemption(
          target.redemptionId,
          note || 'Pedido de canje rechazado/cancelado',
          driver?.id
        );
      }
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const updatePayload: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (driver && driver.role === 'delivery' && isUuid(driver.id)) {
        updatePayload.driver_id = driver.id;
        updatePayload.driver_name = driver.name;
        updatePayload.driver_phone = driver.phone || null;
      }

      await supabase.from('orders').update(updatePayload).eq('id', orderId);
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: newStatus,
        note,
      });
    } catch (err) {
      console.warn('Aviso al sincronizar estado en Supabase:', err);
    }
  }
  return { success: true };
}

/**
 * 14. Persist customer fare approval to local storage + Supabase
 */
export async function approveOrderFareOnServer(
  orderId: string,
  approvedFee: number,
  subtotalLiquid: number
): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredOrders();
  const target = stored.find((o) => o.id === orderId);
  if (target) {
    target.deliveryFee = approvedFee;
    target.totalAmount = subtotalLiquid + approvedFee;
    if (target.paymentMethod === 'efectivo' && target.cashGiven) {
      target.changeDue = target.cashGiven >= target.totalAmount ? target.cashGiven - target.totalAmount : undefined;
    }
    target.status = 'aprobado_en_preparacion';
    target.statusHistory.push({
      status: 'aprobado_en_preparacion',
      timestamp: new Date().toISOString(),
      note: `Cliente aceptó la tarifa de $${approvedFee} DOP. Pedido aprobado para preparación.`,
    });
    saveOrders(stored);
  }

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('orders')
        .update({
          final_delivery_fee: approvedFee,
          total_amount: subtotalLiquid + approvedFee,
          status: 'aprobado_en_preparacion',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'aprobado_en_preparacion',
        note: `Cliente aceptó la tarifa de $${approvedFee} DOP. Pedido aprobado para preparación.`,
      });
    } catch (err) {
      console.warn('Aviso al sincronizar aprobación de tarifa en Supabase:', err);
    }
  }
  return { success: true };
}

/**
 * 15. Persist customer order destination/location update to local storage + Supabase
 */
export async function updateOrderLocationOnServer(
  orderId: string,
  newCoords: Coordinates,
  addressNote: string | undefined,
  newFee: number,
  distanceKm: number,
  subtotalLiquid: number
): Promise<{ success: boolean; error?: string }> {
  const stored = getStoredOrders();
  const target = stored.find((o) => o.id === orderId);
  if (target) {
    target.location = newCoords;
    target.calculatedDistanceKm = distanceKm;
    target.calculatedDeliveryFee = newFee;
    target.proposedDeliveryFee = newFee;
    target.deliveryFee = newFee;
    target.totalAmount = subtotalLiquid + newFee;
    if (target.paymentMethod === 'efectivo' && target.cashGiven) {
      target.changeDue = target.cashGiven >= target.totalAmount ? target.cashGiven - target.totalAmount : undefined;
    }
    if (addressNote !== undefined) {
      target.deliveryAddressNote = addressNote;
    }
    target.statusHistory.push({
      status: target.status,
      timestamp: new Date().toISOString(),
      note: `Cliente actualizó su ubicación en el mapa (${distanceKm} km • Tarifa: $${newFee} DOP).`,
    });
    saveOrders(stored);
  }

  if (isSupabaseConfigured()) {
    try {
      const updatePayload: Record<string, any> = {
        destination_lat: newCoords.lat,
        destination_lng: newCoords.lng,
        calculated_distance_km: distanceKm,
        calculated_delivery_fee: newFee,
        proposed_delivery_fee: newFee,
        final_delivery_fee: newFee,
        total_amount: subtotalLiquid + newFee,
        updated_at: new Date().toISOString(),
      };
      if (addressNote !== undefined) {
        updatePayload.delivery_address_note = addressNote;
      }

      await supabase.from('orders').update(updatePayload).eq('id', orderId);
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: 'pendiente_cotizacion',
        note: `Cliente actualizó su ubicación en el mapa (${distanceKm} km • Tarifa: $${newFee} DOP).`,
      });
    } catch (err) {
      console.warn('Aviso al sincronizar ubicación en Supabase:', err);
    }
  }
  return { success: true };
}

