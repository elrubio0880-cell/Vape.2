import { Order, Product, FinancialStats, InventoryReportItem } from '../types';

export type TimeFilter = 'hoy' | 'semana' | 'mes' | 'todo';

/**
 * Rounds a number strictly to 2 decimal places to avoid IEEE-754 floating point artifacts
 */
export function round2(num: number): number {
  if (!num || isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function getSantoDomingoDateParts(date: Date): { dateStr: string; yearMonth: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santo_Domingo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value || String(date.getFullYear());
    const m = parts.find((p) => p.type === 'month')?.value || String(date.getMonth() + 1).padStart(2, '0');
    const d = parts.find((p) => p.type === 'day')?.value || String(date.getDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, yearMonth: `${y}-${m}` };
  } catch {
    const iso = date.toISOString();
    return { dateStr: iso.slice(0, 10), yearMonth: iso.slice(0, 7) };
  }
}

/**
 * Calculates financial statistics from the order history with optional date filter
 */
export function calculateFinancialStats(orders: Order[], filter: TimeFilter = 'todo'): FinancialStats {
  const completedOrders = (orders || []).filter((o) => o.status === 'entregado');
  const now = new Date();
  const { dateStr: todayStr, yearMonth: currentYearMonth } = getSantoDomingoDateParts(now);

  // One week ago timestamp (7 days)
  const oneWeekAgoMs = now.getTime() - 7 * 24 * 3600 * 1000;

  let salesToday = 0;
  let salesWeek = 0;
  let salesMonth = 0;
  let salesAllTime = 0;
  let profitLiquids = 0;
  let profitDelivery = 0;
  let ordersTodayCount = 0;
  let ordersWeekCount = 0;
  let ordersMonthCount = 0;
  let filteredOrdersCount = 0;
  let totalLiquidDispensed = 0;

  for (const order of completedOrders) {
    const orderDate = new Date(order.createdAt);
    const validDate = !isNaN(orderDate.getTime());
    const { dateStr: orderDateStr, yearMonth: orderYearMonth } = validDate
      ? getSantoDomingoDateParts(orderDate)
      : { dateStr: order.createdAt ? order.createdAt.slice(0, 10) : '', yearMonth: '' };
    const orderTimeMs = validDate ? orderDate.getTime() : 0;

    const isToday = orderDateStr === todayStr;
    const isThisMonth = validDate && orderYearMonth === currentYearMonth;
    const isThisWeek = orderTimeMs >= oneWeekAgoMs;

    // Check if matches selected time filter
    let matchesFilter = true;
    if (filter === 'hoy') matchesFilter = isToday;
    else if (filter === 'semana') matchesFilter = isThisWeek;
    else if (filter === 'mes') matchesFilter = isThisMonth;

    const liquidNetProfit = (order.subtotalLiquid || 0) - (order.liquidCostTotal || 0);
    const orderTotal = order.totalAmount || ((order.subtotalLiquid || 0) + (order.deliveryFee || 0));

    // Total portions of liquid dispensed in this order
    const orderPortions = (order.items || []).reduce(
      (sum, item) => sum + (Number(item.quantity) || 0),
      0
    );

    if (matchesFilter) {
      filteredOrdersCount += 1;
      salesAllTime += orderTotal;
      profitLiquids += liquidNetProfit;
      profitDelivery += order.deliveryFee || 0;
      totalLiquidDispensed += orderPortions;
    }

    if (isThisMonth) {
      salesMonth += orderTotal;
      ordersMonthCount += 1;
    }

    if (isThisWeek) {
      salesWeek += orderTotal;
      ordersWeekCount += 1;
    }

    if (isToday) {
      salesToday += orderTotal;
      ordersTodayCount += 1;
    }
  }

  const roundedSalesToday = round2(salesToday);
  const roundedSalesWeek = round2(salesWeek);
  const roundedSalesMonth = round2(salesMonth);
  const roundedSalesAllTime = round2(salesAllTime);
  const roundedProfitLiquids = round2(profitLiquids);
  const roundedProfitDelivery = round2(profitDelivery);
  const roundedTotalNetProfit = round2(roundedProfitLiquids + roundedProfitDelivery);

  return {
    salesToday: roundedSalesToday,
    salesWeek: roundedSalesWeek,
    salesMonth: roundedSalesMonth,
    salesAllTime: roundedSalesAllTime,
    totalLiquidDispensed: Math.round(totalLiquidDispensed),
    profitLiquids: roundedProfitLiquids,
    profitDelivery: roundedProfitDelivery,
    totalNetProfit: roundedTotalNetProfit,
    ordersCompletedCount: filter === 'todo' ? completedOrders.length : filteredOrdersCount,
    ordersTodayCount,
    ordersWeekCount,
    ordersMonthCount,
  };
}

/**
 * Generates an automated inventory and performance report to optimize stock
 */
export function generateInventoryReport(
  products: Product[],
  orders: Order[]
): InventoryReportItem[] {
  const completedOrders = orders.filter((o) => o.status === 'entregado');
  const salesByProduct: Record<
    string,
    { unitsSold: number; totalRevenue: number; totalProfit: number }
  > = {};

  for (const product of products) {
    salesByProduct[product.id] = { unitsSold: 0, totalRevenue: 0, totalProfit: 0 };
  }

  for (const order of completedOrders) {
    for (const item of order.items) {
      if (!salesByProduct[item.productId]) {
        salesByProduct[item.productId] = {
          unitsSold: 0,
          totalRevenue: 0,
          totalProfit: 0,
        };
      }
      const itemRev = item.unitPrice * item.quantity;
      const itemCost = item.costPrice * item.quantity;
      salesByProduct[item.productId].unitsSold += item.quantity;
      salesByProduct[item.productId].totalRevenue += itemRev;
      salesByProduct[item.productId].totalProfit += itemRev - itemCost;
    }
  }

  return products.map((product) => {
    const stats = salesByProduct[product.id] || {
      unitsSold: 0,
      totalRevenue: 0,
      totalProfit: 0,
    };
    let status: 'OPTIMO' | 'BAJO' | 'CRITICO' = 'OPTIMO';
    if (product.stockUnits <= 3) {
      status = 'CRITICO';
    } else if (product.stockUnits <= 8) {
      status = 'BAJO';
    }

    return {
      productId: product.id,
      name: product.name,
      stockRemaining: product.stockUnits,
      unitsSold: stats.unitsSold,
      totalRevenue: stats.totalRevenue,
      totalProfit: stats.totalProfit,
      status,
    };
  });
}

/**
 * Generates downloadable CSV content for reports
 */
export function generateReportCSV(
  stats: FinancialStats,
  inventory: InventoryReportItem[],
  orders: Order[]
): string {
  const lines: string[] = [];

  lines.push('REPORTE FINANCIERO Y DE VENTAS - VAPEEXPRESS (BLACK VAPE)');
  lines.push(`Fecha de Emisión: ${new Date().toLocaleString('es-DO')}`);
  lines.push('Nota Contable: El 100% de la tarifa de delivery se computa como ganancia/recaudación del negocio.');
  lines.push('');
  lines.push('RESUMEN FINANCIERO');
  lines.push(`Ventas de Hoy,${stats.salesToday} DOP`);
  lines.push(`Ventas de la Semana,${stats.salesWeek} DOP`);
  lines.push(`Ventas del Mes,${stats.salesMonth} DOP`);
  lines.push(`Total Ingresos Brutos (Período Seleccionado),${stats.salesAllTime} DOP`);
  lines.push(`Líquido Despachado Total,${stats.totalLiquidDispensed} porciones`);
  lines.push(`Ganancia Neta por Líquido,${stats.profitLiquids} DOP`);
  lines.push(`Recaudación por Delivery (100% Negocio),${stats.profitDelivery} DOP`);
  lines.push(`Ganancia Neta Total,${stats.totalNetProfit} DOP`);
  lines.push(`Pedidos Entregados (Período),${stats.ordersCompletedCount}`);
  lines.push('');
  lines.push('INVENTARIO Y ROTACION DE SABORES');
  lines.push('ID,Producto,Stock Restante,Unidades Vendidas,Ingresos Brutos,Ganancia Neta,Estado');

  for (const item of inventory) {
    lines.push(
      `"${item.productId}","${item.name}",${item.stockRemaining},${item.unitsSold},${item.totalRevenue},${item.totalProfit},"${item.status}"`
    );
  }

  lines.push('');
  lines.push('HISTORIAL DETALLADO DE PEDIDOS');
  lines.push('ID Pedido,Fecha,Cliente,Telefono,Subtotal Liquidos,Tarifa Delivery,Total,Estado');

  for (const o of orders) {
    lines.push(
      `"${o.id}","${o.createdAt}","${o.customerName}","${o.customerPhone}",${o.subtotalLiquid},${o.deliveryFee},${o.totalAmount},"${o.status}"`
    );
  }

  return lines.join('\n');
}
