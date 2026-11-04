import { supabase, isSupabaseConfigured } from './supabase';
import {
  PointTransaction,
  PointTransactionType,
  RedemptionRequest,
  RedemptionStatus,
  Raffle,
  RaffleParticipant,
  RaffleDrawType,
  PortionType,
  Order,
} from '../types';
import { notifySync, getStoredOrders, saveOrders } from './storage';
import { getStoredUsers, saveUsersCache } from './auth';
import {
  calculateRaffleTickets,
  findWinnerByTicketNumber,
  validatePointAdjustment,
} from './points';

const STORAGE_KEYS = {
  POINT_TRANSACTIONS: 'vape_point_transactions_v1',
  REDEMPTIONS: 'vape_redemptions_v1',
  RAFFLES: 'vape_raffles_v1',
  RAFFLE_PARTICIPANTS: 'vape_raffle_participants_v1',
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(id?: string): boolean {
  return Boolean(id && UUID_REGEX.test(id));
}

// ---------------------------------------------------------------------------
// Local Cache Helpers (for dev fallback or instant UI feedback)
// ---------------------------------------------------------------------------

export function getStoredPointTransactions(): PointTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.POINT_TRANSACTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePointTransactions(txs: PointTransaction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.POINT_TRANSACTIONS, JSON.stringify(txs));
  notifySync();
}

/**
 * Local fallback award points helper (idempotent: awards once per order)
 */
export function awardPointsForOrderLocal(
  orderId: string,
  userId: string,
  subtotalLiquid: number
): { awarded: boolean; points: number } {
  const points = Math.floor(subtotalLiquid);
  if (points <= 0) return { awarded: false, points: 0 };

  const txs = getStoredPointTransactions();
  const alreadyAwarded = txs.some(
    (t) => t.orderId === orderId && t.transactionType === 'ganado_pedido'
  );
  if (alreadyAwarded) {
    return { awarded: false, points: 0 };
  }

  const users = getStoredUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { awarded: false, points: 0 };

  const newBalance = Number(user.pointsBalance || 0) + points;
  user.pointsBalance = newBalance;
  saveUsersCache(users);

  const newTx: PointTransaction = {
    id: `tx-ord-${orderId}-${Date.now()}`,
    userId,
    orderId,
    points,
    transactionType: 'ganado_pedido',
    reason: `Puntos por recarga de líquido en pedido #${orderId}`,
    balanceAfter: newBalance,
    createdAt: new Date().toISOString(),
  };

  savePointTransactions([newTx, ...txs]);
  return { awarded: true, points };
}

export async function fetchUserPointsBalance(userId: string): Promise<number> {
  if (isSupabaseConfigured() && isUuid(userId)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('points_balance')
        .eq('id', userId)
        .maybeSingle();
      if (!error && data) {
        return Number(data.points_balance || 0);
      }
    } catch (err) {
      console.warn('Error fetching user points from Supabase:', err);
    }
  }
  const users = getStoredUsers();
  const u = users.find((x) => x.id === userId);
  return Number(u?.pointsBalance || 0);
}

export function getStoredRedemptions(): RedemptionRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REDEMPTIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRedemptions(redemptions: RedemptionRequest[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.REDEMPTIONS, JSON.stringify(redemptions));
  notifySync();
}

export function getStoredRaffles(): Raffle[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RAFFLES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRaffles(raffles: Raffle[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.RAFFLES, JSON.stringify(raffles));
  notifySync();
}

export function getStoredRaffleParticipants(raffleId?: string): RaffleParticipant[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RAFFLE_PARTICIPANTS);
    const list: RaffleParticipant[] = raw ? JSON.parse(raw) : [];
    return raffleId ? list.filter((p) => p.raffleId === raffleId) : list;
  } catch {
    return [];
  }
}

export function saveRaffleParticipants(participants: RaffleParticipant[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.RAFFLE_PARTICIPANTS, JSON.stringify(participants));
  notifySync();
}

// ---------------------------------------------------------------------------
// DB Row Mappers
// ---------------------------------------------------------------------------

