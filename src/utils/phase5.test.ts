import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateFinancialStats, generateInventoryReport, generateReportCSV } from './finance';
import { clearTestOrdersOnServer } from './supabaseOrders';
import { Order, Product, UserAccount } from '../types';

describe('FASE 5 - Admin Dashboard, Financial Metrics & Security Purge Tests', () => {
  const dummyProduct: Product = {
    id: 'prod-horny-ice',
    name: 'Horny Flava Ice Mint',
    flavorCategory: 'Mentolados',
    nicotineMg: 35,
    imageUrl: '/test.webp',
    stockUnits: 25,
    costPrice: 20,
    priceFullTank: 100,
    priceHalfTank: 50,
    isActive: true,
  };

  it('handles empty order history (0 orders) cleanly without NaN or errors', () => {
    const statsAll = calculateFinancialStats([], 'todo');
    assert.strictEqual(statsAll.salesToday, 0);
    assert.strictEqual(statsAll.salesMonth, 0);
    assert.strictEqual(statsAll.salesAllTime, 0);
    assert.strictEqual(statsAll.profitLiquids, 0);
    assert.strictEqual(statsAll.profitDelivery, 0);
    assert.strictEqual(statsAll.totalNetProfit, 0);
    assert.strictEqual(statsAll.ordersCompletedCount, 0);
    assert.strictEqual(statsAll.ordersTodayCount, 0);
    assert.ok(!isNaN(statsAll.totalNetProfit));

    const statsToday = calculateFinancialStats([], 'hoy');
    assert.strictEqual(statsToday.salesToday, 0);
    assert.strictEqual(statsToday.totalNetProfit, 0);

    const statsWeek = calculateFinancialStats([], 'semana');
    assert.strictEqual(statsWeek.salesAllTime, 0);

    const statsMonth = calculateFinancialStats([], 'mes');
    assert.strictEqual(statsMonth.salesMonth, 0);
  });

  it('calculates 100% of delivery fee as business revenue alongside liquid net profits', () => {
    const sampleCompletedOrder: Order = {
      id: 'ORD-100',
      createdAt: new Date().toISOString(),
      customerName: 'Juan Perez',
      customerPhone: '8092104901',
      location: { lat: 19.41688, lng: -71.61287 },
      items: [
        {
          productId: 'prod-horny-ice',
          productName: 'Horny Flava Ice Mint',
          portion: 'tanque_lleno',
          unitPrice: 100,
          costPrice: 20,
          quantity: 2,
        },
      ],
      subtotalLiquid: 200, // 2 x 100
      liquidCostTotal: 40, // 2 x 20 -> liquid profit = 160
      deliveryFee: 50, // 100% counts as business revenue
      totalAmount: 250,
      status: 'entregado',
      statusHistory: [],
    };

    const stats = calculateFinancialStats([sampleCompletedOrder], 'todo');
    assert.strictEqual(stats.salesAllTime, 250);
    assert.strictEqual(stats.salesToday, 250);
    assert.strictEqual(stats.salesWeek, 250);
    assert.strictEqual(stats.salesMonth, 250);
    assert.strictEqual(stats.totalLiquidDispensed, 2); // 2 portions dispensed
    assert.strictEqual(stats.profitLiquids, 160);
    assert.strictEqual(stats.profitDelivery, 50); // 100% delivery fee
    assert.strictEqual(stats.totalNetProfit, 210); // 160 + 50
    assert.strictEqual(stats.ordersCompletedCount, 1);
    assert.strictEqual(stats.ordersTodayCount, 1);
    assert.strictEqual(stats.ordersWeekCount, 1);
    assert.strictEqual(stats.ordersMonthCount, 1);
  });

  it('guarantees accurate 2-decimal rounding with fractional inputs', () => {
    const fractionalOrder: Order = {
      id: 'ORD-FRAC',
      createdAt: new Date().toISOString(),
      customerName: 'Pedro',
      customerPhone: '8092104901',
      location: { lat: 19.41688, lng: -71.61287 },
      items: [
        {
          productId: 'prod-horny-ice',
          productName: 'Horny Flava Ice Mint',
          portion: 'tanque_lleno',
          unitPrice: 99.99,
          costPrice: 20.33,
          quantity: 3,
        },
      ],
      subtotalLiquid: 299.97,
      liquidCostTotal: 60.99,
      deliveryFee: 25,
      totalAmount: 324.97,
      status: 'entregado',
      statusHistory: [],
    };

    const stats = calculateFinancialStats([fractionalOrder], 'todo');
    assert.strictEqual(stats.salesAllTime, 324.97);
    assert.strictEqual(stats.profitLiquids, 238.98); // 299.97 - 60.99
    assert.strictEqual(stats.profitDelivery, 25);
    assert.strictEqual(stats.totalNetProfit, 263.98); // 238.98 + 25
    assert.strictEqual(stats.totalLiquidDispensed, 3);
  });

  it('generates CSV with weekly sales, liquid dispensed, and 100% delivery revenue policy note', () => {
    const sampleCompletedOrder: Order = {
      id: 'ORD-101',
      createdAt: new Date().toISOString(),
      customerName: 'Ana Gomez',
      customerPhone: '8092104901',
      location: { lat: 19.41688, lng: -71.61287 },
      items: [
        {
          productId: 'prod-horny-ice',
          productName: 'Horny Flava Ice Mint',
          portion: 'mitad',
          unitPrice: 50,
          costPrice: 20,
          quantity: 1,
        },
      ],
      subtotalLiquid: 50,
      liquidCostTotal: 20,
      deliveryFee: 25,
      totalAmount: 75,
      status: 'entregado',
      statusHistory: [],
    };

    const stats = calculateFinancialStats([sampleCompletedOrder], 'todo');
    const inventory = generateInventoryReport([dummyProduct], [sampleCompletedOrder]);
    const csv = generateReportCSV(stats, inventory, [sampleCompletedOrder]);

    assert.ok(csv.includes('BLACK VAPE'));
    assert.ok(csv.includes('Nota Contable: El 100% de la tarifa de delivery se computa como ganancia/recaudación del negocio.'));
    assert.ok(csv.includes('Ventas de la Semana,75 DOP'));
    assert.ok(csv.includes('Líquido Despachado Total,1 porciones'));
    assert.ok(csv.includes('Recaudación por Delivery (100% Negocio),25 DOP'));
    assert.ok(csv.includes('ORD-101'));
  });

  it('ignores undelivered or cancelled orders in completed revenue calculations', () => {
    const pendingOrder: Order = {
      id: 'ORD-PENDING',
      createdAt: new Date().toISOString(),
      customerName: 'Carlos',
      customerPhone: '8092104901',
      location: { lat: 19.41688, lng: -71.61287 },
      items: [],
      subtotalLiquid: 100,
      liquidCostTotal: 20,
      deliveryFee: 25,
      totalAmount: 125,
      status: 'pendiente_cotizacion',
      statusHistory: [],
    };

    const cancelledOrder: Order = {
      ...pendingOrder,
      id: 'ORD-CANCELLED',
      status: 'cancelado',
    };

    const inTransitOrder: Order = {
      ...pendingOrder,
      id: 'ORD-TRANSIT',
      status: 'en_camino',
    };

    const stats = calculateFinancialStats([pendingOrder, cancelledOrder, inTransitOrder], 'todo');
    assert.strictEqual(stats.salesAllTime, 0);
    assert.strictEqual(stats.totalNetProfit, 0);
    assert.strictEqual(stats.ordersCompletedCount, 0);
  });

  it('generateInventoryReport returns accurate metrics and tags healthy stock', () => {
    const report = generateInventoryReport([dummyProduct], []);
    assert.strictEqual(report.length, 1);
    assert.strictEqual(report[0].name, 'Horny Flava Ice Mint');
    assert.strictEqual(report[0].stockRemaining, 25);
    assert.strictEqual(report[0].unitsSold, 0);
    assert.strictEqual(report[0].totalRevenue, 0);
    assert.strictEqual(report[0].totalProfit, 0);
    assert.strictEqual(report[0].status, 'OPTIMO');
  });

  it('clearTestOrdersOnServer rejects non-admin users or unauthenticated callers', async () => {
    // 1. null user
    const nullRes = await clearTestOrdersOnServer(null);
    assert.strictEqual(nullRes.success, false);
    assert.ok(nullRes.error?.includes('administrador'));

    // 2. Buyer user
    const buyer: UserAccount = {
      id: 'buyer-1',
      name: 'Comprador',
      phone: '8092104901',
      role: 'comprador',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const buyerRes = await clearTestOrdersOnServer(buyer);
    assert.strictEqual(buyerRes.success, false);
    assert.ok(buyerRes.error?.includes('administrador'));

    // 3. Delivery driver user
    const driver: UserAccount = {
      id: 'driver-1',
      name: 'Motorizado',
      phone: '8092104901',
      role: 'delivery',
      username: 'marcos_delivery',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const driverRes = await clearTestOrdersOnServer(driver);
    assert.strictEqual(driverRes.success, false);
    assert.ok(driverRes.error?.includes('administrador'));
  });

  it('clearTestOrdersOnServer authorizes authenticated admin and clears orders', async () => {
    const admin: UserAccount = {
      id: 'admin-1',
      name: 'Administrador General',
      phone: '8092104901',
      role: 'admin',
      email: 'admin@vapeexpress.com',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const adminRes = await clearTestOrdersOnServer(admin);
    assert.strictEqual(adminRes.success, true);
    assert.ok(typeof adminRes.deletedCount === 'number');
  });
});
