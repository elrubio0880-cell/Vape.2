export type PortionType = 'tanque_lleno' | 'mitad';

export interface Product {
  id: string;
  name: string;
  flavorCategory: string; // e.g., 'Frutales', 'Mentolados', 'Postres', 'Tabacos', 'Bebidas'
  nicotineMg: number; // e.g. 0, 3, 6, 20, 35, 50
  imageUrl: string;
  stockUnits: number; // total portions or ml available
  costPrice: number; // Cost of liquid to the seller per portion (e.g. $20)
  priceFullTank: number; // Standard $100
  priceHalfTank: number; // Standard $50
  description?: string;
  isActive: boolean;
}

export type OrderStatus =
  | 'pendiente_cotizacion' // Waiting for driver to set fare ($25, $50, $75, $100)
  | 'tarifa_propuesta' // Driver proposed fare; client must approve or reject
  | 'aprobado_en_preparacion' // Client accepted fare, store/driver preparing
  | 'en_camino' // Driver is on route with live GPS
  | 'llegada_a_destino' // Driver arrived at client location (can call direct)
  | 'entregado' // Completed
  | 'cancelado'; // Canceled or rejected

export interface OrderItem {
  productId: string;
  productName: string;
  portion: PortionType;
  unitPrice: number; // 100 for full, 50 for half
  costPrice: number; // Cost of liquid to seller
  quantity: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta';

export interface Order {
  id: string;
  createdAt: string; // ISO string
  customerName: string;
  customerPhone: string;
  deliveryAddressNote?: string;
  location: Coordinates; // Client drop-off location
  items: OrderItem[];
  subtotalLiquid: number; // Sum of liquid prices
  liquidCostTotal: number; // Sum of liquid costs
  deliveryFee: number; // 25, 50, 75, or 100
  calculatedDeliveryFee?: number; // Tarifa oficial calculada por el sistema en servidor
  proposedDeliveryFee?: number; // Tarifa propuesta por el repartidor (estilo inDrive)
  calculatedDistanceKm?: number; // Distancia calculada en km
  totalAmount: number; // subtotalLiquid + deliveryFee
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    timestamp: string;
    note?: string;
  }[];
  driverId?: string; // ID del repartidor asignado con bloqueo atómico
  driverName?: string;
  driverPhone?: string;
  driverLocation?: Coordinates;
  estimatedMinutes?: number;
  paymentMethod?: PaymentMethod;
  cashGiven?: number;
  changeDue?: number;
  specialNotes?: string;
  orderType?: 'regular' | 'canje' | 'standard';
  pointsRedeemed?: number;
  redemptionId?: string;
  customerId?: string;
  isRemoteLocation?: boolean; // Flagged when distance > 15km or ISP detected outside Loma de Cabrera
  detectedRegion?: string; // e.g. Santo Domingo, Santiago
  locationAccuracyMeters?: number; // GPS precision in meters
}

export interface StoreConfig {
  name: string;
  addressText: string;
  location: Coordinates;
  phone: string;
  whatsapp?: string;
  bankAccountInfo?: string;
  isOpen: boolean;
  pointsPerRedemption?: number;
  redemptionsEnabled?: boolean;
}

export type UserRole = 'comprador' | 'delivery' | 'admin';

export interface UserAccount {
  id: string;
  role: UserRole;
  name: string;
  phone?: string;
  email?: string;
  username?: string;
  password?: string;
  createdAt: string;
  isActive: boolean;
  pointsBalance?: number;
}

export type AppSection = 'tienda' | 'mapa' | 'pedidos' | 'admin';

export type PointTransactionType =
  | 'pedido_entregado'
  | 'acumulacion_pedido'
  | 'ganado_pedido'
  | 'canje_liquido'
  | 'canje_solicitado'
  | 'canje_aprobado'
  | 'devolucion_canje'
  | 'ajuste_manual_admin'
  | 'ajuste_manual'
  | 'reversion_pedido'
  | 'reset_puntos'
  | 'ajuste_reset';

export interface PointTransaction {
  id: string;
  userId: string;
  points: number;
  transactionType: PointTransactionType;
  orderId?: string;
  redemptionId?: string;
  reason?: string;
  adminId?: string;
  balanceAfter: number;
  createdAt: string;
}

export type RedemptionStatus =
  | 'solicitado'
  | 'pendiente'
  | 'aprobado'
  | 'rechazado'
  | 'cancelado'
  | 'en_camino'
  | 'entregado';

export interface RedemptionRequest {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  pointsCost: number;
  productId?: string;
  productName: string;
  portion: PortionType;
  deliveryAddressNote?: string;
  destinationLat: number;
  destinationLng: number;
  status: RedemptionStatus;
  rejectionReason?: string;
  orderId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type RaffleDrawType = 'igualitaria' | 'ponderada';
export type RaffleStatus = 'borrador' | 'activa' | 'finalizada' | 'cancelada';

export interface Raffle {
  id: string;
  title: string;
  description?: string;
  prizeText: string;
  drawType: RaffleDrawType;
  status: RaffleStatus;
  totalParticipants: number;
  totalTickets: number;
  winnerUserId?: string;
  winnerName?: string;
  winnerTicketNumber?: number;
  drawnAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RaffleParticipant {
  id: string;
  raffleId: string;
  userId: string;
  userName: string;
  userPhone?: string;
  ticketCount: number;
  ticketStart: number;
  ticketEnd: number;
  userPointsBalance: number;
}

export interface FinancialStats {
  salesToday: number;
  salesWeek: number;
  salesMonth: number;
  salesAllTime: number;
  totalLiquidDispensed: number; // Porciones totales de líquido entregadas
  profitLiquids: number; // (Liquid sales - Liquid cost)
  profitDelivery: number; // Total delivery fees collected (100% negocio)
  totalNetProfit: number; // profitLiquids + profitDelivery
  ordersCompletedCount: number;
  ordersTodayCount: number;
  ordersWeekCount: number;
  ordersMonthCount: number;
}

export interface InventoryReportItem {
  productId: string;
  name: string;
  stockRemaining: number;
  unitsSold: number;
  totalRevenue: number;
  totalProfit: number;
  status: 'OPTIMO' | 'BAJO' | 'CRITICO';
}