function mapDbTransactionToClient(row: any): PointTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    points: Number(row.points || 0),
    transactionType: (row.transaction_type || row.type || 'pedido_entregado') as PointTransactionType,
    orderId: row.order_id,
    redemptionId: row.redemption_id,
    reason: row.reason,
    adminId: row.admin_id || row.created_by,
    balanceAfter: Number(row.balance_after || 0),
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function mapDbRedemptionToClient(row: any): RedemptionRequest {
  const rawStatus = row.status;
  const normalizedStatus: RedemptionStatus =
    rawStatus === 'solicitado' ? 'pendiente' : (rawStatus as RedemptionStatus);
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || row.profiles?.name || 'Cliente Registrado',
    userPhone: row.user_phone || row.profiles?.phone,
    pointsCost: Number(row.points_cost || 1000),
    productId: row.product_id,
    productName: row.product_name || row.products?.name || 'Líquido Seleccionado',
    portion: row.portion as PortionType,
    deliveryAddressNote: row.delivery_address_note,
    destinationLat: Number(row.destination_lat),
    destinationLng: Number(row.destination_lng),
    status: normalizedStatus,
    rejectionReason: row.rejection_reason,
    orderId: row.order_id || row.generated_order_id,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at,
  };
}

function mapDbRaffleToClient(row: any): Raffle {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    prizeText: row.prize_text || row.prize || '',
    drawType: row.draw_type as RaffleDrawType,
    status: row.status,
    totalParticipants: Number(row.total_participants || 0),
    totalTickets: Number(row.total_tickets || 0),
    winnerUserId: row.winner_user_id,
    winnerName: row.winner_name,
    winnerTicketNumber: row.winner_ticket_number ? Number(row.winner_ticket_number) : undefined,
    drawnAt: row.drawn_at,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at,
  };
}

function mapDbParticipantToClient(row: any): RaffleParticipant {
  return {
    id: row.id,
    raffleId: row.raffle_id,
    userId: row.user_id,
    userName: row.user_name,
    userPhone: row.user_phone,
    ticketCount: Number(row.ticket_count || 0),
    ticketStart: Number(row.ticket_start ?? row.ticket_range_start ?? 0),
    ticketEnd: Number(row.ticket_end ?? row.ticket_range_end ?? 0),
    userPointsBalance: Number(row.user_points_balance ?? row.points_snapshot ?? 0),
  };
}

// ---------------------------------------------------------------------------
// 1. User Points & Audit Transactions
// ---------------------------------------------------------------------------

export async function fetchUserPoints(userId: string): Promise<number> {
  if (isSupabaseConfigured() && isUuid(userId)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('points_balance')
        .eq('id', userId)
        .single();

      if (!error && data) {
        return Number(data.points_balance || 0);
      }
    } catch (err) {
      console.warn('Error fetching points from Supabase, checking local cache:', err);
    }
  }

  // Local fallback
  const users = getStoredUsers();
  const found = users.find((u) => u.id === userId);
  return Number(found?.pointsBalance || 0);
}

export async function fetchPointTransactions(userId?: string): Promise<PointTransaction[]> {
  const cached = getStoredPointTransactions();

  if (isSupabaseConfigured() && (!userId || isUuid(userId))) {
    try {
      let query = supabase
        .from('point_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const serverTxs = data.map(mapDbTransactionToClient);
        const mergedMap = new Map<string, PointTransaction>();
        for (const st of serverTxs) mergedMap.set(st.id, st);
        for (const ct of cached) {
          if (!mergedMap.has(ct.id)) mergedMap.set(ct.id, ct);
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        savePointTransactions(merged);
        return userId ? merged.filter((t) => t.userId === userId) : merged;
      }
    } catch (err) {
      console.warn('Error fetching transactions from Supabase:', err);
    }
  }

  if (userId) {
    return cached.filter((t) => t.userId === userId);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// 2. Redemption Requests
// ---------------------------------------------------------------------------

export async function fetchRedemptions(statusFilter?: RedemptionStatus): Promise<RedemptionRequest[]> {
  const cached = getStoredRedemptions();

  if (isSupabaseConfigured()) {
    try {
      let query = supabase
        .from('redemptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const serverRedemptions = data.map(mapDbRedemptionToClient);
        const mergedMap = new Map<string, RedemptionRequest>();
        for (const sr of serverRedemptions) mergedMap.set(sr.id, sr);
        for (const cr of cached) {
          if (!mergedMap.has(cr.id)) {
            mergedMap.set(cr.id, cr);
          } else if (cr.status !== 'pendiente' && mergedMap.get(cr.id)?.status === 'pendiente') {
            mergedMap.set(cr.id, cr);
          }
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveRedemptions(merged);
        return statusFilter ? merged.filter((r) => r.status === statusFilter) : merged;
      }
    } catch (err) {
      console.warn('Error fetching redemptions from Supabase:', err);
    }
  }

  if (statusFilter) {
    return cached.filter((r) => r.status === statusFilter);
  }
  return cached;
}

export async function requestRedemption(params: {
  userId: string;
  userName: string;
  userPhone: string;
  productId: string;
  productName: string;
  portion: PortionType;
  deliveryAddressNote?: string;
  destinationLat: number;
  destinationLng: number;
  pointsCost?: number;
}): Promise<{ success: boolean; redemptionId?: string; error?: string }> {
  const pointsCost = params.pointsCost || 1000;

  if (isSupabaseConfigured() && isUuid(params.userId)) {
    try {
      const { data, error } = await supabase.rpc('request_redemption_secure', {
        p_product_id: params.productId,
        p_portion: params.portion,
        p_delivery_address_note: params.deliveryAddressNote || null,
        p_destination_lat: params.destinationLat,
        p_destination_lng: params.destinationLng,
      });

      if (!error && data) {
        const redemptionId = typeof data === 'object' ? data.redemption_id : String(data);
        return { success: true, redemptionId };
      }
    } catch (err) {
      console.warn('Fallback local en requestRedemption:', err);
    }
  }

  // Local fallback
  const users = getStoredUsers();
  const user = users.find((u) => u.id === params.userId);
  const currentBalance = Number(user?.pointsBalance || 0);
  if (currentBalance < pointsCost) {
    return {
      success: false,
      error: `Puntos insuficientes: tienes ${currentBalance} y se requieren ${pointsCost}.`,
    };
  }

  const newRedemption: RedemptionRequest = {
    id: `redemp-${Date.now()}`,
    userId: params.userId,
    userName: params.userName,
    userPhone: params.userPhone,
    pointsCost,
    productId: params.productId,
    productName: params.productName,
    portion: params.portion,
    deliveryAddressNote: params.deliveryAddressNote,
    destinationLat: params.destinationLat,
    destinationLng: params.destinationLng,
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  };

  const stored = getStoredRedemptions();
  saveRedemptions([newRedemption, ...stored]);
  return { success: true, redemptionId: newRedemption.id };
}

export async function approveRedemption(
  redemptionId: string,
  adminId: string
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (isSupabaseConfigured() && isUuid(redemptionId)) {
    try {
      const { data, error } = await supabase.rpc('approve_redemption_admin', {
        p_redemption_id: redemptionId,
      });

      if (!error && data) {
        const orderId = typeof data === 'object' && data !== null ? data.order_id : String(data || '');
        return { success: true, orderId };
      }
    } catch (err) {
      console.warn('Fallback local en approveRedemption:', err);
    }
  }

  // Local fallback
  const redemptions = getStoredRedemptions();
  const redemp = redemptions.find((r) => r.id === redemptionId);
  if (!redemp) return { success: false, error: 'Solicitud de canje no encontrada.' };
  if (redemp.status !== 'pendiente' && (redemp.status as string) !== 'solicitado') {
    return { success: false, error: `La solicitud ya se encuentra ${redemp.status}.` };
  }

  const users = getStoredUsers();
  const user = users.find((u) => u.id === redemp.userId);
  if (!user) return { success: false, error: 'Usuario solicitante no encontrado.' };

  const currentBalance = Number(user.pointsBalance || 0);
  if (currentBalance < redemp.pointsCost) {
    return { success: false, error: 'Saldo de puntos insuficiente al momento de aprobar.' };
  }

  const orderId = `CANJE-${Math.floor(100 + Math.random() * 900)}`;
  user.pointsBalance = currentBalance - redemp.pointsCost;
  saveUsersCache(users);

  redemp.status = 'aprobado';
  redemp.orderId = orderId;
  redemp.updatedAt = new Date().toISOString();
  saveRedemptions(redemptions);

  // Generate an order for delivery drivers to deliver the free liquid refill
  const currentOrders = getStoredOrders();
  const destLat = redemp.destinationLat || 19.41688;
  const destLng = redemp.destinationLng || -71.61287;
  const dLat = ((destLat - 19.41688) * Math.PI) / 180;
  const dLng = ((destLng - -71.61287) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((19.41688 * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const distKm = Math.round(6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 100) / 100;
  const deliveryFee = Math.min(150, Math.max(25, Math.ceil(Math.max(0.1, distKm) / 1.5) * 25));

  const redemptionOrder: Order = {
    id: orderId,
    customerId: user.id,
    orderType: 'canje',
    redemptionId: redemp.id,
    pointsRedeemed: redemp.pointsCost,
    createdAt: new Date().toISOString(),
    customerName: redemp.userName || user.name || 'Cliente Canje',
    customerPhone: redemp.userPhone || user.phone || '809-210-4901',
    deliveryAddressNote: redemp.deliveryAddressNote,
    location: {
      lat: destLat,
      lng: destLng,
    },
    items: [
      {
        productId: redemp.productId || 'prod-horny-ice-mint',
        productName: redemp.productName,
        portion: redemp.portion,
        unitPrice: 0, // Free liquid refill
        costPrice: 20,
        quantity: 1,
      },
    ],
    subtotalLiquid: 0,
    liquidCostTotal: 20,
    deliveryFee,
    calculatedDeliveryFee: deliveryFee,
    proposedDeliveryFee: deliveryFee,
    calculatedDistanceKm: distKm || 0.5,
    totalAmount: deliveryFee, // Customer only pays delivery
    status: 'aprobado_en_preparacion',
    statusHistory: [
      {
        status: 'aprobado_en_preparacion',
        timestamp: new Date().toISOString(),
        note: `Canje aprobado por administrador. 1 recarga gratis de ${redemp.productName}. Tarifa delivery: $${deliveryFee} DOP.`,
      },
    ],
    paymentMethod: 'efectivo',
    specialNotes: `Canje de Fidelidad (${redemp.pointsCost} pts). Recarga gratuita de líquido.`,
  };
  saveOrders([redemptionOrder, ...currentOrders]);

  // Register local transaction
  const transactions = getStoredPointTransactions();
  const tx: PointTransaction = {
    id: `tx-${Date.now()}`,
    userId: user.id,
    points: -redemp.pointsCost,
    transactionType: 'canje_liquido',
    redemptionId: redemp.id,
    orderId,
    reason: `Canje aprobado: 1 recarga gratis de ${redemp.productName}`,
    adminId,
    balanceAfter: user.pointsBalance,
    createdAt: new Date().toISOString(),
  };
  savePointTransactions([tx, ...transactions]);

  return { success: true, orderId };
}

export async function rejectOrCancelRedemption(
  redemptionId: string,
  reason: string,
  adminId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'El motivo de rechazo o cancelación es obligatorio.' };
  }

  if (isSupabaseConfigured() && isUuid(redemptionId)) {
    try {
      const { error } = await supabase.rpc('reject_or_cancel_redemption', {
        p_redemption_id: redemptionId,
        p_reason: reason.trim(),
      });

      if (!error) {
        return { success: true };
      }
    } catch (err) {
      console.warn('Fallback local en rejectOrCancelRedemption:', err);
    }
  }

  // Local fallback
  const redemptions = getStoredRedemptions();
  const redemp = redemptions.find((r) => r.id === redemptionId);
  if (!redemp) return { success: false, error: 'Solicitud no encontrada.' };

  const wasApproved = redemp.status === 'aprobado';
  redemp.status = 'rechazado';
  redemp.rejectionReason = reason.trim();
  redemp.updatedAt = new Date().toISOString();
  saveRedemptions(redemptions);

  // If there was an active order generated for this redemption, cancel it
  if (redemp.orderId) {
    const orders = getStoredOrders();
    const targetOrder = orders.find((o) => o.id === redemp.orderId);
    if (targetOrder && targetOrder.status !== 'entregado' && targetOrder.status !== 'cancelado') {
      targetOrder.status = 'cancelado';
      targetOrder.statusHistory.push({
        status: 'cancelado',
        timestamp: new Date().toISOString(),
        note: `Canje cancelado/rechazado por admin: ${reason.trim()}`,
      });
      saveOrders(orders);
    }
  }

  // If it was already approved, refund the points
  if (wasApproved) {
    const users = getStoredUsers();
    const user = users.find((u) => u.id === redemp.userId);
    if (user) {
      user.pointsBalance = Number(user.pointsBalance || 0) + redemp.pointsCost;
      saveUsersCache(users);

      const txs = getStoredPointTransactions();
      const refundTx: PointTransaction = {
        id: `tx-${Date.now()}`,
        userId: user.id,
        points: redemp.pointsCost,
        transactionType: 'devolucion_canje',
        redemptionId: redemp.id,
        reason: `Reembolso por canje cancelado: ${reason.trim()}`,
        adminId,
        balanceAfter: user.pointsBalance,
        createdAt: new Date().toISOString(),
      };
      savePointTransactions([refundTx, ...txs]);
    }
  }

  return { success: true };
}

/**
 * Fetches registered customer profiles with their points balance
 */
export async function fetchRegisteredCustomers(): Promise<
  Array<{
    id: string;
    name: string;
    phone?: string;
    email?: string;
    pointsBalance: number;
    createdAt?: string;
  }>
> {
  const localBuyers = getStoredUsers()
    .filter((u) => u.role === 'comprador')
    .map((u) => ({
      id: u.id,
      name: u.name || 'Cliente',
      phone: u.phone,
      email: u.email,
      pointsBalance: Number(u.pointsBalance || 0),
      createdAt: u.createdAt,
    }));

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, phone, points_balance, created_at')
        .eq('role', 'comprador');

      if (!error && data && data.length > 0) {
        const mergedMap = new Map<string, (typeof localBuyers)[number]>();
        for (const d of data) {
          if (d.id === 'user-buyer-1' || (d.name === 'Alejandro Medina' && d.phone === '809-772-4011')) {
            continue;
          }
          mergedMap.set(d.id, {
            id: d.id,
            name: d.name || 'Cliente sin nombre',
            phone: d.phone,
            email: undefined,
            pointsBalance: Number(d.points_balance || 0),
            createdAt: d.created_at,
          });
        }
        for (const lb of localBuyers) {
          if (!mergedMap.has(lb.id)) {
            mergedMap.set(lb.id, lb);
          }
        }
        return Array.from(mergedMap.values()).sort(
          (a, b) => Number(b.pointsBalance || 0) - Number(a.pointsBalance || 0)
        );
      }
    } catch (err) {
      console.warn('Error fetching customers from Supabase:', err);
    }
  }

  return localBuyers.sort((a, b) => Number(b.pointsBalance || 0) - Number(a.pointsBalance || 0));
}

// ---------------------------------------------------------------------------
// 3. Admin Point Adjustments and Resets
// ---------------------------------------------------------------------------

export async function adjustUserPoints(
  userId: string,
  pointsDelta: number,
  reason: string,
  adminId: string
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (isSupabaseConfigured() && isUuid(userId)) {
    try {
      const { data, error } = await supabase.rpc('adjust_user_points_admin', {
        p_user_id: userId,
        p_delta_points: pointsDelta,
        p_reason: reason.trim(),
      });

      if (!error && data !== null) {
        const resolvedBalance =
          typeof data === 'object' && data !== null && 'new_balance' in data
            ? Number(data.new_balance)
            : Number(data);
        return { success: true, newBalance: isNaN(resolvedBalance) ? 0 : resolvedBalance };
      }
    } catch (err) {
      console.warn('Fallback local en adjustUserPoints:', err);
    }
  }

  // Local fallback
  const users = getStoredUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { success: false, error: 'Usuario no encontrado.' };

  const current = Number(user.pointsBalance || 0);
  const validation = validatePointAdjustment(current, pointsDelta, reason);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const newBalance = current + pointsDelta;
  user.pointsBalance = newBalance;
  saveUsersCache(users);

  const txs = getStoredPointTransactions();
  const tx: PointTransaction = {
    id: `tx-${Date.now()}`,
    userId,
    points: pointsDelta,
    transactionType: 'ajuste_manual_admin',
    reason: reason.trim(),
    adminId,
    balanceAfter: newBalance,
    createdAt: new Date().toISOString(),
  };
  savePointTransactions([tx, ...txs]);

  return { success: true, newBalance };
}

export async function resetUserPoints(
  userId: string,
  reason: string,
  adminId: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'El motivo del reseteo de puntos es obligatorio.' };
  }

  if (isSupabaseConfigured() && isUuid(userId)) {
    try {
      const { error } = await supabase.rpc('reset_user_points_admin', {
        p_user_id: userId,
        p_reason: reason.trim(),
      });

      if (!error) {
        return { success: true };
      }
    } catch (err) {
      console.warn('Fallback local en resetUserPoints:', err);
    }
  }

  // Local fallback
  const users = getStoredUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return { success: false, error: 'Usuario no encontrado.' };

  const current = Number(user.pointsBalance || 0);
  if (current === 0) return { success: true };

  user.pointsBalance = 0;
  saveUsersCache(users);

  const txs = getStoredPointTransactions();
  const tx: PointTransaction = {
    id: `tx-${Date.now()}`,
    userId,
    points: -current,
    transactionType: 'reset_puntos',
    reason: reason.trim(),
    adminId,
    balanceAfter: 0,
    createdAt: new Date().toISOString(),
  };
  savePointTransactions([tx, ...txs]);

  return { success: true };
}

// ---------------------------------------------------------------------------
// 4. Raffles and Draws
// ---------------------------------------------------------------------------

export async function fetchRaffles(): Promise<Raffle[]> {
  const localRaffles = getStoredRaffles();

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('raffles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const serverRaffles = data.map(mapDbRaffleToClient);
        const mergedMap = new Map<string, Raffle>();
        for (const sr of serverRaffles) mergedMap.set(sr.id, sr);
        for (const lr of localRaffles) {
          if (!mergedMap.has(lr.id)) mergedMap.set(lr.id, lr);
        }
        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveRaffles(merged);
        return merged;
      }
    } catch (err) {
      console.warn('Error fetching raffles from Supabase:', err);
    }
  }
  return localRaffles;
}

export async function fetchRaffleParticipants(raffleId: string): Promise<RaffleParticipant[]> {
  const localParticipants = getStoredRaffleParticipants(raffleId);

  if (isSupabaseConfigured() && isUuid(raffleId)) {
    try {
      const { data, error } = await supabase
        .from('raffle_participants')
        .select('*')
        .eq('raffle_id', raffleId)
        .order('ticket_range_start', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(mapDbParticipantToClient);
      }
    } catch (err) {
      console.warn('Error fetching raffle participants:', err);
    }
  }
  return localParticipants;
}

export async function createRaffle(raffle: {
  title: string;
  description?: string;
  prizeText: string;
  drawType: RaffleDrawType;
}): Promise<{ success: boolean; raffle?: Raffle; error?: string }> {
  if (!raffle.title || raffle.title.trim().length < 3) {
    return { success: false, error: 'El título de la rifa es obligatorio (mínimo 3 letras).' };
  }
  if (!raffle.prizeText || raffle.prizeText.trim().length < 2) {
    return { success: false, error: 'El premio a sortear es obligatorio.' };
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from('raffles')
        .insert({
          title: raffle.title.trim(),
          description: raffle.description?.trim() || null,
          prize: raffle.prizeText.trim(),
          draw_type: raffle.drawType,
          status: 'activa',
        })
        .select()
        .single();

      if (!error && data) {
        const mapped = mapDbRaffleToClient(data);
        const stored = getStoredRaffles();
        saveRaffles([mapped, ...stored]);
        await syncRaffleParticipants(mapped.id);
        return { success: true, raffle: mapped };
      }
    } catch (err) {
      console.warn('Fallback local en createRaffle:', err);
    }
  }

  // Local fallback
  const newRaffle: Raffle = {
    id: `raffle-${Date.now()}`,
    title: raffle.title.trim(),
    description: raffle.description?.trim(),
    prizeText: raffle.prizeText.trim(),
    drawType: raffle.drawType,
    status: 'activa',
    totalParticipants: 0,
    totalTickets: 0,
    createdAt: new Date().toISOString(),
  };

  const stored = getStoredRaffles();
  saveRaffles([newRaffle, ...stored]);
  await syncRaffleParticipants(newRaffle.id);
  return { success: true, raffle: newRaffle };
}

export async function syncRaffleParticipants(
  raffleId: string
): Promise<{ success: boolean; totalParticipants: number; totalTickets: number; error?: string }> {
  if (isSupabaseConfigured() && isUuid(raffleId)) {
    try {
      const { data, error } = await supabase.rpc('sync_raffle_participants_admin', {
        p_raffle_id: raffleId,
      });

      if (!error && data) {
        const totalParticipants = Number(data?.participants_count ?? data?.total_participants ?? 0);
        const totalTickets = Number(data?.total_tickets || 0);
        if (totalParticipants > 0) {
          return { success: true, totalParticipants, totalTickets };
        }
      }
    } catch (err) {
      console.warn('Fallback local en syncRaffleParticipants:', err);
    }
  }

  // Local fallback
  const raffles = getStoredRaffles();
  const raffle = raffles.find((r) => r.id === raffleId);
  if (!raffle) return { success: false, totalParticipants: 0, totalTickets: 0, error: 'Rifa no encontrada.' };

  const users = getStoredUsers().filter((u) => u.role === 'comprador');
  const userList = users.map((u) => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    pointsBalance: Number(u.pointsBalance || 0),
  }));

  const { participants, totalTickets } = calculateRaffleTickets(userList, raffle.drawType);
  for (const p of participants) {
    p.raffleId = raffleId;
  }

  raffle.totalParticipants = participants.length;
  raffle.totalTickets = totalTickets;
  saveRaffles(raffles);

  // Save participants for this raffle
  const allStored = getStoredRaffleParticipants().filter((p) => p.raffleId !== raffleId);
  saveRaffleParticipants([...allStored, ...participants]);

  return { success: true, totalParticipants: participants.length, totalTickets };
}

export async function executeRaffleDraw(
  raffleId: string
): Promise<{
  success: boolean;
  winnerUserId?: string;
  winnerName?: string;
  winningTicket?: number;
  totalTickets?: number;
  participants?: RaffleParticipant[];
  error?: string;
}> {
  if (isSupabaseConfigured() && isUuid(raffleId)) {
    try {
      const { data, error } = await supabase.rpc('execute_raffle_draw_admin', {
        p_raffle_id: raffleId,
      });

      if (!error && data) {
        const participants = await fetchRaffleParticipants(raffleId);
        return {
          success: true,
          winnerUserId: data.winner_user_id,
          winnerName: data.winner_name,
          winningTicket: Number(data.winning_ticket ?? data.winner_ticket_number ?? 1),
          totalTickets: Number(data.total_tickets || 1),
          participants,
        };
      }
    } catch (err) {
      console.warn('Fallback local en executeRaffleDraw:', err);
    }
  }

  // Local fallback
  const raffles = getStoredRaffles();
  const raffle = raffles.find((r) => r.id === raffleId);
  if (!raffle) return { success: false, error: 'Rifa no encontrada.' };
  if (raffle.status === 'finalizada') {
    return { success: false, error: 'Esta rifa ya fue sorteada.' };
  }

  let participants = getStoredRaffleParticipants(raffleId);
  if (participants.length === 0) {
    await syncRaffleParticipants(raffleId);
    participants = getStoredRaffleParticipants(raffleId);
  }

  if (participants.length === 0 || raffle.totalTickets <= 0) {
    return { success: false, error: 'No hay participantes con boletos para esta rifa.' };
  }

  // Random winning ticket 1..totalTickets
  const winningTicket = Math.floor(Math.random() * raffle.totalTickets) + 1;
  const winner = findWinnerByTicketNumber(participants, winningTicket);

  if (!winner) {
    return { success: false, error: 'Error al determinar ganador del boleto.' };
  }

  raffle.status = 'finalizada';
  raffle.winnerUserId = winner.userId;
  raffle.winnerName = winner.userName;
  raffle.winnerTicketNumber = winningTicket;
  raffle.drawnAt = new Date().toISOString();
  saveRaffles(raffles);

  return {
    success: true,
    winnerUserId: winner.userId,
    winnerName: winner.userName,
    winningTicket,
    totalTickets: raffle.totalTickets,
    participants,
  };
}

export function awardOrderPointsLocal(
  userId: string | undefined,
  orderId: string,
  subtotalLiquid: number,
  orderType: 'regular' | 'standard' | 'canje' = 'regular'
): number {
  if (!userId || orderType === 'canje') return 0;
  const res = awardPointsForOrderLocal(orderId, userId, subtotalLiquid);
  return res.points;
}

